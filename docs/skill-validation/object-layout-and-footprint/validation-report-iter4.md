# Validation report — `object-layout-and-footprint`, iteration 4

**Validator:** independent adversarial pass on the current text. Per the coordinator's
instruction, the verification instrument for this round was rebuilt so it **cannot assume the
reference width**, and was itself validated against a negative control before its verdict was
trusted.

**Environment.** Temurin **25.0.3+9** (Windows x64), **26.0.2+10** and **21.0.12+8** (Linux
x64, Docker). JOL `jol-core:0.17`. Not re-reported per the coordinator: file count, description
length, line count, Prettier state, absence of "31 GB" strings.

---

## 0. The instrument, and why the old one was worthless here

The author's diagnosis is correct and is the important lesson of this round: _a wrong
decomposition that sums correctly at the default reference width is invisible to any check that
assumes that width._ My iteration-2 and iteration-3 checkers both hard-coded `ref` = 4 when
computing `p`, so they could not have caught either `HashMap` or `AllTypes` — and did not.

For this round I built a checker that:

1. **Reads the shipped `compact-object-headers.md` directly** and parses each `| Object |
Fields | p | p%8 | Classic | Compact | Saving |` row out of the file — so it validates the
   published text, not my transcription of it.
2. **Parses the Fields cell into (references, primitive bytes)** with a tokeniser that treats
   `ref`/`refs`/`[]` as references and never converts one to a byte count.
3. **Discovers the reference width at runtime** — `(sizeof(Object[1000]) − sizeof(Object[0]))
/ 1000` — rather than assuming it.
4. Cross-checks the parsed decomposition against **reflection** over declared and inherited
   non-static fields, and checks the doc-derived `p` against an **independent JOL
   measurement**.

Run in all four configurations on 25.0.3:

```
oopsON-classic     ### rows=14 failures=0  (ref=4, header=12)
oopsON-compact     ### rows=14 failures=0  (ref=4, header=8)
oopsOFF-classic    ### rows=14 failures=0  (ref=8, header=12)
oopsOFF-compact    ### rows=14 failures=0  (ref=8, header=8)
```

**Negative control.** Because a checker that passes everything may simply be broken, I reverted
`AllTypes` to the defective form in a copy and re-ran:

```
oopsON-classic   FAIL AllTypes  docRefs=0 docPrim=34  p@ref4=34  pred=48  meas=48
                   << [decomposition 0refs+34B != reflection 1refs+30B]
oopsOFF-classic  FAIL AllTypes  docRefs=0 docPrim=34  p@ref8=34  pred=48  meas=56
                   << [decomposition 0refs+34B != reflection 1refs+30B,
                       DOC-DERIVED p=34 predicts 48 but measured 56]
```

The control is instructive in its own right: at `ref` = 4 the defect produces **no size error at
all** (48 = 48) and is caught only by the reflection cross-check; only at `ref` = 8 does it
also produce a wrong size. That is the precise mechanism by which it survived three rounds, and
it confirms the author's account.

---

## 1. Answers to the four questions

### 1.1 Is the author's checker's verdict independently reproducible, and is `p` at `ref` = 8 predictive rather than fitted?

**Yes to both, and the second is the stronger result.** The `p` values my checker uses are
derived by parsing the documentation's own prose decomposition and multiplying by a
runtime-discovered width; the sizes come from JOL. The two never see each other. At `ref` = 8
all six reference-carrying rows agree:

| Row            | doc cell                                  | refs + prim | `p` @ref8 | predicted | **measured** |
| -------------- | ----------------------------------------- | ----------- | --------- | --------- | ------------ |
| `String`       | `int` + `byte` + `boolean` + `byte[]` ref | 1 + 6       | 14        | 32        | **32**       |
| `ArrayList`    | two `int` + `Object[]` ref                | 1 + 8       | 16        | 32        | **32**       |
| `HashMap`      | four refs + four 4-byte primitives        | 4 + 16      | 48        | 64        | **64**       |
| `HashMap$Node` | `int` + three refs                        | 3 + 4       | 28        | 40        | **40**       |
| `C3`           | `long` + `int` + ref                      | 1 + 12      | 20        | 32        | **32**       |
| `AllTypes`     | ref + 1+1+2+2+4+4+8+8                     | 1 + 30      | 38        | 56        | **56**       |

The `AllTypes` fix is correct: `ref + 1+1+2+2+4+4+8+8` parses to one reference plus 30
primitive bytes, giving 34 at `ref` = 4 and **38** at `ref` = 8, and 38 reproduces the measured
56/48. The "60/60" claim is substantiated — my equivalent is 14 rows × 4 configurations = 56
row-checks with zero failures, plus `Double` (the fifteenth class, sharing a row with `Long`)
verified separately at both widths in earlier rounds.

