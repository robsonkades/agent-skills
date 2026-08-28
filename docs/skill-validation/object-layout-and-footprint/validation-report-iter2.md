# Validation report — `object-layout-and-footprint`, iteration 2

**Validator:** independent adversarial pass, re-run from the top. The current text was treated
as a fresh skill, not as a diff against iteration 1. Nothing below is taken from the author's
arithmetic, the research brief, or my own iteration-1 results — every figure was re-measured
this session, including the ones that passed last time.

**Environment (all executed this session):** Temurin **25.0.3+9** (Windows x64, `~/.jdks`),
**26.0.2+10** (Linux x64, `eclipse-temurin:26-jdk`), **21.0.12+8** (Linux x64,
`eclipse-temurin:21-jdk`). JOL `jol-core:0.17`; `Instrumentation.getObjectSize` agent built
from `references/jol-operating-procedure.md` §4 verbatim. JDK 27 is not installed; no claim
here concerns a running JDK 27.

Not re-reported, per the coordinator: file count, description length, line count, Prettier
state.

---

## 1. Iteration-1 findings — all verified fixed

| Ref    | Finding                                       | Status                                                                                   |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **B1** | `jcmd … VM.flags \| grep -o` cannot settle it | **Fixed and verified on three live pids** (below)                                        |
| **M1** | `p` defined with a padding term               | **Fixed.** Machine-checked all 14 rows + 500 fresh generated classes                     |
| **M2** | String rule assumed Latin-1                   | **Fixed.** All 24 measurements (12 lengths × 2 encodings) match the new rule exactly     |
| **M3** | `jvm-memory-regions` duplicated the rule      | **Fixed.** Neighbour now keeps the budgeting conclusion and routes the rule here         |
| **M4** | Restated `jvm-performance-review` material    | **Fixed.** 5% bound, SPECjbb paragraph and `LockingMode` row gone; pointers are accurate |
| m1     | 8191 GB off-by-one                            | **Fixed** — "larger than 8191 GB"; re-confirmed 8191g clean / 8192g warns                |
| m2     | "hole migrates 12 → 44"                       | **Fixed** — both files now state the external-padding mechanism correctly                |
| m3     | 14 + 32 ≠ 44                                  | **Fixed** — "12 classes and all 32 array sizes" is arithmetically and empirically true   |
| m5     | field-ordering contradiction glossed over     | **Fixed** — the refutation is now stated explicitly and correctly                        |
| m6     | trigger collision                             | **Half fixed** — target's side done; neighbour's side outstanding (see 3.5)              |
| m7     | "less GC work" without mechanism              | **Fixed** — the four-quantities paragraph is now the best-stated causality in the skill  |
| m8     | `+ internal holes` in the headline formula    | **Fixed**                                                                                |
| n1     | unlabelled JDK 27 claim in description        | **Fixed** — "(JEP 534, not yet GA)"                                                      |
| n2     | empty "Why" cell                              | **Fixed** — replaced by the `p` / `p%8` columns                                          |

### B1, verified on live JVMs

Three JVMs started simultaneously on 25.0.3; every claim in §4:190-204 holds:

```
pid 34540  plain default
  VM.flags -all | grep …   bool UseCompactObjectHeaders = false ... {default}
  VM.flags     | grep …    (no output)                    <- §4's "prints nothing at all"
pid 22536  -XX:+UseCompactObjectHeaders
  VM.flags -all | grep …   bool UseCompactObjectHeaders = true  ... {command line}
  VM.flags     | grep …    -XX:+UseCompactObjectHeaders   <- sign present, as §4 says
  VM.flags     | grep -o   UseCompactObjectHeaders        <- sign destroyed, as §4 says
pid 3264   -XX:+UseCompactObjectHeaders -XX:+UseG1GC -Xmx9t
  VM.flags -all | grep …   bool UseCompactObjectHeaders = false ... {command line, ergonomic}
  VM.flags     | grep -o   UseCompactObjectHeaders        <- identical to the enabled JVM
```

The three origin tags in §4's code block are reproduced verbatim. `-all` distinguishes all
three states; the old command distinguished none of them.

### M1, machine-checked rather than read

