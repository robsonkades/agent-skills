# Grammar, alternatives and safety

## Before writing a language

| Option                               | Fits when                                                        | Cost                                                   |
| ------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------ |
| Named rules in a sealed set          | The conditions are enumerable and change with releases           | None; cannot express what you did not foresee          |
| Structured configuration             | Conditions are conjunctions of fixed fields                      | Grows awkward past two levels of nesting               |
| **CEL** (Common Expression Language) | Sandboxed boolean/arithmetic expressions over a supplied context | A dependency; a grammar you do not control             |
| **JSONLogic**                        | Rules authored by non-programmers, transported as JSON           | Verbose; limited                                       |
| A rules engine (Drools et al.)       | Many interacting rules with conflict resolution                  | Substantial; its own runtime and operational model     |
| Your own interpreter                 | A small, stable, domain-specific grammar you must control        | Design, parser, docs, versioning, security — all yours |

The honest comparison is not "language versus no language" but "your language versus CEL". CEL
was designed for exactly the case most applications have — user-supplied boolean expressions over
a fixed context, evaluated safely, with bounded cost — and building an equivalent takes longer
than it appears. Write your own when the grammar is genuinely domain-shaped, when the AST must be
translated (to SQL, to a UI, to another service's dialect), or when the dependency is
unacceptable.

## The expression-language RCE class

Handing a user-influenced string to a general-purpose evaluator is arbitrary code execution. The
shapes to look for:

```java
// SpEL
parser.parseExpression(request.getParameter("filter")).getValue(context);

// OGNL / MVEL / JEXL — same class of problem
MVEL.eval(userSupplied, context);

// Template engines that permit expressions
templateEngine.process(userSuppliedTemplate, ctx);

// Indirect: a value that reaches an EL context
@Value("#{" + fromRequest + "}")
```

These evaluators can reach `java.lang.Runtime`, class loaders and reflection by design; sandboxing
them after the fact has a poor track record and a long CVE history across Spring, Struts and
several template engines. The rule is categorical: **an expression whose text a request can
influence must be evaluated by an interpreter you wrote, over an AST you can enumerate, with no
access to the host environment.**

That is the strongest argument for this pattern. A sealed AST cannot express "load a class"
because there is no node for it.

## Parsing is a separate problem

```text
text ──parse──► AST ──interpret──► value
     ^^^^^^^^        ^^^^^^^^^^^^
     not this pattern      this pattern
```

Options, roughly in order of grammar complexity:

- **A closed set of forms** — key, operator, value triples parsed by a regular expression or a
  split. Correct for `status eq ACTIVE`, and it stops being correct the moment nesting appears.
- **Hand-written recursive descent** — reasonable for a grammar you can write on one page, with
  precedence climbing for operators. Budget for error messages with positions; that is most of
  the work.
- **Parser combinators** — good ergonomics, keeps the grammar readable in Java.
- **A parser generator (ANTLR, JavaCC)** — the right answer once precedence, associativity and
  error recovery matter, and it gives a grammar file that documents the language.

The failure mode is a hand-rolled parser that grows: each new operator adds a special case, error
messages degrade to "invalid expression", and the grammar exists only as the code's behaviour.

## Resource limits for untrusted expressions

An interpreter over input you do not control is a denial-of-service surface. Four bounds, all
cheap:

```java
static final int MAX_DEPTH = 32;
static final int MAX_NODES = 500;
static final Duration MAX_EVAL = Duration.ofMillis(50);

// at parse time
if (depth > MAX_DEPTH) throw new ExpressionTooDeep(MAX_DEPTH);
if (++nodes > MAX_NODES) throw new ExpressionTooLarge(MAX_NODES);
```

- **Depth**, checked while parsing, so recursive descent cannot overflow the stack. A
  `StackOverflowError` can be thrown anywhere, including inside a `finally`, and leaves a request
  thread in an indeterminate state.
- **Node count**, so a wide expression cannot allocate unboundedly.
- **Evaluation time or step count**, for grammars where one node can be expensive — a regex match,
  a collection scan. A step counter checked in the evaluator is more reliable than a wall-clock
  deadline and does not need another thread.
- **No side effects and no host access.** Nodes evaluate over a supplied context and nothing else:
  no I/O, no reflection, no clock unless it is passed in.

Add one more if expressions can contain regular expressions: those have their own catastrophic
backtracking behaviour, and passing a user pattern to `Pattern.compile` reintroduces the DoS the
node limit just removed.

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

The compiled form removes the per-node `switch`, resolves field lookups once, and gives the JIT
monomorphic call sites inside each closure. A single-figure multiple of throughput is typical;
treat that as a hypothesis to measure rather than a promise (`jmh-microbenchmarks`).

Bytecode generation goes further and is rarely worth its complexity, its class-loading cost and
its debugging difficulty outside a genuine hot loop.

Cache the compiled form keyed by the expression text, with a bounded cache — an unbounded map
keyed by user-supplied strings is the leak described in `gof-flyweight`.

## Evaluate, and the other folds

Once the AST is a sealed type, evaluation is one fold among several:

```text
evaluate     Expr → (Ctx → boolean)
describe     Expr → String              for UI and audit
toSql        Expr → (String, params)    push filtering into the database
validate     Expr → List<Issue>         unknown fields, type errors
optimise     Expr → Expr                constant folding, reordering
```

Each is a `switch` over the same closed set, so adding a node type produces five compile errors —
exactly the sites that must be considered. This is the expression problem's favourable direction:
new operations are cheap, new node types are loud. When node types are contributed by others,
that trade reverses and Visitor or per-node methods become the right shape
(`gof-visitor`).

`toSql` deserves emphasis: it is often the reason to have a typed AST at all, because it lets the
same user expression filter in the database rather than in memory
(`query-objects-and-specifications`).