### 1.2 The N = 10⁶ figures

Derived from first principles **before** measuring, at `ref` = 8, N = 10⁶:

```
Node[2^21] @ 8-byte elements   16 + 8 × 2,097,152      = 16,777,232
2,000,000 × Integer (p=4)      16 both modes           = 32,000,000
1,000,000 × HashMap$Node (p=28) alignUp(40)/alignUp(36) = 40,000,000  both modes
1 × HashMap (p=48)             alignUp(60)=64 / alignUp(56)=56
                               classic 88,777,296   compact 88,777,288
```

Measured, fresh run, `-Xmx40g`, 25.0.3:

```
classic  HashMap<Integer,Integer>  88777296   B/elem=88.78
compact  HashMap<Integer,Integer>  88777288   B/elem=88.78
```

Exact. Every other row of the new `-Xmx40g` table also reproduces, including the added
`ArrayList<Rec>`: parallel arrays 24,000,064 (24.00 both modes), `Rec[]`/`Cls[]`
48,000,016 → 40,000,016, `ArrayList<Rec>` 48,000,048 → 40,000,040, `HashMap<Long,Rec>`
120,777,296 → 104,777,288, two `int[]` 8,000,032 both. The N = 1000 companion figure
(88,464 → 88,456) also re-measures exactly.

The supporting prose checks out arithmetically: 44/24 = 1.83×, 48/24 = 2.00×, overheads 83%
and 100%. The claim that parallel arrays are unchanged "because they hold no references at all
— neither the elements nor the backing arrays" is correct and is the right reason.

### 1.3 Does `LocalDate`'s version-scoping teach, or leave a derivable-wrong row?

**It teaches, and the scoping is provably complete.** Running my checker against the shipped
table on all three JDKs:

```
21.0.12+8   rows=14 failures=0  (both ref widths)
25.0.3+9    rows=14 failures=0  (both ref widths)
26.0.2+10   rows=14 failures=1  -> java.time.LocalDate: doc 0refs+8B vs reflection 0refs+6B
```

**Exactly one row is version-sensitive, and it is exactly the row the skill scopes.** There is
no second row a reader could derive wrongly on 26. The row carries "— JDK 21/25 only" inline,
the following paragraph gives `p` = 6 for 26.0.2 with the reflected field sets for all three
builds, states that 24 → 16 survives only because 8 and 6 both land in `{0,5,6,7} mod 8` —
"luck, not robustness" — and instructs the reader to read the field set off their own JDK. A
reader on 26 who follows that gets `p` = 6, `p%8` = 6, saving 8: correct.

**Keeping `LocalDate` was the right call.** Substituting a stable class would have removed the
skill's only worked example of a `p` that does not travel across a release, in a skill whose
own rule is "**Version-scope every size**". The row now demonstrates that rule instead of
merely asserting it, and it is the only row in the table that could.

### 1.4 Does the threshold rewrite ever read as "last safe" rather than "first unsafe"?

**No.** All 15 mentions across the five files use "at 32 GB and above" or "32 GB+", which reads
as first-unsafe, and `SKILL.md:74` closes the ambiguity explicitly:

> `-Xmx32736m` still gives `UseCompressedOops = true {ergonomic}` and `-Xmx32740m` already
> gives `false {default}` — so `-Xmx32g` is **off**, not the last value on.

Both endpoints reproduce on 25.0.3, and I narrowed the boundary further: `-Xmx32736m` is on and
**`-Xmx32738m` is already off**, so it sits between those two rather than nearer 32740m. The
author's statement is true as written ("still"/"already"); it is simply not the tightest pair.
No correction needed.

---

## 2. Everything else re-checked this round

- **Regression.** The full iteration-1 measurement suite re-run on 25.0.3 in both header modes,
  `diff`-ed against stored baselines: **byte-identical**. Four rounds of editing, no drift in
  any previously verified number.
- **Scope.** The compressed-oops _range_ is still not annexed: the formula
  `(2^32) << log2(ObjectAlignmentInBytes)` appears nowhere in the package, and `SKILL.md:81`
  routes the sizing decision to `jvm-performance-review` in the same paragraph that states the
  precondition. Publishing `-Xmx32736m`/`-Xmx32740m` is provenance for _when the layout
  changes_, not advice about _what heap to choose_ — the line is drawn correctly and stated in
  the text.
- **Runnability.** Both step-1 commands and the extended `grep -E` in
  `jol-operating-procedure.md` §3 run and produce output (1 and 6 matching lines respectively);
  the added `MaxHeapSize` term matches.
