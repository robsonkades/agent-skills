# Validation — `architecture-trade-off-analysis`

**VERDICT (iteration 5, FINAL — ships): PASS** — 0 BLOCKER, 0 MAJOR, 0 new MINOR, 1 new NIT.

This is the permanent record for the package. Gate met at iteration 5: zero BLOCKER, zero MAJOR.
**Ships with 1 MINOR and 6 NIT unfixed**, listed in full with the reason each ships. The MINOR is a
cross-package misroute against `architecture-decision-making` that is **still open at publish
time**; its fix is specified below and deferred to a separate ADM upgrade.

Iteration history, as the commissioning standard requires:

| Iteration                      | Verdict  | BLOCKER | MAJOR                               | MINOR | NIT   |
| ------------------------------ | -------- | ------- | ----------------------------------- | ----- | ----- |
| 1                              | FAIL     | 0       | 1 (governance realism)              | 9     | 3     |
| 2                              | FAIL     | 0       | 1 (regression: ADR Compliance line) | 4     | 4     |
| 3                              | PASS     | 0       | 0                                   | 0 new | 0 new |
| 4 (post Phase 4 usage testing) | PASS     | 0       | 0 (1 reopened by coordinator)       | 0 new | 2 new |
| 5 (final)                      | **PASS** | 0       | **0**                               | 0 new | 1 new |

Cumulative: 2 MAJOR raised and discharged, 1 MAJOR reopened by the coordinator on a scope
judgement and discharged, 13 MINOR raised (12 discharged, 1 open), 10 NIT raised (4 discharged,
6 residual). No file under `skills/` was edited in any iteration.

**A retrospective count sweep was run on 2026-08-28, after the iteration-5 PASS** — see the final
section. It re-derived 84 count-claims and found 4 MINOR failures plus 1 NIT observation, none of
them BLOCKER or MAJOR and none invalidating the PASS. **Post-sweep residual totals: 5 MINOR, 7
NIT.**

---

# Iteration 5 — final gate

Package re-read from disk. `SKILL.md` 199 lines / 183 body lines. The riskiest edit in five
iterations — a rewrite of the text an agent reads first at selection time — so it was checked
against the routing suite rather than assessed on its prose.

## 0. MAJOR 4-3 — reopened by the coordinator, now DISCHARGED

The coordinator overrode my NIT-level classification of the missing deadlock trigger and reopened
it as MAJOR on the scope judgement I left to them: breaking a deadlock between two advocates is a
**core** use of this skill, so a description that never claims the situation is a defect, not a
gap. I accept the override — the judgement turns on what the skill is _for_, which is the
commissioner's call, and on that reading my NIT was wrong.

The six words went in verbatim, in both files: _"when two advocates each hold an internally
consistent case and there is no agreed basis for choosing"_. Verified present in
`SKILL.md` frontmatter and `skill.yaml`. Routing effect confirmed in §2 below. Discharged.

## 1. Did the capability-clause compression cost discrimination?

The author paid for the new trigger out of the capability clause rather than by dropping a trigger,
which is not what was authorised and is the better trade.

|        | Text                                                                                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before | "find the entangled parts, map their coupling, assess the impact of change; MECE option sets; qualitative versus quantitative analysis; modelling real domain cases; resisting evangelism, your own included" |
| After  | "entanglement and coupling, MECE option sets, qualitative versus quantitative analysis, real domain cases, and resisting evangelism — your own included"                                                      |

**It did not cost discrimination, and the compression was taken from the right half.** Three
reasons, in order of weight:

1. **The subject survives intact in the clause that carries it.** "The method for analysing an
   architectural decision, not the decision" is untouched. That eleven-word clause is the skill's
   identity _and_ its boundary against both neighbours, and it is the first thing read. A
   description "thinned to a trigger list with no subject" would open at "Use when a scorecard…";
   this one does not.
2. **Every discriminating noun survives**: entanglement, coupling, MECE, qualitative versus
   quantitative, real domain cases, evangelism. What was cut is the _procedural_ rendering of one
   of them — the three-step technique's verbs. That is teaching content. An agent choosing between
   skills needs to know this skill is about coupling and entanglement; it does not need to know
   that step 2 is "map their coupling". The three steps remain verbatim and attributed at body
   line 79, which is where they are acted on.
3. **It cut from the half that discriminates least.** The house standard is explicit that capability
   lists do not discriminate and situations do. The eight situation triggers were left whole; the
   capability list absorbed the entire 101-character cost. Dropping a trigger — the sanctioned
   alternative — would have removed a whole class of prompts from reach, which is strictly worse
   than compressing a clause that was never doing the routing.

Honest caveat, not a finding: "entanglement and coupling" is now a topic where it was a procedure,
so an agent skimming for method _shape_ gets a noun pair. The words "The method for" carry the
shape, and the routing suite shows no cost.

## 2. Full routing suite re-run — 15/15, one change, in the intended direction

Run against the new description text, not against the author's summary of it.

| #   | Prompt                                                                                                              | Iteration 4            | Iteration 5                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | Weighted scorecard, Kafka totals 42                                                                                 | ✓                      | **✓** — "a scorecard is being totalled to pick a winner", unchanged                                                                                                                                                                                                                                                                                                                                                                              |
| P2  | Prime Video article cited as proof to collapse to a monolith                                                        | ✓                      | **✓** — "cited as a general verdict"; dropping "on a technology" does not weaken the match                                                                                                                                                                                                                                                                                                                                                       |
| P3  | Vendor deck, twelve advantages and no disadvantages                                                                 | ✓                      | **✓** — "a vendor presents no disadvantages"                                                                                                                                                                                                                                                                                                                                                                                                     |
| P4  | Kafka in one column, the whole integration bus in the other                                                         | ✓                      | **✓** — unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P5  | Table could have been written for any company                                                                       | ✓                      | **✓** — unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P6  | "Event sourcing here is just best practice"                                                                         | ✓                      | **✓** — unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P7  | Benchmark microservices against a modular monolith                                                                  | ✓                      | **✓** — "two architectures are about to be benchmarked"                                                                                                                                                                                                                                                                                                                                                                                          |
| P8  | **Over-capture check:** "Benchmark Postgres against MySQL for our workload"                                         | ✓ does not fire        | **✓ still does not fire — verified, not accepted.** The author's claim holds: the discriminating noun **architectures** is retained, and the trigger still requires _two_ of them. Postgres and MySQL are datastores. Dropping "against each other" removes reciprocity, not the noun; the residual case it could newly admit ("benchmark our architecture") is a single-subject mode-C prompt this skill legitimately owns anyway.              |
| P9  | **Phase 4 deadlock:** two staff engineers, event broker vs direct HTTP, each with an internally consistent document | **coin flip with ADM** | **✓ CHANGED — now fires on a near-literal match.** The only routing change in either direction.                                                                                                                                                                                                                                                                                                                                                  |
| N1  | "Write up an ADR for our decision to standardise on Postgres"                                                       | ✓ → ADM                | **✓ → ADM** — "record discipline or reversibility pricing"                                                                                                                                                                                                                                                                                                                                                                                       |
| N2  | Deliberate Friday shortcut                                                                                          | ✓                      | **✓ → technical-debt-decisions**                                                                                                                                                                                                                                                                                                                                                                                                                 |
| N3  | "How long will the migration take?"                                                                                 | ✓                      | **✓ → estimation-under-uncertainty**                                                                                                                                                                                                                                                                                                                                                                                                             |
| N4  | Orchestration or choreography                                                                                       | ✓                      | **✓ → pattern-selection-and-composition** — "pattern choice once the forces are known"                                                                                                                                                                                                                                                                                                                                                           |
| N5  | 140 services, no owner for half                                                                                     | ✓                      | **✓ → enterprise-architecture-smells**                                                                                                                                                                                                                                                                                                                                                                                                           |
| N6  | "Two people arguing about this on taste"                                                                            | ✓ → ADM                | **✓ → ADM, and now for a principled reason.** This was the prompt most at risk from the new trigger. It does not collide: the trigger requires that each advocate **hold an internally consistent case**, which is precisely what arguing on taste is not. The new wording therefore _created_ a clean criterion — consistent cases are analytically separable and belong here; taste means no driver has been named yet, which is ADM's step 2. |

**Count: 15/15 correct. One prompt changed routing (P9), in the intended direction. No prompt
regressed.**

## 3. Byte-identical descriptions — not a deviation, and it settles an earlier NIT

Confirmed byte-identical by diff of the two extracted descriptions: **identical, 1018 characters**
(1019 bytes with the terminating newline; the author's 1017 is the same text under a different
count of the trailing whitespace).

Surveyed how this repo actually relates the two descriptions, since one example is not a
convention:

