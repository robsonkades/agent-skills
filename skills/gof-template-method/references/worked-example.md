# Worked example: a nightly settlement run

Three variants — card settlement, direct debit, and an internal ledger sweep — shared a sequence:
load a batch, validate it, call a settlement provider, record results, emit a report.

Illustrative scenario, not a measured incident report. Partial Java 17 examples omit domain
types/imports, persistence and provider adapters. The test snippets need existing JUnit/AssertJ
dependencies and fixtures; they are not a standalone test suite.

## Before — an abstract base with seven overridable methods

```java
public abstract class SettlementRun {

    protected Batch batch;              // shared mutable state between hooks
    protected RunReport report;

    public void run(LocalDate date) {   // not final
        batch = load(date);
        validate();
        beforeSettle();
        var results = settle();
        record(results);
        report = report(results);
        afterRun();
    }

    protected abstract Batch load(LocalDate date);
    protected abstract void validate();
    protected void beforeSettle() { }
    protected abstract Results settle();
    protected abstract void record(Results results);
    protected void afterRun() { }
    protected RunReport report(Results r) { return RunReport.of(r); }
}
```

Seven overridable steps (including report), two optional no-op hooks, a mutable `batch` field,
and a non-final `run`. Three defects
followed from that shape.

**One subclass overrode `run`.** The ledger sweep needed no provider call, so it replaced the
template method entirely. If a
mandatory audit step were added to `run`, the ledger sweep would not get it.

**`validate()` and `settle()` communicated through the field.** `validate` filtered `batch` in
place; `settle` read it. A change to `validate` that returned early left `settle` operating on
unvalidated rows.

**The shared instance was not thread-safe.** When two dates were reprocessed concurrently during a
backfill, the two runs could share one `batch` field and contaminate results across dates.

## After — a final template taking composed steps

```java
public final class SettlementRun {

    private final SettlementSteps steps;
    private final AuditLog audit;
    private final Clock clock;

    public SettlementRun(SettlementSteps steps, AuditLog audit, Clock clock) {
        this.steps = Objects.requireNonNull(steps);
        this.audit = Objects.requireNonNull(audit);
        this.clock = Objects.requireNonNull(clock);
    }

    public RunReport run(LocalDate date, RunId logicalRunId, Deadline deadline) {
        var context = new RunContext(date, Objects.requireNonNull(logicalRunId), clock.instant(), deadline);
        audit.runStarted(context);

        try {
            var batch = steps.load(context);
            var validated = steps.validate(batch, context);    // returns; does not mutate
            var results = steps.settle(validated, context);
            steps.record(results, context);

            var report = RunReport.of(results, context);
            audit.runFinished(context, report);                // success path only
            return report;
        } catch (RuntimeException failure) {
            try { audit.runFailed(context, failure); }
            catch (RuntimeException auditFailure) {
                if (auditFailure != failure) failure.addSuppressed(auditFailure);
            }
            throw failure;
        }
    }
}

public interface SettlementSteps {
    Batch load(RunContext context);
    ValidatedBatch validate(Batch batch, RunContext context);
    Results settle(ValidatedBatch batch, RunContext context);
    void record(Results results, RunContext context);
}
```

What each change bought:

- **`final` class, no inheritance.** Variants cannot replace the sequence. Completion audit runs
  only after successful steps; failure audit is attempted without masking the primary exception.
  Neither guarantees a durable audit across process crashes or audit outages. The ledger sweep's
  "no provider call" becomes a `SettlementSteps` implementation whose
  `settle` returns results directly — expressed in a step rather than by discarding the algorithm.
- **State flows through parameters and return types.** `validate` returns a `ValidatedBatch`, which
  `settle` requires. This prevents passing Batch directly, but constructors/factories must protect
  ValidatedBatch invariants; a type name does not prove validation.
- **`RunContext` per run.** Run data no longer occupies template fields. Concurrent safety still
  depends on the shared Steps, AuditLog, Clock and their collaborators and callbacks.
