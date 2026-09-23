---
name: gof-template-method
description: >
  Template Method in modern Java: fixing an algorithm's skeleton while named steps vary, and the
  inheritance coupling that often makes composition preferable. Covers when final protects the
  sequence, controlled overriding, minimal hook surfaces, the constructor-calls-an-overridable-method trap,
  protected hooks becoming an API you cannot change, when the pattern is genuinely right
  (frameworks that instantiate your subclass, contract test base classes), and how to convert one
  to a class taking its steps as collaborators. Use when an abstract base class with protected
  hooks is proposed, when a base-class change broke subclasses, when a template has grown past a
  handful of hooks, or when subclasses override the template method itself. Does not cover choosing a whole algorithm (gof-strategy), creating the product a
  template needs (gof-factory-method), the general inheritance decision
  (java-composition-over-inheritance), or pipeline stages contributed independently
  (gof-chain-of-responsibility).
---

# Template Method

## Purpose

Write the algorithm once and let named steps vary. The base class owns the sequence — what happens
in what order, what is invariant, what must always run — and subclasses fill in the parts that
legitimately differ.

The pattern couples subclasses to the base's implementation protocol. A subclass depends not only on the base
class's contract but on its self-use: which hooks are called, in what order, with what state
already established, and whether calling `super` is required. None of that is checked by the
compiler. Compare composition against the actual extension and lifecycle contract; retain an
adequate inherited API when changing it would cost more than the improvement warrants.

Inspect compiler release/toolchains, framework construction paths and external subclasses before
changing hooks. Examples are partial Java 17 sketches with domain types/imports omitted; no
preview or dependency upgrade is required. Missing caller evidence leaves API removal conditional.
Start with ordinary calls, a supported subclass and a failing/misused run: inspect hook order,
observable state, required `super` calls and who owns cleanup. Reuse existing evidence and ask
only unresolved questions that change the choice or compatibility boundary.

## When it is the answer

```text
A framework exposes an inherited algorithm with overridable steps
        → retain its required Template Method contract. Inspect injection/registration
          options; framework construction alone does not exclude composition.

A test base class specifying a contract every implementation must
satisfy
        → Template Method, and it is clearly right: the subclass
          supplies a value and inherits a specification.

A genuinely stable algorithm with cohesive variants
that share substantial state
        → Template Method with documented hooks and an explicit
          extension policy. Still compare composition.
```

## When it is not

- **One step varies and no inheritance/framework constraint exists.** Passing a function is often
  cheaper, while a template can still be justified to protect lifecycle or invariants
  (`gof-strategy`).
- **The variants are open without a compatibility policy.** Open extension is a legitimate
  framework use of Template Method, but hook call order and self-use become published API.
- **The hook surface is growing across unrelated concerns.** This suggests coordination or
  optional-feature pressure; use cohesion and subclass complexity rather than a numeric cutoff.
- **Subclasses override the template method itself.** Inspect whether this violates a required
  invariant or follows a documented extension policy; overriding alone does not settle the issue.
- **Modules control forwarding, skipping or ordering steps.** Consider a pipeline or chain
  (`gof-chain-of-responsibility`). Modules supplying implementations of fixed named steps alone
  do not require changing the template's sequence.

## Modern Java expression

```text
Classical                            Composition
───────────────────────────────────  ───────────────────────────────────
abstract class Job {                 final class Job {
  final void run() {                   private final Steps steps;
    var in = read();                   void run() {
    process(in);                         var in = steps.read();
    write();                             steps.process(in);
  }                                      steps.write();
  protected abstract Input read();     }
  protected abstract void process(  }
      Input in);
}                                    interface Steps { … }   — or a record
                                     of function values, or three
class CsvJob extends Job { }         parameters to the constructor
```

The composed version lets steps be tested and reused independently. Multi-method Steps still
needs an implementation; separate functional collaborators can use lambdas. A Steps implementation
can coordinate several operations with private helpers, but call order/lifetime remain contracts.

Where callers do not require the inherited type or hooks, a `final` class taking steps as
constructor parameters preserves a fixed sequence with composed variation. Otherwise retain the
supported base and consider delegation behind it; finalizing an existing API is a compatibility
change, not a prerequisite for improving its internals.

## Decision rules

