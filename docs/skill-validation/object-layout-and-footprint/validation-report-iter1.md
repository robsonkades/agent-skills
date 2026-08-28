# Validation report — `object-layout-and-footprint`

**Validator:** independent adversarial pass. Nothing below was taken from the author's own
arithmetic or from the research brief; every number was re-measured.

**Validator environment (all executed this session):**

| Build                              | Where                                               |
| ---------------------------------- | --------------------------------------------------- |
| Temurin **25.0.3+9** (Windows x64) | `~/.jdks/temurin-25.0.3`                            |
| Temurin **26.0.2+10** (Linux x64)  | `docker eclipse-temurin:26-jdk`                     |
| Temurin **21.0.12+8** (Linux x64)  | `docker eclipse-temurin:21-jdk`                     |
| Temurin **25.0.4+7** (Linux x64)   | `docker eclipse-temurin:25-jdk` (flag default only) |

Tools: JOL `jol-core:0.17` (`ClassLayout.instanceSize`, `GraphLayout.totalSize`,
`toFootprint`), plus a `java.lang.instrument` `getObjectSize` agent built from the recipe in
`references/jol-operating-procedure.md` §4. JDK 27 is not installed; no claim here is about a
running JDK 27.

**What reproduced.** The skill's factual core is unusually solid. Independently reproduced,
byte for byte:

- All 32 array sizes in `array-and-object-arithmetic.md` §3, plus 103 further array
  sizes not in the skill (`boolean[]`, `char[]`, `short[]`, `float[]`, `double[]`, and
  n = 0…17, 100, 1000, 10⁶).
- All 14 rows of `compact-object-headers.md` §2.
- The `AllTypes` field-offset table (§4) — every offset, both modes.
- The `ObjectAlignmentInBytes=16` table (§6), including the `Point` = 16 combination.
- Every row of `shape-decision.md` §1 at N = 1,000,000: `24000064 / 44000016 / 44000016 /
44000040 / 104388672` classic and `24000064 / 36000016 / 36000016 / 36000040 / 80388664`
  compact; `8000032` and `72388672 / 64388664` for the two-`int` table.
- All four JOL failure modes in §2, with the verbatim messages.
- All four rows of the silent-disable table (§4), verbatim warnings and flag origins.
- Cross-JDK agreement: the SZ/ARR/DEEP/STRDEEP output on 21.0.12+8, 25.0.3+9 and 26.0.2+10
  is byte-identical (`diff` clean), as the skill claims.
- JEP statuses, fetched independently: 450 `Closed / Delivered` R24, 519 `Closed /
Delivered` R25, 534 `Closed / Delivered` R27, updated 2026/08/11. Both JEP 450 quotes
  (the 5% design bound and the 8 TB forwarding sentence) are verbatim.

**The three disputed figures — the author is right on all three; the brief is wrong on all
three.** See the appendix.

---

## BLOCKER

### B1 — `references/compact-object-headers.md:151` — the "command that settles it" cannot settle it

```bash
jcmd <pid> VM.flags | grep -o 'UseCompactObjectHeaders'             # on the running JVM
```

`grep -o` prints only the matched substring, discarding the `+`/`-` that carries the entire
answer. `VM.flags` (without `-all`) also prints nothing for a flag left at its default.
Executed against three JVMs simultaneously on 25.0.3:

```
--- pid 16420 (plain default; COH off) ---
  VM.flags:                (no line)
  [grep -o form]:          (no output)
--- pid 27188 (-XX:+UseCompactObjectHeaders; COH ON) ---
  VM.flags:                -XX:+UseCompactObjectHeaders
  [grep -o form]:          UseCompactObjectHeaders
--- pid 33128 (-XX:+UseCompactObjectHeaders -XX:+UseG1GC -Xmx9t; SILENTLY DISABLED) ---
  VM.flags:                -XX:-UseCompactObjectHeaders
  [grep -o form]:          UseCompactObjectHeaders
```

The enabled JVM and the silently-disabled JVM produce **identical output**. This is the
section the skill itself calls "the most valuable content on the page", it exists to catch
exactly the `-Xmx9t` case, and the recommended command confirms that case as a positive. A
reader who follows it will quote sizes that are 8 bytes per object wrong across a whole heap —
the precise failure the skill was written to prevent. The neighbouring `PrintFlagsFinal`
command is fine; this one inverts the skill's own gate.

