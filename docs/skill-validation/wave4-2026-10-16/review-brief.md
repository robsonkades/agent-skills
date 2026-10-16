# Wave 4 — cumulative specialist review

Scope: exactly the 68 inventory rows marked `4` in
`docs/skills-evolution-inventory.md`. Preserve all previous waves, package-manager
code and real agent configuration. The assignment baseline is `baseline.json`;
inspect it and the actual owned diff before editing.

## Procedure and ownership

Read applicable `AGENTS.md`, the complete `docs/skill-review-prompt.md`,
`docs/parallel-skill-reviews.md`, and `skills/skill-engineering/SKILL.md` with its
evidence, evaluation, resource-design and anti-pattern references. Reuse unchanged
instructions already read, but read the entire assigned package and its examples.
Own only `skills/<assigned-name>/**`, one skill at a time. You are not alone: never
revert other contributors' work. Send findings before editing, then implement
supported in-scope fixes without an approval pause. Do not spawn subagents.

The coordinator alone writes shared reports, builds the index and runs global
verification after all writers stop. No global build/format/install, dependency
installation, generated shared files, neighboring edits, commits or publishing.
Use `apply_patch` for hand edits. Reuse an already sufficient unpublished bump;
otherwise bump one patch for changed content, once per assignment. No changes
means no bump. Keep descriptions synchronized. Declare actual optional referrals
in `suggests`; a local package check does not prove catalog-wide routing consistency.

## Lessons carried forward

Read the relevant comparative research in
`docs/skill-validation/skills-comparative-research-2026-10-16.md`, the roadmap and
earlier wave reports. Popularity, brevity and extra agents do not prove quality.
Useful mechanisms found there include evidence acquisition, explicit coverage,
challenging a candidate finding, adaptive questions, durable resolved vocabulary,
and comparing interfaces from the caller's perspective. Preserve each skill's
role: review and architecture discovery need not become implementation workflows.

- Follow the effective caller, factory, consumer, configuration and authority.
  Names and diagrams alone do not establish a runtime or business contract.
- Challenge the premise controlling the next decision. Identify evidence that
  would support an alternative or preserve an already adequate design.
- Apply contradictory evidence to affected conclusions/artifacts. Merely adding
  a warning or a question log is insufficient when the decision is already refuted.
- Preserve unrelated accepted evidence, compatibility and user decisions.
  Distinguish a proposal, an approved decision and implemented state.
- A source/API contract can resolve a static fact. Runtime, integration,
  performance and agent behavior require their own appropriate evidence.
- Keep failure paths, missing evidence and unknown frequency explicit. A passing
  command, source snippet or empty capture does not establish wider guarantees.
- Do not expand content merely to force a change. Retain useful existing depth;
  remove repetition only when it contributes no decision, prerequisite or example.

The first three waves found technical defects, but their tested comparisons did
not demonstrate incremental behavioral gain. Their development cases were often
saturated. Do not change valid criteria to force differentiation. Return cases
with ordinary project artifacts and an unresolved investigation, rather than a
prompt that states the diagnosis, cause and desired answer.

## Domain-specific lenses

Apply only the lenses material to the assigned skill, not this entire list:

- **Architecture discovery and governance:** locate actual sources of change,
  coupling and failure in a representative flow. Separate observations from
  architectural hypotheses; compare the smallest adequate intervention and no
  change. Preserve known decisions and authority. Metrics, diagrams and fitness
  functions must match the promised property and have bounded coverage; a proxy
  metric or green rule does not prove a quality attribute. Missing runtime or
  organizational evidence limits conclusions, not unrelated useful work.
- **GoF:** identify the concrete variation and caller contract before selecting
  a pattern. Consider a simple function/data/conditional implementation when it
  already satisfies the need. Verify ownership, identity, equality, dispatch,
  construction, state lifetime, reentrancy and failure semantics where relevant.
  An illustrative pattern is not automatically thread-safe, durable or distributed.
- **Application and persistence patterns:** trace one real request and its failure
  path across domain, mapping, transactions and presentation. Distinguish flush,
  commit and external effect; effective transaction interception and database
  isolation matter. Do not infer aggregate boundaries from ORM mapping or local
  exception handling from method signatures alone. Framework examples must state
  their actual baseline and limits; no framework upgrades to make them work.
- **DDD:** preserve domain vocabulary, accepted invariants and the owner of each
  decision. Distinguish aggregate consistency, cross-aggregate coordination,
  persistence identity and event publication. Inspect actual consumers and
  concurrency paths; do not infer invariants from naming or choose an aggregate
  solely from object containment. Test a legitimate alternate business contract
  as well as the defect, without weakening the accepted requirement.

## Verification and handoff

Verify consequential/version-sensitive claims with primary sources. Record exact
versions, URLs/sections, consultation date and limitations. Use available existing
toolchains; compile materially changed executable examples and exercise the
specific failure when feasible. A simulated repository/transaction is not an ORM
or database integration test. `--release` on JDK 25 is not execution on an old JVM.
Do not invent benchmarks or new infrastructure merely to look thorough.

Provide a small reproducible case pair with inputs/fixtures separate from evaluator
criteria. Change one decisive constraint and explain privately why the decision
changes or stays valid. State which cases are known development examples and
whether any independent actor run actually happened. Reviewers do not run actors.

Write your detailed handoff to the coordinator-assigned unique temporary
`<skill>.json`, with status, skill, versions, corrected/remaining findings,
capabilities preserved, changed files, commands and full results, source support,
evidence paths, limitations, separate case inputs/criteria and pending global checks.
Prefer small raw logs/scripts in your own temporary evidence directory; embed
structural command results when no separate artifact is needed. Do not vendor
third-party implementation sources into the skill or shared report. Avoid copying
whole dependency caches into evidence. Explicitly confirm `allWritesStopped:true`
and no active background process. Read back and verify the handoff before finishing.
