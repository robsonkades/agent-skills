# MemorySegment, Arena and migrating off Unsafe

`MemorySegment` and `Arena` come from JEP 454, final since JDK 22 — no preview flags on a
JDK 25 baseline. They give spatial safety (bounds checking) and temporal safety (lifetime
checking) that `Unsafe` never had, at a small per-access cost.

## The four Arena types

| Arena          | Release                 | Multi-thread access     | `close()`                                         | When to use                                                                                           |
| -------------- | ----------------------- | ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ofConfined()` | Deterministic, explicit | No — owning thread only | Supported, owning thread only                     | The default case: buffers with a clear scope and a single owner (parsers, request buffers)            |
| `ofShared()`   | Deterministic, explicit | Yes                     | Supported, from any thread                        | Structures shared across threads with a single coordinated closing point (pools, shared caches)       |
| `ofAuto()`     | Non-deterministic (GC)  | Yes (read)              | **Unsupported** — `UnsupportedOperationException` | Only when there is no natural scope to tie a try-with-resources to; accepts the Cleaner's timing risk |
| `global()`     | Never                   | Yes                     | **Unsupported** — `UnsupportedOperationException` | Permanent native data, living as long as the process                                                  |

Selection rule:

```
Need native memory
  |
  +-- Must it survive the whole process, never freed?  -> Arena.global()
  |
  +-- Is there a clear ownership scope (try-with-resources)?
        |
        +-- No  -> Arena.ofAuto()   (accept GC timing; the exception, not the rule)
        |
        +-- Yes -> Does more than one thread access OR close the segment?
                     |
                     +-- No  -> Arena.ofConfined()   (recommended default)
                     +-- Yes -> Arena.ofShared()
```

`ofAuto()` is the mode people reach for thinking it is "the explicit one". It is not: it is
GC-managed, and it carries exactly the non-deterministic timing risk of the
`Cleaner`/`DirectByteBuffer` model that `Arena` exists to fix.

## Allocation and typed access

```java
try (Arena arena = Arena.ofConfined()) {
    MemorySegment segment = arena.allocate(1024 * 1024);

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
    long value = mapped.get(ValueLayout.JAVA_LONG, 0);
}
// unmapped on exit, deterministically
```

The legacy `MappedByteBuffer` form still common in existing code reads out of the page cache
with no copy into the Java heap, but its unmapping follows the same Cleaner mechanics as a
direct buffer and is not deterministic.

## Pooling long-lived allocations

```java
class OffHeapPool implements AutoCloseable {
    private final Arena arena = Arena.ofShared();
    private final long blockSize;
    private final Queue<MemorySegment> freeList = new ConcurrentLinkedQueue<>();

    OffHeapPool(long blockSize, int initialCapacity) {
        this.blockSize = blockSize;
        for (int i = 0; i < initialCapacity; i++) {
            freeList.add(arena.allocate(blockSize));
        }
    }

    MemorySegment acquire() {
        MemorySegment seg = freeList.poll();
        return seg != null ? seg : arena.allocate(blockSize);
    }

    void release(MemorySegment seg) {
        freeList.offer(seg);
    }

    @Override
    public void close() {
        arena.close();  // frees the pool's entire memory at once
    }
}
```

## Migrating from Unsafe or DirectByteBuffer

1. Identify the ownership pattern and pick the `Arena` from the selection rule above — one
   thread start to finish (`ofConfined`), several threads accessing or closing (`ofShared`),
   no natural try-with-resources scope (`ofAuto`, last resort), truly permanent (`global`).
2. Replace `unsafe.allocateMemory(n)` or `ByteBuffer.allocateDirect(n)` with
   `arena.allocate(n)`.
3. Replace raw address access (`unsafe.getLong(address)`) with typed segment access
   (`segment.get(ValueLayout.JAVA_LONG, offset)`) — bounds checking comes with it.
4. Replace manual release (`unsafe.freeMemory(address)` in a `finally`) or implicit release
   (waiting for the Cleaner) with `arena.close()` — deterministic, and use-after-free throws
   `IllegalStateException` instead of silently corrupting memory.
5. If the legacy code used object-plus-offset CAS (`compareAndSetLong`), **do not migrate it
   here**. It is not a target of JEP 471 or JEP 498. Moving it to `VarHandle` is a separate,
   independent decision.

## Verifying the JEP 498 phase behaviour early

```bash
--sun-misc-unsafe-memory-access=warn    # default on JDK 24/25: warning on first use
--sun-misc-unsafe-memory-access=allow   # suppresses the warning
--sun-misc-unsafe-memory-access=deny    # fails today; still NOT the default as of JDK 27
```

Running with `deny` in CI is how you find out, before the baseline moves, which code paths
will stop working. The object-plus-offset CAS methods produce no warning in any of these
modes.