Worse, §4 tells the reader that `false {command line, ergonomic}` is "the tell" and to "grep
for exactly that" — a string `VM.flags` never emits in any form.

**Fix.** Use `-all`, which restores both the value and the origin tag:

```bash
jcmd <pid> VM.flags -all | grep UseCompactObjectHeaders
```

Executed, same two JVMs:

```
pid 6536 (default):      bool UseCompactObjectHeaders = false {product lp64_product} {default}
pid 8296 (COH + -Xmx9t): bool UseCompactObjectHeaders = false {product lp64_product} {command line, ergonomic}
```

That output does contain `{command line, ergonomic}`, so the surrounding prose becomes true.

---

## MAJOR

### M1 — `references/compact-object-headers.md:27-41` — the rule's `p` is defined wrongly, and the skill's own §5 is the counterexample

§1 defines, for the instance case:

> Written out, with `p` = the sum of the field sizes plus any internal hole

and tabulates `Instance saves 8` for `p mod 8 ∈ {0,5,6,7}`.

Apply it to `class SuperLong { long only; }`, a class this very skill measures in
`array-and-object-arithmetic.md:143-151`. Its classic layout, `[executed]` 25.0.3:

```
  0   8   (object header: mark)
  8   4   (object header: class)
 12   4   (alignment/padding gap)      <- a 4-byte INTERNAL hole; JOL: "Space losses: 4 bytes internal"
 16   8   long OnlyLong.only
Instance size: 24 bytes
```

By §1's definition `p` = 8 field bytes + 4 hole bytes = 12, `12 mod 8 = 4`, so the rule
predicts a saving of **0**. Measured: 24 → **16**, a saving of **8**, which is what
`array-and-object-arithmetic.md:149` itself prints. The rule as written contradicts the
skill's own measurement two files over.

The rule is correct once `p` is the plain sum of declared **plus inherited** field sizes with
no hole term. I verified that over **950 generated classes** in three fuzz runs on 25.0.3,
both header modes:

| Fuzz                                              | Classes | Rule mismatches | `alignUp(12+p,8)` misses | `alignUp(8+p,8)` misses |
| ------------------------------------------------- | ------- | --------------- | ------------------------ | ----------------------- |
| 0–7 random fields of the 9 types                  | 400     | **0**           | **0**                    | **0**                   |
| 2–4-deep inheritance chains, 0–2 fields per level | 250     | **0**           | **0**                    | **0**                   |
| 8–20 random fields                                | 300     | **0**           | **0**                    | **0**                   |

So the rule's substance survives an aggressive attempt to break it — but only in the form the
skill does not state.

**Fix.** Delete "plus any internal hole" from the definition of `p`; say "the sum of the
declared and inherited field sizes, no padding term". Then make §2's "Why" column consistent
with it — `new String("EUR")` is currently justified as "4 + 1 + 1 + a 2-byte hole + a ref =
12" (hole included) while `new Object()` is justified as "payload 0" (pad excluded). Both
happen to land on the right answer; the methodology does not.

### M2 — `SKILL.md:150-153` — the string rule is stated for `length` but only holds for Latin-1 strings

> so a string shrinks by 8 or by 0 depending on `length mod 8` … At 5–8 characters, the
> common case, the saving is zero.

`compact-object-headers.md:110` heads its table "Length (Latin-1)", but the rule sentence at
:118-120 and the SKILL.md bullet both drop the qualifier, and SKILL.md's Rules section is the
load-bearing statement. A `String` containing any character above U+00FF is UTF-16-backed, so
its payload is `2·length` bytes and the rule inverts. `GraphLayout.totalSize()`, 25.0.3, both
modes, `[executed]`:

