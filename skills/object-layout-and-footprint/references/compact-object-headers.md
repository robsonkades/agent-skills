# Compact object headers, measured

Read at step 1 whenever `-XX:+UseCompactObjectHeaders` appears in an artefact, and at step 3
always.

**Environment.** Temurin **25.0.3+9** (Windows x64) and **26.0.2+10** (Linux x64,
`eclipse-temurin:26-jdk`); JOL `jol-core:0.17`, `ClassLayout.instanceSize()` and
`GraphLayout.totalSize()`. Every shallow size below was reproduced identically on both builds.
Of these, 12 classes and all 32 array sizes — **44 objects** — were additionally cross-checked
against an `Instrumentation.getObjectSize` agent on 25.0.3 in both modes, with no
disagreement; `HashMap$Node`, `Point` and `C3` are JOL-only, reproduced across the two builds
but not agent-checked. On **21.0.12+8** the flag does not exist at all —
`Unrecognized VM option 'UseCompactObjectHeaders'`, JVM refuses to start `[executed]`.
**JDK 27 is not installed. Its default header mode is read from JEP 534 (`Closed /
Delivered`, Release 27, confirmed at `openjdk.org/jeps/534`) and was not observed anywhere on
this page** `[source-only]`.

This reference covers what the header mode does to **object size**. The flag's lifecycle, its
release-by-release default, its throughput cost and its prerequisites belong to
`jvm-performance-review`; the mark-word bit layout and the `@Contended` interaction belong to
`false-sharing-and-contended`.

## 1. The rule

> **Compact object headers save 8 bytes only when removing 4 header bytes moves the object
> into a smaller 8-byte-aligned size class. Otherwise the 4 freed bytes are absorbed by
> alignment padding and the saving is exactly zero.**

Written out, with `p` = **the plain sum of the declared and inherited field sizes — no
padding term**:

```text
instance saving = alignUp(12 + p, 8) − alignUp(8 + p, 8)
array saving    = alignUp(16 + m, 8) − alignUp(12 + m, 8)     (elements ≤ 4 bytes)
                = 0 always                                     (any 8-byte element)
```

`ref` is a 4-byte element only while compressed oops are on; at 32 GB and above it is
8 bytes, and `Object[]` moves into the second line — it stops shrinking entirely.

Tabulated — the two cases are exact complements, which is worth internalising because the
array intuition is the opposite of the instance one:

| `p mod 8` or `m mod 8` | 0   | 1   | 2   | 3   | 4   | 5   | 6   | 7   |
| ---------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Instance** saves     | 8   | 0   | 0   | 0   | 0   | 8   | 8   | 8   |
| **Array** saves        | 0   | 8   | 8   | 8   | 8   | 0   | 0   | 0   |

There is no third answer — the saving is never 4, and never more than 8 for a single object.

**Do not add a padding term to `p`.** Holes are an output of the layout, not an input to it,
and adding them breaks the rule. `class SuperLong { long only; }` carries a 4-byte hole at
offset 12 under classic headers and measures 24 → 16, a saving of 8; the plain field sum
`p = 8` predicts that correctly, while `p = 8 + 4` would predict 0. Verified `[executed]` on
25.0.3 over **650 generated classes** — 400 with 0–20 random fields of the nine types, 250
with 2–4-deep inheritance chains — where `alignUp(header + Σ field sizes, 8)` predicted the
measured `instanceSize()` with **zero misses in both header modes**, and the mod-8 table above
matched the algebra on every one.

That is why "about half the classes save 8 bytes" is a coin-flip description of a rule that
is fully determined once you know the field set **and the size of a reference** — 4 bytes with
compressed oops, 8 without. See §2's second table: five of these fourteen rows reverse when
that changes, and the rule predicts all five.

## 2. Measured, per class

