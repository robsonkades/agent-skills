---
name: java-resource-management
description: >
  Deterministic release of what a Java program holds open: try-with-resources and the
  exception semantics that make it non-optional, designing an AutoCloseable (ownership,
  idempotent close, close that fails), decorators and partially constructed resource chains,
  resources that cross an async or executor boundary, and the difference between closing a
  resource and returning one to a pool. Use when a close sits in a finally block, when a
  resource is created inside a try block or inside a lambda that outlives it, when a method
  closes something it was handed, when connections or file descriptors leak under load, when
  ExecutorService or StructuredTaskScope is used in try-with-resources, or when a stream
  from Files.lines or Files.walk is never closed. Does not cover reachability-driven cleanup
  — WeakReference, SoftReference, Cleaner and the leaks they hide
  (java-reference-types-and-leaks) — pool sizing (connection-pool-sizing), or native segment
  lifetimes (off-heap-memory).
---

# Java Resource Management

## Purpose

Make every resource's release deterministic and owned by exactly one piece of code. The
failure modes: the `finally` block that discards the real exception and reports the one
thrown by `close`; the resource that leaks only on the error path, so it survives every
test and exhausts the pool during the first incident; and the callee that closes a stream
its caller still needs, which fails as a `Stream has already been operated upon or closed`
far from the code that caused it.

## Workflow

Use Java 21 for stable-API examples and explicitly marked Java 25 preview semantics only for
StructuredTaskScope. Inspect compiler/runtime, preview policy, driver/pool contracts and the
actual owner before changing lifetimes; do not upgrade a project or enable preview for a cleanup
fix. Reuse adequate lifecycle code and evidence; ask only for missing contracts that change the
decision. Missing cancellation/close guarantees must remain explicit unknowns.

1. **Name the lifetime authority.** Prefer one owner that acquires/releases. Borrowed,
   reference-counted or shared resources need an explicit protocol instead. A method receiving an
   open resource normally borrows it; consuming/closing must be named and documented.
2. **Make the scope lexical.** Acquire in a `try`-with-resources header. If the resource
   must outlive the method, transfer ownership explicitly or borrow from a longer-lived owner.
   Returning a resource or view alone does not transfer ownership.
3. **Declare each resource separately.** `try (var raw = open(); var buf = wrap(raw))`, not
   a nested constructor chain: if the outer constructor throws, the inner resource is
   already open and nothing references it. This shape may close the raw resource twice when
   the wrapper owns it; verify idempotence or use an explicit success-transfer/failure-cleanup
   protocol for resources that cannot be released twice.
4. **Decide what a failing `close` means.** If the body already failed, try-with-resources
   suppresses cleanup failure; if the body succeeded, close failure propagates, for readers too.
   A writer's failed flush/close can leave partial or complete writes with uncertain durability.
   Do not report success or infer that retrying is safe merely because close threw.
5. **Check every escape route.** A resource captured by a lambda submitted to an executor,
   stored in a field, returned inside a `Stream`, or held across a `CompletableFuture`
   boundary may be used beyond the current lexical scope. Determine the actual last use:
   the releasing scope must wait, ownership must transfer, or an existing longer-lived owner
   must keep the borrowed resource valid through that use.
6. **Verify the relevant failure paths.** Check partial acquisition, body/close failure ordering,
   borrowed-resource survival and actual-use termination on cancellation as applicable. Assert
   release according to the resource's contract; a wrapper and its delegate may both receive
   permitted close calls. A passing happy path does not cover these failures.

## Rules

- Prefer `try`-with-resources for lexically owned `AutoCloseable`s. Application-lifecycle,
  conditional-transfer and asynchronous ownership may need an explicit state machine/finally.
  Resources close in reverse declaration order,
  and an exception from `close` is _suppressed_ onto the body's exception rather than
  replacing it—`getSuppressed()` recovers it. A naive `finally { close(); }` can replace the body
  exception unless it manually implements equivalent suppression.
- Since Java 9 an existing effectively-final variable can be used directly:
  `try (existingResource)`. This does not transfer aliases or make ownership obvious; choose a
  local name/Javadoc when it clarifies that the scope closes a borrowed-looking value.
- Implement `Closeable` when its stronger idempotence and `IOException` contract fit; implement
  `AutoCloseable` otherwise. I/O association alone is not decisive—JDBC resources implement
  `AutoCloseable`. Declare the narrowest failure type; avoid `throws Exception` in a public
  implementation unless callers genuinely need that generality.
