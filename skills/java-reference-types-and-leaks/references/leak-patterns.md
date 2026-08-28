# The leak catalogue and how to prove one

## Proving it is a leak first

A leak is a _rising floor_: the live set after a full collection grows monotonically with
cumulative traffic. Three observations settle it before any dump is taken:

- **Post-GC heap occupancy over hours**, from the GC log (`gc-log-analysis` has the parsing).
  Sawtooth with a flat floor is normal; sawtooth with a climbing floor is retention.
- **Whether a forced full collection recovers it.** `jcmd <pid> GC.run` followed by
  `GC.heap_info`. If the floor holds, the objects are reachable — no collector setting will
  help, and the investigation is about references, not about GC.
- **Correlation with a deploy or a traffic shape**, not with load alone. A leak proportional
  to _requests served_ points at request-scoped retention; one proportional to _time_ points
  at a scheduler or a listener registry; one proportional to _redeploys_ points at class
  loaders.

Then get the retaining path. In a heap dump, that is the dominator tree plus "path to GC
roots" excluding weak/soft references — heap-dump-analysis. On a live process,
`jdk.OldObjectSample` (in JFR's `profile` settings, or `-XX:StartFlightRecording:settings=profile`)
samples objects that survived long enough to be old and records their allocation stack and
the field path holding them; it is cheap enough to leave enabled and answers the same
question without a multi-gigabyte dump. **Under ZGC it is disabled from 25.0.4, 26.0.2 and
27** — the event's weak-handle implementation costs too much in generational ZGC
(JDK-8382740, fixVersion 27, backported to 26.0.2 and 25.0.4; release note JDK-8386620).
26.0.0 and 26.0.1 are unaffected. Note the update-release scoping: a JDK 25 baseline is
affected from 25.0.4 onward, so "we are on 25" does not exempt you — check the update.
Under an affected build the view is **empty, not an error**, so treat an empty
`memory-leaks-by-site` under ZGC as "not measured" and fall back to a heap dump.

## The catalogue

### 1. Obsolete references in a self-managed structure

An array-backed stack, ring buffer, free-list or object pool that decrements a size counter
but leaves the array slot pointing at the element. The container knows the element is dead;
the array does not.

```java
public E pop() {
    if (size == 0) throw new EmptyStackException();
    E result = elements[--size];
    elements[size] = null;      // obsolete reference cleared; without this the element and
    return result;              // everything it reaches stay live for the array's lifetime
}
```

Applies only to classes that manage their own memory. Nulling ordinary locals is not this
pattern and buys nothing.

### 2. Listener and callback registries

Anything with `addX`/`register` and no matching `removeX`/`deregister` call on every path,
including the exception path. The registry is long-lived, the listener is request- or
component-scoped, and the listener usually captures its enclosing object. Fix: deregister in
a `finally`, or hand out a `Subscription`/`Registration` handle that is `AutoCloseable` so
the caller cannot forget in a `try`-with-resources block.

### 3. ThreadLocal on a thread that outlives the work

`ThreadLocalMap` holds the key weakly and the **value strongly**. On a pooled platform thread
the value survives the request, and stale entries are only cleared opportunistically when
that thread next touches its map — which may be never for that slot.

```java
try {
    TENANT.set(tenantId);
    return handler.handle(request);
} finally {
    TENANT.remove();            // not set(null): that leaves the entry with a null value
}
```

Two aggravations: an `InheritableThreadLocal` copies the value into every thread created from
the current one, so a value set on a container thread propagates into pools created lazily;
and a `ThreadLocal` value that references an application class pins that class's loader
(see #6). On virtual threads the map dies with the thread, but the value now exists once per
task — use `ScopedValue` for request context there.

### 4. Unbounded caches and maps keyed by outside data

A `ConcurrentHashMap` keyed by user id, session id, correlation id, URL or tenant, with no
eviction. It is the same defect as an interning factory with no bound (java-object-construction),
and it grows exactly as fast as the system succeeds. Fix: a size- or time-bounded cache;
if entries have a natural end (a session, a request), remove them at that end and keep the
bound as the backstop.

### 5. Non-static nested classes, anonymous classes and capturing lambdas

A non-static inner class instance holds its enclosing instance. An anonymous class or a
lambda created in an instance context and touching any instance member does too. Harmless
while both are short-lived; a leak the moment the inner object is stored somewhere durable —
a registry, a cache, a scheduled task, a `CompletableFuture` that never completes.

```java
class ReportPage {                       // holds a large result set
    Runnable refreshTask() {
        return () -> reload(pageId);     // reload() is an instance method -> captures ReportPage.this
    }
}
scheduler.scheduleAtFixedRate(page.refreshTask(), ...);   // the whole page is now permanent
```

Fix: make the nested class `static` (a static nested class has no enclosing reference) and
pass only the values it needs — `long id = this.pageId; return () -> reload(id);`.

### 6. Class-loader retention

Diagnosis: Metaspace grows across redeploys, `jcmd <pid> VM.classloader_stats` shows loaders
for old application versions, and the heap contains several instances of the "same" class
whose `getClassLoader()` differ. The retaining reference always lives in a _longer-lived_
loader: a static registry in a shared library, a `ThreadLocal` on a container thread, a JDBC
driver registered with `DriverManager`, an unremoved shutdown hook, a JMX/MBean registration,
or a thread the application started and never joined. Fix each explicitly on undeploy — this
is one of the few places where "unregister everything you registered" is a hard requirement.

### 7. Long-lived collections of short-lived context

A queue, batch accumulator or in-memory buffer whose producer is faster than its consumer, or
whose consumer failed. The heap grows until OOM and the real defect is missing backpressure,
not missing weak references — see reactive-backpressure and concurrency-limiting-and-bulkheads.
A `LinkedBlockingQueue` with no capacity argument is unbounded by default and is the usual
instance.

### 8. Retained failure state

Error paths that accumulate: a list of failed messages "for later inspection", a map of
in-flight requests whose completion handler is only invoked on success, a `CompletableFuture`
map with no timeout removing entries, exception objects held in a diagnostics ring buffer with
their whole stack of captured locals. Distinctive shape: heap grows _only_ during incidents,
which is when it is least affordable.

## Fixing and verifying

For each finding, the fix names the owner and the removal point:

| Pattern             | Fix                                              | Verified by                                                              |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Obsolete slot       | null the slot on removal                         | unit test asserting the slot is null after `pop`                         |
| Listener            | `AutoCloseable` registration handle              | test that registers/closes N times and asserts registry size             |
| ThreadLocal         | `remove()` in `finally`, or `ScopedValue`        | test that runs a task twice on the same thread and asserts no carry-over |
| Unbounded map       | bounded cache + explicit removal at end of scope | load test comparing post-full-GC floor across two runs                   |
| Inner-class capture | `static` nested class + explicit parameters      | heap dump path-to-root no longer includes the enclosing type             |
| Class loader        | deregister drivers, hooks, MBeans, thread locals | Metaspace flat across three redeploys                                    |
| Unbounded queue     | bounded queue + rejection/backpressure policy    | load test that shows rejection rather than growth                        |

The acceptance criterion is always the same and always quantitative: same load profile, same
duration, and the post-full-collection live set no longer trends upward.
