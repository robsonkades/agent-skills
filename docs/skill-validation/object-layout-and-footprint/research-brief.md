# Research brief — proposed skill `object-layout-and-footprint`

Researcher output. This is a justification test, not an advocacy document. No skill was
written.

**Environment for every executed claim below.** Temurin **25.0.3+9** (`build 25.0.3+9-LTS`,
64-Bit Server VM, mixed mode), Windows 11 Pro x64, at
`C:\Users\robso\.jdks\temurin-25.0.3`. Object-layout measurements use **JOL `jol-core`
0.17** from the local Maven repository, cross-checked against a purpose-built
`java.lang.instrument` agent calling `Instrumentation.getObjectSize`. Also installed:
temurin-25.0.2 / 25.0.4 / 25.0.4.1 and graalvm-ce-25.0.2. **No JDK 21, 24, 26 or 27 is
installed on this machine** — every statement about those releases is source-derived
(OpenJDK JEP index, or `openjdk/jdk` source at a named tag) and is labelled
`[source-only]`. Statements verified by running a command are labelled `[executed]`.

JEP pages were fetched with `curl` (`WebFetch` returns HTTP 403 from `openjdk.org`).

---

## 1. Verdict

### BUILD — but at roughly 40% of the proposed scope, and only with three corrections to neighbouring skills as part of the same change.

The proposed scope, as stated, is **majority already owned**. Broken down:

| Proposed element                                                   | Status                                                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| mark word + klass pointer, 12/16/8-byte header table               | **Owned** — `false-sharing-and-contended/references/contended-mechanics.md` |
| compressed oops vs compressed class pointers, the ~32 GB confusion | **Owned** — `contended-mechanics.md`, `metaspace-internals`                 |
| `UseCompressedOops` range formula, `ObjectAlignmentInBytes`        | **Owned** — `jvm-performance-review/references/flag-cost-and-defaults.md`   |
| compact object headers: JEP numbers, per-release default           | **Owned five times over** — see §2                                          |
| `UseCompressedClassPointers` deprecation lifecycle                 | **Owned** — `flag-lifecycle.md`, `metaspace-internals`                      |
| field reordering / JEP 142 / why manual padding is fragile         | **Owned** — `contended-mechanics.md`                                        |
| `@Contended`                                                       | **Owned** — `false-sharing-and-contended` end to end                        |
| shallow/retained size after the fact                               | **Owned** — `heap-dump-analysis`                                            |
| **array header, length field, element alignment**                  | **Unowned. Nothing in 237 skills states it.**                               |
| **which objects compact headers do _not_ shrink**                  | **Unowned**, and the tree currently implies the opposite                    |
| **design-time shape decision with measured numbers**               | **Half-owned** by `gof-flyweight`, only for the _duplicates_ framing        |
| **JOL operating procedure and its failure modes**                  | **Unowned**, and six skills tell the reader to "prove it with JOL"          |

The case for BUILD rests entirely on the last four rows, and on one discriminating test:

> **Is there a request that no existing skill's `description` would catch?**

Yes. _"We are about to store 40 million of these. Should it be a record, four parallel
primitive arrays, or a `HashMap<Integer,Integer>`?"_ — before any code exists, with no
duplicates, no false sharing, no heap dump, no OOM and no flag artefact. Routing today:

- `gof-flyweight` fires only if the framing is _many duplicates of a small distinct set_.
- `heap-dump-analysis` needs a `.hprof`.
- `allocation-profiling` measures rate and attribution, not per-object size — verified: its
  SKILL.md and both references contain no object-size arithmetic at all.
- `jvm-memory-regions` budgets six regions against a container limit.
- `cpu-cache-and-numa` and `false-sharing-and-contended` require a _scaling_ symptom.
- `jvm-performance-review` requires a configuration artefact.

Nothing owns it. That is a real gap, and the missing facts are not cosmetic — §3.4 and §5
show two cases where the a-priori answer **reverses** depending on a fact the tree does not
contain.

### Why this is not a stronger BUILD

Be honest about the ceiling. Strip out everything the neighbours own and what remains is
about two references' worth of material, not four. If the repo's granularity budget is
tight, the defensible alternative is:

> **DROP the skill; add `references/footprint-arithmetic.md` to `gof-flyweight` and retitle
> that skill's boundary from "sharing" to "population footprint".**

That alternative is genuinely viable and should be rejected only deliberately. I recommend
BUILD because `gof-flyweight` is a GoF-pattern skill in a 25-skill GoF cluster; hanging JDK
25/27 header arithmetic off it puts version-scoped runtime facts in a pattern catalogue,
where nobody auditing JDK behaviour will look for them.

### Exact scope boundary if BUILD proceeds

**The new skill owns:**

1. Array layout in full — header composition, the length field, element alignment, the
   per-length size table, and the compact-header asymmetry between ≤4-byte and 8-byte
   elements (§3.4).
2. The **shape decision**: record vs class vs primitive array vs parallel arrays vs boxed
   collection, for a stated population size, with measured per-element bytes (§3.5).
3. **Which objects compact object headers do and do not shrink**, measured, with the rule
   that predicts it (§3.3). This is the corrective to a claim currently spread across six
   skills.
4. **JOL operating procedure**: the invocation that works on JDK 25, the three ways it
   silently or loudly fails, and the `Instrumentation.getObjectSize` cross-check (§5.1–5.4).
5. The a-priori arithmetic itself — header + fields + alignment — as a _method_, stated once,
   version-scoped.

**Each neighbour keeps, unchanged:**

| Skill                         | Keeps                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `false-sharing-and-contended` | The header table _as it serves padding_, `@Contended`, JEP 142 reordering, manual-padding fragility |
| `cpu-cache-and-numa`          | Cache-line width, the 64-byte unit, `Particle[]` indirection, the introductory layout rule          |
| `jvm-memory-regions`          | The six-region container budget; the 32 GB heap rule as a _sizing_ rule                             |
| `heap-dump-analysis`          | Shallow vs retained, dominator tree, everything measured from a dump                                |
| `off-heap-memory`             | Direct buffers, FFM, and "JOL measures the wrapper, not the payload"                                |
| `allocation-profiling`        | Rate, attribution, TLAB. Untouched — zero overlap found                                             |
| `metaspace-internals`         | `CompressedClassSpaceSize`, class-space ceiling, `UseCompressedClassPointers` independence          |
| `jvm-performance-review`      | **All flag lifecycle and all ergonomic defaults.** The new skill must not restate a single flag row |
| `gof-flyweight`               | Sharing economics, `occurrences ÷ distinct`, interning, dedup                                       |

