# Wave 3 — cumulative specialist review

The user authorized the next wave after wave 2. Scope: exactly the 63 inventory
rows marked `3` in `docs/skills-evolution-inventory.md`. Improve the skills;
package-manager implementation, other waves and real agent configuration are
outside this task. Baseline: `baseline.json`, captured before assignments. All
63 selected packages start unchanged from HEAD. Preserve every earlier wave.

## Procedure and ownership

Follow `AGENTS.md`, `docs/parallel-skill-reviews.md`, the complete
`docs/skill-review-prompt.md`, and `skills/skill-engineering/SKILL.md` with its
relevant evidence, evaluation, resource-design and anti-pattern references.
Previously read unchanged references may be reused. Read the entire assigned
package, including examples and references, before deciding what needs changing.

Own only `skills/<assigned-name>/**`, one skill per assignment. You are not alone
in the codebase; preserve other contributors' work. No shared writes, neighboring
edits, subagents, global builds, formatters, generators, dependency installation,
commits, publishing or global installation. Use `apply_patch` for manual edits.
Send findings before editing, then proceed autonomously with justified changes.
The coordinator alone writes repository reports, regenerates the index and runs
global verification after all authors stop. A local check must actually be local.

Inspect committed, assignment and final versions. Bump one patch when contents
change; reuse that unpublished bump for subsequent corrections. No change means
no bump. Keep descriptions synchronized and resource routing valid. Preserve the
skill's role and useful depth; do not paste this review workflow into its body.

## Lessons carried forward

Consult the comparative research in
`docs/skill-validation/skills-comparative-research-2026-10-16.md`, the roadmap,
and the wave 1 and wave 2 reports where relevant. These are evidence and limits,
not a reason to presume that another skill is defective.

- Acquire missing evidence from actual callers, factories, consumers, build
  configuration, artifacts and deployed runtime selection. A method or pattern
  name alone does not establish its effective contract.
- Challenge the premise that controls the next decision. Identify a realistic
  alternative and evidence that would change the diagnosis, including no change.
- Apply refuting evidence to the working artifact and affected conclusions while
  preserving unrelated accepted evidence. A question log alone is insufficient.
- Preserve decisive preconditions and the consumer's observation point. Test the
  wrong behavior as well as the legitimate alternative when a verifier is involved.
- Keep uncertainty, missing coverage and unknown frequency explicit. A successful
  command, stress test or empty capture is not proof of every claimed guarantee.
- Use conditional references or focused helpers only when they prevent a specific
  error. Neither brevity, popularity, extra agents nor file count proves efficacy.

Wave 2 supplied concrete technical corrections, but its six development cases were
saturated: original and revised skills both met all criteria. No incremental
behavioral gain was demonstrated. Do not turn source review, compilation or a
walkthrough into a claim of measured agent improvement.

Relevant lessons include: a broad `java..` architecture allowance admitted JDBC;
a ZGC parser rejected lowercase minor-cycle labels in a real log; reflective
configuration and factory policies changed runtime behavior; accepted output did
not establish cleanup or bounded resource use; versioned APIs differed despite
matching names. Use these as investigative lenses, not boilerplate additions.

## Domain-specific review

For JVM compilation and execution, separate JVM/JLS contracts from implementation
and compiler heuristics. Match flags, diagnostics, event meanings, assembly and
availability to the actual build; do not recommend a tuning change from a label
or a single compilation event. Preserve counterevidence and fallback explanations.

For Java language and APIs, follow callers and observable contracts: overload and
dispatch resolution, nullability, exceptions, equality, ordering, ownership,
resource lifetime, module access and source/binary compatibility where relevant.
Compile material examples for the declared target and state the runtime actually
used. A modern toolchain running `--release` does not exercise an older VM.

For platform skills, verify the actual kernel, container, CPU topology, protocol,
proxy and lifecycle boundary. Documentation for another platform is not execution
proof. Preserve legitimate alternatives and avoid changing user infrastructure.

Verify consequential uncertain/versioned claims through primary sources; record
the relevant version, URL and exact limitation. Do not upgrade a consumer baseline,
download a new toolchain or run production/high-impact captures merely to validate
documentation. Available tools include Node 25.6.1 and Temurin 25.0.3+9 at
`C:/Users/robso/.jdks/temurin-25.0.3/bin`; inspect any other prerequisite first.

## Validation and handoff

Run appropriate narrow structural and technical checks; retain stdout/stderr and
fixtures in an isolated temporary directory. Include hostile/negative controls for
security or material executable changes. Do not manufacture edits when the existing
guidance is adequate. Report failed attempts and unavailable runtimes honestly.

Return two small reproducible development cases, inputs separate from evaluator
criteria, changing one decisive constraint. Prefer real artifact inspection and
action to a prompt that states its own answer. These are not unseen holdouts or
agent evaluations. Do not launch an evaluator; the coordinator handles comparisons.

Write your handoff JSON to the exact temporary path in your assignment. Include
status (`READY_FOR_GLOBAL_VALIDATION`, `NO_CHANGES_NEEDED` or `BLOCKED`), skill,
owned path, `allWritesStopped: true`, findings and files changed, preserved
capabilities, committed/initial/final versions, exact commands/results/failures,
primary sources, evidence paths, cases with separate inputs/criteria, limits,
cross-skill findings and pending globals. Parse/read it back. Never ship review-only
artifacts inside the skill. Stop every write/process before handoff and remain
read-only until explicitly reassigned. Global validation remains pending locally.
