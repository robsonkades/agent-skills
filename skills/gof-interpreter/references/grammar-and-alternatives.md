# Grammar, alternatives and safety

## Before writing a language

| Option                               | Fits when                                                         | Cost                                                   |
| ------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------ |
| Named rules                          | The conditions are enumerable and change with releases            | Limited vocabulary; additions may require releases     |
| Structured configuration             | A fixed schema expresses the required conditions                  | Validate combinations; assess actual expressiveness    |
| **CEL** (Common Expression Language) | Restricted boolean/arithmetic expressions over a supplied context | A dependency; a grammar you do not control             |
| **JSONLogic**                        | Rules authored by non-programmers, transported as JSON            | Verbose; limited                                       |
| A rules engine (Drools et al.)       | Many interacting rules with conflict resolution                   | Substantial; its own runtime and operational model     |
| Your own interpreter                 | A small, stable, domain-specific grammar you must control         | Design, parser, docs, versioning, security — all yours |

Compare fixed configuration, relevant existing languages and the cost of owning your grammar.
CEL is a useful candidate for restricted expressions; actual cost bounds depend on input sizes,
runtime configuration and registered functions. Owning a small grammar may be justified by
domain syntax, translation needs or dependency constraints; check whether an existing language's
AST and semantics already meet them before treating those requirements as automatic exclusions.

## The expression-language RCE class

User-influenced text evaluated with powerful host capabilities can permit code execution. These
partial call shapes require an audit of context, capabilities, input provenance and limits:

```java
// SpEL
parser.parseExpression(request.getParameter("filter")).getValue(context);

// OGNL / MVEL / JEXL — same class of problem
MVEL.eval(userSupplied, context);

// Template engines that permit expressions
templateEngine.process(userSuppliedTemplate, ctx);

// Also trace indirect construction of expression text from untrusted values.
// Java annotation attributes themselves cannot contain request-time variables.
```

Do not expose unrestricted evaluation contexts to untrusted expressions. Restricted engines can
be viable, but neither a home-grown sealed AST nor a named restricted mode proves safety. Audit
all reachable values, resolvers and functions. Spring explicitly warns that read-only property
access can invoke side-effecting accessor-shaped methods: SimpleEvaluationContext excludes some
syntax but provides no safety guarantee. A closed AST is useful only if its evaluator and context
also have bounded, allowlisted capabilities.

## Parsing is a separate problem

```text
text ──parse──► AST ──interpret──► value
     ^^^^^^^^        ^^^^^^^^^^^^
     not this pattern      this pattern
```

Options, roughly in order of grammar complexity:

- **A closed set of forms** — key, operator, value triples can use a small recognizer when token
  boundaries and quoting/escaping are unambiguous. Consume all input; a bare split is not a parser
  for arbitrary quoted values or nesting.
- **Hand-written recursive descent** — reasonable for a grammar you can write on one page, with
  precedence climbing for operators. Budget for error messages with positions; that is most of
  the work.
- **Parser combinators** — good ergonomics, keeps the grammar readable in Java.
- **A parser generator (ANTLR, JavaCC)** — useful when grammar size, maintenance or error recovery
  justify generated machinery and a grammar artifact. Precedence alone does not require one.

The failure mode is a hand-rolled parser that grows: each new operator adds a special case, error
messages degrade to "invalid expression", and the grammar exists only as the code's behaviour.

## Resource limits for untrusted expressions

An interpreter over input you do not control is a denial-of-service surface. These illustrative
limits require enforcement, not just constants; choose values from workload and capacity tests:

```java
static final int MAX_DEPTH = 32;
static final int MAX_NODES = 500;
static final Duration MAX_EVAL = Duration.ofMillis(50);

// at parse time
if (depth > MAX_DEPTH) throw new ExpressionTooDeep(MAX_DEPTH);
if (++nodes > MAX_NODES) throw new ExpressionTooLarge(MAX_NODES);
```

