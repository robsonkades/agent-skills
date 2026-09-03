# Production footprint checks

Read at step 5 when the population already exists in a running JVM and JOL cannot be
attached to it, and at step 6 whenever a predicted size disagrees with an observed one. This
page is about the quantities the JVM itself reports, the two costs that sit outside the
per-object arithmetic — the compressed class space and G1's humongous regions — and a
symptom-to-cause table for the disagreements.

**Environment for every executed figure.** Temurin **25.0.3+9** (Windows x64), `-Xmx2g`
unless stated, G1 unless stated. Nothing here was run on any other release.

## 1. Sizes the running JVM reports, without JOL

`jcmd <pid> GC.class_histogram` computes each instance's size inside the VM, in the header
mode the VM is actually running, so it is the cheapest cross-check of a prediction against a
live population — and the only one that needs no agent, no jar and no restart. It is a
safepoint operation that walks the whole heap; the cost model is heap-dump-analysis's, and
`-parallel=<n>` on 25 splits the walk.

Same program, 1,000,000 instances each, both modes `[executed]`:

| Class                   | Classic (bytes / instance) | Compact | Predicted by the arithmetic |
| ----------------------- | -------------------------- | ------- | --------------------------- |
| `java.lang.Object`      | 16                         | 8       | 16 / 8                      |
| `java.lang.Integer`     | 16                         | 16      | 16 / 16 (`p % 8 = 4`)       |
| `record Point(int,int)` | 24                         | 16      | 24 / 16                     |
| `Point[1000000]`        | 4,000,016                  | —       | 16 + 4 × 10⁶ (4-byte refs)  |

The histogram lines read `1000000 16000000 Hold$Point` under compact headers and
`1000000 24000000 Hold$Point` under classic ones. If a prediction and a histogram disagree,
the histogram is the JVM's own answer; go to §6 for the reasons the prediction was wrong.

Two other in-JVM sources give the same numbers over time rather than at one instant:

- JFR `jdk.ObjectCount` — per class, `count` and `totalSize`, taken at a GC. Its
  `default.jfc` setting is `enabled=false` with `period=everyChunk` `[executed]`; it must be
  switched on. Confirm its collection trigger and overhead on the target recording; do not
  treat `everyChunk` as a wall-clock sampling period.
- Live heap after a full collection: `jcmd <pid> GC.run` then `GC.heap_info`. This is a
  total, not a per-class figure, and it is the number compact-object-header savings should
  be quoted against (`compact-object-headers.md` §5).

**A heap dump is not one of those sources.** The HPROF `INSTANCE DUMP` record carries the
field values, not the object's size; the analyser reconstructs shallow size from its own model
of the header, and nothing in the file says which header mode wrote it. Whether the analyser
in use knows about compact headers was not tested here (no MAT on this machine) — check it
once by comparing one class's shallow size in the tool against a `GC.class_histogram` from
the same JVM, and do not quote a dump-derived shallow size from a compact-header JVM until
that comparison has been made.

## 2. Compressed oops: the boundary, and reading it off a live JVM

The oop size is the second input to every size on the other pages, and it changes without a
flag. The ergonomic boundary is `4 GB × ObjectAlignmentInBytes` less a platform-dependent
margin, all `[executed]`:

| `ObjectAlignmentInBytes` | Compressed oops still on | Off                                  |
| ------------------------ | ------------------------ | ------------------------------------ |
| 8 (default)              | `-Xmx31g`, `-Xmx32736m`  | `-Xmx32740m`, `-Xmx32g`              |
| 16                       | `-Xmx60g`                | `-Xmx64g`                            |
| any                      | —                        | `-XX:-UseCompressedOops` on the line |

On this build, `-Xmx32g` is therefore **off**, not the last value on: the margin below the 32 GB encoding
range is a page plus the heap alignment, so the exact cut-off is a few tens of megabytes
under 32 GB and depends on the collector's region size and large-page setting. Treat
"32 GB" as the boundary and "32 GB minus a little" as the last safe `-Xmx`. The accepted
range for `ObjectAlignmentInBytes` is `[8 … 256]`; 4 and 512 are refused at start-up
`[executed]`. Raising it buys range and costs padding per object —
`array-and-object-arithmetic.md` §6 has the per-object price; the heap-sizing decision is
jvm-performance-review's.