- **Optional hooks disappeared.** `beforeSettle` and `afterRun` were used by one variant each; both
  may become part of variant steps only after checking ordering/failure behavior. Moving afterRun
  into record changes its position relative to reporting, so requires an explicit contract decision.

## The remote step's failure semantics

`settle` calls a provider. The template owns what individual steps cannot decide alone:

```java
public RunReport run(LocalDate date, RunId logicalRunId, Deadline deadline) {
    ...
    Results results;
    try {
        results = steps.settle(validated, context);
    } catch (SettlementUnavailable e) {                 // may include unknown outcome
        audit.runAbandoned(context, e);
        throw new RunAbandoned(context.runId(), e);     // reconcile/retry under provider contract
    } catch (SettlementRejected e) {                    // permanent
        audit.runFailed(context, e);
        throw e;                                        // no retry; a human looks at it
    }
    ...
}
```

And the question a partial run raises is answered explicitly rather than discovered:

```text
What a half-finished run leaves behind
  load        nothing — read only
  validate    nothing — pure
  settle      provider-side effects; stable logical run/batch identity and
              per-item operation keys under an explicit provider dedup contract
  record      written in one transaction with the run's status row, so
              a crash before commit does not undo provider-side effects
```

Persist logicalRunId before the first attempt and reuse it; attempt IDs may differ for telemetry.
Pin the batch membership/payload, use per-item keys when calls settle separate items, and verify
provider scope, retention and payload-binding rules. A fresh ID or changed batch is a new operation.
After timeout or record failure, reconcile unknown/partial provider outcomes; retrying the whole
run is not safe merely because it carries an ID. One local transaction cannot cover the provider.
Provider contracts differ; for example, [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests)
defines payload comparison and key retention. Do not assume that contract for another provider.

The run deadline must be monotonic and propagated to blocking clients; passing Deadline alone
does not enforce it. Resource-owning steps need cleanup on success/failure. The failure sketch is
an alternative policy illustration, not an extra catch layer to paste into the first example.

## Migration, step by step

An illustrative migration plan, after inspecting callers and compatibility:

1. **Characterize run overrides and public contracts.** Move the ledger sweep's behavior into a
   real local settlement step; make run final only once permitted overrides are migrated.
2. **`SettlementSteps` introduced**, with the abstract base implementing it by delegating to its
   own hooks. Behaviour identical; nothing else changed.
3. **Variants converted one at a time.** Each became independently testable at the moment it was
   converted, which is what kept the work moving.
4. **The abstract base deleted**, along with `protected Batch batch`.

Making an externally overridable method final can break source and binary clients. Preserve a
compatibility adapter/deprecation window when external subclasses cannot migrate together.
See [JLS 17 final-method compatibility](https://docs.oracle.com/javase/specs/jls/se17/html/jls-13.html#jls-13.4.17).

## The one hierarchy that stayed

The contract test kept its base class, because that is the case the pattern fits:

```java
abstract class SettlementStepsContractTest {

    protected abstract SettlementSteps steps();
    protected abstract Batch nonEmptyBatch();

    @Test final void validate_is_pure() {
        var batch = nonEmptyBatch();
        var copy = batch.copy();
        steps().validate(batch, aContext());
        assertThat(batch).isEqualTo(copy);              // no in-place mutation, ever again
    }

    @Test final void settle_is_idempotent_for_the_same_run_id() { ... }

    @Test final void record_and_the_run_status_commit_together() { ... }
}

// Concrete test subclasses must implement steps() and nonEmptyBatch() with isolated fixtures.
```

The subclass supplies a value and inherits a specification, base and subclasses live in one module
and are released together, and the base's self-use is the point. The test methods are `final`
because a variant "fixing" a contract test would remove the guarantee the base exists to provide.

The first test in that list encodes the second defect from the original design: `validate` must not
mutate. It requires a deep enough baseline copy and semantic equality covering mutable contents;
inheritance alone cannot establish that those assertions detect all changes.
