# Fan-out in Java

The non-preview production shape: a virtual-thread executor in try-with-resources, a deadline
propagated into every leaf, `invokeAll` with a bound for a k-of-N-by-deadline gather, and an
explicit completeness field on the way out. `StructuredTaskScope` expresses the same lifetime
guarantee more directly and is still preview on every released JDK — `structured-concurrency`
owns that decision.

## The types

```java
// Conceptual — the propagation, clock and reserve rules are timeouts-and-deadlines.
record Deadline(long atNanos) {
    static Deadline in(Duration d) { return new Deadline(System.nanoTime() + d.toNanos()); }
    Duration remaining() { return Duration.ofNanos(Math.max(0, atNanos - System.nanoTime())); }
}

/// requested − values.size() is not the completeness signal: missing names the owners.
record Gathered<T>(List<T> values, List<String> missing, int requested) {
    Gathered { values = List.copyOf(values); missing = List.copyOf(missing); }
    boolean complete() { return missing.isEmpty(); }
}
```

`missing` is what makes a short answer interpretable. A caller holding only `values` cannot tell
"this shard had nothing" from "this shard never replied", and will cache or display the result
as authoritative. It is part of the API contract, not a debug aid (`rpc-and-api-contracts`).

## The fan-out

```java
Gathered<Quote> quotes(List<Shard> shards, Deadline deadline) throws InterruptedException {
    Duration budget = deadline.remaining().minus(RETURN_TRIP_RESERVE);
    if (budget.isNegative() || budget.isZero()) {
        return new Gathered<>(List.of(), shards.stream().map(Shard::id).toList(), shards.size());
    }

    List<Callable<Quote>> leaves = shards.stream()
        // the leaf derives its own client timeout from the same deadline, not from a constant
        .map(shard -> (Callable<Quote>) () -> client.quote(shard, deadline))
        .toList();

    try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
        return assemble(shards, exec.invokeAll(leaves, budget.toMillis(), TimeUnit.MILLISECONDS));
    }
}

private Gathered<Quote> assemble(List<Shard> shards, List<Future<Quote>> results) {
    List<Quote> values = new ArrayList<>(results.size());
    List<String> missing = new ArrayList<>();
    for (int i = 0; i < results.size(); i++) {
        Future<Quote> leaf = results.get(i);
        String id = shards.get(i).id();
        switch (leaf.state()) {
            case SUCCESS   -> values.add(leaf.resultNow());
            case FAILED    -> { missing.add(id); log.warn("leaf {} failed", id, leaf.exceptionNow()); }
            case CANCELLED -> missing.add(id);                       // deadline expired
            case RUNNING   -> throw new IllegalStateException("invokeAll returned a running task");
        }
    }
    return new Gathered<>(values, missing, shards.size());
}
```

### Annotated failure modes

- **`invokeAll(tasks, timeout, unit)` cancels unfinished tasks on return** — with an interrupt.
  That bounds the _root's wait_; whether the leaf stops depends on the leaf. Which blocking
  calls do not respond to interruption is `timeouts-and-deadlines`.
- **`close()` blocks until every forked task has terminated.** A leaf that swallows
  `InterruptedException` turns the try-with-resources exit into an unbounded wait _after_ the
  deadline was enforced. The bound is real only if every leaf is interruptible — test it.
- **The leaf must derive its own client timeout from the deadline.** If the HTTP or JDBC timeout
  inside `client.quote` is a constant larger than the budget, executor cancellation is the only
  bound on the call and the previous two points become the whole story.
- **Empty `values` with a full `missing` is a valid response, not an exception.** Throwing here
  discards the answer you do have; whether the caller can use it belongs to the contract.
- **N virtual threads are not N permits at the callee.** The executor bounds nothing; the limit
  lives next to the scarce resource (`concurrency-limiting-and-bulkheads`).

For first-of-N, `exec.invokeAny(leaves, timeout, unit)` returns the first successful result and
cancels the rest on return; it throws `ExecutionException` only when _every_ task failed. Use it
for replica reads where any replica answers — never for a gather that needs a merge, since it
discards the other results.

## Testing that the losers really stopped

`assertTrue(future.isCancelled())` proves the root stopped waiting. It says nothing about the
leaf. Observe the leaf itself:

```java
@Test
void losers_are_interrupted_when_the_deadline_expires() throws Exception {
    CountDownLatch slowInterrupted = new CountDownLatch(1);
    Callable<String> fast = () -> "a";
    Callable<String> slow = () -> {
        try { Thread.sleep(Duration.ofSeconds(30)); }
        catch (InterruptedException e) { slowInterrupted.countDown(); throw e; }
        return "late";
    };

    List<Future<String>> results;
    try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
        results = exec.invokeAll(List.of(fast, slow), 100, TimeUnit.MILLISECONDS);
    }

    assertEquals(Future.State.SUCCESS, results.get(0).state());
    assertEquals(Future.State.CANCELLED, results.get(1).state());
    assertTrue(slowInterrupted.await(1, TimeUnit.SECONDS), "slow leaf was never interrupted");
}
```

The third assertion is the test. Two further ones worth owning:

- **Partial assembly**: a stub leaf that never answers must produce `complete() == false` with
  its own id in `missing` — assert the id, not the size.
- **End to end**: with a leaf that sleeps past the deadline, assert the callee's in-flight gauge
  returns to zero after the root has replied. That is the only check covering the
  swallowed-interrupt case, and the one that catches a fan-out costing N units for one answer.