| chars | Latin-1 classic → compact | saving | UTF-16 classic → compact | saving | rule predicts |
| ----- | ------------------------- | ------ | ------------------------ | ------ | ------------- |
| 3     | 48 → 40                   | 8      | 48 → **48**              | **0**  | 8 ✗           |
| 4     | 48 → 40                   | 8      | 48 → **48**              | **0**  | 8 ✗           |
| 5     | 48 → 48                   | 0      | 56 → **48**              | **8**  | 0 ✗           |
| 6     | 48 → 48                   | 0      | 56 → **48**              | **8**  | 0 ✗           |
| 7     | 48 → 48                   | 0      | 56 → 56                  | 0      | 0 ✓           |
| 9     | 56 → 48                   | 8      | 64 → 56                  | 8      | 8 ✓           |

Wrong in both directions, and the "5–8 characters, the common case, the saving is zero"
sentence is false for exactly the 5–6 character case in a UTF-16 workload. For a bullet headed
"Be precise about strings", that is not precise.

**Fix.** State the rule over payload bytes, not characters: saving is 8 when
`(length × bytesPerChar) mod 8 ∈ {1,2,3,4}`, with `bytesPerChar` = 1 for a Latin-1-representable
string and 2 otherwise (`COMPACT_STRINGS`, on by default). For UTF-16 that reduces to
`length mod 4 ∈ {1,2}`. Add the encoding to the "do not generalise without…" sentence, which
currently names only the length distribution.

### M3 — scope: `jvm-memory-regions/SKILL.md:61-71` now states this skill's central claim in full

The skill's `description` cedes only "the container budget" to `jvm-memory-regions`. That
neighbour currently contains:

> …the rule predicts which classes get it: **an object saves 8 bytes only when removing 4
> header bytes makes it cross an 8-byte alignment boundary.** Where the freed 4 bytes are
> absorbed by an existing or newly-created padding hole, the saving is exactly zero. Measured
> on Temurin 25.0.3 with JOL 0.17, cross-checked against `Instrumentation.getObjectSize`:
> `Object` 16→8, `Long`/`Double`/`LocalDate` 24→16, `HashMap$Node` 32→24; but `Integer`
> 16→16, `Boolean` 16→16, `String` 24→24 and `ArrayList` 24→24 — all **zero**. … boxed
> collections and short strings, the two commonest footprint problems, gain nothing from this
> flag.

That is the rule from `compact-object-headers.md` §1, an eight-row extract of its §2 table,
the same provenance sentence, and the same §3 conclusion — reproduced in a skill whose
`description` never mentions object sizing at all. Two skills now own the same fact, and a
`jvm-memory-regions` reader gets the answer without ever reaching this skill. It also
propagates M1's defective "absorbed by an existing or newly-created padding hole" wording, so
both skills are wrong about `SuperLong` in the same way, and a future correction has to be
made twice.

**Fix.** `jvm-memory-regions` keeps one sentence — "object footprint arithmetic and which
classes compact object headers actually shrink is `object-layout-and-footprint`" — and drops
the rule, the table and the provenance. (Note this is _not_ the brief's requested correction:
the brief asked for the unsourced "about half the classes" claim to be replaced. It was
replaced by a full copy of the new skill.)

### M4 — scope: the skill restates the `jvm-performance-review` material it tells the reader it is not restating

`SKILL.md:144-145` — "The flag's lifecycle, its cost and its ergonomic defaults belong to
`jvm-performance-review`; do not restate them here." `compact-object-headers.md:16-19` says
the same. The skill then restates, in the same breath and again in the reference:

| Restated                                           | In this skill                                           | Already in `jvm-performance-review/references/flag-cost-and-defaults.md` |
| -------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| JEP 450's 5% throughput/latency design bound       | `SKILL.md:141-142`, `compact-object-headers.md:160-162` | ~line 262                                                                |
| The SPECjbb2015 22%/8% figures + provenance caveat | `compact-object-headers.md:163-166`                     | ~lines 255-261                                                           |
| The silent-disable conditions table                | `compact-object-headers.md:132-139` (4 rows)            | ~lines 271-277 (3 rows)                                                  |
| `LockingMode=1` is a no-op alongside COH on 25     | `compact-object-headers.md:137`                         | ~lines 266-269                                                           |

The silent-disable table is duplicated at greater length here _and_ restated a third time in
prose at `SKILL.md:83-87`. This is the boundary the skill defines for itself, violated four
times, and it is the boundary a reviewer would check first.

