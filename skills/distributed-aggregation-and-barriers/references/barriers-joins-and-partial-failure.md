# Barriers, joins and partial failure

## What a barrier costs

A barrier is a point every participant must reach before any may pass. Its cost is not the
average task duration; it is the **maximum over participants**, so the stage inherits the
whole right tail of the task-duration distribution. `scatter-gather` owns this arithmetic
for a fan-out inside one request; the batch version differs only in scale and in the fact
that a batch stage usually has far more participants.

Two consequences that decide job design:

- **Adding workers stops helping once one task dominates.** Splitting 10,000 tasks across
  200 workers instead of 100 halves the mean but does nothing to the slowest task, so the
  stage time converges to that task's duration. Measure the per-task duration distribution;
  if p99 is many times p50, the fix is in the partitioning, not the worker count.
- **Every barrier multiplies.** A pipeline of five barriered stages pays max-of-N five
  times. Removing one barrier is usually worth more than any tuning inside a stage — so for
  each barrier, ask what would actually break if the next stage started consuming results
  as they arrived.

## Straggler mitigation, in order of cost

1. **Partition by cost, not by count.** Equal task counts assume equal task costs; when key
   sizes span orders of magnitude that assumption manufactures a straggler on every run.
   Size partitions by bytes, row counts or a previous run's duration per key. This is the
   only mitigation that removes the problem rather than covering it, and it is the cheapest.
2. **Split the heavy key.** A single key too large for one task needs a two-phase reduce:
   salt the key into `k` sub-keys, aggregate each, then combine — which requires the
   combining function to be associative and commutative anyway. The read-side cost of
   salting and the rest of the skew repertoire are `hot-partitions-and-rebalancing`.
3. **Speculative re-execution.** Start a duplicate of a task running far beyond the
   distribution and take whichever finishes first. Only safe when **the task is idempotent
   and has no external side effect** (`idempotency`) and only the first result is committed;
   a speculative copy of a task that writes to a database or posts to an API applies the
   effect twice. Cap the speculative fraction — uncapped speculation adds load exactly when
   the cluster is already the constraint.
4. **Blacklist the node.** Repeated stragglers on one host are usually a failing disk or a
   noisy neighbour rather than a data property. Check per-host straggler counts before
   redesigning the partitioning.

## The two join shapes

|                     | Broadcast (replicated) join                                                                                             | Shuffle (repartition) join                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Mechanism           | Ship the small side to every worker; each streams its slice of the large side against an in-memory map                  | Repartition **both** sides by the join key so matching rows meet on one worker |
| Selecting condition | The small side fits in each worker's heap **alongside its working set**, measured                                       | Both sides are large enough that neither fits                                  |
| Network cost        | small × workers                                                                                                         | both sides, once                                                               |
| Barrier             | none needed on the large side                                                                                           | full shuffle: a barrier by construction                                        |
| Fails when          | The "small" side grows — a lookup table that was 40 MB last year and is 4 GB now, producing OOM on every worker at once | The join key is skewed                                                         |

**Skew is the shuffle join's characteristic failure.** If 40% of rows carry one key, one
worker receives 40% of the data and the stage runs at that worker's speed no matter how
large the cluster is. The symptom is one task's duration far outside the distribution while
every other task finished long ago. Detect it by counting rows per join key on a sample
before the join, not by watching the job.

If one side is skewed and small enough per-key, a hybrid works: broadcast-join the few hot
keys and shuffle-join the rest.

## Checkpointing

Checkpoint so a failure costs the work since the last checkpoint rather than the whole job.
Three rules that are cheap to get right and expensive to get wrong:

- **Write, then rename.** A checkpoint read while half-written yields a plausible wrong
  answer. Write to a temporary path and rename atomically; a restart then either sees the
  previous checkpoint or the complete new one.
- **Set the interval from the restart cost**, not from a round number. If a checkpoint costs
  more time than the mean time between failures, the job spends its life checkpointing and
  never finishes.
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
- each task is idempotent (idempotency), so re-running one cannot double-apply; a task that
  appends to shared output or increments a counter is not
- the failures are independent rather than a signal about the whole input — three failures
  on three hosts is a retry, 3,000 failures is a bug
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

Three assertions carry the test: the partial run is **labelled** partial, the missing work
is **named**, and the resumed total equals the clean-run total **exactly**. The last one is
what catches a task whose retry double-counted, which no status field would reveal. Add a
second case that fails the same task on every attempt and assert the job stops with the
failure surfaced rather than looping forever.