`p` is the plain field sum, exactly as §1 defines it, so every row can be checked against the
mod-8 table without trusting the prose. Two preconditions make that check reproducible:
**`p` counts a reference as 4 bytes — this table is measured with compressed oops on, at
`-Xmx6g` — and the field sets are JDK 25.0.3's.** The Fields column names references _as_
references rather than by their current width, so every row re-derives correctly at `ref` = 8
without further help; that is the whole point of §5's instruction to fix the reference size
first.

Verified by reflection over declared and inherited non-static fields, at both reference widths
and both header modes — 15 classes × 4 configurations, **60/60 predicted sizes matching
`ClassLayout.instanceSize()`** `[executed]`, 25.0.3.

| Object                            | Fields                                    | `p` | `p%8` | Classic | Compact | Saving |
| --------------------------------- | ----------------------------------------- | --- | ----- | ------- | ------- | ------ |
| `new Object()`                    | none                                      | 0   | 0     | 16      | **8**   | 8      |
| `Integer`                         | `int value`                               | 4   | 4     | 16      | **16**  | **0**  |
| `Boolean.TRUE`                    | `boolean value`                           | 1   | 1     | 16      | **16**  | **0**  |
| `Long`, `Double`                  | one 8-byte primitive                      | 8   | 0     | 24      | **16**  | 8      |
| `java.time.LocalDate`             | `int year` + two `short` — JDK 21/25 only | 8   | 0     | 24      | **16**  | 8      |
| `new String("EUR")` (object only) | `int` + `byte` + `boolean` + `byte[]` ref | 10  | 2     | 24      | **24**  | **0**  |
| `new ArrayList<>()`               | two `int` + `Object[]` ref                | 12  | 4     | 24      | **24**  | **0**  |
| `new HashMap<>()`                 | four refs + four 4-byte primitives        | 32  | 0     | 48      | **40**  | 8      |
| `HashMap$Node`                    | `int` + three refs                        | 16  | 0     | 32      | **24**  | 8      |
| `record R4i(int×4)`               | four `int`                                | 16  | 0     | 32      | **24**  | 8      |
| `record Rec4(long×4)`             | four `long`                               | 32  | 0     | 48      | **40**  | 8      |
| `record Point(int,int)`           | two `int`                                 | 8   | 0     | 24      | **16**  | 8      |
| `class C3 { long; int; Object; }` | `long` + `int` + ref                      | 16  | 0     | 32      | **24**  | 8      |
| `AllTypes` (one of each of 9)     | ref + 1+1+2+2+4+4+8+8                     | 34  | 2     | 48      | **48**  | **0**  |

`Integer` is the canonical zero and the most consequential row on the page: `p % 8 = 4`, so
the 4 freed header bytes become 4 bytes of alignment padding and nothing is reclaimed.

**`LocalDate` is the row that is version-scoped rather than oops-scoped**, and it is a useful
warning about deriving `p` for a JDK class from memory. Reflected on three builds
`[executed]`: `int year; short month; short day` on 21.0.12+8 and 25.0.3+9 → `p` = 8, but
`int year; byte month; byte day` on 26.0.2+10 → **`p` = 6**. The measured 24 → 16 is the same
on both, because 8 and 6 both land in `{0,5,6,7} mod 8` — that is luck, not robustness. Read
the field set off the JDK you are targeting; do not carry it across a release.

`AllTypes` is the instructive zero, and worth stating precisely because the obvious
explanation is wrong: 8 + 34 rounds up to the same 48 that 12 + 34 does, so the freed bytes
are lost to **external** alignment padding at the end of the object. Its 2-byte _internal_
hole exists in both modes and does not move — JOL reports `2 bytes internal` in both, plus
`4 bytes external` under compact headers `[executed]`. Nothing migrated; the object simply did
not change size class.

### Without compressed oops, five of these rows reverse

At 32 GB of heap and above a reference is 8 bytes, so every `p` containing one changes and the same
rule lands somewhere else. Measured at `-Xmx40g` on 25.0.3, reproduced on 26.0.2 `[executed]`:

