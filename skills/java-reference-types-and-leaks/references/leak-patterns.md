# The leak catalogue and how to prove one

## Proving it is a leak first

A defect is not proven by a rising floor alone. More reachable state after equivalent
reclamation points is a retention signal; decide whether it violates an ownership, expiry
or capacity contract. Reuse existing paths, captures and workload evidence. The following
observations can strengthen or falsify a hypothesis; they are not prerequisites for using
an already available dump:

- **Post-GC heap occupancy over hours**, from the GC log (`gc-log-analysis` has the parsing).
  A comparable climbing floor is a retention signal; cache warm-up or legitimate state
  growth may explain it.
- **Whether an equivalent complete reclamation point recovers it.** A forced
  `jcmd <pid> GC.run` is a high-impact intervention and should be used only on a drained or
  controlled instance. If the floor holds, reachability/collector policy/capture timing
  still need separation; a heap flag cannot fix an application ownership defect.
- **Correlation with a deploy or a traffic shape**, not with load alone. Request count,
  elapsed time and redeploy count suggest different owners to investigate; none identifies
  a request, scheduler, listener or loader leak without the retaining path and lifetime contract.

Then get the retaining path. In a heap dump, that is the dominator tree plus "path to GC
roots" excluding weak/soft references — heap-dump-analysis. On a live process,
`jdk.OldObjectSample` provides selected retained-object samples, not a heap census. In the
OpenJDK 25.0.3 settings it is enabled in both shipped files, but `default.jfc` records **no stack trace** for
it and `profile.jfc` does (`old-objects-stack-trace`), so a recording started with the
defaults names the object and not the allocation site. The reference chain to a GC root is
computed only when the recording is written with `path-to-gc-roots=true`
(`jcmd <pid> JFR.dump filename=leaks.jfr path-to-gc-roots=true`, or the same option on
`JFR.start`); that walk is itself a stop-the-world heap traversal, so ask for it once at
dump time, not on a continuous recording. With those two settings the event answers the
same broad question as a dump, but sampled and with different completeness.

