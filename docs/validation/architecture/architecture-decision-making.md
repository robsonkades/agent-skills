# Validation — `architecture-decision-making` v2.0.0

**VERDICT (iteration 3, confirmatory): PASS — 0 BLOCKER, 0 MAJOR, 0 MINOR, 0 NIT.**

The iteration-2 PASS stands and is strengthened. The four Phase 4 fixes and two undersells introduced
**no new defect**, and iteration 2's open NIT-6 is closed as a side effect. **The package is clean;
it goes to Phase 5.**

Scoped as commissioned: the four checks asked for, the mechanical set, and nothing else. **The routing
suite was not re-run.** The description is byte-identical to the string I cleared 28/28 — 1017
characters, 1019 bytes, six triggers, identical between `SKILL.md` frontmatter and `skill.yaml` when
parsed — so the 28/28 result carries forward unchanged and re-running it would have bought nothing.

| Iteration | Verdict  | BLOCKER | MAJOR                          | MINOR | NIT |
| --------- | -------- | ------- | ------------------------------ | ----- | --- |
| 3         | **PASS** | 0       | 0                              | 0     | 0   |
| 2         | **PASS** | 0       | 0                              | 0     | 1   |
| 1         | **FAIL** | 0       | 1 (ADR016 in the gate, §MAJ-1) | 2     | 5   |

---

### 1. The F1 generalisation does not over-claim, and the `technical-debt-decisions` exemption is not silent

> **A handoff is an instruction, not a fence** — a boundary stated only as a prohibition is one you walk
> through under a deadline. **Same split wherever the request is compound**: cap the list under
> `architecture-characteristics` and carry one named characteristic back as a scenario; deliver the
> refusal under `engineering-communication` and file the rejected record here.

Tested against all five bullets it closes:

| Bullet                            | Is it a handoff?           | Is the rule true of it?                                                                                                                             |
| --------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Too small for this to matter"    | No — it routes to no skill | Vacuous, and consistent anyway: "the commit message is the record" is itself an instruction, and F2 reinforces it                                   |
| `architecture-characteristics`    | Yes, compound-capable      | ✓ split given in the generalisation                                                                                                                 |
| `architecture-trade-off-analysis` | Yes, compound-capable      | ✓ split given inline in the bullet ("do the comparison under ATA, return here for the record, and say which half you are doing")                    |
| `engineering-communication`       | Yes, compound-capable      | ✓ split given in the generalisation                                                                                                                 |
| `technical-debt-decisions`        | Yes, but **not compound**  | ✓ excluded by the rule's own scope clause, not by silence — and its bullet is already phrased as an instruction ("the distinguishing question is…") |

The exemption is sound on the merits, not just on wording: a shortcut with a repayment plan either has a
status lifecycle and a supersession or it has a backlog item. Those are **mutually exclusive homes**, so
there is no compound request to split — unlike compare-then-record, cap-then-scenario, or deliver-then-file,
where both halves are genuinely wanted. The qualifier "wherever the request is compound" does exactly the
work needed, so the general rule has no silent exception under it.

**And the author's own caught error is correctly resolved, not merely patched.** The first draft's "the
other two" over a list of four handoffs is gone, and the fix was to **claim no count at all** rather than
to correct the number — which is the more durable repair, because the bullet list can now grow without
stranding an arithmetic claim above it.

### 2. Class N's delivery move does not blur N and S, and keeps the classification falsifiable

> **N — nothing beyond the commit message.** When a process mandates a record for an N-class decision,
> write the **S** form and say inside it that the decision is N-class and why.

No contradiction with the table, which is untouched: N's "What the record must carry" is still "nothing —
the commit message names the choice", and that remains the statement of what the decision **earns**. The
new clause governs a different variable — what you do when an **external process overrides** the earned
amount — and it is explicitly conditional ("When a process mandates").

The four-class distinction stays falsifiable, and the clause is the reason. The discriminator is the
table's first column, the cost of undoing it after six months, which is unchanged; and the instruction
requires the record to **name itself N-class and say why**, so an N record written in S clothing is still
distinguishable from a genuine S at a glance. The obvious failure mode — a reader borrowing the S shape
and then re-classifying as S — is pre-empted by the same clause that creates the case.
`writing-the-record.md` line 73 still maps four reversibility classes onto four record classes, one to one.

### 3. The `adr-log` fact survives, and nothing dangles where the clause was

`grep -rn "adr-log\|listed twice"` returns exactly one hit: `evidence-and-tooling.md` line 64, the tool
table row, carrying the fact in full — "Dormant. adr.github.io lists it **twice** — once as MADR tooling,
once under 'Unmaintained tooling'". Zero hits in `SKILL.md`. The paragraph it was cut from reads cleanly:
adr-tools, log4brains and adr-manager, then "All read 2026-08-28" — no orphaned semicolon, no dangling
scope, and no number was asserted over the list, so shrinking it from four tools to three strands nothing.
The tool is never recommended in either file, so removing it from the headline paragraph costs no state.

### 4. Counting check — 34 claims re-derived on what moved, 0 discrepancies

Gate-critical set first, all re-derived from the artefact:

- **Two gated rules against "Zero on both"** — Metric names ADR010 and ADR013 and only those; Threshold
  says "Zero on **both**", and "each is a broken reference rather than a matter of degree" is true of each.
- **Both Compliance lines name two rules and agree** — `SKILL.md` line 170 and `writing-the-record.md`
  line 44, identical rule pair.
- **ADR016 appears at no gate site.** Four hits total: the Metric's exclusion sentence, the reference
  table row marked `(MADR)`, and the two prose lines explaining why it is out. None of them gates.
- **The 9 / 15 / 17 reconciliation still holds.** Table re-counted: 11 pipe-leading lines = header +
  separator + **9 data rows**; IDs 2+2+3+1+2+1+1+1+2 = **15** distinct, none repeated, none missing
  between 2 and 17 except 1 and 9; 15 + 2 = **17**.
- **`grep -rn "all three"` → no matches.** Still.

New material: "Two more things the record above does" governs exactly two; "only one of them belongs
inside the record" is true (placeholder in, coaching out); "Four classes" and "cuts across all four"
unchanged at four; the F1 generalisation asserts no count; the worked record's figures are untouched in
both renderings. Nothing the new paragraphs touch carries a stranded number.

**Iteration 2's NIT-6 is closed, and closed better than I proposed.** The discriminator now reads
"Fifteen bear on a record's **body and its cross-references** … ADR001 (title format) and ADR009
(filename matches the ADR number) are omitted: **both check how a record is named**, and naming is a
repo convention this skill does not teach." That is true of both omissions — ADR001 checks title format,
which is naming — where my own suggested wording only gestured at it. The arithmetic is unchanged and
still exact.

### 5. Mechanical — all pass

```
validate  → ✓ Valid — no issues found          prettier → all files use Prettier code style
SKILL.md 204 lines, frontmatter ends line 16 → body 188, under the 205 cap
references: writing-the-record 200 · templates-and-lifecycle 189 · evidence-and-tooling 160   (140–200 ✓)
description identical, 1017 chars / 1019 bytes, unchanged from iteration 2, 7 under the threshold
version: 2.0.0 ✓        grep -rni "best practice" → NO MATCHES
```

`registry:build` and `verify` deliberately not run; nothing under `skills/` was edited by me.

### Residuals at PASS, updated

NIT-6 is **closed**, so nothing from my findings remains open. Three standing items carry forward
unchanged and none is a defect in this package: the **`engineering-communication` boundary** is still
knowingly unguarded on both sides and its natural fix is EC's exclusion list, not ADM's; the description
sits **7 characters** under the threshold, so any future trigger is a trade rather than an addition; and
**v1.0.0 is still unrecoverable** because the suite remains uncommitted — commit it before the next gate
in this series. Everything under iteration 1's "What I could not verify" stands, correctly hedged in the
package and load-bearing on nothing.

---

# Iteration 2 — preserved unedited

**VERDICT (iteration 2): PASS — 0 BLOCKER, 0 MAJOR, 0 MINOR, 1 NIT.**

