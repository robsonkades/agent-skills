# Validation report — `object-layout-and-footprint`, iteration 3

**Validator:** independent adversarial pass, re-run from the top against the current text.
Every figure below was re-measured this session. The iteration-1 and iteration-2 baselines were
re-run as a regression check, not assumed.

**Environment.** Temurin **25.0.3+9** (Windows x64), **26.0.2+10** (Linux x64,
`eclipse-temurin:26-jdk`), **21.0.12+8** (Linux x64, `eclipse-temurin:21-jdk`). JOL
`jol-core:0.17`. Not re-reported per the coordinator: file count, description length, line
count, Prettier state.

---

## 0. Correction to my iteration-2 report — the author is right, I was wrong

`HashMap`'s `p` above the threshold is **48**, not the 40 I published. Verified with a
reflective field-summer that discovers the reference width empirically rather than assuming it:

```
-Xmx6g   classic   HashMap  refs=4 prims=4  p=32  p%8=0  predicted=48  measured=48  ok
-Xmx6g   compact   HashMap  refs=4 prims=4  p=32  p%8=0  predicted=40  measured=40  ok
-Xmx40g  classic   HashMap  refs=4 prims=4  p=48  p%8=0  predicted=64  measured=64  ok
-Xmx40g  compact   HashMap  refs=4 prims=4  p=48  p%8=0  predicted=56  measured=56  ok
```

Reflection over declared + inherited non-static fields, on all three builds:

```
java.util.HashMap: Node[] table; Set entrySet; int size; int modCount;
                   int threshold; float loadFactor; Set keySet; Collection values;
```

**Four references and four 4-byte primitives.** So `p` = 4×4 + 4×4 = 32 with compressed oops
and 4×8 + 4×4 = **48** without. The shipped value of 48 is correct, `alignUp(12+48)` = 64
matches the measurement, and my 40 was wrong.

The cause of my error is itself the finding in §2 below: I took the decomposition from the
skill's own §2 Fields column — _"six 4-byte fields + two inherited refs"_ — which sums to 32
only because a reference happens to be 4 bytes, and to 40 rather than 48 when it is 8. My own
iteration-2 checker also hard-coded `ref` = 4, so it computed `p` = 32 at `-Xmx40g` and could
not catch it. Both mistakes trace to the same cell.

---

## 1. Iteration-2 findings — verified fixed

| Ref     | Finding                               | Status                                                                               |
| ------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| **N1**  | compressed oops assumed silently      | **Fixed**, and the fix is correct everywhere I could test it — see below             |
| 3.1     | Epsilon survives the 8 TB bound       | **Fixed**, and improved: led by mechanism, with an explicit anti-enumeration warning |
| 3.2     | "the rule inverts" overstated         | **Fixed** — now "opposite answers … at 3–6 and 11–12 … identical elsewhere"          |
| 3.3     | wrong justification for `-all`        | **Fixed** — now the two real reasons                                                 |
| 4.1     | "entirely independent of the payload" | **Fixed**, and my own correction was wrong — see 1.4                                 |
| 4.2     | description wording                   | **Fixed**                                                                            |
| 3.4/3.5 | neighbour-side                        | Correctly declined; both still open on the neighbours (see 3.4)                      |

### 1.1 The compressed-oops fix — threshold, on both builds

`-Xmx31g` / `-Xmx32g`, `UseCompressedOops`, executed:

```
             25.0.3                        26.0.2
-Xmx30g      true  {ergonomic}             true  {ergonomic}
-Xmx31g      true  {ergonomic}             true  {ergonomic}
-Xmx31500m   true  {ergonomic}             true  {ergonomic}
-Xmx32g      false {default}               false {default}
-Xmx33g      false {default}               false {default}
```

`SKILL.md:71-73` states exactly this and names both builds. Correct.

### 1.2 The five reversals, reproduced on JDK 26 as claimed

`compact-object-headers.md:101` claims the reversal table was "Measured at `-Xmx40g` on 25.0.3,
reproduced on 26.0.2". I could not run `-Xmx40g` inside the 15 GB Docker VM, so I first
**validated a substitute**: on 25.0.3, `-Xmx6g -XX:-UseCompressedOops` produces output
byte-identical to `-Xmx40g` in both header modes (`diff` clean, both modes). Using it on
26.0.2:

