# Version-truth research brief — JDK 26/27 facts that falsify existing skill claims

Research date: 2026-08-27. Repo: `C:\git\agent-skills\skills`.
Baseline of the suite: JDK 25. JDK 26 GA 2026-03-17. JDK 27 is in **Release Candidate**
phase (feature set frozen, RC 2026-08-20); JDK 28 main line open.

Every fact below is sourced. Where a source could not be found, it is in **UNRESOLVED**.
Nothing here is filled in from recall.

---

## Section 1 — Compact object headers, in depth

### 1.1 Status ladder (given, re-confirmed)

| JEP | Title                                 | Status           | Release |
| --- | ------------------------------------- | ---------------- | ------- |
| 450 | Compact Object Headers (Experimental) | Closed/Delivered | 24      |
| 519 | Compact Object Headers                | Closed/Delivered | 25      |
| 534 | Compact Object Headers by Default     | Closed/Delivered | 27      |

Sources: <https://openjdk.org/jeps/450>, </jeps/519>, </jeps/534>.

**Source-of-truth confirmation that JDK 27 flips the default** (not just the JEP text) —
`globals.hpp` on the `jdk27` branch:

```
product(bool, UseCompactObjectHeaders, true,   \      // jdk27
        "Use compact 64-bit object headers in 64-bit VM")
```

versus `jdk-25+36`:

```
product(bool, UseCompactObjectHeaders, false,  \      // jdk 25
```

<https://raw.githubusercontent.com/openjdk/jdk/jdk27/src/hotspot/share/runtime/globals.hpp>
<https://raw.githubusercontent.com/openjdk/jdk/jdk-25%2B36/src/hotspot/share/runtime/globals.hpp>

JEP 534 non-goal: _"It is not a goal to remove the old 96-bit object header layout at this
time."_ `-XX:-UseCompactObjectHeaders` still works on 27.

### 1.2 Exact header bytes, 64-bit

JEP 450, Motivation: _"In the 64-bit HotSpot JVM, object headers occupy between 96 bits
(12 bytes) and 128 bits (16 bytes), depending on how the JVM is configured."_

| Configuration                                      | Plain object header         | Array header              |
| -------------------------------------------------- | --------------------------- | ------------------------- |
| No COH, compressed class pointers **on** (default) | 8 mark + 4 klass = **12 B** | 12 + 4 length = **16 B**  |
| No COH, `-XX:-UseCompressedClassPointers`          | 8 mark + 8 klass = **16 B** | 16 + 4 length = **20 B**¹ |
| `-XX:+UseCompactObjectHeaders`                     | **8 B** (fused)             | 8 + 4 length = **12 B**   |

The array-length field is **unchanged**: it stays a 4-byte `int` immediately after the
header. JEP 450 lists as an explicit non-goal _"Change the encoding of object content (i.e.,
fields and array elements) or array metadata (i.e., array length)."_ HotSpot source
(`jdk27/src/hotspot/share/oops/arrayOop.hpp`) makes it structural:

```cpp
static int length_offset_in_bytes() { return oopDesc::base_offset_in_bytes(); }
// header_size = length_offset_in_bytes() + sizeof(int)
```

