---
name: java-design-by-contract
description: >
  Contracts as the semantics of a Java API, without a contract framework: preconditions,
  postconditions and invariants defined precisely and mapped to Java 25 mechanisms —
  constructor and compact-constructor validation, invariants as types that cannot
  represent invalid states, postconditions via tests and assert, contracts documented in
  Javadoc, behavioural subtyping (overrides may weaken preconditions and strengthen
  postconditions, never the reverse), and contracts across sealed hierarchies. Use when
  a class's invariants live in its callers' heads, when an override adds a requirement
  its supertype never made, when deciding what @throws to promise, or when assert is
  guarding public input. Does not cover where boundary validation belongs
  (java-defensive-programming) or LSP in its five-principle context (java-solid).
---

# Java Design by Contract

## Purpose

Make what a method requires, guarantees and preserves explicit — in types where
possible, in checks and Javadoc otherwise — instead of leaving it in callers' heads.
The failure modes this skill prevents: invariants enforced by convention until the one
caller who did not know breaks them, Javadoc that describes the current implementation
instead of a promise, and subtype overrides that quietly change the deal.

## Definitions

- **Precondition** — what must hold when a method is called; the _caller's_ obligation.
  Violation is the caller's bug.
- **Postcondition** — what holds when it returns normally; the _implementation's_
  obligation. Violation is the implementation's bug.
- **Invariant** — what holds about an object between every public operation; established
  by constructors, preserved by every method.

Who is at fault decides the mechanism: preconditions throw at the caller;
postconditions and invariants are the code's own promises, checked by tests and asserts.

## Workflow

1. **Write the contract before touching code**: for the method or class, the
   preconditions, postconditions and invariants in one sentence each. What you cannot
   state, callers are currently guessing.
2. **Push each invariant into a type** where one can carry it: a validating record
   (`Quantity` that cannot be zero or negative) removes the precondition from every
   method that takes one. A class invariant lives in the constructor — with flexible
   constructor bodies (Java 25, JEP 513), validation precedes `super(...)` even in
   subclasses, so no partially constructed object exists that violates it.
3. **Enforce remaining preconditions at method entry**, throwing with the expectation
   and the actual value; document each as `@throws` in Javadoc.
4. **State postconditions as tests**, plus an `assert` in the method body where a broken
   guarantee would otherwise surface far from its cause.
5. **Check subtypes and sealed variants**: every override against the subtyping rules
   below; every sealed hierarchy's variants for their individual contracts, with
   exhaustive `switch` (no `default`) as the totality check when variants are added.

## Rules

- The Javadoc contract is what you _promise_, not what the code happens to do. If the
  implementation returns a sorted list by accident, and sortedness is not promised, a
  caller relying on it is wrong — but only if the Javadoc said so. Document `@param`
  constraints, `@throws` conditions, and `null`-ness of parameters and return.
- Overrides may **weaken preconditions** (accept more) and **strengthen postconditions**
  (promise more), never the reverse. An override that throws where the supertype's
  contract accepted, returns null where the supertype promised non-null, or narrows
  accepted states, breaks every caller programmed against the supertype — it compiles;
  only contract review catches it.
- `assert` runs only under `-ea` and is for the code's own promises: postconditions,
  unreachable branches, loop invariants. A precondition on data from another component
  is validation and must throw unconditionally. If an `assert` guards input, either
  promote it to a throw or delete it — as it stands it is a comment that sometimes runs.
- An enforced invariant may not also be "handled": code that both validates
  `quantity > 0` at construction and defends against `quantity <= 0` downstream is
  telling readers the invariant cannot be trusted. The one exception is a documented
  belt-and-braces check before an irreversible write in long-lived-state systems —
  java-defensive-programming's trust-boundaries reference covers it.
- New methods are new contracts: a stricter requirement in a _new_ method on a subtype
  is fine; the rules above bind only overrides of an inherited contract.

## References

- [Contracts in Java 25](references/contracts-in-java.md) — the contract-element →
  language-mechanism mapping table, Javadoc conventions, behavioural-subtyping
  violations in concrete Java, detection heuristics and false positives. Read when
  reviewing an API or an override.
- [Worked example: from implicit to explicit](references/explicit-contract-example.md)
  — a stock-reservation class whose invariants lived in callers' heads, made explicit
  via types, checks and documented contract. Read when applying the workflow.