**The `description` must disclaim, at minimum:**

> Does not cover flag lifecycle, ergonomic defaults or the compressed-oops heap range
> (`jvm-performance-review`), cache-line contention and `@Contended` padding
> (`false-sharing-and-contended`), the cache hierarchy (`cpu-cache-and-numa`), sizes measured
> after the fact from a heap dump (`heap-dump-analysis`), allocation rate and who allocates
> (`allocation-profiling`), the six-region container budget (`jvm-memory-regions`), class
> metadata and the compressed class space (`metaspace-internals`), memory outside the heap
> (`off-heap-memory`), or when sharing duplicate instances pays (`gof-flyweight`).

Trigger situations for the `description` (situations, not capabilities, per
`skill-engineering`): a data structure is being chosen for a population of millions; someone
proposes a record where an array was; `HashMap<Integer,Integer>` or `List<Long>` appears on a
bulk path; a footprint estimate is being computed by hand; `-XX:+UseCompactObjectHeaders` is
being evaluated _for footprint_ (as opposed to for false sharing); a JOL listing is being
read or has just thrown.

### Three corrections to neighbours, required as part of the same change

These are defects found while delimiting, not scope grabs.

1. **`jvm-memory-regions/SKILL.md:61-65`** — "about half the classes save 8 bytes and the
   other half save nothing" is unsourced and, more importantly, does not say _which_ half.
   Measurement (§3.3) gives the rule: a class saves 8 bytes only if removing 4 header bytes
   crosses an 8-byte alignment boundary. `Integer`, `Boolean`, `String` and `ArrayList` save
   **zero**; `Object`, `Long`, `Double`, `LocalDate` and `HashMap$Node` save 8.

2. **`jvm-performance-review/references/flag-cost-and-defaults.md:255`** — the table says
   JDK 27 `UseCompactObjectHeaders` default `true` is _"scheduled, not yet shipped"_. As of
   this session, **JEP 534 is `Closed / Delivered`, Release 27**, last updated 2026/08/11
   `[source: openjdk.org/jeps/534]`. The row should read _delivered into JDK 27, which has
   not yet reached GA_.

3. **`jvm-performance-review/references/flag-cost-and-defaults.md:264`** — "On JDK 25,
   `-XX:+UseCompactObjectHeaders` forces `LockingMode = LM_LIGHTWEIGHT`". Executed on
   25.0.3: `LockingMode` is **already 2 (`LM_LIGHTWEIGHT`) by default**, and passing
   `-XX:LockingMode=1` alongside COH yields a final value of `2` tagged `{command line}` —
   the flag is coerced with no locking-specific warning, only the generic JDK-24
   deprecation notice. The statement is true but is a no-op on 25 and should say so. The
   _material_ silent-disable conditions are different, and are missing entirely — see §3.6.

---

## 2. Ownership map — every overlapping occurrence in `skills/`

Search: `grep -rn -i -E "ClassLayout|\bjol\b|object header|compressed oops|UseCompressedClassPointers|ObjectAlignmentInBytes|compact object header|JEP 450|JEP 519|JEP 534|UseCompactObjectHeaders|UseCompressedOops|CompressedClassSpaceSize"` over `skills/` — **102 hits across 13 skills**. Full enumeration:

### 2.1 `false-sharing-and-contended` — the deepest owner of header layout

| File:line                                   | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `references/contended-mechanics.md:26-52`   | **A full "The object header" section**: mark word 8 B; klass 4 B compressed / 8 B not; a 3-column table (JDK ≤26 default 12/16 B, JDK 27 / `+UseCompactObjectHeaders` 8 B, with first-field offset); the explicit warning that `UseCompressedClassPointers` is a _different flag_ from `UseCompressedOops` with no relation to the 32 GB threshold; that COH fuses mark and klass into one 64-bit word; that COH raises adjacency density; that JEP 519 does not change `@Contended` |
| `references/contended-mechanics.md:141-165` | Manual padding fragility, JEP 142 field reordering, the size-class grouping rule, the "it is not the JIT" correction                                                                                                                                                                                                                                                                                                                                                                 |
| `references/proving-and-fixing.md:25-43`    | **The JOL section**: attribution to Shipilëv, `org.openjdk.jol:jol-core`, `ClassLayout.parseInstance(...).toPrintable()`, and that under COH the same command shows the 8-byte header                                                                                                                                                                                                                                                                                                |
| `references/proving-and-fixing.md:109`      | COH slightly raises false-sharing risk for small objects                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SKILL.md:83-87`, `skill.yaml:7,14`         | The COH release-state rule, in the description and in the rules                                                                                                                                                                                                                                                                                                                                                                                                                      |

### 2.2 `cpu-cache-and-numa`

| File:line                                          | Content                                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `SKILL.md:52-54`                                   | **A-priori offset arithmetic**: 12-byte header → first `long` at offset 16, 12–15 gap filled by a 4-byte field        |
| `SKILL.md:55-58`                                   | COH release states; COH can _worsen_ false sharing while improving footprint                                          |
| `SKILL.md:59-60`                                   | `-XX:+CompactFields` obsolete in 15 / expired in 16; `-XX:-UseEmptySlotsInSupers` removed in 23                       |
| `SKILL.md:61-63`                                   | GC moves objects; default alignment is 8 not 64                                                                       |
| `SKILL.md:71-74`                                   | `Particle[]` is not contiguous; C `sizeof(struct)` reasoning misleads                                                 |
| `SKILL.md:34`, `references/false-sharing.md:43-64` | "Prove the layout with JOL, never with mental arithmetic"; a `ClassLayout.parseClass` example; the 8-byte-header note |

### 2.3 `jvm-performance-review` — owns the whole flag dimension

| File:line                                                       | Content                                                                                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `references/flag-cost-and-defaults.md:236-246`                  | `UseCompressedOops` ergonomics; the range formula `(2^32) << log2(ObjectAlignmentInBytes)`; the `-Xmx31g` folk rule corrected; `UseCompressedClassPointers` deprecated 25, obsolete 27                                         |
| `references/flag-cost-and-defaults.md:248-265`                  | **A four-row per-release COH table** (24 experimental / 25 product default-false / 26 default-false / 27 default-true), the SPECjbb2015 numbers with a provenance caveat, JEP 450's 5% design bound, and the COH prerequisites |
| `references/flag-cost-and-defaults.md:281`                      | `ObjectAlignmentInBytes` default 8                                                                                                                                                                                             |
| `references/flag-lifecycle.md:44`                               | The `UseCompressedClassPointers` lifecycle row (25 / 26→27)                                                                                                                                                                    |
| `references/flag-lifecycle.md:90-97`                            | `LockingMode` lifecycle and the COH interaction                                                                                                                                                                                |
| `references/flag-lifecycle.md:130`                              | COH no longer needs `UnlockExperimentalVMOptions` as of 25                                                                                                                                                                     |
| `SKILL.md:83,102-128`, `references/missing-measurements.md:171` | Compressed oops off as a P2 class; the worked `MaxRAMPercentage` finding                                                                                                                                                       |

### 2.4 `jvm-memory-regions`

| File:line        | Content                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKILL.md:53-55` | 32 GB disables compressed oops; a 33 GB heap can hold less than a 31 GB one                                                                                    |
| `SKILL.md:61-65` | "Measure object layout with JOL rather than estimating headers"; COH release states; **"about half the classes save 8 bytes and the other half save nothing"** |

