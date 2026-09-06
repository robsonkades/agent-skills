---
name: skill-engineering
description: >
  Designing and reviewing agent skills: scope boundaries, the SKILL.md frontmatter
  contract, progressive disclosure across references and scripts, explicit decision
  rules, and quality gates. Use when creating a new skill, when reviewing one that is
  too long or never activates, when deciding what belongs in SKILL.md versus a
  reference, or when converting an existing prompt into a skill. Does not cover
  packaging, versioning or distribution, and does not cover writing the domain
  expertise itself.
---

# Skill Engineering

## Purpose

Turn expertise into a skill an agent actually selects and follows. The two failure modes
this exists to prevent are the skill that is never selected because its description is
vague, and the skill that is selected but degrades the work because it is a wall of
generic advice.

A skill earns its place by improving decisions or reliability. Remove generic reminders
that add no useful constraint, but retain critical prerequisites and boundaries even when
they seem familiar; familiarity is not evidence that agents consistently follow them.

## Scope

**Covers:** deciding a skill's boundary, writing the frontmatter, structuring the body,
choosing which supporting resources are justified, converting expert judgement into
decision rules, and reviewing an existing skill.

**Does not cover:** the domain knowledge itself (that is the author's), nor packaging,
versioning and distribution.

## Workflow

1. **Establish scope from the request and repository.** Use existing authorization and
   inspect the current skill before asking. Clarify only unresolved information that
   materially changes the work; continue independent authorized work in the meantime.
2. **Fix the boundary.** Identify what it does, excludes, activates for and hands off.
   Four explicit lists can help a new design; a small review need not produce them.
   Change only the assigned scope and report neighboring issues without editing them.
3. **Review the frontmatter early.** It is the discovery summary, though explicit user
   selection and client behavior also affect activation. See the contract below.
4. **Draft the body at minimum viable size.** Purpose, workflow, decision rules,
   constraints. Keep short conditional guards near the decisions they protect; route
   substantial conditional detail to references.
5. **Decide resources by necessity.** Each supporting file must answer "what capability
   does this provide that the body cannot?" Read `references/resource-design.md` when
   choosing between a reference, a script and an asset.
6. **Review against the gates below**, then against `references/anti-patterns.md`.
7. **Validate the actual change.** Check links and metadata, run relevant example/script
   checks when applicable, and follow repository integration rules. Report checks that
   ran separately from written cases or unexecuted plans; implement justified in-scope
   corrections when the task requests improvement, rather than stopping at suggestions.

## The frontmatter contract

The Agent Skills format requires a directory with `SKILL.md` and YAML frontmatter containing
`name` and `description`. Check the target client's supported format and repository validator;
do not infer a universal rejection/loading behavior across implementations.

```yaml
---
name: skill-name # lowercase, hyphen-separated; must equal the directory name
description: >
  What it covers, when to use it, and — when it is easily confused with a
  neighbouring skill — what it does not cover.
---
```

Progressive disclosure is the intended model; actual loading depends on the client:

| Stage      | What is loaded                   | Consequence                             |
| ---------- | -------------------------------- | --------------------------------------- |
| Selection  | **name + description**           | Describes when selection is appropriate |
| Activation | The whole Markdown body          | Every line costs context on every use   |
| Execution  | A reference or script, on demand | Free until actually needed              |

A description that lists capabilities (`"expert in performance"`) does not discriminate. A
description that names situations (`"use when p99 regressed after a deploy, or CPU is high
with normal GC"`) does. Write the situations.

## Decision rules

```text
IF guidance adds no decision rule, prerequisite or useful reliability constraint
THEN remove it; do not remove a critical guard based only on assumed model competence.

IF a section is relevant only to some tasks the skill covers
THEN consider a routed reference; keep short critical conditions at the decision point.

IF the skill needs a persona ("you are an expert…") to feel authoritative
THEN it lacks substance; replace the persona with decision rules.

IF the same mechanical operation would be re-derived on every run
THEN reuse an existing reliable tool or add a script if its maintenance cost is justified.

IF the skill's boundary overlaps another skill's
THEN clarify this skill's boundary or intentional composition; report changes needed
outside the authorized scope rather than editing both automatically.

IF a rule cannot be checked against the produced work
THEN restate it as something observable, or drop it.

IF recommendations depend on evidence, including a generative task with risky assumptions
THEN read references/evidence-and-confidence.md and add that discipline.

IF acting on the skill's output is expensive or hard to reverse
THEN read references/evaluation.md and add proportionate evaluation cases.
```

## Quality gates

- [ ] The description names triggering situations, not capabilities
- [ ] Name matches the directory, and the boundary excludes at least one adjacent topic,
      naming the nearest neighbouring skill when one exists
- [ ] Substantial conditional detail is routed; critical guards remain visible
- [ ] Every rule is specific enough to be checkable against the output
- [ ] Every supporting file is routed from the body by an explicit condition
- [ ] Repetition has a safety or routing purpose; detailed rules have one authoritative home
- [ ] Removing any file would lose a capability

## Output

When creating a skill, produce the directory, then a short report: the boundary (does /
does not / activates / does not activate), each file created with the one capability it
provides, validation results and unresolved decisions that actually need user input.

When reviewing a skill, report findings ordered by impact, each with the concrete edit
that fixes it. Distinguish implemented fixes from recommendations and measured outcomes
from expected benefits. Do not rewrite a skill wholesale when three edits would do.

## References

- **Choosing and structuring supporting files** — `references/resource-design.md`. Read
  when deciding whether something belongs in the body, a reference, a script or an asset,
  and for directory conventions versus client-specific loading behavior.
- **Evidence and confidence discipline** — `references/evidence-and-confidence.md`. Read
  when diagnosis, review, analysis or implementation depends on uncertain evidence.
  Use the reasoning discipline without imposing labels on trivial work.
- **Evaluating a skill** — `references/evaluation.md`. Read when the skill's output is
  costly to act on, or when you need to show that a revision improved it.
- **Anti-patterns and self-review** — `references/anti-patterns.md`. Read before
  finalising any skill.