**Fix.** Keep only what is footprint-shaped: "the flag can read `true` on the command line and
`false` in the JVM — check it (`jcmd <pid> VM.flags -all`) before quoting any size;
`jvm-performance-review` owns why and what to do about it." Delete the JEP 450 bound, the
SPECjbb paragraph, the `LockingMode` row and the duplicate table.

---

## MINOR

### m1 — `SKILL.md:84-85` — the 8 TB threshold is off by one

> and a heap of 8191 GB or more on a non-ZGC collector

Measured on 25.0.3, `-XX:+UseCompactObjectHeaders -XX:+UseG1GC`:

```
-Xmx8191g -> UseCompactObjectHeaders = true  {command line}          (no warning)
-Xmx8192g -> warning: ... require a java heap size smaller than 8191G (given: 8192G).
             UseCompactObjectHeaders = false {command line, ergonomic}
```

8191 GB itself is fine. The threshold is "more than 8191 GB". The "non-ZGC" half is correct
and I verified it beyond G1 — Parallel, Serial and Shenandoah all disable at `-Xmx9t`; only
ZGC survives.

**Fix.** "a heap larger than 8191 GB".

### m2 — `compact-object-headers.md:66` and `array-and-object-arithmetic.md:131-132` — the `AllTypes` mechanism is wrong, and contradicts the table three lines above it

Both files say the zero saving happens because "the hole migrates 12 → 44" / "the hole simply
migrates from offset 12 to offset 44". But `array-and-object-arithmetic.md` §4's own table —
and my reproduction of it — puts `int i` at offset 12 under classic headers. **There is no
hole at offset 12.** JOL's own accounting, `[executed]` 25.0.3:

```
classic:  Space losses: 2 bytes internal + 0 bytes external = 2 bytes total   (gap at 42-43)
compact:  Space losses: 2 bytes internal + 4 bytes external = 6 bytes total   (gap at 38-39, pad at 44)
```

The 2-byte internal hole exists in **both** modes and does not move in any meaningful sense;
the 4 freed header bytes are lost to **external alignment padding** (34 field bytes + 2 = 36;
`alignUp(8+36,8)` = 48 = `alignUp(12+36,8)`). Calling external padding a migrated internal
hole is the kind of mechanism a reader will then mis-apply to the next class.

**Fix.** "`AllTypes` is the instructive zero: 8 + 36 rounds up to the same 48 that 12 + 36
does, so the freed bytes are lost to external alignment padding, not reclaimed."

### m3 — `jol-operating-procedure.md:183` — the evidence count does not add up

> **44 objects — 14 classes and 32 array sizes — and the two mechanisms agreed on every one.**

14 + 32 = **46**. (And §2's 14 rows describe 15 objects, since `Long, Double` share a row.)
The figure "44" is asserted four separate times as a provenance claim
(`array-and-object-arithmetic.md:9`, `compact-object-headers.md:9-10`,
`jol-operating-procedure.md:183`, `:185`). In a skill whose entire subject is careful
arithmetic, a self-contradicting count is the first thing a sceptical reader will test. (For
reference, my own cross-check ran 43 objects; JOL and `Instrumentation.getObjectSize` agreed
on all 43 in both modes, so the underlying claim holds.)

**Fix.** Make the count match its own decomposition, or drop the number and say "every object
in §2 and §3 of the two reference pages".

### m4 — cross-skill contradiction: whose bound is the 8 TB bound

- `object-layout-and-footprint`: "on a **non-ZGC** collector" (`SKILL.md:84`,
  `compact-object-headers.md:135-136`).
- `jvm-performance-review/references/flag-cost-and-defaults.md`: "**G1** with a heap above the
  8 TB forwarding bound" and "ZGC with the same heap survives — the bound is **G1's**, not
  universal."

Executed, 25.0.3, `-XX:+UseCompactObjectHeaders -Xmx9t`: Parallel, Serial and Shenandoah all
emit the warning and end at `false {command line, ergonomic}`; only ZGC stays `true`. **This
skill is right and the neighbour is wrong**, but two skills now say different things about the
same fact. Report it to whoever owns `jvm-performance-review`.

### m5 — cross-skill contradiction: field-ordering, which this skill claims to have verified

`array-and-object-arithmetic.md:126-128`:

> Fields are grouped by descending size, with **references placed last** — the ordering
> `false-sharing-and-contended` describes, here verified rather than recalled.

`false-sharing-and-contended/references/contended-mechanics.md:152-155` describes it as
"grouped by size (**longs and doubles first**, then ints and floats, then shorts and chars,
then bytes and booleans, then references)". This skill's own measurement shows `int i` at
offset **12**, ahead of `long l` at 16 — so under classic headers longs and doubles are _not_
first. The skill states that hoisting correctly one bullet later, then claims the measurement
"verified" a neighbour statement it partially refutes.

