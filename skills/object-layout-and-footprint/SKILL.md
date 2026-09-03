---
name: object-layout-and-footprint
description: >
  Sizing a data structure in bytes before it exists. Use when a shape is chosen for millions
  of instances — record, class, primitive array, parallel arrays or boxed collection; when
  an array is proposed to save the header; when HashMap<Integer,Integer> or List<Long> is on
  a bulk path; when -XX:+UseCompactObjectHeaders is evaluated for footprint; or when smaller
  objects are expected to buy shorter GC pauses without a collector-specific measurement.
  Answers in bytes per element; one record-versus-array example reverses under the JDK 27
  default (JEP 534, not yet GA). Sizing a replacement belongs here; measuring what exists is
  heap-dump-analysis. Not flag lifecycle (jvm-performance-review), @Contended padding
  (false-sharing-and-contended), cache hierarchy (cpu-cache-and-numa), allocation rate
  (allocation-profiling), container budget (jvm-memory-regions), compressed class space
  (metaspace-internals), off-heap memory (off-heap-memory), or sharing duplicates
  (gof-flyweight).
---

# Object Layout and Footprint

## Purpose

Answer "what will N of these cost" before N of them exist, and read a layout measurement
without being misled by it.

The failure this prevents is the confident a-priori estimate — `header + fields`, times a
population — which omits alignment, omits the array length field, assumes compact object
headers save eight bytes per object, and is quoted without the JDK build or the header mode
that produced it. Every one of those errors is directional: they all understate the real
footprint, except the compact-header one, which overstates the saving on exactly the objects
that dominate a real heap.

## The gate

**No size without three things attached: the JDK build, the tool, and the header mode.**

A pasted `ClassLayout` listing with no command line is unusable, not merely incomplete. The
same class measures 32 or 24 bytes and the same array measures 24 or 16, on one JVM, decided
by one flag. On JDK 27 that flag's default flips `[source-only: JEP 534]`, so an unlabelled
listing does not even tell you which of two answers it is.

State it as `48 bytes (Temurin 25.0.3+9, JOL 0.17 ClassLayout.instanceSize, default headers)`
or do not state it.

## The arithmetic

This is the whole method. It is version-scoped: **executed on Temurin 21.0.12+8 (Linux x64),
25.0.3+9 (Windows x64) and 26.0.2+10 (Linux x64), all three agreeing**, with JOL 0.17
cross-checked against `Instrumentation.getObjectSize`.

```text
instance    = alignUp( header + Σ field sizes , ObjectAlignmentInBytes )
array       = alignUp( arrayBase + n × elementSize , ObjectAlignmentInBytes )
```

For the ordinary, non-`@Contended` HotSpot layouts tested here, `Σ field sizes` is the plain
sum of declared and inherited fields. Do not promote this measured model to a JVM
specification: VM-injected fields, special classes, value-class experiments, alignment flags
and future layout algorithms require a target-build measurement. Holes are an output of the
layout, not a portable input. The model matched 650 generated classes in both tested header
modes `[executed]` — 0–20 random fields, 2–4-deep inheritance chains, zero misses.

| Term                         | Classic headers                           | Compact object headers                  |
| ---------------------------- | ----------------------------------------- | --------------------------------------- |
| `header` (instance)          | **12** — mark 8 + compressed klass 4      | **8** — one fused word                  |
| `arrayBase`, elements ≤ 4 B  | **16** — 12 + a 4-byte length field       | **12**                                  |
| `arrayBase`, 8-byte elements | **16**                                    | **16** — the 4 freed bytes become a pad |
| `ref` (a reference field)    | **4** with compressed oops, **8** without | same, both modes                        |
| `ObjectAlignmentInBytes`     | 8                                         | 8                                       |

Other field sizes, executed, all modes: `boolean` 1, `byte` 1, `char` 2, `short` 2, `int` 4,
`float` 4, `long` 8, `double` 8.

