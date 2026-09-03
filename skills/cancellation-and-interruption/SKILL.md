---
name: cancellation-and-interruption
description: >
  Designing cooperative cancellation in Java across interruption, Future/CompletableFuture,
  executor/scope shutdown, deadlines, resource close/abort, CPU loops, blocking APIs, native calls,
  partial side effects and cleanup. Covers multiple cancellation sources, signal ownership,
  propagation/translation/restoration, noninterruptible regions, residual work, idempotency and
  bounded termination tests. Use when timeout/cancel returns but work or resources remain, or when
  `InterruptedException` handling is ambiguous. Timeout selection and retry policy are separate.
---

# Cancellation and interruption

## Purpose

Make abandonment observable and bounded across the whole work graph. Interruption is one cooperative
signal; resource close, protocol abort, cancellation tokens, deadlines and process isolation may be
needed. Returning a timeout/cancelled result while work continues is a semantic and capacity state,
not necessarily successful cancellation.

## Cancellation contract

```text
work owner and terminal states:
sources: caller, deadline, sibling failure, shutdown, overload, admin
winner/precedence when sources race:
signal per execution/blocking/resource layer:
observation/check points and maximum cancellation latency:
downstream propagation and residual work:
partial side effects, commit point, compensation/idempotency:
resource cleanup and ownership:
result/error/context exposed to caller and telemetry:
grace, escalation, process shutdown and test bound:
```

Multiple sources are normal. Cancellation should be idempotent and converge on one state machine;
“exactly one place may cancel” is not a realistic requirement.

## Interruption protocol

`Thread.interrupt()` sets interrupt status and may cause an interruptible blocking operation to
terminate according to its API. Many methods throwing `InterruptedException` clear status when they
do so. `Thread.interrupted()` reads and clears the current thread's status; `isInterrupted()` does
not clear it.

Choose handling by boundary:

| Boundary                                                | Appropriate handling                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| method can declare interruption                         | cleanup then propagate `InterruptedException`                                          |
| API cannot declare but caller must observe cancellation | restore status, translate/return promptly under documented contract                    |
| top-level task/thread owner                             | cleanup and terminate; restoration may be unnecessary if no outer owner remains        |
| non-cancellable atomic section                          | defer observation briefly, preserve signal, complete/rollback invariant, then honor it |
| interruption is not this API's cancellation signal      | preserve/translate according to framework contract; do not silently erase              |

There are more than “exactly two legal responses.” The invariant is that an owned signal is handled,
propagated or deliberately consumed at its terminal owner, with cleanup and semantics preserved.
Logging and continuing ordinary work is usually a bug.

## CPU and polling loops

Check cancellation at a cadence derived from maximum allowed latency and per-iteration cost—not
necessarily every iteration. Avoid allocating/logging on every check. Include nested library work,
parallel subtasks and safepoint behavior in the bound. `Thread.onSpinWait()` does not check interrupt
or relinquish ownership.

## Blocking and resource cancellation

Interrupt behavior is exact-API/provider/thread/version-specific. Classify each blocking point:

- specified interruptible wait throwing `InterruptedException`;
- channel operation that closes/wakes with channel-specific exception;
- operation whose owning socket/stream/session must be closed/aborted;
- API with its own cancel handle/deadline (`Statement.cancel`, HTTP request future, subscription);
- native/foreign call with library-specific interruption or no cooperative path;
- monitor acquisition, lock acquisition, future join/get, sleep/park and condition wait, each with
  distinct semantics.

Do not use a timeless table saying every classic socket/native call ignores interruption. Virtual
threads and JDK/provider implementations have evolved. Read the exact API contract, run a positive
control on the target, and prefer owner-initiated close only when close semantics and connection
reuse are acceptable.

## Futures and stages

- `Future.cancel(false)` can prevent execution before start; if already running, it does not request
  interruption and work may continue even though the Future is cancelled.
