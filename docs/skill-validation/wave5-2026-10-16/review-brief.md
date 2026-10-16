# Wave 5 — close the Base/Piloto coverage gap

The coverage audit identifies 298 distinct packages reviewed in waves 1–4 and
seven remaining packages: `architecture-trade-off-analysis`, `debugging`,
`java-memory-model`, `retries-and-backoff`, `spring-transactions-and-events`,
`sql-query-performance`, and `skill-engineering`. These were deliberately outside
the numbered inventory batches. This wave closes individual review coverage;
it does not declare the roadmap's full pilot, memory or multi-runtime programme
complete. See `coverage.json` and `baseline.json` for source hashes and scope.

## Required review and ownership

Read applicable `AGENTS.md`, the complete `docs/skill-review-prompt.md`,
`docs/parallel-skill-reviews.md`, and `skills/skill-engineering/SKILL.md` with its
relevant references. Read every file in the assigned package. Use the cumulative
lessons in `docs/skill-validation/skills-comparative-research-2026-10-16.md` and
the prior wave reports. A previously read unchanged procedure need not be reread.

Own only `skills/<assigned-name>/**`. You are not alone in the working tree;
preserve others' changes. The seven selected packages were clean at assignment;
thousands of unrelated prior-wave files are not. Do not revert, stage, commit,
publish, install globally, or touch actual agent configuration. Do not delegate.
Send findings before editing, then implement justified in-scope fixes without
waiting for approval. Do not force an edit when the evidence supports preservation.

The coordinator alone writes shared reports, generates the registry, and runs
global verification after all writers stop. Do not run repository-wide builds,
formatters, installs or dependency updates. Keep temporary technical fixtures and
their logs in a unique directory beneath
`C:/Users/robso/AppData/Local/Temp/skills-wave5-validation-ujPBF2/`.
Use `apply_patch` for hand edits. Bump one patch if content changes; no change means
no bump. Synchronize descriptions and declare any real optional referrals.

The six domain skills run first. `skill-engineering` remains unchanged while
they use it, and is reviewed alone after their writes stop, as required by the
parallel review workflow.

## Cumulative quality criteria

- Inspect the effective caller, configuration, consumer and evidence before
  deciding. A familiar name, successful command or empty search is not proof.
- Challenge the premise that controls the next action. Preserve adequate designs
  and legitimate alternatives; missing evidence should limit the affected claim.
- Apply new evidence to the decision and requested artifact. Preserve accepted
  constraints, authority, compatibility and unrelated valid conclusions.
- Verify uncertain claims against primary sources for the applicable version.
  Distinguish language/API contracts, implementation behavior, local observations
  and causal claims. Record source failures and unavailable runtimes explicitly.
- Keep each skill's role. Do not turn diagnosis or architectural reasoning into
  a mandatory implementation process, nor append the review procedure wholesale.
- Preserve specialist depth; remove text only where it adds no decision,
  prerequisite, useful example or reliability guard. Length is not a quality score.

The earlier behavioral comparisons did not establish incremental gain and often
reached the maximum in all conditions. Do not weaken criteria, choose only winning
cases or call a tie equivalence. Return investigation cases with ordinary project
artifacts; avoid giving the cause and solution in the task. Record known example
exposure. Technical correctness fixes can stand on source and executable evidence
without inventing a claim that agents perform better.

## Local evidence and handoff

Validate relevant metadata, routing, links, examples and failure paths. Use the
declared baseline; `--release 17` on JDK 25 is not execution on JDK 17. A simulated
transaction or database is not a framework or database integration test. Prefer
small discriminating technical checks and a meaningful negative control.

Supply a reproducible pair of task inputs and fixtures separately from expected
behavior and failure conditions. Change one decisive constraint. Do not run agent
actors yourself; report written cases separately from executed checks.

Write `<assigned-name>.json` in the temporary root with status, skill, assignment
and final versions, findings and fixes, files changed, preserved capabilities,
commands/results and logs, primary sources, evidence paths, case inputs/criteria,
limitations, cross-skill findings and pending global checks. Prefer an explicit
`evidenceFiles` array of authored scripts/logs. Do not copy downloaded documents,
dependency caches or third-party implementation sources into the repository.
Read back the handoff and confirm `allWritesStopped: true`, no running processes,
and no further edits without reopening ownership.