| Package                             | Frontmatter vs manifest                |
| ----------------------------------- | -------------------------------------- |
| `distribution-boundaries`           | compressed (the coordinator's example) |
| `architecture-decision-making`      | compressed — 1025 → 804 chars          |
| `pattern-selection-and-composition` | compressed — 1080 → 819 chars          |
| `technical-debt-decisions`          | **identical**                          |
| `estimation-under-uncertainty`      | **identical**                          |

**Both patterns are established, including in two of this skill's own named neighbours. Identical
is therefore not a deviation, and it does not matter.** `docs/skill-format.md` requires only that
the manifest carry a description; nothing requires the two to differ, and `validate` is clean.

It is also the better of the two for this package specifically, and it closes iteration 2's NIT
12b from the opposite direction: I flagged the manifest then as a _lossy subset_ that showed
registry users less than the frontmatter. Two hand-maintained variants must be kept in semantic
sync through five iterations of edits; identity makes agreement checkable by `diff` instead of by
reading. The compressed pattern's advantage — a shorter registry listing — is worth little at 1018
characters, which `validate` does not flag as long.

## 4. NIT 4-1 and 4-2 — both fixed; the restored attribution is accurate

**NIT 4-1.** Now reads: "**Do not build a cabal** — the authors warn against _'an impossibly
complex, interlocking set of fitness functions that merely frustrate developers and teams.'_"

Checked against the brief rather than waved through, since a wrongly restored attribution is worse
than a missing one. Brief §1.12 carries it verbatim from **_Hard Parts_ ch. 1**: _"Architects should
not form a cabal and retreat to an ivory tower to build an impossibly complex, interlocking set of
fitness functions that merely frustrate developers and teams."_ Three checks: the quoted span is
contiguous and verbatim within that sentence ✓; "the authors" is the correct referent — it is
_Hard Parts_' own voice, and the body's other unattributed quotations are from the same two books
named in Purpose ✓; and "do not build a cabal" is the authors' own metaphor, not the skill's
coinage, so the instruction and the quote have the same source ✓. **Accurate.**

**NIT 4-2.** "A small team choosing a process boundary fails the third — mode A's _loses when_."
The ambiguous "(mode A)" is gone; the sentence now names _which_ of the three conditions fails and
points at the corroborating cell explicitly. No reading prescribes mode A. **Fixed.**

## 5. Protected blocks — final byte-identity verification

| Block                         | Lines   | Result                                                                                                                                                                                  |
| ----------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fitness-function `text` block | 133–145 | **Identical** to iterations 3 and 4 — all five fields, both justifications, the ArchUnit version, `FreezingArchRule`, the zero-because sentence and the nightly-is-a-dashboard sentence |
| Drivers table (section 4)     | 105–115 | **Identical** — provenance sentence, "columns list forces, not pairs", both rows, the mode-C rule                                                                                       |
| Failure-signature table       | 155–163 | **Identical** — all four rows, all sources, all four "earliest detectable symptom" cells, the closing Second-Law paragraph                                                              |

The prose _following_ the fitness block changed again (it is where the 4-1 attribution was
restored). One further change there is NIT 5-1 below.

## 6. Twelve items, iteration 5

All twelve pass.

| #   | Item                             | Iteration 5                                                                                                                      |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Technical accuracy               | **PASS.** Restored cabal attribution verified verbatim against brief §1.12. No other source claim touched.                       |
| 2   | Terminology fidelity             | **PASS.** All five discriminating nouns survive the compression; A–D still marked as scaffolding.                                |
| 3   | No unconditional recommendations | **PASS.** 16/16 mode-property cells intact.                                                                                      |
| 4   | Trade-off completeness           | **PASS.**                                                                                                                        |
| 5   | Trade-offs qualified             | **PASS.**                                                                                                                        |
| 6   | Evangelism                       | **PASS.** "resisting evangelism — your own included" survives in the compressed clause; "No study shows…" intact.                |
| 7   | Governance realism               | **PASS.** Block byte-identical; NIT 5-1 is in the prose after it, not the block.                                                 |
| 8   | Scale honesty                    | **PASS.** "(a rule of thumb, not sourced)" still marks the figure; the veto sentence is now unambiguous.                         |
| 9   | Scope hygiene                    | **PASS** for this package. The deadlock instance is now won on a literal match; the neighbour's over-claim is residual — see 9a. |
| 10  | Diagram accuracy                 | **PASS.** Still none.                                                                                                            |
| 11  | Trigger quality                  | **PASS.** 15/15, including the over-capture check and the previously coin-flipped deadlock.                                      |
| 12  | Internal consistency             | **PASS.** Frontmatter and manifest byte-identical; body consistent with both.                                                    |

## 7. New findings in iteration 5

**One NIT. No new MINOR, no MAJOR.**

**NIT 5-1 — "per added destination" became "per destination".** In the prose after the fitness
block, the second example metric lost the word "added". The Segment signal is _marginal_ — brief
§6.2: _"operational overhead increased linearly with each added destination"_ — and the
failure-signature table still frames it that way ("plot … against units of **growth**"). "Pages per
destination" is an average, not a marginal cost. Rescued in practice by the clause it sits in,
which alerts "on a rising gradient over three months": the gradient of an average recovers the
marginal signal. Six characters restore the precision if a line ever frees up. Raised because
compression has caused a regression twice in this package and this is where it landed this time;
kept at NIT because the gradient clause makes it behaviourally equivalent.

Nothing else changed in the body beyond the two NIT fixes and "(a rule of thumb, not a sourced
figure)" → "(a rule of thumb, not sourced)", which still marks the figure as unsourced.

---

# Final residual findings — what ships unfixed

Complete across all five iterations. Ordered by what I would still change first.

| ID       | Severity                    | Finding                                                                                                                                                                                                                                                                                                                                                                                                  | Why it ships                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **9a**   | **MINOR — OPEN AT PUBLISH** | **A live misroute against `architecture-decision-making`.** ADM's description advertises "comparing alternatives only on the forces that differ" — analysis method, not record discipline — and carries no exclusion pointing at this skill, while this skill excludes ADM. Phase 4 demonstrated the consequence: a deadlocked comparison was claimed by both and nothing in either description decided. | **Deferred to a separate ADM upgrade by the coordinator.** The fix is a different package and was correctly not made here. Iteration 5 narrows the blast radius but does not close it: the specific deadlock prompt now routes here on a literal match, so the demonstrated instance is resolved from this side — but ADM still advertises the capability generically, so prompts of the form "compare these options on the forces that differ" remain contested. **Still open.** |
| **5-1**  | NIT                         | "on-call pages per destination" lost the marginal framing ("per _added_ destination").                                                                                                                                                                                                                                                                                                                   | New at iteration 5. Behaviourally equivalent because the metric is read as a rising gradient.                                                                                                                                                                                                                                                                                                                                                                                     |
| **4-1b** | NIT                         | The cabal quote's attribution was restored, but the fitness-block prose is now the only place in the body where a quotation's speaker is named inline; the other body quotations rely on Purpose naming the two books.                                                                                                                                                                                   | Consistent throughout and never misattributed; noted for completeness only.                                                                                                                                                                                                                                                                                                                                                                                                       |
| **1-2b** | NIT                         | `qualitative-and-quantitative.md` attributes "cognitive load" to "Team Topologies territory"; the brief flags that attribution as its own inference and verifies only the term's _absence_ from both Ford/Richards books.                                                                                                                                                                                | Never actioned across five iterations. "Territory" hedges it and the load-bearing half is verified.                                                                                                                                                                                                                                                                                                                                                                               |
| **2-6**  | NIT                         | The ArchUnit snippet is not compilable as shown (no `@ArchTest`, no `.check()`).                                                                                                                                                                                                                                                                                                                         | Declined by the author; validator concurs — it demonstrates expressibility, and a compilable form costs lines the justifications use better.                                                                                                                                                                                                                                                                                                                                      |
| **2-7**  | NIT                         | `_Fundamentals_` abbreviated on first mention.                                                                                                                                                                                                                                                                                                                                                           | Declined by the author; validator concurs — edition and chapter are given.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **2-8**  | NIT                         | Mode C's sourced quote lives only in `qualitative-and-quantitative.md`.                                                                                                                                                                                                                                                                                                                                  | Declined by the author; validator concurs — this is the body/reference split the house standard asks for, and line 103 routes to it by condition.                                                                                                                                                                                                                                                                                                                                 |

**Observed across five iterations and never raised as a finding**, recorded so the list is complete
rather than flattering: `qualitative-and-quantitative.md` equates summing a matrix with Richards'
"Out-of-Context Scorecard AntiPattern" (D2A lesson 146). The lesson's name, date and framing are
verified; the equation with _summing_ specifically is the research brief's own inference from a
video-only source. The reference's wording is hedged ("teaches the summed version of it as a named
anti-pattern") and the body dropped the citation at iteration 2.

**Final residual totals: 1 MINOR (open, cross-package), 6 NIT. Zero BLOCKER, zero MAJOR.**

## The exact 9a fix, for the ADM upgrade

Both changes in **both** `skills/architecture-decision-making/SKILL.md` frontmatter and
`skills/architecture-decision-making/skill.yaml`:

1. **Remove** "comparing alternatives only on the forces that differ," from the description. It
   stays as workflow step 5 in ADM's body, where it belongs — the description is the routing
   signal, and the phrase advertises a capability ADM does not own.
2. **Append** the reciprocal exclusion: change the final `.` after
   `(pattern-selection-and-composition)` to `,` and add _", or the method of analysing the
   trade-off itself — MECE option sets, qualitative versus quantitative analysis, resisting
   evangelism (architecture-trade-off-analysis)."_

Editing ADM changes its file contents and therefore its package integrity: `npm run registry:build`
is required afterwards.

---

# Phase 4 usage testing — the eight defects and what each resolved to

Five test prompts, each run by an isolated agent holding only this skill. Four scenario tests
passed, including both adversarial ones. The eight defects below are the ones execution found that
document review could not: a document review reads what the text _says_, and these are all defects
in what an agent _does_ with it. Two of them (F5, F1) are passages I read three times and passed.

Only F1 and F5 were numbered in the report I received; the remaining six are recorded in the order
given, without invented numbering.

| Defect                                                                                                                                                                                                                                   | Resolved to                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1** — the "too small" bullet read as independent triggers but behaved as a conjunction, and contradicted mode A's _loses when … a process boundary_                                                                                   | **Fixed** at iteration 4 ("all three, the third being the veto"), refined at iteration 5 ("fails the third — mode A's _loses when_"). Verified both times.                                                                                                                                                                                                                                                                                            |
| **F5** — "This skill decides nothing concrete" made the skill **refuse work**: one run produced a reasoned refusal instead of the memo asked for; another gave a recommendation and then flagged that the skill's framing discouraged it | **Fixed** at iteration 4. Replaced with "holds no domain opinions … never withholds an answer … analysis handed back with none has failed". Verified to hold both boundaries: it denies a domain _prior_ (so `pattern-selection-and-composition` is untouched) while mandating a recommendation shaped by the skill's own three properties. Checked against mode D ("Refuse to decide yet") for contradiction — none: recommending D _is_ the answer. |
| Mode exclusivity ("exactly one at a time") blocked legitimate composition                                                                                                                                                                | **Fixed** — "B then C; A plus D's revisit trigger — but never blend into one hedged answer". This also removed a latent contradiction with mode A's own revisit trigger that three document reviews missed.                                                                                                                                                                                                                                           |
| No guidance under a deadline                                                                                                                                                                                                             | **Fixed** — run B short; the MECE set and one inverting scenario are load-bearing, isolated ratings and the full matrix drop first. Degrades in the order the sources support.                                                                                                                                                                                                                                                                        |
| Dimension elicitation ambiguous for an agent with no room to convene                                                                                                                                                                     | **Fixed** — eliciting (propose candidates for the room to accept or reject) versus importing (fill in a borrowed list).                                                                                                                                                                                                                                                                                                                               |
| The context-deletion step was performed for its own sake                                                                                                                                                                                 | **Fixed** — "if nothing deletes, that is a finding … not a failure".                                                                                                                                                                                                                                                                                                                                                                                  |
| The matrix was over-privileged as the route to a correlation                                                                                                                                                                             | **Fixed** — "the coupling map may give the correlation directly; the matrix is one route to it".                                                                                                                                                                                                                                                                                                                                                      |
| The deadlock prompt coin-flipped between this skill and ADM                                                                                                                                                                              | **Partly fixed, partly open.** Raised to MAJOR 4-3 by the coordinator; the six-word trigger went in and P9 now routes here on a literal match. The underlying cross-package collision is residual 9a, **still open at publish**.                                                                                                                                                                                                                      |

## Mechanical output, iteration 5 (real, unedited)

```
$ cd C:/git/agent-skills && node packages/cli/bin/agent-skills.mjs validate skills/architecture-trade-off-analysis
architecture-trade-off-analysis@1.0.0

  C:\git\agent-skills\skills\architecture-trade-off-analysis
  5 files

✓ Valid — no issues found

EXIT=0
```

```
$ npx prettier --check "skills/architecture-trade-off-analysis/**/*.{md,yaml}"
Checking formatting...
All matched files use Prettier code style!

EXIT=0
```

```
$ wc -l skills/architecture-trade-off-analysis/SKILL.md skills/architecture-trade-off-analysis/references/*
  199 skills/architecture-trade-off-analysis/SKILL.md
  179 skills/architecture-trade-off-analysis/references/bias-and-evidence.md
  166 skills/architecture-trade-off-analysis/references/qualitative-and-quantitative.md
  159 skills/architecture-trade-off-analysis/references/worked-analysis.md
  703 total
```