- **Depth**, checked while parsing, so recursive descent cannot overflow the stack. A
  limit must be checked before descending. Include externally deserialized or programmatically
  constructed ASTs; a post-parse recursive validator can itself overflow on malformed input.
- **Node count**, so a wide expression cannot allocate unboundedly.
- **Evaluation time or step count**, for grammars where one node can be expensive — a regex match,
  a collection scan. Count work inside expensive primitives and bound operand/result sizes;
  one step per node cannot bound a catastrophic regex or huge numeric operation. Deadlines are
  cooperative checks, not preemption of non-cooperative host calls.
- **Pure filter capabilities.** This design evaluates supplied data and approved bounded
  functions: no I/O, reflection or clock unless time is passed in. A language that intentionally
  performs effects needs a separate explicit authorization, resource and failure/lifetime contract;
  parsing or a callable host function does not grant that authority.

Add one more if expressions can contain regular expressions: those have their own catastrophic
backtracking behaviour, and passing a user pattern to `Pattern.compile` reintroduces the DoS the
node limit just removed.
Also bound decoding/token size, numeric precision, diagnostic output and compilation/cache work.

## Closure compilation

Walking the tree re-dispatches on node type for every evaluation. Compiling it once turns the
structure into a tree of lambdas whose shape is already resolved:

```java
// interpretation: dispatch per node, per evaluation
boolean eval(Expr e, Ctx c) {
    return switch (e) {
        case And a -> eval(a.left(), c) && eval(a.right(), c);
        case Cmp cmp -> compare(c.get(cmp.field()), cmp.op(), cmp.value());
        ...
    };
}

// compilation: dispatch per node, once
Predicate<Ctx> compile(Expr e) {
    return switch (e) {
        case And a -> { var l = compile(a.left()); var r = compile(a.right());
                        yield c -> l.test(c) && r.test(c); }
        case Cmp cmp -> { var field = cmp.field(); var op = cmp.op(); var v = cmp.value();
                          yield c -> compare(c.get(field), op, v); }
        ...
    };
}
```

The compiled form specializes tree dispatch, but this example still calls c.get(field) on every
evaluation. Lambda targets can remain polymorphic; allocation elimination/inlining are not promised.
Measure construction, repeated evaluation and retained closures on representative expressions,
preserving null, errors and short-circuit order (`jmh-microbenchmarks`).

Bytecode generation goes further and is rarely worth its complexity, its class-loading cost and
its debugging difficulty outside a genuine hot loop.

Cache only context-free compiled forms under bounded weight/cardinality. Include grammar/schema
and semantic configuration in the key and revalidate caller authorization on use; never capture a
request context in a shared closure. An unbounded map is the retention risk in `gof-flyweight`.

## Evaluate, and the other folds

Once the AST is a sealed type, evaluation is one fold among several:

```text
evaluate     Expr → (Ctx → boolean)
describe     Expr → String              for UI and audit
toSql        Expr → (String, params)    push filtering into the database
validate     Expr → List<Issue>         unknown fields, type errors
optimise     Expr → Expr                constant folding, reordering
```

Adding a node exposes missing coverage when these exhaustive switches are recompiled; catch-all
cases and old binaries need separate review. New external operations are easy to add to a closed
model. When types grow while operations stay stable, per-node methods may fit better. Classical
Visitor does not automatically handle arbitrary plugin types; use it when the actual operation
and extension contract justify it (`gof-visitor`).

`toSql` deserves emphasis: it is often the reason to have a typed AST at all, because it lets the
same user expression filter in the database rather than in memory
(`query-objects-and-specifications`).

Primary sources: [Spring evaluation security](https://docs.spring.io/spring-framework/reference/core/expressions/evaluation.html),
[CEL Java](https://github.com/cel-expr/cel-java), and [PostgreSQL 18 comparisons](https://www.postgresql.org/docs/18/functions-comparison.html).
Verify the deployed engine/dialect rather than projecting these examples onto every implementation.