**Every table in this skill is measured with compressed oops on** — the second precondition,
and the one that changes without a flag. Ergonomics commonly turns them off near **32 GB** at
8-byte alignment, and
the boundary is off-by-one from how it is usually quoted, exactly like the 8191 GB bound
above: measured on 25.0.3, `-Xmx32736m` still gives `UseCompressedOops = true {ergonomic}` and
`-Xmx32740m` already gives `false {default}` — so `-Xmx32g` is **off**, not the last value on.
`-Xmx31g` on / `-Xmx32g` off reproduces on 26.0.2 `[executed]`. The margin is the heap
alignment, so it moves with collector and page size; the boundary itself scales with
`ObjectAlignmentInBytes` — at 16, `-Xmx60g` is on and `-Xmx64g` off `[executed]`. Past it,
`UseCompressedOops` reads `false {default}`, not `{ergonomic}`, so read the value and not
the origin; `-Xlog:gc+init` prints `Compressed Oops: Enabled (32-bit)` or `Disabled`
(`references/production-footprint-checks.md` §2). Past that boundary recompute
`p` with
`ref` = 8; **the rule is unchanged but its answers move, including which classes save.** Five
of the fourteen rows in `compact-object-headers.md` §2 reverse, and `Object[]` becomes an
8-byte-element array that shrinks by nothing at any length. That matters here because a
population large enough to ask this skill's question is often a heap large enough to cross the
threshold. _Where_ the threshold is as a heap-sizing decision is `jvm-performance-review`'s.

Which header column is in force: classic on JDK 21, 25 and 26 `[executed]`; compact on JDK 27
`[source-only: JEP 534, Closed / Delivered, Release 27]` — JDK 27 is not GA and nothing in
this skill was run on it. The flag is experimental on 24 and needs
`-XX:+UnlockExperimentalVMOptions` there (JEP 450); a product flag on 25 (JEP 519, executed:
no unlock needed); default on 27 (JEP 534). A JDK 24 command line pasted onto 25 works; a 25
line pasted onto 24 does not. The rest of the flag's lifecycle and its cost belong to
`jvm-performance-review`.

Three things the arithmetic gets wrong if you stop before the `alignUp`:

- `record Point(int,int)` computes to 12 + 8 = 20 and **is 24**.
- `byte[1]` computes to 17 and **is 24**. So do `byte[2]` through `byte[8]`.
- **Declaration order is not the layout.** Fields are grouped by descending size with
  references placed last, and under classic headers a 4-byte field is hoisted into the
  12–15 header hole ahead of the 8-byte group. You cannot compute an offset from source
  order; you can compute a size.

## Workflow

1. **Pin the header mode before anything else**, on the target build — never assumed from the
   release number, and never read off the command line. The flag can read `true` where it was
   passed and `false` where it runs: two conditions cause that on 25.0.3 — disabled compressed
   class pointers, and a heap larger than 8191 GB on a collector that **moves** objects — each
   announced only by a one-line `warning` on stderr that nobody reads.

   ```bash
   java -XX:+PrintFlagsFinal -version | grep UseCompactObjectHeaders   # before starting
   jcmd <pid> VM.flags -all | grep UseCompactObjectHeaders             # already running
   ```

   `-all` is not optional: plain `VM.flags` prints nothing at all for a JVM sitting at the
   default, and the one character that carries the answer — the `+`/`-` — is the first thing a
   `grep -o` throws away. Read `references/compact-object-headers.md` §4 whenever
   `-XX:+UseCompactObjectHeaders` appears anywhere in the artefact — it has the three origin
   tags to match on. Why the JVM overrode it, and what that means for the rest of the
   configuration, is `jvm-performance-review`'s.

2. **Compute the per-element size a priori** with the arithmetic above. For arrays, for the
   per-length table, and for the superclass gap-filling rule, read
   `references/array-and-object-arithmetic.md`. Do this before measuring: a prediction that
   the measurement then confirms is worth far more than a measurement alone, because it is
   the prediction that transfers to the next class.
3. **Decide whether compact object headers change the answer.** They are not a uniform
   8-byte saving and they are zero on several of the commonest classes in a Java heap. Read
   `references/compact-object-headers.md` for the measured per-class table and the rule that
   predicts each row. Never multiply 8 bytes by an object count.
4. **Only now compare shapes.** Record versus final class versus primitive array versus
   parallel arrays versus a boxed collection, at the stated population size, in measured
   bytes per element. Read `references/shape-decision.md`. Emit bytes per element and the
   total at N, in both header modes, never a percentage alone.
5. **Measure to confirm the prediction.** Read `references/jol-operating-procedure.md` for
   the invocation that works on JDK 25/26, the four ways JOL fails — one of which throws on
   the first record you try — and the `Instrumentation.getObjectSize` cross-check. Read it
   before the first JOL run, not after the first stack trace. When the population already
   lives in a JVM you cannot attach JOL to, `jcmd <pid> GC.class_histogram` reports shallow
   sizes computed by that JVM in its own header mode — `Point` 24 → 16 `[executed]` — and
   `references/production-footprint-checks.md` §1 says what a heap dump cannot tell you.