Body 183 lines after the 16-line frontmatter — the raised cap, met exactly. Descriptions verified
byte-identical between `SKILL.md` and `skill.yaml`. `registry:build` and `verify` not run, per
instruction; **`registry:build` is required before publish**, since every file under `skills/`
feeds package integrity.

---

# Iteration 4 — re-gate after Phase 4 usage testing

Package re-read from disk. `SKILL.md` 199 lines / **183 body lines** — the raised cap, met exactly.
Frontmatter byte-identical to iterations 2–3 (verified by hash of lines 1–16), so the 14 routing
prompts from iteration 2 stand unchanged and were not re-run except for the new deadlock case
below. References byte-identical.

Context I did not have in iterations 1–3: five isolated-agent test runs found eight defects a
document review cannot reach. That is the correct division of labour, and two of the eight are
things I looked at directly and passed — worth saying plainly. I read "This skill decides nothing
concrete" as an honest scope declaration and it was; what I could not see is that an agent holding
only this skill reads it as an instruction to withhold. Document review cannot find a behaviour
that only exists when the text is executed.

## 1. Does the F5 rewrite discharge the defect, on both sides?

> **This skill holds no domain opinions**; it is the method other skills defer to. It never
> withholds an answer, though: every run ends in a recommendation carrying its winning conditions,
> its costs and its reversal signal, and analysis handed back with none has failed.

**Yes, on both sides, and the two halves are doing different work rather than hedging each other.**

_Does it still keep the skill out of the neighbours' territory?_ Yes, and more precisely than the
old line did. "Holds no domain opinions" denies the skill a prior about brokers versus HTTP, or
microservices versus monolith — which is the property that would have made it a pattern
recommender and collided with `pattern-selection-and-composition`. The old "decides nothing
concrete" denied it an _output_; the new line denies it a _prior_. That is the correct place to cut,
because the thing the neighbours own is the domain opinion, not the act of concluding.

_Does it genuinely license a recommendation?_ Yes, and it is not licensed vaguely — the shape is
mandated: "winning conditions, its costs and its reversal signal". Those are precisely three of the
four properties the skill demands of every option in its own mode table, so the recommendation is
constrained to be an output of the analysis rather than an opinion appended to it. And "analysis
handed back with none has failed" is a checkable failure condition, not an encouragement. An agent
cannot read this and produce a reasoned refusal.

_Does it collide with `architecture-decision-making`?_ No. A recommendation is not a record; ADM's
territory (record discipline, reversibility pricing) is still excluded in the description and
re-stated at line 182.

**Checked for the contradiction this rewrite could have created:** mode D is literally named
"Refuse to decide yet", against a Purpose that says the skill never withholds an answer. It holds —
recommending D _is_ the answer, and D's own row supplies all three mandated properties (price:
"every later decision made blind"; exit: "the date passes unchanged"; win condition: "the option is
genuinely open"). D requires naming the awaited event and the event that ends the wait, so it
cannot degrade into the refusal F5 was written to stop. No finding.

## 2. Does the F1 rewrite discharge the defect?

> **Too small for the decision to matter** — all three, the third being the veto: one deployable;
> one team under about eight engineers (a rule of thumb, not a sourced figure); the change
> reversible by one person in a day. A small team choosing a process boundary fails it (mode A).

Yes. "All three" makes the conjunction explicit where semicolon-separated clauses read as
alternatives, and naming the third as the veto establishes the priority — reversibility dominates
team size, so a two-person team doing something one-way does not qualify as too small. The final
sentence resolves the contradiction with mode A's _loses when … a process boundary_ by working the
collision as a worked case rather than by deleting one side. See NIT 4-2 for one word of it.

## 3. Regression check — three specific targets

The third and fourth iterations both carried compression, and compression has been the source of a
regression twice. Checked at the point of compression, not at the author's summary.

**(a) Reference routing — no regression.** The evangelism routing line was compressed ("prior
investment is being invoked" → "sunk cost is invoked"), which is exactly the kind of shortening
that turns a condition into a label. It did not: "sunk cost is invoked" is still an explicit
condition, and it maps to real content in the target file — `bias-and-evidence.md` line 15's
counter-move reads "price the decision forward only; **sunk cost is not a dimension**". All three
references remain routed from the body by an explicit condition:

| Reference                             | Condition in the body                                         | Line |
| ------------------------------------- | ------------------------------------------------------------- | ---- |
| `worked-analysis.md`                  | "**to run this end to end**"                                  | 103  |
| `qualitative-and-quantitative.md`     | "**for B vs C**"                                              | 103  |
| `bias-and-evidence.md`                | "**when an advocate is in the room or sunk cost is invoked**" | 127  |
| `bias-and-evidence.md` (second route) | "Two disagreements are live, **both sides in** …"             | 189  |

**(b) Quote fidelity on the truncation — no distortion, and the full quote is genuinely there.**

- Source (brief §1.5, verbatim): _"No generic tool exists to build this because each architecture
  is unique."_
- Body line 86 now quotes the fragment: _"each architecture is unique"_.
- Full quote verified present at `qualitative-and-quantitative.md` line 119, unaltered.

The fragment is contiguous and verbatim — no elision inside it, no words added — and it is quoted
as a fragment inside the author's own sentence rather than presented as a complete statement, so no
ellipsis is owed. Meaning is preserved: the clause is the _reason_ half of the original, and the
proposition "each architecture is unique" is true standalone and is what the body's claim rests on.

One thing the truncation does drop is the original's subject (the sentence is about tooling for
coupling diagrams). The body uses the fragment to support a different proposition — that a borrowed
dimension list is "importing" — but that proposition is independently sourced by the brief (§2 step
1: dimensions are _"unique within a particular architecture but discoverable by experienced
developers, architects, operations folks"_), which the body states in the same sentence. So the
fragment corroborates rather than carries. **No finding.**

**(c) The three regions the author says are untouched — verified, with one correction.**

| Region                                              | Claim       | Verified                                                                                                                                                                                                          |
| --------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fitness-function `text` block (lines 133–145)       | untouched   | **Confirmed** — byte-for-byte identical to iteration 3, all five fields, both justifications intact.                                                                                                              |
| Section 4, drivers (lines 105–115)                  | untouched   | **Confirmed** — provenance sentence, both rows and the "when both columns are heavy" rule identical.                                                                                                              |
| Failure-signature table (lines 155–163)             | untouched   | **Confirmed** — all four rows and the closing paragraph identical.                                                                                                                                                |
| _Prose following the fitness block_ (lines 147–151) | not claimed | **Was compressed.** The author's claim is accurate as scoped — the _block_ is untouched — but the paragraph after it lost "(the Segment signal below)", "the authors warn against" and "nothing here needs them". |

Assessed each loss: the Segment cross-reference is inferable (the failure table's Segment row still
says "plot services, repos and pages"), and "nothing here needs them" was a reassurance whose
underlying fact I re-verified independently rather than accepting — the section still carries one
complete fitness function plus the shape for the other two, and defers nothing to the two
non-existent skills, which are still declared non-existent. The attribution loss is NIT 4-1.

## 4. The other changes

| Change                                                                                                                                                       | Assessment                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode exclusivity → explicit composition ("B then C; A plus D's revisit trigger — but never blend into one hedged answer")                                    | **Improvement, and it removes a latent contradiction I missed.** "Exactly one at a time" was contradicted by mode A's own bullet, which tells you to state "the trigger to revisit" — i.e. A plus D's mechanism. The new form licenses the composition that was already prescribed, while "never blend into one hedged answer" keeps the guard that made exclusivity worth having. |
| Deadline rule ("run B short rather than skip it: the MECE set and one inverting scenario are load-bearing; isolated ratings and the full matrix drop first") | Sound, and it degrades in the right order — the MECE set and the inverting scenario are the two steps the sources treat as decisive (brief §1.7, §1.9), while isolated rating and consolidation are the mechanical middle. Operational judgement, consistent with how the rest of the when-to-use advice is presented.                                                             |
| Eliciting vs importing dimensions                                                                                                                            | Resolves a real ambiguity for an agent that cannot convene a room: "proposing candidates for the room to accept or reject is eliciting and is the job". Consistent with brief §2 step 1.                                                                                                                                                                                           |
| "If nothing deletes, that is a finding … not a failure"                                                                                                      | Good — prevents the context-deletion step being performed for its own sake, which is the obvious failure mode of a step whose exemplar deletes five of eight.                                                                                                                                                                                                                      |
| "The coupling map may give the correlation directly; the matrix is one route to it"                                                                          | Correctly demotes the matrix from the method to one instrument of it. The skill's own thesis is that the product is a correlation sentence, not a table.                                                                                                                                                                                                                           |

## 5. Twelve items, iteration 4

All twelve pass.

| #   | Item                             | Iteration 4                                                                                                                                                |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Technical accuracy               | **PASS.** Truncated quote verified verbatim and undistorted; full quote present in the reference. No other source claim changed.                           |
| 2   | Terminology fidelity             | **PASS.** A–D still marked as scaffolding; disintegrator/integrator provenance intact.                                                                     |
| 3   | No unconditional recommendations | **PASS.** All 16 mode/property cells intact; the new deadline bullet carries its own drop-order.                                                           |
| 4   | Trade-off completeness           | **PASS.**                                                                                                                                                  |
| 5   | Trade-offs qualified             | **PASS.** F5 now _requires_ every recommendation to carry conditions, costs and reversal — the property is enforced on the output, not only on the tables. |
| 6   | Evangelism                       | **PASS.** "No study shows…" intact; "not because scoring is settled" intact.                                                                               |
| 7   | Governance realism               | **PASS.** Block untouched and verified.                                                                                                                    |
| 8   | Scale honesty                    | **PASS**, and stronger: the threshold is now unambiguously conjunctive with a stated veto.                                                                 |
| 9   | Scope hygiene                    | **PASS** for this package's own text; the deadlock collision is residual and shared — see below.                                                           |
| 10  | Diagram accuracy                 | **PASS.** Still none.                                                                                                                                      |
| 11  | Trigger quality                  | **PASS.** Frontmatter unchanged (hash-verified); 14/14 prompts stand. The new deadlock prompt is a gap, not a misroute of an existing trigger — see below. |
| 12  | Internal consistency             | **PASS**, and improved twice: F5 versus mode D holds, and mode composition no longer contradicts mode A's revisit trigger.                                 |

## 6. New findings in iteration 4

Two NITs. No new MINOR, no MAJOR. Both come from the compression, which is where I was told to look
and where the last two regressions were.

**NIT 4-1 — the cabal quote lost its attributing clause.** Iteration 3: "the authors warn against
_'an impossibly complex…'_". Now: "**do not build a cabal** — _'an impossibly complex…'_". The
quotation marks and italics remain, and the sentence is the authors' throughout (their phrasing is
"architects should not form a cabal and retreat to an ivory tower"), so nothing is misattributed —
but it is the one quotation in the body that had an explicit speaker and now has none. Two words
("the authors:") restore it if a line ever frees up. Not worth spending a line on today.