**Settings do not establish runtime support.** OpenJDK [25.0.3](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/jfr/leakprofiler/leakProfiler.cpp)
excludes Shenandoah; [25.0.4](https://github.com/openjdk/jdk25u/blob/jdk-25.0.4%2B7/src/hotspot/share/jfr/leakprofiler/leakProfiler.cpp)
also excludes ZGC. [JDK-8382740](https://bugs.openjdk.org/browse/JDK-8382740) disables the event
because sampling can keep young ZGC objects alive until an old-generation collection and
cause allocation stalls; this mitigation is distinct from fixing the underlying
[JDK-8375615](https://bugs.openjdk.org/browse/JDK-8375615). Inspect exact vendor/build and
`jfr+system` diagnostics before capture. On a supported affected build, prefer other existing
evidence or assess sampling overhead in a controlled environment. An empty view can reflect
unsupported/disabled sampling or no observed samples; it does not prove no retention. Use a
controlled heap dump when complete heap evidence is needed.

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

This is about stale container slots; ordinary locals require an actual liveness problem
before explicit nulling is justified.

### 2. Listener and callback registries

A long-lived registry keeps a request- or component-scoped listener beyond its intended
lifetime, often retaining the listener's enclosing object. Fix: deregister on that scope's
exit, including failures, or expose an `AutoCloseable` registration handle the owner can use
with try-with-resources. An intentional application-lifetime listener needs no per-request removal.

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

Two aggravations: an `InheritableThreadLocal` can pass values to child threads, so a value
set on a container thread can propagate into pools created lazily;
and a `ThreadLocal` value that references an application class pins that class's loader
(see #6). Virtual-thread termination releases the map; blocked or long-lived tasks still
retain values. Consider supported `ScopedValue` for scoped context, without changing a
legitimate per-thread/framework contract or raising the project's baseline.

The remove-in-finally sketch assumes this scope owns the binding. For nested/reentrant scopes,
restore the outer binding on exit through an explicit scope abstraction; unconditional removal
can erase the caller's context. Thread inheritance can be disabled and `childValue` customized,
so inspect the actual thread factory and ThreadLocal subclass rather than assuming every child inherits.

### 4. Unbounded caches and maps keyed by outside data

A disposable cache keyed by outside data can exceed its budget when distinct retained keys
or values keep growing. Check cardinality, payload and lifetime before diagnosing a plain
map or interning factory (java-object-construction). Preserve an adequate finite map.
For a cache, use count/weight limits and expiry where required; time alone does not bound
memory under unlimited arrivals. Remove scoped entries at their actual end. Required state
or recovery records cannot simply be evicted like recomputable cache entries.

### 5. Non-static nested classes, anonymous classes and capturing lambdas

A non-static inner class can retain its enclosing instance; javac can omit an unused outer
field in some cases ([JDK-8271623](https://bugs.openjdk.org/browse/JDK-8271623)). Inspect the
actual fields/capture path. A lambda that calls an instance member captures its receiver.
Long-lived storage is a defect only when it exceeds the captured owner's intended lifetime.

```java
class ReportPage {                       // holds a large result set
    Runnable refreshTask() {
        return () -> reload(pageId);     // reload() is an instance method -> captures ReportPage.this
    }
}
scheduler.scheduleAtFixedRate(page.refreshTask(), ...);   // retains page while the task is retained
```

Fix the registration lifetime or narrow the capture. A `static` nested class has no implicit
enclosing reference; pass only the values/services it should retain. Merely copying `pageId` and then calling the
instance method `reload(id)` still captures `this`; call a deliberately retained service,
for example `var loader = this.loader; long id = pageId; return () -> loader.reload(id);`.

### 6. Class-loader retention

Diagnosis: Metaspace grows across redeploys, `jcmd <pid> VM.classloader_stats` shows loaders
for old application versions, and the heap contains several instances of the "same" class
whose `getClassLoader()` differ. The retaining path crosses into a _longer-lived_ owner/root,
which may belong to another loader or to native/runtime state: a static registry in a shared
library, a `ThreadLocal` on a container thread, a JDBC
driver registered with `DriverManager`, an unremoved shutdown hook, a JMX/MBean registration,
or a thread the application started and never joined. Fix each explicitly on undeploy — this
is one of the few places where "unregister everything you registered" is a hard requirement.

### 7. Long-lived collections of short-lived context

A queue, batch accumulator or buffer can exceed its budget when production outpaces
consumption or the consumer fails. A bounded backlog within its delivery/lifetime contract
is not itself a leak. When growth is uncontrolled, inspect admission, backpressure and
consumer recovery — see reactive-backpressure and concurrency-limiting-and-bulkheads.
A no-argument `LinkedBlockingQueue` has capacity `Integer.MAX_VALUE`, usually an ineffective
memory budget rather than practical protection.

### 8. Retained failure state

Error paths that accumulate: a list of failed messages "for later inspection", a map of
in-flight requests whose completion handler is only invoked on success, recovery records
without a terminal-state/retention policy, exception objects held in a diagnostics ring buffer with
causes, suppressed exceptions, custom fields or runtime backtrace metadata. A normal Java stack
trace does not snapshot arbitrary local variables. Distinctive shape: heap grows _only_ during incidents,
which is when it is least affordable. Caller timeout is not proof the underlying work ended:
retain necessary work/recovery ownership until actual completion or a valid handoff. Bound
admission and diagnostic retention without silently discarding authoritative state.

## Fixing and verifying

For each finding, the fix names the owner and the removal point:

| Pattern             | Fix                                                  | Verified by                                                             |
| ------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Obsolete slot       | null the slot on removal                             | unit test asserting the slot is null after `pop`                        |
| Listener            | `AutoCloseable` registration handle                  | test that registers/closes N times and asserts registry size            |
| ThreadLocal         | remove owned binding; restore outer scope            | reused-thread isolation and nested-scope restoration tests              |
| Unbounded map       | capacity/lifetime policy preserving required state   | retained count/bytes within budget under representative arrivals        |
| Inner-class capture | shorten registration or narrow retained references   | unwanted root path removed; callback behavior preserved                 |
| Class loader        | release longer-lived registrations and owned threads | obsolete loader roots gone; unloading opportunity accounted for         |
| Unbounded queue     | bounded admission/backpressure and consumer recovery | overload obeys buffer/delivery policy; work outside queue accounted for |

Acceptance is quantitative but pattern-specific: normalize load/duration/topology, show the
unwanted retaining path or unbounded count has disappeared, and verify the replacement's
capacity, latency and cleanup behavior where relevant. Reuse sufficient evidence; neither a
fixed redeploy count nor a mandatory Full GC proves the contract. Post-reclamation floor is
one signal, not the sole oracle.
