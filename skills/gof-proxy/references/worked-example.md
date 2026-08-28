# Two worked examples: a virtual proxy, and a remote one that had to stop being transparent

## 1. A virtual proxy over an expensive report engine

The engine loads a 200 MB template set and compiles expressions. Most requests never render a
report, so paying that cost at startup delays readiness by 40 seconds and wastes the memory in
every replica that idles.

```java
public interface ReportEngine {
    Report render(ReportSpec spec);
}

public final class LazyReportEngine implements ReportEngine {

    private final Supplier<ReportEngine> factory;
    private volatile ReportEngine target;          // written once, published safely

    public LazyReportEngine(Supplier<ReportEngine> factory) {
        this.factory = factory;
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
                if (local == null) target = local = factory.get();   // exactly once
            }
        }
        return local;
    }
}
```

Why the lock rather than the racy `volatile` form: `factory.get()` opens files and registers
metrics, so initialising twice would leak descriptors and double-count. Where the initialiser is
pure, the lock-free variant is preferable.

Two things this proxy must not do, and does not:

- **Swallow initialisation failure.** If templates are missing, `render` throws, every time; it
  does not cache a `null` and it does not retry silently. A virtual proxy that caches its own
  failure makes the process permanently broken; one that retries on every call turns a
  configuration error into a load problem.
- **Hide readiness.** The health check calls `engine()` explicitly during warm-up, so the pod is
  not marked ready while the first real request would pay 40 seconds
  (`kubernetes-service-lifecycle`).

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
    var proxy = new LazyReportEngine(() -> { throw new TemplatesMissing("/templates"); });
    assertThatThrownBy(() -> proxy.render(aSpec())).isInstanceOf(TemplatesMissing.class);
    assertThatThrownBy(() -> proxy.render(aSpec())).isInstanceOf(TemplatesMissing.class);
}
```

Neither path runs in a happy-path test, and both are the reason the class exists.

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

What happened in production:

```text
Enrichment loop over 2 000 orders:
    for (Order o : orders) enrich(o, directory.byId(o.customerId()));

    → 2 000 HTTP calls, sequential, ~18 ms each = 36 s per batch
    → the directory's p99 rose; the batch's timeout was 30 s
    → the batch retried whole, issuing 2 000 more calls
    → directory saturated; every caller of it degraded
```

Nothing in the call site suggested a network. `byId` returning a `Customer` looked like a lookup.
And `all()` — harmless over a local table — transferred 400 MB.

### After — an honest client

```java
public interface CustomerDirectory {

    /**
     * @throws DirectoryUnavailable transient; the caller decides whether to retry
     * @throws DirectoryTimeout     the deadline expired; the request may still be executing
     */
    Map<CustomerId, Customer> byIds(Set<CustomerId> ids, Deadline deadline);

    /** Paged; there is no operation that returns the whole directory. */
    Page<Customer> page(PageRequest request, Deadline deadline);
}
```

Four changes, each removing one part of the lie:

- **Bulk, not per-item.** The enrichment loop became one call for 2 000 ids — 40 ms instead of
  36 s. Granularity is the single largest effect and it is a property of the interface, not of the
  implementation (`rpc-and-api-contracts`).
- **A deadline parameter.** The caller's budget reaches the transport, so a doomed call stops
  rather than running after the caller has given up (`timeouts-and-deadlines`).
- **A named failure vocabulary**, with the timeout case explicitly stating that the operation may
  have executed. That sentence is what lets a caller decide whether retrying is safe
  (`idempotency`).
- **`all()` deleted.** An operation that is harmless locally and unbounded remotely should not
  survive the move; a paged form replaced it.

### What did not change

The interface is still an interface, and the HTTP implementation is still behind it. The point is
not that indirection was wrong — it is that the _contract_ had to change when the boundary
changed. A proxy is legitimate when it stands in for something whose remoteness the interface
already admits; it is a trap when it is used to avoid admitting it
(`gof-patterns-and-distribution`).

### Test that the fan-out cannot come back

```java
@Test
void enrichment_makes_one_directory_call_regardless_of_batch_size() {
    var calls = new AtomicInteger();
    CustomerDirectory counting = (ids, deadline) -> { calls.incrementAndGet(); return stub(ids); };

    new OrderEnricher(counting).enrich(ordersFor(2_000), Deadline.in(ofSeconds(5)));

    assertThat(calls).hasValue(1);
}
```

This is the test that would have prevented the incident. It asserts a property of the call
pattern rather than of the result, which is the only kind of test that catches a hidden fan-out —
the code that caused it passed every functional test it had.

## What the two examples share

A proxy is acceptable when what it hides is genuinely uninteresting to the caller (when an object
was constructed), and dangerous when what it hides changes how the caller must write code
(latency, failure, granularity). Ask which of the two you have before choosing transparency.
