# Lazy initialisation

## Start by not doing it

Lazy initialisation trades a startup cost for a first-use cost plus a correctness obligation.
It pays only when both hold:

- the field is **expensive** to build (a large table, a compiled artefact, a connection), and
- it is **often not used at all** in a given process lifetime.

For a service with an SLO, moving work from startup to the first request is usually the wrong
direction: it turns a cost paid once, before traffic arrives, into a latency spike on a real
user's request — and, with several replicas rolling, on many of them. Eager initialisation is
also the only form that fails fast: a misconfigured resource blows up at boot, not at 3 a.m.
when the code path is first exercised.

So: initialise eagerly by default, and lazily only with a reason you can state.

## The four correct forms

**1. Eager (static or instance final field).** No synchronisation, no ordering question, fails
at startup.

```java
private static final CurrencyTable TABLE = CurrencyTable.load();
```

**2. Lazy-initialisation holder class — the right answer for a static field.**

```java
private static class Holder {
    static final CurrencyTable TABLE = CurrencyTable.load();
}
public static CurrencyTable table() { return Holder.TABLE; }
```

The JVM initialises `Holder` on first access to `Holder.TABLE`, under the class-initialisation
lock, and publication is guaranteed by the JLS. After that, reads are plain field reads with no
synchronisation and no volatile — this is the fastest correct form, and it needs no
double-checked-locking reasoning at all.

**3. Synchronised accessor — the right default for an instance field.**

```java
private FieldType field;
public synchronized FieldType field() {
    if (field == null) field = computeFieldValue();
    return field;
}
```

Simple, obviously correct, and the cost is one uncontended lock acquisition per read — which is
negligible unless the accessor is genuinely hot. Start here; measure before replacing it.

**4. Double-checked locking — only when a measurement shows form 3 costs too much.**

```java
private volatile FieldType field;          // volatile is not optional
public FieldType field() {
    FieldType result = field;              // read the volatile field once into a local
    if (result == null) {
        synchronized (this) {
            if (field == null) field = result = computeFieldValue();
            else result = field;
        }
    }
    return result;
}
```

Two details are load-bearing:

- **`volatile`.** Without it, another thread can see a non-null reference to a partially
  constructed object: the JMM permits the assignment to become visible before the constructor's
  writes. java-memory-model has the reordering argument in full.
- **The local variable.** Reading the field once instead of twice is what makes this measurably
  faster than the naive version; reading it twice can also observe two different values.

The **single-check idiom** (no lock, `volatile` field, accept that several threads may compute
the value) is legitimate when the computation is cheap, deterministic and idempotent. The
**racy single-check** (not even `volatile`) is legitimate only under the exact conditions
`String.hashCode` satisfies — see the analysis in java-immutability's safe-publication
reference. Neither is a general-purpose idiom.

## What not to write

```java
// Broken: no volatile. Another thread may see a non-null, half-constructed object.
private FieldType field;
public FieldType field() {
    if (field == null) {
        synchronized (this) { if (field == null) field = compute(); }
    }
    return field;
}
```

This is the version that circulates as "double-checked locking", and it is the one that is
wrong. It also usually _works_ on x86, and fails on weaker memory models such as aarch64 —
so it survives testing on one architecture and breaks after a migration to another.

Also avoid:

- Lazy initialisation of a field that is **not** expensive: the check costs more than the work.
- `Optional` as a lazily assigned field — it adds a wrapper without addressing publication.
- Holding a lock across the expensive computation when it may call out to alien code or I/O
  (lock-scope-and-alien-calls). If `compute()` calls a remote service, the synchronised accessor
  serialises every caller behind it and a hang blocks them all; bound it, or initialise eagerly.

## Memoising suppliers and caches

For an instance field whose computation is genuinely expensive, a memoising `Supplier` packages
the same double-checked pattern once:

```java
private final Supplier<CurrencyTable> table = memoize(CurrencyTable::load);   // Guava's Suppliers.memoize, or your own
```

For a _keyed_ lazy value — one per tenant, per currency, per configuration — do not hand-roll
it. `ConcurrentHashMap.computeIfAbsent` gives atomic per-key initialisation, with two caveats:
the mapping function must not modify the same map (it can deadlock or corrupt the map), and it
holds a bin lock for the duration, so a slow computation blocks other keys hashing to the same
bin. When the value is expensive and remote, a proper cache with a loading policy
(caching-strategies) is the right tool, and it also gives you the bound that
`computeIfAbsent` does not.

## Startup, AOT and the wider picture

- **A lazily initialised field is not initialised in a CDS/AOT training run** unless that run
  exercises the path, so it will not appear in the archive and the cost stays on the first
  request. Conversely, eagerly initialised static state is captured at build time in a native
  image — including anything it read from the environment, which is a bug if the environment
  differs at run time (graalvm-native-image, startup-cds-crac-leyden).
- **Warm-up matters more than the initialisation itself** for JIT-compiled paths; a first
  request that both initialises the field and runs interpreted code is the shape behind "the
  first requests after a deploy are slow" (jit-compilation).
- **Fail-fast beats lazy** for anything that validates configuration or opens a connection.
  Prefer to construct it at startup and let a broken configuration stop the deployment.
