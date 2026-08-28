# Validation — `architecture-coupling-and-quanta`

**VERDICT (iteration 4, final): PASS — 0 BLOCKER, 0 MAJOR, 0 MINOR, 0 NIT.**

_Iteration 3: FAIL — 1 MAJOR, 1 MINOR. Iteration 2: PASS (superseded by Phase 4). Iteration 1: FAIL —
1 MAJOR, 4 MINOR, 4 NIT._ All four iterations are preserved below, unedited. **The iteration 4 section
is the permanent record.**

| Iteration | Verdict                                                                    | BLOCKER | MAJOR                          | MINOR | NIT |
| --------- | -------------------------------------------------------------------------- | ------- | ------------------------------ | ----- | --- |
| 1         | FAIL                                                                       | 0       | 1 (quantum definition)         | 4     | 4   |
| 2         | PASS                                                                       | 0       | 0                              | 1 new | 0   |
| —         | _Phase 4 usage testing raised 2 MAJOR, 3 MINOR after the iteration-2 PASS_ |         |                                |       |     |
| 3         | FAIL                                                                       | 0       | 1 (F2 bound did not propagate) | 1 new | 0   |
| 4         | **PASS**                                                                   | 0       | **0**                          | **0** | 0   |

Cumulative across the document gate: **2 MAJOR raised, 2 discharged. 6 MINOR raised, 6 discharged. 4
NIT raised, 4 discharged.** Phase 4 raised F1/F2 (MAJOR) and F3/F4/F6 (MINOR); all five are
discharged. Nothing ships open. No file under `skills/` was edited by me in any iteration.

---

# ITERATION 4 — PASS

## 1. Independent site enumeration — I make it eight, and eight is complete

Enumerated from scratch with my own patterns before opening the author's table, on four passes:
`boot|start.*correct|stay correct|must have to`; `infrastructur|broker|cluster|operating system|runtime`;
every occurrence of `static (coupling|leg|edge|dependenc*)`; and every full line containing `static `.
That yields 25 mentions of the concept across the four files, of which **eight state what the leg
includes as a category** — the class that can mislead. All eight now carry the bound or a routing
sentence:

| ID     | Site                              | Treatment                                                                                                                                                                                 |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | `SKILL.md` L54, S reading         | "infrastructure the part cannot boot without **at a version it must track**"                                                                                                              |
| **A2** | `SKILL.md` L61/63, S row          | Unchanged — see §2                                                                                                                                                                        |
| **A3** | `SKILL.md` L70–71, S price        | "…are inside it **where their change obligation runs to the parts**"                                                                                                                      |
| **A4** | `SKILL.md` L85–87, two-leg para   | **Authoritative.** Criterion stated once + "Step 2 applies it; every other statement of the leg in this package is scoped by it"                                                          |
| **A5** | `SKILL.md` L94–98, step 2         | The operative test                                                                                                                                                                        |
| **A6** | `coupling-vocabulary.md` L82–85   | "**This states the scope of the term, not the test for an edge** — for that, see `SKILL.md` step 2 and the leg's definition above it"                                                     |
| **A7** | `coupling-vocabulary.md` L95–101  | "**Scope again, not the test:** a broker or cluster every part uses identically is inside this category and is still not an edge… `SKILL.md` step 2 decides that; this sentence does not" |
| **A8** | `coupling-vocabulary.md` L151–153 | "…without the rest of it **at a version it must track**"                                                                                                                                  |

**A6 is the site I missed at iteration 3 and the author found.** It is §2's paraphrase of _The Hard
Parts_' own definition, ten lines above A7, and the author is right that it is what a reader of §2
meets first — my iteration-3 grep pattern (`shared infrastructure`) could not match it because the
sentence says "everything the part needs in order to boot and be correct" without naming a category.
Recorded as my error; the lesson is that the concept has two vocabularies (categories, and
boot-and-correctness) and a pattern for one will not find the other.

**Three near-misses I considered and rejected, with reasons** — this is the part a third count is
worth doing for:

- `SKILL.md` L99, step 3: "The database sits inside each service's static coupling." An **instance**,
  and one that passes Ford's test — a schema's change obligation runs to its readers. Not a floorless
  category claim.
- `evidence-and-disagreements.md` L71: "The database is part of each service's static coupling, so
  everything bound to it is one quantum whatever the pipelines say." Attributed reportage —
  the bullet opens "**The _Hard Parts_ authors:** yes, by definition", inside disagreement 2.1. It
  reports a position the skill deliberately does not adopt wholesale. Correct as it stands.
- `coupling-vocabulary.md` L167: "a shared database, a shared domain library, or an event schema
  **with no compatibility policy** holds them in one quantum regardless." Three instances, each
  qualified, each passing the test.

**Conclusion: eight is complete and the number has converged.** Three independent enumerations —
mine at seven, the author's at eight, mine again at eight by different patterns — with the eighth
found once and confirmed once, and no ninth surfacing under a pattern set designed to catch the
category/boot-and-correctness split that hid it.

## 2. Does A4's criterion actually scope the other seven? — Yes, and the coordinator's A2 judgement holds

Each of the seven read cold, as an agent meets it:

- **A1, A3, A8** now carry the condition inline. An agent reading any of them alone gets the bounded
  rule without needing A4. No routing dependency at all.
- **A6, A7** carry a routing sentence rather than a restatement, which is the right call: repeating
  the criterion in a reference would create a second authority to drift from. Both name `SKILL.md`
  step 2 explicitly, and A6 also names "the leg's definition above it", so a reader who enters through
  the reference is sent to both. A7 goes further and works the actual F2 case — the broker — through
  to the answer, so it discharges the defect at the site that caused it rather than deferring it.
- **A5** is the test itself.
- **A2 is the only site whose correctness depends on how it is read**, and it comes out right. The S
  row's first column ("the other side's schema, library or infrastructure, at a compatible version")
  reads unbounded standing alone: a broker is infrastructure and you do track a client version. What
  saves it is the **second column** — "yes, and the obligation runs to every reader of the shared
  thing, not only this pair" — which is Ford's test stated as a property of the S reading. A broker
  every part uses identically fails that column, so the row does not classify it as S. A table row is
  meant to be read across, and read across it gives the right answer.

