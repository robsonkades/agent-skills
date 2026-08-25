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

A skill earns its place only if it changes what the agent does. Anything a capable agent
already does correctly is context you are spending for nothing.

## Scope

**Covers:** deciding a skill's boundary, writing the frontmatter, structuring the body,
choosing which supporting resources are justified, converting expert judgement into
decision rules, and reviewing an existing skill.

**Does not cover:** the domain knowledge itself (that is the author's), nor packaging,
versioning and distribution.

## Workflow

1. **Clarify before writing.** If the objective, the triggering situations, or the target
   domain are unclear, ask. Do not invent scope — a skill built on a guessed boundary is
   rewritten, not refined.
2. **Fix the boundary.** Write four lists before any prose: what it does, what it
   deliberately does not do, when it should activate, when it should not. Adjacent
   responsibilities belong to other skills.
3. **Write the frontmatter first.** It is the only thing read at selection time, so it is
   the highest-leverage text in the skill. See the contract below.
4. **Draft the body at minimum viable size.** Purpose, workflow, decision rules,
   constraints. Nothing that is only relevant sometimes.
5. **Decide resources by necessity.** Each supporting file must answer "what capability
   does this provide that the body cannot?" Read `references/resource-design.md` when
   choosing between a reference, a script and an asset.
6. **Review against the gates below**, then against `references/anti-patterns.md`.

## The frontmatter contract

Every skill is a directory with a `SKILL.md` whose YAML frontmatter carries two required
fields. Runtimes reject or ignore a skill that lacks them.

```yaml
---
name: skill-name # lowercase, hyphen-separated; must equal the directory name
description: >
  What it covers, when to use it, and — when it is easily confused with a
  neighbouring skill — what it does not cover.
---
```

Information is disclosed in three stages, and this drives every sizing decision:

| Stage      | What is loaded                   | Consequence                                                  |
| ---------- | -------------------------------- | ------------------------------------------------------------ |
| Selection  | **name + description only**      | The description alone decides whether the skill is ever used |
| Activation | The whole Markdown body          | Every line costs context on every use                        |
| Execution  | A reference or script, on demand | Free until actually needed                                   |

A description that lists capabilities (`"expert in performance"`) does not discriminate. A
description that names situations (`"use when p99 regressed after a deploy, or CPU is high
with normal GC"`) does. Write the situations.

## Decision rules

```text
IF the guidance would be followed by a capable agent without the skill
THEN delete it — it is context spent for no behaviour change.

IF a section is relevant only to some tasks the skill covers
THEN move it to references/ and route to it by condition from the body.

IF the skill needs a persona ("you are an expert…") to feel authoritative
THEN it lacks substance; replace the persona with decision rules.

IF the same mechanical operation would be re-derived on every run
THEN write a script and have the body invoke it.

IF the skill's boundary overlaps another skill's
THEN narrow both and state the exclusion in each description.

IF a rule cannot be checked against the produced work
THEN restate it as something observable, or drop it.

IF the domain is diagnostic — the skill reaches conclusions from evidence
THEN read references/evidence-and-confidence.md and add that discipline.

IF acting on the skill's output is expensive or hard to reverse
THEN read references/evaluation.md and add proportionate evaluation cases.
```

## Quality gates

- [ ] The description names triggering situations, not capabilities
- [ ] Name matches the directory, and the boundary excludes at least one adjacent topic,
      naming the nearest neighbouring skill when one exists
- [ ] The body contains nothing that is only conditionally relevant
- [ ] Every rule is specific enough to be checkable against the output
- [ ] Every supporting file is routed from the body by an explicit condition
- [ ] No file duplicates content that already exists elsewhere in the skill
- [ ] Removing any file would lose a capability

## Output

When creating a skill, produce the directory, then a short report: the boundary (does /
does not / activates / does not activate), each file created with the one capability it
provides, and any judgement call the author should confirm.

When reviewing a skill, report findings ordered by impact, each with the concrete edit
that fixes it. Do not rewrite a skill wholesale when three edits would do.

## References

- **Choosing and structuring supporting files** — `references/resource-design.md`. Read
  when deciding whether something belongs in the body, a reference, a script or an asset,
  and for the directory conventions runtimes actually recognise.
- **Evidence and confidence discipline** — `references/evidence-and-confidence.md`. Read
  only for skills that reach conclusions from evidence: diagnosis, review, analysis,
  incident response. It is noise in a generative skill.
- **Evaluating a skill** — `references/evaluation.md`. Read when the skill's output is
  costly to act on, or when you need to show that a revision improved it.
- **Anti-patterns and self-review** — `references/anti-patterns.md`. Read before
  finalising any skill.