```
26.0.2 -XX:-UseCompressedOops classic    compact
  String        p=14  32              24     ⟲ saving 8 (table says 0 under oops)
  ArrayList     p=16  32              24     ⟲ saving 8
  AllTypes      p=38  56              48     ⟲ saving 8
  HashMap$Node  p=28  40              40     ⟲ saving 0 (table says 8 under oops)
  C3            p=20  32              32     ⟲ saving 0
  HashMap       p=48  64              56       saving 8
```

All six rows of the new table reproduce on the second build, `HashMap` p=48 included. The claim
is true.

### 1.3 The rule in the new regime — fuzzed, not asserted

`compact-object-headers.md:113-114` says "**The rule itself survives untouched:** recomputing
`p` with `ref` = 8 predicts all five reversals exactly." Five rows is not a proof, so I fuzzed
it: 400 freshly generated classes (seed 4242, 0–8 random fields), run under
`-XX:-UseCompressedOops` with the generator computing `p` using `ref` = 8:

```
OOPS-OFF FUZZ (ref=8): classes=400 rule-mismatch=0 classic-size-miss=0 compact-size-miss=0
```

The claim holds far beyond the five rows it was based on. Across three iterations that is
**1,850 independently generated classes, four generators, five seeds, both header modes, both
oop sizes — zero counterexamples.**

### 1.4 My iteration-2 NIT 4.1 was wrong; the shipped correction is right

I claimed the per-element saving was "16 or 20". The text now says **16 to 23**. Enumerated
over every payload 0–400:

```
per-element saving: min=16 max=23
  p%8=0 -> 20   p%8=1 -> 19   p%8=2 -> 18   p%8=3 -> 17
  p%8=4 -> 16   p%8=5 -> 23   p%8=6 -> 22   p%8=7 -> 21
```

`shape-decision.md:129-131` — "`header + hole + ref` per element … stays between **16 and 23
bytes per element** for every payload from 0 to 400 bytes, set entirely by `payload mod 8`" —
is exactly right, including the `ref` term and the compressed-oops scoping. I considered only
two of the eight residues.

### 1.5 Regression

The full iteration-1 measurement suite re-run on 25.0.3, both modes, `diff`-ed against the
stored baselines: **byte-identical.** Three rounds of editing introduced no drift in any
previously-verified number.

---

## 2. MAJOR

### M1 — `compact-object-headers.md:80` — the `HashMap` Fields cell is a wrong decomposition, and it breaks the page's own oops-off derivation

| Object            | Fields                                     | `p` |
| ----------------- | ------------------------------------------ | --- |
| `new HashMap<>()` | **six 4-byte fields + two inherited refs** | 32  |

Reflection, identical on 21.0.12+8, 25.0.3+9 and 26.0.2+10: `HashMap` has **four references**
(`table`, `entrySet`, and `keySet`/`values` inherited from `AbstractMap`) and **four 4-byte
primitives** (`size`, `modCount`, `threshold`, `loadFactor`). The stated decomposition counts
`table` and `entrySet` among the "six 4-byte fields", which is true only while a reference _is_
4 bytes. It therefore sums correctly under compressed oops by coincidence and incorrectly
otherwise:

```
stated decomposition, ref=8:   6×4 + 2×8 = 40   -> alignUp(12+40) = 56
actual field set,     ref=8:   4×8 + 4×4 = 48   -> alignUp(12+48) = 64  [measured, 25.0.3 and 26.0.2]
```

**Why this is MAJOR rather than a typo.** §2 opens by promising the reader precisely this
derivation — _"`p` is the plain field sum … so every row can be checked against the mod-8 table
without trusting the prose"_ — and §5 instructs the reader to do it for their own top-ten
classes after fixing the reference size. A reader on a 40 GB heap who follows that instruction
for `HashMap` gets 56 bytes; the answer is 64. That is a wrong answer to a realistic question
in the exact regime this iteration was added to cover, it is invisible under the default
configuration, and it contradicts the page's own reversal table 30 lines below. It also
demonstrably misled a reader: it is the sole cause of the incorrect `p` = 40 in my
iteration-2 report.

Every other Fields cell checks out under reflection at both reference widths — `HashMap$Node`
("`int` + three refs") and `C3` ("`long` + `int` + ref") name references _as_ references and
survive the change correctly.

**Fix.** `| new HashMap<>() | four refs + four 4-byte primitives | 32 |`, and it then derives
48 above the threshold without further help.

---

## 3. MINOR

### 3.1 — `compact-object-headers.md:77` — `LocalDate`'s field set changed in JDK 26, so its `p` is build-specific

