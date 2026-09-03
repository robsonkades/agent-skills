---
name: gof-interpreter
description: >
  Interpreter in modern Java: representing a small language as a typed tree and evaluating it,
  expressed today as a sealed AST with an exhaustive switch rather than an eval() method per node.
  Covers parsing as a separate problem the pattern does not solve, when an existing expression
  language beats writing one, how general expression engines become code-execution surfaces when
  exposed with unsafe capabilities,
  the resource bounds an interpreter over untrusted input needs, and closure compilation when tree
  walking is too slow. Use when a filter, rule or formula language is designed, when configuration
  has grown conditionals, when someone proposes embedding an expression evaluator, or when an
  expression from a request is passed to a template or EL engine. Does not cover adding operations over an existing tree (gof-visitor), the tree structure
  itself (gof-composite), query specifications over a database
  (query-objects-and-specifications), or JIT compilation of Java
  (jit-compilation).
---

# Interpreter

## Purpose

Give a small language a typed representation and an evaluator. The pattern is worth its cost when
users — or configuration, or another service — must express conditions the code cannot enumerate:
filter expressions, pricing formulas, routing rules, feature-flag conditions, alert predicates.

Two boundaries help scope it. Parsing is a separate responsibility even though a usable language
normally needs it. And the GoF class-per-production approach fits small grammars best; scoping,
user functions, recursion, optimization or strict isolation may justify a mature runtime, bytecode
VM, or existing language rather than an ever-growing `switch`.

## When it is the answer

```text
Users must express conditions you cannot enumerate at compile time,
in a language you control and can keep small
        → Interpreter, with a sealed AST.

Rules change more often than releases and must be stored as data
        → Interpreter, with the AST persisted or parsed from stored text.

Expressions must be inspected as well as evaluated — explained,
optimised, translated to SQL, shown in a UI
        → a typed AST is the point; evaluation is one operation over it
          (and several operations suggest gof-visitor).
```

## When it is not

- **The conditions are known and few.** A sealed set of named rules, or configuration with a
  fixed shape, is simpler than a language and cannot express nonsense.
- **A suitable language already exists.** CEL, JSONLogic, a rules engine or a query DSL is
  usually cheaper than designing, documenting, versioning and securing your own.
- **The grammar is non-trivial.** Precedence, associativity, error recovery and position tracking
  are what parser generators and combinator libraries do properly.
- **The expression comes from an untrusted source and the chosen engine exposes constructors,
  reflection, bean/type access or host functions.** That can become arbitrary code execution.
  Prefer a capability-restricted evaluator (for example SpEL `SimpleEvaluationContext` where its
  limits fit), an allowlisted language, or process isolation.
- **It has an unverified latency target.** A tree walk need not allocate per node and may be fast
  enough. Profile parsing and evaluation before adding closure or bytecode compilation.

## Modern Java expression

```text
Classical                            Modern
───────────────────────────────────  ───────────────────────────────────
abstract class Expression            sealed interface Expr
  abstract Value interpret(Context)    permits Literal, Var, And, Or, Cmp

one interpret() per node class       one exhaustive switch — the whole
                                     evaluator readable in one place, and
                                     a new node breaks it at compile time

Context as a mutable map             an immutable context record, or a
                                     Function<String, Value> resolver

evaluation only                      several folds over the same AST:
                                     evaluate, describe, toSql, validate
```

The `switch` form is preferable while you own every node type: the evaluator is one function
rather than scattered across the node classes, and adding a node type produces a compile error at
every fold. Keep `interpret()` on the nodes only when third parties contribute node types
(`java-composition-over-inheritance`).

## Decision rules

