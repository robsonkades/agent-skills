# Inheritance or composition for a template

## The decision table

| Situation                                                       | Choose                            | Because                                                        |
| --------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| A framework constructs your class and calls into it             | Template Method (inheritance)     | There is no injection point; the framework owns construction   |
| A test base class specifying a contract                         | Template Method                   | Inheriting a specification is exactly the intent               |
| A stable algorithm, 2–3 hooks, closed variant set, shared state | Either; inheritance is defensible | Coupling is confined and the whole set is visible              |
| One step varies                                                 | Pass the step in                  | A hierarchy for one function is the heaviest expression        |
| Variants are open to code you will not see                      | Composition                       | Every base change is an unreviewed change to strangers' code   |
| Hooks are growing past four                                     | Composition                       | Subclasses must understand the whole sequence to fill one part |
| Steps come from different modules                               | A pipeline or chain               | The template's fixed sequence is not the constraint you have   |
| Steps must be reused across unrelated algorithms                | Composition                       | A step trapped in a hierarchy cannot be shared                 |

## Rules for the inheritance form

**The template method is `final`.**

```java
public abstract class SettlementRun {
    public final RunReport run(RunContext context) {     // final: the sequence is the guarantee
        var batch = load(context);
        var settled = settle(batch, context);
        record(settled, context);
        return report(settled);
    }
    protected abstract Batch load(RunContext context);
}
```

Without `final`, a subclass can replace the algorithm, and the one thing the pattern promised — an
invariant sequence — is no longer true anywhere.

**Hooks are the smallest surface the algorithm needs.** Every `protected` member is API for every
future subclass: its signature, its contract, and the point at which it is called all become
things you cannot change without breaking code you may not own. Prefer `private final` for
everything that is not a genuine variation point.

**Hook kinds, named explicitly:**

```java
protected abstract Batch load(RunContext ctx);      // required — subclass must supply
protected void beforeSettle(Batch b) { }            // optional — safe no-op default
protected boolean shouldRetry(Failure f) {          // policy — a default worth overriding
    return f.isTransient();
}
```

Documenting which is which prevents the two common errors: overriding a required hook with a
throw ("this variant does not load"), and forgetting an optional one because nothing said it was
optional.

**No constructor calls a hook.**

```java
public abstract class SettlementRun {
    private final Batch batch;
    protected SettlementRun() { this.batch = load(); }   // runs before the subclass initialises
}
```

`load()` executes before the subclass's field initialisers, so it sees `null`s and zeroes. The
failure is silent. Move the call into the template method or take the value as a constructor
parameter.

**No `super.hook()` requirement.**

```java
protected void beforeSettle(Batch b) {
    super.beforeSettle(b);      // "you must call this" — and one subclass will not
    ...
}
```

If the base needs work done around a hook, it should call two hooks itself:

```java
private void settlePhase(Batch b) {
    prepareForSettlement(b);    // base's own work, private and final
    beforeSettle(b);            // the hook
}
```

**No mutable state between hooks.** A field written by `load` and read by `record` couples
subclasses to representation and makes a shared instance unsafe. Pass a context object through the
hooks; then the template is stateless and one instance serves every thread.

## Migrating to composition

A five-step conversion that keeps each commit reviewable.

1. **Make the template method `final` and the base class's own helpers `private`.** This is often
   enough to reveal how many subclasses were relying on things they should not.
2. **Introduce a `Steps` interface** with one method per hook, and an adapter that delegates to
   the existing abstract methods. Nothing changes behaviourally.
3. **Move the template method into a new `final` class** that takes `Steps` in its constructor.
   The abstract base becomes a thin subclass of nothing, delegating.
4. **Convert subclasses into `Steps` implementations**, one at a time. Each conversion makes that
   variant independently testable, which is the incentive that keeps the migration moving.
5. **Delete the abstract base** when no subclass remains.

```java
// after
public final class SettlementRun {
    private final SettlementSteps steps;

    public RunReport run(RunContext context) {
        var batch = steps.load(context);
        var settled = steps.settle(batch, context);
        steps.record(settled, context);
        return RunReport.of(settled);
    }
}
```

Where the step set is small, skip the interface and take function values:

```java
public SettlementRun(Function<RunContext, Batch> load,
                     BiFunction<Batch, RunContext, Settled> settle,
                     BiConsumer<Settled, RunContext> record) { }
```

Readable at three or four steps; past that the parameter list stops carrying its own meaning and a
named interface or a record of functions is better.

## What composition loses

Two things, and both are real:

- **A variant can no longer override several steps as a coherent unit** with shared private
  helpers. If two hooks in a variant genuinely share logic, a `Steps` implementation can hold it —
  so this is usually recoverable, but it is one indirection away rather than inherited.
- **Framework integration.** When the framework constructs the object, there is nowhere to pass
  the steps. That is the case Template Method exists for, and it should not be converted.

## Where the hierarchy is clearly right: contract tests

```java
abstract class ChannelContractTest {
    protected abstract Channel channel();          // the hook

    @Test final void rejects_an_oversized_payload() { ... }
    @Test final void is_safe_for_concurrent_use() { ... }
}
```

The subclass supplies a value and inherits a specification; the base owns the sequence and the
assertions; nobody is expected to override the tests. Marking the test methods `final` makes that
explicit — a subclass that overrides a contract test to "fix" it has removed the guarantee the
base class exists to provide.

This is the one place where the fragile-base-class argument does not apply: base and subclasses
are in the same module, released together, and the base's self-use is the entire point.