| Object                | Fields                     | `p` |
| --------------------- | -------------------------- | --- |
| `java.time.LocalDate` | `int year` + two **short** | 8   |

Reflection, executed:

```
21.0.12+8  java.time.LocalDate: int year; short month; short day;   -> p = 8
25.0.3+9   java.time.LocalDate: int year; short month; short day;   -> p = 8
26.0.2+10  java.time.LocalDate: int year; byte  month; byte  day;   -> p = 6
```

The Environment block names 25.0.3 **and** 26.0.2 as the builds behind this table, and §2
invites the reader to check each row. On 26.0.2 the row does not check: `p` is 6, not 8.

The measured columns survive — 24 → 16 on both builds — because 8 and 6 are both in
`{0,5,6,7} mod 8`. That is luck, not robustness: had JDK 26 dropped one more byte the saving
would have gone to zero and the row would be wrong outright.

This is a small instance of something the skill demands of everyone else. Its own rule is
"**Version-scope every size**"; the `p` column is a version-scoped fact presented as a
universal one.

**Fix.** `| int year + two short (21/25; two byte on 26 → p = 6) | 8 |`, or scope the Fields/`p`
columns to 25.0.3 in the header the way §2 already scopes them to compressed oops.

### 3.2 — the new threshold is named with two different numbers

The page states the boundary correctly and precisely once (`SKILL.md:71-73`: on at `-Xmx31g`,
off at `-Xmx32g`) and then refers to it two ways:

- **"31 GB threshold" / "above a 31 GB heap"** — `SKILL.md:71`, `array-and-object-arithmetic.md:63`,
  `compact-object-headers.md:38, 100, 121, 282`, `jol-operating-procedure.md:131, 146`,
  `shape-decision.md:34`. Correct.
- **"Above 32 GB"** — `SKILL.md:173, 183`, `array-and-object-arithmetic.md:74`,
  `compact-object-headers.md:134, 139, 158`. Wrong at the boundary: at exactly `-Xmx32g`
  compressed oops are already off, measured on both builds, so "above 32 GB" excludes the very
  value the author measured as the first one off.

Both phrases point at the same real boundary, but they are different numbers in one document
for one fact. The skill applies exactly this rigour to the other bound it documents — _"The
bound is off-by-one from how it reads: `-Xmx8191g` is fine and `-Xmx8192g` warns"_ — and not to
its own.

**Fix.** Pick one form and use it everywhere. "At 32 GB and above" is the one that is true at
the boundary and matches the measurement quoted in `SKILL.md`.

### 3.3 — cross-skill contradiction: `jvm-performance-review` is wrong at the same boundary

`jvm-performance-review/references/flag-cost-and-defaults.md:241-242`:

> So: default heap **≤ 32 GB means compressed oops on**; above it, off.

Measured on 25.0.3 and 26.0.2: at exactly `-Xmx32g`, `UseCompressedOops = false {default}`.
**The target is right and the neighbour is wrong at the boundary.** Two skills now state
different rules for the same fact, and the one that owns the topic is the incorrect one.

Neighbour-side, so not the target's to fix — but the target has now made the neighbour's
imprecision load-bearing, because `SKILL.md:74` routes the reader there for exactly this.

### 3.4 — iteration-2's neighbour-side findings are still open

Correctly declined by the author; recording them so they are not lost:

- `flag-cost-and-defaults.md:276` still says "heap **≥ 8191 GB**"; `-Xmx8191g` starts clean.
  The target says "larger than 8191 GB" and is the correct side.
- `false-sharing-and-contended`'s description still fires unconditionally "when
  `-XX:+UseCompactObjectHeaders` is under consideration", with no footprint disclaimer. The
  target's half of that split is done.

---

## 4. NIT

### 4.1 — `compact-object-headers.md:112` — "nine rows" is nine classes in eight rows

`Long, Double` share one row, so the nine reference-free classes occupy eight of the fourteen
rows. The content is right — I verified all nine are reference-free — but this is the same
row-versus-class conflation that produced the "14 classes" miscount corrected in iteration 2.

### 4.2 — the `-Xmx40g` table in `shape-decision.md` §1 is a four-row subset

`ArrayList<Rec>` and `HashMap<Integer,Integer>` appear in the two `-Xmx6g` tables and not in
the `-Xmx40g` one, so the reader comparing across the threshold loses two rows. Both are
measurable and one of them is striking: `HashMap<Integer,Integer>` at N = 10⁶ goes
**88,777,296 → 88,777,288** above the threshold — an 8-byte saving on 88 MB, the flag's
benefit gone entirely. §3 makes this point at N = 1000; the shape table could carry it too.