- `Future.cancel(true)` requests interruption when implementation can identify a running task;
  termination still depends on task/API cooperation.
- `CompletableFuture.cancel(boolean)` treats cancellation as exceptional completion; its
  `mayInterruptIfRunning` argument has no effect in the class contract. It is not automatically a
  handle to the computation that will complete it.
- wait timeouts such as `get(timeout)` bound the waiter, not the producer. `orTimeout` completes the
  stage exceptionally but does not universally stop underlying work.

Bridge cancellation explicitly when adapting callback/client APIs: retain the underlying handle,
propagate terminal state both directions once, and resolve completion-versus-cancel races.

## Structured ownership

Executors/scopes can track tasks and signal unfinished work during shutdown/failure, but cannot make
noncooperative operations terminate. Structured-concurrency APIs are versioned preview/finalization
work; verify target API. Define join/deadline/failure policy, scope close behavior, subtask
interruptibility and what resource aborts are triggered.

## State consistency

Mark cancellation points around semantic commit:

```text
before side effect -> abandon safely
during staged local mutation -> rollback/complete invariant
after external request sent -> outcome may be unknown; cancellation cannot undo it
after durable commit -> return cancellation may hide success; reconcile/idempotency needed
```

Never assume interruption rolls back a database transaction, remote call, file write or message.
Cancellation can produce an unknown outcome and must compose with idempotency/recovery.

## Observability

Measure by operation/resource:

```text
cancellation requested / acknowledged / terminated
request-to-observation and request-to-resource-release latency
reason/source and race winner (bounded labels)
work completed after caller deadline/cancel
resources still held and downstream request still active
cleanup failures and forced shutdown/escalation
```

Do not count `Future` exceptional completion as task termination without a terminal-work signal.

## Tests

- cancel before start, during CPU work, at each blocking point and after semantic commit;
- multiple sources racing with normal completion/failure;
- swallowed/cleared interrupt and task/framework boundary translation;
- noninterruptible provider/native call and owner close/abort;
- resource released/reusable versus deliberately closed;
- partial write/transaction/message/remote unknown outcome;
- executor/scope shutdown and process grace expiry;
- virtual/platform thread and supported JDK/provider variants;
- cancellation storm under load, ensuring residual work does not amplify overload.

## Anti-patterns

| Anti-pattern                                  | Failure                                                               | Better approach                                    | Narrow exception                   |
| --------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------- |
| “Always restore and return”                   | top-level owner may leak meaningless status; invariant may be partial | handle by boundary and ownership                   | library boundary that cannot throw |
| Check every CPU iteration                     | unnecessary overhead                                                  | derive polling cadence from latency bound          | coarse expensive iterations        |
| Timeout means work stopped                    | residual work holds resources                                         | explicit downstream cancel/abort + terminal metric |
| `cancel(true)` is force-stop                  | cooperation/provider required                                         | test observation and release                       |
| Close any shared socket to cancel one request | disrupts multiplexed/pooled users                                     | request-level cancel or ownership-safe close       | dedicated connection               |
| Retry cancelled unknown outcome               | duplicates side effects                                               | idempotency/reconciliation                         |

## Definition of done

- [ ] All sources/races converge on one idempotent terminal-state model.
- [ ] Every CPU/blocking/native/resource layer has a tested stop/abort path or explicit bound.
- [ ] Interrupt propagation/translation/restoration is correct at each ownership boundary.
- [ ] Partial/unknown side effects and commit races have recovery semantics.
- [ ] Termination and resource release—not only caller return—meet measured bounds.
- [ ] Shutdown, load storm, target JDK/provider and residual-work tests pass.

## References

- [Interrupt handling by boundary](references/interrupt-protocol.md)
- [Blocking operations and cancellation adapters](references/uninterruptible-operations.md)
- [`Thread` interruption API](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Thread.html#interrupt()>)
- [`Future`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Future.html)
- [`CompletableFuture`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