### 2.5 `heap-dump-analysis`

| File:line                             | Content                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `SKILL.md:33`                         | Record whether `-XX:+UseCompactObjectHeaders` was on when capturing                                                                        |
| `SKILL.md:91-94`                      | COH shifts the shallow size of every object; a histogram diff across the flag or the 26→27 boundary shows a layout delta, not a code delta |
| `references/capture-recipes.md:69-71` | Same, as a capture-context requirement                                                                                                     |

### 2.6 `metaspace-internals`

| File:line                                    | Content                                                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `SKILL.md:62,66-68`                          | Class-space ceiling; `UseCompressedClassPointers` independent of `UseCompressedOops` and stays `true` above 32 GB |
| `references/sizing-and-flags.md:13-14,26,64` | `CompressedClassSpaceSize` default 1 GB; `UseCompressedClassPointers` `lp64_product`, deprecated 25 / obsolete 27 |

### 2.7 `off-heap-memory`

| File:line                                       | Content                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `SKILL.md:90-91`                                | JOL measures the heap **wrapper**, never the native payload — the classic misread on a 1 MB direct buffer |
| `references/native-memory-diagnosis.md:7,72-83` | "Why JOL cannot answer this"; `ClassLayout.parseInstance(direct)`; the header mode affects the figure     |

### 2.8 Other skills carrying a footprint fact

| File:line                                                             | Content                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gof-flyweight/references/when-sharing-pays.md:5-15`                  | **"Work it out before writing code"** — a small a-priori table: 12-byte header, 4-byte reference, 8-byte alignment, `record Currency(String)` = 16 B, `String "EUR"` ≈ 48 B, `HashMap.Entry` ≈ 40–50 B. **The single closest existing content to the proposal.** Default headers only; never mentions COH |
| `gof-flyweight/references/when-sharing-pays.md:74-81`                 | Columnar layout: 40 M objects of three fields ≈ 1.9 GB in headers and padding                                                                                                                                                                                                                             |
| `gof-flyweight/references/worked-example.md:158`                      | Columnar layout would remove 40 M `Txn` headers, ≈ 640 MB                                                                                                                                                                                                                                                 |
| `java-numeric-types/references/integers-boxing-and-overflow.md:87-88` | `Integer` = "object header plus the value — 16 bytes on a typical 64-bit JVM with compressed oops"                                                                                                                                                                                                        |
| `jvm-gc-tuning/references/collector-and-heap.md:48`                   | Above ~32 GB compressed oops turn off, references double 4→8                                                                                                                                                                                                                                              |
| `lock-inflation/references/monitor-lifecycle.md:61`                   | Under `UseCompactObjectHeaders` / the JDK 27 default, the header stays in place                                                                                                                                                                                                                           |
| `zgc-and-shenandoah/SKILL.md:72`                                      | "measure it with JOL before dismissing it in a footprint investigation"                                                                                                                                                                                                                                   |

### 2.9 Quantifying "six skills already mention compact object headers"

Seven, in fact. Depth per skill:

| Skill                         | Mentions | Depth                                                                                                                                                                   |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jvm-performance-review`      | 4        | **Deepest.** Per-release table, JEP citations, performance numbers with provenance caveat, prerequisites, and the `UnlockExperimentalVMOptions` consequence             |
| `false-sharing-and-contended` | 5        | **Second.** Header-size table with first-field offsets, the mark/klass fusion, the density consequence, the `@Contended` non-interaction, and the JOL verification step |
| `heap-dump-analysis`          | 3        | Operational only: record the mode, expect a shallow-size shift, do not read a diff as code change                                                                       |
| `cpu-cache-and-numa`          | 3        | Release states + the "can worsen false sharing" consequence                                                                                                             |
| `jvm-memory-regions`          | 1        | Release states + the unsourced "half the classes" claim                                                                                                                 |
| `off-heap-memory`             | 1        | One clause: the wrapper size depends on the header mode                                                                                                                 |
| `lock-inflation`              | 1        | One clause about the header staying in place                                                                                                                            |

**Conclusion of the count:** the _flag_ and the _release timeline_ are saturated. What no
skill states is **what a given object actually costs under each mode** — every mention is
qualitative ("shifts", "shrinks", "about half"). §3.3 is the missing quantitative core.

---

## 3. Established facts

Every fact is version-scoped and carries its method.

### 3.1 The JEPs — numbering verified, one correction to the caller's premise

Fetched from `openjdk.org` this session. The caller's numbering is **correct on all three**.