| Row            | `p` @6g | saving @6g | `p` @40g | `p%8` | classic/compact @40g | saving @40g |
| -------------- | ------- | ---------- | -------- | ----- | -------------------- | ----------- |
| `String`       | 10      | **0**      | 14       | 6     | 32 / 24              | **8** ⟲     |
| `ArrayList`    | 12      | **0**      | 16       | 0     | 32 / 24              | **8** ⟲     |
| `AllTypes`     | 34      | **0**      | 38       | 6     | 56 / 48              | **8** ⟲     |
| `HashMap$Node` | 16      | 8          | 28       | 4     | 40 / 40              | **0** ⟲     |
| `C3`           | 16      | 8          | 20       | 4     | 32 / 32              | **0** ⟲     |
| `HashMap`      | 32      | 8          | 48       | 0     | 64 / 56              | 8           |

The nine reference-free classes — `Object`, `Integer`, `Boolean`, `Long`, `Double`,
`LocalDate`, `R4i`, `Rec4`, `Point`, occupying eight rows above since `Long` and `Double` share
one — are unaffected. **The rule itself survives untouched:** recomputing `p` with `ref` = 8
predicts all five reversals exactly. Only its input changed.

## 3. The consequence: boxed collections gain almost nothing, at either oop size

Deep footprints, `GraphLayout.totalSize()`, **at `-Xmx6g` with compressed oops on**,
reproduced identically on 25.0.3 and 26.0.2 `[executed]`. Boxed values are all above 100,000,
deliberately outside the `Integer` cache — inside it the boxes are shared and the measurement
is meaningless. The `-Xmx40g` column is the same run at 40 GB, above the oops threshold.

| Population                            | Classic    | Compact    | Saving | @40g classic → compact | Saving    |
| ------------------------------------- | ---------- | ---------- | ------ | ---------------------- | --------- |
| `ArrayList<Integer>`, 1000 distinct   | **20,976** | **20,976** | **0**  | 25,920 → 25,912        | 8         |
| `int[1000]`                           | 4,016      | 4,016      | 0      | 4,016 → 4,016          | 0         |
| `Integer[1000]`, distinct             | 20,016     | 20,016     | **0**  | 24,016 → 24,016        | **0**     |
| `String[1000]` of 8-character strings | 52,016     | 52,016     | **0**  | 64,016 → 56,016        | **8,000** |
| two `long[1000]`                      | 16,032     | 16,032     | 0      | 16,032 → 16,032        | 0         |

**`ArrayList<Integer>` × 1000 is 20,976 bytes in both modes** under compressed oops. Not
"slightly less" — the same number. The `ArrayList` is 24 in both, the backing `Object[1234]`
is 4,952 in both, and the 1000 `Integer` boxes are 16,000 in both. There is nothing for the
flag to take. At 32 GB and above it becomes 25,920 → 25,912: the `ArrayList` object saves its 8 bytes
and nothing else moves, because the boxes still do not shrink and `Object[]` is now an
8-byte-element array. The conclusion holds; the exact equality is oops-scoped.

**`String[1000]` is the row that genuinely inverts**, and it is worth knowing which way. Under
compressed oops the saving is zero. At 32 GB and above the `String` object goes 32 → 24 for every
string regardless of payload, so 1000 of them save 8,000 bytes — **12.5% of the population**.
An 8-character string is the case where the payload contributes nothing either way, so the
whole difference is the header on the object.

`HashMap<Integer,Integer>` with 1000 entries, `GraphLayout.toFootprint()` `[executed]`:

| Component                   | Classic    | Compact    |
| --------------------------- | ---------- | ---------- |
| `[Ljava.util.HashMap$Node;` | 8,208      | 8,208      |
| 2000 × `java.lang.Integer`  | 32,000     | 32,000     |
| 1 × `java.util.HashMap`     | 48         | 40         |
| 1000 × `HashMap$Node`       | 32,000     | 24,000     |
| **total**                   | **72,256** | **64,248** |