I wrote a checker that, for each of the 14 rows, derives `p` by **reflection** over declared
and inherited non-static fields, and independently verifies six things: `p` matches the table,
`p%8` matches, both size columns match `ClassLayout.instanceSize()`, the saving column is
internally consistent, the mod-8 rule reproduces the saving, and `alignUp(header + p, 8)`
reproduces the measured size. Result, 25.0.3, both modes:

```
### mode = CLASSIC      15/15 OK      ### mode = COMPACT     15/15 OK
```

(15 objects, because `Long, Double` share one row.) Every `p` in the table is exactly the
reflective field sum — including the three the reader cannot check by eye: `ArrayList` 12
(`size` + `elementData` + inherited `modCount`), `HashMap` 32 (six 4-byte fields + two
inherited refs), `String` 10. The table is now genuinely checkable without trusting prose,
which is what it claims.

**Counterexample hunt, fresh generator and seed** (500 classes, 1–4-deep inheritance chains,
0–6 fields per level, max `p` = 95): **0 rule mismatches, 0 classic size misses, 0 compact size
misses.** Combined with iteration 1's 950 classes from three different generators, that is
1,450 independently generated classes across four seeds with no counterexample. The rule
survives.

### M2, and the "inverts" claim

The corrected payload-byte rule is exact on **all 24 measurements**, and every one of the 12
cells of the §3 table reproduces:

```
len  latin1  save  pred | utf16   save  pred        len  latin1  save | utf16  save
1-2  48→40    8     8   | 48→40    8     8          7-8  48→48    0   | 56→56   0
3-4  48→40    8     8   | 48→48    0     0          9-10 56→48    8   | 64→56   8
5-6  48→48    0     0   | 56→48    8     8          11-12 56→48   8   | 64→64   0
```

`String` object = 24 bytes in both modes at every length **and both encodings** — confirmed.
SKILL.md:167-168's phrasing ("the two encodings give **opposite** answers at 3–6 characters")
is exactly right. See 3.2 for the reference's looser version of the same sentence.

### Narrowed provenance claims — confirmed true

Re-ran the agent cross-check against precisely the narrowed claim:

```
=== classic === CLAIM: classes=12 arrays=32 total=44 agreed=44 disagreed=0
=== compact === CLAIM: classes=12 arrays=32 total=44 agreed=44 disagreed=0
```

12 + 32 = 44 is now internally consistent and empirically reproducible. `grep` over the package
finds no surviving reference to the wider "14 classes" version; the three places the count
appears (`compact-object-headers.md:9`, `jol-operating-procedure.md:183-184`,
`array-and-object-arithmetic.md:9-10`) all agree with each other and with measurement.

### Everything else re-verified from scratch

- All 32 rows of `array-and-object-arithmetic.md` §3, plus 103 further array sizes not in the
  skill (`boolean[]`, `char[]`, `short[]`, `float[]`, `double[]`; n = 0…17, 100, 1000, 10⁶).
- Every cell of `shape-decision.md` §1 (N = 10⁶) and §3's 9-row record-vs-array generalisation,
  measured rather than derived. Both counting claims check out: the record is never larger in
  all 18 comparisons, and is strictly smaller in exactly **6 of 9** under compact headers
  (int n=2,4; long n=1,2,3,4).
- The `AllTypes` offset table, the `ObjectAlignmentInBytes=16` table, §5's `SuperLong`/`SubInt`
  pair, all four JOL failure modes with verbatim messages, and the cross-JDK agreement claim
  (`diff` clean across 21.0.12+8 / 25.0.3+9 / 26.0.2+10).
- JEP 450 / 519 / 534 statuses re-fetched: `Closed / Delivered`, releases 24 / 25 / 27, JEP 534
  updated 2026/08/11. Both JEP 450 quotations are verbatim.
- Every command in the skill runs as written and produces the output the text implies.

---

## 2. MAJOR

### N1 — every table in the skill silently assumes compressed oops, and five of the fourteen §2 rows reverse without them