**NIT 4-2 — "(mode A)" is ambiguous in the sentence written to remove an ambiguity.** "A small team
choosing a process boundary fails it (mode A)." The intended reading is that such a case _fails the
too-small test_ and that mode A loses there — corroborated by mode A's own _loses when … a process
boundary_. The parenthesis could be misread as prescribing mode A, which is the original defect. In
practice both defensible readings converge on the same behaviour (do not skip the analysis; A is
wrong here), and the verb "fails" blocks the prescriptive reading — which is why this is a NIT and
not a MINOR. "→ not mode A" or "mode A loses there" removes the last of it at equal length.

## 7. The ADM split — my answer

**A one-sided fix to ADM is sufficient to stop the coin flip, but not sufficient to make the
routing robust. I recommend both halves, and ADM's is the necessary one.**

The reasoning, since the coordinator asked for a recommendation rather than a finding:

_Who should own the deadlock prompt?_ This skill. What "get me unstuck" needs is the MECE check
(broker versus direct HTTP — same category, so the set is admissible), dimensions elicited from the
system rather than from either document, scenarios modelled until one inverts, both advocates
forced to state disadvantages, and a reduction to one "which is more important" question. That is
this skill's method end to end, and "two internally consistent documents" is a textbook instance of
its own third failure-signature row — dimensions chosen by the advocate, twice over. ADM's
contribution comes _after_: the driver discipline and the record.

_Why ADM's half is necessary._ ADM's description claims "comparing alternatives only on the forces
that differ". That is analysis method, not record discipline, and no wording this skill can adopt
stops a neighbour that advertises the same capability. Two exact changes, applied in **both**
`skills/architecture-decision-making/SKILL.md` frontmatter and `skills/architecture-decision-making/skill.yaml`:

1. **Remove** the clause "comparing alternatives only on the forces that differ," from the
   description. It stays as workflow step 5 in ADM's body, where it belongs — the description is
   the routing signal, and this phrase advertises a capability ADM does not own.
2. **Append** the reciprocal exclusion, changing the final `.` after
   `(pattern-selection-and-composition)` to `,` and adding: _", or the method of analysing the
   trade-off itself — MECE option sets, qualitative versus quantitative analysis, resisting
   evangelism (architecture-trade-off-analysis)."_

_Why this skill's half is still worth doing._ With ADM fixed, the deadlock prompt would reach this
skill on its **opening capability phrase** ("The method for analysing an architectural decision"),
not on a named situation. The house standard is explicit that capability phrases do not
discriminate and situations do — the same principle that produced finding 11a. Six words fix it,
in the same observable register as the other seven triggers (what the user types, not the diagnosis):

> after "when the candidates are not the same category of thing," insert
> **"when two advocates each hold an internally consistent case and there is no agreed basis for
> choosing,"**

Applied in both this skill's frontmatter and its `skill.yaml`.

_Why I am not raising this to MAJOR against this package._ Considered, and here is the reasoning so
the coordinator can overrule it. This package's seven named triggers all route correctly — 14/14,
re-verified — and none of them misfires; the deadlock case is a **situation this description never
claimed**, converted into a coin flip by a neighbour that claims the capability generically. The
rubric's MAJOR is "a trigger that misroutes", and no trigger here misroutes. **If the coordinator
judges deadlock-breaking to be a core use of this skill rather than an adjacent one, then the
absence is a MAJOR and the six-word addition should land before publish.** That is a scope
judgement about the skill's purpose, which is the commissioner's to make, not mine.

---

# Residual findings — as assessed at iteration 4 (SUPERSEDED)

Superseded by the final five-iteration list above. Retained for the iteration history.
Ordered by what I would still change first.

| ID           | Severity | Finding                                                                                                                                                                                                                                                        | Disposition                                                                                                                                                       |
| ------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **9a / 2-4** | MINOR    | Scope split with `architecture-decision-making` is undecided in both descriptions. Phase 4 upgraded this from a standards-conformance gap to a **live misroute**: a deadlocked comparison is claimed by both skills and nothing in either description decides. | **Open, escalated.** Fix is planned in a separate ADM upgrade. Both exact wordings specified in §7 above. Ships unfixed; the coin flip is live until ADM changes. |
| **4-1**      | NIT      | The cabal quote lost its attributing clause in the iteration-4 compression.                                                                                                                                                                                    | New. Nothing misattributed; two words restore explicitness.                                                                                                       |
| **4-2**      | NIT      | "(mode A)" is ambiguous in the F1 sentence.                                                                                                                                                                                                                    | New. Both readings converge on correct behaviour.                                                                                                                 |
| **1-2b**     | NIT      | `qualitative-and-quantitative.md` attributes "cognitive load" to "Team Topologies territory"; the brief flags that attribution as its own inference and verifies only the term's absence from both books.                                                      | Never actioned. "Territory" hedges it; the load-bearing half is verified. Accepted as-is.                                                                         |
| **2-6**      | NIT      | ArchUnit snippet is not compilable as shown.                                                                                                                                                                                                                   | Declined by author; validator concurs.                                                                                                                            |
| **2-7**      | NIT      | `_Fundamentals_` abbreviated on first mention.                                                                                                                                                                                                                 | Declined by author; validator concurs.                                                                                                                            |
| **2-8**      | NIT      | Mode C's sourced quote lives only in `qualitative-and-quantitative.md`.                                                                                                                                                                                        | Declined by author; validator concurs — this is the body/reference split the house standard asks for.                                                             |

**Observed across four iterations but never raised as a finding**, recorded so the list is complete
rather than flattering: `qualitative-and-quantitative.md` equates summing a matrix with Richards'
"Out-of-Context Scorecard AntiPattern" (D2A lesson 146). The lesson's name, date and framing are
verified; the equation with _summing_ specifically is the research brief's own inference from a
video-only source. The reference's wording ("teaches the summed version of it as a named
anti-pattern") is hedged enough that I did not raise it, and the body dropped the citation in
iteration 2.

**Phase 4 findings and their disposition** (from the coordinator's report, verified in the text
where they touch it):

| Phase 4 defect                                                                                                                       | Disposition at iteration 4                                            |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| "Decides nothing concrete" caused refusals — a reasoned refusal instead of the requested memo; a recommendation given, then undercut | **Fixed and verified.** F5 rewrite, §1 above.                         |
| "Too small" bullet read as independent triggers; contradicted mode A's _loses when_                                                  | **Fixed and verified.** F1 rewrite, §2 above; NIT 4-2 is the residue. |
| Mode exclusivity blocked legitimate composition                                                                                      | **Fixed.** Explicit composition, with the anti-hedging guard kept.    |
| No deadline guidance                                                                                                                 | **Fixed.** Degrades in the right order.                               |
| Dimension elicitation ambiguous for a lone agent                                                                                     | **Fixed.** Eliciting versus importing.                                |
| Context-deletion step performed for its own sake                                                                                     | **Fixed.** "If nothing deletes, that is a finding."                   |
| Matrix over-privileged as the route to a correlation                                                                                 | **Fixed.** "The matrix is one route to it."                           |
| Deadlock prompt coin-flips between this skill and ADM                                                                                | **Open.** Residual MINOR 9a; recommendation in §7.                    |

**Residual totals: 1 MINOR, 6 NIT. Zero BLOCKER, zero MAJOR.**

## Mechanical output, iteration 4 (real, unedited)

```
$ cd C:/git/agent-skills && node packages/cli/bin/agent-skills.mjs validate skills/architecture-trade-off-analysis
architecture-trade-off-analysis@1.0.0

  C:\git\agent-skills\skills\architecture-trade-off-analysis
  5 files

✓ Valid — no issues found

EXIT=0
```

```
$ npx prettier --check "skills/architecture-trade-off-analysis/**/*.{md,yaml}"
Checking formatting...
All matched files use Prettier code style!

EXIT=0
```

```
$ wc -l skills/architecture-trade-off-analysis/SKILL.md skills/architecture-trade-off-analysis/references/*
  199 skills/architecture-trade-off-analysis/SKILL.md
  179 skills/architecture-trade-off-analysis/references/bias-and-evidence.md
  166 skills/architecture-trade-off-analysis/references/qualitative-and-quantitative.md
  159 skills/architecture-trade-off-analysis/references/worked-analysis.md
  703 total
```

Body 183 lines after the 16-line frontmatter — the raised cap, met exactly. `registry:build` and
`verify` not run, per instruction; `registry:build` **is** required before publish, since every
file under `skills/` feeds package integrity.

---

# Iteration 3 — re-gate (final)

Package re-read from disk. `SKILL.md` 196 lines / 180 body lines — the author's hard limit, still
met exactly. References byte-identical to iteration 2.

## MAJOR 2-1 — DISCHARGED

```
Compliance   FF-07, weekly platform review — a trailing metric cannot gate a PR. Payment-service
             deploys against the estate median, rolling quarter, alerting above 2x: a service
             changing at twice the median is absorbing changes that belong to its callers.
```

**Does the sentence justify _2x_, or merely assert something adjacent?** It justifies it, though
less forcibly than the ArchUnit zero — and the distinction is worth recording rather than glossing.
The work is done by the **unit**, not by the number: expressing deploys as a multiple of the estate
median makes the multiple a count of service-loads, so 2x reads as "this deployable is absorbing
roughly one extra service's worth of change." That is exactly the condition under which the
granularity decision this ADR records has been falsified — the single payment service is carrying
the change volume that separate services would have carried — and it is what the sentence says
("absorbing changes that belong to its callers"). A threshold between 1x and 2x would fire on
ordinary dispersion around a noisy median; 2x is the first multiple that means something.

Honest qualification: this is a **principled convention with a stated meaning**, not a number
forced by an asymmetry the way `Zero NEW violations` is forced by "a minute to avoid versus a
migration to remove". It meets the bar asked for — the sentence justifies _2x_ specifically — and
it is not a justification bolted onto an arbitrary figure. Not a finding; recorded so the final
record does not overstate how tight it is.

**Can the metric live at the site named?** Yes. Deploy counts per service over a rolling quarter,
ratioed against the estate median, are computable from any deployment pipeline's own records, and
a quarterly-window ratio is naturally read at a weekly cadence. The clause "a trailing metric
cannot gate a PR" also does more than avoid the iteration-2 error: it teaches the distinction, so
a reader copying the template learns to match site to metric shape rather than copying a site.

**Does it contradict anything else in the body?** No — and it now _resolves_ the iteration-2
inconsistency rather than merely dodging it. Three checks:

- Against the fitness-function exemplar, which puts its metric in the PR check and argues "nightly
  is too late". Not a contradiction: one is a point-in-time property of a diff, the other a
  trailing rate. The two sites, each justified by the metric's nature, now read as one principle
  applied twice.
- Against "reviewed weekly, alerting on a rising gradient across three months, **not an absolute
  value**" three paragraphs earlier. "2x the estate median over a rolling quarter" is a relative
  measure over a three-month window — it conforms. Iteration 2's `failing above 12/week` was the
  absolute value that clause warns against; that is now gone.
