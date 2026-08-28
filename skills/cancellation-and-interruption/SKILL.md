---
name: cancellation-and-interruption
description: >
  Cancellation in Java as a cooperative protocol: interruption as a request rather than a
  stop, the two legal responses to InterruptedException, the blocking operations that
  ignore interruption and what stops them instead, why Future.cancel(false) and
  CompletableFuture.cancel never stop running work, and why a timeout is not a
  cancellation. Use when a catch block logs InterruptedException and continues, when
  Thread.interrupted() is called and its result discarded, when a timed-out request leaves
  work running, when cancel is expected to free a connection, when shutdownNow leaves
  threads alive, when a task blocks on a plain Socket or a native call, when
  Thread.stop is proposed, or when a StructuredTaskScope takes far longer to close than to
  fail. Does not cover choosing the bound itself (timeouts-and-deadlines), what to do after
  it fires (retries-and-backoff), executor shutdown mechanics
  (executors-and-task-lifecycle), or scope join policies (structured-concurrency).
---

# Cancellation and Interruption

## Purpose

Make "stop doing that" actually stop it. Java has no way to abort a thread from outside;
every cancellation is a request that the target must be written to observe. Code that does
not observe it is not slow to cancel — it is uncancellable, and the difference shows up as
a hung shutdown, a connection pool that never recovers after a timeout storm, or a scope
that fails in 10 ms and closes in 30 s.

The two failures this prevents: the swallowed `InterruptedException`, which converts a
cancellation request into a silent no-op; and the timeout that returns to the caller while
the work it was bounding continues to hold everything it acquired.

## Workflow

1. **Name the owner.** Exactly one place decides to cancel — a request deadline, a scope, a
   shutdown hook. Cancellation initiated from two places independently is a race, not a
   policy.
2. **Walk the blocking points on the path** and classify each: interruptible, not
   interruptible, or cancellable only by closing a resource. The uninterruptible ones are
   where cancellation actually fails.
3. **Make the task observant.** Check `Thread.currentThread().isInterrupted()` on every
   loop iteration of long CPU work, and handle `InterruptedException` at every blocking
   call by propagating or restoring.
4. **Propagate outward.** Cancelling a task must cancel the downstream calls it made; a
   cancelled caller with a live HTTP request behind it has leaked, not recovered.
5. **Pair every timeout with a cancellation.** A bound on waiting without a bound on
   working is a resource leak wearing a recovery costume.
6. **Test it**: start the work, cancel mid-flight, assert termination inside a bound and
   assert the resource was released.

## Rules

- Interruption is one bit plus a wake-up. `interrupt()` sets the flag; a thread blocked in
  an interruptible method throws `InterruptedException` **and the flag is cleared** on the
  way out. The exception carries the whole signal — losing it loses the cancellation.
- There are exactly two correct responses to `InterruptedException`: **propagate it**, or
  **restore the flag** (`Thread.currentThread().interrupt()`) and return promptly. Catching
  it, logging, and carrying on is a bug in every context.
- `Thread.interrupted()` **clears** the flag; `isInterrupted()` does not. Calling
  `interrupted()` in a condition and ignoring a `true` result discards the request.
- These do **not** respond to interruption: reads on `java.net.Socket` streams (close the
  socket), classic `java.io` file reads, entering a `synchronized` block (use
  `lock.lockInterruptibly()`), `CompletableFuture.join()`, and anything inside a native
  frame. `InterruptibleChannel` operations do respond — by closing the channel and throwing
  `ClosedByInterruptException`, which leaves the channel unusable, so that is a
  once-per-connection event, not a retry point.
- `Future.cancel(false)` stops a task **only if it has not started**; it otherwise just
  makes `get()` throw `CancellationException` while the task runs on. `cancel(true)`
  interrupts, which stops only tasks that observe interruption.
- **`CompletableFuture.cancel(mayInterruptIfRunning)` ignores its argument** — it never
  interrupts anything. It completes the future exceptionally for downstream stages and the
  supplier keeps running to completion, holding whatever it holds. `orTimeout` behaves the
  same way: the caller is released, the work is not.
- A timeout is not a cancellation. `get(timeout)` bounds the caller's wait. If nothing
  cancels the callee, a timeout under load multiplies in-flight work instead of shedding
  it — the classic shape behind a pool that never recovers.
- `StructuredTaskScope` makes cancellation structural: a failure, a success under a racing
  joiner, or a scope timeout interrupts the remaining subtasks. `close()` then waits for
  every one of them **regardless**. The guarantee is "no thread outlives the scope", not
  "close returns quickly" — an uninterruptible subtask delays it indefinitely.
- Swallowing `InterruptedException` breaks `shutdownNow()` and process shutdown: the
  interrupt was the only mechanism either had.
- `Thread.stop()` throws `UnsupportedOperationException` on the current baseline, and
  `suspend`/`resume` are gone. There is no forcible termination to fall back on; there was
  never a safe one.
- Virtual threads change nothing here. Interruption semantics are identical, and a leaked
  virtual thread is cheap in stack terms while still holding its scoped bindings, its
  connection and its downstream request.
- Cancellation must leave state consistent. "Where can this task be interrupted?" is a
  correctness question about the work, not a threading detail — the answer for a
  half-written batch is different from a read.

## References

- [The interrupt protocol in practice](references/interrupt-protocol.md) — the correct
  handler for each context (library, task body, loop, `Runnable`, framework callback), the
  restore-and-return idiom, and interruption during shutdown. Read when writing or
  reviewing any `catch (InterruptedException)`.
- [Uninterruptible operations and what stops them](references/uninterruptible-operations.md)
  — the table of blocking operations by interruptibility, closing a resource as the
  cancellation mechanism, cancelling JDBC and HTTP calls, and testing that cancellation
  actually released something. Read when a task will not stop, or before relying on a
  timeout to free a resource.