`SKILL.md:66` says `ref` is "4 (compressed)". That parenthetical is the only place the
assumption appears. It is not carried into a single `p` value, a single table, or any of the
skill's "gains nothing" conclusions — and compressed oops switch **off ergonomically** on any
heap above ~32 GB, which is the normal case for the population sizes this skill exists to
answer for ("we are about to store 40 million of these").

Executed on 25.0.3. `-Xmx40g` reports `UseCompressedOops = false {default}`; `-Xmx6g` reports
`true {ergonomic}`. Same checker as above, run at both heaps:

| §2 row         | `p` (oops on) | classic/compact @6g | table's saving | `p` (oops off) | classic/compact @40g | **actual saving @40g** |
| -------------- | ------------- | ------------------- | -------------- | -------------- | -------------------- | ---------------------- |
| `String`       | 10            | 24 / 24             | **0**          | 14             | 32 / 24              | **8** ← reversed       |
| `ArrayList`    | 12            | 24 / 24             | **0**          | 16             | 32 / 24              | **8** ← reversed       |
| `AllTypes`     | 34            | 48 / 48             | **0**          | 38             | 56 / 48              | **8** ← reversed       |
| `HashMap$Node` | 16            | 32 / 24             | **8**          | 28             | 40 / 40              | **0** ← reversed       |
| `C3`           | 16            | 32 / 24             | **8**          | 20             | 32 / 32              | **0** ← reversed       |
| `HashMap`      | 32            | 48 / 40             | 8              | 40             | 64 / 56              | 8 (unchanged)          |

Five of fourteen rows flip. The consequences reach the skill's load-bearing claims:

- **`SKILL.md:158-159`** — "`Integer`, `Boolean`, `ArrayList` and the `String` object are all
  unchanged by compact object headers." Above 32 GB, `ArrayList` and `String` both **save 8**.
- **`SKILL.md:161-162` / `compact-object-headers.md` §3** — the flagship "short strings gain
  nothing" example inverts completely. `String[1000]` of 8-character strings, measured:

  ```
  -Xmx6g   (oops on) : 52,016 → 52,016   saving 0        <- what the skill states
  -Xmx40g  (oops off): 64,016 → 56,016   saving 8,000    <- 15% of the population
  ```

- **`compact-object-headers.md` §3, the HashMap table** — `HashMap<Integer,Integer>` × 1000
  measures 88,464 → 88,456 above 32 GB, a saving of **8 bytes total** rather than 8,008. "The
  flag closes about 12% of an 800% gap" becomes 0.01% of a 1000% gap.
- **`compact-object-headers.md:230-234`** — "if they are dominated by `Integer`, `Boolean`,
  `String`, `ArrayList` … the answer is near zero" is the wrong prediction above 32 GB for two
  of the four classes named.
- **`compact-object-headers.md:57-58`** — "a rule that is fully determined once you know the
  field set". It is not: it is determined once you know the field set **and the oop size**.
- **`array-and-object-arithmetic.md` §2** — the quoted JOL base-offset row and the sentence
  "**12 for every element of 4 bytes or less, 16 for `long` and `double`**" have an
  unmentioned third case. JOL's own report at `-Xmx40g -XX:+UseCompactObjectHeaders`:

  ```
  # Compressed references (oops): disabled
  # Field sizes:            8,    1,    1,    2,    2,    4,    4,    8,    8
  # Array base offsets:    16,   12,   12,   12,   12,   12,   12,   16,   16
                          ref  bool  byte  char  shrt   int   flt   lng   dbl
  ```

  `ref` is 8 bytes with base offset **16**, so `Object[]` behaves exactly like `long[]` — it
  shrinks by **zero at every length**, contradicting all five bolded savings in §3's
  `Object[n]` column. Measured `Object[0…8]` at `-Xmx40g`: 16/24/32/40/48/56/64/72/80,
  identical in both modes.

**Why this is a MAJOR and not a scope boundary.** The skill documents the _other two_ layout
modifiers in detail — `-XX:-UseCompressedClassPointers` gets a paragraph in
`array-and-object-arithmetic.md` §1 with its exact base offsets (20/24), and
`ObjectAlignmentInBytes=16` gets a whole section (§6) with a measured cost table. The third
modifier of exactly the same kind is the only one omitted, and it is by far the commonest:
the other two require a deliberate flag, this one happens by itself. The `description` cedes
"the compressed-oops **range**" to `jvm-performance-review` — when the switch flips, which is
a flag decision. What a 4-byte-to-8-byte reference does to `p`, to `Object[]`, and to the
saving column is footprint arithmetic, and this skill owns footprint arithmetic.

