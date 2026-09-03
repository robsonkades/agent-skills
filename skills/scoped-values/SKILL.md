---
name: scoped-values
description: >
  ScopedValue as one-way, immutable, lexically bounded context: where/run/call, rebinding in
  a nested scope, inheritance by StructuredTaskScope subtasks and by nothing else, and the
  cases where ThreadLocal is still the right answer. Final in JDK 25 (JEP 506) after five
  preview rounds, with callWhere and runWhere removed along the way. Use when a ThreadLocal
  carries per-request context under virtual threads, when context is empty inside a forked
  subtask or a pool thread, when a ThreadLocal is never removed and leaks across pooled
  tasks, when code calls ScopedValue.get outside any binding and gets
  NoSuchElementException, when callWhere or runWhere appears in an example, or when MDC or
  SecurityContextHolder must keep working. Not the fan-out that inherits
  (structured-concurrency), ThreadLocal-as-cache sizing (thread-sizing-and-virtual-threads),
  deadlines (timeouts-and-deadlines), or context across CompletableFuture stages
  (completablefuture-composition).
---

# Scoped Values

## Purpose

Carry per-request context — tenant, principal, correlation id, deadline — to indirect
callees without a parameter on every method, and without the three defects of
`ThreadLocal`: unconstrained mutation, lifetime that must be cleared manually, and expensive
`InheritableThreadLocal` inheritance.

The failure this prevents is subtler than a leak. `ThreadLocal` under a pool can outlive the
task that set it; under virtual threads, every thread that sets a value owns an entry, so
per-thread state can multiply dramatically. Only inheritable thread-local maps are copied
when child threads are created. `ScopedValue` makes the lifetime syntactic: the binding
exists for the duration of one `run`/`call` and cannot be changed from underneath.

## Workflow

1. **Classify the `ThreadLocal` first.** Context flowing one way from caller to callee is
   what `ScopedValue` replaces. A per-thread **cache** of an expensive object is a
   different problem and stays a pool or a cache, not a `ScopedValue`.
2. **Establish the binding at the outermost boundary that owns it** — the request filter,
   the message-consumer loop, the job runner — never inside the code that reads it.
3. **Keep the value immutable.** A `ScopedValue` holding a mutable object restores exactly
   the defect it was designed to remove; the binding is immutable, the referent is not.
4. **Check the read path is inside the dynamic scope.** Anything invoked from `run`/`call`
   sees the binding; anything scheduled to run later does not.
5. **Fork with `StructuredTaskScope`** if subtasks must see the context. That is the only
   inheritance mechanism.
6. **Bridge, do not replace, framework context.** MDC, `SecurityContextHolder` and the
   OpenTelemetry `Context` are the framework's; set them from the scoped value at the
   boundary rather than rewriting the framework's plumbing.

## Rules

- **Final since JDK 25** (JEP 506). Incubated in 20, previewed 21–24. On JDK 21–24 it needs
  `--enable-preview` and has an older shape; on 25 and later it does not.
- The static `ScopedValue.callWhere(...)` and `runWhere(...)` forms were **removed** before
  finalisation. The only entry point is
  `ScopedValue.where(KEY, value).run(op)` / `.call(op)`, with `.where(...)` chained on the
  `Carrier` to bind several values at once.
- `Carrier.call` takes a `ScopedValue.CallableOp<R, X>`, not a `Callable`: it can propagate a
  declared exception type without wrapping. `Carrier.run` takes a plain `Runnable`.
- **There is no `set`.** A callee cannot change what its caller sees. It can _rebind_ for its
  own callees with a nested `where(...).run(...)`, and the outer binding reappears when that
  returns. This is the entire safety argument; a design that needs mutation needs a
  different mechanism.
- `get()` on an unbound value throws `NoSuchElementException` — deliberately, rather than
  returning null. Use `orElse(default)` where absence is legitimate, `isBound()` to branch,
  and `orElseThrow(...)` for a domain-specific failure. Both `where(KEY, null)` and
  `orElse(null)` are legal in Java 25, so `get() == null` does **not** imply "unbound"; avoid
  null bindings when absence must stay distinguishable.
- **Inheritance happens only through `StructuredTaskScope.fork`.** A thread started with
  `Thread.ofVirtual().start(...)`, a task submitted to an `ExecutorService`, a
  `CompletableFuture` stage and a `@Async` method all see **nothing**. There is no
  `InheritableScopedValue`.
- The bound value is shared by reference. The reference implementation inherits the binding
  set essentially by copying a pointer rather than copying an inheritable-thread-local map.
  This is why immutable values are the default; a mutable referent still requires ordinary
  synchronization.
- `ThreadLocal` is not deprecated and not an anti-pattern. The JDK uses it. Keep it for a
  genuine per-thread cache with a bounded number of threads, and for interop with any API
  that reads one — which is most frameworks.
- A `ScopedValue` bound around a whole application lifetime is a global variable with extra
  syntax. If the binding is not shorter-lived than the process, it is not carrying context.
- Reading is fast — comparable to a local variable, with a small per-thread cache — but that
  is an implementation property, not a specification. Do not design around it; do not
  measure a micro-benchmark of `get()` and conclude anything about the application.
- Under virtual threads, reason from retained state rather than slogans: a 1 KB object set
  in each of one million live virtual threads retains roughly 1 GB of payload before map and
  object overhead, while one immutable object bound through a structured subtree is shared.
  Measure live-thread count and retained heap; not every `ThreadLocal` is set on every thread.

## References

- [Migrating from ThreadLocal](references/threadlocal-migration.md) — the classification
  table (context / cache / mutable state), the mechanical rewrite, rebinding, what to do
  with `InheritableThreadLocal`, and testing code that reads a binding. Read before
  changing an existing `ThreadLocal`.
- [Bridging framework context](references/context-propagation-bridges.md) — where the
  binding belongs in a Spring or Jakarta request path, keeping MDC, security context and
  OpenTelemetry working, propagation across executors and `@Async`, and what still needs an
  explicit capture. Read when the context must reach code you do not own.
