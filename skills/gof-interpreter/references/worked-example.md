# Worked example: a filter language for a search API

Clients filter a document search with expressions like:

```text
status eq ACTIVE and (owner eq "ana" or tags contains "urgent") and createdAt gt 2026-01-01
```

For this example, clients require the text syntax above plus nesting, disjunction and database
translation. Nested structured configuration or an existing query API could express related
requirements; syntax and consumer needs must justify the custom language.

Java 21 partial examples (no preview), requiring Objects, List, Set, ArrayList, ArrayDeque,
AtomicInteger and Predicate imports; import Filter's nested node types for the folds. Field, Value, Document, Issue,
SqlFragment and parser/error helpers are project-specific
and omitted. Values and document snapshots must obey the explicit immutable type contract below;
this is not a complete parser or production SQL translator.

## The AST

```java
public sealed interface Filter permits Filter.And, Filter.Or, Filter.Not, Filter.Comparison {

    record And(Filter left, Filter right) implements Filter {
        public And { Objects.requireNonNull(left); Objects.requireNonNull(right); }
    }
    record Or(Filter left, Filter right) implements Filter {
        public Or { Objects.requireNonNull(left); Objects.requireNonNull(right); }
    }
    record Not(Filter inner) implements Filter {
        public Not { Objects.requireNonNull(inner); }
    }

    record Comparison(Field field, Operator operator, Value value) implements Filter {
        public Comparison {
            Objects.requireNonNull(field); Objects.requireNonNull(operator); Objects.requireNonNull(value);
        }
    }
}

public enum Operator { EQ, NEQ, GT, GTE, LT, LTE, CONTAINS }
```

Field is an enum mapped to trusted schema identifiers, not a raw SQL identifier from input.
It bounds vocabulary, not caller authorization or query cost: a permitted field can still cause
an expensive scan. Reject unknown fields without leaking names the caller may not discover;
validate permissions, operator/types and query budgets separately.