The good news: **the rule itself is untouched.** Recomputing `p` with `ref` = 8 predicts every
one of the reversed rows exactly (`String` 14 → `%8=6` → 8; `HashMap$Node` 28 → `%8=4` → 0;
`AllTypes` 38 → `%8=6` → 8; `C3` 20 → `%8=4` → 0; `ArrayList` 16 → `%8=0` → 8). The mechanism
survives; only its inputs and its tabulated conclusions are scoped.

**Fix.** Three edits, no new section needed:

1. `SKILL.md`, in "The arithmetic": add a fourth row to the Term table — `ref` **4** with
   compressed oops (the default up to ~32 GB heap), **8** without — and one sentence: _every
   table in this skill is measured with compressed oops on; above the threshold recompute `p`
   with `ref` = 8 and the answers move, including which classes save._
2. `compact-object-headers.md` §2: state that the `p` column assumes 4-byte references, and
   add the five reversed rows or a one-line note that reference-carrying rows flip.
3. `array-and-object-arithmetic.md` §2: the asymmetry sentence needs "…of 4 bytes or less —
   which includes `ref` only while compressed oops are on; without them `Object[]` behaves like
   `long[]` and never shrinks."

---

## 3. MINOR

### 3.1 — Epsilon also survives the 8 TB bound, so "only ZGC" is false

