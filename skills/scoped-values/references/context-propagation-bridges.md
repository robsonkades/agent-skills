# Bridging framework context

## Where the binding belongs

One binding per entry point, at the outermost place that knows the context, wrapping
everything downstream:

| Entry point       | Bind in                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| HTTP request      | a servlet `Filter` (or `OncePerRequestFilter`) around `chain.doFilter` |
| Message consumer  | the listener wrapper, around the handler call                          |
| Scheduled job     | the job runnable, first statement                                      |
| CLI / batch entry | `main`, around the whole run                                           |
| Test              | the test method or a JUnit extension                                   |

```java
public class TenantFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        Tenant tenant = Tenant.of(req.getHeader("X-Tenant"));

        ScopedValue.where(RequestContext.TENANT, tenant)
                   .run(() -> {
                       try {
                           chain.doFilter(req, res);      // everything downstream is inside
                       } catch (IOException | ServletException e) {
                           throw new UncheckedFilterException(e);   // Runnable cannot declare
                       }
                   });
    }
}
```

The checked-exception dance is the one genuine friction point of `run`. `Carrier.call` takes
a `ScopedValue.CallableOp<R, X>` that _can_ declare a thrown type, so prefer `call` wherever
the operation returns a value or throws something checked:

```java
ScopedValue.where(RequestContext.TENANT, tenant)
           .call(() -> { chain.doFilter(req, res); return null; });   // X inferred
```

## Keeping MDC alive

Logging back-ends read `MDC`, which is a `ThreadLocal`. A `ScopedValue` does not populate
it. Set both at the boundary, and clear the MDC where it is set:

```java
ScopedValue.where(TENANT, tenant).run(() -> {
    MDC.put("tenant", tenant.id());
    try {
        chain.doFilter(req, res);
    } finally {
        MDC.remove("tenant");          // still required: MDC is thread-scoped, not block-scoped
    }
});
```

Under virtual threads with thread-per-request, MDC leakage between requests stops being
possible (the thread ends with the request), but the `remove` is still correct and costs
nothing — and it is what keeps the code right when a platform-thread pool is reintroduced
anywhere.

Inside a `StructuredTaskScope`, the `ScopedValue` is inherited and the MDC is **not**. A
subtask that logs will log without the tenant field unless the subtask sets it:

```java
scope.fork(() -> {
    MDC.put("tenant", TENANT.get().id());     // from the inherited binding
    try { return enrich(id); } finally { MDC.clear(); }
});
```

That two-line preamble is worth wrapping in one helper used by every fork in the codebase.

## Spring Security

`SecurityContextHolder` is `ThreadLocal`-based (or `InheritableThreadLocal` with
`MODE_INHERITABLETHREADLOCAL`). Do not try to replace it — the framework reads it from
places you do not control, including expression-based access control. Two rules:

- Do not switch it to `MODE_INHERITABLETHREADLOCAL` to "fix" missing context in child
  threads under virtual threads. It copies per child thread and reintroduces exactly the
  footprint problem, while still not covering executor submissions.
- In a `StructuredTaskScope`, set it inside the subtask from the inherited scoped value, or
  use `DelegatingSecurityContextExecutor` when submitting to an executor.

The same reasoning applies to any framework context whose read path you do not own: the
`ScopedValue` is the source of truth, the `ThreadLocal` is a projection of it established at
each thread boundary.

## OpenTelemetry

The OTel `Context` is also `ThreadLocal`-based, and it already ships thread-boundary
helpers. Use them rather than hand-rolling:

```java
ExecutorService traced = Context.taskWrapping(executor);      // captures at submit
// or explicitly:
Context captured = Context.current();
executor.submit(() -> { try (Scope s = captured.makeCurrent()) { work(); } });
```

Inside a structured scope the parent span is _not_ inherited by the subtask automatically;
wrap the fork body the same way. A subtask that starts a span without making the parent
current produces an orphan trace — which looks in the UI exactly like a service that did not
call anything.

## `@Async`, `@Scheduled` and plain executors

None of these inherit a `ScopedValue`. Choose one of:

1. **Capture explicitly at the submission site** (shown in
   `references/threadlocal-migration.md`). Most honest, most verbose.
2. **Wrap the executor once** so every task carries the capture:

```java
ExecutorService contextual(ExecutorService delegate) {
    return new DelegatingExecutorService(delegate) {
        @Override public <T> Future<T> submit(Callable<T> task) {
            Tenant t = TENANT.orElse(null);
            Context otel = Context.current();
            return delegate.submit(() -> ScopedValue.where(TENANT, t).call(() -> {
                try (Scope s = otel.makeCurrent()) { return task.call(); }
            }));
        }
        // …the other submit/execute overloads, all of them
    };
}
```

3. **Do not cross the boundary at all.** If the work belongs to the request, a
   `StructuredTaskScope` inside the request keeps the context, the lifetime and the
   cancellation together — and is usually the reason the `@Async` existed.

Option 2 has a trap worth stating: `TENANT.orElse(null)` binds `null` when nothing was
bound, and `ScopedValue.where(KEY, null)` then binds null, so `get()` returns null instead of
throwing. Either forbid the unbound case at the wrapper, or branch on `isBound()`.

## What still needs an explicit capture

- Anything crossing a **process** boundary: a header on the outbound HTTP call, a message
  property. `ScopedValue` is in-process only.
- Anything crossing a **queue**: a task persisted now and run later carries nothing.
- A callback registered with a library that will invoke it on its own thread later.
- A deadline. `ScopedValue` can carry the `Instant`, but every downstream call still needs
  its own timeout derived from it — see `timeouts-and-deadlines`.

## Review checklist

- [ ] Exactly one binding site per entry point, at the outermost boundary
- [ ] `call` used where the operation throws checked exceptions or returns a value
- [ ] MDC set and removed at each thread boundary, including inside every fork
- [ ] Security context set inside subtasks rather than switched to inheritable mode
- [ ] Executor-crossing work either wraps context explicitly or is moved into a scope
- [ ] No `where(KEY, null)` reachable from an unbound path
- [ ] Cross-process context travels as a header or message property, not as a scoped value