| JEP     | Title                                 | Owner        | Status                 | Release | Scope          |
| ------- | ------------------------------------- | ------------ | ---------------------- | ------- | -------------- |
| **450** | Compact Object Headers (Experimental) | Roman Kennke | Closed / **Delivered** | **24**  | Implementation |
| **519** | Compact Object Headers                | Roman Kennke | Closed / **Delivered** | **25**  | Implementation |
| **534** | Compact Object Headers by Default     | Roman Kennke | Closed / **Delivered** | **27**  | JDK            |

`[source: https://openjdk.org/jeps/450, /519, /534, fetched this session via curl]`

Corrections to the caller's framing:

- The caller wrote "JEP 534 (default in JDK 27)". Accurate, and **JEP 534 is already
  `Closed / Delivered`** (page updated 2026/08/11), not merely targeted. JDK 27 itself has
  not reached GA. `openjdk/jdk` master is JDK **28**-dev (`DEFAULT_VERSION_FEATURE=28`,
  `DEFAULT_VERSION_DATE=2027-03-23`; latest tag `jdk-28+13`). `[source-only]`
- JEP 519's _only_ content is the experimental→product promotion. Its **Non-Goals**
  explicitly state: _"It is not a goal to make compact object headers be the default
  object-header layout."_ Any skill implying JDK 25 changed layout behaviour by default is
  wrong.
- JEP 450 verbatim on the motivation: _"many workloads have average object sizes of 256 to
  512 bits (32 to 64 bytes). This implies that more than 20% of live data can be taken by
  object headers alone… live data is typically reduced by 10%–20%."_
- JEP 450 design bound, verbatim: _"Should not introduce more than 5% throughput or latency
  overheads on the target 64-bit platforms, and only in infrequent cases."_
- The SPECjbb2015 figures (22% less heap, 8% less CPU; 15% fewer collections; JSON parser
  10% faster) appear identically in JEP 519 and JEP 534, in both cases prefixed _"In one
  setting"_ / _"In another setting"_ with **no** JDK build, hardware, heap size or
  configuration. `jvm-performance-review` already flags this correctly; the new skill must
  not restate them as an expectation.

### 3.2 Object header layout on 64-bit HotSpot

**Classic layout (JDK 25 default) `[executed]`:**

```
OFF  SZ   DESCRIPTION
  0   8   (object header: mark)
  8   4   (object header: class)      <- UseCompressedClassPointers=true
 12  ...  first field, or a 4-byte hole
```

JOL VM report on 25.0.3, default flags `[executed]`:

```
# VM mode: 64 bits
# Compressed references (oops): 3-bit shift
# Compressed class pointers: 0-bit shift and 0x1C000000 base
# Object alignment: 8 bytes
#                       ref, bool, byte, char, shrt,  int,  flt,  lng,  dbl
# Field sizes:            4,    1,    1,    2,    2,    4,    4,    8,    8
# Array base offsets:    16,   16,   16,   16,   16,   16,   16,   16,   16
```

With `-XX:-UseCompressedClassPointers` `[executed]`: klass word becomes 8 bytes, header 16
bytes, **array base offsets become 20** (4-byte elements) **and 24** (8-byte elements). The
run also emits `Option UseCompressedClassPointers was deprecated in version 25.0` and
disables CDS (`The saved state of UseCompressedOops and UseCompressedClassPointers is
different from runtime, CDS will be disabled`).

**Compact object headers (`-XX:+UseCompactObjectHeaders`) `[executed]`:** one 64-bit word.
Per JEP 450's bit diagram:

```
64        42                     11    7   3 0
[CCCCCCCCCCCCCCCCCCCCCCHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHVVVVAAAASTT]
 (22-bit compressed klass)(31-bit hash)     (Valhalla)(age)(sf)(tag)
```

JOL VM report under COH on 25.0.3 `[executed]`:

```
# Lilliput VM detected (experimental)
# Compressed class pointers: 10-bit shift and 0x9000000 base
# Array base offsets:    12,   12,   12,   12,   12,   12,   12,   16,   16
```

Two facts that follow and that **no existing skill states**:

