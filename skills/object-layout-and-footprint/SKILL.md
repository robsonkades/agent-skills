---
name: object-layout-and-footprint
description: >
  Sizing a data structure in bytes before it exists. Use when a shape is chosen for millions
  of instances — record, class, primitive array, parallel arrays or boxed collection; when
  an array is proposed to save the header; when HashMap<Integer,Integer> or List<Long> is on
  a bulk path; when -XX:+UseCompactObjectHeaders is evaluated for footprint; or when smaller
  objects are expected to buy shorter GC pauses without a collector-specific measurement.
  Answers in bytes per element; one record-versus-array comparison changes under the upstream JDK 27
  default (JEP 534, source-only). Sizing a replacement belongs here; measuring what exists is
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

## Evidence and scope

**Attach the known build, method, header mode, reference/class-pointer widths and alignment
to a size claim; label missing inputs and conditional estimates.**

Inspect the project's toolchain, deployed JVM, collector, heap size and effective alignment/
compression flags before applying these HotSpot measurements. They do not authorize a Java
upgrade, dependency addition or flag change. Historical `[executed]` tables below record the
stated experiments; they are not a claim that every applying agent reran those experiments.

A pasted `ClassLayout` listing can establish visible offsets and arithmetic even when its
command line is missing; it cannot establish an unknown deployment's layout. The
same class measures 32 or 24 bytes and the same array measures 24 or 16, on one JVM, decided
by one flag. The upstream JDK 27 default flips `[source-only: JEP 534]`; distinguish the
listing's visible layout from an unknown deployment's effective mode.

For a measured claim, state its conditions, for example `48 bytes (Temurin 25.0.3+9,
JOL 0.17 ClassLayout.instanceSize, classic headers, compressed class pointers/oops, align8)`.
For an estimate, state the assumed inputs and what evidence would change it. A narrow
arithmetic explanation or adequate existing representation can close without a new run,
population estimate, flag comparison or migration.

## The arithmetic

The following is a bounded empirical model. Historical checks were **executed on Temurin 21.0.12+8 (Linux x64),
25.0.3+9 (Windows x64) and 26.0.2+10 (Linux x64), all three agreeing**, with JOL 0.17
cross-checked against `Instrumentation.getObjectSize`.

```text
instance    = alignUp( header + Σ field sizes , ObjectAlignmentInBytes )
array       = alignUp( arrayBase + n × elementSize , ObjectAlignmentInBytes )
```

For the ordinary, non-`@Contended` HotSpot layouts tested here, `Σ field sizes` is the plain
sum of declared and inherited non-static fields. Do not promote this measured model to a JVM
specification: VM-injected fields, special classes, value-class experiments, alignment flags
and future layout algorithms require a target-build measurement. Holes are an output of the
layout, not a portable input. The model matched 650 generated classes in both tested header
modes `[executed]` — 0–20 random fields, 2–4-deep inheritance chains, zero misses.

The base table assumes 64-bit HotSpot, compressed class pointers and alignment 8. Heap oop
compression is a separate input; wide klass pointers change the classic header to 16 bytes.

| Term                         | Classic headers                           | Compact object headers                  |
| ---------------------------- | ----------------------------------------- | --------------------------------------- |
| `header` (instance)          | **12** — mark 8 + compressed klass 4      | **8** — one fused word                  |
| `arrayBase`, elements ≤ 4 B  | **16** — 12 + a 4-byte length field       | **12**                                  |
| `arrayBase`, 8-byte elements | **16**                                    | **16** — the 4 freed bytes become a pad |
| `ref` (a reference field)    | **4** with compressed oops, **8** without | same, both modes                        |
| `ObjectAlignmentInBytes`     | 8                                         | 8                                       |

Other field sizes, executed, all modes: `boolean` 1, `byte` 1, `char` 2, `short` 2, `int` 4,
`float` 4, `long` 8, `double` 8.

**The base tables use compressed oops; explicit wide-reference tables are exceptions** — the second precondition,
and the one that changes without a flag. Ergonomics commonly turns them off near **32 GB** at
8-byte alignment, and
the boundary is below how it is usually quoted: measured on 25.0.3,
`-Xmx32736m` still gives `UseCompressedOops = true {ergonomic}` and
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

Defaults on the tested Temurin 21, 25 and 26 builds were classic `[executed]`; the upstream
JDK 27 default is compact
`[source-only: JEP 534, Closed / Delivered, Release 27]`. JDK 27 reached GA on 2026-09-15,
but none of this skill's recorded measurements ran on it. Vendor backports and defaults can differ, including on JDK 17/21
(JEP 534); use the effective target state. In the upstream lifecycle the flag is experimental on 24 and needs
`-XX:+UnlockExperimentalVMOptions` there (JEP 450); a product flag on 25 (JEP 519, executed:
no unlock needed); default on 27 (JEP 534). A JDK 24 command line pasted onto 25 works; a 25
line pasted onto 24 does not. The rest of the flag's lifecycle and its cost belong to
`jvm-performance-review`.