`compact-object-headers.md:170` ("any collector but ZGC"), `:174-175` ("tested on all five
collectors … only ZGC survives `[executed]`") and `SKILL.md:88` state a universal that one
command falsifies. Executed, 25.0.3:

```
-XX:+UnlockExperimentalVMOptions -XX:+UseEpsilonGC -XX:+UseCompactObjectHeaders -Xmx9t
  -> UseCompactObjectHeaders = true {command line}   (no warning)
  -> Object = 8 bytes, byte[1] = 16 bytes            (compact headers genuinely in force)
control, G1, same heap:
  -> warning: ... Disabling compact object headers.
  -> Object = 16 bytes, byte[1] = 24 bytes
```

The skill already quotes the reason verbatim — JEP 450's bound is about _the forwarding
pointer_ — and Epsilon never moves an object, so it is exempt for the same reason ZGC is. The
skill has the mechanism and drew the wrong boundary from it.

Impact is small (nobody runs Epsilon in production), but the claim is stated as an exhaustive
test and it is not one.

**Fix.** "any collector that moves objects — G1, Parallel, Serial and Shenandoah all warn and
disable `[executed]`; ZGC and Epsilon keep the flag, which is consistent with the bound being
a forwarding-pointer bound."

### 3.2 — `compact-object-headers.md:137` overstates its own table

> **The rule inverts between the two encodings**

Its own table, four lines below, shows the two encodings **agreeing** at lengths 1–2 (both save
8), 7–8 (both 0) and 9–10 (both 8), and disagreeing at 3–4, 5–6 and 11–12. That is 6 of 12
lengths each way — confirmed by measurement. A reader who internalises "inverts", computes the
Latin-1 answer and flips it gets the wrong answer at half the lengths, including 9–10 where
the answer happens to be the useful one.

SKILL.md:167-168 gets this exactly right ("opposite answers at 3–6 characters"), so the defect
is only in the reference, and only in one bolded sentence.

**Fix.** "The rule runs over payload bytes, so the two encodings give opposite answers wherever
`length` and `2 × length` fall on different sides of the mod-8 window — at 3–6 and 11–12 in the
table below, and identical answers elsewhere."

### 3.3 — `SKILL.md:96-97` gives the wrong reason for `-all`

> `-all` is not optional: without it the flag name matches identically whether the flag took
> effect or was overridden.

Measured, plain `jcmd <pid> VM.flags | grep UseCompactObjectHeaders`:

```
COH in force        -XX:+UseCompactObjectHeaders
COH overridden      -XX:-UseCompactObjectHeaders     <- these do NOT match identically
COH at the default  (no output)
```

The _name_ matches; the _lines_ do not. A reader who tests the sentence the obvious way — plain
`VM.flags` piped through plain `grep` — finds it false, and may then drop `-all`. The real
reason `-all` is required is the third row: at the default, plain `VM.flags` prints nothing, so
absence of output is ambiguous between "off" and "grep typo". The reference states both reasons
correctly at `:199-204`; SKILL.md compressed them into the one that does not survive testing.

**Fix.** "`-all` is not optional: plain `VM.flags` prints nothing at all for a JVM sitting at
the default, and the one character that carries the answer is the first thing a `grep -o` will
throw away."

### 3.4 — cross-skill contradiction, reintroduced by this fix round

`jvm-performance-review/references/flag-cost-and-defaults.md:276` now reads:

> | Any collector but ZGC, heap **≥ 8191 GB** (`-Xmx9t`) | disabled; flag reads `false {command line, ergonomic}` |

`object-layout-and-footprint` correctly says "larger than 8191 GB". Measured: `-Xmx8191g`
starts clean with the flag `true`; `-Xmx8192g` warns. **The target is the correct side and the
neighbour is now wrong** — the off-by-one I reported in iteration 1 was fixed here and
introduced there. The same neighbour line and `:280` also say ZGC is "the only exception",
which 3.1 falsifies.

Not the target's defect, but two skills now disagree about the same threshold, which is what
the gate asks me to surface.

### 3.5 — m6 residue: the trigger collision is now one-directional

The target's half is done: the description disclaims "@Contended padding **or enabling the flag
for adjacency** (false-sharing-and-contended)". `false-sharing-and-contended`'s description is
unchanged and still fires unconditionally "when `-XX:+UseCompactObjectHeaders` is under
consideration", with no footprint disclaimer. So a bare "should we turn on compact object
headers?" still matches both, and only one of them routes away.

Downgraded from iteration 1 because the target now does its half correctly. The remaining half
belongs to the neighbour.

---

## 4. NIT

### 4.1 — `shape-decision.md:109-111` contradicts itself in one sentence

> The saving is about `header + hole + 4` per element, and it is entirely independent of how
> large the payload is

`hole` is a function of `payload mod 8`, so the saving cannot be independent of the payload.
Under classic headers it is 20 bytes for a payload `≡ 0,5,6,7 (mod 8)` and 16 bytes otherwise —
a 25% spread. The intended point (the saving does not scale with field _count_) is correct and
worth keeping; the word "entirely" is what is wrong.

**Fix.** "…and it does not grow with the payload — it is 16 or 20 bytes per element under
classic headers depending on `payload mod 8`, whether the payload is 8 bytes or 800."

### 4.2 — description wording lost a noun

> record vs class vs primitive vs parallel arrays vs boxed collection

"primitive" alone is ambiguous where the previous "primitive array" was not, and the list now
reads as though "primitive" and "parallel arrays" were the same kind of thing. Trivial, but it
is the trigger line.

### 4.3 — iteration-1 report still in the package

`skills/object-layout-and-footprint/validation-report.md` is still present and still changes
the package integrity hash. The coordinator has this; noted only so it is not lost.

---

## Verdict

**FAIL — 1 MAJOR, 5 MINOR, 3 NIT. Zero BLOCKER.** PASS requires zero BLOCKER and zero MAJOR.

The fix round was genuinely good: the BLOCKER is properly fixed rather than papered over, the
`p` rule is now stated in the only form that survives 1,450 generated classes, the §2 table
made itself machine-checkable and passes every check, the string rule is exact on all 24
measurements, and the two scope violations were resolved by moving content rather than
duplicating it. Iteration 2 introduced no new defect in the text it changed — the one MAJOR is
pre-existing surface that neither iteration had probed, and the Epsilon MINOR is a universal
claim that got _stronger_ in this round ("tested on all five collectors") and thereby became
falsifiable.

The single blocking issue is that every number in the skill is scoped to compressed oops
without saying so, and five of the fourteen rows in its central table reverse when that
assumption fails — on heaps of the size the skill exists to advise about.