- COH **narrows the compressed class pointer from 32 bits to 22** (JEP 450, verbatim:
  _"reduce the size of compressed class pointers from 32 bits to 22 bits by changing the
  compressed class pointer encoding"_). The pre-COH 32-bit encoding is documented as
  supporting _"more than about four million classes"_; 22 bits is a tighter bound.
  **UNVERIFIED**: the exact loadable-class ceiling under COH. I did not attempt to load
  millions of classes.
- **Array base offset under COH is 12 for elements ≤ 4 bytes but 16 for `long`/`double`** —
  the 8-byte elements must stay 8-byte aligned, so the 4 bytes freed from the header are
  spent on a pad instead. This is the fact that reverses the record-vs-array answer (§3.4).

**Flag defaults, JDK 25.0.3, `java -XX:+PrintFlagsFinal -version`, no other flags `[executed]`:**

```
   size_t CompressedClassSpaceSize   = 1073741824              {product} {default}
      int ContendedPaddingWidth      = 128                     {product} {default}
      int LockingMode                = 2                       {product} {default}
      int ObjectAlignmentInBytes     = 8          {product lp64_product} {default}
     bool RestrictContended          = true                    {product} {default}
     bool UseCompactObjectHeaders    = false      {product lp64_product} {default}
     bool UseCompressedClassPointers = true       {product lp64_product} {default}
     bool UseCompressedOops          = true       {product lp64_product} {ergonomic}
```

`UseCompactObjectHeaders` is a plain **product** flag on 25.0.3: setting it with **no**
`-XX:+UnlockExperimentalVMOptions` succeeds and `PrintFlagsFinal` reports
`= true … {command line}` `[executed]`. This confirms JEP 519 shipped as described.

### 3.3 Which objects compact object headers actually shrink — measured

Method: JOL 0.17 `ClassLayout.instanceSize()`, **independently cross-checked** by a
purpose-built `java.lang.instrument` agent calling `Instrumentation.getObjectSize`. **The
two mechanisms agree on every row, under both header modes.** Same JVM build, same run
except for the flag.

| Object                                        | Default (12 B hdr) | `+UseCompactObjectHeaders` | Saving |
| --------------------------------------------- | ------------------ | -------------------------- | ------ |
| `new Object()`                                | 16                 | **8**                      | 8      |
| `Integer`                                     | 16                 | **16**                     | **0**  |
| `Boolean.TRUE`                                | 16                 | **16**                     | **0**  |
| `Long` / `Double`                             | 24                 | **16**                     | 8      |
| `java.time.LocalDate`                         | 24                 | **16**                     | 8      |
| `new String("EUR")` (object)                  | 24                 | **24**                     | **0**  |
| `new ArrayList<>()`                           | 24                 | **24**                     | **0**  |
| `new HashMap<>()`                             | 48                 | **40**                     | 8      |
| `HashMap$Node`                                | 32                 | **24**                     | 8      |
| `record R4i(int,int,int,int)`                 | 32                 | **24**                     | 8      |
| `record Rec4(long×4)`                         | 48                 | **40**                     | 8      |
| `class C3 { long; int; Object; }`             | 32                 | **24**                     | 8      |
| `AllTypes` (one field of each of the 9 types) | 48                 | **48**                     | **0**  |

**The rule that predicts the row**, and the correction to `jvm-memory-regions`'s unsourced
"about half": _compact object headers save 8 bytes only when removing 4 header bytes causes
the object to cross an 8-byte alignment boundary. When the 4 freed bytes are absorbed by an
existing or newly-created internal hole, the saving is exactly zero._ `Integer` is the
canonical zero: 8 + 4 + **4 bytes of new padding** = 16, unchanged. `AllTypes` is the
instructive zero — the hole simply migrates from offset 12 to offset 44.

**The consequence that is decision-changing and is stated nowhere in the tree:** the two
most common footprint problems in Java — **boxed collections and short strings** — get
**nothing** from compact object headers.

Deep footprints, `GraphLayout.totalSize()`, identical under both header modes `[executed]`:

```
ArrayList<Integer>, 1000 distinct values  = 20 976 bytes   (both modes)
int[1000]                                 =  4 016 bytes   (both modes)
Integer[1000], distinct                   = 16 000 bytes   (both modes)
String[1000] of 8-char strings            = 48 000 bytes   (both modes)
```

`HashMap<Integer,Integer>` with 1000 entries, `GraphLayout.toFootprint()` `[executed]`:

| Component                   | Default    | COH        |
| --------------------------- | ---------- | ---------- |
| `[Ljava.util.HashMap$Node;` | 8 208      | 8 208      |
| 1999 × `java.lang.Integer`  | 31 984     | 31 984     |
| 1 × `java.util.HashMap`     | 48         | 40         |
| 1000 × `HashMap$Node`       | 32 000     | 24 000     |
| **total**                   | **72 240** | **64 232** |

Two `long[1000]` covering the same key/value pairs: **16 032 bytes**, both modes. So
`HashMap<Integer,Integer>` costs **4.5×** the primitive form by default and **4.0×** under
compact headers — the flag closes 11% of a 450% gap.

### 3.4 Array layout, and the asymmetry that reverses the record-vs-array answer

Array header, default mode `[executed]`, from `ClassLayout.parseInstance(new byte[1])`:

```
OFF  SZ   DESCRIPTION
  0   8   (object header: mark)
  8   4   (object header: class)
 12   4   (array length)          <- int, always 4 bytes
 16   1   byte [B.<elements>
 17   7   (object alignment gap)
Instance size: 24 bytes
```

Under COH `[executed]`: mark 8, length at offset 8, elements at 12, `byte[1]` = **16 bytes**.

Per-length instance sizes, both modes `[executed]`:

| n   | `byte[n]`   | `int[n]`    | `long[n]`   | `Object[n]` |
| --- | ----------- | ----------- | ----------- | ----------- |
|     | dflt / COH  | dflt / COH  | dflt / COH  | dflt / COH  |
| 0   | 16 / 16     | 16 / 16     | 16 / 16     | 16 / 16     |
| 1   | 24 / **16** | 24 / **16** | 24 / 24     | 24 / **16** |
| 2   | 24 / **16** | 24 / 24     | 32 / 32     | 24 / 24     |
| 3   | 24 / **16** | 32 / 24     | 40 / 40     | 32 / 24     |
| 4   | 24 / **16** | 32 / 32     | **48 / 48** | 32 / 32     |
| 5   | 24 / 24     | 40 / 32     | 56 / 56     | 40 / 32     |
| 8   | 24 / 24     | 48 / 48     | 80 / 80     | 48 / 48     |
| 9   | 32 / 24     | 56 / 48     | 88 / 88     | 56 / 48     |

Three facts that follow:

1. **`long[]` and `double[]` never shrink under compact object headers, at any length.** The
   header saving is consumed by the pad that keeps 8-byte elements aligned.
2. **The saving for other element types is non-monotonic in length** — `int[3]` saves 8,
   `int[4]` saves 0, `int[5]` saves 8. Any "COH saves ~8 bytes per array" claim is wrong.
3. `byte[1..8]` all cost 24 bytes by default. Seven bytes of a one-byte array are padding.

**The reversal.** For a four-`long` payload:

| Shape                 | Default headers | Compact headers |
| --------------------- | --------------- | --------------- |
| `record Rec4(long×4)` | 48 bytes        | **40 bytes**    |
| `long[4]`             | 48 bytes        | **48 bytes**    |

Under the JDK 25/26 default the two are **a tie** — the record's 4-byte header hole exactly
cancels the array's 4-byte length field. Under compact object headers, which is the JDK 27
default, **the record wins by 8 bytes (17%)**. The intuition "drop to a primitive array to
save the header" is wrong for `long[4]` in both modes, and gets _more_ wrong on JDK 27. No
skill in the tree contains this.

### 3.5 Field layout on JDK 25 — measured, not recalled

`AllTypes { Object ref; boolean z; byte b; char c; short s; int i; float f; long l; double d; }`
declared in that order. Actual layout `[executed]`:

**Default headers** — `int i` @12, `long l` @16, `double d` @24, `float f` @32, `char c` @36,
`short s` @38, `boolean z` @40, `byte b` @41, 2-byte gap, `Object ref` @44. Size 48.

**Compact headers** — `long l` @8, `double d` @16, `int i` @24, `float f` @28, `char c` @32,
`short s` @34, `boolean z` @36, `byte b` @37, 2-byte gap, `Object ref` @40, 4-byte gap. Size 48.

Confirms, on JDK 25.0.3:

- Declaration order is **not** preserved. Fields are grouped by descending size, with
  **references placed last** — exactly the ordering `contended-mechanics.md:155-158` claims.
  That claim is verified, not folklore.
- Under classic headers the JVM **hoists a 4-byte field into the 12–15 header hole ahead of
  the 8-byte group** (`int i` @12 precedes `long l`). This is the mechanism behind
  `cpu-cache-and-numa/SKILL.md:52-54`.

**Superclass gap filling** (the JDK 15+ `UseEmptySlotsInSupers` behaviour) `[executed]`:

```
class SuperLong { long only; }              -> 24 bytes (hole at 12..15)
class SubInt extends SuperLong { int f; }   -> 24 bytes   <- f lands in the super's hole
```

Under COH the same pair gives `SuperLong` = **16** and `SubInt` = **24** — the hole no
longer exists, so the subclass field costs 8 bytes it did not cost before. **Compact object
headers can leave a subclass exactly the same size while shrinking its superclass by 8.**

`-XX:+CompactFields` (obsolete 15, expired 16) and `-XX:-UseEmptySlotsInSupers` (removed 23)
are already correctly documented in `cpu-cache-and-numa/SKILL.md:59-60`; both are absent
from `PrintFlagsFinal` on 25.0.3 `[executed]`, consistent with that.

### 3.6 `-XX:+UseCompactObjectHeaders` is silently disabled in three situations

None of these appears anywhere in `skills/`. Two are executable on this machine.

| Condition                                  | Result on 25.0.3                                                                                                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-XX:-UseCompressedClassPointers`          | `[executed]` `warning: Compact object headers require compressed class pointers. Disabling compact object headers.`                                                                                                                       |
| Heap ≥ 8191 GB with a non-ZGC collector    | `[executed]` `warning: Compact object headers require a java heap size smaller than 8191G (given: 9216G). Disabling compact object headers.` — `PrintFlagsFinal` then reports `UseCompactObjectHeaders = false {command line, ergonomic}` |
| Same heap **with ZGC**                     | `[executed]` no warning; stays `true`                                                                                                                                                                                                     |
| Legacy stack locking (`-XX:LockingMode=1`) | Moot on 25 — `[executed]` the value is coerced to `2` and only the generic JDK-24 deprecation warning appears                                                                                                                             |

The 8 TB bound is from JEP 450's GC-forwarding design: _"we use a simple encoding of the
forwarding pointer which can address up to 8TB of heap in the lower 42 bits of the object
header. Compact object headers are currently not compatible with larger heaps when
collectors other than ZGC are used."_

The second row is a `jvm-performance-review`-shaped P1: **the flag is on the command line and
the JVM is running without it.** It belongs in `flag-lifecycle.md`, not in the new skill.

### 3.7 `UseCompressedOops`, `ObjectAlignmentInBytes` and their interaction

Measured thresholds, `-Xlog:gc+init` on 25.0.3 `[executed]`:

| `-Xmx` | Default alignment (8)              | `-XX:ObjectAlignmentInBytes=16` |
| ------ | ---------------------------------- | ------------------------------- |
| 30g    | `Enabled (Zero based)`             | —                               |
| 31g    | `Enabled (Non-zero disjoint base)` | —                               |
| 32g    | **`Disabled`**                     | `Enabled (Zero based)`          |
| 40g    | —                                  | `Enabled (Zero based)`          |
| 60g    | —                                  | `Enabled (Zero based)`          |
| 64g    | —                                  | **`Disabled`**                  |
| 70g    | —                                  | `Disabled`                      |

This is `jvm-performance-review`'s formula `(2^32) << log2(ObjectAlignmentInBytes)`
confirmed by execution, and it also shows the _tier_ boundary at 31g that the formula alone
does not: zero-based encoding is lost before compressed oops are.

**The cost side, which `jvm-performance-review` names but does not quantify** — same class,
same JVM, alignment 8 vs 16 `[executed]`:

```
record Point(int x, int y)   ->  24 bytes @ align 8
                             ->  32 bytes @ align 16   (+33%, 12 bytes of external padding)
```

So raising alignment to 16 buys a 32→64 GB compressed-oops range at a cost of up to 8 extra
bytes per object. For a heap of small objects that can consume more than the 4 bytes per
reference it saves. This trade belongs to `jvm-performance-review` (it is a flag decision);
the _per-object arithmetic_ that makes it computable is the new skill's.

`-XX:ObjectAlignmentInBytes=16` combined with `-XX:+UseCompactObjectHeaders` is accepted
silently on 25.0.3 and both take effect `[executed]`: 4-bit oop shift, 16-byte alignment,
COH array base offsets (12/16).

### 3.8 `UseCompressedClassPointers` deprecation — verified, caller correct

- `[executed]` on 25.0.3: `-XX:-UseCompressedClassPointers` →
  `OpenJDK 64-Bit Server VM warning: Option UseCompressedClassPointers was deprecated in
version 25.0 and will likely be removed in a future release.`
- `[source-only]` `openjdk/jdk` **master** (JDK 28-dev),
  `src/hotspot/share/runtime/arguments.cpp`, in the **Obsolete Flags** section of
  `special_jvm_flags[]`:

  ```c
  { "UseCompressedClassPointers", JDK_Version::jdk(25), JDK_Version::jdk(27), JDK_Version::undefined() },
  ```

  Columns are `{deprecated_in, obsolete_in, expired_in}`. The file's own comment defines the
  semantics: at `obsolete_in` the JVM _"will continue accepting this flag on the
  command-line, while issuing a warning and ignoring the flag value."_

**Verdict: deprecated in 25, obsolete in 27, no expiry scheduled.** The caller's claim and
`metaspace-internals/references/sizing-and-flags.md:14` are both correct.

### 3.9 `-XX:+PrintFieldLayout` — the caller's premise is wrong

The caller described it as _"a diagnostic flag — verify it still exists in 25"_. It is not a
diagnostic flag on any shipped release.

`[executed]` on Temurin 25.0.3, with and without `-XX:+UnlockDiagnosticVMOptions`:

```
Error: VM option 'PrintFieldLayout' is develop and is available only in debug version of VM.
Improperly specified VM option 'PrintFieldLayout'
Error: Could not create the Java Virtual Machine.
```

It does not appear in `-XX:+PrintFlagsFinal` even with both `UnlockDiagnosticVMOptions` and
`UnlockExperimentalVMOptions` `[executed]`. It is `develop`, so it exists **only in a
fastdebug/slowdebug VM** — not in any Temurin, Oracle or GraalVM production build.

`[source-only]`, `src/hotspot/share/runtime/globals.hpp`:

| Tag               | Declaration                                             |
| ----------------- | ------------------------------------------------------- |
| `jdk-25-ga`       | `develop(bool, PrintFieldLayout, false, …)`             |
| `jdk-26+20`       | `develop(bool, PrintFieldLayout, false, …)`             |
| `jdk-27+10`       | `develop(bool, PrintFieldLayout, false, …)`             |
| `master` (28-dev) | `product(bool, PrintFieldLayout, false, DIAGNOSTIC, …)` |

So it is being promoted to a diagnostic product flag **in JDK 28-dev** and is unavailable in
production builds of 25, 26 and 27. There is also **no unified-logging equivalent**: `-Xlog:help`
on 25.0.3 lists 200+ tags and none of them is `fieldlayout` or `layout` `[executed]` (the only
near-matches are `coops`, `oops`, `oopstorage`).

**Consequence for the skill:** on every currently-shipping JDK, **JOL is the only way to read
a field layout**, and any skill that recommends `PrintFieldLayout` is recommending a flag
that refuses to start the JVM. That, on its own, justifies §5's operating procedure.

---

## 4. Executed evidence

All commands below were run in this session. JDK is **Temurin 25.0.3+9** unless stated.
JOL is `org.openjdk.jol:jol-core:0.17` from `~/.m2` — **the latest version published to
Maven Central** (confirmed: `search.maven.org` returns `0.17`, timestamp 1677491969000 =
2023-02-27, as the newest).

### 4.1 Build identification

```
$ "$JH/bin/java" -version
openjdk version "25.0.3" 2026-04-21 LTS
OpenJDK Runtime Environment Temurin-25.0.3+9 (build 25.0.3+9-LTS)
OpenJDK 64-Bit Server VM Temurin-25.0.3+9 (build 25.0.3+9-LTS, mixed mode, sharing)
```

### 4.2 Flag defaults — output in §3.2, verbatim

```
$ java -XX:+PrintFlagsFinal -version | grep -iE "CompressedOops|CompressedClassPointers|ObjectAlignmentInBytes|CompactObjectHeaders|CompressedClassSpaceSize|ContendedPaddingWidth|RestrictContended|LockingMode"
```

### 4.3 Commands that FAILED or produced nothing — reported as required

| Command                                                              | Result                                                                                                                                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `java -XX:+UnlockDiagnosticVMOptions -XX:+PrintFieldLayout -version` | **Refuses to start**: `VM option 'PrintFieldLayout' is develop and is available only in debug version of VM`                                                                           |
| `grep -iE "PrintFieldLayout" <PrintFlagsFinal with both unlocks>`    | **No output.** The flag does not exist in a product build at all                                                                                                                       |
| `java -Xlog:help \| grep -iE "field\|layout"`                        | **No layout tag.** Only `coops`, `oops`, `oopstorage`                                                                                                                                  |
| `java -javaagent:jol-core-0.17.jar …`                                | **Refuses to start**: `Failed to find Premain-Class manifest attribute … agent library failed Agent_OnLoad: instrument`. `jol-core` is not an agent jar                                |
| `ClassLayout.parseClass(SomeRecord.class)` with default JOL settings | **Throws**: `RuntimeException: Cannot get the field offset, try with -Djol.magicFieldOffset=true`, caused by `UnsupportedOperationException: can't get field offset on a record class` |
| `java -XX:+UseCompactObjectHeaders -XX:-UseCompressedClassPointers`  | Starts, but **silently downgrades**: `Compact object headers require compressed class pointers. Disabling compact object headers.`                                                     |
| `java -XX:+UseCompactObjectHeaders -XX:+UseG1GC -Xmx9t`              | Starts, **silently downgrades**: heap-size warning; `UseCompactObjectHeaders = false {command line, ergonomic}`                                                                        |
| `java -XX:CompressedClassSpaceSize=8g`                               | **Refuses to start**: `outside the allowed range [ 1048576 ... 4294967296 ]`. Ceiling is 4 GB, with or without COH                                                                     |

Every JOL run without `-javaagent` also prints
`# WARNING: Unable to get Instrumentation. Dynamic Attach failed.` and three
`sun.misc.Unsafe::arrayBaseOffset … will be removed in a future release` warnings on JDK 25.

### 4.4 Independent cross-check of every size

Because JOL's non-agent layouter _derives_ instance size from `Unsafe` field offsets rather
than asking the VM, I built a two-line `java.lang.instrument` agent
(`premain` → `Instrumentation.getObjectSize`) and re-ran the same 16 objects under both
header modes. **Every value matched JOL exactly, in both modes.** Sample:

```
#### getObjectSize, DEFAULT headers ####     #### getObjectSize, COMPACT headers ####
new Object()                 16              new Object()                  8
Integer                      16              Integer                      16
Long                         24              Long                         16
Boolean.TRUE                 16              Boolean.TRUE                 16
R4i                          32              R4i                          24
Rec4                         48              Rec4                         40
AllTypes                     48              AllTypes                     48
int[4]                       32              int[4]                       32
long[4]                      48              long[4]                      48
byte[1]                      24              byte[1]                      16
byte[8]                      24              byte[8]                      24
Object[4]                    32              Object[4]                    32
new ArrayList<>()            24              new ArrayList<>()            24
new HashMap<>()              48              new HashMap<>()              40
LocalDate                    24              LocalDate                    16
String("EUR")                24              String("EUR")                24
```

### 4.5 GraalVM

`graalvm-ce-25.0.2` (`build 25.0.2+10-jvmci-b01`) accepts `-XX:+UseCompactObjectHeaders`
without unlock flags `[executed]`. I did **not** run the layout suite on it — see §6.

---

## 5. Measurement traps in this topic

These are the reasons a-priori footprint arithmetic goes wrong in practice. Items 1–4 are
first-hand from this session; 5–8 are derived from measurements above.

**5.1 JOL throws on the first record you try.** `ClassLayout.parseClass(MyRecord.class)`
fails with `UnsupportedOperationException: can't get field offset on a record class` from
`sun.misc.Unsafe.objectFieldOffset`. The fix is `-Djol.magicFieldOffset=true`. Six skills
instruct the reader to prove layout with JOL and none mentions this — and records are the
single most likely subject of a modern layout question. `jol-core` 0.17 is the newest
published version, so this is current, not stale.

**5.2 `-javaagent:jol-core.jar` does not work.** `jol-core` has no `Premain-Class` manifest
attribute and the JVM refuses to start. Without an agent JOL _simulates_ the layout from
`Unsafe` offsets. In this session the simulation was exact on all 32 measurements, but the
correct way to be sure is a two-line agent (§4.4) or
`-Djdk.attach.allowAttachSelf=true`.

**5.3 A JOL listing is only meaningful with its flags.** `cpu-cache-and-numa` already says
this. The measurements above are the proof: the _same class_ is 32 or 24 bytes, and the
_same array_ is 24 or 16, depending on one flag. A pasted listing without the command line
that produced it is unusable — and becomes actively misleading at the JDK 26→27 boundary,
where the default flips.

**5.4 `-XX:+PrintFieldLayout` will not start the JVM.** See §3.9. Reaching for it is the
most likely first move for someone who knows HotSpot but not this flag's `develop` status.

**5.5 Computing the header and forgetting the alignment.** Every hand-computed size in this
area is `header + Σ fields`, and the JVM then rounds up to `ObjectAlignmentInBytes`.
`record Point(int,int)` computes to 12+8 = 20 and _is_ 24. `byte[1]` computes to 17 and is 24. The rounding is where most of the error lives, and it is where the surprises are:
`byte[1]` through `byte[8]` all cost the same.

**5.6 Assuming the saving from compact object headers is uniform.** It is not, and the
classes where it is zero (`Integer`, `Boolean`, `String`, `ArrayList`) are exactly the ones
that dominate a typical heap. A footprint plan built on "8 bytes × object count" will
overstate the JDK 27 saving substantially for a boxed-collection-heavy workload.

**5.7 Reading `ClassLayout` on a wrapper.** Already owned and correctly stated by
`off-heap-memory` for direct buffers. The general form: `ClassLayout` is _shallow_.
`GraphLayout.totalSize()` / `toFootprint()` is the deep figure, and the gap between them is
the whole answer for any object holding references — `new String("EUR")` is 24 bytes
shallow and 48 deep.

**5.8 Comparing a record against an array without checking the header mode.** §3.4: tied at
48 bytes under the JDK 25/26 default, and the record wins by 8 under the JDK 27 default. An
optimisation justified by a measurement on 25 can be a pessimisation on 27 — the direction
of the _comparison_ changes, not just the magnitude.

**5.9 `GraphLayout` double-counts nothing but shares everything.** `Integer[1000]` measured
16 000 bytes for _distinct_ values. With values inside the `Integer` cache the same array
measures the array plus almost nothing, because the boxes are shared. Populate a benchmark
population with values outside −128..127 or the footprint answer is meaningless — the
`java-numeric-types` cache-boundary trap resurfacing as a measurement error.

---

## 6. Explicit unknowns

Everything I could not establish on this machine or from a primary source.

1. **No JDK 21, 24, 26 or 27 is installed.** Every per-release claim about those releases is
   `[source-only]` from the OpenJDK JEP index or `openjdk/jdk` at a named tag. **In
   particular, I did not observe compact object headers on by default anywhere** — the JDK 27
   behaviour is inferred from JEP 534's text, not measured.
2. **The exact loadable-class ceiling under compact object headers.** JEP 450 says the
   compressed class pointer narrows 32 → 22 bits, and that the 32-bit form supports "about
   four million classes". I did not derive or test the 22-bit bound (the encoding uses a
   shift and a base, so it is not simply 2²²). **UNVERIFIED.**
