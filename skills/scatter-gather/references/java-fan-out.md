# Fan-out in Java

On Java 21+, a virtual-thread executor can make blocking leaf clients readable, but it is not
an admission limit and cancellation is not a remote rollback. Keep the executor under
application lifecycle rather than creating it in per-request try-with-resources: since
`ExecutorService.close()` waits for termination, one leaf that ignores interruption can make
scope exit exceed the response deadline.

`StructuredTaskScope` gives stronger lexical ownership, join policies and observability, but
remains preview in JDK 26 (JEP 525). Use it only under the repository's preview-feature policy;
the API changed across previews.

## Result contract

```java
record LeafFailure(String owner, String code) {}

record Gathered<T>(
        List<T> values,
        Set<String> expected,
        Set<String> completedOwners,
        List<LeafFailure> failures,
        String dataWatermark,
        boolean exact) {
    Gathered {
        values = List.copyOf(values);
        expected = Set.copyOf(expected);
        completedOwners = Set.copyOf(completedOwners);
        failures = List.copyOf(failures);
    }
    Set<String> missing() {
        var result = new HashSet<>(expected);
        result.removeAll(completedOwners);
        return Set.copyOf(result);
    }
}
```

`completedOwners` means futures observed by the gather, not proof that the peer responded;
`missing()` means expected owners not observed before cutoff, including not-started work.
Failure codes must distinguish admission rejection, transport ambiguity, remote rejection
and local cancellation. If callers need peer-response identity, record that separately.
Collections are shallow copies; generic values must also have safe ownership.
This owner-bearing record is an internal illustration, not a required public wire format.
Map it to authorized coverage/status or an opaque completeness/reconciliation token where
exposing shard identities would leak topology. A token needs defined integrity, scope and
interpretation; it does not establish exactness merely by being present.

`values.size()` is not completeness. A successful leaf may return zero values, a failed leaf
may respond with an error, and replicas may answer at different data versions. Define whether
the aggregate is exact, stale, a lower bound or otherwise partial; include compatible
snapshot/version watermarks when consistency matters.

## k successful leaves by one deadline

The executor below is owned by a lifecycle-managed component and closed during shutdown. `leafLimit` is a
bulkhead next to the actual scarce dependency; the virtual-thread executor itself is unbounded.

```java
final class QuoteFanOut implements AutoCloseable {
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private final Semaphore leafLimit;
    private final QuoteClient client;

    QuoteFanOut(int maxLeafCalls, QuoteClient client) {
        this.leafLimit = new Semaphore(maxLeafCalls);
        this.client = client;
    }

    Gathered<Quote> quotes(List<Shard> shards, int required, Deadline deadline)
            throws InterruptedException {
        Set<String> expected = shards.stream().map(Shard::id).collect(Collectors.toSet());
        if (expected.size() != shards.size()) {
            throw new IllegalArgumentException("owners must be distinct");
        }
        Deadline leafDeadline = deadline.minusReserve(RETURN_TRIP_RESERVE_NANOS);
        if (required < 1 || required > shards.size()) {
            throw new IllegalArgumentException("required must be in [1, shard count]");
        }

        var completion = new ExecutorCompletionService<LeafAnswer>(executor);
        var ownerByFuture = new IdentityHashMap<Future<LeafAnswer>, String>();
        var values = new ArrayList<Quote>();
        var completedOwners = new HashSet<String>();
        var failures = new ArrayList<LeafFailure>();

        try {
            for (var shard : shards) {
                if (Thread.interrupted()) throw new InterruptedException();
                if (!leafDeadline.canStart(LEAF_START_RESERVE)) break;
                Future<LeafAnswer> future = completion.submit(() -> {
                    long wait = leafDeadline.remainingNanos();
                    if (wait <= 0 || !leafLimit.tryAcquire(wait, TimeUnit.NANOSECONDS)) {
                        throw new LeafOverloaded();
                    }
                    try {
                        if (Thread.interrupted()) throw new InterruptedException();
                        if (leafDeadline.remainingNanos() <= 0) throw new LeafOverloaded();
                        return new LeafAnswer(shard.id(), client.quote(shard, leafDeadline));
                    } finally {
                        leafLimit.release();
                    }
                });
                ownerByFuture.put(future, shard.id());
            }

            int unfinished = ownerByFuture.size();
            while (values.size() < required && unfinished > 0) {
                long remaining = deadline.remainingNanos();
                if (remaining <= RETURN_TRIP_RESERVE_NANOS) break;
                Future<LeafAnswer> done = completion.poll(
                        remaining - RETURN_TRIP_RESERVE_NANOS, TimeUnit.NANOSECONDS);
                if (done == null) break;
                unfinished--;
                String owner = ownerByFuture.get(done);
                completedOwners.add(owner);
                try {
                    Quote quote = done.get().quote();
                    if (acceptable(owner, quote, values)) values.add(quote);
                    else failures.add(new LeafFailure(owner, "UNACCEPTABLE_RESULT"));
                } catch (ExecutionException e) {
                    failures.add(new LeafFailure(owner, classify(e.getCause())));
                } catch (CancellationException e) {
                    failures.add(new LeafFailure(owner, "CANCELLED"));
                }
            }
        } finally {
            ownerByFuture.keySet().forEach(future -> future.cancel(true));
        }

        return new Gathered<>(values, expected, completedOwners, failures,
                commonWatermark(values), exactForContract(expected, values, failures));
    }

    @Override public void close() throws InterruptedException {
        executor.shutdown();
        try {
            if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
                executor.shutdownNow();
                if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                    reportResidualTasks();
                }
            }
        } catch (InterruptedException interrupted) {
            executor.shutdownNow();
            if (!executor.isTerminated()) reportResidualTasks();
            throw interrupted;
        }
    }
}
```

