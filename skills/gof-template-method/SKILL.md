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

The pattern's cost is the strongest coupling Java offers. A subclass depends not only on the base
class's contract but on its self-use: which hooks are called, in what order, with what state
already established, and whether calling `super` is required. None of that is checked by the
compiler and most of it is undocumented. Prefer composition unless one of the narrow cases below
applies.

## When it is the answer

```text
A framework instantiates your class and calls into it
        → Template Method. There is no seam at which collaborators
          could have been injected. HttpServlet, AbstractProcessor,
          JUnit extensions, AbstractRoutingDataSource.

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
- **Subclasses override the template method itself.** Then there is no template; there are N
  algorithms sharing a superclass.
- **Steps are contributed by different modules.** That is a pipeline or a chain
  (`gof-chain-of-responsibility`).

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

The composed version is `final`, constructible in a test with lambdas, free of self-use questions,
and lets one step be reused across otherwise unrelated jobs. It costs one extra type and loses
the ability for a variant to override several steps as a coherent unit — which is the one thing
worth keeping the hierarchy for.

A middle position that works well: keep the template as a `final` class with a `final` method, and
take the steps as constructor parameters. The sequence stays in one place, the variation is
composed, and nothing is inheritable.

## Decision rules

```text
IF the template sequence must be invariant
THEN make the template method final. If subclasses may refine the sequence, document
     allowed override/super-call behavior and test it as public extension API.

IF the constructor calls a hook
THEN it runs before the subclass's fields are initialised, so the hook
     sees nulls and defaults. Never call an overridable method from a
     constructor (java-composition-over-inheritance).

IF a hook is protected
THEN it is API for every present and future subclass; changing its
     signature, its contract or when it is called is a breaking change.
     Keep the surface as small as the algorithm allows.

IF a hook must call super.hook() at a particular point
THEN the base's algorithm has leaked into every subclass and forgetting
     the call is a silent bug. Restructure so the base calls two hooks
     instead.

IF a subclass overrides a hook to do nothing or throw unsupported
THEN distinguish an intentional optional hook (prefer a documented base no-op) from a
     required step the subtype cannot honor, which violates substitutability.

IF the base class holds mutable state between hook calls
THEN define instance confinement/lifetime and what subclasses may observe. A per-run
     instance can be safe; a shared instance needs synchronization or, preferably,
     a per-run context passed through hooks.

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
  keeps between hook calls — a field set by `read()` and used by `write()` is a race, and it is
  invisible because each method looks correct alone. Pass a per-run context object through the
  hooks so the algorithm holds no mutable state; then one instance can serve every thread
  (`java-memory-model`).
- **Distribution.** Templates commonly wrap batch and ETL runs where a step calls a remote system.
  The base class must then own the parts subclasses cannot get right individually: a deadline for
  the run, a per-step timeout, a failure classification that decides whether the run retries or
  stops, and an explicit answer to "what does a half-finished run leave behind" — a partially
  written output, an advanced cursor, an emitted event (`idempotency`, `retries-and-backoff`).
- **Performance.** Hook dispatch is usually minor but should not be declared free in a measured hot
  loop. The cost worth watching is structural: a
  template that calls a hook once per record turns a per-record cost into the run's cost, and a
  subclass whose hook opens a connection per call converts a batch into N round trips
  (`orm-behavioral-patterns`).
- **Testing.** With inheritance, testing the algorithm requires a subclass, and testing a subclass
  drags in the base — so tests are written against concrete variants and the invariant sequence is
  never tested directly. With composition, the sequence is testable with lambda steps and each step
  is testable alone. The one place the inheritance form is clearly better for testing is the
  contract test base class, where inheriting a specification is the point
  (`java-test-design`).

## Review checklist

- [ ] The template method is final when sequence invariance is required; otherwise override policy is explicit
- [ ] No constructor calls an overridable hook
- [ ] The hook surface is small, documented, and does not require `super` calls at set points
- [ ] Optional no-op hooks are explicit; required hooks preserve substitutability
- [ ] Mutable cross-hook state is confined, synchronized, or carried in a per-run context
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
  base with six hooks, converted to a final template taking composed steps: what the hooks were
  hiding, the shared-field race, the remote step's timeout, and how the contract test base class
  survived the conversion because it is the case the pattern fits. Read when refactoring.
