# Wave 1: applying the comparative research

This is an implementation pass over the 29 wave-one skills, requested on
2026-10-16. The user explicitly prioritizes skill quality; the package manager is
already working and is outside this change. Existing uncommitted skill revisions
are the starting point, not work to overwrite.

## Required reading and ownership

Follow `AGENTS.md`, the complete `docs/skill-review-prompt.md`,
`docs/parallel-skill-reviews.md`, and `skills/skill-engineering/SKILL.md` with its
relevant references. Read
`docs/skill-validation/skills-comparative-research-2026-10-16.md` before deciding
what to change. Inspect every file in your assigned skill and its existing diff.

Each reviewer owns only `skills/<assigned-name>/**`. You are not alone in the
working tree. Preserve other contributors' edits and coordinate cross-skill
issues through the coordinator. Do not edit reports, neighboring skills, shared
configuration, package-manager code, or the generated registry. Do not delegate.
Only the coordinator regenerates the registry and runs the final global checks
after all writers stop. Use `apply_patch` for hand edits.

All 29 skills already have unpublished patch bumps from the previous pass. Reuse
those bumps when sufficient for the combined change; do not bump on every edit.
The assignment-time snapshot is in this directory's `baseline.json`.

## Apply the research to this particular skill

The research does not prove that short files, additional agents, templates,
glossaries, or scripts improve every skill. Do not copy the external packages or
append the same generic evidence checklist to every entrypoint.

Find a consequential weakness in this skill's actual task and make its procedure
usable in that task. Consider, only when relevant:

- How the agent finds missing information in project artifacts, follows a real
  caller/consumer or workflow, and distinguishes an unsuccessful search from
  proof of absence.
- Which condition changes the next action, and what to do when evidence is
  unavailable or contradicts the initial interpretation.
- A concrete minimum deliverable whose contents can be checked against the
  source, implementation, execution result, or user's resolved decision.
- A bounded coverage record for investigations that can otherwise omit material
  paths; explicit unresolved work instead of an unjustified clean verdict.
- How user answers change the next questions and update the existing document;
  canonical terminology only where ambiguous terms actually change behavior.
- How a downstream skill or later session consumes the result without treating
  a proposal as implemented or old evidence as current.
- A focused example, contrastive scenario, or deterministic helper only when it
  teaches a difficult decision or removes a repeated mechanical error.

Preserve useful specialization, Java compatibility, existing safeguards, and
proportionality. Keep common work lightweight; route substantial conditional
detail. Consolidate superseded wording instead of accumulating overlapping rules.
Do not fabricate a defect to force an edit. A no-change conclusion needs a
specific explanation of why the relevant mechanisms are already adequate.

Verify consequential new technical claims with version-appropriate primary
sources. The comparative report supplies researched mechanisms and their limits;
it is not proof of this skill's behavioral efficacy.

## Findings, validation, and handoff

Send findings before the first edit, then proceed without an approval pause.
Describe the concrete failure prevented, not a generic quality aspiration.
Run meaningful checks supported by the skill's actual content. Inspect outputs.
Do not run repository-wide formatting, builds, index generation, or verification.

Return a reproducible development case and a boundary/constraint-flip case with
separate task input and evaluator expectations. Prefer tasks that require opening
ordinary project artifacts or producing a real change/document. Do not hand the
actor the bug, decisive conclusion, and answer inside its task input. Cases sent
after the edit are development checks, not unseen holdouts.

The coordinator will select independent execution checks across this wave. Do
not claim that written cases, walkthroughs, structural checks, or a passing code
example measure improvement caused by the skill. Preserve failure evidence.

Your final handoff must identify your own changed files, preserved capabilities,
versions, executed commands/results, sources, limitations, proposed cases, and
cross-skill coordination needs. Explicitly state that all writes have stopped.