Three ways to read the state, in order of reliability:

```bash
java <flags> -Xlog:gc+init -version | grep 'Compressed Oops'
#   Compressed Oops: Enabled (32-bit)        <- on;  "Disabled" when off
java <flags> -Xlog:gc+heap+coops=debug -version
#   Heap address: 0x…, size: 1024 MB, Compressed Oops mode: 32-bit
java <flags> -XX:+PrintFlagsFinal -version | grep 'UseCompressedOops '
jcmd <pid> VM.flags -all | grep 'UseCompressedOops '
```

`gc+heap+coops` prints at **debug**, not info `[executed]`; at info it is silent and the
silence looks like a missing tag. `gc+init` prints at info.

**The origin tag is a trap on this flag.** Past the boundary `UseCompressedOops` reads
`false {default}`, and below it `true {ergonomic}` `[executed]`. So `{default}` here does
not mean "nobody touched it": ergonomics turned it off and left no trace in the origin.
Match on the value, not on the tag — the opposite of the advice for `UseCompactObjectHeaders`,
where the tag carries the answer (`compact-object-headers.md` §4). Passing
`-XX:+UseCompressedOops` explicitly past the boundary does not force it either: the JVM
prints `warning: Max heap size too large for Compressed Oops` and runs with them off
`[executed]`.

In a JOL listing the same fact is the first entry of the `Field sizes` row — `4` on, `8`
off — and the `Compressed references (oops): disabled` line
(`jol-operating-procedure.md` §3).

## 3. The compressed class space: where compact headers cost bytes

Compact headers shrink the class pointer from 32 bits to 22 (JEP 450), and 22 bits cannot
address a byte-granular class space. The encoding the JVM chooses, from
`-Xlog:gc+metaspace` at start-up `[executed]`:

```text
classic:  Narrow klass pointer bits 32, Max shift 3    Narrow klass shift: 0
          Klass ID Range:  [65536 - 1090519033)         <- ~1.09 × 10⁹ ids in 1 GB
compact:  Narrow klass pointer bits 22, Max shift 10   Narrow klass shift: 10
          Klass ID Range:  [64 - 1064960)               <- 1,064,896 ids in 1 GB
```

A shift of 10 means every `Klass` sits on a 1 KB boundary, and the measurement confirms that
the boundary is paid for. 100,000 strong hidden classes of a 2-field, 1-method template,
defined through one `Lookup` so they share a class-loader metaspace, `MemoryPoolMXBean`
"Compressed Class Space" deltas `[executed]`:

| Mode    | Class space used per class | Class space committed per class | Metaspace used per class (total) |
| ------- | -------------------------- | ------------------------------- | -------------------------------- |
| Classic | **537 B**                  | 537 B                           | 1,377 B                          |
| Compact | **1,024 B**                | 1,024 B                         | 1,865 B                          |

For this template and loader topology, the flag that saves 0–8 bytes per object increased
reported class-space use by ~490 bytes per class. The 1 GB default reservation on this build
exposed about **1.06 million** aligned IDs instead of about **2 million** for this measured
shape; larger configured reservations and other builds/topologies change the effective
boundary. The `Klass ID Range` line is the run-specific evidence. Two
consequences:

- The trade is a population question on both sides. A service with 20 million small objects
  and 30,000 classes gains tens of megabytes on the heap and loses 15 MB of class space; a
  service that spins lambdas, proxies and generated classes into the hundreds of thousands
  should read `jcmd <pid> VM.metaspace` (the `Class:` line and `Klass ID Range`) in the
  current mode before switching, because `OutOfMemoryError: Compressed class space` is not
  a heap symptom and `-Xmx` does nothing for it.
- The 8-byte win per `Object` is never free on a class-heavy heap. Quote both numbers.

