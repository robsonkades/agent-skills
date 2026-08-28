# Worked example: a filter language for a search API

Clients filter a document search with expressions like:

```text
status eq ACTIVE and (owner eq "ana" or tags contains "urgent") and createdAt gt 2026-01-01
```

The requirements that ruled out configuration: arbitrary nesting, disjunction, and the need to
push the filter into the database rather than evaluate it over loaded rows.

## The AST

```java
public sealed interface Filter permits And, Or, Not, Comparison {

    record And(Filter left, Filter right) implements Filter { }
    record Or(Filter left, Filter right) implements Filter { }
    record Not(Filter inner) implements Filter { }

    record Comparison(Field field, Operator operator, Value value) implements Filter { }
}

public enum Operator { EQ, NEQ, GT, GTE, LT, LTE, CONTAINS }
```

`Field` is an **enum**, not a `String`. That single decision removes a class of problems: a client
cannot name a column that is not exposed, cannot reach a field it is not authorised to filter on,
and cannot cause an unindexed scan on a field nobody planned for. Parsing an unknown field name
fails at the boundary with a list of what is allowed.

## Parse, with the limits at the boundary

```java
public final class FilterParser {

    private static final int MAX_DEPTH = 16;
    private static final int MAX_NODES = 100;

    public Filter parse(String text) {
        if (text.length() > 2_000) throw new FilterTooLong(2_000);
        var parsed = new Parser(text).expression(0, new AtomicInteger());
        return parsed;
    }
    // depth and node counters are checked inside; both throw a domain error, never overflow
}
```

Bounds are checked while parsing rather than after, so a deeply nested expression is rejected
before it has built a structure deep enough to overflow the stack on the way back out.

Parsing is recursive descent with precedence climbing, roughly forty lines. It was written by hand
because the grammar fits on a page and has three precedence levels; a fourth operator class or
error recovery would have justified a generator.

## Fold 1 — evaluate

```java
static boolean matches(Filter filter, Document doc) {
    return switch (filter) {
        case And a -> matches(a.left(), doc) && matches(a.right(), doc);
        case Or o -> matches(o.left(), doc) || matches(o.right(), doc);
        case Not n -> !matches(n.inner(), doc);
        case Comparison c -> compare(doc.valueOf(c.field()), c.operator(), c.value());
    };
}
```

The whole evaluator in one place, exhaustive, with no `default`. Adding a `Between` node breaks
this method at compile time — which is the point, because it also breaks the two folds below, and
those are exactly the places that must be updated.

## Fold 2 — compile to SQL

This is why the AST exists. Evaluating in memory would mean loading every document.

```java
static SqlFragment toSql(Filter filter) {
    return switch (filter) {
        case And a -> SqlFragment.join("(", toSql(a.left()), " AND ", toSql(a.right()), ")");
        case Or o -> SqlFragment.join("(", toSql(o.left()), " OR ", toSql(o.right()), ")");
        case Not n -> SqlFragment.join("NOT (", toSql(n.inner()), ")");
        case Comparison c -> new SqlFragment(
                c.field().column() + " " + sqlOperator(c.operator()) + " ?",
                List.of(c.value().asJdbcParameter()));
    };
}
```

Two properties that are not optional:

- **Values are always parameters**, never concatenated. The enum `Field` supplies the column name,
  and the enum `Operator` supplies the SQL operator, so no user-supplied text ever reaches the
  statement text. This is what makes a user-authored filter language safe against injection: the
  only free-form data is bound.
- **No `default` branch.** A new node type that nobody translated to SQL would otherwise silently
  become "no filter", which widens the result set — the same class of failure as ignoring an
  unknown node received from a newer producer.

## Fold 3 — validate before either

```java
static List<Issue> validate(Filter filter, Set<Field> permitted) {
    return switch (filter) {
        case And a -> concat(validate(a.left(), permitted), validate(a.right(), permitted));
        case Or o -> concat(validate(o.left(), permitted), validate(o.right(), permitted));
        case Not n -> validate(n.inner(), permitted);
        case Comparison c -> {
            var issues = new ArrayList<Issue>();
            if (!permitted.contains(c.field())) issues.add(Issue.forbiddenField(c.field()));
            if (!c.field().supports(c.operator())) issues.add(Issue.badOperator(c.field(), c.operator()));
            if (!c.field().type().accepts(c.value())) issues.add(Issue.typeMismatch(c.field(), c.value()));
            yield issues;
        }
    };
}
```

`permitted` is per-caller, so field-level authorisation is enforced on the filter itself — a
client without access to `internalNotes` cannot use it as an oracle by filtering on it and
observing which documents come back. That attack is invisible if authorisation is applied only to
the returned fields.

Validation collects every issue rather than throwing on the first, because the caller is fixing a
query and wants the whole list (`java-exception-design`).

## The hot path: closure compilation

Filters are also applied in memory to a live event stream, millions of times per parsed
expression. The tree walk was the top frame in the profile.

```java
static Predicate<Document> compile(Filter filter) {
    return switch (filter) {
        case And a -> { var l = compile(a.left()); var r = compile(a.right());
                        yield d -> l.test(d) && r.test(d); }
        case Or o -> { var l = compile(o.left()); var r = compile(o.right());
                       yield d -> l.test(d) || r.test(d); }
        case Not n -> { var i = compile(n.inner()); yield d -> !i.test(d); }
        case Comparison c -> { var field = c.field(); var op = c.operator(); var v = c.value();
                               yield d -> compare(d.valueOf(field), op, v); }
    };
}
```

Measured with JMH on the production expression mix: the compiled form ran roughly 6× the
throughput of the tree walk, with allocation per evaluation dropping to zero. The number is
reported because it was measured on that workload — a different expression mix would give a
different figure, and quoting it as a general property of the technique would be wrong
(`jmh-microbenchmarks`).

Compiled predicates are cached by expression text in a bounded cache; the parse dominated
end-to-end cost until that was added.

## The limits, tested

```java
@Test
void a_deeply_nested_expression_is_rejected_rather_than_overflowing() {
    var nested = "(".repeat(200) + "status eq ACTIVE" + ")".repeat(200);
    assertThatThrownBy(() -> parser.parse(nested)).isInstanceOf(FilterTooDeep.class);
}

@Property
void the_compiled_predicate_agrees_with_the_interpreter(@ForAll("filters") Filter f,
                                                        @ForAll("documents") Document d) {
    assertThat(compile(f).test(d)).isEqualTo(matches(f, d));
}

@Property
void and_is_commutative(@ForAll("filters") Filter a, @ForAll("filters") Filter b,
                        @ForAll("documents") Document d) {
    assertThat(matches(new And(a, b), d)).isEqualTo(matches(new And(b, a), d));
}
```

The agreement property is what makes the optimisation safe to keep: two evaluators exist, and the
test asserts they cannot diverge. Without it, a bug fixed in one fold and not the other is
invisible until a customer's filter returns the wrong documents.

## What was rejected

- **SpEL.** It would have taken an afternoon and it evaluates arbitrary expressions against the
  application context — an expression from an HTTP parameter reaching `T(java.lang.Runtime)` is
  remote code execution. Not a hardening problem; a category error.
- **CEL.** Genuinely close. It was rejected only because the SQL fold is the main requirement and
  translating CEL's AST to SQL is more work than owning a five-node grammar. Had the filter been
  evaluated in memory only, CEL would have been the better choice.
- **A `String` field name with a whitelist check.** Equivalent in security terms if the check is
  never missed. The enum makes missing it impossible, which is the difference between a rule and a
  guarantee.