- Make custom `close` idempotent where feasible. `Closeable` requires it and `AutoCloseable`
  strongly advises it, but third-party/reference-counted release protocols may reject double
  release. Never infer idempotence from use in a pool or decorator.
- `close` must not block indefinitely and must not do work that can fail after the point of
  no return without an explicit partial-result/durability contract. Where the library can block
  indefinitely, document that limitation and the lifecycle escalation policy rather than promise
  bounded cleanup. A `close` that flushes over a network needs the same timeout discipline as any
  other remote call — see timeouts-and-deadlines.
- Most streams need no closing; the ones backed by an I/O resource do—`Files.lines`,
  `Files.walk`, `Files.find`, `Files.list`, and `Files.newDirectoryStream`. A method that returns such a
  newly opened stream transfers its resource to the caller, and its Javadoc must say so.
- `ExecutorService` has been `AutoCloseable` since Java 19, and its `close()` initiates an
  orderly shutdown and then _blocks until executor termination_. In
  `try`-with-resources that is a join point, not a cheap release: a long-running task makes
  the enclosing method hang there. If the calling thread is interrupted while waiting,
  `close` attempts to stop tasks as if by `shutdownNow`, keeps waiting for those already
  running, and re-asserts the interrupt before returning. Never-started submitted Futures can
  remain incomplete. Only the executor's lifecycle owner may close or shut it down; when that
  owner needs a bounded wait, use an explicit shutdown/escalation protocol and retain result
  ownership. executors-and-task-lifecycle covers shutdown and queued-result settlement.
- Closing a pooled `Connection` normally ends the borrow; the pool may reuse or evict the
  physical connection. Hold it only for the work and transaction it serves, including an
  explicitly owned longer-lived operation when required. connection-pool-sizing owns the
  capacity arithmetic; a long borrow alone is not proof of a leak.
- Before closing a JDBC `Connection`, explicitly commit or roll back an active transaction; JDBC
  does not define portable close behaviour with one active. Reset failures can cause a pool to
  evict rather than reuse the physical resource.
- Never let a resource escape into an asynchronous stage without moving ownership and cancellation
  policy with it.
  `try (var conn = pool.get()) { return async(conn); }` closes the connection before the
  future completes; the stage then fails with a closed-resource error under load and not in
  the test. Acquire inside the actual task where possible. A `whenComplete(close)` callback is
  insufficient if cancellation completes the exposed future before underlying use stops; release
  only after actual use terminates. Cancelling the dependent stage that performs cleanup can also
  prevent the callback from running. Keep cleanup under the lifetime owner's control and
  propagate/suppress close failure deliberately; see the async-resource reference.
- Do not use finalizers or rely on automatic `Cleaner` execution for a release deadline.
  An owned `close()` may invoke `Cleanable.clean()` for explicit release, with optional
  automatic cleanup/reporting. At-most-once action invocation neither makes concurrent losing
  callers wait for cleanup nor protects use against close. java-reference-types-and-leaks
  covers action capture, fallback timing and these explicit-clean limits.
- A virtual-thread-per-task executor removes its platform-worker cap. With one connection
  per worker task, a fixed 200-worker pool bounded those active acquisitions; the virtual-thread
  executor supplies no equivalent admission bound. An existing resource pool or admission policy
  may already suffice; the pool can block, time out or reject according to its contract.
  Verify the actual bound — a semaphore, admission policy or the pool's own limit; see
  concurrency-limiting-and-bulkheads.
- A permit/pool limit bounds active use, not tasks waiting for it. Bound admission/waiters and
  acquisition time as well; a timed-out caller must not release a permit while its work still
  uses the protected resource.
- `StructuredTaskScope` remains a preview API in Java 25 and changed across previews. Java 25
  `close()` cancels unfinished subtasks, waits for their threads, and reports missing `join()` or
  structural misuse. Cancellation is cooperative; a subtask that ignores interruption can delay
  close indefinitely. Pin the JDK/preview contract and do not transplant examples across releases.

Report the owner on success, partial acquisition, body failure, cancellation and close failure;
include the targeted tests actually run and remaining guarantees that depend on a driver/runtime.

## References

- [Designing an AutoCloseable](references/closeable-design.md) — read when writing a type
  that owns a resource, when wrapping or decorating one, when `close` can fail, or when
  deciding what a method that returns a resource promises its caller.
- [Resources across async, pooled and shutdown boundaries](references/async-and-pooled-resources.md)
  — read when a resource is used by an executor task, a `CompletableFuture` chain or a
  structured-concurrency fork, when a pool is exhausted under load, or when resources must
  be drained during shutdown.