```text
IF the template sequence must be invariant
THEN use final for a new or compatibly migrated API. If subclasses may refine the sequence, document
     allowed override/super-call behavior and test it as public extension API.

IF the constructor calls a hook
THEN it may read subclass state before initialization. Avoid overridable calls from a
     constructor (java-composition-over-inheritance).

IF a hook is protected
THEN it is API for every present and future subclass; changing its
     signature, its contract or when it is called is a breaking change.
     Keep the surface as small as the algorithm allows.

IF a hook must call super.hook() at a particular point
THEN omission can violate the lifecycle contract. For a new API, keep invariant work in
     the base around a hook; for a supported API, preserve super-call timing until a
     compatible migration is established.

IF a subclass overrides a hook to do nothing or throw unsupported
THEN distinguish an intentional optional hook (prefer a documented base no-op) from a
     required step the subtype cannot honor, which violates substitutability.

IF the base class holds mutable state between hook calls
THEN define instance lifetime, concurrency and reentrancy contracts. Synchronization
     can serialize other threads but permits same-thread reentry; isolate invocation
     state or reject reentry before effects when the supported contract permits it.

IF only one known variant exists
THEN seek a concrete framework/SPI/lifecycle reason for the hook. Otherwise write the
     algorithm directly and extract variation when it becomes real.

IF a step is remote
THEN the template must honor the run's deadline and define partial-run semantics;
     transport timeouts may belong to the client and retry classification to an
     explicit resilience policy (timeouts-and-deadlines).
```

## Cross-cutting checks

- **Concurrency.** A template instance shared across threads shares whatever state the base class
  keeps between hook calls — overlapping unsynchronized runs can race through a field set by
  `read()` and used by `write()`. A hook can also reenter a synchronized template on the same
  thread and overwrite the outer run's fields. Pass a distinct per-invocation context through the
  hooks to isolate run data; also verify steps, audit/client collaborators and escaping callbacks
  before sharing the template instance
  (`java-memory-model`).
- **Distribution.** Templates commonly wrap batch and ETL runs where a step calls a remote system.
  Honor the run's deadline and existing client/resilience ownership: transport timers and retries
  may already implement a shared budget. A transient failure alone does not authorize a safe
  whole-run retry. Define "what does a half-finished run leave behind" — a partially
  written output, an advanced cursor, an emitted event (`idempotency`, `retries-and-backoff`).
- **Performance.** Hook dispatch is usually minor but should not be declared free in a measured hot
  loop. The cost worth watching is structural: a
  template that calls a hook once per record turns a per-record cost into the run's cost, and a
  subclass whose hook opens a connection per call converts a batch into N round trips
  (`orm-behavioral-patterns`).
- **Testing.** With inheritance, testing the algorithm requires a subclass, and testing a subclass
  drags in the base. The invariant sequence
  can be tested directly with a purpose-built test subclass. Composition permits independent step
  tests. Contract test bases are also useful when their fixture lifecycle and inherited assertions
  fit the implementations
  (`java-test-design`).

## Review checklist

Return the invariant sequence, hook contracts/ownership, failure and cleanup paths, proposed
change or reason to retain inheritance, and checks executed versus pending.

- [ ] Sequence invariance and supported override policy are explicit; finalization preserves caller compatibility
- [ ] No constructor calls an overridable hook
- [ ] The hook surface is cohesive and documented; required `super` calls are preserved or compatibly migrated
- [ ] Optional no-op hooks are explicit; required hooks preserve substitutability
- [ ] Mutable cross-hook state follows explicit concurrency and reentrancy contracts
- [ ] Multiple variants or a concrete framework/SPI extension constraint exists
- [ ] Remote deadline, transport timeout and resilience ownership are explicit
- [ ] A partial run's effects are defined
- [ ] Composition was considered, and the reason for inheritance is stated

## References

- [Inheritance or composition](references/inheritance-or-composition.md) — the decision table, the
  `final` and hook-design rules, the constructor trap, `super`-call coupling, the cases where the
  hierarchy genuinely wins, and a step-by-step migration to composed steps. Read before adding or
  removing a template hierarchy.
- [Worked example](references/worked-example.md) — a nightly settlement run built as an abstract
  base with seven overridable methods, converted to a final template taking composed steps: what the hooks were
  hiding, the shared-field race, the remote step's timeout, and how the contract test base class
  survived the conversion because it is the case the pattern fits. Read when refactoring.