The gate rule is zero BLOCKER and zero MAJOR. Both are zero. MAJ-1 is closed at all four sites and left
nothing stale downstream; MINOR-1 and MINOR-2 are closed; four of five NITs are taken and the fifth is
declined with a reason I accept and have written into residuals. **The package ships.**

One new NIT is introduced by this iteration's own fix and is recorded below (NIT-6). It is a gloss, not
an arithmetic error, and does not hold the gate.

Re-gate method: every changed region re-read against the artefact rather than against the author's
summary; the mdbook-lint 9 / 15 / 17 reconciliation re-derived independently from the live rule set;
the routing suite re-run from scratch on the new description and extended from 24 prompts to 28 to
probe the newly-introduced `ADR` token; every count the ADR016 removal could have stranded re-derived.

| Iteration | Verdict  | BLOCKER | MAJOR                          | MINOR | NIT |
| --------- | -------- | ------- | ------------------------------ | ----- | --- |
| 2         | **PASS** | 0       | 0                              | 0     | 1   |
| 1         | **FAIL** | 0       | 1 (ADR016 in the gate, §MAJ-1) | 2     | 5   |

---

## Every prior finding, discharged or not

| Finding     | Status                                        | Verified how                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MAJOR-1** | **CLOSED**                                    | All four sites re-read. See the section below — including the downstream check, which is the part that mattered                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **MINOR-1** | **CLOSED**                                    | Both failing prompts now land on a trigger, not on the subject line. Description 1017 chars / 1019 bytes, byte-identical across both files, 7 under the threshold. Six triggers, unchanged in count                                                                                                                                                                                                                                                                                                                                 |
| **MINOR-2** | **CLOSED**                                    | `writing-the-record.md` lines 42–45 now carry a `## Compliance` section inside the fenced record — "ADR010 and ADR013 on the pull-request check for `docs/adr`; the `supersedes ADR-006` link is set in this same change, not later." Two rules, consistent with MAJ-1's fix. Paid for by reflowing: the file is 196 lines, four **under** the ceiling it was sitting on, nothing deleted                                                                                                                                           |
| **NIT-1**   | **CLOSED**                                    | Both compressed clauses restored, in better places than v1 had them. `SKILL.md` line 69 now reads "Reverses on evidence — a driver changed, a scenario is now missed, a cost came in differently — never on a newer technology existing", restoring the triad inside the **O** bullet's existing parallel form. `writing-the-record.md` line 180 restores "Name the decision in one sentence, in the form 'we must choose how X'" and "with different drivers and different reversibility", keeping the Microsoft WAF corroboration |
| **NIT-2**   | **CLOSED**                                    | Line 140 prose is now "a year and a half to two years after it stopped being maintained". The author took the first of my two options and left the column header at "18 months on". That resolves it: the header is now the low end of a stated range and the `adr-tools` row's derived 21 months is the high end, so no single asserted point is contradicted by the evidence beneath it                                                                                                                                           |
| **NIT-3**   | **DECLINED**                                  | Accepted, and moved to residuals as a knowingly-unguarded boundary. Re-tested — see the routing section. The author's reason (no headroom after the MINOR-1 trade) is arithmetically true: 7 characters remain and the shortest honest clause is ~40                                                                                                                                                                                                                                                                                |
| **NIT-4**   | **CLOSED**                                    | Line 61 now reads "is `architecture-trade-off-analysis`' mode D — refusing to decide — wearing this skill's costume". Exactly the fix offered, and it matches ATA's own gloss of D                                                                                                                                                                                                                                                                                                                                                  |
| **NIT-5**   | **CLOSED**, and my wording correctly rejected | See the reconciliation check below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

## MAJOR-1 — closed at four sites, and nothing downstream is stale

I checked the removal the way a removal should be checked: not that ADR016 is gone from the gate, but
that everything which used to lean on a three-rule gate has been re-based on two.

| Site                                | Now reads                                                                                                                                                                                                                                                                                     | Correct?                                                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKILL.md` 106–109 (Metric)         | "Violations of ADR010 … and ADR013 … — both format-agnostic. ADR016, the two-options check, is MADR-only: it keys on the literal heading `## Considered Options`, so it is inert on the Nygard-shaped record below and is not in this gate"                                                   | ✓ Both applicability claims verified live in iteration 1 against the rule pages; ADR010 "applies to both formats", ADR013 format-agnostic, ADR016 "Applies to: MADR format only" |
| `SKILL.md` 114 (Threshold)          | "Zero on **both** … Zero because **each is a broken reference** rather than a matter of degree"                                                                                                                                                                                               | ✓ The justification is now true of every rule it covers — this was the half of MAJ-1 easiest to leave behind, and it did not get left behind                                     |
| `SKILL.md` 171 (record Compliance)  | "ADR010 and ADR013 on the pull-request check (above)"                                                                                                                                                                                                                                         | ✓ And now true of the Nygard-shaped record it sits inside, which is what made it false before                                                                                    |
| `writing-the-record.md` 45          | "ADR010 and ADR013 on the pull-request check for `docs/adr`"                                                                                                                                                                                                                                  | ✓ New section, and it agrees with `SKILL.md` rather than inventing a second rule list                                                                                            |
| `evidence-and-tooling.md` 98, 101–5 | ADR016 row de-bolded and marked `(MADR)`; prose: "ADR010 and ADR013 … are format-agnostic — which is why they, and only they, are in the gate in `SKILL.md`. **ADR016 is not** … On a MADR estate it is worth adding, as a different characteristic — comparison honesty, not re-openability" | ✓ And it fixes the second and third defects inside MAJ-1 at once: the mismatched characteristic is named as a _different_ characteristic rather than folded in                   |

**The Characteristic now matches what the surviving rules check, exactly.** "Re-openability — a
superseded record that never names its replacement, or a link to a record that no longer exists,
silently ends the chain the set exists to be." Those are ADR010 and ADR013 and nothing else. This
sentence was never wrong; it was the metric that had drifted past it, and the drift is gone.

**No stale three-rule claim survives anywhere.** `grep -rn "ADR016\|ADR010\|ADR013"` returns eight
hits across the package: five are the sites above, two are Backstage's own ADR013/ADR014 (a different
numbering scheme entirely, and unambiguous in context), one is the rules table. `grep -rn "all three"`
returns **nothing**. The ADR006 "(Nygard only)" marker I asked for in NIT-5 landed in the same table
row, so the package now marks format applicability on every rule that has one.

---

## The 9 / 15 / 17 reconciliation — re-derived independently, and it holds

The author is right that my NIT-5 wording would have introduced an error, and right about why: "the
nine that bear on governance (of seventeen)" counts rows against rules. The replacement reads:

> It ships seventeen ADR rules. Fifteen bear on a record's content and are grouped into the nine rows
> below; ADR001 (title format) and ADR009 (filename matches the ADR number, Nygard only) are omitted.

Re-derived from the table itself and from the live rule set, not from the author's report:

| Row                      |    IDs |
| ------------------------ | -----: |
| ADR002 / ADR007          |      2 |
| ADR003 / ADR008          |      2 |
| ADR004 / ADR005 / ADR006 |      3 |
| ADR010                   |      1 |
| ADR011 / ADR012          |      2 |
| ADR013                   |      1 |
| ADR014                   |      1 |
| ADR016                   |      1 |
| ADR015 / ADR017          |      2 |
| **9 rows**               | **15** |

15 distinct IDs, no ID repeated across rows, none missing between 2 and 17 except 1 and 9. 15 + 2 = 17.
Against the live rule index I fetched in iteration 1, the full set is ADR001–ADR017 with no gaps —
**seventeen**. The two omissions are named correctly and their descriptors are right: ADR001 is "Title
follows appropriate format for ADR type", ADR009 is "Filename matches ADR number (Nygard only)". **The
reconciliation is exact.**

---

## NIT-6 (new, introduced by this iteration's NIT-5 fix) — the reconciliation's arithmetic is exact but its discriminator is not