**Fix.** Say what the measurement shows: the neighbour's grouping is confirmed for compact
headers and for everything after the header gap, and refuted as a statement about the first
slot under classic headers, where a 4-byte field is hoisted ahead of the 8-byte group.

### m6 — trigger collision with `false-sharing-and-contended`

That skill's `description` fires "when `-XX:+UseCompactObjectHeaders` is under consideration",
unqualified. This skill's fires "when `-XX:+UseCompactObjectHeaders` is evaluated for
footprint". The new skill disclaims only "@Contended padding" toward that neighbour, and the
neighbour disclaims nothing toward footprint. Any prompt of the form "should we turn on
compact object headers?" matches both descriptions equally.

Judged as a trigger, the description is otherwise good: it fires on the realistic prompts
("we're storing 40M of these, record or parallel arrays?", "JOL says 24 but I computed 20",
"is `HashMap<Integer,Integer>` too fat here?") and correctly does _not_ fire on a heap dump, on
allocation rate, on a container OOMKill, or on a scaling symptom. This is the one hole.

**Fix.** Add "not whether to enable it for adjacency or contention
(`false-sharing-and-contended`)" here, and "not its footprint effect
(`object-layout-and-footprint`)" there.

### m7 — `shape-decision.md:130` — "less GC work" with no mechanism

> Fewer bytes usually means better locality and less GC work, but no JMH benchmark was run…

The disclaimer covers the throughput claim, not the causal one. Footprint per object,
allocation rate, live-set size and RSS are four different quantities, and this sentence hops
between them: halving object size at a constant object count changes bytes allocated and
live-set bytes but not allocation _count_; whether that reduces GC work depends on whether the
collector's cost tracks live set (concurrent marking, evacuation) or allocation volume (young
collection frequency), and it can be zero for either. The skill is otherwise scrupulous about
this — the `description` correctly cedes allocation rate to `allocation-profiling` and RSS to
`jvm-memory-regions` — which makes this one sentence the outlier.

**Fix.** "Fewer live bytes reduce marking and evacuation work for a collector whose cost
tracks the live set, and reduce young-collection frequency only if the _allocated_ byte rate
falls with it — object count is unchanged either way. Neither is measured here."

### m8 — `SKILL.md:51` — the `+ internal holes` term is unnecessary and is the source of M1

```text
instance    = alignUp( header + Σ field sizes + internal holes , ObjectAlignmentInBytes )
```

