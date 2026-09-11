---
name: scoped-values
description: >
  ScopedValue as one-way, immutable, lexically bounded context: where/run/call, rebinding in
  a nested scope, inheritance by StructuredTaskScope subtasks and by nothing else, and the
  cases where ThreadLocal is still the right answer. Final in JDK 25 (JEP 506) after four
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

Inspect the project's Java/runtime and framework versions before applying the Java 25
examples. Preserve the target and preview policy; this skill does not authorize upgrades.
Report the binding owner, value ownership, execution boundaries and validation gaps.

1. **Classify the `ThreadLocal` first.** Context flowing one way from caller to callee is
   what `ScopedValue` replaces. A per-thread **cache** of an expensive object is a
   different problem and stays a pool or a cache, not a `ScopedValue`.
2. **Establish the binding at the outermost boundary that owns it** — the request filter,
   the message-consumer loop, the job runner — never inside the code that reads it.
3. **Prefer immutable values.** A binding does not freeze its referent; mutable values need
   explicit confinement or synchronization for all concurrent access.
4. **Check the thread and dynamic scope.** Same-thread synchronous calls see the binding;
   registration inside a scope alone does not propagate it to deferred work.
5. **Use structured inheritance when appropriate.** Bind before creating StructuredTaskScope:
   it captures bindings at creation. Existing executors can use explicit capture/rebinding.
6. **Bridge, do not replace, framework context.** MDC, `SecurityContextHolder` and the
   OpenTelemetry `Context` are the framework's; set them from the scoped value at the
   boundary where needed, restoring previous context. The framework may remain the
   authoritative source; do not invent competing authentication or transaction state.

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
  returns, including exceptional return. This protects the binding, not object fields or
  authorization policy.
- `get()` on an unbound value throws `NoSuchElementException` — deliberately, rather than
  returning null. Use `orElse(default)` where absence is legitimate, `isBound()` to branch,
  and `orElseThrow(...)` for a domain-specific failure. `where(KEY, null)` is legal in Java 25,
  but `orElse(null)` throws `NullPointerException`, even when bound; this changed on finalization.
  A null result from `get()` does **not** imply "unbound". Use `isBound()` when distinguishing
  absence from a deliberately nullable binding.
- **Automatic cross-thread inheritance uses StructuredTaskScope**, captured when the scope
  is created. Forking under different or rebound bindings throws `StructureViolationException`;
  if subtasks need a nested binding, open their scope inside it. See `structured-concurrency`
  for scope ownership and closure. Plain threads do not inherit; executor/CompletableFuture/@Async submission
  does not itself propagate bindings. Inline execution or synchronous stages can see the
  executing thread's current binding, and wrappers can explicitly bind a captured value.
  Do not rely on this timing accident. There is no `InheritableScopedValue`.
- The bound value is shared by reference. The reference implementation inherits the binding
  set essentially by copying a pointer rather than copying an inheritable-thread-local map.
  This is why immutable values are the default; a mutable referent still requires ordinary
  synchronization.
- `ThreadLocal` is not deprecated and not an anti-pattern. The JDK uses it. Keep it for a
  genuine per-thread cache with a bounded number of threads, and for interop with any API
  that reads one — which is most frameworks.
- Match the binding to the owned operation. A one-job CLI may bind around its whole `main`;
  a long-running server must not carry one request's tenant across unrelated requests.
  For ordinary process configuration or a short call chain, explicit objects/parameters may
  already be sufficient; do not introduce scoped context solely to hide them.
- Reading is fast — comparable to a local variable, with a small per-thread cache — but that
  is an implementation property, not a specification. Do not design around it; do not
  measure a micro-benchmark of `get()` and conclude anything about the application.
- Under virtual threads, reason from retained state rather than slogans: a 1 KB object set
  as a distinct object in each of one million live virtual threads retains roughly 1 GB of payload before map and
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
