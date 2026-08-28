# Delivery record — `object-layout-and-footprint` v1.0.0 + JDK correction pass

**Date:** 2026-08-28. **Executed against:** Temurin 25.0.3+9 (Windows x64), and 21.0.12+8 /
25.0.4+7 / 26.0.2+10 (Linux x64, containers). **JDK 27 was not executed** — GA is
2026-09-15; every JDK 27 claim is source-derived and labelled as such.

## Scope, and why it is one skill and not twenty-one

The requested 21-skill catalogue was surveyed against the repository before any drafting.
**Eighteen of the 21 topics were already owned**, usually at finer granularity than
requested — G1 alone is `g1-internals`, `g1-concurrent-marking` and `g1-tuning-for-slo`; JIT
is seven skills; profiling is nine. Building the catalogue literally would have created 21
packages duplicating and contradicting roughly 60 existing ones.

Three partial gaps were researched under an explicit **justification test**, with dropping
stated up front as an acceptable outcome:

| Candidate                     | Verdict                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `object-layout-and-footprint` | **BUILD**, at roughly 40% of the proposed scope                                          |
| `jlink-and-runtime-images`    | **DROP** — see `../jlink-runtime-images/DECISION.md`                                     |
| `type-system-performance`     | **DROP** — a router over six existing owners; the value was a status pass, not a package |

`jvm-performance-for-distributed-systems`, which the brief said to reduce to a pointer,
**has never existed here** — verified across `main`, `origin/main` and all history with
`--diff-filter=A`.

`skill-creator/SKILL.md`, named as the binding standard, **does not exist** in this
repository, in `~/.claude/skills`, or as a plugin. The observed repository convention was
followed instead, with approval.

## Deliverable 1 — `object-layout-and-footprint` v1.0.0

Owns the _a-priori_ arithmetic: what one object costs before it exists. Six files, `SKILL.md`
226 lines, four references. Neighbours keep what they had, and the package restates no flag
lifecycle row and no ergonomic default.

**Validation: 4 iterations, author and validator strictly separate.**

| Iter | Result   | BLOCKER | MAJOR | MINOR | NIT |
| ---- | -------- | ------- | ----- | ----- | --- |
| 1    | FAIL     | 1       | 4     | 8     | 3   |
| 2    | FAIL     | 0       | 1     | 5     | 3   |
| 3    | FAIL     | 0       | 1     | 4     | 3   |
| 4    | **PASS** | 0       | 0     | 0     | 3   |