6. **Report with the gate satisfied.** Build, tool, header mode, and shallow versus deep
   stated explicitly. If the number came from a source rather than a run, label it as
   source-derived; JDK 27 is not GA and nothing about it here was executed.

## The headline: the record-versus-array intuition is backwards

For a four-`long` payload, measured on Temurin 25.0.3+9 and 26.0.2+10, JOL 0.17 agreeing
with `Instrumentation.getObjectSize`:

| Shape                 | Arithmetic (classic)  | Classic | Arithmetic (compact)  | Compact |
| --------------------- | --------------------- | ------- | --------------------- | ------- |
| `record Rec4(long×4)` | 12 hdr + 32 → align8  | **48**  | 8 hdr + 32 → align8   | **40**  |
| `long[4]`             | 16 base + 32 → align8 | **48**  | 16 base + 32 → align8 | **48**  |

Under classic headers they **tie**: the record's 4-byte header hole exactly cancels the
array's 4-byte length field. Under compact object headers the **record wins by 8 bytes**,
because 8-byte elements must stay 8-byte aligned, so `long[]` spends the freed header bytes
on a pad and shrinks by nothing at any length.

"Drop the record for a primitive array to save the header" is therefore wrong for a
four-`long` payload today and **more** wrong once compact headers are the default. The
direction of the comparison changes, not just its magnitude — which is why a footprint
optimisation justified on JDK 25 must be re-measured before it ships on JDK 27.

The intuition is only right when the array amortises **one header across many elements**.
Parallel primitive arrays beat a million records by 20 bytes each — 24.00 against 44.00 bytes
per element, measured (`shape-decision.md` §1). One `long[4]` beats a single `Rec4` by
nothing. That distinction — replacing N headers, not replacing one — is the break-even, and
it is the point of that reference.

## Rules

- **Treat compact object headers as a measured deployment decision.** Answer
  only the footprint half: the saving is workload-specific and frequently zero, so quote it
  from the class mix, and say what would prove it — the same live-set measurement in both
  modes on the same build (heap after a full GC, or `GraphLayout.totalSize()` over the actual
  population), never an object count times eight. **What the flag costs, its prerequisites,
  its lifecycle and its per-release defaults are `jvm-performance-review`'s; route there
  rather than summarising.**
- **Say plainly that boxed collections gain almost nothing, and name the heap you assumed.**
  Under compressed oops `Integer`, `Boolean`, `ArrayList` and the `String` object are all
  unchanged, and `ArrayList<Integer>` of 1000 distinct values measured **20,976 bytes in both
  modes** on 25.0.3 and 26.0.2. At 32 GB and above the same population measures 25,920 → 25,912 — the
  `ArrayList` itself now saves 8 bytes and nothing else does, so the conclusion survives but
  the equality does not. A boxed-collection-heavy heap is the case where an "8 bytes per
  object" plan overstates the JDK 27 saving the most, at either oop size.
- **State the encoding — and the oop size — before making any claim about a string.** Under
  compressed oops the `String` object is 24 bytes in both modes at every length, so only its
  `byte[]` payload can shrink and the rule runs over **payload bytes**: 8 when
  `(length × bytesPerChar) mod 8` ∈ {1,2,3,4}, else 0. With `COMPACT_STRINGS` on by default,
  `bytesPerChar` is 1 for a Latin-1-representable string and 2 for anything containing a
  character above U+00FF, and the two encodings give **opposite** answers at 3–6 characters:
  "5 to 8 characters gains nothing" is true for ASCII and false for UTF-16 at 5–6. At 32 GB and above
  the `String` object itself goes 32 → 24, so it saves 8 regardless of payload and the whole
  example inverts — `String[1000]` of 8-character strings goes from a flat 52,016 to
  64,016 → 56,016, a 12.5% saving `[executed]`. `compact-object-headers.md` §3 has every
  measured column.
- **Shallow is not deep, and the gap is the whole answer for anything holding references.**
  `ClassLayout.instanceSize()` on `new String("EUR")` is 24 bytes; `GraphLayout.totalSize()`
  is 48. Name which one you measured, every time.
- **Version-scope every size, and label anything not executed.** JDK 27 is not GA. Its
  default header mode is read from JEP 534 (`Closed / Delivered`, Release 27, confirmed at
  `openjdk.org/jeps/534`), not observed. `-XX:+UseCompactObjectHeaders` does not exist at all
  on JDK 21 — the JVM refuses to start with `Unrecognized VM option` (executed, 21.0.12+8).