so the length simply _moves_ from offset 12 to offset 8. JOL encodes the same rule:
`arrayHeaderSize = objectHeaderSize + 4`
(<https://github.com/openjdk/jol/blob/master/jol-core/src/main/java/org/openjdk/jol/vm/HotspotUnsafe.java>).

¹ 20 B is arithmetic from the two sourced facts (16-byte header + 4-byte length), not a
directly quoted figure — see UNRESOLVED.

**Compressed class pointers are a separate flag from compressed oops.** The 12→16 B
widening comes from `-XX:-UseCompressedClassPointers`, _not_ from `-XX:-UseCompressedOops`.
JEP 450: _"They are enabled by default, but can be disabled via
`-XX:-UseCompressedClassPointers`. The only reason to disable them, however, would be for
an application that loads more than about four million classes."_ The repo conflates the
two in at least one place (Table entry F below).

### 1.3 The mark-word bit layout — the critical answer

`markWord.hpp` carries the canonical diagram. **JDK 25** (`jdk-25+36`, lines 36–50):

```
//  64 bits:
//  unused:22 hash:31 -->| unused_gap:4  age:4  self-fwd:1  lock:2 (normal object)
//
//  64 bits (with compact headers):
//  klass:22  hash:31 -->| unused_gap:4  age:4  self-fwd:1  lock:2 (normal object)
```

with `static const int unused_gap_bits = LP64_ONLY(4) ... // Reserved for Valhalla.`

**JDK 27** (`jdk27` branch) — same shape, the reserved 4 bits now named:

```
//  64 bits (without compact headers):
//  unused:22  hash:31  valhalla:4  age:4  self-fwd:1  lock:2
//
//  64 bits (with compact headers):
//  klass:22   hash:31  valhalla:4  age:4  self-fwd:1  lock:2
```

**The answer, stated plainly:**

- The low 11 bits are **identical** with and without compact headers: `lock:2`,
  `self-fwd:1`, `age:4`, `valhalla:4`.
- **Hash code stays 31 bits.** `hash_bits = min(max_hash_bits, 31)` in both builds. JEP 450
  says so in words: _"The size of the hash code does not change."_ No skill claim about
  hash-code width needs changing.
- The only change is the top 22 bits: `unused:22` becomes `klass:22`. Compact headers
  **re-encode the compressed class pointer from 32 bits down to 22 bits** and move it into
  the mark word (JEP 450: _"reduce the size of compressed class pointers from 32 bits to
  22 bits by changing the compressed class pointer encoding"_). The separate class word
  disappears.
- Constants: `klass_bits = 22`, `klass_shift = hash_shift + hash_bits`,
  `klass_offset_in_bytes = 4` — identical in JDK 25 and JDK 27 `markWord.hpp`.

**Locking protocol and observable states.** The three lock-tag values are unchanged:
`00` locked (fast-locked), `01` unlocked, `10` monitor, `11` marked. `LM_LIGHTWEIGHT`,
the `LockStack` and the `ANONYMOUS_OWNER` inflation handshake are **not** altered by COH.

**But one observable state IS changed, and this is the thing `lock-inflation` gets wrong.**
COH forces `UseObjectMonitorTable=true`. `arguments.cpp`, `Arguments::set_compact_headers_flags()`:

```cpp
// jdk-25+36
if (UseCompactObjectHeaders && !UseObjectMonitorTable) {
  if (FLAG_IS_CMDLINE(UseCompactObjectHeaders)) { FLAG_SET_DEFAULT(UseObjectMonitorTable, true); }
  else if (FLAG_IS_CMDLINE(UseObjectMonitorTable)) { FLAG_SET_DEFAULT(UseCompactObjectHeaders, false); }
  else { FLAG_SET_DEFAULT(UseObjectMonitorTable, true); }
}
if (UseCompactObjectHeaders && LockingMode != LM_LIGHTWEIGHT) { FLAG_SET_DEFAULT(LockingMode, LM_LIGHTWEIGHT); }
if (UseCompactObjectHeaders && !UseCompressedClassPointers)  { FLAG_SET_DEFAULT(UseCompressedClassPointers, true); }

// jdk27 — simplified, because LockingMode and UseCompressedClassPointers are gone
if (UseCompactObjectHeaders && !UseObjectMonitorTable) {
  if (FLAG_IS_CMDLINE(UseObjectMonitorTable))
    warning("-UseObjectMonitorTable is incompatible with +UseCompactObjectHeaders; ignoring -UseObjectMonitorTable");
  FLAG_SET_DEFAULT(UseObjectMonitorTable, true);
}
```

and `globals.hpp` on jdk27: `product(bool, UseObjectMonitorTable, true, DIAGNOSTIC, ...)`.

The consequence is spelled out in the jdk27 `markWord.hpp` state table:

```
//    [header          | 00]  locked    locked regular object header (fast-locking in use)
//    [header          | 01]  unlocked  regular object header
//    [header          | 10]  monitor   inflated lock (UseObjectMonitorTable == true)
//    [ptr             | 10]  monitor   inflated lock (UseObjectMonitorTable == false, header is swapped out)
//    [ptr             | 11]  marked    used to mark an object (header is swapped out)
```

So: **with compact headers on, inflation no longer overwrites the mark word with an
`ObjectMonitor*`.** The header stays in place (klass, hash and age preserved), only the
tag flips to `10`, and the monitor is located through a side table. JEP 450 says the same
thing in prose: _"Locking operations no longer overwrite the mark word with a tagged
pointer, thus preserving the compressed class pointer."_ This is a real change to what a
debugger, the Serviceability Agent, or a hand-decoded mark word shows — and it becomes the
JDK 27 **default**.

### 1.4 Interaction with compressed oops and the ~32 GB threshold

- COH does **not** change the compressed-oops threshold. JEP 450 mentions
  `UseCompressedOops` nowhere; the flag it constrains is `UseCompressedClassPointers`.
  Corroborated independently by JEP 516 (JDK 26), which still describes the boundary as
  _"For heaps larger than 32 GB, object references are represented as 64-bit addresses …
  For heaps smaller than 32 GB, object references are stored in reference fields as 32-bit
  values"_ with no COH caveat.
- COH **requires** compressed class pointers and will silently disable itself (JDK 25,
  with a warning) if they are turned off. On JDK 27 `UseCompressedClassPointers` is
  **obsolete** (see §3), so the interaction disappears.
- COH **does** change the compressed-class-pointer _encoding_: 32-bit → 22-bit.

### 1.5 JOL with the flag on

JOL derives header geometry from the running VM rather than assuming it
(`HotspotUnsafe.objectHeaderSize = guessHeaderSize(); arrayHeaderSize = objectHeaderSize + 4`),
so it is correct under COH with no extra flags. What changes in the _printed_ table is the
header rows: `ClassLayout` emits `(object header: mark)` sized `model.markHeaderSize()` and
`(object header: class)` sized `model.classHeaderSize()`, plus `(array length)` sized
`model.arrayLengthHeaderSize()`
(<https://github.com/openjdk/jol/blob/master/jol-core/src/main/java/org/openjdk/jol/info/ClassLayout.java>,
message constants at ~L256). With COH the class-word contribution is folded into the mark
word, so the class row is not a separate 4 bytes and the first field offset moves from 12
to 8. Any teaching example that hard-codes "first `long` lands at offset 16" is a
no-COH example.

### 1.6 Alignment and the real per-object saving

`ObjectAlignmentInBytes` defaults to 8 and is untouched by COH (`globals.hpp`, both 25 and
27). Because every object is rounded up to an 8-byte multiple, saving 4 header bytes
yields either 8 bytes or 0 bytes per object depending on whether the class's payload
happened to sit just above an alignment boundary. **The repo already states this correctly**
(`jvm-memory-regions/SKILL.md:62-63`) — do not "fix" it. For allocation-rate arithmetic:
per-object saving is 0 or 8 bytes, never a flat 4, so `gc.alloc.rate.norm` deltas are
lumpy by class, and a heap-wide estimate needs a JOL/histogram measurement, not
multiplication.

### 1.7 Measured results — quote these, and only these

From JEP 519 and JEP 534 (identical wording in both):

- _"In one setting, the SPECjbb2015 benchmark uses 22% less heap space and 8% less CPU time."_
- _"In another setting, the number of garbage collections done by SPECjbb2015 is reduced by
  15%, with both the G1 and Parallel collectors."_
- _"A highly parallel JSON parser benchmark runs in 10% less time."_

**Stated environment: none.** "In one setting" / "in another setting" is the whole
specification. There is no hardware, heap size, JDK build or SPECjbb configuration given
in either JEP. Any skill citing these numbers must say so. The only other quantified claim
is from JEP 450: _"Early adopters of Project Lilliput who have tried it with real-world
applications confirm that live data is typically reduced by 10%–20%"_ and _"Experiments
conducted as part of Project Lilliput show that many workloads have average object sizes of
256 to 512 bits (32 to 64 bytes). This implies that more than 20% of live data can be taken
by object headers alone."_

JEP 450's own performance _goal_ (a bound, not a measurement): _"Should not introduce more
than 5% throughput or latency overheads on the target 64-bit platforms, and only in
infrequent cases."_ Target platforms are **x64 and AArch64 only**.

### 1.8 Incompatibilities and limitations (all from JEP 450 "Description")

| Condition                                             | Effect                                                                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compressed class pointers disabled                    | COH disabled (JDK 25 warns); moot on JDK 27                                                                                                                            |
| Legacy stack-locking (`LockingMode=1`, `LM_LEGACY`)   | Incompatible — _"compact object headers are disabled"_. On JDK 27 `LockingMode` no longer exists                                                                       |
| JVMCI enabled (Graal) on x64                          | _"Compressed class pointers are not supported by JVMCI on x64. We mitigate the immediate risk by disabling compact object headers when JVMCI is enabled."_             |
| Heap **> 8 TB** with any collector **other than ZGC** | _"Compact object headers are currently not compatible with larger heaps when collectors other than ZGC are used"_ — sliding-GC forwarding encodes into the low 42 bits |
| 32-bit platforms                                      | Non-goal; headers are already 64 bits there                                                                                                                            |
| `UseObjectMonitorTable=false` requested explicitly    | JDK 25: COH turns off. JDK 27: warning, request ignored                                                                                                                |

**No collector is unsupported.** All of Serial, Parallel, G1, ZGC and Shenandoah work with
COH; only the >8 TB non-ZGC case is excluded. Self-forwarding on evacuation failure uses
the dedicated `self-fwd` bit instead of overwriting the header (JEP 450, "GC forwarding").

---

## Section 2 — Valhalla status framing

### 2.1 The authoritative JEP table

From <https://openjdk.org/projects/valhalla/> ("Project JEPs", read 2026-08-27) plus each
JEP page:

| JEP           | Title                                            | Feature set             | Status         | Release |
| ------------- | ------------------------------------------------ | ----------------------- | -------------- | ------- |
| 401           | Value Objects (Preview)                          | Value Objects           | **Integrated** | **28**  |
| 539           | Strict Field Initialization in the JVM (Preview) | Supplementary           | **Integrated** | **28**  |
| _(no number)_ | Null-Restricted Value Class Types (Preview)      | Null-Restricted Storage | **Draft**      | —       |
| 402           | Enhanced Primitive Boxing (Preview)              | Unifying Primitives     | **Draft**      | —       |

JEP 402's own page: `Status **Draft**`, no Release field, Owner Dan Smith, updated
2025/11/19. It has a number but **no target release**.
The Null-Restricted Value Class Types draft is listed on the project page **without a JEP
number** — do not invent one.

Two further feature sets on the project page ("Array Enhancements", "Parametric JVM") have
**no JEP at all**.

Project page announcement (August 2026): _"JEP 401: Value Objects (Preview) and JEP 539:
Strict Field Initialization in the JVM (Preview) are now integrated and will be included in
JDK 28!"_ JDK 28's own page lists 401 and 539 among "JEPs targeted to JDK 28, so far"
(<https://openjdk.org/projects/jdk/28/>).

Note the vocabulary distinction the repo needs: **Integrated ≠ Targeted ≠ Delivered.**
401/539 are Integrated for 28 (code is in the main line, JDK 28 is still open, so 28's
feature set is not frozen). Contrast JEP 535 (Shenandoah generational by default): merely
_Targeted_, Release 28.

### 2.2 What a developer can and cannot do today

**On JDK 25 or 26: nothing.** Value objects are not available at all — not as a product
feature, not as a preview, not behind `--enable-preview`. JEP 401 is Integrated for
**release 28**; there is no backport. Trying it requires a JDK 28 early-access build
(<https://jdk.java.net/28/>), which the project page explicitly points at.

On JDK 27 (RC, GA imminent): still nothing. JDK 27's frozen feature list is 523, 527, 531,
532, 533, 534, 536, 537, 538 — no Valhalla JEP among them
(<https://openjdk.org/projects/jdk/27/>).

Corollary for the two skills: any claim that "escape analysis is the only way to avoid the
allocation today" remains **true** on 25/26/27. The framing that needs correcting is the
JEP numbering and the word "preview".

### 2.3 What changes for escape analysis and the Vector API if value objects land

For the Vector API, the JEP text is explicit and quotable — JEP 537 (JDK 27, twelfth
incubator): _"The Vector API will incubate until necessary features of Project Valhalla
[are available] … Alignment with Project Valhalla — The long-term goal of the Vector API is
to leverage Project Valhalla's enhancements to the Java object model. … We expect
ultimately to declare vector classes as value classes."_ So finalisation of the Vector API
is gated on Valhalla and no version can be promised — the repo's existing framing on this
point is correct; only the incubator round number is stale.

For escape analysis, no JEP asserts a specific C2 consequence, so state only the
mechanism: value objects lack identity, which is what removes the _obligation_ to
materialise a heap object. This is not the same as scalar replacement succeeding, and no
sourced claim exists that C2's escape analysis changes. Keep this qualitative.

---

## Section 3 — Falsification sweep, JDK 26 and JDK 27

Sources: <https://openjdk.org/projects/jdk/26/>, <https://openjdk.org/projects/jdk/27/>,
Oracle _Consolidated JDK 26 Release Notes_
(<https://www.oracle.com/java/technologies/javase/26all-relnotes.html>), and the
`jdk27` branch of `openjdk/jdk`.

### 3.1 JDK 26 feature JEPs (GA 2026-03-17)

500, 504, **516**, 517, **522**, 524, 525, **526**, **529**, 530.

| JEP                                                        | What changed                                                                                                                                                                                                                                                                                                                                            | Skill topics affected                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **522** G1: Improve Throughput by Reducing Synchronization | Second card table; write barriers on x64 cut _"from around 50 instructions to just 12"_; _"throughput gains in the range of 5–15%"_ on reference-heavy workloads, up to 5% otherwise. Adds **one extra card table = 0.2% of heap capacity ≈ 2 MB native per 1 GB heap**. Controls unchanged: `-XX:-G1UseConcRefinement`, `-XX:G1ConcRefinementThreads`. | g1-tuning-for-slo, g1-concurrent-marking, gc-fundamentals (write-barrier cost), container-awareness / jvm-memory-regions (native footprint budget) |
| **516** AOT Object Caching with Any GC                     | AOT cache now works with **ZGC**. New flag `-XX:+AOTStreamableObjects`. JDK ships **two baseline AOT caches**. Heuristic: streamable format chosen if training used ZGC, `-XX:-CompressedOops`, or heap > 32 GB.                                                                                                                                        | startup-cds-crac-leyden, jvm-class-loading, jit-compilation (warmup)                                                                               |
| **529** Vector API (Eleventh Incubator)                    | Still incubating; JDK 26 = round 11                                                                                                                                                                                                                                                                                                                     | simd-and-vector-api                                                                                                                                |
| **526** Lazy Constants (Second Preview)                    | **JEP 502 "Stable Values" was renamed to "Lazy Constants"** (526 in 26, 531 third preview in 27)                                                                                                                                                                                                                                                        | any skill citing StableValue                                                                                                                       |
| **500** Prepare to Make Final Mean Final                   | Delivered in 26                                                                                                                                                                                                                                                                                                                                         | java-serialization-hardening, off-heap-memory, reflection topics                                                                                   |
| 525 / 530 / 524 / 517 / 504                                | Structured Concurrency 6th preview; Primitive patterns 4th preview; PEM 2nd preview; HTTP/3; Applet API removed                                                                                                                                                                                                                                         | java-structured-concurrency, java-pattern-matching                                                                                                 |

### 3.2 JDK 26 release-note items (non-JEP) that matter

| Item                                                                                                                                   | Change                                                                                                                                                                                                                                                                                                                                           | Affects                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **JDK-8371986 — Default Initial Heap Size Now Set to MinHeapSize**                                                                     | _"This change removes the default value of `InitialRAMPercentage`. Now, if the user does not specify an initial Java heap size, the JVM sets the initial heap size to the minimum possible heap size, which equals to `MinHeapSize`."_ Previously 1/64 of RAM (`InitialRAMPercentage = 1.5625`). Restore with `-XX:InitialRAMPercentage=1.5625`. | container-awareness (**explicit falsification**, see table row D), jvm-gc-tuning, jvm-memory-regions                  |
| **JDK-8369346 — Deprecate the MaxRAM Flag**                                                                                            | Deprecated; _"the default value of `MaxRAM` has been removed"_; heap sizing now uses actual available memory. Obsoleted in **JDK 27** (`special_jvm_flags`: deprecated 26, obsolete 27, expired 28)                                                                                                                                              | container-awareness, jvm-gc-tuning                                                                                    |
| **JDK-8370843 — Deprecate `AlwaysActAsServerClassMachine` / `NeverActAsServerClassMachine`**                                           | Both deprecated; obsolete in **JDK 27**                                                                                                                                                                                                                                                                                                          | gc-fundamentals, container-awareness                                                                                  |
| **JDK-8370813 — Deprecate `AggressiveHeap`**                                                                                           | Deprecated; obsolete in **JDK 27**                                                                                                                                                                                                                                                                                                               | jvm-gc-tuning                                                                                                         |
| **JDK-8213762 — Deprecate `-Xmaxjitcodesize`**                                                                                         | Alias for `-XX:ReservedCodeCacheSize`; deprecated                                                                                                                                                                                                                                                                                                | jit-compilation, code-cache-segments, jvm-memory-regions                                                              |
| **JDK-8382740 — `jdk.OldObjectSample` Disabled for Generational ZGC**                                                                  | _"The JFR event `jdk.OldObjectSample` is disabled when using generational ZGC. The combination results in unacceptable performance overhead."_ ZGC has been generational-only since JDK 24 (JEP 490) ⇒ **`OldObjectSample` is unavailable on any ZGC deployment from JDK 26**                                                                    | java-reference-types-and-leaks (**falsification**, row E), heap-dump-analysis, memory-leak / jfr skills               |
| **JDK-8369238 — Virtual Threads Now Unmount When Waiting for a Class Initializer**                                                     | _"A virtual thread that tries to initialize a class already being initialized by another thread will now, in most cases, be unmounted … Previously, the behavior was to pin the virtual thread to its carrier."_                                                                                                                                 | blocking-and-nonblocking-io (**falsification**, row G), lock-inflation, java-virtual-threads, concurrency-diagnostics |
| **JDK-8364993 / JDK-8364556 — `jdk.ModuleExport`, `jdk.SymbolTableStatistics`, `jdk.StringTableStatistics` disabled in `default.jfc`** | Re-enable with `-XX:StartFlightRecording:jdk.ModuleExport#enabled=true`                                                                                                                                                                                                                                                                          | jfr-advanced, continuous-profiling, metaspace-internals                                                               |
| **JDK-8212084 — G1 supports `UseGCOverheadLimit`**                                                                                     | G1 now throws OOME when GC overhead > `GCTimeLimit` (98) and free heap < `GCHeapFreeLimit` (2) for five consecutive GCs. Enabled by default; disable with `-XX:-UseGCOverheadLimit`                                                                                                                                                              | jvm-gc-tuning, g1-tuning-for-slo, gc-log-analysis (new OOME cause on G1)                                              |
| **JDK-8048180 — G1 eager reclaim of humongous objects _with references_**                                                              | Now covers `Object[]` and regular humongous objects, not just reference-free ones                                                                                                                                                                                                                                                                | g1-tuning-for-slo, gc-fundamentals (humongous section)                                                                |
| **JDK-8366434 — `-XX:+UseTransparentHugePages` again enables THP for G1**                                                              | The regression that made the flag ineffective is fixed (THP mode `madvise`)                                                                                                                                                                                                                                                                      | linux-for-jvm                                                                                                         |
| **JDK-8371986 companion / JDK-8368740 — Serial expands eden beyond `SurvivorRatio`**                                                   | Under a nearly full heap Serial may grow eden past the `SurvivorRatio` bound to satisfy an allocation                                                                                                                                                                                                                                            | jvm-gc-tuning                                                                                                         |
| **JDK-8364638 — New CPU time logging**                                                                                                 | `-Xlog:cpu` prints a VM CPU-time breakdown table at VM exit (Total / Garbage Collection / GC Threads / VM Thread)                                                                                                                                                                                                                                | cpu-profiling, pause-attribution, gc-log-analysis                                                                     |
| **JDK-8365057 — thread dumps include park-blocker owner**                                                                              | `HotSpotDiagnosticMXBean.dumpThreads` and `jcmd Thread.dump_to_file` now name the owner of an `AbstractOwnableSynchronizer` park blocker                                                                                                                                                                                                         | concurrency-diagnostics, lock-inflation                                                                               |

**Not changed in JDK 26 (a negative result worth recording):** `sun.misc.Unsafe`
memory-access default. `MemoryAccessOption.defaultValue()` still returns `WARN` on the
`jdk27` branch
(<https://github.com/openjdk/jdk/blob/jdk27/src/jdk.unsupported/share/classes/sun/misc/Unsafe.java>,
~L1848). Nothing in the JDK 26 release notes mentions it. See table row H.

### 3.3 JDK 27 feature JEPs (RC, feature set frozen)

523, 527, 531, 532, 533, **534**, **536**, **537**, 538.

| JEP                                                | What changed                                                                                                                                                                                                                                                                                              | Skill topics affected                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **523** Make G1 the Default GC in All Environments | _"If you do not specify a garbage collector on the command line then the JVM will always select G1, regardless of the number of processors and the available physical memory."_ Kills the JDK 9-era "< 2 CPUs or < 1792 MB ⇒ Serial" rule. Serial is not deprecated or removed — you can still select it. | gc-fundamentals, jvm-gc-tuning, container-awareness, jvm-memory-regions                                                                      |
| **534** Compact Object Headers by Default          | See Section 1                                                                                                                                                                                                                                                                                             | jvm-memory-regions, lock-inflation, cpu-cache-and-numa, false-sharing-and-contended, allocation-profiling, heap-dump-analysis, jvm-gc-tuning |
| **536** JFR In-Process Data Redaction              | New JFR capability                                                                                                                                                                                                                                                                                        | jfr-advanced, continuous-profiling                                                                                                           |
| **537** Vector API (Twelfth Incubator)             | Round 12; SLEEF 3.6.1 → 3.9.0 for ARM/RISC-V vector math intrinsics; _"re-incubate … without API change"_                                                                                                                                                                                                 | simd-and-vector-api                                                                                                                          |
| 531 / 532 / 533                                    | Lazy Constants 3rd preview; Primitive patterns 5th preview; Structured Concurrency 7th preview                                                                                                                                                                                                            | java-structured-concurrency, java-pattern-matching                                                                                           |

### 3.4 JDK 27 flag removals — from `special_jvm_flags[]` on the `jdk27` branch

<https://github.com/openjdk/jdk/blob/jdk27/src/hotspot/share/runtime/arguments.cpp>

**Obsoleted in 27** (accepted with a warning, ignored; expire in 28):
`UseCompressedClassPointers`, `ParallelRefProcEnabled`, `ParallelRefProcBalancingEnabled`,
`PSChunkLargeArrays`, `MaxRAM`, `NewSizeThreadIncrease`, `AlwaysActAsServerClassMachine`,
`NeverActAsServerClassMachine`, `AggressiveHeap`, `UseXMMForArrayCopy`, `UseNewLongLShift`,
and seven `Shenandoah*` sampling/adaptive flags.

**Newly deprecated in 27** (obsolete in 28, expired 29):
`InitiatingHeapOccupancyPercent` — and it is in the **alias** list:

```cpp
static AliasedFlag const aliased_jvm_flags[] = {
  { "CreateMinidumpOnCrash", "CreateCoredumpOnCrash" },
  G1GC_ONLY({"InitiatingHeapOccupancyPercent" COMMA "G1IHOP" } COMMA)
  { nullptr, nullptr}
};
```

⇒ **the replacement flag name is `-XX:G1IHOP`.** Also newly deprecated: `AlwaysCompileLoopMethods`.

**Removed outright in 27:** `LockingMode` (and with it `LM_LEGACY` / `LM_MONITOR`). Zero
occurrences of `LockingMode` in either `globals.hpp` or `arguments.cpp` on the `jdk27`
branch. `LightweightFastLockingSpins` (default 13) has been renamed to `FastLockingSpins`
with default **8**. This _confirms_ the repo's existing prediction — see table row K, which
is an upgrade from "planned" to "done", not a correction.

### 3.5 Also removed in JDK 26 (from the release notes, lower relevance)

`Thread.stop` removed; InfiniBand SDP support removed; `jrunscript` removed;
`jdk.jsobject` module removed; `DatagramSocketImpl.setTTL/getTTL` and
`MulticastSocket.setTTL/getTTL` removed. `HttpContext` attributes no longer shared with
`HttpExchange` by default; `HttpClient` no longer sends `Content-Length` on bodyless
requests.

---

## The deliverable table

Only rows where **both** the repo text and the corrected fact were verified. Paths are
relative to `C:\git\agent-skills\skills\`. Line numbers as of 2026-08-27.

| #   | skill                                    | file:line                                                                                                                                    | current claim                                                                                                                                                              | why it is now wrong                                                                                                                                                                                                                                                                                                       | corrected claim                                                                                                                                                                                                                                                                                                                                                          | source URL                                                                                                                                                            |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | jvm-memory-regions                       | `jvm-memory-regions/SKILL.md:61-62`                                                                                                          | "Compact object headers (JEP 519, product in 25) are **off by default**"                                                                                                   | True on 25/26 only. JEP 534 makes them the default in JDK 27; `globals.hpp@jdk27` has `UseCompactObjectHeaders, true`                                                                                                                                                                                                     | "Off by default through JDK 26 (JEP 519); **on by default from JDK 27** (JEP 534), disable with `-XX:-UseCompactObjectHeaders`. The 8-byte-alignment caveat below still holds."                                                                                                                                                                                          | <https://openjdk.org/jeps/534>                                                                                                                                        |
| B   | cpu-cache-and-numa                       | `cpu-cache-and-numa/SKILL.md:55` and `references/false-sharing.md:56`                                                                        | "Compact Object Headers (JEP 519) is product in JDK 25 … **off by default**"                                                                                               | Same as A. Also the worked example at `false-sharing.md:50-52` ("with a 12-byte header the first `long` lands at offset 16") is a no-COH example that silently becomes wrong on 27                                                                                                                                        | State both modes: "12-byte header (JDK ≤ 26 default) ⇒ first `long` at 16; 8-byte header (JEP 534, JDK 27 default) ⇒ first `long` at 8. Re-run JOL on the target JDK."                                                                                                                                                                                                   | <https://openjdk.org/jeps/534>                                                                                                                                        |
| C   | false-sharing-and-contended              | `references/contended-mechanics.md:36-40` and `SKILL.md:83-84`                                                                               | Table row "Default (JDK 25, `UseCompactObjectHeaders=false`) — 12 bytes … / 16 bytes" and "product on JDK 25 … **off by default**"                                         | The "Default" row is now version-conditional; on JDK 27 the default row is 8 bytes                                                                                                                                                                                                                                        | Relabel: "JDK ≤ 26 default" for the 12/16 row, "**JDK 27 default** (JEP 534) / `-XX:+UseCompactObjectHeaders` on 24–26" for the 8-byte row                                                                                                                                                                                                                               | <https://openjdk.org/jeps/534>                                                                                                                                        |
| D   | false-sharing-and-contended              | `references/contended-mechanics.md:31-32`                                                                                                    | "**Klass pointer**: 4 bytes with `UseCompressedOops` (the default up to roughly 32 GB heaps) or 8 bytes without"                                                           | Wrong flag. The klass-pointer width is controlled by **`UseCompressedClassPointers`**, a distinct flag with no 32 GB heap relationship. JEP 450: _"can be disabled via `-XX:-UseCompressedClassPointers`. The only reason to disable them … would be for an application that loads more than about four million classes"_ | "**Klass pointer**: 4 bytes with `UseCompressedClassPointers` (on by default; obsoleted in JDK 27, always on), 8 bytes without. This is _not_ `UseCompressedOops` and is unrelated to the 32 GB heap threshold."                                                                                                                                                         | <https://openjdk.org/jeps/450>                                                                                                                                        |
| E   | lock-inflation                           | `references/monitor-lifecycle.md:58`                                                                                                         | Inflation "CASes the mark word from tag `00` to **a monitor pointer** with tag `10`"                                                                                       | Only true when `UseObjectMonitorTable == false`. Compact headers force it to `true` (`Arguments::set_compact_headers_flags`), and JDK 27 defaults `UseObjectMonitorTable` to `true`. With it on, the header is preserved and the tag alone flips to `10`; the monitor is found via a side table                           | "CASes the lock tag from `00` to `10`. Whether the mark word is _overwritten_ with an `ObjectMonitor*` depends on `UseObjectMonitorTable`: with it off (JDK ≤ 26 default) the header is swapped out and displaced; with it on (forced by `UseCompactObjectHeaders`, and the JDK 27 default) the header stays in place and the monitor is looked up in a side table."     | <https://github.com/openjdk/jdk/blob/jdk27/src/hotspot/share/oops/markWord.hpp> ; <https://github.com/openjdk/jdk/blob/jdk27/src/hotspot/share/runtime/arguments.cpp> |
| F   | lock-inflation                           | `references/monitor-lifecycle.md:115` and `SKILL.md:71`                                                                                      | "Removal of the deprecated modes **planned** — JDK 27"; "removal **planned** for JDK 27"                                                                                   | No longer a plan. `LockingMode` has **zero occurrences** in `globals.hpp` and `arguments.cpp` on the `jdk27` branch — the flag and both legacy modes are gone                                                                                                                                                             | "`LM_LEGACY` and `LM_MONITOR` were deprecated in JDK 24 (JDK-8334299) and the `-XX:LockingMode` flag was **removed in JDK 27**. On JDK 27 the flag is unrecognised; lightweight locking is the only mechanism."                                                                                                                                                          | <https://github.com/openjdk/jdk/blob/jdk27/src/hotspot/share/runtime/globals.hpp>                                                                                     |
| G   | lock-inflation                           | `SKILL.md:36`                                                                                                                                | Workflow step 1: "Run `java -XX:+PrintFlagsFinal -version \| grep LockingMode`. `2` (`LM_LIGHTWEIGHT`) is the JDK 25 default"                                              | Correct on 25/26; on JDK 27 the grep returns nothing because the flag no longer exists, which reads as a broken instruction                                                                                                                                                                                               | Keep the step for JDK ≤ 26 and add: "On JDK 27 the flag is gone — an empty result is expected, not a problem. Check `UseObjectMonitorTable` instead, which determines what an inflated mark word looks like."                                                                                                                                                            | <https://github.com/openjdk/jdk/blob/jdk27/src/hotspot/share/runtime/globals.hpp>                                                                                     |
| H   | lock-inflation                           | `references/monitor-lifecycle.md:127`                                                                                                        | "Residual pinning survives for `synchronized` inside native calls (JNI, downcalls) **and in class initialisers**"                                                          | JDK 26, JDK-8369238: a virtual thread waiting for _another_ thread to run a class initializer now unmounts "in most cases"                                                                                                                                                                                                | "Residual pinning survives for `synchronized` inside native frames (JNI, FFM downcalls). **From JDK 26 (JDK-8369238), waiting for another thread to execute a class initializer no longer pins — the virtual thread unmounts in most cases.**"                                                                                                                           | <https://www.oracle.com/java/technologies/javase/26all-relnotes.html> (JDK-8369238)                                                                                   |
| I   | blocking-and-nonblocking-io              | `references/what-unmounts.md:16` (and 40, 107)                                                                                               | Table row "Blocking inside a class initialiser (`<clinit>`) — **pins** — held, no compensation"                                                                            | Same JDK 26 change                                                                                                                                                                                                                                                                                                        | Split the row: "Waiting for another thread's `<clinit>` — JDK ≤ 25: **pins**; **JDK 26+: unmounts** (JDK-8369238, 'in most cases')." Lines 40 and 107 ("force class initialisation at startup") must be re-scoped to the residual case                                                                                                                                   | <https://www.oracle.com/java/technologies/javase/26all-relnotes.html> (JDK-8369238)                                                                                   |
| J   | container-awareness                      | `references/reading-the-container.md:30`                                                                                                     | Baseline defaults block: `double InitialRAMPercentage = 1.562500 {product}`                                                                                                | JDK 26, JDK-8371986: _"This change removes the default value of `InitialRAMPercentage`. Now … the JVM sets the initial heap size to … `MinHeapSize`"_                                                                                                                                                                     | Mark the 1.5625 value as "JDK ≤ 25". Add: "**From JDK 26 the default value of `InitialRAMPercentage` is removed**; with no `-Xms`, initial heap = `MinHeapSize`. Restore the old behaviour with `-XX:InitialRAMPercentage=1.5625`."                                                                                                                                      | <https://www.oracle.com/java/technologies/javase/26all-relnotes.html> (JDK-8371986)                                                                                   |
| K   | java-reference-types-and-leaks           | `references/leak-patterns.md:20-23`                                                                                                          | "`jdk.OldObjectSample` … is cheap enough to leave enabled and answers the same question without a multi-gigabyte dump" — recommended unconditionally                       | JDK 26, JDK-8382740: _"The JFR event `jdk.OldObjectSample` is disabled when using generational ZGC."_ ZGC is generational-only since JDK 24 (JEP 490), so this means **all ZGC deployments on JDK 26+**                                                                                                                   | Add the caveat: "**Not available under ZGC from JDK 26** (JDK-8382740) — the event is disabled because the weak-handle implementation costs too much in generational ZGC. Under ZGC, fall back to a heap dump."                                                                                                                                                          | <https://www.oracle.com/java/technologies/javase/26all-relnotes.html> (JDK-8382740)                                                                                   |
| L   | off-heap-memory                          | `SKILL.md:75-76` and `references/ffm-memory-api.md:135`                                                                                      | "Phase 3 (**JDK 26+**) flips the default from `warn` to `deny`"; "`deny` — fails today, as it will by default from **JDK 26+**"                                            | JDK 26 GA'd on 2026-03-17 without this change (nothing in the release notes), and JDK 27's feature set is frozen without it. `MemoryAccessOption.defaultValue()` still returns `WARN` on the `jdk27` branch                                                                                                               | "`warn` remains the default through **JDK 27**; no release has yet been announced for the flip to `deny`. Test with `--sun-misc-unsafe-memory-access=deny` anyway — the change is coming, the version is not yet fixed."                                                                                                                                                 | <https://github.com/openjdk/jdk/blob/jdk27/src/jdk.unsupported/share/classes/sun/misc/Unsafe.java>                                                                    |
| M   | epsilon-and-shenandoah-internals         | `SKILL.md:75-76`                                                                                                                             | "Do not assume Shenandoah will follow ZGC's trajectory to generational-by-default. Nothing in JEP 521 states such a plan; treat any expectation of it as **speculation**." | **JEP 535: Shenandoah GC: Generational Mode by Default** — Status _Targeted_, Release **28**                                                                                                                                                                                                                              | "Generational mode is **not** the default through JDK 27 — `-XX:+UseShenandoahGC` alone still runs single-generation, so `-XX:ShenandoahGCMode=generational` is still required. **JEP 535 is Targeted for JDK 28** and will make it the default there."                                                                                                                  | <https://openjdk.org/jeps/535> ; <https://openjdk.org/projects/jdk/28/>                                                                                               |
| N   | escape-analysis-internals                | `SKILL.md:90-91`                                                                                                                             | "Project Valhalla (**JEP 401, JEP 402**) is **in preview targeting JDK 28**"                                                                                               | JEP 402 (Enhanced Primitive Boxing) is **Draft** with **no target release** — it is not part of JDK 28. And 401 is _Integrated for_ 28, not "in preview targeting" it: it is not previewable on 25/26/27 at all                                                                                                           | "Project Valhalla's **JEP 401 (Value Objects, Preview)** and **JEP 539 (Strict Field Initialization in the JVM, Preview)** are Integrated for **JDK 28** — usable only on a JDK 28 early-access build, not on 25/26/27. **JEP 402 (Enhanced Primitive Boxing) is a Draft with no target release.** Code that depends on escape analysis to avoid allocation still does." | <https://openjdk.org/projects/valhalla/> ; <https://openjdk.org/jeps/402> ; <https://openjdk.org/jeps/401>                                                            |
| O   | simd-and-vector-api                      | `SKILL.md:59-60`                                                                                                                             | "tenth incubator round (**JEP 508**) at the JDK 25 baseline"                                                                                                               | JEP 529 = eleventh incubator, Delivered in JDK 26; JEP 537 = twelfth, Delivered in JDK 27                                                                                                                                                                                                                                 | "…still incubating: tenth round (JEP 508) in JDK 25, **eleventh (JEP 529) in JDK 26, twelfth (JEP 537) in JDK 27**. JEP 537 also updates the bundled SLEEF library from 3.6.1 to 3.9.0 for ARM/RISC-V vector math intrinsics."                                                                                                                                           | <https://openjdk.org/jeps/529> ; <https://openjdk.org/jeps/537>                                                                                                       |
| P   | simd-and-vector-api                      | `references/when-to-vectorise.md:100-112`                                                                                                    | Incubator round table ends at "508 / **10th** / **25 (baseline)**"; "JEP 508 is the canonical reference for the API's state at the baseline"                               | Two more rounds shipped                                                                                                                                                                                                                                                                                                   | Append rows `529 / 11th / 26` and `537 / 12th / 27`, and point the "canonical reference" at the newest round for the reader's actual JDK. The surrounding claim that finalisation is Valhalla-gated with no announced date **remains correct** (JEP 537 restates it).                                                                                                    | <https://openjdk.org/jeps/537>                                                                                                                                        |
| Q   | g1-tuning-for-slo                        | `references/flags-and-baselines.md:23, 47, 58, 70, 80, 91, 101`; `SKILL.md` IHOP guidance                                                    | Recommends `-XX:InitiatingHeapOccupancyPercent=35/40/45/60` as live tuning advice with default 45                                                                          | Deprecated in JDK 27 (`special_jvm_flags`: deprecated 27, obsolete 28, expired 29) and **aliased to `G1IHOP`** in `aliased_jvm_flags`                                                                                                                                                                                     | Keep the tuning reasoning; note "`-XX:InitiatingHeapOccupancyPercent` is **deprecated from JDK 27** and aliased to **`-XX:G1IHOP`**; it becomes obsolete in JDK 28. Use `G1IHOP` on 27+."                                                                                                                                                                                | <https://github.com/openjdk/jdk/blob/jdk27/src/hotspot/share/runtime/arguments.cpp>                                                                                   |
| R   | g1-concurrent-marking                    | `references/marking-cycle-log-and-flags.md:93, 100-101`; `SKILL.md:40, 57, 62`                                                               | Same — `InitiatingHeapOccupancyPercent` used as the current flag name, incl. in `PrintFlagsFinal \| grep` recipes                                                          | Same as Q                                                                                                                                                                                                                                                                                                                 | Same as Q; the `grep -i ihop` recipe at line 101 still works because `G1IHOP` also matches                                                                                                                                                                                                                                                                               | <https://github.com/openjdk/jdk/blob/jdk27/src/hotspot/share/runtime/arguments.cpp>                                                                                   |
| S   | jvm-gc-tuning                            | `references/collector-and-heap.md:14`                                                                                                        | Collector-selection table row: "Serial — **Small containers, single core, short-lived processes**", presented without a version caveat next to "G1 (default)"              | JEP 523 (Delivered, 27): _"If you do not specify a garbage collector on the command line then the JVM will always select G1, regardless of the number of processors and the available physical memory."_ Serial is no longer auto-selected anywhere                                                                       | "Serial — small containers, single core, short-lived processes. **From JDK 27 (JEP 523) the JVM never selects Serial automatically — G1 is the default in all environments, including single-CPU and low-memory ones. Serial must be requested with `-XX:+UseSerialGC`.**"                                                                                               | <https://openjdk.org/jeps/523>                                                                                                                                        |
| T   | gc-fundamentals                          | `references/collector-mechanisms.md:54-70`; `SKILL.md:66-67`                                                                                 | "The JDK 25 collector landscape" table + "Two baseline corrections" (ZGenerational gone, generational Shenandoah product)                                                  | Both listed corrections remain **true**. What is missing is JEP 523: the table's implicit "G1 is the server default, Serial for constrained" model is falsified in JDK 27                                                                                                                                                 | Add a third correction: "**From JDK 27, G1 is the default in _all_ environments (JEP 523)** — the JDK 9-era ergonomic rule that picked Serial below ~2 CPUs / ~1792 MB is gone."                                                                                                                                                                                         | <https://openjdk.org/jeps/523>                                                                                                                                        |
| U   | heap-dump-analysis                       | `SKILL.md:91-92`; `references/capture-recipes.md:69-70`                                                                                      | "`-XX:+UseCompactObjectHeaders` (JEP 519, product in JDK 25, **off by default**)" / "JEP 519 is product in JDK 25 and **off by default**"                                  | Same as A                                                                                                                                                                                                                                                                                                                 | "…off by default through JDK 26; **on by default from JDK 27 (JEP 534)**. Record which mode produced the dump — a histogram diff across the JDK 26→27 boundary shows a layout delta, not a code change."                                                                                                                                                                 | <https://openjdk.org/jeps/534>                                                                                                                                        |
| V   | container-awareness / jvm-memory-regions | `container-awareness/references/reading-the-container.md` (native-headroom guidance); `jvm-memory-regions/references/container-budget.md:70` | Non-heap headroom checklists that enumerate metaspace, code cache, stacks, direct buffers, GC structures                                                                   | JEP 522 (JDK 26) adds a **second G1 card table**: _"Each card table requires 0.2% of Java heap capacity, corresponding to an additional 2MB of native memory usage per 1GB of Java heap capacity"_                                                                                                                        | Add G1's card tables to the non-heap budget and note the JDK 26 increment: "**from JDK 26 G1 keeps two card tables, ~0.2% of heap capacity each (~2 MB native per 1 GB of heap)**."                                                                                                                                                                                      | <https://openjdk.org/jeps/522>                                                                                                                                        |
| W   | jfr-advanced / continuous-profiling      | `jfr-advanced/references/event-catalogue.md` and any `default.jfc` baseline claim                                                            | Event-enablement baselines stated against JDK 25 `default.jfc`                                                                                                             | JDK 26 disabled `jdk.ModuleExport`, `jdk.SymbolTableStatistics`, `jdk.StringTableStatistics` in `default.jfc` (JDK-8364993, JDK-8364556)                                                                                                                                                                                  | Note the JDK 26 change and the re-enable form `-XX:StartFlightRecording:jdk.ModuleExport#enabled=true`. **Verify the exact repo lines before editing — see UNRESOLVED.**                                                                                                                                                                                                 | <https://www.oracle.com/java/technologies/javase/26all-relnotes.html>                                                                                                 |

---

## UNRESOLVED

Things I could not verify, and which must not be written into a skill from recall:

1. **Exact JOL printed output under `-XX:+UseCompactObjectHeaders`.** I verified the
   message constants (`(object header: mark)`, `(object header: class)`, `(array length)`)
   and that sizes come from `model.markHeaderSize()` / `classHeaderSize()` /
   `arrayLengthHeaderSize()`, but I did not run JOL on a COH VM and did not read
   `HotspotUnsafe.guessHeaderSize()` closely enough to state whether the class row is
   _omitted_ or printed with size 0. Run `ClassLayout.parseClass(X.class).toPrintable()`
   on a JDK 27 build before writing a literal sample.
2. **Uncompressed-class-pointer array header = 20 bytes.** Derived arithmetically from two
   sourced facts, not quoted anywhere. Also largely moot: `UseCompressedClassPointers` is
   obsolete in JDK 27.
3. **The environment for the SPECjbb2015 / JSON-parser numbers.** JEP 519 and JEP 534 say
   only "in one setting" / "in another setting". Hardware, heap size and configuration are
   not published in the JEPs. Do not attach an environment to these figures.
4. **Whether JEP 534's arrival changes `-XX:+UseCompressedOops` ergonomics.** No source
   found either way. My finding is a _negative_: no JEP or release note connects COH to the
   32 GB oop threshold. Treat "COH does not move the 32 GB line" as well-supported by
   absence, not as a quoted statement.
5. **Whether the >8 TB non-ZGC limitation from JEP 450 still holds in JDK 27** now that COH
   is the default. JEP 534 does not restate it, and I did not trace the sliding-forwarding
   code on the `jdk27` branch. Verify before writing a JDK 27-specific claim.
6. **The precise `jfr-advanced` / `continuous-profiling` lines that JDK-8364993 falsifies**
   (table row W). I confirmed the JDK 26 change but did not locate a repo line that
   explicitly asserts those three events are enabled in `default.jfc`. Row W is a
   _candidate_, not a confirmed falsification, and must be grepped before editing.
7. **`FastLockingSpins` default change (13 → 8) and the rename from
   `LightweightFastLockingSpins`.** Confirmed in `globals.hpp@jdk27`, but I found no repo
   text citing the old name or the value 13, so it is not in the table.
8. **JEP 500 "Prepare to Make Final Mean Final" (Delivered, JDK 26)** — likely relevant to
   `java-serialization-hardening` / reflection topics, but I did not read the JEP body or
   grep the repo for contradicted claims. Not in the table.
9. **JDK 27 GA date.** The project page gives the RC milestone (2026-08-20) but I did not
   see a stated GA date on the pages I fetched. Do not write "September 2026" without a
   source.