- Against the Consequences line ("the observation that would reverse it"). The Compliance line
  supplies precisely that observation. Coherent.

The relative baseline also removes a defect nobody raised: unlike `12/week`, a ratio to the estate
median does not go stale as the organisation's deploy cadence changes.

## Regression check — the References collapse

The iteration-2 fix caused a regression, so this one was checked for the same failure. The house
standard requires every supporting file to be **routed from the body by an explicit condition**.
Collapsing the third References entry to one line would break that only if the entry were the sole
routing. It is not. Verified in the body:

| Reference                         | Routing condition in the body                                                     | Line |
| --------------------------------- | --------------------------------------------------------------------------------- | ---- |
| `worked-analysis.md`              | "Read … **to run this end to end**"                                               | 98   |
| `qualitative-and-quantitative.md` | "… **for B vs C**"                                                                | 98   |
| `bias-and-evidence.md`            | "Read … **when an advocate is in the room or prior investment is being invoked**" | 122  |
| `bias-and-evidence.md` (second)   | "Two disagreements are live, **both sides in** …"                                 | 186  |

All three routed, one of them twice. The References list at the end is a manifest, not the routing
mechanism, and the body carries the conditions. **No regression.**

One sub-check, since the collapsed entry lost the words "the adoption cascade": that material is
still reachable, because the inline condition at line 122 names "prior investment is being
invoked", which is the escalation/cascade trigger. Nothing became unreachable.

## The other four changes

| Change                                                                                       | Assessment                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FreezingArchRule` named in the Threshold line                                               | **MINOR 2-2 discharged.** The threshold is now runnable, not merely specified.                                                                                                                                                                                        |
| Simian Army date dropped; now "is archived"                                                  | **MINOR 2-3 discharged**, and by the better route. The contested part was the date (Netflix's 2018 lifecycle flag versus GitHub's 2021-03-04 banner); dropping it leaves an uncontested claim — `Netflix/SimianArmy` `archived: true` — that carries the same lesson. |
| `ArchUnit (v1.5.0, 2026-08-04)` added **alongside** the confirm-it-is-maintained instruction | Correct call, and the one I would have argued for. The datum is what I verified; the instruction is the transferable lesson and ages well. Replacing the instruction with the datum would have traded a durable habit for a fact with a shelf life.                   |
| Drivers provenance concedes "The columns list forces, not pairs"                             | **MINOR 2-1 (drivers) discharged** by concession rather than by restoring cut rows. The honest fix: the table no longer implies an opposition it does not deliver, and the 180-line budget is not spent re-adding rows whose content survives elsewhere in the body.  |
| "irrational escalation" restored                                                             | **NIT 2-5 discharged.** Body and reference now use the source's term.                                                                                                                                                                                                 |

## Twelve items, iteration 3

All twelve pass. Stated plainly rather than padded — this is the third pass over the same package
and the earlier iterations' analysis stands except where the text changed.

| #   | Item                             | Iteration 3                                                                                                                                                           |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Technical accuracy               | **PASS.** Simian Army date removed — the last claim outside the brief that carried a contestable figure. Everything else re-verified in iterations 1–2 and unchanged. |
| 2   | Terminology fidelity             | **PASS.** "irrational escalation" restored; reversibility still attributed to Fowler; A–D still marked as the skill's scaffolding.                                    |
| 3   | No unconditional recommendations | **PASS.** All 16 mode/property cells present, unchanged from the iteration-2 audit.                                                                                   |
| 4   | Trade-off completeness           | **PASS.** Mode B still carries the harshest cells in its own table.                                                                                                   |
| 5   | Trade-offs qualified             | **PASS.** The new Compliance line adds dimension, direction, magnitude (2x) and the measurement that confirms it.                                                     |
| 6   | Evangelism                       | **PASS.** "No study shows…" intact; "not because scoring is settled" intact.                                                                                          |
| 7   | Governance realism               | **PASS.** Two worked fitness functions, each with metric, tool-or-source, justified threshold and a site justified by the metric's shape.                             |
| 8   | Scale honesty                    | **PASS.** Eight-engineer threshold stated and marked as a rule of thumb.                                                                                              |
| 9   | Scope hygiene                    | **PASS** for this package; MINOR 9a residual and belongs to the neighbour.                                                                                            |
| 10  | Diagram accuracy                 | **PASS.** Still no diagrams; nothing to state notation for.                                                                                                           |
| 11  | Trigger quality                  | **PASS.** Description unchanged since iteration 2, where 14/14 prompts routed correctly.                                                                              |
| 12  | Internal consistency             | **PASS**, and improved: the Compliance line now conforms to the "not an absolute value" rule it previously contradicted.                                              |

## New findings in iteration 3

**None.** No new MINOR and no new NIT. Searched specifically for the failure modes this kind of
revision produces — a fix that moves a defect rather than removing it, a cut that strands a routing
condition, a threshold restated without its justification, and a body-versus-reference divergence
introduced by editing only one — and found none of them. Stating this explicitly because a third
iteration is where a validator is most tempted to produce findings to look diligent.

## The author's three declinations

| Declined                                                                        | Author's reason                                                    | My ruling                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NIT 2-6** — ArchUnit snippet not compilable (`@ArchTest` / `.check()` absent) | Illustrative, and the fragment must fit a 180-line body            | **Accepted.** The snippet's job is to show that the rule is expressible in a real API, which it does. A compilable version buys nothing and costs lines that the Threshold and Site justifications use better.  |
| **NIT 2-7** — `_Fundamentals_` abbreviated on first mention                     | Edition and chapter are given; the full title is in the references | **Accepted.** Ambiguity is nil in this context, and the abbreviation is how the book is referred to throughout the literature the skill cites.                                                                  |
| **NIT 2-8** — mode C's sourced quote now lives only in the reference            | Progressive disclosure; the body routes to it explicitly           | **Accepted, and it is the correct call.** This is precisely the split the house standard asks for: the body carries the instruction, the reference carries the evidence, and line 98 routes to it by condition. |

All three declinations stand as residual, recorded below rather than re-raised.

---

# Residual findings — as assessed at iteration 3 (SUPERSEDED)

Superseded by the complete four-iteration list above. Retained for the iteration history.
Complete across the first three iterations. Listed for the record, not to be flattering: one of
these is a genuine gap I would still fix, and it is named first.

| ID           | Severity | Finding                                                                                                                                                                                                                                                                                                                   | Disposition                                                                                                                                                                                                                                                                                                                                                   |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **9a / 2-4** | MINOR    | The scope exclusion is one-sided: this skill excludes `architecture-decision-making`, but ADM's description does not exclude this skill. The house standard (`skill-engineering`, decision rules) requires the exclusion in both. The substantive overlap is ADM's workflow step 5, "compare only on forces that differ". | **Open, escalated.** Author correctly declined to edit a neighbouring package unasked; the exact one-clause change is specified in the iteration-2 section below, for the coordinator to apply or reject. Ships unfixed. Routing was verified unaffected — 14/14 prompts route correctly today — so this is a standards-conformance gap, not a live misroute. |
| **1-2b**     | NIT      | `qualitative-and-quantitative.md` attributes "cognitive load" to "Team Topologies territory"; the research brief flags that attribution as its own author's inference, verifying only the term's absence from both Ford/Richards books.                                                                                   | **Never actioned.** The word "territory" hedges it adequately and the load-bearing half (absence from the books) is verified. Accepted as-is.                                                                                                                                                                                                                 |
| **2-6**      | NIT      | ArchUnit snippet is not compilable as shown.                                                                                                                                                                                                                                                                              | **Declined by author; validator concurs.**                                                                                                                                                                                                                                                                                                                    |
| **2-7**      | NIT      | `_Fundamentals_` abbreviated on first mention.                                                                                                                                                                                                                                                                            | **Declined by author; validator concurs.**                                                                                                                                                                                                                                                                                                                    |
| **2-8**      | NIT      | Mode C's sourced quote lives only in `qualitative-and-quantitative.md`.                                                                                                                                                                                                                                                   | **Declined by author; validator concurs.**                                                                                                                                                                                                                                                                                                                    |

**Observed but never formally raised**, recorded so the list is complete: `qualitative-and-
quantitative.md` states that summing a matrix is Richards' "Out-of-Context Scorecard AntiPattern"
(D2A lesson 146). The lesson's name, date and framing are verified; the equation of _summing_
specifically with that anti-pattern is the research brief's own inference from a video-only source.
The reference's wording ("teaches the summed version of it as a named anti-pattern") is hedged
enough that I did not raise it in any iteration, and the body dropped the citation entirely in
iteration 2.

**Residual totals: 1 MINOR, 4 NIT.** Zero BLOCKER, zero MAJOR.

## Mechanical output, iteration 3 (real, unedited)

```
$ cd C:/git/agent-skills && node packages/cli/bin/agent-skills.mjs validate skills/architecture-trade-off-analysis
architecture-trade-off-analysis@1.0.0

  C:\git\agent-skills\skills\architecture-trade-off-analysis
  5 files

✓ Valid — no issues found

EXIT=0
```

```
$ npx prettier --check "skills/architecture-trade-off-analysis/**/*.{md,yaml}"
Checking formatting...
All matched files use Prettier code style!

