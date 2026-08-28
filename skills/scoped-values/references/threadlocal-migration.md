# Migrating from ThreadLocal

## Classify before rewriting

| What the `ThreadLocal` holds                                                       | Replace with                                             | Why                                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Per-request context read by indirect callees                                       | `ScopedValue`                                            | one-way, immutable, lifetime is the block                                           |
| An expensive object reused per thread (`SimpleDateFormat`, a buffer, a connection) | a pool, or a shared immutable instance                   | a per-thread cache multiplied by a million threads is a leak with a nicer name      |
| Mutable state a callee writes back to the caller                                   | a return value, or an explicit accumulator object        | the write-back is the design defect; `ScopedValue` cannot express it and should not |
| A framework's own context (`MDC`, `SecurityContextHolder`)                         | keep it, and set it from a `ScopedValue` at the boundary | the framework owns the read path                                                    |
| A cache keyed by thread in a **bounded** platform pool                             | leave it alone                                           | it works, it is measured, and churn has a cost                                      |

Only the first row is a `ScopedValue`. Rewriting the second row into a `ScopedValue`
recreates the expensive object on every request, which is a latency regression disguised as
modernisation.

## The mechanical rewrite

```java
// Before
public final class RequestContext {
    private static final ThreadLocal<Tenant> TENANT = new ThreadLocal<>();

    public static void set(Tenant t) { TENANT.set(t); }      // anyone, any time
    public static Tenant get() { return TENANT.get(); }      // null if nobody set it
    public static void clear() { TENANT.remove(); }          // and if you forget: a leak
}

// After
public final class RequestContext {
    private static final ScopedValue<Tenant> TENANT = ScopedValue.newInstance();

    public static <R, X extends Throwable> R with(Tenant t, ScopedValue.CallableOp<R, X> op)
            throws X {
        return ScopedValue.where(TENANT, t).call(op);        // binding lives exactly here
    }

    public static Tenant current() {
        return TENANT.orElseThrow(() -> new IllegalStateException("no tenant bound"));
    }
}
```

Three things changed and each is the point: there is no setter, there is no `clear()` to
forget, and the failure mode for "nobody bound it" is an exception at the read rather than a
`null` that travels three frames before it becomes an NPE.

Keep the `ScopedValue` field **private**. It is a capability: whoever can see it can bind
it. Package-private is the widest that is usually defensible.

## Binding several values

```java
ScopedValue.where(TENANT, tenant)
           .where(PRINCIPAL, principal)
           .where(DEADLINE, Instant.now().plusMillis(800))
           .run(() -> handler.handle(request));
```

One carrier, one scope, one nesting level. A chain of nested `run` calls does the same thing
with more stack and no benefit.

## Rebinding for callees

```java
private static final ScopedValue<Tenant> TENANT = ScopedValue.newInstance();

void handleAdminRequest() {
    // TENANT is "acme" here
    ScopedValue.where(TENANT, Tenant.SYSTEM).run(() -> {
        migrate();          // sees SYSTEM
    });
    // TENANT is "acme" again — this frame never saw the change
}
```

Rebinding is visible to callees only. The method that rebinds cannot change what it itself
sees, which is what makes "who could have modified this?" answerable by reading the code.

## `InheritableThreadLocal` has no equivalent, on purpose

```java
// Before: every child thread gets a COPY of every inheritable value
private static final InheritableThreadLocal<Tenant> TENANT = new InheritableThreadLocal<>();
new Thread(() -> useTenant()).start();               // works

// After: only a structured fork inherits
try (var scope = StructuredTaskScope.open()) {       // preview API — see structured-concurrency
    scope.fork(() -> useTenant());                   // sees the binding, by reference
    scope.join();
}

Thread.ofVirtual().start(() -> useTenant());          // sees NOTHING: NoSuchElementException
executor.submit(() -> useTenant());                   // sees NOTHING
CompletableFuture.supplyAsync(() -> useTenant());     // sees NOTHING
```

This is the migration's sharpest edge. Code that used `InheritableThreadLocal` and started
its own threads keeps compiling and starts failing at runtime, in the branch that starts the
thread. Find those call sites before the rewrite, not after:

```bash
rg -n 'InheritableThreadLocal|new Thread\(|ofVirtual\(\)\.start|executor\.(submit|execute)'
```

Where a plain executor must keep working, capture explicitly at submission:

```java
Tenant captured = TENANT.get();                             // on the caller
executor.submit(() -> ScopedValue.where(TENANT, captured).run(this::work));
```

## What to do about `clear()` and leaks

A `ThreadLocal` on a pooled platform thread must be removed in a `finally`, or the next task
on that thread reads the previous task's user — a real security bug, not a tidiness issue.
The whole class of bug disappears with `ScopedValue` because the binding is popped when the
block exits, including on exception.

While both exist during a migration, keep the `finally` and add an assertion in the filter
that the context is empty on entry. That assertion is what catches the one path that still
sets without removing.

## Testing code that reads a binding

```java
@Test
void pricingUsesTheBoundTenant() {
    Price p = ScopedValue.where(TENANT, Tenant.of("acme"))
            .call(() -> pricing.quote(sku));         // bind in the test, as production does
    assertEquals(…, p);
}

@Test
void failsClearlyWhenNothingBound() {
    assertThrows(IllegalStateException.class, () -> pricing.quote(sku));
}
```

The second test is the one worth having: it pins the behaviour that used to be a silent
`null`. If a helper is needed in many tests, write a JUnit extension that binds a default
context around the test method — but keep at least one test that runs unbound.

## Review checklist

- [ ] Every `ThreadLocal` classified against the table above before being touched
- [ ] `ScopedValue` fields are `private static final` and never exposed by a getter
      returning the `ScopedValue` itself
- [ ] The bound value is deeply immutable
- [ ] Binding happens at one boundary per entry point, not scattered
- [ ] No `Thread.start`, `executor.submit` or `CompletableFuture` on a path that expects to
      inherit a binding — or an explicit capture at each one
- [ ] Unbound reads use `orElse`/`orElseThrow` with a message that names the missing context
- [ ] A test exercises the unbound path
