---
name: gof-visitor
description: >
  Visitor in modern Java: adding operations over a stable set of element types without editing
  them, and how a sealed hierarchy with an exhaustive switch competes with the classical
  double-dispatch version. Covers the expression problem—new operations cheap
  versus new element types cheap — the cases where classical Visitor still wins (types you do not
  compile, libraries whose API is accept()), stateful visitors that are unsafe to share, recursion
  depth on deep structures, and unknown element types from a newer producer. Use when several
  operations must run over one object structure, when instanceof chains grow over a closed
  hierarchy, when adding an operation means editing every element class, or when an accept/visit
  pair is proposed. Does
  not cover the structure being traversed (gof-composite), traversal protocols (gof-iterator),
  sealed hierarchy design (java-composition-over-inheritance), or value semantics
  (java-immutability).
---

# Visitor

## Purpose

Put an operation over a family of types in one place instead of spreading it across them. Without
it, "render", "validate", "estimate cost" and "translate to SQL" each add a method to every
element class, and unrelated concerns accumulate in the model.

The classical mechanism—`accept(Visitor)` calling `visitor.visit(this)`—provides double dispatch
in a language that normally dispatches on one receiver. Since Java 21, pattern matching for
`switch` over a sealed hierarchy provides another mechanism: it centralizes an operation and
offers exhaustiveness without `accept`. It is not categorically better—Visitor can preserve
encapsulated dispatch, work with an established API, carry traversal state/protocol, and avoid
exposing every operation to pattern-matching sites.

Examples using record patterns/pattern switch require Java 21 without preview. Inspect the target
compiler, library API and extension model before adopting them; keep supported Visitor/method
forms on older baselines rather than upgrading implicitly. Deliver the dispatch/traversal policy,
compatibility trade-off, semantic checks and explicit unverified cases.

## The expression problem, stated once

```text
Two directions of change, and every design favours one:

Adding an OPERATION
  methods on elements   → edit every element class
  Visitor / switch      → one new function. Cheap.

Adding an ELEMENT TYPE
  methods on elements   → one new class. Cheap.
  Visitor / switch      → every visitor/switch must handle it.

Choose by which change your domain actually produces. A stable set of
types with growing operations wants Visitor; a growing set of types
with stable operations wants polymorphism.
```

The sealed-plus-`switch` form improves the second row: adding an element type is still expensive,
but recompiling relevant exhaustive switches exposes missing coverage unless a catch-all absorbs it.
Classical Visitor gets similar feedback when a new abstract visit method is added and implementations
are recompiled. Neither proves semantic correctness or protects old binaries from version skew.

## When it is the answer

```text
The element types are stable and you own them; the operations grow
        → compare sealed exhaustive folds with classical Visitor based on
          encapsulation, API compatibility and operation distribution.

The model/API already exposes accept(Visitor), or operations need
double dispatch without a closed pattern-switch boundary
        → classical Visitor remains a strong fit:
          javax.lang.model ElementVisitor or ANTLR-generated trees.
          FileVisitor and ASM are related visitor/callback protocols; inspect their actual API.

The traversal itself must vary — pre-order, post-order, pruning,
short-circuit
        → a visitor object that controls its own descent, or an
          explicit fold. A switch alone does not carry traversal.
```

## When it is not

- **One intrinsic operation over the structure.** A method on elements may be clearer. One
  external operation can still justify Visitor when an established traversal/API requires it.
- **The element set is growing.** Every new type breaks every visitor; if types arrive weekly, the
  design is fighting the change it gets.
- **The operation belongs to the element.** `area()` on a shape is not a visitor's business;
  moving intrinsic behaviour out produces an anaemic model (`java-tell-dont-ask`).
- **The hierarchy is open and you own the switch.** Exhaustiveness needs a catch-all policy.
  Explicit rejection may be correct; do not assume that either a switch or Visitor automatically
  handles arbitrary new plugin types.

## Modern Java expression

```text
Classical                            Modern
───────────────────────────────────  ───────────────────────────────────
interface Node { <R> R accept(       sealed interface Node permits
    Visitor<R> v); }                   Text, Image, Section

interface Visitor<R> {               static <R> R fold(Node n, ...) {
  R visitText(Text t);                 return switch (n) {
  R visitImage(Image i);                 case Text t -> …;
  R visitSection(Section s);             case Image i -> …;
}                                        case Section s -> …;
                                       };                       // no default
each element implements accept       }
by calling the right visit

adding an element: edit Visitor      adding an element: every switch
and every implementation             fails to compile — the same set of
                                     sites, found by the compiler

state in the visitor object          an accumulator parameter, or a
                                     Collector — no shared mutable field
```

