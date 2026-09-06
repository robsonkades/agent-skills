# Patterns and pitfalls

Examples target **JDK 25** unless marked. `Joiner` name changes for 26 are in
`api-by-jdk-version.md`. Application examples are partial; supply domain functions/types,
metrics and imports. The cancellation test uses JUnit 5; the custom joiner uses `java.util`.

## The four policies, and what each one is for

| Need                                                    | Joiner                                                        | `join()` returns                |
| ------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------- |
| Every subtask must succeed; abandon the rest on failure | `open()` (default)                                            | `null`; read `Subtask`s         |
| Same, but the results are homogeneous                   | `allSuccessfulOrThrow()`                                      | the results                     |
| First success wins; cancel the losers                   | `anySuccessfulResultOrThrow()` (26: `anySuccessfulOrThrow()`) | the winning result              |
| Collect everything, successes and failures alike        | `awaitAll()`                                                  | `null`; inspect each            |
| Stop when a condition is met                            | `allUntil(Predicate<Subtask<? extends T>>)`                   | all subtasks (a `Stream` in 25) |

Choosing `awaitAll()` means _you_ decide what a partial result means. That is the right
choice for a dashboard aggregating six independent widgets, and the wrong one for a payment.

## Fan-out where partial failure is acceptable

```java
record Panel(String id, Optional<Data> data) {}

List<Panel> render(List<Widget> widgets) throws InterruptedException {
    try (var scope = StructuredTaskScope.open(
            Joiner.<Panel>awaitAll(),
            cf -> cf.withName("dashboard").withTimeout(Duration.ofMillis(800)))) {

        List<Subtask<Panel>> tasks = widgets.stream()
                .map(w -> scope.fork(() -> new Panel(w.id(), Optional.of(load(w)))))
                .toList();

        try {
            scope.join();
        } catch (StructuredTaskScope.TimeoutException expected) {
            metrics.increment("dashboard.scope.timeout");
            // Completed states remain inspectable; UNAVAILABLE means no result is
            // available, not necessarily that already-sent remote work stopped.
        }

        List<Panel> panels = new ArrayList<>(tasks.size());
        for (int i = 0; i < tasks.size(); i++) {
            Subtask<Panel> t = tasks.get(i);
            panels.add(t.state() == Subtask.State.SUCCESS
                    ? t.get() : new Panel(widgets.get(i).id(), Optional.empty()));
        }
        return List.copyOf(panels);
    }
}
```

Note what the timeout does: it cancels the scope and makes `join` throw. It does **not**
return a partial-result object. For "everything that finished by T", retain the `Subtask`s,
catch `TimeoutException`, and inspect their states as above. Leaving the block still invokes
`close()`, which waits for every subtask thread to terminate; an uninterruptible loser can
therefore make the method return after the nominal 800 ms bound. Cancellation of a client
thread also does not prove that a request already sent to a remote service stopped.

## Racing redundant sources

```java
Price price(Sku sku) throws InterruptedException {
    try (var scope = StructuredTaskScope.open(Joiner.<Price>anySuccessfulResultOrThrow())) {
        scope.fork(() -> primary.price(sku));
        scope.fork(() -> secondary.price(sku));
        return scope.join();            // first success triggers cancellation; close waits
    }
}
```

This is the construct `CompletableFuture.anyOf` is mistaken for: `anyOf` returns the first
_settled_ stage, including the first failure. Here, failures are ignored until every subtask
has failed, and only then does `join` throw.

Two costs to state out loud: the losing call still consumed a downstream request (hedging
doubles load on the dependency — see `tail-latency-analysis` before doing this on a hot
path), and the loser is cancelled by interruption, which stops it only if it is
interruptible.

## Bounding concurrency inside a scope

A scope forks as many threads as you ask it to. Nothing in the API is a limit.

```java
Semaphore permits = new Semaphore(20);            // sized for the downstream, not for the JVM

try (var scope = StructuredTaskScope.open()) {
    for (Id id : tenThousandIds) {
        scope.fork(() -> {
            permits.acquire();                     // interruptible: cancellation still works
            try {
                return enrich(id);
            } finally {
                permits.release();
            }
        });
    }
    scope.join();
}
```

`permits.acquire()` (not `acquireUninterruptibly`) keeps the subtask cancellable while it
waits for a permit — otherwise a cancelled scope waits for permits it will never use.
This semaphore is local to this fan-out. Share the limiter at the dependency boundary for a
process-wide cap; it still leaves up to 10,000 threads waiting, so bound admitted fan-out size.
`enrich` must finish using the protected resource before release. Returning an asynchronous
handle or timing out does not prove the underlying work stopped.

## Nesting, and what it buys

```java
Report build(Query q) throws InterruptedException {
    try (var outer = StructuredTaskScope.open(Joiner.<Section>awaitAll(),
                                              cf -> cf.withTimeout(Duration.ofSeconds(2)))) {
        outer.fork(() -> summary(q));
        outer.fork(() -> details(q));     // details() opens its own scope internally
        outer.join();
        …
    }
}

Section details(Query q) throws InterruptedException {
    try (var inner = StructuredTaskScope.open()) {       // a child scope, owned by this subtask
        inner.fork(() -> rows(q));
        inner.fork(() -> totals(q));
        inner.join();
        …
    }
}
```