"**Fifteen bear on a record's content** … ADR001 (title format) and ADR009 (filename …) are omitted."
The sentence offers "bears on a record's content" as the reason the fifteen are in and the two are out.
It works for ADR009, which checks a filename. It does not work for **ADR001, which checks the title** —
and a title is content; the package's own worked record opens with one, and Nygard's own guidance on
titles ("short noun phrases") is quoted two files away.

Nothing is miscounted and nothing is hidden — both omissions are named outright, which is the part that
matters — but the stated discriminator does not discriminate. Fix, one clause: "Fifteen bear on a
record's body and cross-references and are grouped into the nine rows below; ADR001 (title format) and
ADR009 (filename matches the ADR number, Nygard only) are omitted as conventions this skill does not
teach." NIT only: it does not affect the gate, the rule list, or any number.

---

## The routing suite — re-run from scratch, extended to 28 prompts, 28 pass

Nothing carried over: the description changed materially and was re-judged clause by clause. Judged from
frontmatter alone, which is all an agent sees. New trigger run, six triggers as before:

> Use when nobody can say why the system is built this way, when the same decision is argued **or
> deferred** for the third time, when an accepted record is about to be edited in place, when every
> record says "accepted" and none says "superseded", **when nobody can say who may change a status**,
> or when a rejected proposal is being closed without a written reason.

**The two iteration-1 failures now land, both on a trigger rather than on the subject line.**

- **P16 "We're punting the monolith split to next quarter. Again — third time this year."** → "the same
  decision is argued **or deferred** for the third time". Near-verbatim. The widening is the elegant
  move here: it cost 12 characters instead of the ~50 a new clause would have cost, and "deferred for
  the third time" is a strictly better statement of the case than my proposed "deferred for the third
  sprint", because the failure is recurrence, not cadence.
- **P17 "Who signs off on architecture decisions here, and who can change one's status?"** → "when
  nobody can say who may change a status". The trigger is phrased epistemically and the prompt is a
  direct question, but it names the exact object — _who may change a status_ — and no neighbour
  description contains any of ownership, sign-off or status authority. Lands cleanly.

