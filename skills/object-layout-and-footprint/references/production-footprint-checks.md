# Production footprint checks

Read at step 5 when the population already exists in a running JVM and JOL cannot be
attached to it, and at step 6 whenever a predicted size disagrees with an observed one. This
page is about the quantities the JVM itself reports, the two costs that sit outside the
per-object arithmetic — the compressed class space and G1's humongous regions — and a
symptom-to-cause table for the disagreements.

**Historical environment for every executed figure.** Temurin **25.0.3+9** (Windows x64), `-Xmx2g`
unless stated, G1 unless stated. Nothing here was run on any other release.

## 1. Sizes the running JVM reports, without JOL

`jcmd <pid> GC.class_histogram` computes each instance's size inside the VM, in the header
mode the VM is actually running, so it is the cheapest cross-check of a prediction against a
live population without an agent, jar or restart. It is a high-impact
safepoint operation that walks the whole heap and normally requests collection first;
`-all` includes unreachable objects and avoids that requested collection, not the inspection
pause. Schedule it under existing operational authorization; the cost model is heap-dump-analysis's, and
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

- JFR `jdk.ObjectCount` — `count` and `totalSize` for emitted classes. On the checked
  25.0.3+9 source, a request schedules a VM heap-inspection operation that requests collection;
  this is not merely passive observation of an independently occurring GC.
  `default.jfc` has `enabled=false` and `period=everyChunk`; the distinct
  `jdk.ObjectCountAfterGC` event is also disabled there. Inspect event/collector support,
  class-coverage thresholds, actual collection and overhead before enabling either event.
  `everyChunk` is not a wall-clock sampling period. These trigger details are source-derived.
- Heap after a verified collection: `GC.run` requests `System.gc()`; flags can suppress it
  or select a concurrent cycle. Confirm the actual cycle and completion from GC evidence
  before comparing `GC.heap_info` under a matched workload. This is aggregate heap usage,
  not a per-class figure or an exact retained live-set measurement.

**Dump-derived shallow sizes require writer/parser context.** In the checked HotSpot 25.0.3+9
HPROF writer, instance payload length and the class record's `instance size` come from the sum
of serialized field sizes; they do not include the real header/alignment. These records do
not supply a canonical compact-header/oop-width/alignment setting. The analyser must infer
or obtain layout inputs and may use version-specific extensions or supplied settings.
No MAT/parser support was executed here. Reuse a trustworthy same-target comparison, or
cross-check a relevant class/array against VM-reported sizes when the disputed size matters;
do not promote an unverified parser model to an exact target layout.

Source: [HotSpot 25.0.3+9 HPROF writer](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/services/heapDumper.cpp),
[requestable JFR ObjectCount](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/jfr/periodic/jfrPeriodic.cpp)
and [heap-inspection collection](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/shared/gcVMOperations.cpp).

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
these as historical alignment-8 observations, not a universal safe `-Xmx`. Actual collector,
alignment, compressed-reference support and flags determine the effective width. The accepted
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
Match on the value, not on the tag. For `UseCompactObjectHeaders`, too, the boolean is
authoritative; the origin adds provenance (`compact-object-headers.md` §4). Passing
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

- The trade is a population question on both sides. If 20 million live objects save 8 bytes
  each and 30,000 classes incur the measured ~490-byte debit, the modeled trade is 160 MB
  of heap against about 15 MB of class space. Other mixes can save zero heap bytes. A
  service that spins lambdas, proxies and generated classes into the hundreds of thousands
  should read `jcmd <pid> VM.metaspace` (the `Class:` line and `Klass ID Range`) in the
  current mode before switching, because `OutOfMemoryError: Compressed class space` is not
  a heap symptom and raising `-Xmx` does not raise the compressed-class-space limit.
- Include measured or modeled class-space cost in a deployment trade; the strong-hidden-class
  result is not a universal debit for every class-heavy heap.