Record deconstruction — case Section(var title, var children) — invokes the record component
accessors. It shortens syntax but does not hide representation or bypass accessor behavior.
Choose records only when publishing those components is an appropriate API (`java-composition-over-inheritance`).

## Decision rules

```text
IF the hierarchy is sealed and controlled with its consumers
THEN compare exhaustive switch/fold with Visitor. The switch reduces boilerplate;
     Visitor may better preserve model encapsulation, API stability, traversal state
     or dependency direction.

IF the Visitor interface has default methods, or the switch has a
default branch
THEN missing specialization may stop being a compile error. State whether the fallback
     rejects, handles generically or preserves unknowns; verify semantics with tests.

IF the visitor holds mutable state across visits
THEN document order, reset and confinement. Prefer an accumulator or fresh visitor;
     a deliberately synchronized/shared visitor is possible but changes semantics.

IF the structure can be deep or comes from untrusted input
THEN bound depth, node/work and payload/output size before unsafe recursion on every
     entry path; choose iterative traversal when stack depth is not demonstrably bounded (gof-composite).

IF the visitor must reach element internals
THEN review the representation boundary. Record patterns still expose components;
     consider a narrow element method that answers
     what the operation actually needs.

IF an element type may arrive from a newer producer
THEN decide explicitly: reject the document, or handle an "unknown"
     variant. Silently skipping it changes results — a filter that
     ignores an unknown constraint may widen matches; operator semantics determine the effect.

IF the operation mutates the structure while traversing
THEN follow the traversal/container mutation contract. In-place transforms can be
     correct with cursor/iterator-supported replacement or staged edits; arbitrary
     structural mutation commonly skips or revisits nodes.

IF one visitor needs a different traversal order than another
THEN traversal is a variation point of its own — separate walking from
     the operation rather than duplicating both.
```

## Cross-cutting checks

- **Concurrency.** Mutable visitors need confinement, a reset/reuse contract and reentrancy rules.
  Fresh per-traversal instances are simple; a stateless result fold is another option. Parallel
  reduction requires a valid identity, associative combination and the appropriate ordering and
  isolation guarantees. Collector specifies those obligations; it does not enforce them for you.
- **Distribution.** Where the structure crosses a boundary — an AST, a document model, a protocol
  message — the element set becomes a versioned contract. An older consumer will meet a node type
  it does not know, and ignoring it may change semantics: for a filter it may broaden matches, for a
  pricing tree it drops a charge, for a policy document it may drop a restriction. Reject, or model
  the unknown explicitly (`rpc-and-api-contracts`).
- **Performance.** Classical Visitor has two dispatches, but neither is inherently megamorphic and
  HotSpot may inline stable profiles. Pattern switches use JDK/JVM-specific type-switch machinery;
  record patterns do not guarantee a meaningful speedup. Traversal usually does not allocate per
  node unless the operation creates results/context. Benchmark actual tree shape, operation and
  compilation (`jit-inlining-and-escape-analysis`, `allocation-profiling`).
- **Testing.** The property worth having is that every element type is handled by every operation.
  Compiler coverage helps with type cases, not correct output or traversal reachability. Test
  expected results, errors and order for each kind; adding a visitor method must be coordinated
  with element dispatch. Generic fallbacks require their own semantic tests.

## Review checklist

- [ ] Operation growth or an established traversal/API justifies externalized dispatch
- [ ] The element set is stable; if it grows weekly, this is the wrong direction
- [ ] Closed hierarchies explicitly compare sealed folds with Visitor and record compatibility costs
- [ ] Classical Visitor has an encapsulation, traversal, dependency, or established-API reason
- [ ] Fallback methods have explicit rejection/generic/unknown semantics with tests
- [ ] Mutable visitors have explicit confinement, reset and reentrancy contracts
- [ ] Deep/untrusted structures have enforced resource limits and stack-safe traversal
- [ ] An unknown element type from a newer producer is rejected or modelled, never skipped
- [ ] Intrinsic behaviour stayed on the elements

## References

- [Visitor against pattern matching](references/visitor-vs-pattern-matching.md) — the expression
  problem with both directions worked through; where classical Visitor still wins and why; double
  dispatch mechanics and its boilerplate count; stateful visitors and the fold that replaces them;
  and traversal separated from operation. Read when choosing between the two forms.
- [Worked example](references/worked-example.md) — a document model with four operations: the
  classical visitor it started as, the sealed fold alternative and the compile-time
  guarantee each gives, the unknown-node decision when documents began arriving from another
  service, and the depth bound. Read when implementing.