The class-space allocator, its limits and its own flags are metaspace-internals'; what
belongs here is that the cost exists and how large it is. Measure it with the loader
topology you actually have: the same experiment with **weak** hidden classes — one
class-loader-data each — read 536 B used per class in both modes and ~1 KB committed per
class in both, because each `Klass` then starts its own chunk and the alignment hides inside
the per-loader chunk overhead that classic mode pays anyway `[executed]`.

## 4. Large arrays under G1: the region is the unit, not the byte

Everything on the other pages rounds to `ObjectAlignmentInBytes`. G1 adds a second rounding
for any object at or above half a region: it becomes _humongous_ and occupies whole regions.
Region size is ergonomic from the heap size — 1 MB at `-Xmx2g`: `-Xlog:gc+init` prints
`Heap Region Size: 1M` at start-up and `jcmd <pid> GC.heap_info` prints `region size 1024K`
on the running JVM `[executed]`. Heap used per array, 200 arrays each, after `System.gc()`
`[executed]`:

| `byte[n]`       | Payload + 16 | G1, 1 MB regions | Regions | Waste | Parallel | G1, `G1HeapRegionSize=4m` |
| --------------- | ------------ | ---------------- | ------- | ----- | -------- | ------------------------- |
| `byte[400000]`  | 400,016      | 400,026          | —       | 0%    | —        | —                         |
| `byte[520000]`  | 520,016      | 524,117          | —       | ~1%   | —        | —                         |
| `byte[600000]`  | 600,016      | **1,046,076**    | 1       | 74%   | 600,013  | 598,127                   |
| `byte[1000000]` | 1,000,016    | 1,046,076        | 1       | 5%    | —        | —                         |
| `byte[1100000]` | 1,100,016    | **2,094,652**    | 2       | 90%   | —        | —                         |
| `byte[2200000]` | 2,200,016    | 3,143,228        | 3       | 43%   | —        | —                         |

The threshold is region ÷ 2 (524,288 bytes at 1 MB regions): `byte[520000]` is a normal
object, `byte[600000]` is a full region. ZGC measured 681,574 for the same 600 KB array —
its own page-granular rounding, smaller than G1's here but not zero. Three rules follow:

- **An array's cost under G1 is `regions(alignUp(16 + n, regionSize))`, not
  `alignUp(16 + n, 8)`**, once `16 + n ≥ regionSize / 2`. The arithmetic on the other pages
  is exact for the object and wrong for the heap by up to one region per array.
- Chunk sizes matter more than element counts: a buffer sized just over a power of two is the
  worst case. `byte[1100000]` costs twice `byte[1000000]` for 10% more payload.
- The shape decision changes at scale for the columnar answer too: four parallel arrays at
  N = 10⁷ are four humongous objects — cheap, four roundings — while N objects never are.
  A few large arrays are the right shape; many mid-sized arrays just over the threshold are
  the wrong one, and either `G1HeapRegionSize` or the chunk size is the lever. Humongous
  allocation, its collection and the region-size ergonomics are g1-internals'.

## 5. What does not change an object's size

Measured with `Instrumentation.getObjectSize` before and after, both header modes, and at
`ObjectAlignmentInBytes=16` `[executed]`:

| Action                                                                     | `Object` classic / compact | `Point` classic / compact |
| -------------------------------------------------------------------------- | -------------------------- | ------------------------- |
| `System.identityHashCode`, then `synchronized` + `wait` (inflated monitor) | 16 → 16 / 8 → 8            | 24 → 24 / 16 → 16         |

