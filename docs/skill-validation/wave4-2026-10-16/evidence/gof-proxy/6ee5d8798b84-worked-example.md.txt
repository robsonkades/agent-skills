# Two worked examples: a virtual proxy, and a remote one that had to stop being transparent

## 1. A virtual proxy over an expensive report engine

Hypothetical Java 17 example: suppose an engine loads a 200 MB template set in 40 seconds and
many replicas never render. These are illustrative inputs, not measured results. Application types
and test helpers are omitted. The factory must clean up partial resources on failure; the owner
must close a successfully constructed engine at shutdown and prevent calls during disposal.

```java
public interface ReportEngine {
    Report render(ReportSpec spec);
}

public final class LazyReportEngine implements ReportEngine {

    private final Supplier<ReportEngine> factory;
    private volatile ReportEngine target;          // written once, published safely
    private RuntimeException failure;              // guarded by this; permanent for this proxy
    private boolean initializing;                  // detects same-thread recursive factory entry

    public LazyReportEngine(Supplier<ReportEngine> factory) {
        this.factory = java.util.Objects.requireNonNull(factory);
    }

    @Override
    public Report render(ReportSpec spec) {
        return engine().render(spec);
    }

    private ReportEngine engine() {
        ReportEngine local = target;
        if (local == null) {
            synchronized (this) {
                local = target;
                if (local == null) {
                    if (failure != null) throw failure;
                    if (initializing) throw new IllegalStateException("recursive initialization");
                    initializing = true;
                    try {
                        target = local = java.util.Objects.requireNonNull(factory.get(), "factory result");
                    } catch (RuntimeException e) {
                        failure = e;
                        throw e;
                    } finally {
                        initializing = false;
                    }
                }
            }
        }
        return local;
    }
}
```

Why the lock rather than the racy `volatile` form: `factory.get()` opens files and registers
metrics, so initialising twice would leak descriptors and double-count. Where the initialiser is
pure and different identities are acceptable, compare the duplicate-construction variant instead.
Successful publication does not make render thread-safe: the engine must support concurrent calls
or the owner must confine/synchronize them.

The factory runs while this proxy's monitor is held. `initializing` detects same-thread reentry;
a different thread blocks on the monitor before it can inspect that flag. The factory must not
wait for a callback that needs this proxy, directly or through an initialization dependency cycle.
For example, submitting `proxy.render(...)` to an executor and waiting for its result inside the
factory creates such a cycle. Moving creation into a future does not by itself remove dependency
cycles; establish which work can complete without the unfinished target.

This sample does not implement a caller deadline or interruptible monitor acquisition. If factory
work can block, define its I/O bounds and partial-resource cleanup; a timeout on that work alone
does not enforce each waiting caller's remaining budget. Required bounded or cancellable waiting
needs an explicit coordination policy or a different initialization lifecycle. Safe publication
and one successful construction are separate properties from timely completion.

Two things this proxy must not do, and does not:

- **Retry permanent initialization failures silently.** This example caches RuntimeException,
  including a null-result rejection, for this proxy's lifetime. Repair requires replacement/restart;
  transient failures need a different explicit bounded retry policy. Errors propagate and are not
  cached; this is not a claim of exactly one attempt after arbitrary VM failure.
- **Hide the first-use cost.** Warming every replica during readiness gives up lazy startup/memory
  savings. Choose eager warm-up for required report capability or expose first-use latency and a
  bounded loading policy for optional capability (`kubernetes-service-lifecycle`).

### Testing the paths that only exist because of the proxy

```java
@Test
void initialises_at_most_once_under_concurrency() throws Exception {
    var built = new AtomicInteger();
    var proxy = new LazyReportEngine(() -> { built.incrementAndGet(); return stubEngine(); });

    runConcurrently(32, () -> proxy.render(aSpec()));

    assertThat(built).hasValue(1);
}

@Test
void propagates_an_initialisation_failure_on_every_call() {
    var built = new AtomicInteger();
    var proxy = new LazyReportEngine(() -> { built.incrementAndGet(); throw new TemplatesMissing("/templates"); });
    assertThatThrownBy(() -> proxy.render(aSpec())).isInstanceOf(TemplatesMissing.class);
    assertThatThrownBy(() -> proxy.render(aSpec())).isInstanceOf(TemplatesMissing.class);
    assertThat(built).hasValue(1); // runtime failure is cached, not silently retried
}
```