- **Populate a benchmark population with values outside the `Integer` cache.** `Integer[1000]`
  filled from −128..127 measures the array and almost nothing else, because the boxes are
  shared. Every boxed figure here uses values above 100,000.
- **A per-object saving is not a heap saving until it is multiplied by the live population.**
  Eight bytes off `HashMap$Node` is worth nothing if the map holds a thousand entries and
  everything if it holds forty million. Ask for N before answering.
- **Do not reach for `-XX:+PrintFieldLayout`.** It is a `develop` flag: on every shipping
  JDK the JVM refuses to start with it (executed, 25.0.3), there is no `-Xlog` equivalent,
  and JOL is the only way to read a field layout on a production build.
- **Compact object headers buy heap bytes with class-space bytes.** The 22-bit class
  pointer puts every `Klass` on a 1 KB boundary: **537 → 1,024 bytes per class** of
  compressed class space (executed, 25.0.3, 100,000 strong hidden classes), so the 1 GB
  default holds ~1.06 M classes instead of ~2 M. On a proxy- or lambda-heavy service read
  `jcmd <pid> VM.metaspace` before switching, and quote both sides.
  `references/production-footprint-checks.md` §3.
- **Under G1, an array at or above half a region costs whole regions.** `byte[600000]`
  occupies 1,046,076 bytes in a 2 GB G1 heap (1 MB regions), 74% over its payload;
  `byte[1100000]` occupies two regions; Parallel charges the payload (executed, 25.0.3).
  The per-object arithmetic is exact and the heap cost is still wrong by up to a region per
  array — size chunks against `G1HeapRegionSize`.
  `references/production-footprint-checks.md` §4.
- **Hashing and locking did not change shallow object size on the tested JDK 25 build**, in
  either header mode (executed):
  the identity hash and the monitor state live in the mark word or beside the object. Do
  not carry "hashed objects get bigger" from other or proposed header layouts into this build.

## References

- [Array and object arithmetic](references/array-and-object-arithmetic.md) — the header
  composition, the length field, element alignment, the per-length size table for
  `byte[]`/`int[]`/`long[]`/`Object[]` in both modes, the measured field-ordering and
  superclass gap-filling rules, and what `ObjectAlignmentInBytes=16` costs per object. Read
  at step 2, whenever a size is being computed rather than measured.
- [Compact object headers, measured](references/compact-object-headers.md) — which objects
  shrink and which do not, with the rule that predicts every row; the two conditions that
  disable the flag while it still reads as set; and the deep-footprint tables showing where
  the saving is zero. Read at step 1 whenever the flag appears, and at step 3 always.
- [The shape decision](references/shape-decision.md) — record versus final class versus
  primitive array versus parallel arrays versus `ArrayList` versus `HashMap`, measured at
  N = 1,000,000 in bytes per element under both header modes, with the break-even reasoning
  and the costs that are not bytes. Read at step 4.
- [JOL operating procedure](references/jol-operating-procedure.md) — the exact invocation
  for JDK 25/26, the four failure modes with their verbatim messages and fixes, and the
  two-file `Instrumentation.getObjectSize` agent that cross-checks JOL rather than trusting
  it. Read at step 5, before the first run.
- [Production footprint checks](references/production-footprint-checks.md) — sizes the
  running JVM reports without JOL (`GC.class_histogram`, `jdk.ObjectCount`) and why a heap
  dump is not one of them; the compressed-oops boundary by alignment and the origin-tag
  trap; the 1 KB-per-`Klass` class-space cost of compact headers; G1 humongous rounding
  for large arrays; what never changes an object's size; and the symptom-to-cause table for
  a prediction that disagrees with an observation. Read at step 5 when JOL cannot be
  attached, and at step 6 whenever the numbers disagree.

Authoritative sources for release-sensitive claims:

- [JEP 450: Compact Object Headers (Experimental)](https://openjdk.org/jeps/450)
- [JEP 519: Compact Object Headers](https://openjdk.org/jeps/519)
- [JEP 534: Compact Object Headers by Default](https://openjdk.org/jeps/534)
- [`Instrumentation.getObjectSize`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.instrument/java/lang/instrument/Instrumentation.html#getObjectSize(java.lang.Object)>)
- [OpenJDK JOL](https://github.com/openjdk/jol) — verify the current release and tool limitations
- [Oracle JDK GC Tuning Guide: class metadata and compact headers](https://docs.oracle.com/en/java/javase/26/gctuning/other-considerations.html)
