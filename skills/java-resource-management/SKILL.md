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

1. **Name the owner.** Exactly one scope acquires and releases. A method that receives an
   open resource as a parameter does not close it — the caller does. Write the ownership
   in the Javadoc; it is the part no signature expresses.
2. **Make the scope lexical.** Acquire in a `try`-with-resources header. If the resource
   must outlive the method, the method is not the owner — return it, and let the owner's
   scope hold it.
3. **Declare each resource separately.** `try (var raw = open(); var buf = wrap(raw))`, not
   a nested constructor chain: if the outer constructor throws, the inner resource is
   already open and nothing references it.
4. **Decide what a failing `close` means.** For a reader, suppression is right. For a
   writer, `close` is where the flush happens, so a failed `close` means the data was not
   written and the operation must fail — an unchecked `close()` in a `try`-with-resources
   already does this; a `close` swallowed in `finally` silently loses data.
5. **Check every escape route.** A resource captured by a lambda submitted to an executor,
   stored in a field, returned inside a `Stream`, or held across a `CompletableFuture`
   boundary has left the lexical scope. Either the scope must wait, or ownership must move.
6. **Verify on the failure path.** A test that throws from inside the body and asserts the
   resource was closed once. That path is the one that leaks in production.

## Rules

- `try`-with-resources over `try`-`finally`, always, including for several resources and for
  a resource that may be null-checked around. Resources close in reverse declaration order,
  and an exception from `close` is _suppressed_ onto the body's exception rather than
  replacing it — `getSuppressed()` recovers it. `finally` inverts that: the body's exception
  is lost and the diagnosis starts from the wrong stack trace.
- Since Java 9 an existing effectively-final variable can be used directly:
  `try (existingResource)`. There is no reason left to write `try (var r = existingResource)`
  and then wonder who owns it.
- Implement `Closeable` (which is `AutoCloseable` narrowed to `IOException`) when the
  resource is I/O; implement `AutoCloseable` otherwise, and declare the narrowest exception
  the close can actually throw — never `throws Exception`, which forces every caller to
  catch it.
- Make `close` idempotent. `Closeable` requires it; `AutoCloseable` only advises it, and
  decorators, pools and error paths all call it twice sooner or later.
- `close` must not block indefinitely and must not do work that can fail after the point of
  no return. A `close` that flushes over a network needs the same timeout discipline as any
  other remote call — see timeouts-and-deadlines.
- Most streams need no closing; the ones backed by an I/O resource do — `Files.lines`,
  `Files.walk`, `Files.list`, `Files.newDirectoryStream`. A method that returns such a
  stream has handed the caller a resource, and its Javadoc must say so.
- `ExecutorService` has been `AutoCloseable` since Java 19, and its `close()` initiates an
  orderly shutdown and then _blocks until all submitted tasks finish_. In
  `try`-with-resources that is a join point, not a cheap release: a long-running task makes
  the enclosing method hang there. If the calling thread is interrupted while waiting,
  `close` stops executing tasks as if by `shutdownNow`, keeps waiting for those already
  running, and re-asserts the interrupt before returning. Use it when the block genuinely owns the work; use
  explicit `shutdown`/`awaitTermination` with a bound when it does not.
- A pooled resource is _returned_, not destroyed — but the caller's code is identical:
  `close()` on a pooled `Connection` gives it back. Holding one beyond the operation is the
  same defect as leaking it, because the pool is the real bound; connection-pool-sizing owns
  the arithmetic.
- Never let a resource escape into an asynchronous stage without moving ownership with it.
  `try (var conn = pool.get()) { return async(conn); }` closes the connection before the
  future completes; the stage then fails with a closed-resource error under load and not in
  the test. Either block inside the scope, or make the completion stage do the closing.
- Do not use finalizers, and do not reach for `Cleaner` as the primary release mechanism —
  it is a safety net that logs a leak, if it runs at all. java-reference-types-and-leaks
  covers when a safety net is justified and how to write one that can actually fire.
- Virtual threads remove the thread as the implicit limit on concurrent resources. One
  connection per task was bounded by a 200-thread pool; on
  `newVirtualThreadPerTaskExecutor` it is bounded by nothing until the pool refuses. The
  bound must become explicit — a semaphore or the pool's own limit; see
  concurrency-limiting-and-bulkheads.

## References

- [Designing an AutoCloseable](references/closeable-design.md) — read when writing a type
  that owns a resource, when wrapping or decorating one, when `close` can fail, or when
  deciding what a method that returns a resource promises its caller.
- [Resources across async, pooled and shutdown boundaries](references/async-and-pooled-resources.md)
  — read when a resource is used by an executor task, a `CompletableFuture` chain or a
  structured-concurrency fork, when a pool is exhausted under load, or when resources must
  be drained during shutdown.