`alignUp(header + Σ field sizes, 8)` was **exact for all 950 generated classes in both header
modes** (see M1's table) with no hole term at all. The extra term is not knowable a priori —
which is the whole point of the "compute before you measure" workflow at step 2 — and it is
what makes §1's rule breakable. It also reads as if holes were additive, which they are not:
under classic headers `AllTypes` carries a 2-byte hole _inside_ the 48 bytes the formula
already predicts.

**Fix.** Drop the term from the headline formula; keep hole discussion in §4 where it is about
offsets, which is where it actually matters.

---

## NIT

### n1 — `SKILL.md:10` / `skill.yaml:12` — an unlabelled JDK 27 claim in the description

> the record-versus-array answer reverses between the JDK 25/26 and JDK 27 defaults

The body labels every JDK 27 statement `[source-only: JEP 534]` and says plainly that nothing
was run on 27. The description does not, and the description is the part a router reads in
isolation. Suggest "…and reverses again under the JDK 27 default (JEP 534, not yet GA)".

### n2 — `compact-object-headers.md:60` — empty cell in the explaining column

The `new HashMap<>()` row's "Why" is blank, in a table whose stated value is that every row has
a reason. Its payload is 32 bytes (two `AbstractMap` refs + four ints/float + two refs), `32
mod 8 = 0`, so it saves 8 — one clause.

### n3 — repo hygiene, not a skill defect

`npm run registry:check` already fails on this working tree **before** this report existed
(`registry/skills.yaml is out of date`). Separately: this report was written into
`skills/object-layout-and-footprint/`, and package integrity is a hash over file contents under
`skills/`, so `npm run registry:build` must be re-run — or the report moved out of `skills/` —
before `npm run verify` will pass. Flagging because it was not my call where to put the file.

---

## Appendix — the three disputed figures, re-derived

All measured on Temurin 25.0.3+9 (Windows x64) and reproduced identically on 26.0.2+10 and
21.0.12+8 (Linux x64, Docker), JOL 0.17 `GraphLayout.totalSize()` / `toFootprint()`, both
header modes. Boxed values 100000+, outside the `Integer` cache; strings distinct 8-character
ASCII from `String.format("%08d", i)`.

| Figure                                  | Brief           | Author          | **Measured**          | Verdict          |
| --------------------------------------- | --------------- | --------------- | --------------------- | ---------------- |
| `Integer[1000]`, distinct, deep         | 16,000          | 20,016          | **20,016** both modes | **author right** |
| `String[1000]`, 8-char, deep            | 48,000          | 52,016          | **52,016** both modes | **author right** |
| `HashMap<Integer,Integer>` × 1000, deep | 72,240 / 64,232 | 72,256 / 64,248 | **72,256 / 64,248**   | **author right** |

Not one of the author's three is wrong. The brief is wrong on all three, and each error has an
identifiable cause:

1. **`Integer[1000]`** — the brief counted only the 1000 boxes (1000 × 16 = 16,000) and dropped
   the `Integer[1000]` reference array itself, which is `16 + 1000×4 = 4,016`. 16,000 + 4,016 =
   20,016. The same omission explains the `String[1000]` row.
2. **`String[1000]` of 8-char strings** — 1000 × (`String` 24 + `byte[8]` 24) = 48,000, plus the
   same missing 4,016 array = 52,016. Note the row is a good choice regardless: at 8 characters
   the compact saving really is zero, which is the point the skill makes with it.
3. **`HashMap<Integer,Integer>` × 1000** — the brief's own component table says "1999 ×
   java.lang.Integer = 31,984", i.e. its map had one key and one value that were the _same_
   object, almost certainly a fixture where key and value overlapped by 1. `toFootprint()` on a
   map with 1000 disjoint keys and values, `[executed]`:

```
     COUNT       AVG       SUM   DESCRIPTION          |  COUNT   AVG     SUM   (compact)
         1      8208      8208   [Ljava.util.HashMap$Node;  |      1  8208    8208
      2000        16     32000   java.lang.Integer          |   2000    16   32000
         1        48        48   java.util.HashMap          |      1    40      40
      1000        32     32000   java.util.HashMap$Node     |   1000    24   24000
      3002               72256   (total)                    |   3002        64248
```

72,256 and 64,248 exactly. The author's derived ratios also check out: two `int[1000]` =
8,032, so 9.0× classic and 8.0× compact, and the flag closes 8,008 of a 64,224-byte gap =
12.5%, matching "about 12% of an 800% gap".

The equivalent N = 1,000,000 row in `shape-decision.md` is likewise exact: **72,388,672 /
64,388,664** measured, as printed.

---

## Verdict

**FAIL — 1 BLOCKER, 4 MAJOR, 8 MINOR, 3 NIT.** PASS requires zero BLOCKER and zero MAJOR.

This is a strong skill with a genuinely hostile-tested factual core — 190+ independently
reproduced measurements, every failure mode real, every JEP status correct, and a headline
(the record-versus-array reversal) that survives attack. It fails on one command that defeats
its own gate, one rule whose stated definition its own measurement refutes, one rule that
silently assumes Latin-1, and a scope boundary it declares and then crosses four times.