**Dropping T5 orphaned nothing, and I probed it harder than the trigger deserved.** "Review this
decision record" (consequences all upside) still reaches ADM on the subject line, which names the
artefact three times. The harsher variant — "our decision write-ups only ever list upsides", which
never says _record_ — also reaches it, on "Writing an architecture decision down". The detector itself
is untouched in the body, in both files (`SKILL.md` line 147's failure table and
`writing-the-record.md` line 50's "has not been reviewed; it has been advertised"). The trade is sound:
this was the one trigger a user essentially never types, because by the time consequences can be seen
to be all positive the record is already in hand and ADM is already open.

**The `ADR` token does not over-pull.** Four constructed probes, chosen against the three neighbours
named:

| #   | Prompt                                                                  | Should win                  | Result                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N7  | "Write an ArchUnit test that web doesn't depend on persistence."        | `architecture-testing`      | ✓ No ADR token; AT's description excludes "the decisions themselves … architecture-decision-making"                                                                               |
| N8  | "Our ADR says we use hexagonal — write a test that enforces it."        | `architecture-testing`      | ✓ borderline, recorded. The token sits in a subordinate clause; the prompt's verb is "write a test", which AT claims and ADM's verbs (earn, write down, supersede, refuse) do not |
| N9  | "We took a shortcut and I wrote an ADR for it. Is that the right home?" | either, safely              | ✓ ADM's exclusion names `technical-debt-decisions` and its body carries the distinguishing question (status lifecycle vs backlog item). No harmful route                          |
| N10 | "How do I tell the CTO the ADR we wrote is wrong?"                      | `engineering-communication` | ✓ EC's "bad news has to travel" is verbatim; ADM has no trigger for delivering a message, and "the recorded refusal" is artefact-scoped                                           |

The token buys a real upgrade at P7 — "Write the ADR for moving sessions out of the app server" is now a
**direct lexical hit** on "what earns an ADR" rather than the one-hop expansion it was — and at P15
("Nygard or MADR?"), which still passes on the subject line but with the acronym now present.

**Full result: 18 positives + 10 negatives = 28, all 28 route correctly.** Five positives (P8, P12,
P13, P14, P15) pass on the subject sentence with no trigger behind them — one more than iteration 1,
which is the price paid for converting two hard failures into trigger-backed passes. That is the right
side of the trade: a subject-line pass is a pass, and a missing trigger was not.

**NIT-3 re-tested and it still holds.** N10 and N4 ("I have to tell platform no on the shared-library
request without burning them") both go to `engineering-communication` on its own verbatim triggers. ADM's
T6 still requires "closed **without a written reason**", which is the artefact and not the act, and the
subject's "the recorded refusal" carries the same restriction. The boundary discriminates on every
prompt I can construct — but it discriminates by wording rather than by declaration, on both sides.
Residuals.

---

## The counting check, iteration 2

**41 count-bearing statements re-derived, with priority on everything the ADR016 removal could have
stranded. 0 discrepancies.** (Iteration 1 re-derived 138 across the whole package; this round re-derives
every claim in a changed region, plus every claim anywhere in the package that referenced the gate, plus
the description's own trigger count and length.)

| Region                                                             | Claims re-derived | Failed |
| ------------------------------------------------------------------ | ----------------: | -----: |
| The fitness-function block and its two downstream Compliance lines |                11 |      0 |
| `evidence-and-tooling.md` rules table + prose                      |                12 |      0 |
| The description (triggers, characters, bytes)                      |                 4 |      0 |
| NIT-1/2/4 edit sites and their surroundings                        |                 8 |      0 |
| The worked record, both renderings, after reflow                   |                 6 |      0 |
| **Total**                                                          |            **41** |  **0** |

The ones worth naming, because a removal is where a stale count hides:

- **"Zero on both"** over exactly two rules; **"each is a broken reference"** over exactly two, and now
  true of both — this is the sentence that was carrying the falsehood, and it is the one the author
  re-based rather than merely trimming.
- **"Two more, both of which you write yourself"** (line 123) still governs two bullets;
  `evidence-and-tooling.md`'s "**The two checks** you write yourself" and `SKILL.md`'s reference bullet
  "the **two** fitness functions you write yourself" all still agree. A three-rule gate reduced to two
  is exactly the edit that could have collided with these, and it did not.
- **"The 'future' clause cuts across all four"** and "Four classes" — untouched, still four.
- **The worked record survived the reflow with every figure intact**, across both renderings: 9 changes
  in 12 months, three places, two of the last four incidents, 12k orders/hour, 7 rules with 4
  conditional, 4 queries, 40 ms p95 against 800 ms, assumption 20k/hour, trigger 15k/hour for three
  days. Re-compared line by line between `SKILL.md` 157–172 and `writing-the-record.md` 10–45.
- **Six triggers** in the new description, re-counted from the parsed string, not from the author's
  claim. **1017 characters, 1019 bytes**, byte-identical between `SKILL.md` frontmatter and
  `skill.yaml` when parsed with a YAML parser — the author's arithmetic on the four moves
  (−2, −46, +12, +44 = +8, from 1009) reproduces exactly.
- The author's "−2" for `record` → `ADR` is right and my "−3" was wrong: `a record` → `an ADR` is
  9 characters to 7, because the article changes with it. Re-derived.

---

## Mechanical output, iteration 2

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-decision-making
  C:\git\agent-skills\skills\architecture-decision-making
  5 files
✓ Valid — no issues found

$ npx prettier --check "skills/architecture-decision-making/**/*.{md,yaml}"
All matched files use Prettier code style!

$ wc -l
  203 SKILL.md            (frontmatter ends line 16 → body 187, under the 205 cap)
  159 references/evidence-and-tooling.md      (140–200 ✓)
  189 references/templates-and-lifecycle.md   (140–200 ✓, untouched this round)
  196 references/writing-the-record.md        (140–200 ✓, was 200 — reflowed, nothing deleted)

description → identical, 1017 chars / 1019 bytes, 7 under the 1024 threshold
version: 2.0.0 confirmed in skill.yaml line 4
grep -rni "best practice" → NO MATCHES
grep -rn "all three" → NO MATCHES
```

`npm run registry:build` and `npm run verify` deliberately not run, per the commissioning instruction.

---

## Residuals at PASS

1. **NIT-6 is open and does not block.** One clause in `evidence-and-tooling.md`; take it whenever that
   file is next opened.
2. **The `engineering-communication` boundary is knowingly unguarded, on both sides.** ADM's description
   does not name EC in its exclusion list and EC's does not name ADM. This is a **deliberate, priced
   decision**, not an oversight: the MINOR-1 trade left 7 characters and the shortest honest clause is
   about 40, and every prompt I can construct routes correctly on wording alone (N4, N10, P6, T6). The
   item belongs to whoever next opens `engineering-communication` with headroom — the natural home for
   the fix is EC's exclusion list ("…, or the decision record and its status (architecture-decision-
   making)"), not ADM's, since EC is the skill that claims the act while ADM has narrowed to the artefact.
3. **The description now sits 7 characters under the threshold.** Any future trigger addition is a
   trade, not an addition. Worth saying out loud in the package's own record, because the next author
   will not know it without measuring.
4. **v1.0.0 remains unrecoverable and the suite remains uncommitted.** Unchanged from iteration 1 —
   `git ls-tree HEAD skills/` still holds 21 packages and this is not one of them. The regression check
   in iteration 1 was reconstructed from the brief's §9 quotations and should not have to be. Commit the
   suite before the next gate in this series.
5. **Everything under "What I could not verify" in iteration 1 stands unchanged** — the 42010 clause
   text, both editions of _Fundamentals_, and the five studies' full texts. All are correctly hedged in
   the package and none is load-bearing on an unhedged claim.

---

# Iteration 1 — preserved unedited

**VERDICT (iteration 1): FAIL — 0 BLOCKER, 1 MAJOR, 2 MINOR, 5 NIT.**

The gate rule is zero BLOCKER and zero MAJOR. One MAJOR is open, so the package returns to the author.
The rework is otherwise strong: all three logged cross-package defects are closed, all three
attribution BLOCKER probes pass against the primary sources, and the trade-off and honest-standing
sections are the best in the suite so far. The MAJOR is one rule in one fitness function, verified
against the package's own cited source.

Validator did not write the skill. All five files read in full; the research brief (807 lines) read in
full before any claim was judged; the prior gate records for `architecture-trade-off-analysis`,
`architecture-characteristics` and `architecture-coupling-and-quanta` read for severity calibration;
nine neighbours' descriptions read for the routing suite. Every tool fact re-verified live against the
GitHub REST API and the projects' own pages, and the two attribution BLOCKERs re-verified verbatim
against the Cognitect post, the Joel Parker Henderson template file and Fowler's IEEE Software PDF —
not taken from the author or the brief.

| Iteration | Verdict  | BLOCKER | MAJOR                          | MINOR | NIT |
| --------- | -------- | ------- | ------------------------------ | ----- | --- |
| 1         | **FAIL** | 0       | 1 (ADR016 in the gate, §MAJ-1) | 2     | 5   |

---

## The three logged defects — all closed, quoted

Greped, not eyeballed; both descriptions parsed with a YAML parser and compared programmatically.

| #   | Required                                                                                                                                                                                                                                  | `SKILL.md` frontmatter | `skill.yaml`           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------- |
| 1   | `"comparing alternatives only on the forces that differ,"` removed                                                                                                                                                                        | **CLOSED** — 0 matches | **CLOSED** — 0 matches |
| 2   | `", or the method of analysing the trade-off itself — MECE option sets, qualitative versus quantitative analysis, resisting evangelism (architecture-trade-off-analysis)."` appended verbatim after `(pattern-selection-and-composition)` | **CLOSED** — exact hit | **CLOSED** — exact hit |
| 3   | `"must be scalable"` / `"must be maintainable"` / `"when two options are being argued on taste"` gone from the description                                                                                                                | **CLOSED** — 0 matches | **CLOSED** — 0 matches |

Defect 1 also does not survive anywhere in the package, in any costume: the procedural form the brief
flagged as at-risk (§9.3, "Using drivers to shortlist" steps 2–4) is gone and replaced by an explicit
hand-back — `writing-the-record.md` line 102: _"Ranking drivers, striking the ones on which the options
do not differ, and reading a comparison matrix are `architecture-trade-off-analysis`' method, not this
skill's."_ Defect 3 is closed at the reference level too: the scenario table's left column was rewritten
from adjectives to absences ("no load, no dimension, no limit"), so it teaches the scenario form without
re-claiming the naming that belongs to `architecture-characteristics`.

Description identity: parsed and diffed programmatically. Identical except the trailing newline that the
`>` / `>-` split produces — which is the house convention in all four shipped siblings. 1009 characters.

---

## The commissioned probes, answered first

**Probe 2 — attribution. ALL THREE PASS, verified against the primary sources rather than the brief.**

- (a) I fetched the Cognitect post live. It does **not** contain "What becomes easier or more difficult
  to do because of this change", and does **not** contain the word "rejected". I fetched the Joel Parker
  Henderson `decision-record-template-by-michael-nygard/index.md` live: it contains both. `SKILL.md` line
  82 says exactly this — _"'What becomes easier or more difficult to do because of this change?' is Joel
  Parker Henderson's phrasing, not Nygard's, despite being quoted as his nearly everywhere"_ — and gives
  Nygard's own rule instead. `templates-and-lifecycle.md` §"The misattribution" carries the same split at
  length. Nothing is backwards.
- (b) Nygard's post names proposed / accepted / deprecated / superseded and nothing else. `SKILL.md` line
  80: _"Nygard's own statuses are four: proposed, accepted, deprecated, superseded. `rejected` is not
  his"_, then credits MADR, AWS and Henderson and says "teach five values by all means, but say you are
  teaching an accretion". `writing-the-record.md` line 151 repeats it where the rejected record is taught.
- (c) I read the Fowler PDF page by page. Page 4, verbatim: _"At a fascinating talk at the XP 2002
  conference …, Enrico Zaninotto, an economist, analyzed the underlying thinking behind agile ideas …
  his comment that irreversibility was one of the prime drivers of complexity … one of an architect's
  most important tasks is to remove architecture by finding ways to eliminate irreversibility in software
  designs."_ No Bezos, no doors, anywhere in the article. `SKILL.md` lines 74–76 reproduce the split
  exactly and close with _"Do not attribute doors to Fowler, or irreversibility to Amazon."_
  `writing-the-record.md` lines 75–80 carry the same, independently worded. Not blended anywhere.

**Probe 3 — 42010. PASS.** Clause numbers used are 5.2.12, 6.10, 6.10.1, 6.10.2 and clause 1 Scope —
exactly the set the brief verified from the Contents page, no others invented. The framing is correct in
both files: `SKILL.md` line 194, _"ISO/IEC/IEEE 42010:2022 is not a rival to the ADR … An ADR set is one
conforming way to satisfy 6.10"_; `templates-and-lifecycle.md` line 160 the same, plus the Scope quotation
and the sourcing caveat _"The clause text itself is paywalled and was not read; only Scope, Foreword and
Contents are verbatim here."_ Nothing from inside 6.10 is quoted, per the brief's instruction. The
ThoughtWorks radar trap is handled too — "last appearing in May 2018 … citing it as one is wrong".

**Probe 4 — tool state. Verified live, one at a time. All the author's rows check out; the MAJOR is
elsewhere in the same block.**

| Claim in the package                                                 | Verified against                                        | Result                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| mdbook-lint v0.16.1, released 2026-08-27, last commit the same day   | `releases/latest` + repo API                            | ✓ `v0.16.1`, `2026-08-27T20:45:00Z`; `pushed_at 2026-08-27T20:37:33Z`           |
| created 2025-08-04, pre-1.0, 29 stars, "a gate on one maintainer"    | repo API                                                | ✓ `created_at 2025-08-04T01:27:18Z`, `stargazers_count 29`, `archived: false`   |
| `adr-tools` no release since 3.0.0 on 2018-07-25, issue #94 open     | issues API                                              | ✓ "Still maintained?", `state open`, `created_at 2020-03-29T16:05:18Z`          |
| `log4brains` issue #150, "84 critical vulns", open since 2025-10-29  | issues API                                              | ✓ title verbatim, `state open`, `created_at 2025-10-29T12:18:59Z`               |
| ADR010 / ADR013 / ADR016 semantics                                   | `joshrotenberg.com/mdbook-lint/rules/adr/`              | ✓ all three worded as the package states — but see MAJ-1 on ADR016              |
| **"ADR Guard" cannot be shown to exist**                             | `api.github.com/search/repositories?q=adr-guard`        | ✓ 13 results, none matching; only `adr-guardian` (1★) and `adr-guard-hero` (0★) |
| Backstage 15 numbered records, ADR013 2021-12-21 → ADR014 2024-11-29 | contents + commits API on `docs/architecture-decisions` | ✓ `adr001`–`adr015` + template + index; ✓ both first-commit dates exact         |

No dead or archived tool is recommended without its state. `adr-tools`, `log4brains`, `adr-manager`,
`adr-log`, `pyadr`, `adr-viewer`, `adr-j`, `structured-madr`, `adrkit`, `gwleclerc/adr` and `git-adr` all
carry a state wherever they are named, and none of the dormant ones is offered as a recommendation.
**"ADR Guard" appears twice and is refused both times** — `SKILL.md` line 132 ("could not be shown to
exist; do not reach for it") and `evidence-and-tooling.md` line 78 ("Treat it as not verified to exist and
do not name it in a recommendation"). Never a recommendation.

**The `adr-log` double-naming is not an internal inconsistency.** It appears once in `SKILL.md` line 136
and once in the `evidence-and-tooling.md` table, and both say the same thing: adr.github.io lists the tool
twice, once as MADR tooling and once under "Unmaintained tooling". The package names it as an example of a
tool whose own catalogue contradicts itself, never as a tool to use.

**Probe 5 — the `engineering-communication` boundary. PASS in the body, thin in the description.** Every
place the package touches refusal, it stops at the artefact. `SKILL.md` line 43: _"The refusal has to be
delivered rather than filed — `engineering-communication` owns the conversation, the escalation and the act
of saying no. This skill owns only the artefact: a rejected proposal closed with a written reason and a
status."_ `writing-the-record.md` line 152 repeats it and lists what is left: "a status, a reason, a date,
and a number the next proposal can be pointed at". EC's own triggers ("bad news has to travel", "being asked
to commit to something you believe is not achievable") do not overlap ADM's ("a rejected proposal is being
closed **without a written reason**"), so the two descriptions discriminate on the route-test prompts below.
The gap is that ADM does not name EC in its exclusion list and EC does not name ADM in its — NIT-3.

**Probe 6 — the reversibility split. PASS, and both sides support it.** ATA's description excludes "record
discipline or reversibility pricing (architecture-decision-making)"; its body line 182 says "Record
discipline and reversibility pricing belong to `architecture-decision-making`"; its disintegrators table
line 112 uses irreversibility as a mode-selection input, attributed "Fowler, _IEEE Software_ 2003 — not the
books' term", and its `qualitative-and-quantitative.md` line 163 gives the same Zaninotto credit ADM gives.
ADM's `SKILL.md` lines 28–30 state the split in exactly those terms: _"`architecture-trade-off-analysis`
reads irreversibility as a driver of how much analysis to do — its mode selection; this skill reads
reversibility class as a driver of how much record and rigour the decision earns. Same axis, same source
… two different outputs."_ Neither claims the other's half. ADM's four-class table even mirrors ATA's
four-mode table structurally (Cost / Wins when / Loses when, then price / fails / reverses), and its class
**O** correctly names ATA's mode D as the failure it can be mistaken for.

**Probe 8 — honest standing. PASS, and it is the strongest section.** `SKILL.md` line 183: _"No outcome
evidence exists that recording a decision improves any system outcome — defect rate, change cost, incident
count, time to onboard, rework avoided. Six searches found none."_ Falessi is "ISESE 2006, 50 postgraduate
students … improved the effectiveness of decisions under requirement change and left efficiency unchanged";
Bratthall is "PROFES 2000, 17 subjects … 'a significant improvement in correctness and speed' — **for one of
the two systems studied, not both**, and that split is the finding". Both correct. §4.1 is carried with all
four institutional holders named and the MADR `date` field named as the artefact standing against them, plus
"Neither side acknowledges the other and nothing has tested either". §4.5 is carried with all three answers,
the admission that the literature settles none, and an explicit pick ("the record below uses the AWS
answer") — which the worked record then honours ("owner moved it after review").

---

## MAJOR-1 — the one implementable fitness function gates on a rule that cannot fire on the record the package itself teaches

**Sites:** `SKILL.md` lines 107–118 (the fitness-function block), line 110 (Metric), line 115 (Threshold),
line 172 (the worked record's Compliance line); `references/evidence-and-tooling.md` lines 96 and 99.

The block gates on three mdbook-lint rules — ADR010, ADR013, ADR016 — at threshold zero. I fetched each
rule page from the package's own cited source, `joshrotenberg.com/mdbook-lint/rules/adr/`:

- **ADR010** — "ADRs with 'Superseded' status should reference the ADR that replaces them." **Applies to
  both formats** (a `Superseded by [ADR-0005](…)` line, or MADR's `superseded-by` frontmatter). ✓
- **ADR013** — links with a `.md` extension in ADR directories resolve to existing files. Format-agnostic. ✓
- **ADR016** — _"**Applies to: MADR format only**"_, and it keys on the literal heading `## Considered
Options`.

The package's own worked record is Nygard-shaped. `writing-the-record.md` line 28 heads the section
`## Alternatives considered`; `SKILL.md` line 164 renders the same field as `Alternatives`. Neither is
`## Considered Options`. So a team that follows the package's worked record and installs the package's
recommended gate ships a required check whose third rule is inert on every record they write — and
`SKILL.md` line 172 asserts the opposite in the record itself: _"Compliance ADR010/ADR013/ADR016 on the
pull-request check (above)"_, a claim that is false for one of the three on that very record.

The package knows the marker convention and applies it selectively: `evidence-and-tooling.md` line 97 marks
ADR015 / ADR017 "(MADR)" and line 96 leaves ADR016 unmarked and bolded as one of the load-bearing rules.
The brief does not carry the qualifier either (§6.1), so this is not a brief the author ignored — but the
qualifier is one click away on the page the package cites, and verifying it is what the fitness-function
form is for.

Two further defects fall out of the same block and are fixed by the same edit:

1. **The stated Characteristic does not cover ADR016.** "Re-openability — a superseded record that never
   names its replacement, or a link to a record that no longer exists, silently ends the chain the set
   exists to be." That justifies ADR010 and ADR013. "Considered Options lists two or more" is a different
   characteristic — comparison honesty — smuggled into a re-openability gate.
2. **The Threshold justification is false for one of the three.** "Zero because each is a broken reference
   rather than a matter of degree — a supersession with no replacement link is not a weaker link, it is no
   link." A record with one considered option is not a broken reference; it is precisely a matter of degree,
   and the rule's own minimum is configurable.

Why MAJOR and not MINOR: this is the package's **single** end-to-end implementable governance option, in
the block the house form treats as operational, and the failure is the exact one
`architecture-fitness-functions` triggers on — _"when a scanner ships a threshold that cannot fail"_. A
reader implementing it gets a green gate that proves nothing about the thing it claims to govern. Why not
BLOCKER: nothing outside this block depends on ADR016, the other two rules are correct and do the
supersession-link job the section promises, and the correct rule semantics are quoted accurately
everywhere — only the applicability qualifier is missing.

**Exact fix**, author's choice of three, in all four sites:

- **Cheapest.** Drop ADR016 from the Metric line, from the Threshold sentence and from the worked record's
  Compliance line, leaving ADR010 + ADR013 — which is what the Characteristic actually describes and what
  `evidence-and-tooling.md` line 99 already calls "supersession-link checking". Keep ADR016 in the rules
  table, marked "**(MADR)**" like its neighbours, as something available to a MADR estate.
- **Or keep it and say so.** Metric line → "…, and, **on a MADR-format set only**, ADR016 (Considered
  Options lists two or more)"; Threshold → "Zero on ADR010 and ADR013 because each is a broken reference
  rather than a matter of degree; zero on ADR016 where it applies, which is a different characteristic —
  comparison honesty — and worth saying so rather than folding it in." Then either add the MADR heading to
  the worked record or drop ADR016 from its Compliance line.
- **Or move the worked record to MADR headings**, which makes all three rules fire but costs the Nygard
  shape `templates-and-lifecycle.md` says the wild actually contains.

Independently of the choice, `evidence-and-tooling.md` line 96 must gain the "(MADR)" marker, and
`SKILL.md` line 115's "each is a broken reference" must stop covering three things when it describes two.

---

## MINOR-1 — under-triggering: two prompts the body answers well and the frontmatter does not advertise, on 15 characters of headroom

Six triggers against seven to eight in every shipped sibling, on the most-routed-to package in the suite
(**26** other packages name `architecture-decision-making` in a `SKILL.md`, `skill.yaml` or reference file —
re-derived; the commissioning figure of 27 does not reproduce, see the note below). The trigger run is:

> Use when nobody can say why the system is built this way, when the same decision is argued for the third
> time, when an accepted record is about to be edited in place, when every record says "accepted" and none
> says "superseded", when a record's consequences are all positive, or when a rejected proposal is being
> closed without a written reason.

The routing suite (below) finds the cut is mostly safe, because the subject sentence — "Writing an
architecture decision down so it can be re-opened on evidence: what earns a record, reversibility pricing
how much record it earns, superseding rather than editing in place, and the recorded refusal" — is broad
enough to catch any prompt that says "record", "decision", "ADR" or "write this down". What it does not
catch is a prompt that describes the **symptom** without naming the artefact. Two of those miss:

| Missed prompt                                                                             | Why it misses                                                                                                                                                   | Owned by ADM at                                                                                                    |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| "We're punting the monolith split to next quarter. Again — third time this year."         | No trigger matches; the prompt never names a record. Nothing in the description mentions deferral. Brief §8.3 lists this as a **clean, uniquely ADM** candidate | Class **O**'s "delay named as a legitimate option", and its failure "delay is used as the decision"                |
| "Who actually signs off on architecture decisions here, and who's allowed to change one?" | The description contains no word about ownership, approval, sign-off or who moves a status; its verbs are all about writing and superseding                     | `SKILL.md` lines 85–88 and `templates-and-lifecycle.md` §"who may move it" — three named answers, an explicit pick |

Four more pass only on the subject line, with no trigger behind them, and are recorded rather than hidden:
"we're documenting the architecture now that v1 shipped" (brief §8.3 candidate "written up after it
shipped"); "let's revisit the Kafka choice, RabbitMQ 4 is out" (§8.3 candidate "re-open because a newer
technology exists" — the skill's answer to this is one of its sharpest lines, and nothing advertises it);
"sign off on this 14-page decision document with class diagrams" (§8.3 candidate "more than two pages, or
contains class diagrams"); "Nygard or MADR?".

**What the fix costs, since that was asked.** The description is 1009 characters against the Claude
adapter's 1024 warning threshold (`packages/adapter-claude/src/index.ts:205`), i.e. **15 characters of
headroom**, and the shipped siblings run 1013–1022. The two misses cost more than that:

- `", when a decision is deferred for the third sprint"` — 50 characters.
- `", when nobody can say who may change a record's status"` — 54 characters.

So both need a trade, and there are two cheap ones available:

- **Free, and it also fixes the acronym gap.** "what earns a record" → "what earns an ADR" saves 3
  characters _and_ puts the string "ADR" into the description for the first time. The word does not appear
  anywhere in the routing surface today, and `keywords: [adr, decision-record]` in `skill.yaml` never
  reaches an agent — the Claude adapter's `layoutFor` writes only `description`, `name` and `license` into
  the installed frontmatter. Every "write the ADR for X" prompt currently routes by a one-hop expansion.
- **Cheap.** T5, "when a record's consequences are all positive" (44 characters), is the weakest of the six
  — it is a review symptom the body detects well but a user rarely types — and buys back most of one trigger.

I would take the deferral trigger over the status-ownership one if only one fits: deferral is the one with
no other home in the suite, while ownership questions have a plausible second reader in the body once ADM is
open. This is a MINOR, not a MAJOR: 22 of 24 route correctly, both misses fail to nowhere rather than to a
harmful neighbour, and the calibration precedent in this series (`architecture-coupling-and-quanta` MINOR-3)
treats a routing gap at this scale as MINOR.

---

## MINOR-2 — the worked record, the package's copy-paste target, has no Compliance line

`templates-and-lifecycle.md` line 85 argues the bridge: _"Richards and Ford's **Compliance** section is the
same idea under another name. Either way, naming the fitness function is this skill's job."_ `SKILL.md`'s
compressed sketch honours it — line 172 carries a `Compliance` line. The full worked record in
`writing-the-record.md` lines 10–43, which the brief calls "the best asset in the package" and which is the
thing a reader will actually copy, has Context, Decision, Alternatives considered and Consequences, and **no
Compliance or Confirmation section at all**.

So the package's flagship example omits the one field the package argues is its own job and its cleanest
handoff to `architecture-fitness-functions`. It is a two-line fix.

**Exact fix:** append to the fenced record, after Consequences:

```markdown
## Compliance

ADR010 and ADR013 on the pull-request check for `docs/adr`; the `supersedes ADR-006` link is set
in this same change, not later.
```

(Adjust the rule list to whatever MAJ-1 settles on.) `writing-the-record.md` is at 200 lines, the top of the
140–200 band, so two added lines need two removed — the "Anti-patterns in driver collection" section has the
slack.

---

## NITs

**NIT-1 — two v1 clauses compressed away rather than carried.** The brief §9.1 lists v1 workflow step 1
verbatim: _"Name the decision. One sentence, in the form 'we must choose how X'. If it takes a paragraph, it
is several decisions; split them, because they will have different drivers and different reversibility."_
v2 keeps only the diagnostic half, as the "One giant record" failure mode (`writing-the-record.md` line 183),
with the reason re-based onto supersession and the Microsoft WAF quotation added — better sourced, but the
constructive naming template ("we must choose how X") is gone and nothing replaces it. Similarly v1's
_"Re-open a decision on evidence: a driver changed, a scenario is now missed, a cost came in differently"_
collapses to `SKILL.md` line 71's "Reverses on a driver changing" — the scenario and cost limbs are lost.
Both are cheap to restore in a clause each.

**NIT-2 — "about eighteen months" against the only dated instance in the same table, which is 21 months.**
`SKILL.md` line 141 frames the failure-signature table as "about eighteen months after it stopped being
maintained" and the column header is "18 months on"; the `adr-tools` row then correctly derives 2018-06-26 →
2020-03-30 as "21 months of change against a frozen log". The 18 is a chosen horizon, not a wrong
derivation, but the two numbers sit four lines apart. Either say "a year and a half to two years", or make
the header 21 and let the evidence set the horizon.

**NIT-3 — `engineering-communication` is disclaimed in the body but not in the description.** `SKILL.md`
line 43 draws the line properly; the exclusion list names five neighbours and not EC, and EC's description
does not name ADM either. The route-tests show the two discriminate today, so this is not a coin flip — but
it is the one boundary the brief called "the contested one" and it is undisclaimed on both sides. There is no
headroom to add it without a trade (see MINOR-1); if a trade is made for MINOR-1, this does not also fit.

**NIT-4 — "mode D" is used without definition.** `SKILL.md` line 62: "a record that defers with no ending
event is mode D wearing this skill's costume". The taxonomy is ATA's and is not introduced in ADM. The
phrase "defers with no ending event" happens to be self-explaining and matches ATA's own wording ("Name what
you await and the event that ends the wait"), so nothing misleads — but "mode D" alone means nothing to a
reader who has not opened ATA. Fix: "is `architecture-trade-off-analysis`' mode D — refusing to decide —
wearing this skill's costume".

**NIT-5 — `evidence-and-tooling.md`'s rules table reads as exhaustive and is not.** Line 85 says "Its ADR
rules:" over nine rows covering ADR002–ADR017. mdbook-lint ships **seventeen**: ADR001 ("Title follows
appropriate format") and ADR009 ("Filename matches ADR number", Nygard only) are absent, and the
"(Nygard only)" qualifier on ADR006 is dropped where "(MADR)" is kept on ADR015/ADR017. Fix: "Its ADR rules,
the nine that bear on governance (of seventeen):" plus the ADR006 marker. The ADR016 marker is MAJ-1.

---

## The counting check

**138 count-bearing statements re-derived from the artefact each one counts, independently of the author's
report. 2 discrepancies, both already named above.** Method: every line containing a digit or a number-word
was extracted mechanically, then each claim was checked against the thing it counts — the list, table,
section headings or enumeration in question — or, for external numbers, against the primary source rather
than the brief.

| File                                    | Claims re-derived |                                                                   Failed |
| --------------------------------------- | ----------------: | -----------------------------------------------------------------------: |
| `SKILL.md`                              |                62 | 1 (MAJ-1's "each is a broken reference", over three things that are two) |
| `references/templates-and-lifecycle.md` |                21 |                                                                        0 |
| `references/writing-the-record.md`      |                25 |                                                                        0 |
| `references/evidence-and-tooling.md`    |                30 |                                  1 (NIT-5, "Its ADR rules" over 9 of 17) |
| **Total**                               |           **138** |                                                                    **2** |

**The author's four self-reported first-draft errors are all genuinely fixed, and I re-derived each rather
than accepting the report.**

- "**Three** names to refuse" (`evidence-and-tooling.md` line 77) over a list of three: ADR Guard,
  `endjin/adr-cli`, `GoogleCloudPlatform/adr-tools`. Correct.
- "**nearly three years** later" for ADR013 → ADR014: I pulled both files' commit histories. ADR013's first
  commit is 2021-12-21T08:15:16Z, ADR014's is 2024-11-29T12:52:35Z. That is 2 years 11 months 8 days — 35.3
  months. "Nearly three years" is right; "three years" would not have been.

Everything else re-derives. The ones worth naming because they are the easiest to get wrong:

- **"four searches" (line 38) and "six searches" (line 183) are different numbers on purpose and both are
  right.** Brief §7 gives four for the scale question; §3.3 gives six for the outcome question. A reader
  skimming would flatten them; the author did not.
- **21 months for `adr-tools`.** 2018-06-26 → 2020-03-30 = 21 months and 4 days. Correct, and the "9
  records" derives from `0001-…` through `0009-…`.
- **"15 records in about five and a half years — roughly three a year."** I listed the Backstage directory
  live: `adr001`–`adr015` plus a template and an index. 15 ÷ 5.5 = 2.7. Correct on both halves.
- **Nygard's four, the taught five, the four institutions, the three status answers, the two live
  disagreements, the "Three more things worth saying plainly"** — every one of these re-derives against the
  list it heads. The last is the easiest to get wrong and is exactly three: 42010, MADR's self-contradiction,
  and the Richards/Ford edition discipline.
- **The worked record is internally consistent across two files.** 9 changes in 12 months, three places,
  two of the last four incidents, 12k orders/hour, 7 rules with 4 conditional, 4 queries, 40 ms p95 against
  800 ms, assumption 20k/hour, trigger 15k/hour for three days — every figure matches between `SKILL.md`
  lines 158–173 and `writing-the-record.md` lines 10–43. The trigger sitting below the assumption threshold
  (15k against 20k) is deliberate early warning, not a contradiction.
- **MADR's section counts: the author corrected the brief and was right to.** Brief §2.2 asserts "seven more
  sections than Nygard, of which six are optional", but its own enumeration lists five optional sections. The
  package says "three it treats as required … and five optional ones" (`templates-and-lifecycle.md` line 72)
  and "Five optional sections is opt-in format cost" (line 89). Five is what the enumeration supports.
- **"one team under about eight engineers"** (`evidence-and-tooling.md` line 49) is quoted from ATA. It is
  byte-identical to ATA's `SKILL.md` line 40, flag included.

---

## The routing suite — 24 prompts, 22 pass, 2 fail

Judged from frontmatter descriptions alone, which is what an agent sees at selection time — and only from
those, since `keywords` never reach the agent (verified in `packages/adapter-claude/src/index.ts:152`).
Neighbour descriptions read in full: `architecture-trade-off-analysis`, `architecture-characteristics`,
`architecture-fitness-functions`, `architecture-coupling-and-quanta`, `engineering-communication`,
`technical-debt-decisions`, `pattern-selection-and-composition`, `layering-and-boundaries`,
`requirements-and-acceptance`.

### Positives — must reach `architecture-decision-making`

| #   | Prompt                                                                                   | Reaches?                                                                           |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| P1  | "Nobody remembers why we split billing into its own service."                            | ✓ T1 near-verbatim                                                                 |
| P2  | "This is the third time we've argued about gRPC internally."                             | ✓ T2 verbatim                                                                      |
| P3  | "I want to edit ADR-004 to say we changed our minds about the cache TTL."                | ✓ T3 verbatim — the sharpest thing ADM owns and nobody else touches                |
| P4  | "Our decision folder has 30 records and every one says accepted."                        | ✓ T4 verbatim                                                                      |
| P5  | "Review this decision record for me." (consequences all upside)                          | ✓ T5 verbatim                                                                      |
| P6  | "We're turning down the GraphQL proposal — I'll just close the ticket."                  | ✓ T6 verbatim                                                                      |
| P7  | "Write the ADR for moving sessions out of the app server."                               | ✓ subject line, via a one-hop ADR → "architecture decision" expansion; see MINOR-1 |
| P8  | "We picked Postgres over DynamoDB last week. Where does that go and what should it say?" | ✓ "what earns a record" + "Writing an architecture decision down"                  |
| P9  | "How much write-up does this deserve? It's a published API shape."                       | ✓ "reversibility pricing how much record it earns"                                 |
| P10 | "Every time someone leaves, the reasons behind our choices go with them."                | ✓ T1 semantically                                                                  |
| P11 | "Is this even worth recording? It's just which mapper library we use."                   | ✓ "what earns a record"                                                            |
| P12 | "We're documenting the architecture now that v1 shipped."                                | ✓ subject only — no trigger behind it (MINOR-1)                                    |
| P13 | "Let's revisit the Kafka decision, RabbitMQ 4 just shipped."                             | ✓ "re-opened on evidence" — subject only (MINOR-1)                                 |
| P14 | "Sign off on this 14-page decision document with class diagrams?"                        | ✓ subject only (MINOR-1)                                                           |
| P15 | "Should we use Nygard's template or MADR?"                                               | ✓ by elimination; no template signal in the description (MINOR-1)                  |
| P16 | **"We're punting the monolith split to next quarter. Again — third time this year."**    | **✗ FAIL — no trigger, no artefact named. MINOR-1**                                |
| P17 | **"Who signs off on architecture decisions here, and who can change one's status?"**     | **✗ FAIL — the description has no ownership or approval vocabulary. MINOR-1**      |
| P18 | "A CI check that fails when a superseded record has no link to its replacement."         | ✓ "superseding rather than editing in place"; AFF is the reasonable second reader  |

### Near-miss negatives — must reach a neighbour

| #   | Prompt                                                                                | Should win                          | Result                                                                                           |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| N1  | "Compare Kafka and RabbitMQ for our event bus and pick one."                          | `architecture-trade-off-analysis`   | ✓ ADM's new exclusion sends it there explicitly — **defect 2 doing its job**                     |
| N2  | "The requirement says the system must be scalable. Is that good enough?"              | `architecture-characteristics`      | ✓ ADM no longer claims the phrase — **defect 3 doing its job**                                   |
| N3  | "Two of us each have an internally consistent case and no agreed basis for choosing." | `architecture-trade-off-analysis`   | ✓ ATA's verbatim trigger; ADM's "argued for the third time" is about recurrence, not method      |
| N4  | "I have to tell platform no on the shared-library request without burning them."      | `engineering-communication`         | ✓ EC's "saying no … leaves a yes on the table"; ADM's T6 needs "without a written reason"        |
| N5  | "We're shipping now and cleaning up later. Should we write that down?"                | `technical-debt-decisions`          | ✓ ADM's exclusion names it, and ADM's body gives the distinguishing question (status vs backlog) |
| N6  | "Which pattern fits now that we know the forces?"                                     | `pattern-selection-and-composition` | ✓ disclaimed here                                                                                |

**Result: 22 / 24.** Both failures are P16 and P17, and both are MINOR-1. Four positives (P12–P15) pass on
the subject sentence alone with no trigger behind them and are recorded rather than hidden. All six
negatives route correctly, and two of them (N1, N2) are direct evidence that the logged defects are closed
in behaviour and not only in text.

---

## Checklist disposition

| Item                            | Result                                                                                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technical accuracy              | PASS except MAJ-1. All three attribution probes re-verified verbatim against primary sources; every tool fact re-verified live against the GitHub API and the tool's own docs                                                                                                    |
| Terminology fidelity            | PASS. Nygard's four statuses, the accretion of `rejected`, the JPH phrasing, Fowler/Zaninotto vs Bezos, 42010's clause numbers, MADR's required/optional split, Y-statements' missing lifecycle — all correct and correctly hedged                                               |
| No unconditional recommendation | PASS. Every tool named carries its state; the one recommendation carries "a gate on it is a gate on one maintainer"; the staleness check is "scheduled, never a gate" with a reason; "ADR Guard" is refused twice                                                                |
| Trade-off completeness          | PASS, and unusually well done. All four record classes get Wins/Loses **and** price/fails/reverses; the drivers table carries five push-on against five push-back; Nygard vs MADR, Y-statements, arc42 and the Henderson collection each get an adds **and** a costs             |
| Evangelism                      | PASS. "The counter-example belongs here too, or this section is advocacy" (line 150); "the ecosystem is thinner than its reputation"; "No outcome evidence exists"; Backstage carried as the counter-instance to its own failure table                                           |
| Governance realism              | **FAIL — MAJ-1.** Everything around it is right: baselined, changed-files-only, pull-request-sited with a reason the nightly alternative is rejected, and a stale-status check explicitly kept off the gate "because a gate that fails on someone else's inaction gets disabled" |
| Scale honesty                   | PASS. "No study establishes a team or system size below which records are net-negative", a named ceiling, a collaboration condition, an observed rate, and an explicit refusal to add a second unsourced number next to ATA's                                                    |
| Scope hygiene                   | PASS. All three defects closed at description **and** reference level; drivers-ranking handed to ATA in the reference body; the scenario table rewritten so it no longer claims AC's adjectives; the refusal narrowed to the artefact everywhere it appears                      |
| Trigger quality                 | 22/24 — MINOR-1                                                                                                                                                                                                                                                                  |
| Internal consistency            | **FAIL** — MAJ-1 (Compliance line vs the record's own headings; Characteristic vs Metric; Threshold justification vs one of three), MINOR-2 (Compliance argued but absent from the worked record), NIT-2 (18 vs 21), NIT-5                                                       |

`grep -rni "best practice"` over the package: **no matches.**

---

## What I could not verify — findings, not omissions

1. **v1.0.0 is not recoverable from git, so the commissioned regression check could not be run as
   specified.** `git log --all -- skills/architecture-decision-making` is empty; `git ls-tree HEAD skills/`
   holds 21 packages and ADM is not one of them; `git show HEAD:registry/skills.yaml` has no
   `architecture-decision-making` entry. The entire architecture suite, including the three shipped
   "house standard" siblings, is untracked working-tree material. **v1 was never committed.** I ran the
   regression check against the brief's §9 quotations instead, which quote v1 verbatim in fourteen places:
   twelve survive intact — the two Purpose failure modes, the "retrospectively captures the justification
   rather than the reasoning" rule, the "future" clause, the four-class reversibility structure and its
   "after six months" framing, the worked ADR-014 record with every number, "advertised not reviewed", the
   assumption/trigger/then block with its originality claim intact, all four "Keeping the set alive"
   bullets, all five failure modes including "Status never changes", the drivers-versus-wishes three-property
   test and its organisational-driver paragraph, and the scenario form. Two are compressed with a clause lost
   each (NIT-1). The two things the brief flagged as **at risk** — "Using drivers to shortlist" steps 2–4 and
   "The conflicts worth naming" table — are both gone, which is what should have happened. **The cuts are the
   ones the author claims and each is defensible.** Recommend committing the suite before the next gate;
   this check should not have to be reconstructed from a brief.
2. **"ADR is referenced by name in 27 other skills" does not reproduce.** I count **26** distinct other
   packages (`grep -rl` over `skills/` excluding ADM's own directory, deduplicated by package). Not a
   package defect — recorded so the figure is not carried forward unchecked.
3. **The 42010 clause text.** Paywalled for the researcher and for me. Only Scope, Foreword and Contents are
   verbatim anywhere. `templates-and-lifecycle.md` says so explicitly; `SKILL.md`'s condensed version does
   not repeat the caveat, but it quotes nothing from inside 6.10 either, so nothing rests on it.
4. **_Fundamentals of Software Architecture_, both editions.** No book text was read by anyone. The package
   cites "1st ed., ch. 19" through two agreeing note sets and says so, and marks the 2nd edition
   unverified twice — including the strongest available form, "everything this skill says about that edition
   is unverified". Correct handling; I did not improve on it.
5. **Buchgeher 2023, Falessi 2006, Bratthall 2000, Nogueira, Ahmeti.** Full texts unread by the researcher
   and unread by me. Every one carries its caveat in the package, and the two that matter most — Bratthall's
   one-of-two split and Falessi's unchanged efficiency — are stated in the form that weakens the package's
   own case, which is the right direction to err.
6. **`adr-manager`'s README wording and adr.github.io's double listing** were not re-fetched; both are
   secondary observations about a tool the package does not recommend, and nothing load-bearing rests on them.

---

## Residual

Nothing is deferred; this is iteration 1 and every item above is open. MAJ-1 must close for a pass. MINOR-1
and MINOR-2 should close in the same iteration — MINOR-1 needs a description trade, which is the only edit
here that requires a judgement call rather than a correction. All five NITs are cheap and I would take them,
but none blocks. **Nothing in the package requires restructuring and no reference file needs rewriting.**

---

## Mechanical output

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-decision-making
architecture-decision-making@2.0.0

  C:\git\agent-skills\skills\architecture-decision-making
  5 files

✓ Valid — no issues found
```

```
$ npx prettier --check "skills/architecture-decision-making/**/*.{md,yaml}"
Checking formatting...
All matched files use Prettier code style!
```

```
$ wc -l skills/architecture-decision-making/SKILL.md skills/architecture-decision-making/references/*
  204 SKILL.md            (frontmatter ends line 16 → body 188, under the 205 cap)
  154 references/evidence-and-tooling.md
  189 references/templates-and-lifecycle.md
  200 references/writing-the-record.md
```

All three reference files are inside the 140–200 band; `writing-the-record.md` sits exactly on the ceiling,
which is why MINOR-2's two added lines need two removed.

Description identity, parsed with a YAML parser and compared programmatically rather than eyeballed:

```
SKILL.md frontmatter description vs skill.yaml description
  → identical for 1009 characters; sole difference is the trailing newline produced by
    `>` (SKILL.md) vs `>-` (skill.yaml), which is the convention in all four shipped siblings
  → 1009 chars against the Claude adapter's 1024 threshold: 15 characters of headroom
```

```
$ grep -rni "best practice" skills/architecture-decision-making/
NO MATCHES
```

`version: 2.0.0` confirmed in `skill.yaml` line 4.

`npm run registry:build` and `npm run verify` deliberately not run, per the commissioning instruction and
because no file under `skills/` was edited in this iteration.