Three things the arithmetic gets wrong if you stop before the `alignUp`:

- `record Point(int,int)` computes to 12 + 8 = 20 and **is 24**.
- `byte[1]` computes to 17 and **is 24**. So do `byte[2]` through `byte[8]`.
- **Declaration order is not the layout.** In the measured ordinary layouts, fields are grouped by descending size with
  references placed last, and under classic headers a 4-byte field is hoisted into the
  12–15 header hole ahead of the 8-byte group. You cannot compute an offset from source
  order; you can compute a size.

## Workflow

Apply the steps needed for the requested size, shape or deployment claim. Reuse adequate
target evidence; distinguish a conditional model from a measurement and a footprint comparison
from a recommendation to change production.

1. **Establish the relevant layout inputs**, on the target build — not merely the release
   number or requested command line. The flag can read `true` where it was
   passed and `false` where it runs: two conditions cause that on 25.0.3 — disabled compressed
   class pointers, and a heap larger than 8191 GB with header-based forwarding — each
   accompanied by a warning on stderr. Record effective oop/class-pointer widths and alignment too.

   ```bash
   java <same target flags> -XX:+PrintFlagsFinal -version | grep UseCompactObjectHeaders
   jcmd <pid> VM.flags -all | grep UseCompactObjectHeaders             # already running
   ```

   Use `-all` to include a flag still at its default; plain `VM.flags` can omit that flag.
   The character that carries the answer — the `+`/`-` — is the first thing a
   name-only `grep -o` pattern throws away. Read `references/compact-object-headers.md` §4 whenever
   `-XX:+UseCompactObjectHeaders` appears anywhere in the artefact — it has the three origin
   tags to match on. Why the JVM overrode it, and what that means for the rest of the
   configuration, is `jvm-performance-review`'s.

2. **Model the per-element size when a prediction is needed** with the arithmetic above. For arrays, for the
   per-length table, and for the superclass gap-filling rule, read
   `references/array-and-object-arithmetic.md`. Explain a mismatch between the model and
   trustworthy measurements instead of forcing either to fit.
3. **Compare header modes when the question depends on them.** They are not a uniform
   8-byte saving and they are zero on several of the commonest classes in a Java heap. Read
   `references/compact-object-headers.md` for the measured per-class table and the rule that
   predicts each row. Never multiply 8 bytes by an object count.
4. **Compare the relevant equivalent shapes.** Record versus final class versus primitive array versus
   parallel arrays versus a boxed collection, at the stated population size, in measured
   bytes per element. Read `references/shape-decision.md`. Emit bytes per element and the
   total at N when known. Compare both header modes only when that is part of the decision;
   label unsupported alternatives hypothetical rather than changing the project baseline.
   Keep absolute bytes alongside any percentage.
5. **Measure when the claim needs confirmation.** Read `references/jol-operating-procedure.md` for
   the invocation that works on JDK 25/26, the four ways JOL fails — one of which throws on
   the first record you try — and the `Instrumentation.getObjectSize` cross-check. Read it
   before a JOL run. Choose the cross-check for the measurement's uncertainty and consequence.
   When the population already
   lives in a JVM you cannot attach JOL to, `jcmd <pid> GC.class_histogram` reports shallow
   sizes computed by that JVM in its own header mode — `Point` 24 → 16 `[executed]` — and
   `references/production-footprint-checks.md` §1 says what a heap dump cannot tell you.
6. **Report the scoped result and its evidence.** Name shallow, reachable, retained or other
   quantities precisely, with known inputs and limits. Label source-derived estimates and
   historical results; do not imply a new run. JDK 27 was not executed in the recorded audit.

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

"Drop the record for a primitive array to save the header" is therefore wrong for the
tested four-`long` payload and **more** wrong with compact headers enabled. The
comparison moves from a tie to a saving. If a deployment decision depends on that saving,
confirm the target layout with adequate existing evidence or a bounded measurement.

The intuition is only right when the array amortises **one header across many elements**.
Parallel primitive arrays beat a million records by 20 bytes each — 24.00 against 44.00 bytes
per element, measured (`shape-decision.md` §1). One `long[4]` beats a single `Rec4` by
nothing. That distinction — replacing N headers, not replacing one — is the break-even, and
it is the point of that reference.

## Rules

- **Treat compact object headers as a measured deployment decision.** Answer
  only the footprint half: the saving is workload-specific and frequently zero, so quote it
  from the class mix, and say what would prove it — the same live-set measurement in both
  modes on the same build (heap after a verified collection, or `GraphLayout.totalSize()` over the actual
  population), never an object count times eight. **What the flag costs, its prerequisites,
  its lifecycle and its per-release defaults are `jvm-performance-review`'s; route there
  rather than summarising.**