**So the coordinator's judgement — that a criterion stated once suffices — holds, and I am saying so
rather than hedging.** But state the reason precisely, because it is not the reason given: A2 is safe
because of its own second column, not because of A4's routing hook. A4's hook ("every other statement
of the leg in this package is scoped by it") covers A2 by construction, but an agent that reads only
the leftmost column of one row will not have reached A4. **Residual, recorded for a future editor:
column 2 of the S row is load-bearing for the F2 bound. Do not compress or soften it.** If it is ever
edited, A2 needs four words in column 1 ("at a compatible version it must track") to stand alone.

## 3. Rewrap integrity — clean. Verified against the artefact, not the author's diff

The rewrap script has corrupted the Uber blockquote twice in this package. Independent checks:

- **Blockquotes.** The package contains exactly **one** (`grep -rn "^>"`), the Uber quotation, and it
  is intact: "Networked monoliths can form, where services that appear to be independent all have to
  be deployed / together to safely perform any change." **Word-for-word against the live Uber post I
  fetched at iteration 1.** `grep -rn "^> .*> "` — the exact signature of both prior corruptions —
  returns nothing.
- **Code fences.** Balanced everywhere: `SKILL.md` 4 (two blocks), `measuring-the-unit.md` 2 (one
  block), the other two files 0. **Fenced content survived unrewrapped**, which was the real risk:
  the Fitness-functions block still holds its `Characteristic / Metric / Tool / Threshold / Site /
Confounders` column alignment and the ADR still holds its `Context / Decision / Consequences /
Compliance` alignment, both to the character.
- **Tables.** Every table row in every file has a pipe count identical to its own header row
  (`awk` per-table comparison, no mismatch). No row split, no column lost.
- **List markers.** Six numbered method steps `1.`–`6.` with no gap; four `- **S/D/B/U —` reading
  bullets; five parenthesised neighbours in the covers clause; four `- A **…**` bullets in
  `coupling-vocabulary.md` §4; two numbered garblings; four `### 2.x` disagreement subsections; four
  `## n.` sections in each of the two numbered references.
- **Content checksum.** Thirteen exact strings quoted in my iterations 1–3 reports re-grepped against
  the rewrapped files; twelve matched on the first pass. The thirteenth — _Fundamentals_' quantum
  wording — returned zero because it now exists only inside `coupling-vocabulary.md` §3's table with
  bold markers interrupting it, which is the deliberate book-attribution move, not rewrap damage. Its
  content is verified present.

**No rewrap defect.** The one genuine content change this round is the book-attribution move, and it
is handled well: the body keeps the rule and the one error to refuse ("**attributing the second to
_Fundamentals_ is wrong**"), names §3 in the same sentence for per-book wordings, sourcing strength
and the **unverified** 2nd-edition status, and keeps the `architecture-characteristics` compatibility
line. The body now carries **no verbatim book quotation at all** — it paraphrases as
"connascence-flavoured" and "coupling-flavoured" — so the secondary-sourcing caveat it dropped no
longer has anything in the body to govern, and `coupling-vocabulary.md`'s opening "Sourcing note that
governs the whole file" covers everything downstream in fuller form. The word "unverified" still
appears in the body, attached to the 2nd edition, pointing at the reference. Nothing was lost.

## 4. MAJOR-2 and MINOR-5 — both discharged

**MAJOR-2: DISCHARGED.** Eight of eight sites treated; A4 authoritative; the criterion stated once and
routed to, not restated eight times, so there is one thing to keep true. Honest standing's marking
correctly widened from "Step 2 bounds it" to "**The leg definition and step 2** bound it", which keeps
the self-attribution attached to the authority rather than to one step — consistent with how the
package marks the 0.8 threshold and the against case.

**MINOR-5: DISCHARGED.** My wording is at all three sites and **zero occurrences of either superseded
wording remain** (`grep` for "counts coincide", "count equals deployment unit count", and the
un-clause'd "each service owns its data" form). The author's account of why its probe-4 reasoning was
wrong is correct and worth preserving: it tested whether a bounded S enlarges the _class_ of
coinciding estates, and never tested the _sentence_ against an instance — T6 being an instance it
already held. That is the same error class as the count-claim failures this suite instituted the
counting check for: reasoning about a claim instead of re-deriving it against the artefact.

## 5. Counting check — 128 claims re-derived on joined text, 0 discrepancies

**The author's caveat is correct and I applied it.** A physical-line grep now lies: paragraphs are
joined before counting, because the rewrap splits bolded phrases across lines. Confirmed on the exact
near-miss reported — `**synchronous dynamic leg governs operational profile**` spans lines 87–88, so a
line-wise count of bolded legs returns 1 and the sentence "**The two legs** bound the region" looks
false. Joined (`awk 'BEGIN{RS="";FS="\n"}{gsub(/\n/," ")}'`), it returns exactly **2**.

| File                                       | Claims re-derived | Failed |
| ------------------------------------------ | ----------------: | -----: |
| `SKILL.md`                                 |                55 |      0 |
| `references/coupling-vocabulary.md`        |                28 |      0 |
| `references/measuring-the-unit.md`         |                21 |      0 |
| `references/evidence-and-disagreements.md` |                24 |      0 |
| **Total**                                  |           **128** |  **0** |

Re-derived mechanically on joined text: 2 bolded legs; 6 steps with the three ordinals ("steps 3 and
4", "step 5", "the leg definition and step 2") all resolving; 4 reading bullets; 5 covers-clause
neighbours; 2 garblings; 4 `§4` word-bullets; 3 measurement sections plus one "what has none" section
against the References bullet's "the three measurements in full … and what has none"; 4 disagreement
subsections against "the four live disagreements" and against the body's "two about the unit itself …
two more". **ADR re-derives unchanged and correct:** ten services named in Context against "Ten
deployment units, ten pipelines"; four brace groups `{orders, billing, refunds} {fulfilment, labels}
{checkout, pricing} {analytics}` holding 3 + 2 + 2 + 1 = **8** against "Eight of the ten"; "two
unplaced" = search + catalogue. All external figures unchanged from iteration 1, where each was
verified live against its primary source.

## 6. Line-length norms — the author's figures reproduce exactly under a stated rule

**My slicing rule, stated so it can be re-run:** all non-empty lines of `SKILL.md` **below the
frontmatter terminator**, including table rows and fenced blocks, no other exclusions.

| Package                            | n   | Mean      | Max     |
| ---------------------------------- | --- | --------- | ------- |
| `architecture-coupling-and-quanta` | 175 | **148.3** | **509** |
| `architecture-characteristics`     | 144 | 154.3     | 494     |
| `architecture-trade-off-analysis`  | 142 | 108.0     | 425     |

The author's reported 148 / 509 against 154 / 494 **reproduces to the decimal**. Conclusion intact:
narrower on the mean than the sibling it matches, fifteen characters wider on the max, and the max in
all three packages is a table row.

Two things worth recording, since this suite has twice had width figures that did not reproduce.
First, the figure is slicing-sensitive: excluding tables and fences gives 123.0 / 176 here against
121.1 for `architecture-characteristics` — the same verdict, different numbers, so **quote the rule
with the figure or the number means nothing**. Second, the suite has two width conventions, not one:
this package and `architecture-characteristics` sit near 148–154, `architecture-trade-off-analysis` at 108. This package matches the convention of the sibling it was built alongside. No finding.

## 7. Mechanical

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-coupling-and-quanta
✓ Valid — no issues found

$ npx prettier --check "skills/architecture-coupling-and-quanta/**/*.{md,yaml}"
All matched files use Prettier code style!

SKILL.md                                 230 lines, frontmatter ends L16 → body 214 / 220 cap
references/coupling-vocabulary.md        172
references/evidence-and-disagreements.md 194
references/measuring-the-unit.md         152
```

Descriptions untouched and byte-identical: `awk`-extracted from both files, 12 lines each, md5
`628765953f2dce0fca7c883974752392` on both, `diff` clean, folded length **1022 / 1024**. **Unchanged
since iteration 2** — same hash across three rounds, so no edit has disturbed the routing contract.

References band 152–194 against the suite's shipped 109–193; `evidence-and-disagreements.md` at 194 is
the largest reference in the suite by one line, unchanged this round.

**The cap question from iteration 3 is answered by the artefact.** The body went 220 → **214** with
content word-for-word preserved, so six lines of headroom now exist and the next fix does not need a
paired cut. The rewrap supplied the budget; the book-attribution move was taken on the merits anyway,
which is the right order — and my iteration-3 recommendation was that the paragraph was a précis of
material fully present in `coupling-vocabulary.md` §3, which the move confirms. **I withdraw the
iteration-3 concern that the cap was forcing routing cuts:** it was, and it no longer is.

## 8. Residual list — what ships

**0 BLOCKER, 0 MAJOR, 0 MINOR, 0 NIT.** Nothing open. Recorded for maintainers, none a finding:

| Item                                                                         | Note                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A2, S row column 2, is load-bearing for the F2 bound**                     | The row is safe because "the obligation runs to every reader" is Ford's test in the table. Do not compress or soften that cell; if it is ever edited, column 1 needs "at a compatible version **it must track**"                      |
| **N20** — "distributed monolith — twelve services that always ship together" | Coin flip with `enterprise-architecture-smells`; the priced cost of the EAS drop, small, unchanged since iteration 2                                                                                                                  |
| **All book sourcing is secondary**                                           | Unchanged and correctly disclosed; the governing note now lives once, in `coupling-vocabulary.md`'s header, and the body carries no verbatim book quotation to govern                                                                 |
| **Everything I could not verify**                                            | Unchanged from iteration 1 and listed there: no book text (O'Reilly 403s), _Fundamentals_ 2e chapter text, the El Emam rebuttal, D'Ambros effect sizes, Newman's taxonomy, the Weirich talk. Each gap is stated in the package itself |

Clear for Phase 5.

---

_The iteration-3 record follows, including its own top-matter. Read it as history._

**VERDICT (iteration 3): FAIL — 0 BLOCKER, 1 MAJOR, 1 MINOR, 0 NIT.**

_Iteration 2: PASS — 0 BLOCKER, 0 MAJOR, 1 MINOR. Iteration 1: FAIL — 0 BLOCKER, 1 MAJOR, 4 MINOR, 4
NIT._ All three iterations are preserved below, unedited.

**The MAJOR is F2's fix not propagating.** The coordinator's primary regression risk is real and
larger than posed: the bounding test landed at **one of four** statements of the static leg in
`SKILL.md` and **zero of three** in `coupling-vocabulary.md` — including the exact sentence Phase 4's
T6 quoted when it hit F2, which survives verbatim in both files. Everything else this iteration is
good work, and F1/F3/F4/F6 are all discharged cleanly.

| Iteration | Verdict  | BLOCKER | MAJOR                              | MINOR | NIT |
| --------- | -------- | ------- | ---------------------------------- | ----- | --- |
| 1         | FAIL     | 0       | 1 (quantum definition)             | 4     | 4   |
| 2         | PASS     | 0       | 0                                  | 1 new | 0   |
| 3         | **FAIL** | 0       | **1 (F2 bound did not propagate)** | 1 new | 0   |

Cumulative: 2 MAJOR raised, 1 discharged, 1 open. 6 MINOR raised, 4 discharged, 2 open. 4 NIT raised,
4 discharged. Phase 4 raised 2 MAJOR and 3 MINOR after my iteration-2 PASS; 1 MAJOR and 3 MINOR of
those are discharged here.

---

# ITERATION 3 — FAIL (superseded by iteration 4; preserved unedited)

Phase 4 report read in full before the package. All five files re-read. Every ordinal cross-reference
re-derived. Both regression risks answered against the artefact rather than the change list.

## MAJOR-2 — the F2 bound landed in one place; the sentence that caused F2 is untouched in both files

**This is regression risk 1, confirmed, and it is worse than "the reference was not updated in the
same edit."** The package states what the static leg includes in **seven** places. Step 2 is the only
one that carries the bound.

| #   | Site                              | Statement                                                                                                                                                                          | Bounded?                                                                   |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | `SKILL.md` L55, S reading         | "infrastructure the part cannot boot without"                                                                                                                                      | **No** — boot-requirement only                                             |
| 2   | `SKILL.md` L64, S row             | "the other side's schema, library or infrastructure, at a compatible version" / "the obligation runs to every reader"                                                              | Compatible, if the two columns are read conjunctively — which nothing says |
| 3   | `SKILL.md` L72, S price bullet    | "'static' … database, runtime and shared infrastructure **are inside it**"                                                                                                         | **No** — the unbounded rule, in the body                                   |
| 4   | `SKILL.md` L87, two-leg paragraph | "the **static leg governs deployability**: what must already be present, at a compatible version, for this part to boot and be correct"                                            | **No** — this is the definition of the leg, and it has no test             |
| 5   | `SKILL.md` L95–99, **step 2**     | Ford's question decides; categories are "where to look, not what counts"; "a broker or cluster every part uses identically is common ground"                                       | **Yes** — the fix                                                          |
| 6   | `coupling-vocabulary.md` L93–97   | "At quantum scale static coupling includes **the database, the runtime, the operating system and shared infrastructure** — anything the service must have to start and be correct" | **No** — and this is the sentence Phase 4 cited for F2                     |
| 7   | `coupling-vocabulary.md` L148     | "the static leg because nothing in the region can boot or stay correct without the rest of it"                                                                                     | **No**                                                                     |

Site 6 is decisive. Phase 4's T6 reached F2 by paraphrasing it almost word for word — _"on the
skill's strict reading, static coupling at quantum scale includes shared infrastructure, not only the
database and the library. A shared broker is an edge you must decide deliberately to include or
exclude"_ — and the sentence it paraphrased is unchanged. An agent holding all five files, as every
Phase 4 harness did, now meets **five unbounded statements and one bounded one**, and the five include
the definition of the leg (site 4) and the file the body routes to for the meaning of "coupled" (site
6). The body and its own reference contradict each other on the single question that produced F2:
site 6 says a broker the service must have to start is inside static coupling; site 5 says a broker
every part uses identically is not an edge.

Sites 1, 3, 4 and 7 are the same failure inside the body. Site 3 in particular is twenty-three lines
above step 2 and states the unbounded rule as a correction of a garbling, which is the most
authoritative register in the document.

**Why MAJOR and not MINOR.** It is the reopened form of a defect Phase 4 graded MAJOR, on the same
mechanism, reachable by the same route two of six agents already took. The fix as shipped works only
for an agent that executes the steps in order and never reads the definition paragraph, the S bullet
or the reference — and Phase 4 showed agents doing all three.

**Exact fix — one criterion, stated once and referenced, rather than restated seven times.**

1. **Site 4 (the definition of the leg) is where the test belongs.** "The **static leg governs
   deployability**: what one part must already have, at a compatible version, to boot and be correct
   — bounded by Ford's test, because a thing everyone needs identically forces no coordinated change
   and is common ground, not an edge."
2. **Site 6**, append one sentence: "That is the scope of the term, not the test for an edge: see
   `SKILL.md` step 2 — a broker or cluster every part uses identically is inside the category and is
   still not an edge, because its change obligation runs to nobody."
3. **Site 3**, one clause: "… database, runtime and shared infrastructure are inside it **where their
   change obligation runs to the parts**."
4. **Site 7**, one clause: "… without the rest of it **at a version it must track**".
5. **Site 1**: "infrastructure the part cannot boot without **and must track the version of**".
6. **Site 2** needs nothing if 1–5 land: the conjunction becomes readable once the criterion is stated
   in one place.

The whole fix is ~5 lines net across two files, and 1–5 are each a clause, so the 220-line cap is not
the obstacle here.

## MINOR-5 — the "against" case now exists in three places in two wordings, and neither is true

**My iteration-2 miss, and I am logging it as one.** I raised NEW-1 by grepping `Against:`, which
matched `SKILL.md` and `evidence-and-disagreements.md` and missed the third statement of the same
sentence in `coupling-vocabulary.md` §4, which uses no such label.

| Site                          | Wording                                                                                                                | State                                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKILL.md` L229               | "wherever each service owns its data **and no caller blocks on another**, the counts are equal"                        | NEW-1 fix applied                                                                                                                                             |
| `evidence-…` L93              | "each service owns its data **and no synchronous call spans two of them**, quantum count equals deployment unit count" | NEW-1 fix applied                                                                                                                                             |
| `coupling-vocabulary.md` L157 | "Where each service owns its own data the two counts coincide exactly and the word is redundant"                       | **Superseded pre-NEW-1 wording**, and it labels itself "the 'against' case in `SKILL.md`'s honest standing" while stating something `SKILL.md` no longer says |

**And the fixed wording is still one clause short — Phase 4's T6 is the counterexample.** T6's estate:
seven services, every one owning its own database, the last shared jar killed in March. Under the
NEW-1 wording the counts should be equal at 7. The agent returned **3 to 6 quanta**, because `search`
and `recommendations` both parse `catalog`'s `status` integer against hardcoded maps — a contract
whose change obligation runs to its readers, which is an **S** edge under the very step 2 this
iteration added. Owning your data closes one source of static edges, not the leg.

The author's reasoning for leaving 2.2 alone (**probe 4**) is right in direction and does not reach
the sentence: a bounded S does make the counts coincide more often, so the against case gets
_stronger_ — but "wherever each service owns its data and no caller blocks on another" is not the
condition under which they coincide, and an estate the suite actually ran refutes it.

**Exact fix, all three sites, one wording:** "wherever no edge survives either leg — each service
owning its data is the common case, not the whole condition — the counts are equal and the word adds
nothing." Shorter than what is there now at two of the three sites.

## Regression risk 2 — NOT realised. The change list was wrong about it

**The inline conditional pointer was compressed, not cut.** `SKILL.md` L117 reads:

> Read `references/coupling-vocabulary.md` before arguing about what "coupled" means;
> `references/measuring-the-unit.md` before promising a number.

Comma to semicolon, "promising anyone a number" to "promising a number". Both conditions intact.
Conditional routing to the third file survives too, mid-sentence in Honest standing (L223, "two more,
on the size confound and on connascence's standing, are **in** `references/evidence-and-disagreements.md`")
and in Fitness functions (L153, "with preconditions and failure modes in
`references/measuring-the-unit.md`"). Every reference is reachable by condition from the body.

The three References bullets **were** compressed to what-only ("connascence, static versus dynamic at
architecture scale, the two common garblings…"), which is a real change — but that list is the tail
inventory, and the shipped siblings put their conditions inline exactly as this one now does. **Not a
finding.** Worth recording that the coordinator's change list said the pointer was removed and it was
not; had I taken the change list at face value I would have raised a finding that does not exist.

## Phase 4 findings — disposition

| ID     | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1** | **DISCHARGED, and the two extensions are both justified.** "Converting the counts into the label by arithmetic is the move this skill exists to refuse, **whoever it favours**" — T2 was refuting a label, and the Phase 4 wording ("asked to prove or disprove") would have fired but the _rule_ as drafted read as covering assertion; the extension closes it. "**No count here defines any label**" names T2's fabricated premise directly, which the drafted fix did not. The closing clause ("the map is worth more to you unlabelled than the word is worth to the person asking") gives the agent something to hand back instead of a bare refusal — T2's failure was partly that it had a deadline and no alternative. `enterprise-architecture-smells` is now named in the bullet, which is the third body mention and the first inside a refusal |
| **F2** | **NOT DISCHARGED** — see MAJOR-2. Step 2 itself is a good fix: test-driven rather than category-driven, "where to look, not what counts", the broker exclusion, and the collapse-to-one escape hatch routed into step 5. It simply did not propagate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **F3** | **DISCHARGED** — step 5 now reads "and name the reading each depends on. Where an S reading is contested the honest output is a range, not a number: report both counts and say which edge moves it." Step 2's escape hatch feeds it by ordinal ("carry both through step 5"), which resolves. This is what T4 and T6 did unprompted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **F4** | **DISCHARGED** — L165: "A gate can test only what is in the repo and fixable by the commit under test — a declared schema owner, a compatibility policy on a contract, a module dependency rule — never a count derived from history or production topology", with both handoffs named. It sources T5's self-derived rule and gives its three examples, which were T5's own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **F6** | **DISCHARGED** — `coupling-vocabulary.md` §4: "A **published library is not one**: it is a unit of release, and it enters the map as a static edge between its consumers rather than as a node in either count. Counting it inflates the gap." Re-derived against the ADR: `sales-model` is a jar and is correctly **not** among the ten deployment units                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **F5** | Not a skill defect. Agreed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Probe 3 — is the F2 bound marked as the skill's own?

**Yes, and consistently with how the package marks its other constructions.** Honest standing L208–210:
"**Its static leg has no published floor either**: read literally it swallows every shared broker and
every unversioned contract, so on a strict reading almost any estate reduces to one quantum, which is
the same as having no map. Step 2 bounds it with Ford's test because nothing in the books does — **that
bound is this skill's own**, and where the reading is contested the count is a range, not a number."

That is the same register as the 0.8 threshold ("THIS SKILL'S OWN CONSTRUCTION") and the against case
("this skill's own reasoning"), and it is stronger than either because it also says _what breaks_
without the bound. Step 2 does not repeat the marking but does mark the reading as arguable ("that is
the limit of the definition rather than a fact about the estate: take the reading deliberately, write
down which one you took"), which is enough. Not a finding. Note that MAJOR-2's fix must not turn any
of sites 1, 3, 4, 6 or 7 into a second unmarked statement of doctrine — clause 2 of the fix routes to
step 2 rather than restating the rule, for that reason.

## Probe 5 — step renumbering and ordinal cross-references

**All three resolve. Re-derived, not accepted.** Six steps, numbered 1–6, extracted mechanically:

| Cross-reference                                     | Site           | Target                                                          | Resolves? |
| --------------------------------------------------- | -------------- | --------------------------------------------------------------- | --------- |
| "the collapse performed by **steps 3 and 4** below" | `SKILL.md` L82 | 3 = "Collapse the static edges", 4 = "Then the dynamic edges"   | ✓         |
| "carry both through **step 5**"                     | L99 (step 2)   | 5 = "Count both numbers … report both counts"                   | ✓         |
| "**Step 2** bounds it with Ford's test"             | L209           | 2 = "Draw the static edges — with the test, not the categories" | ✓         |

The two `§` cross-references inside the references (`measuring-the-unit.md` §4 from
`coupling-vocabulary.md` L70; §1, §2, §3 self-references in `measuring-the-unit.md`) also resolve —
that file still has four numbered sections. Three edits, no ordinal drift.

## Counting check — 125 claims re-derived, 0 count discrepancies

Every numeric line in all four files re-extracted mechanically and re-derived, with priority on step
2, step 5 and the cut regions as instructed.

| File                                       | Claims re-derived | Failed |
| ------------------------------------------ | ----------------: | -----: |
| `SKILL.md`                                 |                52 |      0 |
| `references/coupling-vocabulary.md`        |                27 |      0 |
| `references/measuring-the-unit.md`         |                21 |      0 |
| `references/evidence-and-disagreements.md` |                25 |      0 |
| **Total**                                  |           **125** |  **0** |

MINOR-5 is a truth failure, not a count failure — the sentence counts nothing.

Re-derived in detail because they moved or are new:

- **Six steps** exist and are numbered 1–6 with no gap; the three ordinal references above resolve.
- **F1's illustrative pair** — "14 units against 6 quanta and 14 against 1 are both findings" — is
  internally consistent and is T2's own estate (14 services) with T2's own fabricated count (6) used
  against it. Two examples, two given.
- **ADR re-derives unchanged and still correct under the new step 2**: ten services named in Context
  against "Ten deployment units, ten pipelines"; four brace groups holding 3 + 2 + 2 + 1 = 8 against
  "Eight of the ten"; "two unplaced" = search + catalogue. `sales-model` is a jar and is correctly not
  counted, which is F6 already honoured in the pre-existing text. No broker appears, so the ADR takes
  no damage from the F2 bound either way.
- The cuts touched no count: References bullets still name "the two common garblings", "the three
  measurements" and "the four live disagreements", each of which re-derives against its file (2
  numbered garblings, 3 numbered measurement sections, `## 2. Four live disagreements` with §2.1–2.4).
- "Two live disagreements about the unit itself … two more" still totals four. Unchanged from
  iteration 2 and still consistent.
- All external figures unchanged from iteration 1, where each was verified live: Uber 2,200 / ~70 /
  1.5 / 50 / 12; Segment 140+ / 120 / 3; OpenAlex 16 / 23 / 11; El Emam 4 of 24 / 2; code-maat 5-5-30
  and 2023-02-20 / 2025-07-03; CodeScene 10 / 50% / 50 files; 0.8 over 10; semconv v1.33.0; ArchUnit
  1.5.0 / 2026-08-04; 137 / 135.

## Mechanical

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-coupling-and-quanta
✓ Valid — no issues found

$ npx prettier --check "skills/architecture-coupling-and-quanta/**/*.{md,yaml}"
All matched files use Prettier code style!

SKILL.md                            236 lines, frontmatter ends L16 → body 220, exactly at the 220 cap
references/coupling-vocabulary.md   166
references/evidence-and-disagreements.md 194
references/measuring-the-unit.md    152
```

Descriptions untouched and byte-identical — `awk`-extracted from both files, 12 lines each, md5
`628765953f2dce0fca7c883974752392` on both, `diff` clean, folded length **1022 / 1024**. Identical to
the iteration-2 hash, so the description did not move this round.

References band: 152–194 against the suite's shipped range of 109–193
(`architecture-fitness-functions`, `architecture-trade-off-analysis`, `architecture-characteristics`).
`evidence-and-disagreements.md` at 194 is now the largest reference in the suite by one line — worth
naming because the natural fix direction for the cap question below pushes material _into_ the
references.

## The standing question — is 220 honest size, or is the body carrying reference material?

**Both, and the second is the answer to act on. My judgement: the body is not padded, but it is
carrying roughly 35–45 lines that exist in fuller form in its own references — and the cap is making
the author pay for every fix out of the wrong budget.**

Against calling it padding: Phase 4 is direct evidence that précis-in-body is load-bearing. T2
pre-stated the 0.8 threshold as definitional and corrected the _Fundamentals_/_Hard Parts_ attribution
under deadline pressure **without opening a reference**; T5 opened its plan with the "too small"
precondition as a day-1 check. Material that fires in an adversarial run is not padding, and the
shipped siblings carry the same shape at 181–183 lines.

For calling it over-capacity: three sections in the body are précis of a reference that exists.
Honest standing (~20 lines) restates `evidence-and-disagreements.md` §1; the book-attribution
paragraph (L109–114, ~6 lines) restates `coupling-vocabulary.md` §3's five-row table, which is the
best-sourced artefact in the package; the Fitness-functions tool facts restate `measuring-the-unit.md`
§1 and §3. That is the honest inventory.

**What matters more than the total is which text the cap ate this round.** The three cuts taken to
reach 220 were the inline "Read references…" pointer (compressed), the three References bullets
(compressed to what-only), and the Purpose closing clause. All three are _routing and framing_ — the
cheapest text to cut and, per byte, the most load-bearing, in a package whose Phase 4 evidence shows
agents actually opening the references. Cutting routing to buy content is the wrong trade, and the cap
is what forces it. It got away with it this time; the pointer survived intact and I confirmed it. It
will not survive a fourth round of the same trade.

**Concrete recommendation, and it pays for MAJOR-2's fix.** Move the **book-attribution paragraph**
(L109–114) into `coupling-vocabulary.md` §3, where its own table already is, and leave two lines in
the body: the "say which book you are quoting, because the definition moved" rule, and the one
attribution error to refuse. The body already routes to that file by condition on L117, sixteen lines
later, on precisely the "what does coupled mean" trigger that sends a reader there. That buys ~4 lines
without touching routing, evidence-in-body, the method, or the reading table — enough for MAJOR-2's
five clauses with room left.

Do **not** move Honest standing. It is the section T2 executed from under pressure, and it is the one
place the package's three self-owned constructions (the 0.8 threshold, the scale bound, the F2 bound)
are marked in one voice. Moving it would cost the thing this package is best at.

---

_Everything from here down is the iteration-2 record as it stood, including its own top-matter. It was
superseded by Phase 4 usage testing, which raised 2 MAJOR after this PASS; read it as history, not as
the current verdict._

**VERDICT (iteration 2, final): PASS — 0 BLOCKER, 0 MAJOR, 1 MINOR, 0 NIT.**

_Iteration 1: FAIL — 0 BLOCKER, 1 MAJOR, 4 MINOR, 4 NIT._ Both iterations are preserved below,
unedited. **The iteration 2 section is the permanent record:** it carries the dispositions, the
re-run routing suite, the counting check and the residual list.

| Iteration | Verdict  | BLOCKER | MAJOR                        | MINOR         | NIT |
| --------- | -------- | ------- | ---------------------------- | ------------- | --- |
| 1         | FAIL     | 0       | 1 (quantum definition, §M-1) | 4             | 4   |
| 2         | **PASS** | 0       | **0**                        | 1 new (NEW-1) | 0   |

Cumulative: 1 MAJOR raised and discharged. 5 MINOR raised, 4 discharged, 1 open (introduced by the
MAJOR's fix). 4 NIT raised, 4 discharged. No file under `skills/` was edited by me in either
iteration.

---

# ITERATION 2 — PASS (superseded by iteration 3; preserved unedited)

Verified independently: all seven definition sites re-read; the reading table, method steps and ADR
re-derived against the new definition; the full routing suite re-run from scratch against the
rewritten covers clause (30 prompts, up from 25); every count-claim in the two changed files
re-derived; all mechanical checks re-run. Tool facts were verified live at iteration 1 and none of
them moved, so they were not re-fetched.

## MAJOR-1 — DISCHARGED, at all seven sites, and the downstream machinery now agrees with it

`grep -rnE "maximal|transitive closure|closed under|closure"` over the package returns exactly seven
hits, and every one is correct:

| #   | Site                                | Shipped wording                                                                                                                      | Correct?                                             |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 1   | `SKILL.md` L5 (frontmatter)         | "static and synchronous dynamic coupling … the architecture quantum as the maximal region closed under **both**"                     | ✓ "both" has a named antecedent in the same sentence |
| 2   | `skill.yaml` L7                     | byte-identical to #1                                                                                                                 | ✓                                                    |
| 3   | `SKILL.md` L79 (definition)         | "a **maximal region closed under static coupling and synchronous dynamic coupling** — the collapse performed by steps 3 and 4 below" | ✓ names the operation and points at it               |
| 4   | `SKILL.md` L94 (method step 3)      | "Take their transitive closure; each maximal region is a **candidate** quantum"                                                      | ✓ static-only closure, correctly labelled candidate  |
| 5   | `SKILL.md` L215 (honest standing)   | "it names a closure over static coupling and synchronous calls that a pipeline count cannot see"                                     | ✓                                                    |
| 6   | `coupling-vocabulary.md` L145       | "a maximal region closed under static coupling _and_ synchronous dynamic coupling", with both legs' reasons                          | ✓ and its wording matches `SKILL.md`'s new paragraph |
| 7   | `evidence-and-disagreements.md` L90 | "the closure over static coupling and synchronous calls"                                                                             | ✓                                                    |

The author was right that four sites was an undercount; #4, #5 and #7 carried the same error and I
missed them at iteration 1 by grepping only for the definitional phrasing.

**"Closed under" is the better choice and it is load-bearing, not cosmetic.** Step 3 now yields
_candidate_ quanta; step 4 reads "Merge any two candidate regions joined by a synchronous call the
caller cannot complete without: closing over both legs is what turns the candidates into quanta." The
definition and the method now describe the same operation in the same words.

**The two-leg paragraph is the part that makes it teachable, and it is right.** Static leg governs
**deployability** ("what must already be present, at a compatible version, for this part to boot and
be correct"); synchronous dynamic leg governs **operational profile** ("a caller that cannot complete
without its callee inherits the callee's availability and load, so the two cannot hold different
uptime or scalability numbers"). That second half is a genuine addition — it says _why_ the dynamic
leg belongs in a unit-of-deployment definition at all, which neither book wording explains and which
iteration 1 did not ask for.

**Mapped by column name, as required.** "In the table above, _boot and correctness_ tests the static
leg and _runtime completion_ tests the dynamic one." Both strings are the literal column headers.
_Change obligation_ is deliberately left unmapped, which is correct: it spans both legs.

**Downstream re-checks, all clean.**

- **S row** — Boot and correctness: "the other side's schema, library or infrastructure, at a
  compatible version." Matches the static leg verbatim, "at a compatible version" included. Static leg
  holds → merge → "Not a boundary." ✓
- **D row** — Boot and correctness: "the callee reachable; **nothing of it present at build time**" —
  i.e. explicitly no static requirement. Runtime completion: "no — that is the definition." Dynamic
  leg holds → merge → "Not a boundary, on _The Hard Parts_' wording **or this skill's**." That added
  clause is exactly the reconciliation iteration 1 asked for. ✓
- **B row** — "nothing of the other side" / "yes". Neither leg holds → separate quanta. ✓
- **U row** — unknown on both diagnostic columns. ✓ The four readings remain mutually exclusive and
  jointly exhaustive over (static leg held?) × (dynamic leg held?), with U as the unmeasured case.
- **ADR sketch — `{checkout, pricing}` on D is now _correct_, not merely unflagged.** Context states
  "checkout calls pricing synchronously with no fallback" and names no static edge between them. Under
  the shipped definition the dynamic leg closes over them, so they are one quantum. Under iteration
  1's static-only definition they were two, and the ADR's headline number was wrong by one. It is now
  right. `{analytics}` on B likewise checks out: "Events between orders and analytics carry no static
  edge", neither leg holds, own quantum.
- **NIT-4 closed in the same edit**, and better than I specified: "_The Hard Parts_ names **high
  functional cohesion** alongside both; cohesion is a judgement this skill does not measure, so the
  collapse below is over coupling alone." It names the omission, attributes the fuller definition and
  gives the reason, in one sentence.

## Prior findings — disposition

| #       | Finding                                                           | Disposition                                                                                                                                                                                                                                                                                                                                              |
| ------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MAJOR-1 | Quantum definition contradicted table, method, ADR and every book | **DISCHARGED** — 7/7 sites, downstream verified above                                                                                                                                                                                                                                                                                                    |
| MINOR-1 | "Two live disagreements" vs "the four live disagreements"         | **DISCHARGED** — body now "Two live disagreements **about the unit itself**, both sides — two more, on the size confound and on connascence's standing, are in `references/evidence-and-disagreements.md`." References line keeps "four". 2 + 2 = 4, and the reference still holds `## 2. Four live disagreements` with §2.1–2.4. Re-derived; consistent |
| MINOR-2 | Corrupted Uber quotation, `evidence-…` L132                       | **DISCHARGED** — now reads "…all have to be deployed / together to safely perform any change." Word-for-word against the live Uber post: exact. `grep -rn "^> .\*> "` over the package returns nothing, so no sibling quotation escaped the same rewrap bug                                                                                              |
| MINOR-3 | Undisclaimed collision with `event-driven-architecture`           | **DISCHARGED** — "or publishing a fact versus making a call (event-driven-architecture)". See routing N11/N16/N17                                                                                                                                                                                                                                        |
| MINOR-4 | c-a-r-b disclaimer understated that neighbour                     | **DISCHARGED** — "the coordinated release shared jars force (component-and-release-boundaries)" now names the trigger c-a-r-b actually claims. See routing P2                                                                                                                                                                                            |
| NIT-1   | "three independent summaries"                                     | **DISCHARGED** — "quoted identically by two independent summaries and the publisher's own page snippet." Matches the brief's §2.3 source list exactly                                                                                                                                                                                                    |
| NIT-2   | Scale threshold AND-form vs OR-form                               | **DISCHARGED, past what I asked for** — "one deployable, or one team owning every deployable", each disjunct now given its own reason ("with one deployable the quantum count is 1 and static coupling is total; with one owner, 'who must I coordinate with to ship?' has no interesting answer whatever the count is")                                 |
| NIT-3   | "is a re-basing" stated as fact                                   | **DISCHARGED** — "is reported to be a re-basing"                                                                                                                                                                                                                                                                                                         |
| NIT-4   | "high functional cohesion" dropped and never returned to          | **DISCHARGED** — see MAJOR-1 above                                                                                                                                                                                                                                                                                                                       |

## NEW-1 (MINOR) — the fix left the "against" case behind, and the package's own ADR now refutes it

**This is the defect the fix created.** Both files updated the **For** side of disagreement 2.2 to the
new closure ("a closure over static coupling and synchronous calls" / "the closure over static
coupling and synchronous calls"). Neither updated the **Against** side, which was written against the
static-only definition and is now false.

- `SKILL.md` L215–216: "Against: **wherever each service owns its data the counts are equal** and the
  word adds nothing."
- `evidence-and-disagreements.md` L93: "**Against:** in the common case where each service owns its
  data, quantum count equals deployment unit count exactly, and the term adds a word without adding
  information."

Under the shipped definition this is wrong, and **the skill's own ADR is the counterexample**:
checkout and pricing each own their data — the ADR names no static edge between them — and they are
nevertheless one quantum, merged on D. Owning your data closes the static leg only. Wherever any
caller blocks on a callee, the counts diverge whatever the data ownership is.

Why it matters beyond tidiness: a reader who accepts the sentence concludes the map is pointless in a
data-per-service estate, and therefore never runs step 4 — the exact step this iteration added.

**Why MINOR and not MAJOR**, stated so the judgement can be argued with: it corrupts one side of a
disagreement the skill explicitly owns as its own unattributed reasoning — not the definition, the
reading table, the method or the ADR's arithmetic, all four of which are now correct and mutually
consistent. It is absent from the frontmatter. It is the strongest MINOR in the package and I would
take it before ship, but it does not meet the bar that failed iteration 1.

**Exact fix, both files, nine words:**

- `SKILL.md`: "Against: where each service owns its data **and no caller blocks on another**, the
  counts are equal and the word adds nothing."
- `evidence-and-disagreements.md`: "**Against:** in the common case where each service owns its data
  **and no synchronous call spans two of them**, quantum count equals deployment unit count exactly…"

Note the cap constraint below — `SKILL.md` is at exactly 210, so this edit needs a paired cut. Its
`SKILL.md` half sits inside a flowing paragraph averaging ~111 characters per line, so ~30 added
characters may or may not add a line; check after editing rather than before.

## Routing suite — re-run in full, 30 prompts, 30 pass, 0 fail

Prior passes were **not** carried over: the covers clause lost one exclusion, gained one and
compressed three, so every prompt was re-judged from the new frontmatter. Five new prompts were added
to stress the specific changes flagged for re-check.

**All seven triggers survived the rewrite verbatim** — each string occurs exactly once in `SKILL.md`
and once in `skill.yaml`, mechanically confirmed.

### The boundaries that changed

| Probe     | Prompt                                                                             | Result                                                                                                                                                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N11**   | "Our services exchange only events yet must be deployed together."                 | **Resolved, and my iteration-1 classification was the wrong one.** The disclaimer scopes EDA to _the choice_ (publish a fact vs make a call); this prompt asks what holds two things together, which is this skill's map. It now routes here deterministically, and that is the right destination. The boundary is explicit in both directions |
| **N16**   | "Should orders publish `OrderPlaced` or call shipping directly?"                   | ✓ `event-driven-architecture` — this skill's own disclaimer names the case                                                                                                                                                                                                                                                                     |
| **N17**   | "Our event is named `ShipOrder`. Problem?"                                         | ✓ `event-driven-architecture`, verbatim trigger there, nothing here                                                                                                                                                                                                                                                                            |
| **N8**    | "Is our system a distributed monolith?"                                            | ✓ `enterprise-architecture-smells`. Dropping EAS from the covers clause cost nothing here: "distributed monolith" appears in EAS's description and **nowhere in this skill's `SKILL.md` or `skill.yaml`** (grepped). Routing by presence holds                                                                                                 |
| **N18**   | "Is it worth making this module a separate service?"                               | ✓ `distribution-boundaries`. The compressed "whether to distribute" is _stronger_ than iteration 1's "the process-boundary decision" — it matches the user's verb, not the architect's noun                                                                                                                                                    |
| **N1**    | "Two of our services share a database. Should we split it?"                        | ✓ `distribution-boundaries`, and now explicitly: "should we split it" **is** "whether to distribute"                                                                                                                                                                                                                                           |
| **N19**   | "Packages are organised by layer and nothing stops a controller importing a repo." | ✓ `layering-and-boundaries` (verbatim "when layers exist but nothing prevents crossing them"). The broadened "package coupling" creates no pull — this skill has no layering trigger                                                                                                                                                           |
| **N6/N7** | "One-field change fans out across six packages" / "compute Ca, Ce and instability" | ✓ `java-cohesion-coupling` both. Broadening "class and package coupling metrics" → "package coupling" excludes _more_, not less, and j-c-c holds both triggers verbatim                                                                                                                                                                        |
| **P2**    | "Twelve services always release together and nobody can say which one forces it."  | ✓ here, and the carve is now principled: the jar-forced case is disclaimed to c-a-r-b, this skill keeps the case where nobody can say what forces it                                                                                                                                                                                           |
| **P3**    | "We swapped checkout→pricing for a queue and they still can't ship separately."    | ✓ here; the EDA disclaimer removes the iteration-1 coin flip                                                                                                                                                                                                                                                                                   |

### The rest

P1, P4–P10 and N2–N5, N9, N10, N12–N15 re-judged and unchanged from iteration 1: all pass, all for the
same reasons, none touched by the rewrite. The full prompt list is in the iteration-1 section below.

**Result: 30 / 30.** One borderline recorded rather than hidden — see residuals.

## Counting check — 118 claims re-derived, 0 discrepancies

Every line containing a digit or a number-word in the two changed files (`SKILL.md`,
`coupling-vocabulary.md`) was re-extracted mechanically and re-derived from the artefact it counts;
the two unchanged files were re-swept for anything the edits could have invalidated by reference.

| File                                       | Claims re-derived | Failed |
| ------------------------------------------ | ----------------: | -----: |
| `SKILL.md`                                 |                46 |      0 |
| `references/coupling-vocabulary.md`        |                26 |      0 |
| `references/measuring-the-unit.md`         |                21 |      0 |
| `references/evidence-and-disagreements.md` |                25 |      0 |
| **Total**                                  |           **118** |  **0** |

The two structural counts the author added both hold: "**The two legs**" is followed by exactly two
bolded legs (static, synchronous dynamic); "the collapse performed by **steps 3 and 4** below" points
at two steps that exist and are the two collapse steps — 3 closes the static edges into candidates, 4
merges candidates on synchronous edges. The covers clause names **five** neighbours and lists five,
all of which exist as packages.

**The retitle and the removed prose claim — verified clean.** The intro sentence "What the system
looks like about eighteen months after the unit was identified wrongly" is gone; its content now sits
in the heading (`## Failure signature — the unit identified wrongly`) and in the column header (`18
months on`). The inbound cross-reference at L123 reads "the **failure signature** below says what
diagrams become" — it names the section by its surviving noun phrase, so it still resolves. `grep` for
`eighteen months` returns nothing anywhere in the package, and no other file referenced the section.

The two discrepancies found at iteration 1 (MINOR-1, NIT-1) both re-derive as fixed. The ADR
re-derives clean and unchanged: 10 services named in Context against "Ten deployment units, ten
pipelines"; 4 brace groups holding 3 + 2 + 2 + 1 = 8 against "Eight of the ten"; "two unplaced"
against search + catalogue; and "ten deployment units against four resolved quanta, two unplaced" in
Consequences agreeing with all of it.

## Mechanical output

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-coupling-and-quanta
architecture-coupling-and-quanta@1.0.0
  5 files
✓ Valid — no issues found

$ npx prettier --check "skills/architecture-coupling-and-quanta/**/*.{md,yaml}"
All matched files use Prettier code style!

$ grep -rniE "best practice|pp\. [0-9]|p\. [0-9]|page [0-9]" skills/architecture-coupling-and-quanta/
NO MATCHES

$ grep -rn "^> .*> " skills/architecture-coupling-and-quanta/
NONE
```

Description identity — extracted with `awk` from both files, not eyeballed:

```
SKILL.md   description block: 12 lines, md5 628765953f2dce0fca7c883974752392
skill.yaml description block: 12 lines, md5 628765953f2dce0fca7c883974752392
diff: no differing lines
folded length (YAML `>` semantics, newlines → spaces): 1022 bytes — 2 under the 1024 cap
```

```
$ wc -l SKILL.md references/*
  226 SKILL.md   (frontmatter ends L16 → body 210, exactly at the 210 cap)
  164 references/coupling-vocabulary.md
  194 references/evidence-and-disagreements.md
  152 references/measuring-the-unit.md
```

`registry:build` and `verify` deliberately not run, per the commissioning instruction.

## Residual list — what ships

**0 BLOCKER, 0 MAJOR, 1 MINOR, 0 NIT, 2 structural constraints, 1 trigger borderline.**

| Item                                                                                            | Severity      | Status / shipping reason                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NEW-1** — the "against" case, two files                                                       | MINOR         | **Open.** Gate does not fail on it. Nine-word fix specified above; take it before ship if a paired cut is available                                                                                                                                                                                 |
| **`SKILL.md` body at exactly 210 / 210**                                                        | constraint    | **Real maintainability cost, recorded as instructed.** Every future edit to this file needs a paired cut, NEW-1's included. Two shipped siblings run 181–183, so this package has ~27 lines less headroom than the house norm — and it reached the cap by adding content, not padding               |
| **Description at 1022 / 1024 bytes**                                                            | constraint    | Two bytes of headroom. Any future trigger or exclusion must displace an existing one. The ATOA-in / EAS-out ruling is what bought the two new exclusions, and EAS's routing is now carried entirely by word-presence rather than by a disclaimer                                                    |
| **N20** — "we think we have a distributed monolith — twelve services that always ship together" | not a finding | Genuine coin flip between `enterprise-architecture-smells` (verdict already reached) and this skill (the measurement that would establish it). Bare N8 routes correctly and the body defers to EAS three times, so nothing is unreachable. This is the priced cost of the EAS drop, and it is small |
| **All secondary book sourcing**                                                                 | not a finding | Unchanged from iteration 1 and correctly disclosed throughout; see "What I could not verify" in the iteration-1 record below                                                                                                                                                                        |

---

# ITERATION 1 — FAIL (superseded by iteration 2; preserved unedited)

**VERDICT (iteration 1): FAIL — 0 BLOCKER, 1 MAJOR, 4 MINOR, 4 NIT.**

The gate rule is zero BLOCKER and zero MAJOR. One MAJOR is open, so the package returns to the
author. Nothing in the method is broken and no fix requires restructuring: the MAJOR is one sentence
repeated in four places, and the four MINORs are one number, one corrupted quotation and two routing
boundaries.

Validator did not write the skill. All five files read in full; the research brief
(`architecture-coupling-and-quanta-research.md`, 948 lines) read in full before any claim was judged;
the prior gate records for `architecture-trade-off-analysis` and `architecture-characteristics` read
for severity calibration; twelve neighbours' frontmatter read for the routing suite. Every tool fact
in the package was re-verified live against the primary source — GitHub API, ArchUnit user guide,
OpenTelemetry semconv, CodeScene docs, Microsoft Learn, PostgreSQL docs, analysis-tools.dev, the Uber
engineering blog and the InfoQ transcript — rather than taken from the author or the brief.

| Iteration | Verdict  | BLOCKER | MAJOR                        | MINOR | NIT |
| --------- | -------- | ------- | ---------------------------- | ----- | --- |
| 1         | **FAIL** | 0       | 1 (quantum definition, §M-1) | 4     | 4   |

---

## The commissioned probes, answered first

**Probe 1 — quantum attribution. PASS, and it is the strongest section in the package.** The brief's
highest-value finding is carried correctly everywhere it appears. `SKILL.md` lines 95–98:
_Fundamentals_ 1st ed. (2020, ch. 7) = "high functional cohesion **and synchronous connascence**";
_The Hard Parts_ (2021, ch. 2) and _BEA_ 2nd ed. (2022) = "high functional cohesion, high static
coupling, synchronous dynamic coupling"; followed by "Attributing the second to _Fundamentals_ is
wrong." `coupling-vocabulary.md` §3 carries the same split as a five-row table with per-row sourcing
strength, plus an explicit "Attribution discipline, which this skill treats as a blocker" paragraph.
`evidence-and-disagreements.md` and `measuring-the-unit.md` do not restate the wordings, so there is
nothing to get backwards there. **Nothing is reversed.** The 2nd-ed. status is marked unverified in
both files, with the brief's exact instruction ("Do not write 'unchanged in the 2nd edition'; nobody
checked") honoured. Cross-checked against `architecture-characteristics`
(`definitions-and-composites.md` §"The quantum wording drifts between books"), which makes the same
split — the two skills agree.

**Probe 2 — two versus four disagreements. REAL INCONSISTENCY, and it is skill 1's logged defect
reproduced.** See MINOR-1.

**Probe 3 — the Neal Ford quotation. PASS, and it verifies twice over.** It is in the brief verbatim
(§3.2). It is also in the live InfoQ transcript, which I fetched independently:
`https://www.infoq.com/podcasts/software-architecture-hard-parts/` returns "I'm coupled to something,
if that thing changes, if I might have to change because of that, we are coupled to one another." The
same page confirms the semantic-vs-implementation coupling distinction that `coupling-vocabulary.md`
§2 attributes to the same episode. Not a MAJOR; not anything.

**Probe 4 — page numbers. PASS.** `grep -rniE "best practice|pp\. [0-9]|p\. [0-9]|page [0-9]|, pp[
.]"` over the whole package returns **no matches**. The only volume(issue) forms present are `_JSEP_
29(4), 2017`, `_IEEE TSE_ 27(7), 2001`, `_Communications of the ACM_ 35(9)` and `35(9), September
1992` — all legitimate, all correct against the brief's Crossref-verified records. The brief's own §1
and §3.3 do carry `pp. 147–151` and `pp. 135–144` despite claiming "no page numbers are claimed
anywhere in this brief"; the author correctly did not propagate them.

**Probe 5 — every tool fact re-verified independently. ALL PASS.** Nothing archived, nothing renamed,
no cited API that does not exist.

| Claim in the package                                                                                              | Verified against                                                         | Result                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| code-maat v1.0.4 released 2023-02-20                                                                              | `api.github.com/repos/adamtornhill/code-maat/releases`                   | ✓ `published_at 2023-02-20T12:09:25Z`                                                                                                                                                                                                             |
| last commit 2025-07-03, not archived, 2,626 stars                                                                 | `api.github.com/repos/adamtornhill/code-maat`                            | ✓ `pushed_at 2025-07-03T11:51:48Z`, `archived: false`, `stargazers_count 2626`                                                                                                                                                                    |
| README points at commercial CodeScene                                                                             | raw README on `master`                                                   | ✓ "the analyses have evolved into CodeScene, which automates all the analyses found in Code Maat"                                                                                                                                                 |
| code-maat defaults 5 / 5 / 30 (and 100 max)                                                                       | README options table                                                     | ✓ exact                                                                                                                                                                                                                                           |
| ArchUnit 1.5.0, 2026-08-04                                                                                        | `api.github.com/repos/TNG/ArchUnit/releases/latest`                      | ✓ `v1.5.0`, `2026-08-04T05:09:46Z`, not prerelease                                                                                                                                                                                                |
| ArchUnit computes the Martin metrics                                                                              | archunit.org user guide §8.7.2                                           | ✓ `ArchitectureMetrics.componentDependencyMetrics(components)` with `getAfferentCoupling`, `getEfferentCoupling`, `getInstability`, `getAbstractness`, `getNormalizedDistanceFromMainSequence`; `lakosMetrics` and `visibilityMetrics` also exist |
| OTel semconv v1.33.0, `db.system.name` / `db.namespace` stable                                                    | `opentelemetry.io/docs/specs/semconv/non-normative/db-migration/`        | ✓ "became stable in v1.33.0"; `db.system` → `db.system.name`, `db.name` → `db.namespace`                                                                                                                                                          |
| older instrumentation emits `db.system` / `db.name`                                                               | same migration guide                                                     | ✓ renames confirmed, `OTEL_SEMCONV_STABILITY_OPT_IN` transition documented                                                                                                                                                                        |
| CodeScene defaults: ≥10 shared commits, ≥50%, exclude >50-file changesets                                         | `docs.enterprise.codescene.io/versions/2.4.4/.../temporal-coupling.html` | ✓ all three verbatim, plus a fourth (≥10 revisions per file) the skill does not claim                                                                                                                                                             |
| "stricter than code-maat's own"                                                                                   | both of the above                                                        | ✓ 10 > 5 shared, 50% > 30% — under-reports, as stated                                                                                                                                                                                             |
| analysis-tools.dev: 137 Java, 135 Python, none connascence-specific                                               | `analysis-tools.dev/tag/java`, `/tag/python` page titles                 | ✓ "137 Java Static Analysis Tools…", "135 Python Static Analysis Tools…"; no connascence entry                                                                                                                                                    |
| PostgreSQL `pg_stat_activity.application_name` (with `datname`, `usename`, `client_addr`)                         | postgresql.org monitoring-stats, Table 27.3                              | ✓ all four columns exist                                                                                                                                                                                                                          |
| SQL Server `sys.dm_exec_sessions.program_name`                                                                    | Microsoft Learn DMV reference                                            | ✓ "Name of client program that initiated the session"                                                                                                                                                                                             |
| Uber: the "networked monoliths" sentence, 2,200 services, ~70 domains, 1.5-year half-life, 50 services / 12 teams | `uber.com/en-SE/blog/microservice-architecture/` fetched live            | ✓ quotation exact, all four numbers exact                                                                                                                                                                                                         |

One live-drift note, not a finding: the rendered `/tag/java` page currently shows a section count of
31 and `/tools?languages=java` shows 138. The 137/135 figures come from the catalogue page titles and
are correct as of the stated 2026-08-28 check. The load-bearing half of the claim — that nothing
connascence-specific appears — reproduces on both pages.

**Probe 6 — constructed-vs-empirical labelling. ALL THREE PASS, in the skill's own voice.**

- 0.8 threshold: `SKILL.md` fitness block — "This number is THIS SKILL'S OWN CONSTRUCTION, not an
  empirical result: no study establishes it. Its justification is definitional"; repeated in the ADR
  Compliance line ("restated so the next reader does not mistake it for a result"); repeated in
  `measuring-the-unit.md` §2 with "No study establishes 0.8, and none establishes 10."
- Scale claim: "**That threshold is this skill's own reasoning, attributed to nobody**: no study
  establishes a size below which the vocabulary costs more than it returns", followed by the one
  sourced datum (Kirbas) presented as a warning that yields no threshold, and Fowler's
  _MicroservicePremium_ correctly labelled "an argument without data".
- "Against" case on the quantum: marked in three places — `SKILL.md` ("no published proponent was
  found, and inventing one would be a fabrication"), `coupling-vocabulary.md` §4, and
  `evidence-and-disagreements.md` §2.2 ("Manufacturing a named opponent would be a fabrication").

**Probe 7 — author's self-report treated as unverified.** I re-derived rather than accepted. Two of
the author's assertions I could check came out true: the ADR sketch does now say "Ten deployment
units" and names ten services (the nine/ten defect is fixed), and the count sweep does find exactly
one further problem — but not the one the author would have reported. See the counting check.

**Probe 8 — "best practice". PASS.** Zero occurrences anywhere in the package.

---

## MAJOR-1 — the quantum definition the package ships contradicts its own method, its own worked ADR, and every book it quotes

**Sites (four):** `SKILL.md` frontmatter line 5, `skill.yaml` description line 8 (byte-identical
copy), `SKILL.md` line 79, `references/coupling-vocabulary.md` line 143.

The definition, in the frontmatter and therefore in the routing contract:

> the architecture quantum as **a maximal region under static coupling**

and again in the body, in bold, as the sentence that opens the method:

> A quantum is a **maximal region under static coupling**; a deployment unit is whatever the pipeline
> happens to ship.

This is false by the package's own lights, in three independent ways.

1. **It contradicts the reading table two dozen lines above it.** Line 55: "**B — neither holds it.**
   A genuine quantum boundary; the two sides are separate quanta." Line 51: "**D — synchronous
   dynamic coupling holds it** … Not a boundary." So D alone prevents a boundary — quantum membership
   is closed over static **and** synchronous-dynamic edges, not static alone.
2. **It contradicts the method it introduces.** Step 3 collapses the static edges; step 4 then says "A
   synchronous call across two regions marked separate means a region was mis-drawn" — i.e. the
   regions merge. The object the method produces is the closure over S ∪ D, which is not what the
   definition names.
3. **It contradicts the skill's own worked ADR, in the same file.** The ADR's Static-edges line names
   only `sales` and `sales-model`. Checkout and pricing have no static edge — and the Decision line
   nevertheless makes them one of the four quanta: "**{checkout, pricing} on D**". Under the stated
   definition they are two quanta and the ADR's central number is 5, not 4.

And it matches none of the four book wordings the package itself tabulates: _The Hard Parts_' is
"high functional cohesion, high static coupling, **and synchronous dynamic coupling**" — quoted
correctly at line 97, sixteen lines after the definition that drops the third clause. A skill whose
stated blocker is "**Say which book you are quoting, because the definition moved**" cannot ship a
headline definition that moved further than either book did.

Why MAJOR and not BLOCKER: the correct wording is present and correctly attributed elsewhere in the
package, and step 4 patches the behaviour in practice, so a reader who works the whole method reaches
the right answer. Why not MINOR: it is in the frontmatter, which is the scope contract and the only
thing an agent sees at selection time; it is the single sentence a reader will quote back in the
argument this skill exists to settle; and it makes the package's own worked example wrong.

**Exact fix.** Replace "a maximal region under static coupling" with "a maximal region under static
and synchronous dynamic coupling" at all four sites. The frontmatter and `skill.yaml` descriptions
must be changed together and stay byte-identical. If the author prefers to keep the compact form in
the description, the body sentence at line 79 must then read: "A quantum is a maximal region under
static coupling and synchronous dynamic coupling — the collapse in steps 3 and 4 below — and a
deployment unit is whatever the pipeline happens to ship."

Related, and cheap to fix in the same edit (see NIT-4): the definition also drops "high functional
cohesion", which the package never mentions again outside `coupling-vocabulary.md`'s table.

---

## MINOR-1 — "Two live disagreements" against a reference the same file calls "the four live disagreements"

**Sites:** `SKILL.md` line 203 ("**Two live disagreements, both sides.**") and line 218 ("the **four**
live disagreements").

Re-derived from the artefact: `references/evidence-and-disagreements.md` carries `## 2. Four live
disagreements` with `### 2.1` shared database, `### 2.2` quantum usefulness, `### 2.3` size confound,
`### 2.4` connascence as teaching device. **Four.** The brief's §4 agrees — four, all presented as
live. The body covers exactly two of them.

**This is `architecture-trade-off-analysis`' logged COUNT-1 reproduced, one number over.** There the
body said "two" over a reference holding three, and it survived five gates. Here the two numbers sit
**in the same file, fifteen lines apart**, which makes it easier to catch and harder to defend.

It is not a legitimate body/reference split as written. A split would be legitimate if the body said
so — and the material is genuinely there: 2.3 (size confound) is discussed in the Honest standing
paragraph immediately above, and 2.4's substance ("a review vocabulary with no governance surface")
is in the fitness-functions section. What is missing is the sentence that reconciles the numbers.

**Exact fix, author's choice:** either line 203 → "**Four live disagreements are live in
`references/evidence-and-disagreements.md`; two turn on the unit itself.**", or keep "two" and qualify
it — "**Two live disagreements about the unit, both sides** (two more, on the size confound and on
connascence's standing, are in the reference)". Either resolves both lines; do not fix only one.

---

## MINOR-2 — a corrupted verbatim quotation in `evidence-and-disagreements.md`

Line 132, raw bytes:

```
> "Networked monoliths can form, where services that appear to be independent all have to be deployed > together > to
> safely perform any change."
```

Two stray `> ` sequences are embedded **inside** the quoted sentence, so it renders as "…have to be
deployed > together > to safely perform any change." The same quotation is clean in `SKILL.md` line
162, and I verified the true wording live against Uber's blog: "Networked monoliths can form, where
services that appear to be independent all have to be deployed together to safely perform any
change."

Prettier passes it because it is valid Markdown; only reading the rendered blockquote catches it. In a
package that makes citation hygiene its closing argument ("Re-fetch every load-bearing source before
it decides anything, as here"), a mangled first-party quotation is the wrong artefact to ship.

**Exact fix:** delete the two stray `> ` inside the sentence and re-wrap the blockquote.

---

## MINOR-3 — undisclaimed trigger collision with `event-driven-architecture`

This is the sharp one, and it is **not** `distribution-boundaries`. `distribution-boundaries` is
handled well — see the routing section.

`event-driven-architecture`'s description triggers on:

> when services exchange only events yet must be deployed together

`architecture-coupling-and-quanta`'s triggers on:

> when a team calls the system decoupled because the services communicate by events … when a
> synchronous call was removed and the two parts still cannot ship separately

These are the same situation described from two sides. Neither description names the other in its
"does not cover" clause — EDA's names `distributed-transactions-and-sagas`,
`streaming-pipeline-topologies` and `rpc-and-api-contracts`; this skill's names
`distribution-boundaries`, `java-cohesion-coupling`, `component-and-release-boundaries`,
`enterprise-architecture-smells` and `architecture-trade-off-analysis`. The prompt "our services
exchange only events yet must be deployed together" is a coin flip on the frontmatter alone. It is not
a harmful misroute — EDA's "temporal coupling traded for schema coupling" is a real answer to it — but
it is an unresolved boundary in a package that resolves five others explicitly. The brief's §8
boundary table omitted `event-driven-architecture` entirely, so the author had no prompt to handle it.

**Exact fix**, in both `SKILL.md` frontmatter and `skill.yaml` (byte-identical), appending one clause
to the existing "Does not cover" sentence:

> … the smell verdict (enterprise-architecture-smells), the trade-off method
> (architecture-trade-off-analysis), or **the choice between publishing a fact and making a call
> (event-driven-architecture)**.

---

## MINOR-4 — the `component-and-release-boundaries` disclaimer understates what that skill claims

This skill's disclaimer scopes the neighbour to "abstractness and shared-jar versioning
(component-and-release-boundaries)". But `component-and-release-boundaries`' own description claims a
trigger this skill also claims:

- c-a-r-b: "when services are independently deployable **in theory but always ship together**"
- this skill: "when **twelve services always release together** and nobody can say which one forces
  it"

On a bare prompt — "our services are supposed to be independently deployable but they always ship
together" — both match, and this skill's disclaimer actively tells an agent that c-a-r-b is only about
abstractness and jar versions, which is a narrower claim than c-a-r-b makes for itself. The
qualifier "nobody can say which one forces it" is what should carry the routing, and it does when the
user says it.

**Exact fix**, both files, one word into the existing clause: "abstractness, shared-jar versioning
**and the coordinated release it forces** (component-and-release-boundaries)". This keeps the
disclaimer honest about the neighbour's scope without moving any trigger.

---

## NITs

**NIT-1 — `coupling-vocabulary.md` line 123: "The 2021 wording is quoted identically by three
independent summaries."** Brief §2.3 names three sources, but the third is "the O'Reilly Part I page
title/snippet" — the publisher's own page, not an independent summary. Two independent summaries plus
a publisher snippet is a stronger provenance claim than "three independent summaries", not a weaker
one; the sentence just names it wrongly. Fix: "quoted identically by two independent summaries and the
publisher's own page snippet."

**NIT-2 — the scale threshold is stated in the AND form in the body and the OR form in the table.**
Body line 34: "**Too small for the vocabulary to pay** — one team, one deployable." Drivers table line
109: "One deployable, **or** one team owning every deployable." The brief's construction is "more than
one team **and** more than one deployable" — whose negation is the OR form in the table. The bullet
therefore understates the skip zone: a five-team estate with one deployable is out of scope by the
table and arguably in scope by the bullet. Fix: bullet → "one deployable, or one team owning every
deployable."

**NIT-3 — `coupling-vocabulary.md` line 21 states as fact what line 88 correctly marks as reported.**
§1: "the architecture-scale vocabulary in §2 **is** a re-basing of this one, not an independent
invention." §2: "The authors **are reported to** credit Page-Jones' static/dynamic connascence split
as the origin of the distinction." The brief explicitly flags that it could not verify the
acknowledgment's wording. Fix: §1 → "is reported to be a re-basing of this one".

**NIT-4 — the shipped definition drops "high functional cohesion" and the package never returns to
it.** It appears once, in `coupling-vocabulary.md` §3's table, and in no method step, no reading, no
ADR field. If the fix for MAJOR-1 restores the coupling clauses, one sentence saying why cohesion is
not operationalised here ("cohesion is a judgement this skill does not measure; the collapse is over
coupling alone") would close the last gap between the definition quoted and the definition used.

---

## The counting check

**110 count-claims re-derived from the artefacts they count, independently of the author's report. 2
discrepancies.** Method: every line in all four files containing a digit or a number-word was
extracted mechanically (`grep -nE`), then each claim was checked against the thing it counts — the
list, table, section headings or enumeration in question, or the primary source for external numbers.

| File                                       | Claims re-derived |                     Failed |
| ------------------------------------------ | ----------------: | -------------------------: |
| `SKILL.md`                                 |                40 |   1 (MINOR-1, two vs four) |
| `references/coupling-vocabulary.md`        |                24 | 1 (NIT-1, three summaries) |
| `references/measuring-the-unit.md`         |                21 |                          0 |
| `references/evidence-and-disagreements.md` |                25 |                          0 |
| **Total**                                  |           **110** |                      **2** |

Everything else re-derives. The ones worth naming because they are the easiest to get wrong:

- **The ADR sketch is now internally consistent on every number.** Context names ten services (orders,
  billing, refunds, fulfilment, labels, checkout, pricing, analytics, search, catalogue = 10) against
  "Ten deployment units, ten pipelines". Decision: "Eight of the ten services resolve into four
  quanta" — the four sets hold 3 + 2 + 2 + 1 = **8**, and "Search and catalogue stay U" accounts for
  the remaining 2. Consequences: "ten deployment units against four resolved quanta, two unplaced" —
  all three agree. The author's reported nine/ten defect is genuinely fixed, and no new one replaced
  it. (The quantum grouping itself is wrong under the stated definition — that is MAJOR-1, not a count
  error.)
- "applied at four levels at once — package, jar, service, database" — four named, four listed.
- "for a given edge at a given moment the four readings are mutually exclusive" — S, D, B, U; and
  "**U** — … The honest fourth reading" is in fact fourth in the list.
- "The second of Page-Jones' two operative rules: as locality decreases, only weaker forms should be
  tolerated" — `coupling-vocabulary.md` §1 numbers exactly two rules and rule 2 is that one.
- The strength ordering lists nine forms (Name → Type → Meaning → Position → Algorithm → Execution →
  Timing → Value → Identity) against a taxonomy table of 5 static + 4 dynamic = 9, and
  `evidence-and-disagreements.md`'s "the nine forms" agrees with both.
- "at 0.8, 'these deploy independently' is false four times in five" — 0.8 = 4/5.
- "a twenty-five-year-old finding" — El Emam 2001, read 2026. Correct.
- "nearly thirty years earlier" — Page-Jones 1992 against _Hard Parts_ 2021 = 29.
- "eighteen months after the unit was identified wrongly" against the table column "18 months on".
- "Two more, with preconditions … in `references/measuring-the-unit.md`" — two bullets follow, and
  with the fitness block above them that is three, matching that file's "Three measurements" and its
  three numbered sections. This is the one place a "two/three" pair is correct, and it is correct.

---

## The routing suite — 25 prompts, 24 pass, 1 fail

Judged from frontmatter descriptions alone, which is what an agent sees at selection time. Neighbour
descriptions read in full: `distribution-boundaries`, `component-and-release-boundaries`,
`java-cohesion-coupling`, `layering-and-boundaries`, `enterprise-architecture-smells`,
`architecture-characteristics`, `architecture-trade-off-analysis`, `architecture-fitness-functions`,
`architecture-testing`, `architecture-decision-making`, `distributed-transactions-and-sagas`,
`event-driven-architecture`.

### Positives — must reach `architecture-coupling-and-quanta`

| #   | Prompt                                                                                              | Wins | Correct?                                                                  |
| --- | --------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------- |
| P1  | "The team keeps saying we're decoupled because everything goes through Kafka. Is that true?"        | ACQ  | ✓ verbatim trigger; EDA's is about deployment, not the claim              |
| P2  | "Twelve services always release together and nobody can say which one forces it."                   | ACQ  | ✓ verbatim, incl. the qualifier — borderline against c-a-r-b, see MINOR-4 |
| P3  | "We swapped the checkout→pricing call for a queue and they still can't ship separately."            | ACQ  | ✓ verbatim; borderline against EDA, see MINOR-3                           |
| P4  | "Nobody can say what would break if we deployed the reporting component on its own."                | ACQ  | ✓ epistemic form; `distribution-boundaries` holds the factual form        |
| P5  | "This box on the architecture diagram — I can't find a pipeline that ships it."                     | ACQ  | ✓ verbatim; no neighbour claims it                                        |
| P6  | "Two architects are arguing about whether billing is 'coupled' to orders. Settle it."               | ACQ  | ✓ verbatim                                                                |
| P7  | "How many architecture quanta does this estate actually have?"                                      | ACQ  | ✓ AC uses the word but only as a characteristics-list scope               |
| P8  | "Is connascence of meaning across a wire a problem?"                                                | ACQ  | ✓ only description in the suite naming connascence                        |
| P9  | "Three services write the `sales` schema, no compatibility policy. What's our real unit of deploy?" | ACQ  | ✓ the "several / no compatibility policy" qualifier separates it from DB  |
| P10 | "What's the difference between static and dynamic coupling?"                                        | ACQ  | ✓ both named in the first line                                            |

### Near-miss negatives — must reach a neighbour

| #   | Prompt                                                                                     | Should win                           | Wins?                                                                               |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------- |
| N1  | "Two of our services share a database. Should we split it?"                                | `distribution-boundaries`            | ✓ verbatim + decision verb                                                          |
| N2  | "We want pricing as its own service — what does that cost in latency and partial failure?" | `distribution-boundaries`            | ✓                                                                                   |
| N3  | "Our shipping service cannot be deployed without labels being deployed too."               | `distribution-boundaries`            | ✓ factual form is DB's, epistemic form is this skill's                              |
| N4  | "A dependency cycle has appeared between two Maven modules."                               | `component-and-release-boundaries`   | ✓ disclaimed here                                                                   |
| N5  | "Our `common` module has grown and every service depends on it."                           | `component-and-release-boundaries`   | ✓ verbatim there                                                                    |
| N6  | "A one-field change fans out across six packages in the monolith."                         | `java-cohesion-coupling`             | ✓ verbatim there, disclaimed here                                                   |
| N7  | "Compute afferent/efferent coupling and instability for our packages."                     | `java-cohesion-coupling`             | ✓ disclaimed here                                                                   |
| N8  | "Is our system a distributed monolith?"                                                    | `enterprise-architecture-smells`     | ✓ the phrase appears there and nowhere in this description — deliberate and correct |
| N9  | "Should deployment coupling be a build gate, and what happens when it goes red?"           | `architecture-fitness-functions`     | ✓ "goes red" is AFF's verbatim; this description says nothing about governing       |
| N10 | "Write an ArchUnit test that web doesn't depend on persistence."                           | `architecture-testing`               | ✓                                                                                   |
| N11 | **"Our services exchange only events yet must be deployed together."**                     | ambiguous                            | **✗ FAIL — coin flip between ACQ and `event-driven-architecture`; see MINOR-3**     |
| N12 | "Record the decision to keep the shared schema as an ADR."                                 | `architecture-decision-making`       | ✓ this description never mentions records                                           |
| N13 | "A saga step failed and half the order is committed — how do we compensate?"               | `distributed-transactions-and-sagas` | ✓                                                                                   |
| N14 | "Which architecture characteristics should this new service be built for?"                 | `architecture-characteristics`       | ✓ despite the shared word "quantum"                                                 |
| N15 | "Our controller has business rules and the DTO travels to the repository."                 | `layering-and-boundaries`            | ✓                                                                                   |

**Result: 24 / 25.** The one failure is N11 (MINOR-3). Two borderlines pass and are recorded rather
than hidden: P2 against `component-and-release-boundaries` (MINOR-4) and P3 against
`event-driven-architecture` (same root as N11).

**On the commissioned `distribution-boundaries` probe specifically: no collision, and this looks
deliberate.** That skill triggers on "when two services share a database" and "when a 'service' cannot
be deployed without another being deployed too". This skill's nearest triggers are narrowed on both
axes — "when a schema is shared by **several** services **with no compatibility policy**", and the
epistemic "when **nobody can say what would break** if one component were deployed alone". N1 and N3
route to `distribution-boundaries`; P4 and P9 route here. No wording change is needed.

---

## Checklist disposition

| Item                            | Result                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technical accuracy              | PASS except MAJOR-1. Every external claim traced to the brief; every tool fact re-verified live                                                                                                                                                                                                                                           |
| Terminology fidelity            | PASS on connascence (static/dynamic, five/four forms, three properties, two rules, hedged ordering), afferent/efferent, abstractness, instability, distance from the main sequence, bounded context. **FAIL on architecture quantum** — MAJOR-1. Static-vs-dynamic is not only right but carries both common garblings explicitly refused |
| No unconditional recommendation | PASS. All four readings carry price / fails-when / reverses-when; all three metrics carry confounders and a "never a gate" placement with a reason; the Drivers table has a populated push-back column                                                                                                                                    |
| Trade-off completeness          | PASS. The reading table applies the same five columns to all four readings; **B**, the flattering reading, is given the harshest failure note ("asserted without evidence more than any other")                                                                                                                                           |
| Evangelism                      | PASS. "The output is a map and two counts, not a plan"; "nothing is split or merged here"; Segment's consolidation cost is carried ("carry that side too")                                                                                                                                                                                |
| Governance realism              | PASS. Three metrics, each with metric + tool (or the honest "no product does this" plus named data sources) + threshold + site; all three implementable and all three verified                                                                                                                                                            |
| Scale honesty                   | PASS, and unusually well done — the threshold is given, marked as unattributed, and the one sourced datum (Kirbas) is correctly presented as bounding the _measurement_, not the vocabulary                                                                                                                                               |
| Scope hygiene                   | PASS with two boundary gaps — MINOR-3, MINOR-4. Verified no contradiction with `architecture-characteristics` (same quantum attribution) or `component-and-release-boundaries` (owns abstractness/"numerology")                                                                                                                           |
| Trigger quality                 | 24/25 — MINOR-3                                                                                                                                                                                                                                                                                                                           |
| Internal consistency            | **FAIL** — MAJOR-1 (definition vs table vs method vs ADR), MINOR-1 (2 vs 4), NIT-2 (AND vs OR), NIT-3 (fact vs reported)                                                                                                                                                                                                                  |

---

## Residual — what would ship if the MAJOR were closed today

Nothing is deferred yet; this is iteration 1 and every item above is open. For the author's planning:
MAJOR-1 and MINOR-1 through MINOR-4 all require fixes. NIT-1 through NIT-4 are cheap and I would take
them, but none blocks. **Nothing in the package requires restructuring, and no reference file needs
rewriting.**

---

## What I could not verify — recorded as findings, not omissions

1. **No book text was checked, by anyone.** Every book wording in this package is secondary, exactly
   as the brief warns, and O'Reilly returns 403 to me as it did to the researcher. The package handles
   this correctly — `coupling-vocabulary.md` opens with a sourcing note governing the whole file, and
   the _Hard Parts_ static/dynamic definitions are paraphrased rather than quoted, which is what the
   brief instructed. But it means MAJOR-1's claim that the definition "matches none of the books" rests
   on the same secondary sources the package uses. That does not weaken the finding — the definition
   still contradicts the package's own table, method and ADR, which is sufficient on its own.
2. **_Fundamentals_ 2nd ed. (March 2025) ch. 3 and ch. 7 text.** Unverified by the researcher and
   unverified by me. The package says so, twice, and does not assert continuity. Correct handling.
3. **The El Emam rebuttal (IEEE TSE, document 1214331) and the D'Ambros 2009 effect sizes.** Both
   unread by the researcher; both remain unread here — IEEE is paywalled. The package states both
   gaps explicitly and does not attribute a number to D'Ambros. Correct handling.
4. **Newman's coupling taxonomy** is quoted from reader notes, not _Building Microservices_ 2nd ed.
   `evidence-and-disagreements.md` §2.1 says so parenthetically. I did not re-verify it.
5. **The Weirich talk** was watched by nobody — the package's claim is about the conference writeup's
   characterisation, and it says so. I did not watch it either.
6. **The Prime Video archive snapshot and the DoorDash sourcing** were not re-fetched; both are used
   in the package only as examples of citation decay and of a mechanism, with their weakness stated,
   so nothing load-bearing rests on them.

---

## Mechanical output

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-coupling-and-quanta
architecture-coupling-and-quanta@1.0.0

  C:\git\agent-skills\skills\architecture-coupling-and-quanta
  5 files

✓ Valid — no issues found
```

```
$ npx prettier --check "skills/architecture-coupling-and-quanta/**/*.{md,yaml}"
Checking formatting...
All matched files use Prettier code style!
```

```
$ wc -l skills/architecture-coupling-and-quanta/SKILL.md skills/architecture-coupling-and-quanta/references/*
  219 SKILL.md            (frontmatter ends line 16 → body 203, under the 210 cap)
  161 references/coupling-vocabulary.md
  194 references/evidence-and-disagreements.md
  152 references/measuring-the-unit.md
```

Description identity, diffed programmatically rather than eyeballed (`sed` the two blocks, strip the
two-space YAML indent, `diff`):

```
SKILL.md frontmatter description block vs skill.yaml description block
  → identical, 1023 bytes, zero differing lines
```

Package-wide greps:

```
$ grep -rniE "best practice|pp\. [0-9]|p\. [0-9]|page [0-9]|, pp[ .]" skills/architecture-coupling-and-quanta/
NO MATCHES
```

`npm run registry:build` and `npm run verify` deliberately not run, per the commissioning instruction
and because no file under `skills/` was edited in this iteration.