On 25 the identity hash lives in the mark word in both modes (31 bits, JEP 450: "the size of
the hash code does not change"), and an inflated monitor is a side structure the object
points at, so neither hashing nor locking ever grows an object. A design that avoids
`hashCode()` on hot objects "to keep them small" is optimising nothing on this release. JEP
450 names on-demand side storage for hash codes as the route to 32-bit headers; when that
ships, hashed objects will be the ones that grow — not on 24, 25, 26 or 27.

Locking mode is decided for you under compact headers. JEP 450 says legacy stack locking
disables the feature; on 25.0.3 the JVM does the reverse — `-XX:LockingMode=1` with
`-XX:+UseCompactObjectHeaders` ends `LockingMode = 2 {command line}` and the header flag
stays `true`, with only the generic `LockingMode was deprecated in version 24.0` warning
`[executed]`. Alongside it the diagnostic `UseObjectMonitorTable` flips from `false` to
`true {default}` `[executed]`: inflated monitors are looked up in a table rather than through
the header. That is a cost in the locking path, not in bytes per object; lock-inflation owns
it.

## 6. Prediction disagrees with observation

| Symptom                                                                                       | Likely cause                                                                                   | How to confirm                                                                                                           | What to do                                                                                               |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Every reference-holding class is 4–8 bytes bigger than predicted; arrays of references are 2× | Compressed oops are off — heap at or above 32 GB, or `-XX:-UseCompressedOops`                  | `-Xlog:gc+init` shows `Compressed Oops: Disabled`; `UseCompressedOops = false {default}`                                 | Recompute with `ref` = 8 (§2); consider `ObjectAlignmentInBytes=16` only after §6 of the arithmetic page |
| Every object is 8 bytes bigger than predicted, arrays start at 20/24                          | `-XX:-UseCompressedClassPointers` — 16-byte header                                             | JOL `Compressed class pointers: disabled`; the deprecation warning on stderr                                             | Recognise, do not design for it; the flag is deprecated on 25                                            |
| Predicted compact-header sizes, observed classic ones                                         | Flag passed and overridden, or passed on a build where it needs unlocking                      | `jcmd <pid> VM.flags -all`: `false {command line, ergonomic}`; JDK 24 needs `-XX:+UnlockExperimentalVMOptions` (JEP 450) | `compact-object-headers.md` §4                                                                           |
| Small objects 8 bytes bigger than the table, `byte[1]` is 32                                  | `ObjectAlignmentInBytes=16`                                                                    | JOL `Object alignment: 16 bytes`; `PrintFlagsFinal`                                                                      | `array-and-object-arithmetic.md` §6 — decide whether the oop range was worth it                          |
| Histogram total ≫ Σ predicted, dominated by `[B` or `[J`                                      | Humongous arrays: each charged whole G1 regions                                                | `GC.heap_info` region size; array length against region ÷ 2                                                              | §4 — resize chunks or `G1HeapRegionSize`                                                                 |
| Deep footprint far below N × shallow                                                          | Shared instances: `Integer` cache, interned or deduplicated strings, a flyweight               | Populate outside the cache; `GraphLayout.toFootprint()` counts each object once                                          | `jol-operating-procedure.md` §2.4; sharing by design is gof-flyweight                                    |
| Dump analyser and `GC.class_histogram` disagree on shallow size                               | Analyser reconstructs the header with its own model; the dump does not record the mode         | Compare one class in both                                                                                                | Trust the histogram; §1                                                                                  |
| `OutOfMemoryError: Compressed class space` after enabling compact headers                     | Per-`Klass` cost doubled to 1 KB; class count near the 1 M ceiling at the 1 GB default         | `jcmd <pid> VM.metaspace` — `Klass ID Range`, `Class:` used                                                              | §3; raise `CompressedClassSpaceSize` or reduce generated classes — metaspace-internals                   |
| Heap saving from compact headers far below "8 bytes × objects"                                | The dominant classes have `p % 8 ∈ {1,2,3,4}` — boxes, `String`, `ArrayList`                   | Histogram top-10 by count, apply the mod-8 rule to each                                                                  | `compact-object-headers.md` §1–3; the fix is a shape change, not a flag                                  |
| Objects appear to grow after hashing or locking                                               | Shallow size was unchanged on tested JDK 25 (§5); native monitor state or lazy fields may grow | `Instrumentation.getObjectSize`, NMT/JFR and field state before/after                                                    | Separate shallow heap bytes from side structures and lazy object graphs                                  |
