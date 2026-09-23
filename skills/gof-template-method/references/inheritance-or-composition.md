# Inheritance or composition for a template

## The decision table

| Situation                                                        | Choose                            | Because                                                                 |
| ---------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| A framework constructs your class and calls into it              | Template Method (inheritance)     | Only if inherited hooks are the required extension contract             |
| A test base class specifying a contract                          | Template Method                   | Inheriting a specification is exactly the intent                        |
| A stable algorithm, cohesive hooks and explicit extension policy | Either; inheritance is defensible | Coupling is confined and the whole set is visible                       |
| One step varies                                                  | Pass the step in                  | Compare composition unless lifecycle/SPI constraints favor a hook       |
| Variants are open to code you will not see                       | Preserve the supported SPI        | Either design needs a published compatibility policy                    |
| Hooks grow across unrelated responsibilities                     | Composition                       | Subclasses must understand the whole sequence to fill one part          |
| Modules control step forwarding or ordering                      | A pipeline or chain               | Supplying implementations of fixed named steps alone is insufficient    |
| Steps must be reused across unrelated algorithms                 | Compare composition               | Extract useful step behavior while preserving supported inherited roles |

## Rules for the inheritance form

**Use `final` when it enforces the intended extension contract.**

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

Use final when sequence invariance is required. Existing frameworks may deliberately allow
refinement; document permitted override/super-call behavior rather than changing it blindly.

**Hooks are the smallest surface the algorithm needs.** Every `protected` member is API for every
future subclass: its signature, its contract, and the point at which it is called all become
things you cannot change without breaking code you may not own. Prefer `private final` for
everything that is not a genuine variation point.

**Hook kinds, named explicitly:**

```java
protected abstract Batch load(RunContext ctx);      // required — subclass must supply
protected void beforeSettle(Batch b) { }            // optional — safe no-op default
protected boolean shouldRetry(Failure f) {          // policy — a default worth overriding
    return false;                                 // retry needs explicit operation/budget policy
}
```

Documenting which is which prevents the two common errors: overriding a required hook with a
throw ("this variant does not load"), and forgetting an optional one because nothing said it was
optional.
The policy hook may permit retries only under the actual effect, prior-attempt outcome and
remaining-budget contract. A transient label alone is not proof that repeating a
whole run is safe; reuse the existing resilience owner.

**No constructor calls a hook.**

```java
public abstract class SettlementRun {
    private final Batch batch;
    protected SettlementRun() { this.batch = load(); }   // runs before the subclass initialises
}
```

In this Java 17 construction shape, `load()` runs before the subclass's field initialisers and
can observe default values; it can also throw or leak the incomplete object. Move the call to a
defined post-construction lifecycle or pass an already initialized value. An injected callback
that still accesses the incomplete subclass does not remove the hazard.

**Keep invariant work out of new hook callers; preserve existing `super` contracts.**

```java
protected void beforeSettle(Batch b) {
    super.beforeSettle(b);      // "you must call this" — and one subclass will not
    ...
}
```

For a new or compatibly migrated API, the base can perform its own work around the hook:

```java
private void settlePhase(Batch b) {
    prepareForSettlement(b);    // base's own work, private and final
    beforeSettle(b);            // the hook
}
```

Do not remove a published `super` requirement before supported subclasses and lifecycle tests
are accounted for; the replacement must preserve observable order and failure behavior.

**Define ownership of mutable state between hooks.** A field written by `load` and read by
`record` couples subclasses to representation. Confinement or a correct whole-run protocol may
be adequate; concurrent or reentrant runs need isolation. A per-run context is one option;
shared step instances and collaborators must still support their actual use.

Whole-run `synchronized` does not prevent same-thread reentry: a hook can call `run` again,
replace the shared batch with the nested run's batch, then return to an outer `record` that reads
the wrong batch. Java monitors are reentrant ([JLS 17 §17.1](https://docs.oracle.com/javase/specs/jls/se17/html/jls-17.html#jls-17.1)).
Single-thread confinement or one `ThreadLocal` value does not by itself isolate nested invocations.

If nested runs are supported, carry distinct invocation state through hooks and verify that
collaborators preserve that isolation. If the supported contract forbids reentry, reject it before
the nested call mutates state or performs effects; release the guard in `finally`. Introducing that
rejection into an existing extension API requires a compatibility decision. Test with a hook that
reenters the same instance: either both invocations retain their own data or the nested call fails
before effects, and a later permitted call still works after a failure.

## Migrating to composition

A conversion to consider when its consumer and maintenance benefits justify migration. Keep
the existing design when adequate; existing collaborator types may already provide the seam.

1. **Inventory override/self-use contracts and characterize behavior.** Final/private changes
   can break supported subclasses. Narrow visibility only after callers migrate or a compatible
   extension adapter exists.
2. **Reuse or introduce a cohesive step contract** and an adapter that delegates to existing
   hooks. Characterize arguments, order, visibility, identity, exceptions and resource ownership;
   delegation alone does not establish equivalent behavior.
3. **Move internal orchestration into a composed class** where useful. A supported abstract base
   can retain its type, methods and hooks while delegating; do not discard superclass behavior
   or expose protected hooks publicly merely to implement a new interface.
4. **Convert eligible variants**, one at a time, checking both ordinary and failure paths.
   Retain the inherited entry point for consumers whose extension contract requires it.
5. **Delete the abstract base** when local and supported external subclasses are migrated;
   local compilation alone cannot establish binary/plugin compatibility.

```java
// after
public final class SettlementRun {
    private final SettlementSteps steps;

    public SettlementRun(SettlementSteps steps) { this.steps = Objects.requireNonNull(steps); }

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

Choose by call-site clarity and cohesion: independent functions can be enough; related operations
may deserve a named contract. Parameter count alone does not decide.

## What composition loses

Two things, and both are real:

- **Inherited self-use changes into collaborator calls.** A Steps implementation can still
  coordinate several operations and private helpers; preserve call order, lifetime and errors.
- **Framework integration.** Inspect actual registration/injection seams. Preserve required
  inherited hooks, but framework ownership alone does not make composition unavailable.

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

When base and test subclasses are released together, compatibility is easier to coordinate.
Shared fixtures, lifecycle hooks and weak assertions can still break inherited contract tests.
