# Patterns and pitfalls

Examples target **JDK 25** unless marked. `Joiner` name changes for 26 are in
`api-by-jdk-version.md`. Application examples are partial; supply domain functions/types,
metrics and imports. The partial-result example also uses `ConcurrentHashMap`; the cancellation
test uses JUnit 5; the custom joiner uses `java.util`.

## Completion policies and their uses

| Need                                                    | Joiner                                                        | `join()` returns                |
| ------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------- |
| Every subtask must succeed; abandon the rest on failure | `open()` (default)                                            | `null`; read `Subtask`s         |
| Same, but the results are homogeneous                   | `allSuccessfulOrThrow()`                                      | the results                     |
| First success wins; cancel the losers                   | `anySuccessfulResultOrThrow()` (26: `anySuccessfulOrThrow()`) | the winning result              |
| Collect everything, successes and failures alike        | `awaitAll()`                                                  | `null`; inspect each            |
| Stop when a condition is met                            | `allUntil(Predicate<Subtask<? extends T>>)`                   | all subtasks (a `Stream` in 25) |

Choosing `awaitAll()` means _you_ decide what each failed or missing result means. Independent
optional widgets may remain useful after a partial failure; an operation requiring every result
must detect failure before acting. Select from that contract, not from the feature's label.

## Fan-out where partial failure is acceptable

This example permits partial results on widget failure or scope timeout, but owner interruption
aborts the response with `InterruptedException` after child cleanup.

```java
record Panel(String id, Optional<Data> data) {}

List<Panel> render(List<Widget> widgets) throws InterruptedException {
    Map<Subtask<? extends Panel>, Panel> completed = new ConcurrentHashMap<>();
    List<Subtask<Panel>> tasks;
    try (var scope = StructuredTaskScope.open(
            Joiner.<Panel>allUntil(t -> {
                if (t.state() == Subtask.State.SUCCESS) completed.put(t, t.get());
                return false; // observe completion; do not cancel on a widget result
            }),
            cf -> cf.withName("dashboard").withTimeout(Duration.ofMillis(800)))) {

        tasks = widgets.stream()
                .map(w -> scope.fork(() -> new Panel(w.id(), Optional.of(load(w)))))
                .toList();

        try {
            scope.join();
        } catch (StructuredTaskScope.TimeoutException expected) {
            metrics.increment("dashboard.scope.timeout");
            // Owner get() is invalid here on JDK 25: join did not complete.
            // The joiner callback has retained successful results independently.
        }
    } // close waits for subtasks and any completion callbacks still in progress

    if (Thread.interrupted()) {
        throw new InterruptedException("caller interrupted");
    }

    List<Panel> panels = new ArrayList<>(tasks.size());
    for (int i = 0; i < tasks.size(); i++) {
        panels.add(completed.getOrDefault(tasks.get(i),
                new Panel(widgets.get(i).id(), Optional.empty())));
    }
    return List.copyOf(panels);
}
```

Note what the timeout does: it cancels the scope and makes `join` throw. It does **not**
return a partial-result object. On JDK 25, owner `get()` inside the scope after a timed-out join
throws even for a successful subtask. The callback above uses its documented permission to read
successful results, with a concurrent map because callbacks may overlap. After close, render
the recorded successes and fallbacks; a missing result does not prove a remote request stopped.
This is a snapshot of recorded completions, not a precise wall-clock cutoff at 800 ms.
Leaving the block still invokes `close()`, which waits for every subtask thread to terminate;
an uninterruptible loser can therefore make the method return after the nominal 800 ms bound.

The timeout catch intentionally leaves `InterruptedException` from join to propagate. On JDK 25,
an owner interrupted while close waits continues waiting and returns with interrupt status set.
The post-close check consumes that observed status and propagates interruption under this caller
contract. It does not atomically prevent cancellation after the check or during later response
publication; honor the framework's cancellation/publication protocol there. If interruption is
not the caller's cancellation signal, adapt the boundary to that contract rather than clearing it.

See the [JDK 25 subtask contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/StructuredTaskScope.Subtask.html)
and [joiner callback contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/StructuredTaskScope.Joiner.html),
plus [close interruption behavior](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/StructuredTaskScope.html#close()>).

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

Two costs to evaluate: an eager second attempt can increase downstream request volume and work
(see `tail-latency-analysis` before doing this on a hot path), and interruption stops a loser
only if it responds by exiting and releasing its resources. Measure actual attempts and residual
work; cancellation timing and admission affect the load increase.

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
- **Work escaping its parent lifetime.** A bounded or long-lived parent may own a scope, including
  an accept loop with handlers. Make stop-admission and shutdown/wait behavior explicit. A detached
  job must have its own owner; a request's scope does not manage it after the request returns.
- **Owner reading a result before joining.** It throws. Joiner completion callbacks may read
  successful results; a partial-result join still requires checking each subtask's state.
- **Classifying `FailedException` without inspecting its cause.** Match the underlying failure
  through `e.getCause()`. Log the full throwable chain; logging only the wrapper's message loses
  detail, while a full stack trace normally includes the cause.
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
searchable; generated names/IDs and parent links still distinguish unnamed scopes, but do not
explain their application purpose.