EXIT=0
```

```
$ wc -l skills/architecture-trade-off-analysis/SKILL.md skills/architecture-trade-off-analysis/references/*
  196 skills/architecture-trade-off-analysis/SKILL.md
  179 skills/architecture-trade-off-analysis/references/bias-and-evidence.md
  166 skills/architecture-trade-off-analysis/references/qualitative-and-quantitative.md
  159 skills/architecture-trade-off-analysis/references/worked-analysis.md
  700 total
```

Body 180 lines after the 16-line frontmatter. `registry:build` and `verify` not run, per
instruction — note that `registry:build` **is** required before publishing, since every file under
`skills/` feeds package integrity.

---

# Iteration 2 — re-gate

**VERDICT (iteration 2): FAIL** — 0 BLOCKER, 1 MAJOR, 4 MINOR, 4 NIT. The iteration-1 MAJOR was
discharged substantively; one new MAJOR was introduced by that revision, in the ADR template's
Compliance line.

Package re-read from disk. `SKILL.md` 196 lines (180 body lines after frontmatter — the author's
hard limit, met exactly). References unchanged except `worked-analysis.md` (finding 1a).

## MAJOR 2-1 — the ADR template's Compliance line cannot be implemented at the site it names

```
Compliance   FF-07 in the PR check: deploy frequency of the payment service, failing
             above 12/week — the signal extensibility became dominant after all.
```

Deploy frequency is a trailing metric over a window. A pull-request check runs on a proposed
change and cannot observe it; and if it could, failing an unrelated PR because the service shipped
13 times last week blocks an author for something they cannot act on. The skill's own text three
paragraphs earlier gets this right for the other two metrics — "queried over the service registry
and the paging tool, **reviewed weekly**, alerting on a rising gradient across three months, not
an absolute value" — so the skill knows trailing metrics belong in a review, then puts one in a
gate.

This is a **regression introduced by the fix for MAJOR 1-7a**. Iteration 1 read "FF-07: deploy
frequency of the payment service, alerting above N/week" — vaguer, but not wrong. Tightening the
threshold to 12/week and echoing the new example's site pulled the metric to a place it cannot
live. Flagging it explicitly rather than trading it silently against the discharged finding, per
the coordinator's instruction.

It is MAJOR rather than MINOR because this is the skill's only worked example of tying an ADR to a
fitness function — the line most likely to be copied — and because "governance that cannot be
implemented as written" is the rubric's own MAJOR clause.

Two one-line fixes, either sufficient: (a) `FF-07 in the weekly platform review: deploy frequency
of the payment service, alerting above 12/week`; or (b) keep the PR-check site and swap to a
metric a PR check can see (e.g. "a change touching more than one payment type in a single PR").

Also unjustified: **12/week** carries no justifying sentence, one section after the skill
establishes that a threshold needs one and models it well. Either justify it or restore `N`.

## MAJOR 1-7a (governance realism) — DISCHARGED, and not decoratively

The author added a fitness function carried end to end. Judged hard, on the four questions asked:

**Is the threshold justified, or arbitrary with a justification attached?** Justified, and it is
the strongest sentence added in this revision. "Zero because a crossing costs a minute to avoid
while the code is written and a migration once others depend on it; the baseline stops the gate
blocking on legacy." That is an asymmetric-cost argument, and zero-new is the _only_ threshold
consistent with it — any N>0 admits crossings whose later removal costs a migration, for no gain.
The number follows from the sentence rather than being decorated by it. The `NEW`-versus-total
distinction plus the frozen baseline is also the thing most real adoptions get wrong, and handles
the obvious objection (a zero threshold on a legacy codebase is unshippable). Better than what
iteration 1 asked for.

**Is the site defensible? Does "nightly is too late" hold?** Yes, and it holds for the same reason
the threshold does, which is why the block reads as one argument rather than four fields. Once the
import is merged, removal needs a revert or a change coordinated with whoever has since built on
it — the cost jumps to exactly the "migration" the threshold sentence prices. "A fitness function
that reports after the fact is a dashboard" names the real failure of nightly architecture checks:
they become a chart nobody actions. The one counter worth stating — a PR gate on a large monorepo
can be slow — does not bite here, because ArchUnit rules run in the test suite the PR check
already runs.

**The ArchUnit hedge: honest handling or abdication?** Honest handling. The text asserts no
currency the author could not check, tells the reader to check, and gives a dated precedent for
why the check matters — a tool from the authors' own book that died. That is the correct move
under no network access; an abdication would have been asserting maintenance, or naming no tool.

**I have network access, so it can now simply be verified. It checks out:**

| Fact                    | Value                            | Source                      |
| ----------------------- | -------------------------------- | --------------------------- |
| `TNG/ArchUnit` archived | **false**                        | GitHub API, repo object     |
| Latest release          | **v1.5.0, published 2026-08-04** | GitHub API, releases/latest |
| Last push               | **2026-08-27** (today)           | GitHub API                  |
| Stars / open issues     | 3815 / 167                       | GitHub API                  |

The hedge was warranted when written and the recommendation is safe as of this gate. Keep the
"confirm it is still maintained" instruction — it ages well and is the transferable lesson — and
optionally add the verified data point. No finding either way.

**Forward references.** Demoted to "(`architecture-characteristics` and
`architecture-fitness-functions` go deeper, but neither exists yet — nothing here needs them.)"
Confirmed: neither directory exists (`ls skills` → 0 matches), and nothing load-bearing depends on
them. The section now carries a complete worked fitness function plus the shape for the other two
metrics, so the deferral is genuinely optional. Iteration-1 MINOR 9b discharged with it.

## Did section 4 survive the compression? — YES, still load-bearing

Asked directly, because paying for the fitness function inside 180 lines cost section 4 two of its
four rows. My finding.

What was actually lost, checked row by row against iteration 1: the integrator "one driver
dominates; every option but one fails it" and the disintegrator "the decision constrains later
ones (synchronicity, data ownership)". Both survive elsewhere in the body — the first as the "no
option differs on any driver" exclusion and as mode A's win condition; the second as mode A's
_loses when_ ("a published contract, a datastore engine, a process boundary" is precisely the
constrains-later-decisions case) and as "fix the most constraining dimension first" in the method.
Nothing was deleted outright, and the compression removed exactly the redundancy iteration 1
identified ("four of eight rows are near-restatements of the when-not-to-use list").

What the section still has: the honest provenance marking ("this skill's extension, not the
authors'"), six discriminating items across two columns including one new one ("an advocate with
an answer"), and — the reason it was load-bearing in iteration 1 and still is — the decision rule
"when both columns are heavy, the answer is mode C on the one separating dimension, not more B."
That rule is what the section exists to produce and it is untouched.

**Not a header with a stub under it.** Thinner, denser, still produces a decision. No MAJOR.

**MINOR 2-1 — but the rows no longer pair.** The form is disintegrator/integrator, i.e. _opposed_
pairs. Row 2 now reads left: "Blast radius spans teams, clients or data; entangled dimensions; an
advocate with an answer"; right: "Blast radius is one module; cost of delay compounds". Only blast
radius is opposed; entanglement and the advocate have no counterpart, and cost-of-delay has none
on the left. It has become two lists in two columns, which weakens the borrowed metaphor the
section takes care to attribute. A third row restoring one opposed pair, or a sentence conceding
the columns are unpaired, fixes it.

## Mode table folded 6 → 4 columns — all four properties confirmed for all four modes

This is where a required property gets lost in a fold, so it was checked cell by cell. Table
carries _wins when_ and _loses when_; the bullet list beneath carries price / failure / dishonesty
/ exit.

| Mode | Wins when | Loses when | Price even when right                          | Signal that reverses it                        |
| ---- | --------- | ---------- | ---------------------------------------------- | ---------------------------------------------- |
| A    | ✓ table   | ✓ table    | ✓ "no record, the next team re-decides"        | ✓ "the question returns a third time"          |
| B    | ✓ table   | ✓ table    | ✓ "an ordinal answer an advocate can re-argue" | ✓ "it comes out level"                         |
| C    | ✓ table   | ✓ table    | ✓ "valid only for the workload modelled"       | ✓ "the spike grows a second question"          |
| D    | ✓ table   | ✓ table    | ✓ "every later decision made blind"            | ✓ "the date passes unchanged — D has become A" |

Sixteen cells, sixteen present. The dishonesty column also survives for all four. Nothing lost in
the fold, and the widest line in the file dropped from 496 to 410 characters.

## Re-run of the routing prompts against the new description

New clause: "when two architectures are about to be benchmarked against each other" (replacing
"when a benchmark is asked to settle what benchmarks cannot answer"). Exclusion clause changed
from "recording the decision" to "record discipline or pricing reversibility".

| #                            | Prompt                                                                                                | Iteration 1                                                | Iteration 2                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1                           | "Here's my weighted scorecard comparing Kafka, RabbitMQ and SQS — Kafka totals 42, so we pick Kafka." | ✓                                                          | **✓ unchanged.** Still the sharpest trigger.                                                                                                                                                            |
| P2                           | "The team is citing the Prime Video article as proof we should collapse back to a monolith."          | ✓                                                          | **✓ unchanged.**                                                                                                                                                                                        |
| P3                           | "This vendor deck lists twelve advantages and no disadvantages."                                      | ✓                                                          | **✓ unchanged.**                                                                                                                                                                                        |
| P4                           | "Our table has Kafka in one column and our whole integration bus in the other."                       | ✓                                                          | **✓ unchanged.**                                                                                                                                                                                        |
| P5                           | "This comparison table could have been written for any company."                                      | ✓                                                          | **✓ unchanged.**                                                                                                                                                                                        |
| P6                           | "Someone shut the discussion down by saying event sourcing here is just best practice."               | ✓                                                          | **✓ unchanged.**                                                                                                                                                                                        |
| P7                           | "We want to benchmark microservices against a modular monolith before we choose."                     | **Weak** — trigger was a verdict the user would never type | **✓ FIXED.** Near-literal match. MINOR 1-11a discharged.                                                                                                                                                |
| P8 (new, over-capture check) | "Benchmark Postgres against MySQL for our workload."                                                  | —                                                          | **✓ correctly does NOT fire** — two datastores, not two architectures; mode C territory and the description says "architectures".                                                                       |
| N1                           | "Write up an ADR for our decision to standardise on Postgres."                                        | ✓ → ADM                                                    | **✓ still → ADM.** The exclusion is narrower in wording ("record discipline"), but ADM wins on its own positive trigger ("writing the decision down so the next person can re-open it"). No regression. |
| N2                           | "We ship Friday — how do we take the shortcut deliberately?"                                          | ✓ → technical-debt-decisions                               | **✓ unchanged.**                                                                                                                                                                                        |
| N3                           | "How long will the migration take?"                                                                   | ✓ → estimation-under-uncertainty                           | **✓ unchanged.**                                                                                                                                                                                        |
| N4                           | "Orchestration or choreography — which pattern?"                                                      | ✓ → pattern-selection-and-composition                      | **✓ unchanged.**                                                                                                                                                                                        |
| N5                           | "We have 140 services and no owner for half of them."                                                 | ✓ → enterprise-architecture-smells                         | **✓ unchanged.**                                                                                                                                                                                        |
| N6                           | "Two people are arguing about this on taste."                                                         | ✓ → ADM                                                    | **✓ unchanged.** See 9a.                                                                                                                                                                                |

No misroutes. No over-capture from the broader benchmark phrasing.

## MINOR 1-6a (unconditional prohibition) — DISCHARGED

New text: "read the matrix for correlations, never for a total — summing is the Out-of-Context
Scorecard anti-pattern. Weighted scoring totals by design; side against it here because the
weights are the advocate's ("Honest standing" below), not because scoring is settled."

The right shape: the imperative is kept at full strength — "never for a total" is not softened —
and what is added is the _reason_ and the _epistemic scope_ (this skill's position, not a settled
fact), plus a pointer to where both sides are argued. It still instructs; it is no longer the one
place the skill takes an unmarked side in a disagreement it elsewhere presents as open. Not
over-hedged.

## Iteration-1 findings — disposition

| ID              | Finding                                                                                 | Disposition in iteration 2                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| MAJOR 7a        | Fitness functions: no tool, no threshold, no site; deferral to skills that do not exist | **Discharged.** Full worked example; forward refs demoted. See above.                                                                     |
| MINOR 1a        | "the winner flips" overstates the brief's "the criteria change"                         | **Discharged.** Body and `worked-analysis.md` both now read "the apparent winner no longer holds".                                        |
| MINOR 1b        | Prime Video row had no source                                                           | **Discharged.** "(team write-up, reached here via devclass, May 2023)" — and it correctly flags that the primary was reached second-hand. |
| MINOR 2a        | A–D taxonomy unmarked as the skill's own                                                | **Discharged.** "Modes A–D are this skill's scaffolding, not the authors' vocabulary."                                                    |
| MINOR 5a        | "sanctioned route … run continuously" unqualified                                       | **Discharged.** Bullet removed; the section now names tool, threshold and site instead.                                                   |
| MINOR 6a        | "never total" stated unconditionally                                                    | **Discharged.** See above.                                                                                                                |
| MINOR 8a        | "about eight engineers" unsourced in a cited document                                   | **Discharged.** "(a rule of thumb here, not a sourced figure)".                                                                           |
| MINOR 9a        | Exclusion is one-sided; ADM does not exclude this skill                                 | **Open — declined by author, escalated.** See below. Carried as MINOR 2-4.                                                                |
| MINOR 9b        | Dangling handoffs to two non-existent skills                                            | **Discharged.**                                                                                                                           |
| MINOR 11a       | Benchmark trigger was a verdict, not an observable                                      | **Discharged.** See routing table.                                                                                                        |
| MINOR 12a       | Frontmatter excluded what section 7 covered                                             | **Discharged.** "record discipline or pricing reversibility".                                                                             |
| NIT 12b         | `skill.yaml` description a lossy subset of the frontmatter                              | **Discharged.** Compared clause by clause — identical trigger list, identical five exclusions.                                            |
| NIT 12c         | "Hence" mis-attached the no-best-practices claim to the Second Law                      | **Discharged.** "From the first follows…".                                                                                                |
| (weakest thing) | 496-character mode-table lines                                                          | **Improved.** 6→4 columns; widest line now 410, in the failure-signature table.                                                           |

## Remaining findings, iteration 2

**MINOR 2-1** — section 4's rows no longer form opposed pairs (above).

**MINOR 2-2** — the frozen-baseline mechanism is not named. "Today's count frozen as a baseline"
is ArchUnit's `FreezingArchRule` with a violation store; a reader must discover that themselves,
which is one lookup between a specified threshold and a runnable one. The requirement was a
threshold and the threshold is stated and justified, so this is not a MAJOR — but naming
`FreezingArchRule` costs two words and completes the block.

**MINOR 2-3** — "Simian Army (_Fundamentals_ ch. 6) was archived in 2018" is outside the research
brief (which covers ch. 1, 2, 4, 5, 8 only) and is not marked as the author's own addition. I
checked it: the chapter attribution is corroborated (ch. 6, "Measuring and Governing Architecture
Characteristics", uses Chaos Monkey / Simian Army as its canonical fitness-function example), and
the date is defensible but ambiguous — Netflix merged PR #340 "Set lifecycle archived" on
**2018-07-17** and last pushed on **2018-12-18**, while GitHub's read-only archive banner reads
**"archived by the owner on Mar 4, 2021"**. Pick the reading and say which ("Netflix marked it
end-of-life in 2018"), or cite it.

**MINOR 2-4** — iteration-1 9a, carried forward unresolved. See the coordinator note below.

**NIT 2-5** — "anchoring 24, escalation 20, bandwagon 19": the bias is named _irrational
escalation_ in the source and in `bias-and-evidence.md`; the shortened form loses the term.

**NIT 2-6** — the ArchUnit snippet is not compilable as shown (no `@ArchTest`, no
`.check(classes)`). Clearly illustrative, and shortening it was the right call inside 180 lines.

**NIT 2-7** — `_Fundamentals_` is abbreviated on first mention in Purpose; the full title appears
only in the references.

**NIT 2-8** — mode C's sourced quote ("testing with objective outcomes … from speculation to
engineering") left the body in this revision and now lives only in
`qualitative-and-quantitative.md`. Defensible progressive disclosure, and the body routes there;
noted only because it is the sentence that licenses mode C's existence.

## For the coordinator — the exact 9a clause (I have not made this change)

I agree the author was right to escalate rather than edit a neighbouring package. The gap: this
skill excludes `architecture-decision-making`; ADM does not exclude this skill, and the house
standard (`skill-engineering`, decision rules) requires the exclusion in **both** descriptions.
The substantive overlap is ADM's workflow step 5, "compare only on forces that differ", which is
what this skill teaches at depth.

ADM's description currently ends:

> …, performance investigation (performance-methodology), or choosing a pattern once the forces
> are known (pattern-selection-and-composition).

Change `.` to `,` after `(pattern-selection-and-composition)` and append:

> , or the method of analysing the trade-off itself — MECE option sets, qualitative versus
> quantitative analysis, resisting evangelism (architecture-trade-off-analysis).

The same clause must be applied in **both** places ADM carries a description:
`skills/architecture-decision-making/SKILL.md` frontmatter and
`skills/architecture-decision-making/skill.yaml`. Note that editing ADM changes its file contents
and therefore its package integrity, so `npm run registry:build` becomes required afterwards.

## Mechanical output, iteration 2 (real, unedited)

```
$ cd C:/git/agent-skills && node packages/cli/bin/agent-skills.mjs validate skills/architecture-trade-off-analysis
architecture-trade-off-analysis@1.0.0

  C:\git\agent-skills\skills\architecture-trade-off-analysis
  5 files

✓ Valid — no issues found

EXIT=0
```

```
$ npx prettier --check "skills/architecture-trade-off-analysis/**/*.{md,yaml}"
Checking formatting...
All matched files use Prettier code style!

