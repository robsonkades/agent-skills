---
name: gof-template-method
description: >
  Template Method in modern Java: fixing an algorithm's skeleton while named steps vary, and the
  inheritance coupling that makes composition the better default. Covers why the template method
  must be final and the hook surface minimal, the constructor-calls-an-overridable-method trap,
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

A genuinely stable algorithm with a small, closed set of variants
that share substantial state
        → Template Method with a final template and 2–3 documented
          hooks. Justifiable; still weigh composition.
```

## When it is not

- **One step varies.** Pass that step in. A hierarchy for one function is the heaviest possible
  expression of "this varies" (`gof-strategy`).
- **The variants are open.** Anyone may subclass, so every base-class change is an unreviewed
  change to code you cannot see.
- **The hook count is growing.** Five or more hooks means the "algorithm" is really a coordination
  problem, and subclasses must understand the whole sequence to implement any part of it.
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
IF the template method is not final
THEN a subclass can replace the algorithm, and the pattern's only
     guarantee — that the sequence is fixed — is gone.

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

IF a subclass overrides a hook to do nothing or to throw
THEN it does not fit the template. Either the hook should have a
     no-op default, or the hierarchy is wrong.

IF the base class holds mutable state between hook calls
THEN a shared instance is not thread-safe, and subclasses depend on
     representation rather than contract. Pass a context through the
     hooks instead.

IF only one variant exists
THEN there is no template. Write the algorithm.

IF a step is remote
THEN the template owns its timeout, its failure classification and
     what a partial run means (timeouts-and-deadlines).
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
- **Performance.** Virtual calls per hook, which is noise. The cost worth watching is structural: a
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

- [ ] The template method is `final`
- [ ] No constructor calls an overridable hook
- [ ] The hook surface is small, documented, and does not require `super` calls at set points
- [ ] No subclass overrides a hook to do nothing or to throw
- [ ] The base class holds no mutable state between hook calls
- [ ] More than one variant exists
- [ ] A remote step's timeout and failure classification live in the template
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