- **Distinguish the boxed type, collection structure and reference width.**
  Under compressed oops `Integer`, `Boolean`, `ArrayList` and the `String` object are all
  unchanged, and `ArrayList<Integer>` of 1000 distinct values measured **20,976 bytes in both
  modes** on 25.0.3 and 26.0.2. With 8-byte oops, compressed class pointers and alignment 8,
  the historical wide-reference population measures 25,920 → 25,912 — the
  `ArrayList` itself now saves 8 bytes and nothing else does, so the conclusion survives but
  the equality does not. A boxed-collection-heavy heap is the case where an "8 bytes per
  object" plan overstates the saving. This is not a rule for all boxed collections:
  `Long`/`Double` boxes and, with compressed oops, map nodes do shrink in the tables.
- **State the encoding — and the oop size — before making any claim about a string.** Under
  compressed oops the `String` object is 24 bytes in both modes at every length, so only its
  `byte[]` payload can shrink and the rule runs over **payload bytes**: 8 when
  `(length × bytesPerChar) mod 8` ∈ {1,2,3,4}, else 0. With `COMPACT_STRINGS` on by default,
  `bytesPerChar` is 1 for a Latin-1-representable string and 2 for anything containing a
  character above U+00FF; `length` means UTF-16 code units. Inspect `CompactStrings` too.
  The two encodings give **opposite** answers at 3–6 code units:
  "5 to 8 characters gains nothing" is true for ASCII and false for UTF-16 at 5–6. With
  8-byte oops, compressed class pointers and alignment 8,
  the `String` object itself goes 32 → 24, so it saves 8 regardless of payload and the whole
  example inverts — `String[1000]` of 8-character strings goes from a flat 52,016 to
  64,016 → 56,016, a 12.5% saving `[executed]`. `compact-object-headers.md` §3 has every
  measured column.
- **Shallow is not deep, and the gap is the whole answer for anything holding references.**
  `ClassLayout.instanceSize()` on `new String("EUR")` is 24 bytes; `GraphLayout.totalSize()`
  is 48. Name which one you measured, every time.
- **Version-scope every size, and label anything not executed.** The JDK 27
  default header mode is read from JEP 534 (`Closed / Delivered`, Release 27, confirmed at
  `openjdk.org/jeps/534`), not observed. `-XX:+UseCompactObjectHeaders` is absent from
  the tested Temurin 21.0.12+8 build — it refuses to start with `Unrecognized VM option`
  `[executed]`; this is not a claim about downstream JDK 21 backports.
- **Match sharing to the question.** To model distinct boxes, verify values are outside the
  configured `Integer` cache (which can exceed 127). To model a real cached population,
  retain its sharing: JOL counts each reachable box once, not once per reference. Reachable
  bytes are not incremental allocation or retained bytes. See the JOL procedure's array-root trap.
- **A per-object saving is not a heap saving until it is multiplied by the live population.**
  Eight bytes off `HashMap$Node` saves about 8 KB at a thousand entries and 320 MB at forty
  million. Compare with the required headroom; ask for N before estimating a total.
- **Do not reach for `-XX:+PrintFieldLayout`.** It is a `develop` flag: on the tested production
  JDK the JVM refuses to start with it (executed, 25.0.3), there is no `-Xlog` equivalent,
  and JOL is the tool used here on production builds. Direct VM/offset tooling is another
  option; consult the JOL reference for the pinned source-only development change.
- **Compact object headers buy heap bytes with class-space bytes.** The 22-bit class
  pointer used a shift of 10 in the measured configuration: **537 → 1,024 bytes per class** of
  compressed class space (executed, 25.0.3, 100,000 strong hidden classes), so the 1 GB
  reservation exposed ~1.06 M aligned IDs and held roughly ~2 M of the classic template.
  These are encoding/template/loader-specific figures, not a universal per-class cost or ceiling.
  When evaluating a class-heavy deployment, inspect existing `VM.metaspace`/pool evidence
  for the actual shift, reservation and loader topology and account for both heap and class space.
  `references/production-footprint-checks.md` §3.
- **Under G1, an object whose aligned size exceeds half a region reserves whole regions.**
  `byte[600000]` requires one 1,048,576-byte region with 1 MB regions;
  `byte[1100000]` requires two. The historical aggregate heap deltas in the production
  reference are estimates, not exact object sizes or histogram charges.
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
  the saving is zero. Read when interpreting the effective flag or comparing header modes.
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
- [JDK 27 release status](https://openjdk.org/projects/jdk/27/) — GA on 2026-09-15; release status is not a layout measurement.
- [`Instrumentation.getObjectSize`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.instrument/java/lang/instrument/Instrumentation.html#getObjectSize(java.lang.Object)>)
- [OpenJDK JOL](https://github.com/openjdk/jol) — verify the current release and tool limitations
- [Oracle JDK GC Tuning Guide: class metadata and compact headers](https://docs.oracle.com/en/java/javase/26/gctuning/other-considerations.html)