3. **Whether JOL 0.17 is correct under compact object headers in general.** It labels the
   mode `Lilliput VM detected (experimental)`, and it agreed with `Instrumentation.getObjectSize`
   on all 16 objects I cross-checked. That is 16 data points, not a guarantee; JOL 0.17
   predates JEP 519.
4. **The precise JDK 28 build in which `PrintFieldLayout` became `DIAGNOSTIC`.** Confirmed
   `develop` at `jdk-27+10` and `product … DIAGNOSTIC` on `master`; I did not bisect the
   tags between. It has shipped in no GA release.
5. **What `PrintFieldLayout` actually prints.** I could not run it — no debug VM available.
   `fieldLayoutBuilder.cpp:1607` on master notes _"Tests verifying integrity of field layouts
   are using the output of -XX:+PrintFieldLayout"_, which establishes it exists and is
   layout-related, not its format.
6. **GraalVM CE 25.0.2 layout behaviour.** It accepts the flag; I did not run the JOL suite
   on it, so I cannot claim its layouts match Temurin's.
7. **Any performance claim.** Every number here is a **footprint** measurement. I ran no JMH
   benchmark and can say nothing about the throughput or latency effect of any of these
   choices. The JEP 450 5% bound and the SPECjbb figures are quoted from OpenJDK, unverified
   locally.
8. **All measurements are single-run, Windows x64, one JVM build.** Object sizes are
   deterministic given a build and flags, so repetition adds little, but I did not test
   AArch64 — where JEP 450 lists x64 and AArch64 as the two target platforms but where I
   have no machine.
9. **Whether the repo wants this granularity.** The DROP alternative in §1 (a
   `references/footprint-arithmetic.md` under a rescoped `gof-flyweight`) is a real option
   and this brief does not settle the repo-level cost of a 238th skill.
