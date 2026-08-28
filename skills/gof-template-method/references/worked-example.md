# Worked example: a nightly settlement run

Three variants — card settlement, direct debit, and an internal ledger sweep — shared a sequence:
load a batch, validate it, call a settlement provider, record results, emit a report.

## Before — an abstract base with six hooks

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

Six hooks, two of them optional, a mutable `batch` field, and a non-final `run`. Three defects
followed from that shape.

**One subclass overrode `run`.** The ledger sweep needed no provider call, so it replaced the
template method entirely — the sequence guarantee was gone and nobody noticed for a year. When a
mandatory audit step was added to `run`, the ledger sweep silently did not get it.

**`validate()` and `settle()` communicated through the field.** `validate` filtered `batch` in
place; `settle` read it. A change to `validate` that returned early left `settle` operating on
unvalidated rows.

**The shared instance was not thread-safe.** When two dates were reprocessed concurrently during a
backfill, the two runs shared one `batch` field. The result was a settlement file containing rows
from both dates — discovered by reconciliation, three days later.

## After — a final template taking composed steps

```java
public final class SettlementRun {

    private final SettlementSteps steps;
    private final AuditLog audit;
    private final Clock clock;

    public RunReport run(LocalDate date, Deadline deadline) {
        var context = new RunContext(date, RunId.newId(), clock.instant(), deadline);
        audit.runStarted(context);

        var batch = steps.load(context);
        var validated = steps.validate(batch, context);        // returns; does not mutate
        var results = steps.settle(validated, context);
        steps.record(results, context);

        var report = RunReport.of(results, context);
        audit.runFinished(context, report);                    // cannot be skipped by a variant
        return report;
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

- **`final` class, no inheritance.** No variant can replace the sequence, so the audit calls are
  guaranteed. The ledger sweep's "no provider call" became a `SettlementSteps` implementation whose
  `settle` returns results directly — expressed in a step rather than by discarding the algorithm.
- **State flows through parameters and return types.** `validate` returns a `ValidatedBatch`, which
  `settle` requires. The type system now enforces the order: settling an unvalidated batch does not
  compile.
- **`RunContext` per run.** No fields, so one `SettlementRun` bean serves concurrent backfills
  safely. The cross-date contamination is not merely fixed but unrepresentable.
- **Optional hooks disappeared.** `beforeSettle` and `afterRun` were used by one variant each; both
  became part of that variant's `settle` and `record`. A hook existing for one implementation is
  usually a sign the sequence belongs to that implementation.

## The remote step's failure semantics

`settle` calls a provider. The template owns what individual steps cannot decide alone:

```java
public RunReport run(LocalDate date, Deadline deadline) {
    ...
    Results results;
    try {
        results = steps.settle(validated, context);
    } catch (SettlementUnavailable e) {                 // transient
        audit.runAbandoned(context, e);
        throw new RunAbandoned(context.runId(), e);     // the scheduler retries the whole run
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
  settle      provider-side effects, keyed by RunId so a retry is
              deduplicated by the provider (idempotency)
  record      written in one transaction with the run's status row, so
              a crash before commit leaves the run re-runnable
```

Making `RunId` the provider's idempotency key is what allows the scheduler to retry the whole run
safely. Without it, a run that failed after settling half the batch would double-settle on retry —
the failure that makes people afraid to retry anything.

## Migration, step by step

The conversion ran over four merges, each independently reviewable:

1. **`run` made `final`**, which immediately broke the ledger sweep's override — surfacing the
   defect rather than hiding it. That variant was given a temporary no-op `settle` step.
2. **`SettlementSteps` introduced**, with the abstract base implementing it by delegating to its
   own hooks. Behaviour identical; nothing else changed.
3. **Variants converted one at a time.** Each became independently testable at the moment it was
   converted, which is what kept the work moving.
4. **The abstract base deleted**, along with `protected Batch batch`.

Step 1 is worth doing on its own even if the rest never happens: it costs nothing and it reveals
every place where a subclass has quietly taken over the algorithm.

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

class CardSettlementStepsTest extends SettlementStepsContractTest { }
class DirectDebitSettlementStepsTest extends SettlementStepsContractTest { }
class LedgerSweepStepsTest extends SettlementStepsContractTest { }
```

The subclass supplies a value and inherits a specification, base and subclasses live in one module
and are released together, and the base's self-use is the point. The test methods are `final`
because a variant "fixing" a contract test would remove the guarantee the base exists to provide.

The first test in that list encodes the second defect from the original design: `validate` must not
mutate. It was written the day the bug was found, and it is inherited by every future variant —
which is what makes it worth more than a fix in one class.