The class-space allocator, its limits and its own flags are metaspace-internals'; what
belongs here is that the cost exists and how large it is. Measure it with the loader
topology you actually have: the same experiment with **weak** hidden classes — one
class-loader-data each — read 536 B used per class in both modes and ~1 KB committed per
class in both, because each `Klass` then starts its own chunk and the alignment hides inside
the per-loader chunk overhead that classic mode pays anyway `[executed]`.

## 4. Large arrays under G1: the region is the unit, not the byte

Everything on the other pages rounds to `ObjectAlignmentInBytes`. G1 adds a second rounding
for any object whose aligned shallow size is strictly greater than half a region: it becomes
_humongous_ and reserves whole regions. Equality is not humongous on the checked JDK 25 source.
Region size is ergonomic from the heap size — 1 MB at `-Xmx2g`: `-Xlog:gc+init` prints
`Heap Region Size: 1M` at start-up and `jcmd <pid> GC.heap_info` prints `region size 1024K`
on the running JVM `[executed]`. Historical aggregate heap-used deltas divided by 200 arrays,
after `System.gc()` `[executed]`:

| `byte[n]`       | Payload + 16 | G1, 1 MB regions | Regions | Waste | Parallel | G1, `G1HeapRegionSize=4m` |
| --------------- | ------------ | ---------------- | ------- | ----- | -------- | ------------------------- |
| `byte[400000]`  | 400,016      | 400,026          | —       | 0%    | —        | —                         |
| `byte[520000]`  | 520,016      | 524,117          | —       | ~1%   | —        | —                         |
| `byte[600000]`  | 600,016      | **1,046,076**    | 1       | 74%   | 600,013  | 598,127                   |
| `byte[1000000]` | 1,000,016    | 1,046,076        | 1       | 5%    | —        | —                         |
| `byte[1100000]` | 1,100,016    | **2,094,652**    | 2       | 90%   | —        | —                         |
| `byte[2200000]` | 2,200,016    | 3,143,228        | 3       | 43%   | —        | —                         |

These deltas include background changes and accounting granularity: values below shallow
size (for example 598,127 versus 600,016) demonstrate noise. They are not exact per-object
sizes, region capacities or evidence of one collector's general overhead advantage.

The threshold is region ÷ 2 (524,288 bytes at 1 MB regions): `byte[520000]` is a normal
object, `byte[600000]` is a full region. ZGC measured 681,574 for the same 600 KB array —
an aggregate delta requiring its own page/accounting investigation. Three rules follow:

- **For aligned shallow size `S > regionSize / 2`, reserved region capacity is
  `ceil(S / regionSize) × regionSize`.** Use the target header mode to compute `S` first.
  `GC.class_histogram` still counts shallow object bytes, not unused region tails. Account
  for that stranded capacity separately; aggregate heap-used reporting is collector-specific.
- Chunk sizes matter more than element counts: a buffer sized just over a power of two is the
  worst case. `byte[1100000]` costs twice `byte[1000000]` for 10% more payload.
- The shape decision changes at scale for the columnar answer too: four parallel arrays at
  N = 10⁷ are four humongous objects with four roundings; the small per-row objects in this
  example are not humongous.
  Fewer large arrays amortize this rounding, but require contiguous region runs and can
  change lifetime/reclamation behavior. Compare chunk sizes before changing region size. Humongous
  allocation, its collection and the region-size ergonomics are g1-internals'.

Source for the strict humongous boundary and region count:
[OpenJDK 25 G1CollectedHeap](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/g1/g1CollectedHeap.hpp).

Boundary example: `byte[524273]` measured 524,296 bytes with classic headers and 524,288
with compact headers on Temurin 25.0.3+9 at alignment 8, JOL 0.17 agreeing with
`Instrumentation.getObjectSize`. With 1 MiB regions, the source predicate therefore classifies
only the classic layout as humongous. Sizes were executed; this classification is source-derived.

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
450 discusses on-demand side storage for a future 32-bit-header design. Such a proposal is
not evidence that a future shallow object size will grow; side-storage cost and shallow size
remain separate quantities to verify on an implemented build.

