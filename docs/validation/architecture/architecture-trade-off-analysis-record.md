# Release record — `architecture-trade-off-analysis` 1.0.0

Skill 1 of 21 in the software-architecture suite. The meta-skill: every other skill in the suite
defers to it for method.

|                  |                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| **Version**      | 1.0.0                                                                                             |
| **Package**      | `SKILL.md` (183-line body) + `skill.yaml` + 3 references — 705 lines total                        |
| **Dependencies** | none                                                                                              |
| **Status**       | validated, **not published** — `registry:build` blocked, see Known limits                         |
| **Validation**   | 5 gate iterations, 2 FAIL then 3 PASS · 5 test prompts, 2 adversarial · retrospective count sweep |

## Sources

Full text of both primary sources was obtained and quotations are transcribed, not
reconstructed from summaries.

| Source                                                                       | Edition                     | Role                                                                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| _Software Architecture: The Hard Parts_ — Ford, Richards, Sadalage, Dehghani | 2021, single edition        | primary; ch. 1 and ch. 15                                                                                                             |
| _Fundamentals of Software Architecture_ — Richards & Ford                    | **1st ed., 2020**           | primary; ch. 1–2. The two laws and Corollary 1                                                                                        |
| _Fundamentals of Software Architecture_                                      | 2nd ed., 2025, ch. 27       | Third Law — **chapter title verified, wording not**. Cited once, parenthetically, marked unverified; nothing rests on it              |
| Fowler, _IEEE Software_ 2003                                                 | —                           | reversibility. **Not the books' vocabulary** — attributed inline wherever used                                                        |
| Borowa et al., arXiv:2309.14175                                              | 2023                        | 155 bias occurrences across 12 architects: anchoring 24, irrational escalation 20, bandwagon 19                                       |
| Borowa et al., arXiv:2502.04011                                              | 2025                        | debiasing experiment; practitioners more susceptible than students                                                                    |
| Dasanayake et al.                                                            | —                           | 3 companies, 10 architects; methodology supported 2 of 10 against intuition's 7                                                       |
| Sahlabadi et al. (Sensors, 2022)                                             | 2022                        | ATAM's industrial uptake — the counterweight to _Hard Parts_' one-sentence dismissal                                                  |
| Segment (Noonan, 2018)                                                       | 2018                        | failure record: operational overhead linear in destinations; 140+ services                                                            |
| Prime Video team write-up, via devclass                                      | May 2023                    | failure record: out-of-context comparison                                                                                             |
| Jepsen report, MongoDB 4.2.6                                                 | 2020                        | failure record: dimensions and defaults chosen by the advocate                                                                        |
| Uber→MySQL (2016); Robert Haas's response                                    | 2016                        | failure record: a situated analysis generalised out of its situation                                                                  |
| Richards, _Developer to Architect_ lesson 146                                | —                           | Out-of-Context Scorecard anti-pattern. Video-only source; the equation with matrix-summing is the brief's inference, recorded as such |
| ArchUnit                                                                     | v1.5.0, released 2026-08-04 | the worked fitness function. Currency verified at gate iteration 4                                                                    |

## Validation iterations