`Value` must own immutable scalar data or a bounded, deeply immutable collection. Copy mutable
containers at the boundary and ensure their elements are immutable too; an unmodifiable view
or a record component does not freeze caller-owned contents. A compiled predicate retains its
literal values, so later mutation must not change a previously validated rule. `Document` supplies
a stable per-evaluation snapshot with bounded, side-effect-free accessors. Bound text/collection
sizes and numeric precision on both literal and document operands before costly copying or
comparison; a small AST does not bound the work of one comparison. These are prerequisites for
the omitted domain types, not guarantees implemented by the shown record constructors.

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
    // Omitted Parser must check depth BEFORE recursion and count every node/token allocation.
}
```

Bounds are checked while parsing rather than after, so a deeply nested expression is rejected
before it has built a structure deep enough to overflow the stack on the way back out.

The parser is intentionally omitted. Require full-input consumption, null/encoding/token limits,
bounded literal sizes and position-aware errors, including long flat chains that become deep ASTs.
Choose recursive descent, combinators or a generator from grammar/maintenance needs; no parser
implementation or tested depth guarantee is supplied here.

Before any recursive fold, enforce depth/node limits for ALL AST entry paths with a bounded
iterative walk, then type-check and authorize against the current caller. Reject any issues before
matches(), compile() or toSql(); do not merely return an unused issue list. Row/tenant scope is a
separate mandatory server predicate ANDed with the fully parenthesized user filter.

This structural guard also covers directly constructed ASTs; call it before recursive validation.
It counts occurrences rather than unique nodes, matching repeated work on a shared subtree.

```java
static void checkStructure(Filter root) {
    record Pending(Filter node, int depth) {}
    var pending = new ArrayDeque<Pending>();
    pending.push(new Pending(Objects.requireNonNull(root), 1));
    int nodes = 0;
    while (!pending.isEmpty()) {
        var next = pending.pop();
        if (next.depth() > 16 || ++nodes > 100) {
            throw new IllegalArgumentException("filter exceeds depth/node budget");
        }
        int depth = next.depth() + 1;
        switch (next.node()) {
            case Filter.And a -> {
                pending.push(new Pending(a.right(), depth));
                pending.push(new Pending(a.left(), depth));
            }
            case Filter.Or o -> {
                pending.push(new Pending(o.right(), depth));
                pending.push(new Pending(o.left(), depth));
            }
            case Filter.Not n -> pending.push(new Pending(n.inner(), depth));
            case Filter.Comparison c -> { }
        }
    }
}
```

Define comparison semantics before implementing compare(): missing/null values, numeric precision,
text collation, time zones and CONTAINS meaning. For example, a total two-valued filter may make
comparisons against a missing document value false, so NOT of such a comparison is true. SQL
three-valued logic does not automatically preserve that rule; choose and test a consistent model.

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

The evaluator is exhaustive with no `default`. Adding a `Between` node exposes missing cases when
these folds are recompiled. Independently released old binaries and folds with covering fallbacks
still need compatibility checks; the compiler does not verify their new-node semantics.

## Fold 2 — compile to SQL

This is why the AST exists. Evaluating in memory would mean loading every document.

```java
static SqlFragment toSql(Filter filter) {
    return switch (filter) {
        case And a -> SqlFragment.join("(", toSql(a.left()), " AND ", toSql(a.right()), ")");
        case Or o -> SqlFragment.join("(", toSql(o.left()), " OR ", toSql(o.right()), ")");
        case Not n -> SqlFragment.join("NOT (", toSql(n.inner()), ")");
        case Comparison c -> sqlComparison(c); // dialect/type/null-aware translator, not supplied
    };
}
```

SqlFragment.join must preserve parentheses and left-to-right parameter order. sqlComparison must
handle each validated field/operator/type combination: CONTAINS may mean array membership or
escaped text matching, not a universal SQL operator. Reject unsupported combinations. For a
two-valued missing-value policy, ordinary SQL comparisons may require explicit normalization
(for example COALESCE(predicate, FALSE) in PostgreSQL); NULL equality requires its own IS NULL
handling. List.of rejects Java null and cannot represent arbitrary nullable bind parameters.
Test interpreter/SQL results on the target database with nulls, NOT, collation and timestamps.

Parentheses and parameter order preserve grouping and binding, not evaluation order. PostgreSQL
may reorder boolean subexpressions, so a preceding predicate cannot be assumed to guard a later
division, cast or host function as Java `&&` would. Translate total, pure operations or use a
dialect-specific construction whose error behavior is verified; reject unsupported semantics.
`CASE` has planning/aggregate limitations too. Test error behavior on the target database rather
than inferring it from matching successful booleans; see
[PostgreSQL 18 expression evaluation](https://www.postgresql.org/docs/18/sql-expressions.html#SYNTAX-EXPRESS-EVAL).

Two additional properties:

- **Values are always parameters**, never concatenated. The enum `Field` supplies the column name,
  and the enum `Operator` supplies the SQL operator, so no user-supplied text ever reaches the
  statement text. This is what makes a user-authored filter language safe against injection: the
  only free-form data is bound.
- **No silent fallback to "no filter".** That would widen the result set. These closed folds omit
  `default` to expose missing cases on recompilation; explicit rejection remains appropriate at
  an open or versioned boundary. A default that rejects is different from one that drops a rule.

## Fold 3 — validate before either

```java
static List<Issue> validate(Filter filter, Set<Field> permitted) {
    return switch (filter) {
        case And a -> concat(validate(a.left(), permitted), validate(a.right(), permitted));
        case Or o -> concat(validate(o.left(), permitted), validate(o.right(), permitted));
        case Not n -> validate(n.inner(), permitted);
        case Comparison c -> {
            if (!permitted.contains(c.field())) {
                yield List.of(Issue.forbiddenField(c.field()));
            }
            var issues = new ArrayList<Issue>();
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

Validation visits the whole bounded AST, including branches that evaluation might short-circuit.
Collect useful issues from permitted comparisons, but stop field-specific checks on an inaccessible
comparison: reporting its accepted operators or value type can disclose restricted metadata.
Where schema discovery is restricted, map unknown and inaccessible fields to an equivalent public
error contract without hidden field suggestions or type details. Internal issue objects are not
automatically safe response payloads. Continue collecting independent, permitted issues rather
than rejecting the entire tree at the first error (`java-exception-design`).

## The hot path: closure compilation

Suppose the same parsed filters are also evaluated repeatedly in an event stream. If actual
profiling identifies tree dispatch as material, consider this specialization:

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

No benchmark fixture or measurement evidence accompanies this sketch. Compare tree walking and
closures on the actual expression mix; either may allocate through compare()/valueOf(). Measure
compile cost, warm-up, evaluation and retained cache weight separately (`jmh-microbenchmarks`).
Compiled forms must not capture caller data or cache permission decisions under expression text alone.

## Suggested validation cases (not executed parser/property tests)

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
void and_is_commutative_for_total_pure_predicates(@ForAll("totalPureFilters") Filter a,
                        @ForAll("totalPureFilters") Filter b,
                        @ForAll("documents") Document d) {
    assertThat(matches(new And(a, b), d)).isEqualTo(matches(new And(b, a), d));
}
```

These snippets need the project's test framework and bounded generators. Agreement on generated
cases provides evidence, not proof for all expressions; compare exceptions and short-circuit
behavior as well as successful booleans. Commutativity applies only to total pure predicates,
not error-producing, stateful or budget-sensitive evaluation. Add hostile field identifiers,
trailing tokens, oversized literals, malformed/deep ASTs and cross-caller cache reuse tests.
For a forbidden field, use operator/type checkers that fail if invoked; validation must reject
the field without calling them, while still reporting allowed-field errors in other branches.
Also test public diagnostics for guessed hidden fields and mutation of caller-owned literal
containers after AST construction; parser and response serialization require their own fixtures.

## What was rejected

- **An unrestricted SpEL application context.** Its capabilities exceed this filter language.
  Restricted modes still require a reachable-object and resource audit; rejecting this configuration
  does not imply that every expression engine invocation is code execution.
- **CEL.** For this example, assume the four-form domain AST and SQL mapping are cheaper to own
  than adapting CEL's syntax and semantics. That is a decision to validate, not a measured result
  or a limit of CEL. In-memory-only evaluation makes CEL a stronger candidate, subject to the
  actual context, functions, limits and dependency constraints.
- **Unvalidated String identifiers.** A closed enum simplifies structural validation, but both
  enum and string designs still need current authorization, type checks and trusted SQL mappings.

## Sources for the value and diagnostic contracts

- [Java 21 Record](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Record.html): shallow immutability and defensive copying of mutable components.
- [OWASP GraphQL guidance](https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html#secure-configurations): validation and field suggestions can disclose schema information. The filter's public-error policy applies the same disclosure concern; this example is not a GraphQL implementation.