Two `int[1000]` holding the same key/value pairs cost **8,032 bytes**, in all four
combinations. So `HashMap<Integer,Integer>` costs **9.0×** the primitive form under classic
headers and **8.0×** under compact ones: the flag closes about 12% of an 800% gap.

At 32 GB and above even that disappears. The same map measures **88,464 → 88,456** `[executed]` — a
saving of **8 bytes in total**, because `HashMap$Node` stops shrinking (`p` = 28) and only the
one `HashMap` object moves. The gap against two `int[1000]` widens to **11.0×** and the flag
closes 0.01% of it. If boxed collections are the
footprint problem, compact object headers are not the fix at either oop size —
`shape-decision.md` is.

### Short strings: the object never shrinks; its payload sometimes does

Under compressed oops the `String` object is **24 bytes in both modes at every length and both
encodings** `[executed]`, so whether a string's _total_ footprint shrinks is decided entirely
by its `byte[]` payload and §1's **array** row applies — but over **payload bytes, not
characters**:

```text
payloadBytes = length × bytesPerChar        bytesPerChar = 1 if the string is
saving = 8 iff payloadBytes mod 8 ∈ {1,2,3,4}              Latin-1-representable, else 2
```

`COMPACT_STRINGS` is on by default, so a string containing any character above U+00FF is
UTF-16-backed and its payload doubles. Because the rule runs over payload bytes, the two
encodings give **opposite answers wherever `length` and `2 × length` fall on different sides
of the mod-8 window — at 3–6 and 11–12 below — and identical answers elsewhere.** Do not
compute the Latin-1 answer and flip it; that is wrong at half the lengths, including 9–10.
Stating the rule over `length` at all is wrong in both directions.
`GraphLayout.totalSize()`, 25.0.3, both modes, `[executed]` at every length 1–12:

| chars | Latin-1 classic → compact | saving | UTF-16 classic → compact | saving |
| ----- | ------------------------- | ------ | ------------------------ | ------ |
| 1–2   | 48 → 40                   | 8      | 48 → 40                  | 8      |
| 3–4   | 48 → 40                   | 8      | 48 → **48**              | **0**  |
| 5–6   | 48 → **48**               | **0**  | 56 → 48                  | 8      |
| 7–8   | 48 → **48**               | **0**  | 56 → **56**              | **0**  |
| 9–10  | 56 → 48                   | 8      | 64 → 56                  | 8      |
| 11–12 | 56 → 48                   | 8      | 64 → **64**              | **0**  |

For Latin-1 the rule reduces to `length mod 8 ∈ {1,2,3,4}`; for UTF-16 it reduces to
`length mod 4 ∈ {1,2}`. So the widely useful statement — _a currency code, a status token or a
short identifier of 5 to 8 characters gains nothing_ — **holds for Latin-1 only**, and is
exactly the case it gets wrong for UTF-16 at 5–6 characters. It is why the 8-character
`String[1000]` row above is flat, and that row is ASCII.

Do not generalise either way without **both** the length distribution and the encoding.

## 4. When the flag is on and the JVM is not

**This is the most valuable content on the page.** Two conditions leave
`-XX:+UseCompactObjectHeaders` on the command line while the JVM runs without it. Every size
you then quote is 8 bytes per object wrong across the whole heap — the exact failure this
skill exists to prevent — and the only visible evidence is one line on stderr.

All executed on 25.0.3:

| Condition                                                      | Result                                                                                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`-XX:-UseCompressedClassPointers`**                          | `warning: Compact object headers require compressed class pointers. Disabling compact object headers.` Ends `false {command line}`                                     |
| **Heap larger than 8191 GB on a collector that moves objects** | `warning: Compact object headers require a java heap size smaller than 8191G (given: 8192G). Disabling compact object headers.` Ends `false {command line, ergonomic}` |
| Same heap on a **non-moving** collector                        | **No warning.** Ends `true {command line}`                                                                                                                             |

The bound is off-by-one from how it reads: `-Xmx8191g` is fine and `-Xmx8192g` warns
`[executed]`.

