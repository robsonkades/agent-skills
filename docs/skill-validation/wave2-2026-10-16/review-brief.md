# Wave 2 — cumulative specialist review

The user explicitly requests wave 2 and asks us to apply both the earlier work and
the latest comparative-research pass. The scope is exactly the 138 inventory rows
marked `2` in `docs/skills-evolution-inventory.md`. The package manager is already
working and is outside this task. `Base`, `Piloto`, other waves and real agent
configuration remain outside the edit scope.

## Authority and ownership

Follow `AGENTS.md`, `docs/parallel-skill-reviews.md`, the complete
`docs/skill-review-prompt.md`, and `skills/skill-engineering/SKILL.md` with the
relevant evidence, evaluation, resource-design and anti-pattern references.
An already-read unchanged reference need not be reread on every assignment.

You own exactly `skills/<assigned-name>/**`, one skill at a time. You are not
alone in the codebase: preserve other contributors' changes. Inspect every file
of your assigned package, its starting version and diff before editing. Neighboring
skills and shared repository files are read-only. Do not delegate. Send material
findings before editing, then implement supported changes without an approval pause.

Only the coordinator writes reports in the repository, regenerates the index and
runs global verification after all reviewers stop. No repository-wide formatter,
build, install or generator. Use `apply_patch` for manual edits and existing local
validators. Do not stage, commit, publish, install globally, alter real agent
configuration or install/upgrade dependencies to make a snippet run.

The assignment baseline is captured in this directory's `baseline.json`. Its
`allFiles` hashes include all pre-existing wave-one work. These wave-two packages
start at committed versions; bump one patch if contents change, retaining any
subsequent unpublished bump rather than incrementing for each edit. Keep description
and manifest synchronized. Declare new cross-skill prose referrals in `suggests`
when appropriate; do not add forced dependencies merely to pass validation.

## Accumulated lessons to apply selectively

The history is in `docs/skills-evolution-roadmap.md`,
`docs/skill-validation/wave1-2026-10-15.md`,
`docs/skill-validation/wave1-challenge-2026-10-15.md`,
`docs/skill-validation/skills-comparative-research-2026-10-16.md`, and
`docs/skill-validation/wave1-quality-2026-10-16/README.md`. Consult the comparative
research and relevant history before your first wave-two assignment. They contain
decisions and limits, not evidence that another skill is deficient.

Earlier work emphasizes specialist decisions: distinguish observation, inference,
hypothesis and recommendation; look for discriminating evidence; revise the affected
conclusion when a premise is refuted; retain unaffected accepted decisions. A local
lesson needs provenance, applicable conditions and invalidation criteria before reuse.
Missing frequency remains unknown; possibility, an empty capture or a successful
test alone does not settle probability, absence or a concurrency guarantee.
Recording a lesson is not implemented cross-session memory or model learning.

The research identified concrete mechanisms worth adapting when relevant:

- Acquire the missing evidence from ordinary project artifacts. Follow actual
  callers, consumers, runtime selection, versions, configuration and the delivered
  artifact; do not merely tell the agent to "inspect carefully."
- Challenge the premise carrying a diagnosis or proposal. State what competing
  explanation or changed constraint would change the next step, including no change.
- Delimit coverage of consequential investigations and record unresolved paths
  proportionately. Do not turn every task into a whole-repository audit or a ledger.
- Apply resolved answers and new evidence to the existing working artifact and
  affected downstream conclusions; a question log alone is not the requested update.
- Preserve decisive contract conditions and the consumer's observation point.
  Connect recommendations to executable checks or sufficient version-matched proof.
- Use a focused example or deterministic helper only when it teaches a difficult
  decision or removes a repeated error. Preserve useful depth; consolidate superseded
  text instead of copying a generic checklist into all skills.

The external references do not prove that short files, templates, extra agents or
popularity produce better outcomes. Our two comparisons were saturated: both earlier
and revised instructions passed the selected cases. No overall behavioral gain was
demonstrated. The latest pass did demonstrate a concrete verifier gap: the Java seam
example failed to protect the original constructor until a targeted control was added.

## Domain-specific work

Choose consequential gaps in this particular skill, if any. Preserve its role
(diagnosis, design, review or implementation) and boundaries. Examples of relevant
lenses, not sections to paste into every package:

- GC/profiling: capture coverage, event units and sampling bias; exact JVM/tool
  versions; pause versus allocation/retention; explicit collection and attachment
  side effects; reproducible interpretation and counterevidence.
- Concurrency: specification versus observed timing; actual ownership, cancellation,
  interruption, deadlines and cleanup; executed path and interleaving; Java preview
  and version constraints. A passing stress test is not a memory-model proof.
- Distributed systems: failure model, acknowledgement versus durable/visible effect,
  duplicate/out-of-order delivery, unknown outcomes, fencing, ownership and recovery.
  Follow actual clients and enforcement, not the label of a pattern or library.
- Data/Spring: actual database/framework version, transaction/proxy/wiring boundary,
  migration and compatibility phase, query/plan provenance, production selection and
  tests preserving the relevant boundary. Do not infer provider behavior from a stub.
- Performance/observability: comparable workloads and windows, censored/missing data,
  aggregation semantics, causal alternatives, evidence that can invalidate the proposed
  fix, and verification of cost and correctness under the claimed conditions.

Verify consequential uncertain or version-dependent claims with primary sources.
Record the relevant version and URL. No source or executable environment means a
specific limitation, not permission to invent certainty. Do not contact production
systems or run high-impact capture commands to validate documentation.

## Validation and handoff

Run narrow checks justified by your changes, including hostile/negative controls
when security or a consequential executable rule changes. Classify snippets and
report compiler target separately from the runtime used. Reuse available caches and
tools; keep any validation artifacts in an isolated temporary directory. Preserve
useful failing evidence. Stop when the relevant risk and local requirements are covered.

Return two small reproducible development cases: separate task/context from evaluator
expectations; change one material constraint in the second case. Prefer acquisition
of evidence or a real artifact change over a prompt containing the answer. These cases
are not behavioral executions or unseen holdouts. The coordinator selects independent
execution cases; do not launch agents or claim an improvement from a walkthrough.

At completion, stop all writes and processes. Return a concise handoff including
status, skill, files, committed/initial/final version, concrete changes, preserved
capabilities, commands/results, sources, limitations, pending global checks, cases
and cross-skill findings. For long validation output, retain it with your isolated
temporary validation artifacts and send the exact path for the coordinator to archive.
Never write review-only artifacts into the shipped skill package merely for reporting.

No-change is a valid result when the review finds no supported gap; explain the
specific evidence for it and do not manufacture edits or arbitrary quality scores.
