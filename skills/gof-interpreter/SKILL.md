---
name: gof-interpreter
description: >
  Interpreter in modern Java: representing a small language as a typed tree and evaluating it,
  expressed today as a sealed AST with an exhaustive switch rather than an eval() method per node.
  Covers parsing as a separate problem the pattern does not solve, when an existing expression
  language beats writing one, why evaluating user-supplied SpEL or OGNL is remote code execution,
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

Two boundaries define it. **Parsing is not part of it**: GoF assumes the tree already exists, and
turning text into that tree is a separate problem with mature tools. And **it is for small
languages**: anything with scoping, user-defined functions, recursion or performance requirements
has outgrown a tree-walking interpreter, and the alternative is a real language runtime rather
than a bigger `switch`.

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
- **The expression comes from an untrusted source and you were going to use SpEL, OGNL, MVEL or a
  template engine.** That is remote code execution, and it has produced a long series of critical
  CVEs.
- **It must be fast.** A tree walk allocates and dispatches per node. If the expression runs
  millions of times, compile it (see below) or do not use this shape.

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
THEN they are untrusted input. Bound depth, node count and evaluation
     time; forbid side effects; and never hand them to a general-purpose
     expression or template engine.

IF a general-purpose engine (SpEL, OGNL, MVEL, EL, a template engine)
is being fed a string that a request can influence
THEN stop. That is arbitrary code execution, not configuration.

IF the grammar has precedence, nesting or useful error messages
THEN use a parser generator or combinators. Hand-rolled parsers for
     non-trivial grammars are where the bugs live.

IF the AST is walked more than once per parse
THEN parse once and cache the AST, keyed by the expression text.
     Parsing usually costs more than evaluating.

IF evaluation is in a hot path
THEN compile the AST once into a tree of closures (or bytecode) and
     evaluate that. This routinely wins an order of magnitude over
     re-walking nodes, and is measurable (jmh-microbenchmarks).

IF an expression must run in more than one process or version
THEN the grammar is a contract: version it, and decide what an older
     evaluator does with a node it does not know.

IF nodes hold evaluation state
THEN the AST is not shareable. Keep nodes immutable and pass the
     context as a parameter.

IF the language grows variables, functions, loops or recursion
THEN it has stopped being a small language. Reconsider embedding an
     existing one before adding scoping to a switch.
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
- **Performance.** Tree walking costs a virtual call and often an allocation per node, and the
  call site is megamorphic by construction. The three levers, in order: cache the parsed AST;
  compile to closures so the structure is resolved once; short-circuit and reorder cheap
  predicates first. Measure each — the parse is frequently the dominant cost and the one nobody
  profiles (`jfr-and-async-profiler`, `allocation-profiling`).
- **Testing.** Property-based testing suits this unusually well: generate expressions, assert
  algebraic laws (`a AND b` equals `b AND a`, `NOT NOT a` equals `a`), and compare the compiled
  evaluator against the tree walker on random inputs. Add fuzzed text against the parser, and
  assert that pathological input is rejected by the limits rather than by a `StackOverflowError`.

## Review checklist

- [ ] The language is small, and its growth is deliberately bounded
- [ ] An existing expression language was considered and rejected for a stated reason
- [ ] No user-influenced string reaches SpEL, OGNL, MVEL, EL or a template engine
- [ ] Depth, node count and evaluation time are bounded for untrusted expressions
- [ ] Evaluation has no side effects and no access to the host environment
- [ ] Parsing is separate from interpreting, and parsed ASTs are cached
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
