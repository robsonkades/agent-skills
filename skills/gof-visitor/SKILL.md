---
name: gof-visitor
description: >
  Visitor in modern Java: adding operations over a stable set of element types without editing
  them, and why a sealed hierarchy with an exhaustive switch now replaces the classical
  double-dispatch version for any hierarchy you own. Covers the expression problem — new operations cheap
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

The classical mechanism — `accept(Visitor)` calling `visitor.visit(this)` — exists to get double
dispatch in a language that only dispatches on the receiver. Java has had a better mechanism since
pattern matching for `switch`: a sealed hierarchy plus an exhaustive `switch` gives the same
separation, the same compile-time completeness check, and none of the boilerplate.

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
but it becomes a **compile error at every site** rather than a silent gap. Classical Visitor gets
the same property only if the visitor interface has no default `visit` method.

## When it is the answer

```text
The element types are stable and you own them; the operations grow
        → sealed interface + exhaustive switch. Not classical Visitor.

The element types are contributed by code you do not compile, and
their API is accept(Visitor)
        → classical Visitor. This is the case it still owns:
          FileVisitor, javax.lang.model's ElementVisitor, ASM,
          ANTLR-generated trees, JDT.

The traversal itself must vary — pre-order, post-order, pruning,
short-circuit
        → a visitor object that controls its own descent, or an
          explicit fold. A switch alone does not carry traversal.
```

## When it is not

- **One operation over the structure.** A method on the elements, or one `switch`. The visitor
  interface is machinery for a plurality that does not exist.
- **The element set is growing.** Every new type breaks every visitor; if types arrive weekly, the
  design is fighting the change it gets.
- **The operation belongs to the element.** `area()` on a shape is not a visitor's business;
  moving intrinsic behaviour out produces an anaemic model (`java-tell-dont-ask`).
- **The hierarchy is open and you own the switch.** Then a `default` branch silently absorbs new
  types, and the compile-time guarantee — the main reason to prefer the modern form — is gone.

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

Record deconstruction sharpens it further — `case Section(var title, var children) -> …` binds the
parts without accessors, which also removes the pressure Visitor puts on elements to expose their
internals (`java-composition-over-inheritance`).

## Decision rules

```text
IF the hierarchy is sealed and you own it
THEN use an exhaustive switch. Classical Visitor adds an interface, an
     accept method per element, and a visit method per pair, for the
     same guarantee.

IF the Visitor interface has default methods, or the switch has a
default branch
THEN adding an element type is silent. That is a deliberate trade for
     open hierarchies and a mistake for closed ones.

IF the visitor holds mutable state across visits
THEN it is single-use, order-dependent and unsafe to share. Prefer an
     accumulator passed through the fold, or create one visitor per
     traversal and document it.

IF the structure can be deep or comes from untrusted input
THEN a recursive fold overflows the stack. Bound the depth at the
     boundary and traverse iteratively (gof-composite).

IF the visitor must reach element internals
THEN the pattern is pushing accessors onto your model. Use record
     deconstruction, or give the element a narrow method that answers
     what the operation actually needs.

IF an element type may arrive from a newer producer
THEN decide explicitly: reject the document, or handle an "unknown"
     variant. Silently skipping it changes results — a filter that
     ignores an unknown node widens what it matches.

IF the operation mutates the structure while traversing
THEN the traversal's behaviour is undefined. Produce a new structure
     instead; that fold is also easier to test.

IF one visitor needs a different traversal order than another
THEN traversal is a variation point of its own — separate walking from
     the operation rather than duplicating both.
```

## Cross-cutting checks

- **Concurrency.** A visitor with fields accumulating results is not thread-safe and cannot be
  reused between traversals; sharing one as a singleton bean is a common and silent error. Two safe
  designs: a stateless fold returning a value, or a fresh visitor per traversal. If a traversal is
  parallelised, results must combine associatively — which is a `Collector`, and reaching for one
  is the sign the visitor should have been a fold.
- **Distribution.** Where the structure crosses a boundary — an AST, a document model, a protocol
  message — the element set becomes a versioned contract. An older consumer will meet a node type
  it does not know, and "ignore it" is rarely safe: for a filter it broadens the match, for a
  pricing tree it drops a charge, for a policy document it may drop a restriction. Reject, or model
  the unknown explicitly (`rpc-and-api-contracts`).
- **Performance.** Classical double dispatch is two virtual calls per node, both megamorphic by
  construction, so neither inlines well. A pattern-matching `switch` over a sealed type compiles to
  a type switch that the JIT handles better, and record deconstruction avoids accessor calls. In a
  hot traversal this is measurable — but the dominant cost is usually allocation per node visited,
  not dispatch (`jit-inlining-and-escape-analysis`, `allocation-profiling`).
- **Testing.** The property worth having is that every element type is handled by every operation.
  With a sealed `switch` the compiler provides it. With classical Visitor, keep the visit methods
  abstract — a `default` in the interface converts a compile error into a silent gap — and add a
  test that enumerates the element types and asserts each is reachable.

## Review checklist

- [ ] More than one operation exists over the structure
- [ ] The element set is stable; if it grows weekly, this is the wrong direction
- [ ] Closed hierarchies use a sealed type and a `switch` with no `default`
- [ ] Classical Visitor is used only for types you do not compile, or an `accept`-based API
- [ ] No `default` visit method hides an unhandled element type
- [ ] Visitors hold no state across traversals, or are created per traversal
- [ ] Deep or untrusted structures are traversed iteratively with a depth bound
- [ ] An unknown element type from a newer producer is rejected or modelled, never skipped
- [ ] Intrinsic behaviour stayed on the elements

## References

- [Visitor against pattern matching](references/visitor-vs-pattern-matching.md) — the expression
  problem with both directions worked through; where classical Visitor still wins and why; double
  dispatch mechanics and its boilerplate count; stateful visitors and the fold that replaces them;
  and traversal separated from operation. Read when choosing between the two forms.
- [Worked example](references/worked-example.md) — a document model with four operations: the
  classical visitor it started as, the sealed fold it became, the line count and the compile-time
  guarantee each gives, the unknown-node decision when documents began arriving from another
  service, and the depth bound. Read when implementing.
