# Release record — `architecture-characteristics` 1.0.0

Skill 2 of 21 in the software-architecture suite. Deriving, defining and capping the list of
architecture characteristics a system is actually built for.

|                  |                                                                                  |
| ---------------- | -------------------------------------------------------------------------------- |
| **Version**      | 1.0.0                                                                            |
| **Package**      | `SKILL.md` (182-line body) + `skill.yaml` + 3 references — 707 lines total       |
| **Dependencies** | defers to `architecture-trade-off-analysis` for method                           |
| **Status**       | validated, **not published** — `registry:build` blocked, see Known limits        |
| **Validation**   | 5 gate iterations (FAIL, PASS, FAIL, FAIL, PASS) · 5 test prompts, 2 adversarial |

## Sources

| Source                                                    | Edition / version              | Role                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Richards, **Architecture Characteristics Worksheet**      | PDF, revised **March 2024**    | The current position, and the skill's spine: both caps, the flat list, the bracketed pairs                                                                                                                   |
| _Fundamentals of Software Architecture_ — Richards & Ford | **1st ed., 2020**, ch. 4, 5, 7 | The three-part test; the operational/structural/cross-cutting taxonomy, taught as the **earlier** position                                                                                                   |
| _Fundamentals_                                            | 2nd ed., March 2025            | Ch. 4 and 5 keep titles and numbers; whether they follow the 2024 worksheet is **unverified** and marked so                                                                                                  |
| _Software Architecture: The Hard Parts_                   | 2021                           | The saga table, read as the conflict statement behind G-xor-C                                                                                                                                                |
| ISO/IEC 25010                                             | **2011 and 2023, both named**  | Mapping only. The researcher never reached the standard text; **no clause number appears anywhere in the package** — re-grepped at each gate                                                                 |
| CMU/SEI-2000-TR-004 §5.3                                  | 2000                           | The sharpest evidence, and it cuts against the simple cap: stakeholders cannot distinguish beyond High/Medium/Low, and their initial pick missed two of the four attributes that mattered                    |
| Ameller et al., RE'12, Table IV                           | 2012                           | Failure record: 10/13 projects had NFRs invented solely by the architect; 9/13 documented none; 0/13 used any tool; 11/13 declared all met while **only one had validated as many as three** attribute types |
| ATAM                                                      | —                              | "The architecture shall be modifiable and robust" is "untenable … they have no operational meaning: they are not refutable"                                                                                  |
| HealthCare.gov, GAO-15-238                                | 2015                           | Failure record: launched with capacity unplanned and pass criteria missing                                                                                                                                   |
| Eckhardt et al.                                           | —                              | 530 NFRs, 11 specs, 5 companies; corpus-wide figures kept separate from the embedded-systems figure                                                                                                          |
| k6                                                        | **v2.2.0, 2026-08-10**         | The worked fitness function; open-model `constant-arrival-rate`. Currency verified at gate iteration 2                                                                                                       |

## Validation iterations

| #   | Verdict          | Findings                | Disposition                                                                                                                                                  |
| --- | ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **FAIL**         | 3 MAJOR, 8 MINOR, 4 NIT | Leading trigger did not separate from ADM (the body routed the case away on arrival); §2's frame unmarked as the author's; two misattributed figures         |
| 2   | **PASS**         | 1 MINOR, 1 NIT          | All three closed. "Borrowed, not chosen" judged the strongest threshold justification in the suite                                                           |
| —   | **Phase 4**      | 9 findings              | Four scenario runs and one routing run; two MAJOR raised — the candidate-set table, and the inability to deliver the answer                                  |
| 3   | **FAIL**         | 1 MAJOR                 | **Slot arithmetic off by one**, introduced by the correct fix that grew the table from four sets to five. Caught by applying the rule to the skill's own ADR |
| 4   | **FAIL**         | 1 MAJOR                 | **"Four of the five rows" was three of five** — latent since the first draft, three lines below the table it counted, survived three validator passes        |
| 5   | **PASS — ships** | none new                | All closed. Author's package-wide count sweep found two further errors nobody had raised                                                                     |

Totals across five iterations: **5 MAJOR raised and closed, 15 MINOR, 8 NIT** (5 closed).