Locking mode is decided for you under compact headers. JEP 450 says legacy stack locking
disables the feature; on 25.0.3 the JVM does the reverse — `-XX:LockingMode=1` with
`-XX:+UseCompactObjectHeaders` ends `LockingMode = 2 {command line}` and the header flag
stays `true`, with only the generic `LockingMode was deprecated in version 24.0` warning
`[executed]`. Alongside it the diagnostic `UseObjectMonitorTable` flips from `false` to
`true {default}` `[executed]`: inflated monitors are looked up in a table rather than through
the header. That is a cost in the locking path, not in bytes per object; lock-inflation owns
it.

## 6. Prediction disagrees with observation

| Symptom                                                                                  | Likely cause                                                                                              | How to confirm                                                                                                           | What to do                                                                                              |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Reference-holding sizes or reference-array element widths exceed a narrow-oop prediction | Effective compressed oops are off; heap ergonomics, collector or explicit flags may explain it            | Read actual `UseCompressedOops`, VM/JOL element widths and alignment; origin alone is insufficient                       | Recompute actual layouts (§2); evaluate any alignment change against padding and deployment constraints |
| Class-dependent size increase; array bases are 20/24                                     | Wide class pointers — 16-byte classic header in the measured build                                        | JOL/class-pointer flags and stderr on the target; distinguish class pointers from oops                                   | Recompute from actual header and base offsets; flag lifecycle is version-specific                       |
| Predicted compact-header sizes, observed classic ones                                    | Flag passed and overridden, or passed on a build where it needs unlocking                                 | `jcmd <pid> VM.flags -all`: `false {command line, ergonomic}`; JDK 24 needs `-XX:+UnlockExperimentalVMOptions` (JEP 450) | `compact-object-headers.md` §4                                                                          |
| Small objects 8 bytes bigger than the table, `byte[1]` is 32                             | `ObjectAlignmentInBytes=16`                                                                               | JOL `Object alignment: 16 bytes`; `PrintFlagsFinal`                                                                      | `array-and-object-arithmetic.md` §6 — decide whether the oop range was worth it                         |
| Reserved/used heap exceeds shallow totals, dominated by large arrays                     | Humongous arrays: each charged whole G1 regions                                                           | `GC.heap_info` region size; aligned shallow size > region ÷ 2                                                            | §4 — resize chunks or `G1HeapRegionSize`                                                                |
| Deep footprint far below N × shallow                                                     | Shared instances: `Integer` cache, interned or deduplicated strings, a flyweight                          | Check identities/sharing; `GraphLayout.toFootprint()` counts each object once                                            | `jol-operating-procedure.md` §2.4; sharing by design is gof-flyweight                                   |
| Dump analyser and `GC.class_histogram` disagree on shallow size                          | Writer/parser layout assumptions, capture populations or target settings differ                           | Compare the same class/array and target mode; inspect parser support and settings                                        | Prefer validated VM sizes for that target; §1                                                           |
| `OutOfMemoryError: Compressed class space` after enabling compact headers                | Encoding alignment, class shape, loader overhead or retained class growth may exceed class-space capacity | Inspect actual `VM.metaspace` shift/ID range, reservation, used/committed and loader/class counts                        | §3; diagnose capacity versus retention before changing limits or generation — metaspace-internals       |
| Heap saving from compact headers far below "8 bytes × objects"                           | The dominant classes have `p % 8 ∈ {1,2,3,4}` at the actual reference width                               | Histogram top-10 by count, apply the mod-8 rule to each                                                                  | `compact-object-headers.md` §1–3; evaluate required headroom and equivalent shape alternatives          |
| Objects appear to grow after hashing or locking                                          | Shallow size was unchanged on tested JDK 25 (§5); native monitor state or lazy fields may grow            | `Instrumentation.getObjectSize`, NMT/JFR and field state before/after                                                    | Separate shallow heap bytes from side structures and lazy object graphs                                 |
