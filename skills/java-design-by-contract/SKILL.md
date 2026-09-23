---
name: java-design-by-contract
description: >
  Contracts as the semantics of a Java API, without a contract framework: preconditions,
  postconditions and invariants defined precisely and mapped to Java 25 mechanisms —
  constructor and compact-constructor validation, invariants as types that cannot represent
  invalid states, postconditions via tests and proportionate runtime checks, contracts documented in Javadoc,
  behavioural subtyping (overrides may weaken preconditions and strengthen postconditions,
  never the reverse), and contracts across sealed hierarchies. Use when a class's invariants
  live in its callers' heads, when an override adds a requirement its supertype never made,
  when deciding what @throws to promise, or when assert is guarding public input. Does not
  cover where boundary validation belongs (java-defensive-programming) or LSP in its
  five-principle context (java-solid).
---

# Java Design by Contract

## Purpose

Make what a method requires, guarantees and preserves explicit — in types where
possible, in checks and Javadoc otherwise — instead of leaving it in callers' heads.
The failure modes this skill prevents: invariants enforced by convention until the one
caller who did not know breaks them, Javadoc that describes the current implementation
instead of a promise, and subtype overrides that quietly change the deal.

## Definitions

- **Precondition** — what must hold when a method is called; the _caller's_ obligation under the
  API contract. At an external trust boundary, violation is expected hostile/invalid input, not
  necessarily a programmer bug.
- **Postcondition** — what holds when it returns normally; the _implementation's_
  obligation. Violation is the implementation's bug.
- **Invariant** — what holds about an object between every public operation; established
  by constructors, preserved by every method.

Who can control the condition helps choose the mechanism. The callee checks enforceable
preconditions and reports a stable failure; state conflicts the caller cannot know are explicit
outcomes. Postconditions and invariants are implementation obligations, covered by tests and —
when corruption must not continue — unconditional internal checks, not only disabled assertions.

## Workflow

Java 25 is the authoring baseline, not permission to upgrade a consuming project. Inspect
compiler release/toolchains, runtime, dependencies, mapper behavior and existing caller
contracts first. Records require Java 16+, sealed types Java 17+, pattern switches Java 21+
and flexible constructor bodies Java 25 without preview. Use target-compatible alternatives;
do not add dependencies, upgrade or enable preview for this skill. If evidence is missing,
state the assumed contract and what must be verified before changing it.

1. **Write the contract before touching code**: for the method or class, the
   preconditions, postconditions and invariants in one sentence each. What you cannot
   state, callers are currently guessing.
2. **Use a type when its invariant travels or prevents meaningful misuse**: a validating record
   (`Quantity` that cannot be zero or negative) removes the shape precondition from every
   ordinary construction path. An existing stable entry check may be adequate; weigh consumer
   compatibility and mapping costs before changing signatures. A class invariant is established by construction and preserved
   by operations. Flexible constructor bodies (final in Java 25, JEP 513) can validate arguments
   before `super(...)`; they do not prevent a superclass constructor from publishing `this` or
   invoking overridable methods on a partially initialised subclass.
3. **Enforce remaining preconditions at method entry**, with a stable exception/result contract.
   Include actual values only when they are non-secret, bounded and safe to expose; document
   caller-relevant conditions in Javadoc.
4. **State postconditions as tests.** Add `assert` for cheap diagnostic invariants in controlled
   runs; use an unconditional internal check when continuing could persist corruption, move
   money, cross a security boundary or make recovery harder.
5. **Check subtypes and sealed variants**: every override against the subtyping rules
   below; every sealed hierarchy's variants for their individual contracts, with
   exhaustive `switch` as a source coverage check when consumers are recompiled. A `default`
   or covering type pattern can handle later variants without individual review; judge that
   fallback against the consumer's policy, not the absence of a literal `default`.

## Rules

- Javadoc is a primary contract surface, not the only observed contract. Types, annotations,
  protocols, schemas, tests and long-standing externally visible behavior also shape
  compatibility. Do not promise incidental order, but search consumers before removing behavior
  they may reasonably rely on. Document parameter constraints, caller-relevant failure
  conditions and nullness.
- Overrides may **weaken preconditions** (accept more) and **strengthen postconditions**
  (promise more), never the reverse. Compare permitted outcomes for the same input and state:
  throwing where the supertype requires normal completion, returning null where it promises
  non-null, or rejecting a state it requires accepting violates substitutability. Such changes
  can compile; review the inherited failure policy as well as normal results.
- Assertions are disabled by default and controlled by assertion status (commonly `-ea`/`-da`).
  Public/trust-boundary preconditions and required corruption-prevention checks must enforce
  the failure contract even when assertions are disabled. A side-effect-free assertion of a
  private helper's precondition can remain diagnostic when the owning boundary already
  enforces it. Do not duplicate that guard merely because the helper takes an argument.
- Avoid redundant checks inside one trusted object graph, but revalidate at genuine trust and
  persistence boundaries. Legacy rows, deserializers, reflection, ORM hydration, version skew
  and corruption can bypass the constructor path. A defense before an irreversible write should
  identify which boundary invalidates the earlier proof, not silently duplicate every guard.
- A new subtype method can define its own input preconditions, but must still preserve
  inherited invariants and history constraints (for example, a supertype's promise that
  a value never changes). Being callable only through the subtype does not permit it to
  invalidate observations made through a supertype alias.

## Contract dimensions beyond values

Staff-level review includes effects and execution semantics: whether an operation is idempotent,
atomic, thread-safe, blocking, cancellable, ordered, retry-safe and failure-atomic; ownership of
returned mutable data; and what happens on timeout or partial failure. These are contracts even
when Java's type system cannot express them. State only guarantees the implementation and its
datastore/protocol can actually preserve.

## References

Deliver the affected contract clauses, caller/subtype evidence, chosen enforcement and
executed checks. Test accepted/rejected boundaries and failure-state preservation through
the supertype as well as concrete types; distinguish type checking, runtime checks and
persistence tests. Do not label an unexecuted test plan as proof of correctness.

- [Contracts in Java 25](references/contracts-in-java.md) — the contract-element →
  language-mechanism mapping table, Javadoc conventions, behavioural-subtyping
  violations in concrete Java, detection heuristics and false positives. Read when
  reviewing an API or an override.
- [Worked example: from implicit to explicit](references/explicit-contract-example.md)
  — a stock-reservation class whose invariants lived in callers' heads, made explicit
  via types, checks and documented contract. Read when applying the workflow.
