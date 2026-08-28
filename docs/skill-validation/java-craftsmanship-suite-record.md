# Delivery record — Java software-design and craftsmanship suite

**Date:** 2026-08-28. **Executed against:** Temurin 25.0.3+9 (Windows x64), `javac --release 21`.
**Repository state at start:** 237 skill packages; at end, 240.

## Scope, and why it is not the 19-skill catalogue that was requested

The commissioned catalogue listed 19 skills. Surveyed against the repository first, **16 of the 19
already had an owner**, usually at finer granularity than requested — `java-solid` plus
`java-dependency-inversion` plus `java-design-by-contract` where one `java-solid-in-practice` was
asked for; `java-test-design` plus `java-testing-strategy` plus `java-test-doubles` plus `tdd`
where four testing skills were asked for. Building the catalogue literally would have created 19
packages duplicating and contradicting roughly 40 existing ones, failing the commission's own
scope-hygiene gate at scale.

Scope was narrowed, with approval, to the genuine delta: three candidate skills for which research
briefs already existed. `java-project-structure-and-build` was dropped as unjustified (packages and
modules are owned by `layering-and-boundaries` and `component-and-release-boundaries`; what
remained was a Maven tutorial). `java-design-review` was deferred pending evidence that
orchestration work remains after `code-review`, `java-code-smells` and `java-solid`.

**Of the three candidates, one shipped.** The other two were withdrawn — not because the briefs
were wrong, but because the working tree moved under them.

## The pattern worth recording

All three briefs were written on 2026-08-27 against a tree of 208 skills. Each rested on a
verified claim of absence. By 2026-08-28 two of those claims were false, because packages added in
the same uncommitted batch had taken the ground:

| Skill                      | The brief's decisive finding                                   | State one day later                                                                 |
| -------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `java-domain-modeling`     | "The entity/value classification appears nowhere in this repo" | `domain-logic-organization/references/domain-model.md` had gained the whole section |
| `java-in-process-events`   | "`gof-observer` does not exist in this repo"                   | `gof-observer` existed, with the dispatch semantics and transaction phases          |
| `java-legacy-code-testing` | "The word 'seam' is not defined anywhere in 208 skills"        | Still true at 240 — re-verified before drafting                                     |

**A boundary check has a shelf life.** Re-run it against the tree at drafting time, not against the
brief. Both withdrawals were caught by the gate rather than by the author, and in the
`java-domain-modeling` case only because the validator read the neighbours' **reference bodies**
rather than their frontmatter — the author had checked frontmatter only.

## Deliverable — `java-legacy-code-testing` v1.0.0

Owns the step before `java-refactoring` can start: getting a class into a test harness when it
cannot be constructed, reached, or run. Feathers's seam model and enabling points, the
dependency-breaking catalogue, Sprout and Wrap, and the four chapter-23 disciplines that make a
change safe while no test can exist yet.

**Why it earns its place:** `java-refactoring` step 1 said "no net, no refactoring" with no
exception, which is a deadlock for the one case where the net cannot be got in; and
`tdd/references/when-tdd-pays.md` routed seam work to `java-refactoring`, which did not contain it.
A second instance of the same dangling pointer was found during the gate in
`java-test-doubles/references/mockito-hazards.md`. Both are now repointed, and `java-refactoring`
carries the carve-out.

**Validation:** 3 iterations. Iteration 1 FAIL — 1 BLOCKER, 4 MAJOR. Iteration 2 FAIL — 1 MAJOR,
which was a **regression introduced by an iteration-1 fix**: the example claimed Extract Interface
(p. 362) but performed Extract Implementer (p. 356), breaking callers in the section that teaches
Preserve Signatures. Iteration 3 **PASS**, with the corrected claim proved by compilation — a
byte-identical caller compiles against both the before and after trees with unchanged bytecode,
while the same caller against the Extract Implementer shape fails with
`RateGateway is abstract; cannot be instantiated`.

Full record: `java-legacy-code-testing/release-record.md`.

## Withdrawals, with their residue placed

Neither was abandoned; the material that was genuinely unowned was ported to the skill that owns
the surrounding topic.

**`java-domain-modeling`** — withdrawn after gate iteration 1 (2 BLOCKER, 6 MAJOR). The
concept-to-construct table, the classification review prompts and the modern-Java note went to
`domain-logic-organization/references/domain-model.md`; the compilable transposition demo went to
`java-code-smells/scripts/primitive-obsession/`, routed from the Primitive Obsession budget. The
gate also caught two defects that had nothing to do with scope and would have shipped: a table row
claiming a `record` keyed on its id has identity equality (the generated `equals` compares every
component), and a "never transposable" example (`FirstName`/`LastName`) that is the textbook
transposition.

**`java-in-process-events`** — withdrawn at the boundary check, before drafting. The in-process
mechanism table, Guava `EventBus`'s maintainers recommending against it, `PropertyChangeSupport`'s
`java.desktop` disqualifier, Spring Modulith's Event Publication Registry, the bus expiry
condition and two debuggability affordances went to
`gof-observer/references/observer-variants.md`.

## Reciprocal edits to existing skills

Required by the house rule that an overlap is narrowed in both directions. None needed a version
bump — every package touched is untracked or already bumped within the same uncommitted batch.

| Skill                             | Edit                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `java-refactoring`                | Carve-out on "no net, no refactoring"; exclusion in both descriptions               |
| `tdd`                             | Dangling pointer repointed; exclusion in both descriptions                          |
| `java-test-doubles`               | Second dangling pointer repointed; exclusion in both descriptions                   |
| `java-testing-strategy`           | Exclusion in both descriptions                                                      |
| `legacy-enterprise-modernization` | "Interception point" disambiguated (theirs diverts, Feathers's observes); exclusion |
| `domain-logic-organization`       | Concept-to-construct table and classification review prompts                        |
| `java-code-smells`                | `scripts/primitive-obsession/` added and routed; `scripts/` in `files:`             |
| `gof-observer`                    | In-process mechanism selection, expiry condition, debuggability affordances         |

## Known limits

- The two ports were not put through the full validation gate: they are additions to existing
  packages, not new ones. Their claims trace to the source-verified sections of the respective
  briefs.
- `registry/skills.yaml` is regenerated and green as of this record, but another session was
  actively editing `skills/object-layout-and-footprint` throughout — the index drifted twice
  mid-session for that reason. If `registry:check` is red, check whose entry moved before
  suspecting this work.
- `npm run verify` remains red on `prettier --check` for ~14 files that were already unformatted
  before this work began (`java-lambdas-and-functional-interfaces`, `java-streams`,
  `java-object-contracts`, and several `docs/` briefs). Left untouched by decision; only files
  written or edited here were formatted.
- Nothing was committed.
