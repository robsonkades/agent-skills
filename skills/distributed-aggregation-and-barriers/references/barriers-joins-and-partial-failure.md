# Barriers, joins and partial failure

## What a barrier costs

A barrier is a point every participant must reach before any may pass. Its cost is not the
average task duration; it waits for the **latest required arrival**, so the stage inherits the
whole right tail of the task-duration distribution. `scatter-gather` owns this arithmetic
for a fan-out inside one request; the batch version differs only in scale and in the fact
that a batch stage usually has far more participants.

Two consequences that decide job design:

- **Adding workers stops helping once one task dominates.** Splitting 10,000 tasks across
  200 workers instead of 100 can reduce queue waves, but need not halve task duration or stage
  time. The longest task and total work divided by usable parallel capacity are lower bounds
  under ideal scheduling; startup, exchange, retries and contention add costs. Measure queued
  versus running time and actual completions before selecting partitioning or capacity changes.
- **Barrier tails compose.** A pipeline of five barriered stages pays a maximum-of-tasks at
  each stage, though their costs add rather than literally multiply. For each barrier, ask
  what correctness property would break if the next stage consumed committed results
  incrementally.

Define barrier identity by job/stage epoch and the expected logical participant set. Count one
committed arrival per participant, reject old-epoch/duplicate arrivals, and persist enough state
for coordinator recovery. A failed worker must trigger a bounded retry, abort or explicitly
partial release policy; silence is not completion. Membership changes require an explicit new
epoch or engine protocol. Test a late completion from an old attempt after recovery.

## Straggler mitigation, in order of cost

1. **Partition by cost, not by count.** Equal task counts assume equal task costs; when key
   sizes span orders of magnitude that assumption manufactures a straggler on every run.
   Size partitions by bytes, row counts or a previous run's duration per key. This attacks
   deterministic data skew, but not host faults, transient contention or input-dependent
   algorithmic cost.
2. **Split the heavy key.** A single key too large for one task needs a two-phase reduce:
   salt the key into `k` sub-keys, aggregate each, then combine — which requires the
   combining function to be associative and commutative anyway. The read-side cost of
   salting and the rest of the skew repertoire are `hot-partitions-and-rebalancing`.
3. **Speculative re-execution.** Start a duplicate of a task running far beyond the
   distribution, preserving the input snapshot and required result equivalence. Atomically
   select one output by logical task identity, not by completion timing alone. External effects
   must be absent or independently retry-safe (`idempotency`): an enforced idempotency,
   fencing or transaction protocol must cover each effect across concurrent attempts and late
   arrivals. Selecting one aggregate output does not provide that protection. Cancelling the
   losing attempt does not prove it stopped or released downstream resources; retain ownership
   and account for residual work until the resource contract confirms release. Cap speculative
   load — correlated storage/network slowness may make every copy slow and worsen the bottleneck.
4. **Blacklist the node.** Repeated stragglers on one host are usually a failing disk or a
   noisy neighbour rather than a data property. Check per-host straggler counts before
   redesigning the partitioning.

## The two join shapes

|                     | Broadcast (replicated) join                                                                                             | Shuffle (repartition) join                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Mechanism           | Ship the small side to every worker; each streams its slice of the large side against an in-memory map                  | Repartition **both** sides by the join key so matching rows meet on one worker |
| Selecting condition | The small side fits in each worker's heap **alongside its working set**, measured                                       | Both sides are large enough that neither fits                                  |
| Network cost        | small × workers                                                                                                         | both sides, once                                                               |
| Synchronisation     | build side must be available before probing unless the engine implements a streaming variant                            | repartition/exchange boundary; pipelining is engine-specific                   |
| Fails when          | The "small" side grows — a lookup table that was 40 MB last year and is 4 GB now, producing OOM on every worker at once | The join key is skewed                                                         |

**Skew is the shuffle join's characteristic failure.** If 40% of rows carry one key, one
logical partition receives that key's matching rows; output cardinality can be much worse
than input skew for many-to-many joins. Detect heavy hitters, null-key policy, bytes and
estimated join expansion before the join, then confirm with per-task shuffle read/write,
spill, memory and duration. Sampling can miss rare heavy keys.

If one side is skewed and small enough per-key, a hybrid works: broadcast-join the few hot
keys and shuffle-join the rest.

## Checkpointing

Checkpoint so a failure costs the work since the last checkpoint rather than the whole job.
Three rules that are cheap to get right and expensive to get wrong:

- **Use a storage-specific commit primitive.** Same-filesystem atomic rename is one option;
  many object stores implement rename as copy/delete. Immutable attempt files plus an atomic
  manifest/pointer, a transactional sink, or the engine's output committer avoids exposing a
  torn checkpoint.
- **Derive the interval from expected cost.** Balance checkpoint duration and interference
  against failure rate and replay work, then measure recovery. High checkpoint cost relative
  to useful work can destroy progress, but no single MTBF inequality proves non-completion.
- **Record what the checkpoint covers** — which partitions, which input offset or watermark.
  A checkpoint that cannot say what is already included is a checkpoint you cannot resume
  from without recomputing to be safe.

## Partial failure: 10,000 tasks, 3 failures

```text
Fail the whole job when:
- the output is only meaningful complete — a financial close, a regulatory submission, an
  input to a downstream job that cannot express incompleteness
- the job is short enough that a full rerun is cheaper than the machinery of resumption
Retry the failed tasks when:
- outputs are staged per logical partition with one selected contribution (or equivalent
  aggregate deduplication), AND external effects are absent or independently retry-safe;
  effect idempotency alone does not prevent duplicate aggregate contributions
- error classification and bounded retry policy justify it; a few failures may be deterministic
  poison data, while thousands can share a recoverable infrastructure cause
- partition outputs commit individually, so a retried task replaces its own output only
Emit a partial result when:
- the consumer's contract can carry an explicit completeness record naming the missing
  partitions, in the output itself and not only in a log
- an approximate answer now genuinely beats an exact answer later for this consumer
Never:
- emit a partial result that looks complete. A total over 9,997 of 10,000 partitions, with
  no marker, is indistinguishable from a real drop in the business and will be treated as
  one. The per-request form of this contract is scatter-gather.
```

## Testing a batch job with an injected failure

```java
@Test
void oneFailedTaskLeavesTheJobResumableAndTheOutputMarked() {
    var runner = new JobRunner(sink, checkpoints);
    runner.failTask(4_217, new IOException("injected"));      // deterministic injection

    JobResult first = runner.run(input);
    assertThat(first.status()).isEqualTo(PARTIAL);
    assertThat(first.missingPartitions()).containsExactly(4_217);   // the completeness record

    runner.clearInjectedFailures();
    JobResult resumed = runner.resumeFrom(checkpoints.latest());
    assertThat(resumed.status()).isEqualTo(COMPLETE);
    assertThat(resumed.total()).isEqualTo(EXPECTED_TOTAL);    // exact: no double-counting
}
```

This is a partial JUnit/AssertJ sketch with application-specific runner/checkpoint fixtures;
it assumes the job contract permits partial results. Three assertions carry the test: the partial run is **labelled** partial, the missing work
is **named**, and the resumed total equals the clean-run total **exactly**. The last one is
what catches a task whose retry double-counted, which no status field would reveal. Add a
second case that fails the same task on every attempt and assert the job stops with the
failure surfaced rather than looping forever.

Add cut points before output flush, after durable attempt output but before manifest commit,
and after commit response loss. Run concurrent duplicate attempts and assert that only one
logical partition contribution becomes visible. Also corrupt/truncate a checkpoint and prove
the reader rejects it rather than accepting a plausible partial state.