This is a decision skeleton, not drop-in code:

- `required=N` models all-success; `required=1` models first-success only when every candidate
  is semantically equivalent; other k values need an explicit quorum/partial-result contract.
- Validate a positive maxLeafCalls and immutable, bounded owner input before dispatch.
  Rejected submission propagates after cancellation of previously submitted futures;
  translate it at the API boundary rather than returning an unlabelled partial success.
- Submission itself is O(N) and can spend the deadline. A large/dynamic fan-out needs a global
  descendant budget and incremental/hierarchical dispatch rather than constructing millions of
  tasks.
- `Deadline.minusReserve` is a placeholder for a validated monotonic local cutoff; deadline
  transmission uses the protocol's supported remaining-budget representation, not raw nanoTime.
  Reserve includes bounded cancellation bookkeeping and result construction. Dispatch/merge
  and payload sizes must also be bounded; polling alone does not enforce response time.
- Before this method, bounded request admission plus per-request owner/byte limits must cap
  total queued/running tasks across roots. `leafLimit` only limits calls in this component;
  share/account for all callers of the resource. Local completion can release a permit while
  remote work continues, requiring downstream enforcement and residual-work accounting.
- `acceptable` and `exactForContract` are domain-policy placeholders, not majority by count.
  Validate owner identity/epoch, watermark compatibility and semantic equivalence before
  counting a success; all owners responding at different snapshots need not be exact.
  Return explicit insufficient-k/partial status according to the API, never implicit success.
- Completion order is intentionally not shard order. If result order is contractual, sort by a
  stable key after gather rather than relying on racing completion.
- The finally block attempts interruption. Many HTTP clients can propagate cancellation; JDBC,
  native code and remote servers may continue. Instrument residual task and downstream in-flight
  duration after the root response.
- If the owner thread is interrupted, cancellation runs and the interrupt propagates. Do not
  convert it into a partial success unless the API explicitly defines cancellation that way.
- Component shutdown also escalates when either wait is interrupted, reports observable
  residual state and propagates interruption. `reportResidualTasks` must be bounded and
  non-throwing; its snapshot is not proof of remote termination. The grace durations are
  lifecycle-policy examples, not per-request deadlines or guarantees that hostile tasks stop.

## Why per-call executor close is a trap

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    return executor.invokeAll(tasks, timeout, NANOSECONDS);
} // close waits for tasks to terminate; an interrupt-ignoring task can wait without bound
```

The `invokeAll` timeout bounds waiting inside `invokeAll`, not necessarily the try block.
Keeping a lifecycle executor lets the root return after signaling cancellation, while a
residual-work budget/monitor prevents leaked tasks from accumulating silently. At shutdown,
use a bounded grace policy and report tasks that did not terminate.

## Checks for the relevant properties

Select checks for changed or unresolved claims and reuse adequate evidence. These are test
options, not results already established by this partial sketch.

- delay one leaf and assert k-of-N returns at k, not at all-N/deadline;
- have a leaf ignore interruption and assert root response is bounded while residual-work
  metrics expose it and global admission limits prevent waiter/residual accumulation;
- interrupt the root while waiting and assert cancellation is attempted on all outstanding
  futures; account for racing starts and already completed tasks rather than asserting every
  future becomes cancelled;
- interrupt component shutdown during its grace wait; assert escalation and residual reporting
  still occur before interruption propagates, without waiting indefinitely for a hostile task;
- return empty success, explicit failure and timeout from different owners; assert `completedOwners`,
  `missing`, failures and exactness remain distinguishable;
- return inconsistent replica watermarks and assert first-success/quorum policy rejects a fast
  but invalid answer;
- when changing capacity or hedge policy, test the relevant N/nesting/cancellation at the
  actual arrival model; distinguish independent offered arrivals from completion-paced users.
  Observe started/delayed/dropped load, leaf calls, pool/connection use, root tail and residual work.

## Primary references

- [Java 21 `Executors.newVirtualThreadPerTaskExecutor`](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/Executors.html#newVirtualThreadPerTaskExecutor()>)
- [Java 21 `ExecutorService.close`](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ExecutorService.html#close()>)
- [Java 26 structured concurrency](https://docs.oracle.com/en/java/javase/26/core/structured-concurrency.html)
- [JEP 525: Structured Concurrency (Sixth Preview)](https://openjdk.org/jeps/525)
- [Java 21 ExecutorCompletionService](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ExecutorCompletionService.html) — first acceptable completion pattern; bound submitted work rather than replacing the completion queue with a queue that can drop completions.
