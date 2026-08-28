# Diagnosing native memory

## One tool per question

| Question                                                 | Tool                                                                   | What it answers                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| How heavy is the Java wrapper?                           | JOL `ClassLayout.parseInstance`                                        | Bytes of the heap object — **not** the native payload                          |
| How much native is reserved and committed, by category?  | NMT, `jcmd <pid> VM.native_memory detail`                              | `reserved`/`committed`/`malloc`/`mmap` per category, no per-buffer granularity |
| Is RSS growing faster than the heap?                     | `/proc/<pid>/status` (`VmRSS`) plus `jstat -gcutil`                    | The binary off-heap-versus-heap signal                                         |
| How many direct buffers are live right now, and how big? | JMX `java.nio:type=BufferPool,name=direct`                             | `Count`, `MemoryUsed`, `TotalCapacity`                                         |
| Which Java call stack produced this native allocation?   | `asprof -e nativemem`, or `--nativemem --nofree` plus `jfrconv --leak` | Full call stack down to the unfreed allocation site                            |

## RSS versus used heap

```bash
watch -n 5 'cat /proc/<pid>/status | grep -E "VmRSS|VmPeak"'
jstat -gcutil <pid> 5000
```

Sustained RSS growth (say 100 MB/hour) with used heap flat is the off-heap hypothesis.
Confirm in three steps: (1) JMX `MemoryUsed` on the `direct` pool — if it grows too, this is a
`DirectByteBuffer`/`MemorySegment` leak; (2) NMT to see which category is growing;
(3) `asprof -e nativemem` for the exact stack.

## NMT and its ceiling

```bash
java -XX:NativeMemoryTracking=detail MyApp     # enable at start
jcmd <pid> VM.native_memory detail             # snapshot at runtime
```

The output is nested, not a flat list:

```
-                     Internal (reserved=54321KB, committed=54321KB)
                            (malloc=54321KB #182)

-                        Other (reserved=393216KB, committed=393216KB)
                            (mmap: reserved=393216KB, committed=393216KB)
```

`Unsafe.allocateMemory` and `ByteBuffer.allocateDirect` both go through `malloc` and typically
land under `Internal`, counted in `malloc=`. Memory mapped through `FileChannel.map` or a
file-backed `MemorySegment` lands under `Other`, counted in `mmap=`.

NMT does **not** discriminate by Java buffer type. No version has ever had a sub-line like
"DirectByteBuffer memory (allocated/freed)" inside `Internal`. Its maximum granularity is the
category plus the `malloc`/`mmap` pair inside it. For "which line of Java code", NMT is the
wrong tool.

## Attributing a leak to a Java call stack

```bash
# async-profiler 4.x. "profiler.sh" and the event "-e malloc" do NOT exist
# in this series -- the event name is "nativemem".
asprof -e nativemem -d 60 -f offheap.html <pid>
```

This instruments `malloc`/`realloc`/`calloc`/`free`, matching allocations against their frees;
whatever was not freed inside the window is the leak candidate surface. Each Java frame in the
HTML is the code point that originated the allocation — for example `Bits.reserveMemory` then
`DirectByteBuffer.<init>` then `ByteBuffer.allocateDirect` then the application method.

For a more precise session — a minimum allocation threshold to cut noise, plus a dedicated
leak report:

```bash
asprof --nativemem 1m --nofree -f natmem.jfr -d 300 <pid>
jfrconv --total --nativemem --leak natmem.jfr leak.html
```

## Why JOL cannot answer this

```java
ByteBuffer direct = ByteBuffer.allocateDirect(1024 * 1024); // 1 MB off-heap
System.out.println(ClassLayout.parseInstance(direct).toPrintable());
```

JOL prints the layout of the `java.nio.DirectByteBuffer` **wrapper** — header plus its few
fields (native address, capacity, position, limit, the Cleaner reference). That is tens of
bytes; the exact figure depends on the JDK build and the header mode (Compact Object Headers,
JEP 519), so measure rather than assume. The 1 MB is entirely outside what
`ClassLayout.parseInstance` can see: JOL does not follow the native address field, because
there is no Java object there to inspect.

## Sizing MaxDirectMemorySize

Absent the flag the ceiling is implicitly `-Xmx`, which rarely reflects real direct memory use.

1. Run in staging under representative load, long enough to reach steady state.
2. Measure `MemoryUsed` on the `direct` pool via JMX over time — not a single sample.
3. Set `-XX:MaxDirectMemorySize` to steady state times 1.3 to 1.5 as a starting point. The
   margin covers normal load variation, not a leak.
4. Validate by repeating the same measurement under the same load. A plateau inside the margin
   means the sizing is right; continued growth means a leak, not a sizing problem.

A pre-measurement estimate is only a starting point to validate: a server with a known ceiling
of 10,000 concurrent connections at 64 KB each projects 10,000 x 65,536 bytes, roughly 655 MB
of theoretical peak, so `-XX:MaxDirectMemorySize=1g` is a reasonable place to start before
step 4.

Utilisation guidance once it is running: consistently under 50% suggests reducing it, freeing
headroom for the heap and other native uses; consistently over 80% means investigating a leak
**before** simply raising the ceiling. Raising it without finding the cause of sustained growth
only defers the same incident to a higher load — the best case is converting a fast OOM into a
slow one.