The BLOCKER: the skill's own verification command, `jcmd <pid> VM.flags | grep -o
'UseCompactObjectHeaders'`, strips the `+`/`-` sign, so a JVM running with compact headers
and one where the flag was **silently disabled** emit identical output. The section existed
to catch the silent-disable case, and its command confirmed that case as a positive.

The iteration-3 MAJOR is the most instructive defect in this increment. A `Fields` cell read
"six 4-byte fields + two inherited refs" for `HashMap`, counting references as 4-byte fields
— true only while a reference _is_ 4 bytes. It sums correctly at the default and wrong at
`ref` = 8. **A wrong decomposition that sums correctly at the default reference width is
invisible to any check that assumes that width**, which is why it survived three rounds: the
validator's own checker hard-coded `ref` = 4, and that same cell caused the validator's own
arithmetic error. The author then found a **second instance** (`AllTypes`) that the validator
never reported, by machine-checking the table rather than trusting the fix.

Two claims the author corrected against their own earlier work: "the string rule inverts
between Latin-1 and UTF-16" was an overstatement their own table contradicted — the two
differ only at lengths 3–6 and 11–12 — and "tested on all five collectors, only ZGC
survives" was an enumeration presented as exhaustive when Epsilon had not been tried.

**Three figures in the research brief were wrong and the author's replacements shipped**,
confirmed independently by the validator: `Integer[1000]` is 20,016 (the brief omitted the
reference array itself), `String[1000]` is 52,016 (same omission), and
`HashMap<Integer,Integer>`×1000 is 72,256 / 64,248 (the brief's fixture shared one `Integer`
between a key and a value, visible in its own "1999 × Integer" row).

**Trigger test**, blind, against all 240 descriptions with no context: prompts 1, 3, 4, 5 and
6 route uncontested. Two findings were acted on — a coverage gap where "smaller objects ⇒
shorter GC pauses" was owned by nobody, and a disclaimer that pushed a _prospective_ sizing
question away merely because a heap dump had raised it. Both are now trigger clauses.

## Deliverable 2 — correction pass: 13 corrections across 12 files in 9 skills

Only claims that a verified fact had made **false** were touched; nothing was rebaselined.

Three were false as written: `jdk.OldObjectSample` under ZGC scoped to "from JDK 26" when the
fix is 25.0.4 / 26.0.2 / 27 — the old wording exempted this repository's own JDK 25 baseline;
`-XX:+ZGenerational` described as "accepted silently" when JDK 25 warns and **JDK 26 refuses
to start** (executed); and JEP 516 called "only a candidate" when it is Closed/Delivered in
JDK 26.

The rest were verified by execution in containers rather than from memory. `LockingMode` is
absent on 21, present on 25 and absent again on 26, so the diagnostic degrades to a silent
false negative — the skill claimed it disappeared in 27. The compact-header "about half the
classes save 8 bytes" was unsourced and never said _which_ half. `jfr view
memory-leaks-by-site` gained its ZGC caveat in the file that **issues** the command, not only
in the one describing the event.

**Four of these corrections repaired defects I introduced myself**, caught by the validator:
claiming the 8 TB compact-header bound was "G1's, not universal" when Parallel, Serial and
Shenandoah also disable and **Epsilon survives** alongside ZGC — it is a forwarding-pointer
bound and Epsilon never moves anything; an off-by-one introduced _while fixing_ the previous
finding; duplicating the new skill's entire rule and table into `jvm-memory-regions`; and
leaving `flag-cost-and-defaults.md` asserting "heap ≤ 32 GB means compressed oops on", false
at the boundary it names.

The `jlink` finding was placed as a rule in `startup-cds-crac-leyden` rather than becoming a
package: a jlink image ships **no default CDS archive**, the tell is `mixed mode` versus
`mixed mode, sharing`, and restoring it costs 56 MB → 83 MB (executed).

## Measurements established here

| Fact                                       | Value                                             | Method                                                    |
| ------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------- |
| Compressed-oops ergonomic boundary         | `-Xmx32736m` on, `-Xmx32740m` off (≈31.97 GiB)    | executed, 25.0.3; 31g/32g reproduced on 25.0.4 and 26.0.2 |
| Compact-header heap bound                  | `-Xmx8191g` clean, `-Xmx8192g` disables           | executed, 25.0.4                                          |
| Collectors keeping compact headers at 9 TB | ZGC and Epsilon only                              | executed, 25.0.4, five collectors                         |
| `LocalDate` field set                      | `short`/`short` on 21 and 25; `byte`/`byte` on 26 | reflection, three containers                              |

## Known limits

- **JDK 27 was never executed.** GA is 2026-09-15. Two claims in `jvm-performance-review` are
  dated and go stale that day (`flag-cost-and-defaults.md`, `container-arithmetic.md`); they
  self-document, but they need a sweep after GA.
- The `-Xmx40g` oops-off shape table is **single-build** (Windows x64, 25.0.3). The five §2
  reversals and the threshold were re-confirmed on 26.0.2; the 1M-element suite was not.
- The `Fields`-cell convention that carried the iteration-3 MAJOR is documented **in prose
  only**. A prose convention is not a check — that is precisely why the defect survived three
  rounds — and both checkers able to catch it live outside the package. A mechanical
  invariant is the real fix and was deliberately not built here, being new scope.
- The description is **1125 characters against a 1024 display limit**, so the package
  validator warns. Accepted deliberately: only the final two exclusions (`off-heap-memory`,
  `gof-flyweight`) fall outside the visible window, while every trigger clause and both
  routing sentences sit inside it. 71 of the 240 skills here already exceed 1024 (median 982,
  p90 1209), so this is normal practice rather than an outlier. Worth recording that the
  author twice trimmed real content against this limit believing it was hard.
- Blind trigger testing surfaced **pre-existing over-trigger** that was not fixed here: six or
  seven descriptions replicate "OOMKilled / exit 137 / no Java exception", and four describe
  the same steadily-climbing-heap observation in four vocabularies. Out of scope for this
  increment, recorded so it is a decision rather than an oversight.

## Repository state

240 skills, 240 registry entries, `registry:check` up to date, all eleven touched packages
`✓ Valid` (the new one carrying the description-length warning above), architecture
boundaries OK, lint clean.

`npm run verify` still fails repo-wide on `format:check`: **12 files belonging to concurrent
work in this tree** (`java-lambdas-and-functional-interfaces`, `java-streams`,
`java-object-contracts`, and several `docs/` briefs) are not Prettier-clean. They were left
untouched deliberately — they are not part of this work. Every file this work touched passes.
The skill count rose from 237 to 240 during the session without my intervention, so expect
concurrent changes when committing.