Neither path runs in a happy-path test, and both are the reason the class exists.
Also check same-thread recursive initialization and factory dependency cycles with bounded harnesses
that always release workers. A timed `Future.get` limits that wait; it does not itself cancel work
or make monitor acquisition interruptible. Do not leave a deliberately deadlocked test process.

Sources for these limits: [JLS 17 monitor semantics](https://docs.oracle.com/javase/specs/jls/se17/html/jls-17.html#jls-17.1)
and [Future wait/cancellation contracts](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/Future.html).

## 2. A remote proxy that had to stop pretending

### Before

```java
public interface CustomerDirectory {
    Customer byId(CustomerId id);
    List<Customer> all();
}

// implemented over HTTP, injected everywhere as CustomerDirectory
```

The interface was written when the directory was a local table. When it moved to another service,
the implementation was swapped and nothing else changed — which was presented as the benefit.

Illustrative cost model, assuming 2,000 uncached sequential calls and 18 ms each:

```text
Enrichment loop over 2 000 orders:
    for (Order o : orders) enrich(o, directory.byId(o.customerId()));

    → 2 000 HTTP calls, sequential, ~18 ms each = 36 s per batch
    → exceeds a hypothetical 30 s budget unless interrupted earlier
    → a whole-batch retry can repeat completed calls; amplification depends on retry/timeout policy
```

Nothing in the call site suggested a network. `byId` returning a `Customer` looked like a lookup.
An unbounded all() can exhaust memory locally as well as incur large transfers remotely.

### After — an honest client

```java
public interface CustomerDirectory {

    /**
     * @throws DirectoryUnavailable transient; the caller decides whether to retry
     * @throws DirectoryTimeout     the deadline expired; the request may still be executing
     */
    // At most 500 IDs; missing IDs omitted; oversized input rejected; response bytes bounded.
    Map<CustomerId, Customer> byIds(Set<CustomerId> ids, Deadline deadline);

    /** Paged; there is no operation that returns the whole directory. */
    Page<Customer> page(PageRequest request, Deadline deadline);
}
```

Four changes, each removing one part of the lie:

- **Bounded batches.** With 2,000 distinct IDs and a 500-ID limit, expect four application calls,
  not one unbounded call. Transport retries and response sizing need separate checks; no latency
  improvement is measured here (`rpc-and-api-contracts`).
- **A deadline parameter.** Propagate the remaining budget through batching and transport; a local
  timeout does not prove remote work stopped (`timeouts-and-deadlines`).
- **A named failure vocabulary**, with the timeout case explicitly stating that the operation may
  have executed. That sentence is what lets a caller decide whether retrying is safe
  (`idempotency`).
- **A bounded paged alternative.** Define page/response limits and mid-walk consistency; migrate
  published all() consumers compatibly instead of deleting their API without coordination.

### What did not change

The interface is still an interface, and the HTTP implementation is still behind it. The point is
not that indirection was wrong — it is that the _contract_ had to change when the boundary
changed. A proxy is legitimate when it stands in for something whose remoteness the interface
already admits; it is a trap when it is used to avoid admitting it
(`gof-patterns-and-distribution`).

### Test that the fan-out cannot come back

```java
@Test
void enrichment_uses_bounded_directory_batches() {
    var calls = new AtomicInteger();
    CustomerDirectory counting = new CustomerDirectory() {
        public Map<CustomerId, Customer> byIds(Set<CustomerId> ids, Deadline deadline) {
            assertThat(ids.size()).isBetween(1, 500);
            calls.incrementAndGet();
            return stub(ids);
        }
        public Page<Customer> page(PageRequest request, Deadline deadline) {
            throw new AssertionError("unexpected pagination");
        }
    };

    new OrderEnricher(counting).enrich(ordersFor(2_000), Deadline.in(ofSeconds(5)));

    assertThat(calls).hasValue(4); // fixture must contain 2,000 distinct IDs
}
```

This partial test checks application call granularity. Also assert complete enrichment, empty and
duplicate-ID inputs, missing customers and expiry between batches. A stub does not measure HTTP
request count, response limits or latency; add transport integration evidence for those contracts.

## What the two examples share

A proxy is acceptable when what it hides is genuinely uninteresting to the caller (when an object
was constructed), and dangerous when what it hides changes how the caller must write code
(latency, failure, granularity). Ask which of the two you have before choosing transparency.