```text
IF expressions come from users or another service
THEN they are untrusted input. Bound text size, parse depth/node count,
     function capabilities and evaluation work. In-process wall-clock timeout alone
     cannot safely stop arbitrary non-cooperative code; use cooperative budgets or isolation.

IF a general-purpose engine (SpEL, OGNL, MVEL, EL, a template engine)
is being fed a string that a request can influence
THEN audit the evaluation context and reachable capabilities. Full reflection/type/
     method access can become arbitrary code execution; a documented restricted mode
     may be acceptable after adversarial tests.

IF the grammar has precedence, nesting or useful error messages
THEN use a parser generator or combinators. Hand-rolled parsers for
     non-trivial grammars are where the bugs live.

IF the AST is walked repeatedly
THEN consider caching only after measuring parse cost. Bound cache size/weight and key
     normalization; request-controlled unique expressions otherwise create a retention attack.

IF evaluation is in a hot path
THEN compare tree walking, specialized closures, bytecode and vectorized/batched
     evaluation. Compilation has warm-up, code-cache and eviction costs; benchmark
     representative expressions and polymorphism (jmh-microbenchmarks).

IF an expression must run in more than one process or version
THEN the grammar is a contract: version it, and decide what an older
     evaluator does with a node it does not know.

IF nodes hold evaluation state
THEN the AST is not shareable. Keep nodes immutable and pass the
     context as a parameter.

IF the language grows scoping, user functions, loops or recursion
THEN revisit parser/runtime, resource accounting, stack behavior, debugging and
     compatibility. This is a complexity trigger, not an automatic prohibition.
```

## Cross-cutting checks

- **Concurrency.** An immutable AST is safe to share across threads and to cache; that is the
  design to hold. The failure is a node that caches its last result or holds a reference to the
  context — then the same expression evaluated concurrently for two users can return one user's
  answer to the other. Evaluation state belongs in a per-call context
  (`java-immutability`).
- **Distribution.** An expression transmitted between services makes the grammar a wire contract.
  A node type added by a newer producer must have a defined meaning for an older evaluator —
  usually "reject the expression", never "ignore the node", which silently changes a filter's
  meaning and can widen an authorisation rule (`rpc-and-api-contracts`).
- **Performance.** Tree walking incurs dispatch/branching but need not allocate per node after the
  AST exists. Cache parsing only with bounded cardinality, specialize only hot stable expressions,
  and reorder predicates only when error, null and short-circuit semantics permit it. Measure
  parse, evaluation, allocation and generated-code retention separately
  (`jfr-and-async-profiler`, `allocation-profiling`).
- **Testing.** Property-based testing suits this unusually well: generate expressions, assert
  semantic laws valid for the language's null/error model, and compare the compiled
  evaluator against the tree walker on random inputs. Add fuzzed text against the parser, and
  assert that pathological input is rejected by the limits rather than by a `StackOverflowError`.

## Review checklist

- [ ] The language is small, and its growth is deliberately bounded
- [ ] An existing expression language was considered and rejected for a stated reason
- [ ] Any user-influenced engine input runs with an audited allowlist/capability model or isolation
- [ ] Depth, node count and evaluation time are bounded for untrusted expressions
- [ ] Evaluation has no side effects and no access to the host environment
- [ ] Parsing is separated; any AST cache is measured, bounded and resistant to key-cardinality abuse
- [ ] AST nodes are immutable; evaluation state lives in a per-call context
- [ ] An unknown node type from a newer producer is rejected, not ignored
- [ ] Performance claims about compilation are backed by a benchmark

## References

- [Grammar, alternatives and safety](references/grammar-and-alternatives.md) — when to embed CEL,
  JSONLogic or a rules engine instead; the expression-language RCE class with the shapes to look
  for; parsing options and why hand-rolling is usually wrong; resource limits for untrusted
  expressions; and closure compilation with the numbers it typically gives. Read before designing
  a language.
- [Worked example](references/worked-example.md) — a filter language for a search API: the sealed
  AST, the evaluator as a fold, a second fold that compiles to SQL, closure compilation for the
  hot path, and the limits applied at the boundary. Read when implementing.