- **The reversal table's internal precision.** Six rows, five carrying the ⟲ marker, and the
  text says "five of these ... reverse" — `HashMap` is shown for completeness and correctly not
  marked, since its saving stays 8. That distinction is right.

---

## 3. NIT

### 3.1 — `compact-object-headers.md:137` — a scar from the threshold rewrite

> Boxed values are all above 100,000 … The `-Xmx40g` column is the same run **at 32 GB**, above
> the oops threshold.

The column is measured at `-Xmx40g`, not at 32 GB; the sentence contradicts its own subject and
the `@40g` column header two lines below. This looks like a mechanical substitution of the
threshold string into a sentence that was phrased around the old wording. Self-correcting
within two lines, so no reader ends up with a wrong number.

**Fix.** "The `-Xmx40g` column is the same run above the 32 GB oops threshold."

### 3.2 — "fourteen classes" vs "15 classes" for the same table

The table has **14 rows and 15 classes** (`Long` and `Double` share a row). The page says both:

- `compact-object-headers.md:76` — "**15 classes** × 4 configurations" (correct)
- `compact-object-headers.md:62` — "five of these **fourteen classes** reverse"
- `SKILL.md:78` — "Five of the **fourteen classes** in `compact-object-headers.md` §2 reverse"

`compact-object-headers.md:127` handles the same distinction carefully — "The nine
reference-free classes … occupying eight rows above since `Long` and `Double` share one" — so
the convention exists; two sites did not get it. This is the third appearance of the same
row-versus-class conflation (it produced the "14 + 32 = 44" miscount in iteration 1 and the
"nine rows" NIT in iteration 3), which suggests it is worth fixing by convention rather than
one site at a time.

**Fix.** "five of these fourteen rows" in both places, or "fifteen classes".

### 3.3 — the documented convention is necessary but is not itself a check

The coordinator asked whether the new §2 preamble prevents the next editor from reintroducing
the defect. Honest answer: **it raises the odds and does not close them.** The preamble states
the convention adjacent to the table and explains why it is load-bearing, which is the right
place and the right framing. But the defect survived three rounds precisely because a prose
convention is not enforced, and my negative control shows it is detectable only by comparing
the decomposition against reflection or by running at `ref` = 8 — neither of which a reader or
editor does by eye, and neither of which ships with the package. Both checkers that can catch
it live outside the skill.

That is a repo-process observation rather than a defect in the text, and it is the coordinator's
to weigh: if the Fields column is load-bearing, the invariant is a candidate for the same kind
of mechanical check `registry:check` already applies to other package invariants.

---

## 4. Carried forward — neighbour-side, still open

Correctly declined by the author across iterations 2–4; recorded so they are not lost:

- `jvm-performance-review/references/flag-cost-and-defaults.md:276` — "heap **≥ 8191 GB**";
  `-Xmx8191g` starts clean. The target says "larger than 8191 GB" and is right.
- `jvm-performance-review/references/flag-cost-and-defaults.md:241-242` — "default heap
  **≤ 32 GB** means compressed oops on; above it, off"; at exactly `-Xmx32g` they are off on
  both 25.0.3 and 26.0.2. The target is right, and now routes readers to the neighbour for
  exactly this.
- `false-sharing-and-contended`'s description still fires unconditionally on
  "`-XX:+UseCompactObjectHeaders` is under consideration" with no footprint disclaimer.
- `skills/object-layout-and-footprint/validation-report.md` (my iteration-1 report) is still in
  the package and still perturbs its integrity hash.

---

## Verdict

**PASS — 0 BLOCKER, 0 MAJOR, 0 MINOR, 3 NIT.**

The second instance of the iteration-3 MAJOR is fixed, and — more importantly — it was found by
the author machine-checking their own fix rather than by trusting it, which is the behaviour
that closes this class of defect. I rebuilt my instrument to remove the assumption that hid it
from me twice, validated that instrument against a negative control, and it now passes the
shipped text at both reference widths, both header modes, and on all three installed JDKs, with
the single expected exception on JDK 26 that the text itself documents.

The three remaining items are cosmetic: one sentence left mis-worded by the threshold rewrite,
one recurrence of a row-versus-class miscount, and an observation about enforcement rather than
content. None affects a number, a command, or an answer the skill would give.

What I could not break this round: the `p` rule (now 1,850 generated classes across four
iterations, five seeds, both header modes and both oop widths, zero counterexamples), any cell
of the §2 table at either reference width, the reversal table on two builds, the N = 10⁶
figures — which I derived independently before measuring and which matched to the byte — the
threshold on two builds, or the scope boundary against `jvm-performance-review`.