EXIT=0
```

```
$ wc -l skills/architecture-trade-off-analysis/SKILL.md skills/architecture-trade-off-analysis/references/*
  196 skills/architecture-trade-off-analysis/SKILL.md
  179 skills/architecture-trade-off-analysis/references/bias-and-evidence.md
  166 skills/architecture-trade-off-analysis/references/qualitative-and-quantitative.md
  159 skills/architecture-trade-off-analysis/references/worked-analysis.md
  700 total
```

Body is 180 lines after the 16-line frontmatter — the author's stated hard limit, met exactly.
`registry:build` and `verify` not run, per instruction.

## Twelve-item summary, iteration 2

| #   | Item                             | Iteration 1    | Iteration 2                                                                 |
| --- | -------------------------------- | -------------- | --------------------------------------------------------------------------- |
| 1   | Technical accuracy               | PASS + 2 MINOR | **PASS** + MINOR 2-3 (Simian Army date)                                     |
| 2   | Terminology fidelity             | PASS + 1 MINOR | **PASS** + NIT 2-5                                                          |
| 3   | No unconditional recommendations | PASS           | **PASS** — all four properties survive the fold, 16/16 cells                |
| 4   | Trade-off completeness           | PASS           | **PASS** — mode B still carries the harshest cells                          |
| 5   | Trade-offs qualified             | PASS + 1 MINOR | **PASS** — the unqualified bullet was removed                               |
| 6   | Evangelism                       | PASS + 1 MINOR | **PASS** — MINOR discharged; disclaimer intact and in the skill's own voice |
| 7   | Governance realism               | **MAJOR**      | **MAJOR 2-1** — section discharged; the ADR Compliance line regressed       |
| 8   | Scale honesty                    | PASS + 1 MINOR | **PASS** — threshold stated, now marked as a rule of thumb                  |
| 9   | Scope hygiene                    | PASS + 2 MINOR | **PASS** + MINOR 2-4 (open, escalated)                                      |
| 10  | Diagram accuracy                 | PASS (vacuous) | **PASS** — still no diagrams                                                |
| 11  | Trigger quality                  | PASS + 1 MINOR | **PASS** — 14/14 prompts route correctly                                    |
| 12  | Internal consistency             | PASS + 2 MINOR | **PASS** — frontmatter, body, references and manifest now agree             |

---

# Iteration 1 — initial gate (historical)

**VERDICT (iteration 1): FAIL** — 0 BLOCKER, 1 MAJOR, 9 MINOR, 3 NIT.

Reviewed at 196 lines `SKILL.md` plus three references (159/166/179). Ground truth: the research
brief at `scratchpad/research/architecture-trade-off-analysis.md`.

**Judgement on the known design decision.** All four meta-instantiated sections (2, 3, 4, 6) were
found honest and load-bearing, none a header with filler. Section 3 (the mode table) was the
best-constructed artefact in the package — the author's own preferred mode B carried the harshest
cell in it. Section 4 was called the thinnest, surviving on one decision rule and an honest
extension marking. That judgement is what made the iteration-2 compression worth re-checking.

**MAJOR 1-7a — governance realism.** The fitness-functions section named three metrics and one
threshold _shape_, but no tool anywhere in the package, no threshold value, and no execution site
("run continuously" is a cadence, not a place). Its escape valve deferred to
`architecture-characteristics` and `architecture-fitness-functions`, neither of which exists in
the repository. A reader had metrics and nowhere to put them.

**MINORs 1a–12c**, all listed with their iteration-2 disposition in the table above: 1a (gloss
escalated a quotation), 1b (Prime Video uncited), 2a (A–D taxonomy unmarked), 5a (one unqualified
assertion), 6a (unconditional "never total"), 8a (unsourced eight-engineer threshold), 9a
(one-sided exclusion), 9b (dangling handoffs), 11a (benchmark trigger was a verdict). NITs: 12b
(manifest description a lossy subset), 12c ("Hence"), plus the cognitive-load attribution hedge.

**Mechanical output, iteration 1:** `validate` → "✓ Valid — no issues found", EXIT=0. `prettier
--check` → "All matched files use Prettier code style!", EXIT=0. `wc -l` → 196 / 179 / 166 / 159,
700 total. No `claude.description.long` warning.

**Weakest thing, not a formal finding (iteration 1):** the body at 196 lines was 66% longer than
`architecture-decision-making` (118) and 44% longer than `skill-engineering` (136), with the cost
concentrated in a six-column mode table whose widest source line was 496 characters. Addressed in
iteration 2 by the 6→4 fold; widest line now 410.

---

# Retrospective count sweep — 2026-08-28

**Run after the package passed at iteration 5**, against a standing check that came out of skill
2's gate:

> **Any sentence that counts anything is re-derived from the artefact it counts, on first review
> and after any edit near it. A count is never read for plausibility.**

The check exists because skill 2's gate found two count errors that repeated reading passes missed:
one introduced by a correct fix that changed a table from four rows to five while the stated rule
went off by one, and one "four of the five rows" that was three of five, sitting three lines below
the table it counted and present since the first draft. Neither was found by reading. Both were
found by counting.

This package is a prime candidate for the same failure: it went through five iterations of
compression, three of them explicitly trading characters, and counts are exactly what silently goes
stale when a sentence is shortened near a table.

**Result: 84 count-claims re-derived. 4 failures — all MINOR, none BLOCKER or MAJOR. Plus 1 NIT
observation. The worked example still agrees with the method as the body now states it.**

## Claims checked, by file

| File                                         | Claims re-derived |                            Failed |
| -------------------------------------------- | ----------------: | --------------------------------: |
| `SKILL.md`                                   |                39 |            2 locations, 2 defects |
| `references/worked-analysis.md`              |                12 |                                 0 |
| `references/qualitative-and-quantitative.md` |                 5 | 1 (+1 non-count finding surfaced) |
| `references/bias-and-evidence.md`            |                28 |                                 0 |
| **Total**                                    |            **84** |                    **4 findings** |

## Failures

**COUNT-1 (MINOR) — `SKILL.md` lines 188 and 199: "Two disagreements are live" and "both
disagreements", where the reference the sentence points at documents three.**

Re-derived from the artefact: `references/bias-and-evidence.md` carries `## Disagreement 1 — can
trade-off analysis be made rigorous?` (line 109), `## Disagreement 2 — can architecture
characteristics be prioritised?` (line 141) and `## Disagreement 3 — is "it depends" analysis or an
escape hatch?` (line 167). **Three, not two.** The research brief agrees: §4 has 4.1 rigour, 4.2
prioritisation and 4.3 "it depends", all presented as live.

The body reads "Two disagreements are live, both sides in `references/bias-and-evidence.md`", then
covers exactly two (_Rigour?_, _Prioritising characteristics?_). The References entry repeats the
undercount ("both disagreements"). A reader following the pointer finds a third disagreement the
body told them does not exist — and it is not filler: it carries the operational test that "it
depends" is analysis only if the speaker can name what it depends on, which is a rule this skill
would want.

This is the skill-2 shape exactly: a fluent sentence whose number disagrees with the artefact it
names. It survived five gates because "two disagreements" reads correctly and the body does discuss
two.

Fix is the author's choice: say "three" and add a clause for the third, or "the two that bear on
this method; a third, on 'it depends', is in the reference". Either resolves both locations.

**COUNT-2 (MINOR) — `SKILL.md` line 158: ">90% cost reduction" overstates the figure's scope.**

Brief §6.1: the Prime Video rebuild reduced **infrastructure** cost by "over 90%". The body at
iteration 1 read ">90% infrastructure cost reduction"; "infrastructure" was dropped when the row
was rewritten at iteration 2, and ">90% cost reduction" now reads as total cost. The number is
right; its referent is not. I passed this in four consecutive gates by reading it.

Fix: restore "infrastructure".

**COUNT-3 (MINOR) — `references/qualitative-and-quantitative.md` line 135: "The slide version is
two words: **compare like things.**"**

Re-derived from the artefact, which is the phrase itself: _compare like things_ is **three words**.
Inherited faithfully from the research brief, which also says "a two-word instruction" before
quoting a three-word phrase (§1.7) — so the brief carries the same error and the skill reproduced
it. Re-derivation catches it; reading does not, because the sentence is fluent and the phrase is
short enough to feel like two.

Trivial in consequence, and worth fixing anyway in a skill whose thesis is rigour about numbers:
"three words", or "the slide version is a three-word instruction".

**COUNT-4 (MINOR) — surfaced by re-deriving COUNT-3's neighbour: iteration-1 finding 1a was never
fully discharged.**

`qualitative-and-quantitative.md` line 101 still reads "the shared-service example loses five of its
eight dimensions once the real context is stated, **and the winner changes**." The count itself is
correct (verified below), but "the winner changes" is the exact overstatement raised as MINOR 1a at
iteration 1 — the brief supports "the decision criteria changes" and, via "seems justified …
However", that the apparent winner no longer holds, but never states the flip.

**This is my error, and it belongs in the record as one.** At iteration 2 I declared 1a discharged
on a grep for `winner flips|apparent winner|criteria change`. That pattern cannot match "the winner
changes". The body and `worked-analysis.md` were fixed and both now read "the apparent winner no
longer holds"; this third occurrence survived because my verification could not see it. A
verification pattern that cannot match the defect is not a verification — the same lesson the
standing check encodes.

Fix: the wording already used in the other two places — "and the apparent winner no longer holds".

## Observation, not a failure

**NIT — the bias catalogue's nine rows sum to 126, three lines below "155 recorded occurrences".**
`bias-and-evidence.md` states 155 occurrences across 12 architect-practitioners, then tabulates
anchoring 24, irrational escalation 20, bandwagon 19, confirmation 14, curse of knowledge 14,
optimism 13, IKEA 10, Parkinson's 10, law of the instrument 2 → **126**. Every individual count
matches the brief, and **the text never claims the table is exhaustive**, so nothing false is
asserted and this is not a failure. But 29 occurrences are unaccounted for by adjacency alone, and
this is precisely the geometry of skill 2's second error. Four words remove the inference: "of
which the nine most frequent". Noted for the author; the record should show it was counted rather
than assumed to reconcile.

Also checked and **passing**: the heading "MECE, as two independent tests" sits above a three-row
table. MECE genuinely has two tests; the third row is labelled **Currency** and is the authors'
separate freshness check, not a MECE test. No count is asserted about the table. Correct as
written.

## Confirmed passing — the 80 that held

Named rather than summarised, since the ask was a count of claims checked and not a general
assurance.

**`SKILL.md` (37 of 39 passed).** Two laws stated where two are claimed, plus Corollary 1 (brief
§1.1) · third law flagged to 2nd ed. ch. 27, content never stated · _Fundamentals_ 1st ed. ch. 1 ·
_Hard Parts_ ch. 2 for "no best practices" · "The four sections below" followed by exactly four
named · "all three, the third being the veto" over exactly three semicolon-separated conditions,
and "fails the third" does land on the reversibility condition · "about eight engineers" marked as
a rule of thumb, not presented as sourced · four modes as four bullets, four table rows and four
property bullets — all three artefacts agree · three numbered steps against brief §1.4 · _Hard
Parts_ ch. 2 and 15 · coupling has "one test" · "removes five of eight", re-derived against the
eight-item list in `worked-analysis.md` · _Hard Parts_ ch. 7 for disintegrators/integrators · "both
columns" over a two-column table · 155 occurrences · 12 architects · anchoring 24 · irrational
escalation 20 · bandwagon 19 · ArchUnit v1.5.0 / 2026-08-04 (verified against the GitHub API at
iteration 2) · "the other two" followed by exactly two metrics · Segment "140+ services and repos" ·
Prime Video "~5% of expected load" · MongoDB "~80% of users on defaults" · **"All four end the same
way" over a table with exactly four data rows — the skill-2 geometry, re-derived, correct** · "(B,
three scenarios)" matching the three rows in the worked example · the 2x threshold · ATAM dismissed
"in one sentence" · "2 of 10" and "7 of 10" · three References entries against three files on disk ·
_Hard Parts_ ch. 1 for the ADR template · _Fundamentals_ ch. 6 for Simian Army (outside the brief,
corroborated independently at iteration 2).

**`worked-analysis.md` (12 of 12 passed).** "six" entangled dimensions over exactly six named · "the
five things the book lists" over exactly five, matching brief §1.5 · "three axes" and "the three
dynamic axes" · "eight patterns on four dimensions" (brief §2 step 5) · "five-point ordinal scale"
over exactly five rating words · "eight dimensions" — counted from the list: heterogeneous code,
high code volatility, ability to version changes, dependency management, overall change risk,
performance, fault tolerance, scalability = 8 · "Five of the eight" · "Three were modelled" over a
three-row table · "After the first two … the third inverts it", and the third row is indeed the one
where the single service wins · "Four technical rows collapse into one either/or" — counted from the
block: sync advantage, sync disadvantage, async advantage, async disadvantage = 4.

**`qualitative-and-quantitative.md` (4 of 5 passed).** "MECE, as two independent tests" (see above)
· "five of its eight dimensions" · the static-coupling checklist's five numbered items against brief
§1.5 · lesson 146 dated 10 Oct 2022.

**`bias-and-evidence.md` (28 of 28 passed).** 12 architect-practitioners · 155 occurrences · all nine
bias counts individually against brief §5.1 (24, 20, 19, 14, 14, 13, 10, 10, 2) · "16 students and 20
practitioners" · "four participants" as a verbatim quotation · ATAM "nine-step, four-phase" · "27
credentialled evaluation methods" · "three European companies, 10 architects" · "intuition for 7 of
10, methodology for 2 of 10" · "top three most important characteristics" · the Vasa's two gun decks
where ships had one and cannons twice the usual size · Table 5-1's translations counted out: time to
market → three characteristics, user satisfaction → seven · all publication years.

## Worked example re-run against the method as the body now states it

This is the check that caught skill 2's first error and had never been applied here. The body's
method changed at iteration 4 (elicit-versus-import, "if nothing deletes, that is a finding", "the
matrix is one route"), and the worked example was not touched in that iteration — exactly the
situation where a reference silently stops matching its body.

**Verdict: it still agrees. One-to-one, in the same order.**

| Body, "then, in order" (lines 89–101)                                                        | `worked-analysis.md`                                              | Agrees |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------ |
| Make the option set MECE (ME, CE, recheck for arrivals)                                      | Step 3 — enumerate, drop the infeasible, then make survivors MECE | yes    |
| Rate in isolation, consolidate into ordinal words, read for correlations never a total       | Step 4 — same, with the "option 3 scored 17" counter-example      | yes    |
| Delete the dimensions context makes irrelevant                                               | Step 5 — five of eight deleted                                    | yes    |
| Model scenarios until one inverts the apparent winner                                        | Step 6 — three scenarios, the third inverts                       | yes    |
| Reduce to one business-language question, then fix the constraining dimension, iterate, stop | Steps 7 and 8, merged in the body                                 | yes    |

Three rules applied to the worked example's own output, the way skill 2's ADR was checked against
its rule:

- **"Model … until one inverts the apparent winner."** Applied to Step 6: three scenarios, the third
  reverses the ranking, and the stated stopping rule ("you stop when a scenario reverses the
  ranking, or when new scenarios stop changing it") is satisfied at exactly three. The body's ADR
  says "(B, three scenarios)" — same number. **Consistent.**
- **"Read the matrix for correlations, never for a total."** Applied to Step 4's output: it produces
  "in this system, X and Y move against each other" and explicitly rejects "option 3 scored 17".
  **Consistent.**
- **"Reduce to one 'which is more important?' question in business language."** Applied to Step 7's
  output: "Which is more important, a guarantee that the credit approval process starts immediately,
  or responsiveness and fault tolerance?" — no technology name, which is the test the reference
  itself states one line later. **Consistent.**

The two iteration-4 body additions were checked against the reference specifically, being newer than
it: **elicit versus import** is already articulated in Step 1 ("it licenses a room of people who know
the system. It forbids importing a dimension list from a book, this one included"), so the body named
an idea the reference already carried; **"if nothing deletes, that is a finding"** is not exercised by
the worked example, which is the deleting case, but is not contradicted by it.

One asymmetry, not a disagreement: the reference has nine steps (0–8) and the body's ordered list has
five bullets. The body omits Step 0 (refuse the generic question) and Step 3's enumerate-and-drop.
Neither is orphaned — Step 0's content is carried by "your entanglements, not a canon", and Step 3's
product is required by the ADR template's Context line ("what was ruled infeasible, and why"). The
reference going deeper than the body is the intended relationship.

## Disposition

Four MINOR findings, all in the author's hands; none is a BLOCKER or MAJOR and none invalidates the
iteration-5 PASS. COUNT-1 is the one I would fix first: it is the only one where a reader is told
something the package itself disproves one file away. COUNT-4 is the one I am accountable for.

Residual totals after this sweep, superseding the iteration-5 line: **5 MINOR** (1 cross-package and
open at publish, 4 new here) **and 7 NIT**.
