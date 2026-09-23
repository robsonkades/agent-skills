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
        // Partial Java 25 sketch: authenticate and authorize tenant selection.
        Tenant tenant = authorizedTenant(req);
        try {
            RequestContext.with(tenant, () -> { chain.doFilter(req, res); return null; });
        } catch (IOException | ServletException e) {
            throw e;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new ServletException(e);
        }
    }
}
```

Uses the restricted helper from the migration reference in the same trusted package.
CallableOp has one exception type parameter: unrelated IOException and ServletException
can infer Exception, so preserve both declared exceptions explicitly at this boundary.
The filter binding covers synchronous doFilter, not async servlet or reactive request
lifetime. Use supported dispatch/task hooks at each actual execution boundary.

## Keeping MDC alive

MDC behavior depends on its logging adapter; ScopedValue does not populate it automatically.
Restore the previous key value at boundaries you own. This partial snippet uses non-throwing work:

```java
ScopedValue.where(TENANT, tenant).run(() -> {
    String previous = MDC.get("tenant");
    MDC.put("tenant", tenant.id());
    try {
        work();
    } finally {
        if (previous == null) MDC.remove("tenant"); else MDC.put("tenant", previous);
    }
});
```

A fresh thread per request avoids reuse across requests, but nesting and framework context
still require restoration. StructuredTaskScope does not itself guarantee MDC propagation;
adapter inheritance, instrumentation or wrappers may already carry it. When a bridge is needed:

```java
scope.fork(() -> {
    String previous = MDC.get("tenant");
    MDC.put("tenant", TENANT.get().id());
    try { return enrich(id); }
    finally { if (previous == null) MDC.remove("tenant"); else MDC.put("tenant", previous); }
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
  use `DelegatingSecurityContextExecutor` when submitting to an executor. Restore prior
  context in finally for manual bridges; use a fresh context and do not share mutable
  security state unsafely between tasks.

The same reasoning applies to any framework context whose read path you do not own: the
authoritative context may be the framework's, with ScopedValue as an application projection.
Do not treat a tenant header or a bound object as proof of authorization.

## OpenTelemetry

The default OTel ContextStorage is thread-local, and it already ships thread-boundary
helpers. Use them rather than hand-rolling:

```java
ExecutorService traced = Context.taskWrapping(executor);      // captures at submit
// or explicitly:
Context captured = Context.current();
executor.submit(() -> { try (Scope s = captured.makeCurrent()) { work(); } });
```

StructuredTaskScope does not itself propagate OTel storage. Instrumentation/wrappers may
already do so; when absent, wrap the fork body explicitly where implicit context is needed.
A span with neither a valid current parent nor an explicit parent starts a new trace.
`SpanBuilder.setParent(capturedContext)` can establish parentage without `makeCurrent()`;
downstream instrumentation that reads `Context.current()` still needs the appropriate scope.
See the [OpenTelemetry Java span/context API](https://opentelemetry.io/docs/languages/java/api/#span).

## `@Async`, `@Scheduled` and plain executors

These APIs do not automatically propagate bindings across threads; inline work may see the
executing thread's scope. Choose deliberately:

1. **Capture explicitly at the submission site** (shown in
   `references/threadlocal-migration.md`). Most honest, most verbose.
2. **Wrap the executor once** so every task carries the capture:

```java
ExecutorService contextual(ExecutorService delegate) {
    return new DelegatingExecutorService(delegate) {
        @Override public <T> Future<T> submit(Callable<T> task) {
            Tenant t = TENANT.get(); // this wrapper deliberately requires a binding
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
   cancellation together. Preserve intentionally independent background work and existing
   execution models; final ScopedValue does not make StructuredTaskScope non-preview.

Option 2 is partial: DelegatingExecutorService is application code, not a JDK class. Audit
all execution methods, lifecycle ownership and capture points. The sketch deliberately rejects
an unbound submitter. If absence is legitimate, define what the task must observe:

- Running without rebinding is valid only when the execution boundary guarantees this key is
  unbound. A task captured without a tenant and later invoked inside tenant B's dynamic scope
  otherwise reads B. Capture-time `isBound()` does not clear execution-time context.
- If true unbound semantics must be preserved, keep that unbound execution guarantee or reject
  the submission; the API has no operation to temporarily unbind an already-bound key.
- Alternatively, make absence explicit in the context model, such as
  `ScopedValue<Optional<Tenant>>`, and bind the captured `Optional.empty()` around the task.
  This masks an outer value but is a deliberate reader-contract change: `isBound()` is true
  and readers inspect the optional. Do not silently substitute it for an API requiring an
  unbound key.

Binding null is also a binding, not absence: `where(KEY, null)` is legal, while `orElse(null)`
throws `NullPointerException` in Java 25. Verify normal and exceptional restoration under an
existing outer binding, plus the hostile case of absent capture followed by execution under
another tenant. The [Java 25 ScopedValue contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ScopedValue.html)
defines reads by the current thread's dynamic scope; an
[Executor](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Executor.html)
does not promise that execution starts in an empty context.

## What still needs an explicit capture

- Anything crossing a **process** boundary: a header on the outbound HTTP call, a message
  property. `ScopedValue` is in-process only.
- Anything crossing a **queue**: a task persisted now and run later carries nothing.
- A callback registered with a library that will invoke it on its own thread later.
- A deadline. Carry the existing monotonic local deadline and derive each call's timeout
  from its remaining budget; binding it neither enforces nor resets that budget. Absolute
  wall-clock/wire deadlines have separate clock assumptions — see `timeouts-and-deadlines`.

## Review checklist

- [ ] Bindings match actual execution boundaries, including asynchronous dispatch
- [ ] `call` used where the operation throws checked exceptions or returns a value
- [ ] MDC projections restore previous values and preserve unrelated keys
- [ ] Security context set inside subtasks rather than switched to inheritable mode
- [ ] Executor-crossing work either wraps context explicitly or is moved into a scope
- [ ] Absent capture cannot expose another task's context; null/optional bindings are not
      mistaken for an unbound key
- [ ] Cross-process context travels as a header or message property, not as a scoped value