Cancelling `outer` interrupts the thread running `details`, which exits its `try`, which
closes `inner`, which cancels _its_ subtasks and waits for them. Cancellation flows down the
tree when the intermediate code propagates interruption. The outer timeout requests subtree
cancellation; it neither forcibly stops nested calls nor automatically configures downstream
network deadlines. Pass the remaining operation budget where those clients need their own bounds.

The corollary: the deepest uninterruptible call in the tree sets how long the _outer_ close
takes.

## A custom joiner

Implement `Joiner` when the policy is neither "all" nor "any" — for example, enough
successes to answer.

```java
final class QuorumJoiner<T> implements Joiner<T, List<T>> {
    private final int needed;
    private final List<T> results = new ArrayList<>();

    QuorumJoiner(int needed) {
        if (needed <= 0) throw new IllegalArgumentException("needed must be positive");
        this.needed = needed;
    }

    @Override public synchronized boolean onComplete(Subtask<? extends T> subtask) {
        if (subtask.state() == Subtask.State.SUCCESS && results.size() < needed) {
            results.add(subtask.get()); // a successful Callable may return null
        }
        return results.size() >= needed;
    }

    @Override public synchronized List<T> result() {
        if (results.size() < needed) throw new IllegalStateException("quorum not reached");
        return Collections.unmodifiableList(new ArrayList<>(results));
    }
}
```

`onComplete` may run concurrently from subtask threads; the monitor protects both accumulation
and snapshot, including callbacks already in progress during cancellation. It is not called for a subtask that completes after the
scope has already been cancelled. `result()` runs on the owner after `join` has observed
either completion or cancellation; cancelled sibling threads may still be winding down,
and `close()` is what waits for their termination. A production quorum joiner must also
decide whether a count quorum means agreement on a value. This example chooses at most `needed`
successful callback arrivals (unordered, null allowed), fails when fewer than `needed` succeed,
and does not short-circuit when quorum becomes impossible. Validate `needed <= submitted tasks`
before forking when that count is known. It is not a distributed-consensus quorum.

## Anti-patterns

- **Treating the scope as an executor.** A reference can be stored or passed without throwing;
  misuse of owner-only methods on JDK 25 throws `WrongThreadException`. Keep lifecycle lexical;
  structure checks do not automatically close a forgotten scope.
- **Background work in a scope.** A scope ends when its block ends. A consumer loop, a
  scheduler or a warm-up job needs an executor with its own lifecycle.
- **Owner reading a result before joining.** It throws. Joiner completion callbacks may read
  successful results; a partial-result join still requires checking each subtask's state.
- **Catching `FailedException` and continuing without unwrapping.** The useful exception is
  `e.getCause()`; logging the wrapper produces a stack trace that names the scope and not
  the failure.
- **Assuming close is fast.** It waits for every subtask. Measure it — the difference
  between "scope failed" and "scope returned" includes termination, cleanup and scheduling.
- **Reusing a `Joiner`.** One per `open`, always.
- **Assuming virtual threads add CPU capacity.** They make blocking concurrency cheap; they
  do not increase available cores. For fine-grained recursive CPU work, compare a dedicated
  `ForkJoinPool`, batching, and sequential execution under a representative benchmark.

## Testing a scope

```java
@Test
void oneFailureCancelsTheSibling() {
    AtomicBoolean siblingInterrupted = new AtomicBoolean();
    CountDownLatch siblingStarted = new CountDownLatch(1);

    assertThrows(StructuredTaskScope.FailedException.class, () -> {
        try (var scope = StructuredTaskScope.open()) {
            scope.fork(() -> {
                try {
                    siblingStarted.countDown();
                    Thread.sleep(Duration.ofSeconds(30));   // interruptible on purpose
                } catch (InterruptedException e) {
                    siblingInterrupted.set(true);
                    throw e;
                }
                return null;
            });
            scope.fork(() -> {
                if (!siblingStarted.await(2, TimeUnit.SECONDS)) {
                    throw new AssertionError("sibling did not start");
                }
                throw new IllegalStateException("boom");
            });
            scope.join();
        }
    });

    assertTrue(siblingInterrupted.get());   // the guarantee, asserted rather than assumed
}
```

Assert three things across the suite: the sibling was cancelled, the block returned within a
bound (proving `close` did not hang), and the resource the subtask held was released. A test
that only asserts the thrown exception proves nothing about the lifetime guarantee, which is
the reason the API exists.

Tests need `--enable-preview` too — including in the IDE, in Maven Surefire
(`<argLine>--enable-preview</argLine>`) and in whatever runs the build in CI.
Use a bounded forked-test-process watchdog for deliberately interruption-resistant fixtures;
an in-process timeout that merely interrupts the owner can itself remain stuck in scope close.

## Reading the thread dump

```bash
jcmd <pid> Thread.dump_to_file -format=json /tmp/dump.json
```

Scopes appear as objects containing their forked threads with a reference to the parent
scope, so the whole tree can be reconstructed — the owner is usually parked in `join`, and
the interesting frames are its children. `cf.withName("checkout")` is what makes that dump
searchable; unnamed scopes are indistinguishable in a dump with hundreds of them.