| #   | Verdict          | Findings                 | Disposition                                                                                                                                     |
| --- | ---------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **FAIL**         | 1 MAJOR, 9 MINOR, 3 NIT  | MAJOR 7a — governance realism: metrics named, no tool, threshold or execution site; handoff deferred to two skills that do not exist            |
| 2   | **FAIL**         | 1 MAJOR, 4 MINOR, 4 NIT  | MAJOR 2-1 — **regression from the iteration-1 fix**: a trailing metric (deploy frequency) placed in a PR check, threshold `12/week` unjustified |
| 3   | **PASS**         | 0 MAJOR, 0 new MINOR/NIT | Both MAJORs discharged by substance. Compression checked for stranded routing conditions — none                                                 |
| 4   | **PASS**         | 0 MAJOR, 2 NIT           | Phase 4's eight defects fixed and verified; F5 judged to cut in the right place — denying the skill a _prior_, not an _output_                  |
| 5   | **PASS — ships** | 0 MAJOR, 1 NIT           | MAJOR 4-3 (reopened by the coordinator against the validator's NIT) discharged. Routing 15/15                                                   |

Two things this history shows, recorded because they will recur across the remaining 20 skills:

- **Every fix was paid for by compression elsewhere, and twice the compression caused the
  regression.** Iterations 2 and 5 both found defects introduced by the previous iteration's fix.
  Targeted regression checks on the compressed region are now standard for this suite.
- **Four document-review iterations found nothing that Phase 4 found.** All eight usability
  defects — including the one that made the skill refuse work — required running the skill.

## Coordinator override

At iteration 4 the validator raised the missing deadlock trigger as NIT, correctly noting that no
existing trigger misrouted, and referred the severity to the coordinator as a scope question.
Reopened as **MAJOR 4-3**: breaking a deadlock between two advocates is a core use of this skill,
so a description that never claims the situation is a defect regardless of whether its existing
triggers misfire. The full gate re-ran. The validator accepted the override at iteration 5.

## Retrospective count sweep — run after iteration 5, before publish

A standing check came out of skill 2's build and was applied backwards to this package:

> Any sentence that counts anything is re-derived from the artefact it counts, on first review
> and after any edit near it. A count is never read for plausibility.

**Six count errors were found in a package that had passed five gate iterations.** None was
detectable by reading; all six had been read attentively many times over by the author, the
validator and the coordinator. All six are fixed; the iteration-5 PASS stands, since none reached
MAJOR.

| ID      | Defect                                                                                                   | How it arose                                                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| COUNT-1 | Body promised **two** live disagreements over a reference documenting **three**                          | Latent. The third carries the operational test for "it depends" — a reader following the pointer found a disagreement the body denied. It now earns a clause in the body |
| COUNT-2 | ">90% cost reduction" — the source says **infrastructure** cost                                          | The word was dropped in the iteration-2 rewrite of that row and passed by reading in four consecutive gates                                                              |
| COUNT-3 | "The slide version is **two** words: compare like things" — three words                                  | Inherited faithfully from the research brief, which makes the same error                                                                                                 |
| COUNT-4 | A third occurrence of an overstatement fixed in two other places at iteration 1                          | Declared discharged on a grep whose pattern could not match the surviving wording                                                                                        |
| COUNT-5 | Heading "MECE, as **two** independent tests" over a **three**-row table                                  | Found by the author's own sweep, not the validator's. Survived all five gates                                                                                            |
| COUNT-6 | "a **1628** warship … two **gun** decks" — the brief says 1626–1628, and "two decks where ships had one" | Found by the author's own sweep                                                                                                                                          |

Two process findings from this sweep, both of which generalise:

- **A verification pattern that cannot match the defect is not a verification.** COUNT-4 was
  declared closed on a regex that could not match the text that survived.
- **The sweep's own coverage must be counted.** The validator re-derived 84 claims; the author,
  re-running it, found 91 — the difference was a file the validator's extract had truncated, and
  it contained two of the six errors.

## Residual findings — shipping unfixed

| ID          | Severity        | Item                                                                                                                                                                                                                                                                                                                                                                                                                   | Why it ships                                                                                                                                                                                                                                                               |
| ----------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9a          | **MINOR, open** | **Live misroute against `architecture-decision-making`.** ADM advertises "comparing alternatives only on the forces that differ" — analysis method, not record discipline — and carries no reciprocal exclusion. Iteration 5 narrowed the blast radius (the demonstrated deadlock prompt now routes here) but did not close it: prompts of the form "compare these options on the forces that differ" remain contested | The fix is in **another package**. Two parts, both specified in the validation report: remove the clause from ADM's description keeping it as body step 5, and append the reciprocal exclusion. Deferred to the planned ADM upgrade; editing ADM requires `registry:build` |
| 5-1         | NIT             | "on-call pages per destination" lost the word _added_, turning a marginal cost into an average                                                                                                                                                                                                                                                                                                                         | Behaviourally equivalent — the clause it sits in alerts on a rising gradient, and the gradient of an average recovers the marginal signal                                                                                                                                  |
| 4-2 residue | NIT             | The cognitive-load / Team Topologies hedge never actioned                                                                                                                                                                                                                                                                                                                                                              | No claim rests on it                                                                                                                                                                                                                                                       |
| 2-6         | NIT             | The ArchUnit snippet is not compilable                                                                                                                                                                                                                                                                                                                                                                                 | Its job is to show the rule is expressible in a real API; a compilable version costs lines the threshold and site justifications use better                                                                                                                                |
| 2-7         | NIT             | _Fundamentals_ abbreviated on first mention                                                                                                                                                                                                                                                                                                                                                                            | Edition and chapter given; ambiguity nil                                                                                                                                                                                                                                   |
| 2-8         | NIT             | Mode C's quote lives only in `qualitative-and-quantitative.md`                                                                                                                                                                                                                                                                                                                                                         | This is the body/reference split the house standard asks for, and the body routes to it                                                                                                                                                                                    |

## Known limits

- **The method has no outcome evidence.** No study shows that trade-off analysis — this
  technique, ATAM, matrices or ADRs — produces better architectures. The skill states this in its
  own voice rather than implying an evidence base. The bias findings are evidence about
  decision-makers, not for the method.
- **Two live disagreements are reported as disagreements**, both sides attributed: whether the
  analysis can be made rigorous (SEI/ATAM vs _Hard Parts_' one-sentence dismissal, with
  Dasanayake's 2-of-10 finding), and whether characteristics can be prioritised at all (utility
  trees vs Richards and Ford's "fool's errand" and unordered top three).
- **The Third Law is unverified.** Reported to exist in _Fundamentals_ 2nd ed. ch. 27; the wording
  could not be obtained. Should the 2nd edition be acquired, this skill and the suite's edition
  discipline need re-checking against it.
- **The size threshold is the author's, not sourced.** "One deployable, one team under about eight
  engineers, reversible by one person in a day" is marked in the body as a rule of thumb.
- **The A–D mode taxonomy is scaffolding, not the authors' vocabulary**, and is marked as such in
  the body. Two test agents declined to use the labels with a notional user for that reason —
  judged correct behaviour.
- **`registry:build` and `npm run verify` cannot be run.** Seven unrelated `gof-*` packages in the
  working tree lack `skill.yaml`, and `build-registry-index.mjs` aborts on the first. Pre-existing
  and outside this work's scope. The package was validated in isolation with
  `agent-skills validate` instead; **`registry:build` is required before publish**, since every
  file under `skills/` feeds package integrity.

## Verification at close

```
agent-skills validate skills/architecture-trade-off-analysis   ✓ Valid — no issues found   EXIT 0
prettier --check skills/architecture-trade-off-analysis/**     All matched files use Prettier code style!
wc -l   SKILL.md 199 (body 183) · bias-and-evidence 180 · qualitative-and-quantitative 167 · worked-analysis 159
```

Uncommitted. `?? skills/architecture-trade-off-analysis/`, `?? docs/validation/`.