### 4.3 — iteration-1 report still in the package

`skills/object-layout-and-footprint/validation-report.md` remains present and still perturbs
the package integrity hash. The coordinator holds this.

---

## 5. Answers to the four questions asked

**1. Is the single-build labelling of the oops-off material honest?** Yes. `shape-decision.md`
says "same build" against an Environment block naming 25.0.3 Windows only;
`compact-object-headers.md:101` claims 26.0.2 only for the reversal table, which is exactly the
part the coordinator said was re-run. My spot-check confirms the claim rather than undercutting
it: all six reversal rows reproduce on 26.0.2 (via a substitute I validated as byte-identical
to `-Xmx40g`), and the threshold reproduces on both builds. The un-re-run part — the 1M-element
suite at `-Xmx40g` — is scoped correctly and I found nothing suggesting it would differ.

**2. The `-Xmx40g` shape table, re-derived.** It survives scrutiny. I predicted every cell from
first principles before measuring, then measured, on 25.0.3:

| Shape                | derived     | **measured**    | skill states | classic → compact |
| -------------------- | ----------- | --------------- | ------------ | ----------------- |
| four parallel arrays | 24,000,064  | **24,000,064**  | 24.00        | 24.00 → 24.00 ✓   |
| `Rec[]` / `Cls[]`    | 48,000,016  | **48,000,016**  | 48.00        | 48.00 → 40.00 ✓   |
| `HashMap<Long,Rec>`  | 120,777,296 | **120,777,296** | 120.78       | 120.78 → 104.78 ✓ |
| two `int[]`          | 8,000,032   | **8,000,032**   | 8.00         | 8.00 → 8.00 ✓     |

Every cell exact, including the four-significant-figure `120.78` and `104.78`. The claim that
the columnar floor is untouched while object-per-element rows widen is measured-true: the
parallel-array and `int[]` rows are byte-identical across the threshold. And the direction is
if anything **understated** — columnar's advantage over `Rec[]` grows from 1.83× to 2.00×,
which the skill does not say. A convenient finding, but a correct one.

**3. Does the JOL reference's new material earn its place?** Yes. §3's thesis is "a listing
without its command line is unusable", and this iteration proved heap size is one of the
deciders of the layout — so `MaxHeapSize` is now provenance for a layout measurement, which is
what that section captures, not a sizing recommendation. Naming the first entry of JOL's
`Field sizes` and `Array base offsets` rows as the oop-size tell is a JOL-operating fact and
nothing else supplies it; I confirmed both tells read as described
(`Field sizes: 8, …` and `Array base offsets: 16, 12, …` with oops off). No drift toward
`jvm-performance-review`.

**4. Does the new material annex the compressed-oops range?** No. `grep` over the package finds
the range formula `(2^32) << log2(ObjectAlignmentInBytes)` **nowhere**; the phrase
"compressed-oops range" appears only in the routing disclaimer. `SKILL.md:74` states the split
explicitly — "_Where_ the threshold is as a heap-sizing decision is `jvm-performance-review`'s"
— and what the skill keeps is the layout consequence of the precondition, which is footprint
arithmetic. The boundary is drawn correctly.

---

## Verdict

**FAIL — 1 MAJOR, 4 MINOR, 3 NIT. Zero BLOCKER.**

The iteration-2 MAJOR is properly fixed, and fixed better than I asked: the reversal is stated
as a table rather than a caveat, the rule is shown to survive rather than asserted to, four
conclusions were scoped instead of deleted, and the threshold was measured rather than
approximated. The Epsilon rewrite is now the best-reasoned passage in the skill — it leads with
the mechanism, notes that the JEP's own wording is narrower than the mechanism it describes,
and tells the reader not to trust its own list of names. My own iteration-2 corrections to
`HashMap`'s `p` and the per-element range were wrong and the author's are right.

The one blocking issue is small in text and real in consequence: a single Fields cell describes
`HashMap` in a way that is only true while a reference is 4 bytes, so the derivation the table
exists to support gives 56 where the measurement gives 64 — in precisely the above-threshold
regime this iteration was written to cover. It is the same cell that produced the error in my
own last report, which is about as direct a demonstration of its load-bearing status as a
finding can have.
