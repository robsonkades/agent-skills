---
name: gof-composite
description: >
  Composite in modern Java: treating a leaf and a tree of leaves through one interface, and the
  hazards that come with a recursive structure. Covers the transparent-versus-safe trade-off and
  why a sealed interface with exhaustive pattern matching now beats both, unbounded depth and
  StackOverflowError, cycles introduced by parent pointers and the infinite recursion they cause
  in equals, hashCode and toString, mutation during traversal, and why a tree whose children live
  in other services is not this pattern. Use when a part-whole hierarchy is being modelled, when
  a leaf class is forced to implement add() and throw, when a recursive walk overflows the stack
  on production data, when nested structures arrive from untrusted input, or when someone
  proposes Composite for a flat group of items. Does not cover adding operations over a tree
  (gof-visitor), traversal protocols (gof-iterator), adding behaviour to one object
  (gof-decorator), or aggregate boundaries in a domain model (domain-logic-organization).
---

# Composite

## Purpose

Let a client treat one thing and a group of things identically, recursively. The pattern is
correct exactly when the client's operation is genuinely indifferent to the distinction — the
size of a file or a directory, the total of a line or a section, whether a permission is
granted, whether a rule passes.

Everything difficult about Composite comes from the structure rather than the interface: trees
have depth, may acquire cycles, are mutated while being walked, and are serialised. Those are
the failures that reach production; the uniform interface is the easy part.

## When it is the answer

```text
The structure is genuinely recursive — a composite can contain
composites, to arbitrary depth
        → Composite.

Clients perform an operation whose meaning is the same for one and
for many (size, total, evaluate, render, matches)
        → Composite.

Examples that fit: ASTs and expression trees, file and document
trees, organisation and permission hierarchies, composite validation
rules and specifications, UI component trees.
```

## When it is not

- **The nesting is two levels and fixed.** An order with lines is not a composite; it is an
  object with a collection. Recursion you will never use costs clarity.
- **Leaves cannot honour the operations.** If `add`, `remove` or `children` are meaningless for a
  leaf, the "uniform" interface is a lie the leaf pays for by throwing.
- **Clients constantly need to know which they hold.** Every `instanceof` at a call site is
  evidence that the operation is not indifferent — model the difference instead of hiding it.
- **The children are remote.** A uniform interface over local and remote children hides N network
  calls behind a loop (`gof-patterns-and-distribution`).
- **The structure is a graph, not a tree.** Composite's operations assume termination; shared
  nodes double-count and cycles never return.

## Transparent, safe, or sealed

```text
Transparent (GoF's preference)
  Component declares add/remove/getChild; Leaf throws
  → uniform type, but the interface promises what leaves cannot do,
    and the failure is at runtime

Safe
  only Composite declares add/remove; clients downcast to mutate
  → honest types, but clients test and cast

Sealed + pattern matching (modern default)
  sealed interface Node permits Leaf, Branch
  → the shared operation stays on the interface; structural operations
    live on Branch; a switch over the closed set is exhaustive and the
    compiler finds every site when a variant is added
```

The sealed form resolves the trade-off the GoF text had to choose between: clients that only
evaluate use the interface and never mention the variants; clients that manipulate structure
switch exhaustively, with no downcast and no unreachable `throw`. Prefer it whenever you own
every node type (`java-composition-over-inheritance`).

## Decision rules

```text
IF the tree's depth comes from data you do not control
THEN recursion is a denial-of-service surface. Bound the depth on
     construction, and traverse iteratively with an explicit deque.

IF nodes hold parent pointers
THEN the structure has cycles. equals, hashCode and toString must not
     follow them — implement by identity, or exclude the parent, or the
     first log line recurses until the stack ends.

IF the tree is mutable and may be traversed concurrently
THEN a walk can see a half-applied change or throw
     ConcurrentModificationException. Prefer immutable nodes with
     structural sharing; if mutable, state the locking.

IF a leaf must implement an operation that has no meaning for it
THEN the interface is wrong. Move that operation to the composite type.

IF the same node instance appears in two places in the tree
THEN it is a DAG. Aggregations double-count and identity-based logic
     breaks; either forbid sharing or make operations idempotent over it.

IF an operation over the tree needs to know each node's concrete type
THEN it is a Visitor or a pattern-matched fold, not a method on
     Component (gof-visitor).

IF children are fetched lazily from a database
THEN a walk is an N+1 query. Load the subtree in one query, or do not
     model it as a composite (orm-behavioral-patterns).
```

## Cross-cutting checks

- **Concurrency.** Nothing about the pattern is thread-safe. The realistic hazards are a
  traversal running while a child is added — `ConcurrentModificationException` at best, a walk
  that silently skips a subtree at worst — and a "total" computed across a mutation, which is
  arithmetically consistent with no state the tree ever had. Immutable nodes with a copy-on-write
  root reference remove both, and make caching a computed aggregate safe.
- **Distribution.** A composite is process-local. Where children are references into another
  service, the uniform interface turns one call into a fan-out whose latency is the slowest
  branch and whose failure semantics are partial (`scatter-gather`). Where trees are transmitted,
  depth is an attack surface — deeply nested JSON or XML exhausts the parser's stack or the
  serialiser's, so a depth limit belongs at the boundary, not in the domain.
- **Performance.** Per-node object overhead dominates for wide shallow trees: a million-node tree
  of small objects costs far more in headers and references than the data it holds. Recursive
  traversal also allocates stack frames the JIT cannot always eliminate. Where a tree is walked
  in a hot path, consider computing an aggregate incrementally at mutation time, or flattening to
  an array-backed representation — after measuring (`allocation-profiling`).
- **Testing.** Trees are where property-based tests pay: generate random structures and assert
  invariants (total of a branch equals the sum of its children; a walk visits every node once;
  depth-limit rejection). Include a degenerate deep chain in the suite — that is the case
  production finds and unit tests miss.

## Review checklist

- [ ] The recursion is real, not a two-level group modelled aspirationally
- [ ] No leaf implements an operation by throwing
- [ ] Depth from external input is bounded at the boundary
- [ ] Traversal is iterative where depth is unbounded, or depth is provably small
- [ ] `equals`, `hashCode` and `toString` terminate in the presence of parent pointers
- [ ] Mutation and traversal cannot overlap, or the nodes are immutable
- [ ] Node sharing is either forbidden or accounted for in every aggregation
- [ ] Children are not loaded lazily per node inside a walk

## References

- [Structure and hazards](references/structure-and-hazards.md) — transparent, safe and sealed
  compared with what each costs, iterative traversal, depth bounding, cycles and identity,
  `equals`/`hashCode` on recursive structures, parent pointers, and the mutation-versus-traversal
  rules. Read before implementing a tree that outlives a single method.
- [Worked example](references/worked-example.md) — an organisational permission tree: the
  transparent version and its throwing leaf, the sealed version, an iterative resolver with a
  depth bound, caching an aggregate safely under immutability, and the property tests. Read when
  implementing.
