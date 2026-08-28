# Release record — `java-domain-modeling`

|                 |                                                                      |
| --------------- | -------------------------------------------------------------------- |
| **Status**      | **Not shipped.** Package withdrawn after gate iteration 1.           |
| **Date**        | 2026-08-28                                                           |
| **Version**     | none — 1.0.0 was drafted and deleted, never committed                |
| **Disposition** | Unique residue ported into the two skills that already own the topic |

## Why it was withdrawn

The research brief (2026-08-27) rated the skill _"marginal — justified only as a narrow
routing/decision skill"_, on the strength of one fact: roughly 75–80% of the commissioned topic
was already owned by seven existing skills, and the residue was three things — the entity / value
/ neither classification, the wrapper budget, and the concept-to-construct table.

By the time the skill was drafted, two of those three had acquired owners in the same uncommitted
batch:

- `domain-logic-organization/references/domain-model.md` (untracked) had gained a
  `## Classifying a concept: entity, value, or neither` section carrying Evans' two questions, the
  replaceability test, the conceptual-whole example and the "neither" answer.
- `java-code-smells/references/catalogue-within.md` (modified) had gained a `Budget:` bullet
  stating when a wrapper earns its place — with **two** tests where the draft used three.

Shipping all three would have left the runtime with two skills giving different answers to
"is this wrapper worth it?", and two skills claiming the classification decision while
`domain-model.md` routed it to a third. That is a contradiction no selection mechanism can
resolve, and it fails the suite's own scope-hygiene gate.

## What was kept, and where it went

| Residue                                                                                                                                      | New home                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Concept-to-construct table (`enum` / `record` / sealed + records / class with id-equals / primitive), with the record-equality row corrected | `skills/domain-logic-organization/references/domain-model.md`, appended to the existing classification section               |
| Review prompts for the classification                                                                                                        | Same file, same section                                                                                                      |
| The modern-Java note (records 16, sealed 17, pattern matching 21, `case X _ ->` needs 22)                                                    | Same file, same section                                                                                                      |
| Compilable transposition demo — `Before.java`, `After.java`, `AfterTransposed.java`, `verify.sh`                                             | `skills/java-code-smells/scripts/primitive-obsession/`, routed from the `Budget:` bullet in `references/catalogue-within.md` |

`java-code-smells`' `skill.yaml` gained `scripts/` in its `files:` list. Its version was already
bumped to 1.2.0 in this uncommitted batch (HEAD carries 1.0.0), so the addition needs no further
bump. `domain-logic-organization` is untracked and unreleased.

The demo's verified behaviour, on Temurin 25.0.3:

```
--- Before.java: compiles, runs, transposes silently
moved 5000 from CUST-7 to ACCT-92
exit status: 0 - nothing detected this

--- After.java: compiles, runs, rejects the currency mismatch
moved 50.00 GBP from ACCT-31 to ACCT-92
rejected: cannot add EUR to GBP

--- AfterTransposed.java: MUST fail to compile
OK: AfterTransposed.java:15: error: incompatible types: CustomerId cannot be converted to AccountId
```

`verify.sh` exits non-zero if the transposed call ever starts compiling.

## What was discarded, and why

- The body's Rules section — five of seven bullets restated `java-object-contracts`,
  `orm-structural-mapping`, `remote-facade-and-dto`, `java-enums` and
  `domain-logic-organization`.
- The three over-application counter-examples — each duplicated an existing owner
  (`java-code-smells` Lazy Element and Speculative Generality; `java-enums` and
  `java-composition-over-inheritance` on sealing an open set; `domain-logic-organization`'s own
  Purpose on the CRUD case).
- `references/classification.md` — Evans' and Vernon's definitions in full, plus the three live
  disagreements. Retained in the research brief, which is the durable record; reproducing it in a
  reference would have duplicated `domain-model.md`'s section.

## Known limits of the disposition

- The wrapper budget remains a **two**-test rule (`java-code-smells`). The draft's third force —
  _behaviour_ — was dropped rather than merged. A wrapper whose only justification is that
  operations belong on it (`DateRange.overlaps`) is not explicitly covered by either test, though
  such types are usually also conceptual wholes, which the Data Clumps entry does cover. Left as
  a deliberate simplification, not an oversight.
- `registry/skills.yaml` was regenerated after the deletion and no longer lists
  `java-domain-modeling`. It could not be rebuilt at the moment of deletion, because
  `scripts/build-registry-index.mjs` hard-fails on any directory without a `skill.yaml` and an
  unrelated package was mid-creation in this tree; it completed shortly afterwards and the index
  was rebuilt then.