## What this build changed about the process

**The counting check.** Skill 2 carried four count errors. One was introduced by a fix that was
itself correct; three were latent from the first draft. Between the author, the validator and the
coordinator, those sentences were read attentively at least nine times. None was found by reading.

The check that catches them is scoped to **claims**, not edits:

> Any sentence that counts anything is re-derived from the artefact it counts, on first review and
> after any edit near it. A count is never read for plausibility.

Cost on this package: 61 claims over 707 lines, two regexes, a few minutes, three one-word fixes
with no reflow. It is now applied from the first draft on every remaining skill, and was run
retrospectively over skill 1 — where it found four more (84 claims checked), including a body
sentence promising two live disagreements over a reference that documents three.

**Corollary, from the same evidence:** a verification pattern that cannot match the defect is not a
verification. One iteration-1 finding here was declared discharged on a grep whose pattern could
not match the surviving occurrence.

## Residual findings — shipping unfixed

| ID    | Severity | Item                                                                                            | Why it ships                                                                                              |
| ----- | -------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| NIT-3 | NIT      | `FF-11` label has no anchor line                                                                | Referent unambiguous on the same line; skill 1 has the identical `FF-07` shape — suite-wide or not at all |
| NIT-4 | NIT      | Scalability compressed to one invariant in the body                                             | The body cell is an axis, not a definition; all three invariants are in a routed reference                |
| NIT-5 | NIT      | Eckhardt figures aggregate to ISO 9126 classes using a 9126 class name without naming the model | In a skill whose standing rule is to name the version. Accurate, imprecise                                |
| —     | —        | Two trigger borderlines (R1-shaped and R5-shaped)                                               | Both route correctly; named in the report rather than hidden                                              |

**Open cross-package item.** `architecture-decision-making` is over-triggered: it claims the
phrase "must be scalable / must be maintainable" without owning the vagueness problem, and it
also claims "comparing alternatives only on the forces that differ", which is analysis method.
Three changes are now queued for the planned ADM upgrade — two from skill 1's Phase 4, one from
skill 2's. Until that lands, "must be scalable" carries no routing signal across three
descriptions.

## Known limits

- **No outcome evidence for the cap.** Nothing shows that limiting the list to three improves
  anything; it is a practitioner heuristic, and Miller's 7±2 is explicitly ruled out as support.
  The skill says so in its own voice. The defensible argument is different and is sourced: a long
  ranked list is fiction because stakeholders cannot rank repeatably beyond High/Medium/Low.
- **The taxonomy is contested by its own author.** The 2024 worksheet abandons the 2020
  operational/structural/cross-cutting split. The skill teaches the worksheet as current and the
  taxonomy as what a reader will meet in secondary literature. Whether the 2nd edition follows the
  worksheet is **unverified**, and if it is acquired this skill needs re-checking.
- **ISO 25010 is used for mapping only.** No clause numbers, because the standard text was never
  reached. The conflict on testability's placement is carried rather than resolved.
- **§2's counting is contingent, and says so.** "Two of five lose" holds while one of G/C is
  genuinely driving and no off-table driver takes a slot. The conflict half — G and C cannot both
  hold the first slot — is unconditional and sourced, and is what makes §2 a decision rather than
  a menu.
- **Phase 4's scenario runs are not independently verified.** The validator reconstructed the
  F-series from the findings and confirmed each resolution in the files, but the four transcripts
  were not supplied to him.
- **`registry:build` and `npm run verify` cannot be run.** Seven unrelated `gof-*` packages lack
  `skill.yaml` and the index builder aborts on the first. Pre-existing, outside this work's scope.
  Required before publish, since every file under `skills/` feeds package integrity.

## Verification at close

```
agent-skills validate skills/architecture-characteristics   ✓ Valid — no issues found   EXIT 0
prettier --check skills/architecture-characteristics/**     All matched files use Prettier code style!
wc -l   SKILL.md 198 (body 182) · definitions-and-composites 146 · eliciting-and-capping 193 · taxonomy-and-iso 170
descriptions   byte-identical, 1013 chars, verified programmatically
clause-number grep   returns only CMU/SEI-2000-TR-004 §5.3
```

Uncommitted.
