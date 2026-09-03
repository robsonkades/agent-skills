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
        Set<String> responded,
        List<LeafFailure> failures,
        String dataWatermark,
        boolean exact) {
    Gathered {
        values = List.copyOf(values);
        expected = Set.copyOf(expected);
        responded = Set.copyOf(responded);
        failures = List.copyOf(failures);
    }
    Set<String> missing() {
        var result = new HashSet<>(expected);
        result.removeAll(responded);
        return Set.copyOf(result);
    }
}
```

`values.size()` is not completeness. A successful leaf may return zero values, a failed leaf
may respond with an error, and replicas may answer at different data versions. Define whether
the aggregate is exact, stale, a lower bound or otherwise partial; include compatible
snapshot/version watermarks when consistency matters.

## k successful leaves by one deadline

The executor below is injected and closed once during application shutdown. `leafLimit` is a
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
        if (required < 1 || required > shards.size()) {
            throw new IllegalArgumentException("required must be in [1, shard count]");
        }

        var completion = new ExecutorCompletionService<LeafAnswer>(executor);
        var ownerByFuture = new IdentityHashMap<Future<LeafAnswer>, String>();
        var values = new ArrayList<Quote>();
        var responded = new HashSet<String>();
        var failures = new ArrayList<LeafFailure>();

        try {
            for (var shard : shards) {
                if (!deadline.canStart(LEAF_START_RESERVE)) break;
                Future<LeafAnswer> future = completion.submit(() -> {
                    if (!leafLimit.tryAcquire(deadline.remainingNanos(), TimeUnit.NANOSECONDS)) {
                        throw new LeafOverloaded();
                    }
                    try {
                        return new LeafAnswer(shard.id(), client.quote(shard, deadline));
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
                responded.add(owner);
                try {
                    values.add(done.get().quote());
                } catch (ExecutionException e) {
                    failures.add(new LeafFailure(owner, classify(e.getCause())));
                } catch (CancellationException e) {
                    failures.add(new LeafFailure(owner, "CANCELLED"));
                }
            }
        } finally {
            ownerByFuture.keySet().forEach(future -> future.cancel(true));
        }

        Set<String> expected = shards.stream().map(Shard::id).collect(Collectors.toSet());
        return new Gathered<>(values, expected, responded, failures,
                commonWatermark(values), values.size() == shards.size());
    }

    @Override public void close() throws InterruptedException {
        executor.shutdown();
        if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
            executor.shutdownNow();
            if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                reportResidualTasks();
            }
        }
    }
}
```

This is a decision skeleton, not drop-in code:

- `required=N` models all-success; `required=1` models first-success only when every candidate
  is semantically equivalent; other k values need an explicit quorum/partial-result contract.
- Submission itself is O(N) and can spend the deadline. A large/dynamic fan-out needs a global
  descendant budget and incremental/hierarchical dispatch rather than constructing millions of
  tasks.
- `tryAcquire` consumes remaining time; a production implementation reserves return/merge time
  there too and distinguishes not-started from responded failure.
- Completion order is intentionally not shard order. If result order is contractual, sort by a
  stable key after gather rather than relying on racing completion.
- The finally block attempts interruption. Many HTTP clients can propagate cancellation; JDBC,
  native code and remote servers may continue. Instrument residual task and downstream in-flight
  duration after the root response.
- If the owner thread is interrupted, cancellation runs and the interrupt propagates. Do not
  convert it into a partial success unless the API explicitly defines cancellation that way.

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

## Tests that prove the real properties

- delay one leaf and assert k-of-N returns at k, not at all-N/deadline;
- have a leaf ignore interruption and assert root response is bounded while residual-work
  metrics expose it and the bulkhead prevents accumulation;
- interrupt the root while waiting and assert every submitted future is cancelled and no new
  leaf starts;
- return empty success, explicit failure and timeout from different owners; assert `responded`,
  `missing`, failures and exactness remain distinguishable;
- return inconsistent replica watermarks and assert first-success/quorum policy rejects a fast
  but invalid answer;
- load-test N, nested fan-out and cancellation at constant offered rate; assert leaf-call count,
  pool/connection use, root tail and downstream residual work.

## Primary references

- [Java 21 `Executors.newVirtualThreadPerTaskExecutor`](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/Executors.html#newVirtualThreadPerTaskExecutor()>)
- [Java 21 `ExecutorService.close`](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ExecutorService.html#close()>)
- [Java 26 structured concurrency](https://docs.oracle.com/en/java/javase/26/core/structured-concurrency.html)
- [JEP 525: Structured Concurrency (Sixth Preview)](https://openjdk.org/jeps/525)
