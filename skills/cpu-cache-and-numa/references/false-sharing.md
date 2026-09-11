# False sharing

## Distinguishing it from lock contention

|                         | False sharing                                  | Lock contention                                              |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| Synchronisation in code | may coexist with volatile/atomic operations    | `synchronized` / explicit `Lock`                             |
| Correctness             | sharing alone establishes no correctness claim | depends on the locking protocol                              |
| Signal in `perf`        | cache-to-cache/HITM evidence on supported PMUs | may show futex/parking; spin locks may stay on CPU           |
| Signal in a profiler    | time on the access instruction                 | time in `park` / `monitorenter`                              |
| Signal in JFR           | no dedicated false-sharing event               | qualifying `jdk.JavaMonitorEnter`, `jdk.ThreadPark`          |
| Fix                     | separate independent hot data physically       | reduce contested work while preserving the guarded invariant |

False sharing has no dedicated JFR event, but sampling and resource events can provide indirect
evidence. Missing blocking events also permits spinning, short waits, bandwidth limits and other
causes; it does not select false sharing as the diagnosis. Parking is not always lock contention.
Shrinking lock scope or partitioning requires checking the protected invariant; a lock-free
replacement needs its own correctness and progress argument, not just absence of blocking.

## The shape of the bug

```java
class ConnectionPool {
    volatile int available;      // state, written by application threads
    volatile int inUse;
    volatile long totalBorrows;  // metric added "for convenience"
    // Candidate nearby fields; verify offsets and independent ownership before blaming sharing.
}
```

This partial sketch is not a correct pool implementation: volatile increments are not atomic,
and multiple writers to the same field create true sharing. False sharing concerns independent
locations sharing a coherence line; identify which threads access which fields and when before
changing layout. A line can also bounce between a writer and readers of unrelated fields.

The JMM defines ordering and visibility, not a universal store-buffer drain or MESI sequence.
Generated instructions and coherence protocols depend on the target hardware/JVM. Do not treat
volatile as either a cache-flush instruction or a fix for an atomic read-modify-write requirement.

## Detection procedure

- [ ] Full scaling curve and competing CPU/GC/lock/queue hypotheses captured
- [ ] Throughput worsens as independent writers are added in a controlled comparison
- [ ] Lock contention and true sharing ruled out first
- [ ] MPKI compared against the **application's own baseline**, not a published threshold
- [ ] Coherence evidence collected with a supported PMU/`perf c2c`; LLC misses not used alone
- [ ] Relative layout measured with compatible JOL; absolute line alignment remains explicit
- [ ] Mechanism checked at matched concurrency where uncertain; application benefit validated
      with representative load, not inferred from JMH alone

## Measuring relative layout

```java
System.out.println(org.openjdk.jol.info.ClassLayout.parseClass(ConnectionPool.class).toPrintable());
```

Which offset a field occupies depends on HotSpot layout policy and VM mode, so state the
environment and trust the measured listing rather than the following common examples:

- **12-byte header**: common on 64-bit HotSpot with compressed class pointers and conventional
  headers; an aligned `long` may start at 16 and a smaller field may fill the preceding gap.
- **8-byte compact header**: opt-in on upstream HotSpot JDK 24–26; JDK 24 additionally needs
  `-XX:+UnlockExperimentalVMOptions` before `-XX:+UseCompactObjectHeaders`. Product in 25
  (JEP 519); enabled by default in upstream 27's release candidate (JEP 534; status as of
  2026-09-10). Check vendor backports/defaults and actual packing rather
  than assuming support from the version alone or assuming the first field's offset.

This is why mental arithmetic is unreliable and why the tool takes two minutes — and why a
JOL listing is only meaningful alongside the JDK and the header mode that produced it.
Use a JOL release that supports the target VM/header mode and retain its warnings; a fallback
layout estimate is not a verified measurement. JOL offsets alone do not establish the object's
absolute cache-line alignment or prove coherence contention.
Compact headers can change offsets, and by packing more fields per line they can worsen
false sharing while improving footprint.
Re-run JOL if you enable it.

## Correction options by mechanism and contract

1. **Move the metric to a separate object.** Often resolves the conflict and improves cache
   density of hot state; validate the extra indirection and allocation/lifetime cost. Two
   separately allocated objects may still share a line; verify independent hot locations.
2. **`LongAdder` instead of `AtomicLong`** for contended statistics when a non-linearizable
   aggregate is acceptable. It does not replace an atomic sequence/value contract.
3. **`@Contended`** when physical separation is justified. HotSpot commonly defaults
   `ContendedPaddingWidth` to 128; verify the effective flag and resulting layout. Application
   code directly using `jdk.internal.vm.annotation.Contended` needs a compile-time export
   (`--add-exports java.base/jdk.internal.vm.annotation=ALL-UNNAMED` for classpath code).
   HotSpot recognition needs `EnableContended` enabled and `-XX:-RestrictContended` for
   application classes. Runtime export is not required solely for the VM to consume the
   annotation; runtime code accessing its internal type must satisfy module access separately.
   Read `false-sharing-and-contended` for grouping and layout validation when applying it.
   If the object is allocated on a hot path, check that padding is not multiplying GC pressure.

The annotation is an internal HotSpot hint, not a portable Java layout contract. The
[JDK 25 annotation parser](https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/share/classfile/classFileParser.cpp)
checks `EnableContended` and `RestrictContended`; verify the target build's behavior.

Do not rely on absolute addresses surviving a moving collector. Relative separation under the
same layout survives relocation, but ordinary object alignment need not match cache-line size.

## Data locality

```java
// Partial alternatives: this creates null references, not a million boxed values.
Long[] boxedPrices = new Long[1_000_000];

// Contiguous, prefetchable, no indirection
long[] primitivePrices = new long[1_000_000];
```

The difference is not only boxing. The reference array is contiguous and can be prefetched,
but referenced objects need not be adjacent, adding dependent loads and less predictable
locality than a primitive array.

Consider these changes only for a relevant bottleneck; retaining the current representation
is valid when it meets the workload's needs.

- [ ] Primitive arrays preserve required null/absence, identity and update semantics
- [ ] Sequential traversal preserves required order and lookup behavior
- [ ] Hot/cold separation's locality benefit outweighs extra indirection and footprint
- [ ] Working-set size and access pattern are compared with target caches; LLC size alone
      does not establish a miss or bandwidth bottleneck