**Read it as a forwarding-pointer bound, not as a list of collector names.** That is what
JEP 450 says it is, verbatim: _"we use a simple encoding of the forwarding pointer which can
address up to 8TB of heap in the lower 42 bits of the object header. Compact object headers
are currently not compatible with larger heaps when collectors other than ZGC are used."_
Measured at `-Xmx9t` on 25.0.3, G1, Parallel, Serial and Shenandoah all warn and disable —
but **ZGC and Epsilon both keep the flag** `[executed]`, and under Epsilon `Object` is 8 bytes
and `record Point(int,int)` is 16, so compact headers are genuinely in force. Epsilon never
moves an object, so it is exempt for the same reason ZGC is: the JEP's own "other than ZGC"
wording is narrower than the mechanism it describes. Derive the answer from whether the
collector relocates, and do not trust any enumeration of names — including this one.

### The command that settles it

Read the running JVM, not the command line, before quoting any size:

```bash
java -XX:+PrintFlagsFinal -version | grep UseCompactObjectHeaders   # before starting
jcmd <pid> VM.flags -all | grep UseCompactObjectHeaders             # on the running JVM
```

**`-all` is not optional.** Executed against three live JVMs on 25.0.3 — `VM.flags -all`
distinguishes all three states, and the origin tag is the tell:

```text
default JVM            bool UseCompactObjectHeaders = false ... {default}
+COH, in force         bool UseCompactObjectHeaders = true  ... {command line}
+COH, -Xmx9t on G1     bool UseCompactObjectHeaders = false ... {command line, ergonomic}
```

`{command line, ergonomic}` means the flag was passed **and** overridden. Plain `VM.flags`
without `-all` is worse in two ways: it prints nothing at all for a JVM sitting at the
default, and its `-XX:±UseCompactObjectHeaders` form carries the whole answer in one
character — so piping it through `grep -o`, the natural reflex, discards the sign and makes
the enabled and the silently-disabled JVM produce identical output `[executed]`. Match on the
value and the origin, never on the flag name alone.

Whether a configuration that passes the flag and does not get it is a P1 finding, what it
costs, and what else on that command line to distrust, are all `jvm-performance-review`'s.

## 5. How to evaluate the flag for footprint, honestly

`-XX:+UseCompactObjectHeaders` is a trade, never a default worth recommending unmeasured.
This section covers only the **footprint** side of that trade.

**Nothing on this page is a performance measurement; every number here is footprint.** What
the flag costs in throughput and latency, the published SPECjbb figures and why they carry no
provenance, its prerequisites and its per-release defaults are all in
`jvm-performance-review/references/flag-cost-and-defaults.md` — read that before recommending
the flag to anyone. That it raises object adjacency density, and what that does to false
sharing, is `false-sharing-and-contended`'s.

**What would prove it helped on footprint.** Not an object count times eight. Run the same
workload twice on the same build and measure:

1. `GraphLayout.totalSize()` over the actual live population, both modes — the honest
   a-priori answer, and the one this skill can give you before the code exists; or
2. live heap after a full GC (`jcmd <pid> GC.run` then `GC.heap_info`), both modes; or
3. a heap-dump histogram diff across the flag — but read it as a **layout** delta, never as a
   code change. `heap-dump-analysis` owns that reading.

**What predicts the answer before you run anything.** Take the top ten classes by instance
count in the workload, fix the reference size first — 4 bytes under compressed oops, 8 above
the 32 GB oops threshold — then apply §1 to each. A class whose `p` is `≡ 1,2,3,4 (mod 8)` saves
nothing and no flag will change it; one whose `p` is `≡ 0,5,6,7 (mod 8)` saves 8 bytes,
computable exactly.

Do not carry the class names across the threshold. Under compressed oops the near-zero set is
`Integer`, `Boolean`, `String`, `ArrayList`; above it, `String` and `ArrayList` leave that set
and `HashMap$Node` joins it (§2). `Integer` and `Boolean` hold either way — they contain no
reference.
