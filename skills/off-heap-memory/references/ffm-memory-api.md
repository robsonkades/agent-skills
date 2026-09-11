# MemorySegment, Arena and migrating off Unsafe

`MemorySegment` and `Arena` come from JEP 454, final since JDK 22 — no preview flags on a
JDK 25 baseline. They give spatial safety (bounds checking) and temporal safety (lifetime
checking) that raw addresses lack. Measure access/call-path cost on the target JDK rather
than assuming it is small or material.

## The four Arena types

| Arena          | Release                 | Multi-thread access     | `close()`                                         | When to use                                                                                     |
| -------------- | ----------------------- | ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `ofConfined()` | Deterministic, explicit | No — owning thread only | Supported, owning thread only                     | Buffers with a clear scope and a single owner (parsers, thread-confined work)                   |
| `ofShared()`   | Deterministic, explicit | Yes                     | Supported, from any thread                        | Structures shared across threads with a single coordinated closing point (pools, shared caches) |
| `ofAuto()`     | Non-deterministic (GC)  | Yes                     | **Unsupported** — `UnsupportedOperationException` | Intentional reachability-managed lifetime with a budget that tolerates delayed reclamation      |
| `global()`     | Never                   | Yes                     | **Unsupported** — `UnsupportedOperationException` | Permanent native data, living as long as the process                                            |

Selection rule:

```
Need native memory
  |
  +-- Must it survive the whole process, never freed?  -> Arena.global()
  |
  +-- Is reachability-managed release acceptable, including its delay and budget?
        |
        +-- Yes -> ofAuto() is a supported choice; no explicit close or release deadline
        |
        +-- No -> Explicit ownership scope or lifecycle owner across callbacks/operations
                 |
                 Does more than one thread access OR close the segment?
                     |
                     +-- No  -> Arena.ofConfined()   (strong confinement)
                     +-- Yes -> Arena.ofShared()
```

`ofAuto()` is GC-managed: storage is released at an unspecified time after the arena and
all its segments become unreachable. Bounding reachable bytes alone does not bound the
backlog awaiting reclamation. Account for allocation rate, delayed release and headroom;
choose explicit ownership when that uncertainty is unacceptable. A scope may also be an
asynchronous lifecycle owner that closes only after actual completion.

## Allocation and typed access

Partial Java 22+ snippets: imports and surrounding methods are omitted. Specify alignment
for typed access; `allocate(byteSize)` requests only alignment 1.

```java
try (Arena arena = Arena.ofConfined()) {
    MemorySegment segment = arena.allocate(1024 * 1024, ValueLayout.JAVA_LONG.byteAlignment());

    segment.set(ValueLayout.JAVA_LONG, 0, 0x1234567890ABCDEFL);  // bounds-checked
    long value = segment.get(ValueLayout.JAVA_LONG, 0);
}
// memory freed here, deterministically; access after close() throws IllegalStateException
```

## Structured layouts

```java
StructLayout pointLayout = MemoryLayout.structLayout(
    ValueLayout.JAVA_DOUBLE.withName("x"),
    ValueLayout.JAVA_DOUBLE.withName("y")
);

VarHandle xHandle = pointLayout.varHandle(MemoryLayout.PathElement.groupElement("x"));

try (Arena arena = Arena.ofConfined()) {
    MemorySegment point = arena.allocate(pointLayout);
    xHandle.set(point, 0L, 3.14);
}
```

## Memory mapping

```java
// Recommended: mapped through a segment, so bounds and lifetime are checked
try (Arena arena = Arena.ofConfined();
     FileChannel channel = FileChannel.open(Path.of("bigfile.dat"))) {
    MemorySegment mapped = channel.map(
        FileChannel.MapMode.READ_ONLY, 0, channel.size(), arena
    );
    if (mapped.byteSize() < Long.BYTES) throw new IOException("Truncated header");
    long value = mapped.get(ValueLayout.JAVA_LONG_UNALIGNED
        .withOrder(ByteOrder.BIG_ENDIAN), 0); // example file format uses big endian
}
// unmapped on exit, deterministically
```

The file must remain stable while mapped: concurrent truncation can invalidate access.
Closing the channel alone does not unmap the segment; the arena owns that lifetime.

The legacy `MappedByteBuffer` form still common in existing code reads out of the page cache
with no copy into the Java heap, but its unmapping follows the same Cleaner mechanics as a
direct buffer and is not deterministic.

## Pooling long-lived allocations

Do not implement a pool as an unbounded concurrent queue over one shared arena. Such a sample
usually accepts foreign/duplicate releases, permits use after logical release, races shutdown,
retains peak memory forever and leaks prior-tenant data. Prefer a proven bounded allocator or
define all of these invariants: maximum blocks/bytes, backpressure on exhaustion, membership
and generation token, exclusive lease, zero-on-release policy, close/drain protocol, metrics
and behavior for cancellation. Closing the shared arena invalidates every outstanding slice;
the pool must first prevent acquisition and coordinate all leases.

## Migrating from Unsafe or DirectByteBuffer

1. Identify the ownership pattern and pick the `Arena` from the selection rule above — one
   thread start to finish (`ofConfined`), several threads accessing or closing (`ofShared`),
   explicit asynchronous owner (close on completion), acceptable GC-managed lifetime
   (`ofAuto`, when its timing and budget fit), truly permanent (`global`).
2. Translate size/alignment with checked arithmetic; `arena.allocate(n, alignment)` is not a
   safe mechanical replacement until ownership and maximum allocation are enforced.
3. Replace raw address access (`unsafe.getLong(address)`) with typed segment access
   (`segment.get(ValueLayout.JAVA_LONG, offset)`) — bounds checking comes with it.
4. Replace manual/implicit release with the chosen arena's lifecycle; confined/shared arenas
   close explicitly, automatic/global ones do not. Checked Java segment access after close
   throws `IllegalStateException`; raw pointers retained by native code bypass those checks.
   Wait for actual native completion before releasing their storage.
5. Reconcile endianness, alignment, atomic access modes and native struct padding; test
   malformed sizes, use-after-close, wrong-thread access and close/access races.
6. For object-plus-offset CAS (`sun.misc.Unsafe.compareAndSwapLong`) or volatile access,
   use a `VarHandle` migration with equivalent atomicity and memory ordering. These methods
   are affected by JEP 471/498 too; native allocation migration alone does not address them.

## Verifying the JEP 498 phase behaviour early

```bash
--sun-misc-unsafe-memory-access=warn    # default on JDK 24/25: warning on first use
--sun-misc-unsafe-memory-access=allow   # suppresses the warning
--sun-misc-unsafe-memory-access=deny    # rejects targeted calls; not the JDK 25 GA default
```

On a target that supports this option, a bounded run with `deny` exposes affected code paths
that the run actually reaches, including object-plus-offset CAS/volatile operations. It does
not prove unexercised paths are compatible. `warn` reports the first affected use; absence of
another warning does not mean subsequent methods are exempt.

Sources: Java 25 [`Arena`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Arena.html),
[`SegmentAllocator`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/SegmentAllocator.html),
[`MemorySegment`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/MemorySegment.html)
and [`FileChannel.map`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/channels/FileChannel.html#map(java.nio.channels.FileChannel.MapMode,long,long,java.lang.foreign.Arena)>).
These describe the API contracts; raw native-pointer lifetime requires separate coordination.
