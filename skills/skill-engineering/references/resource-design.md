# Resource design

Read this when deciding where a piece of knowledge belongs, or when a skill has grown
past the point where the body is comfortable to read.

## The one question

Every supporting file must answer:

> **What capability does this provide that the body cannot?**

If the answer is "it explains the same thing in more words", the file should not exist.
If the answer is unclear, the file should not exist yet.

## Where things go

| Put it in           | When                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **`SKILL.md` body** | Common path, short critical guards, decision rules, output shape and routing to conditional detail                                   |
| **`references/`**   | It is needed for _some_ tasks: schemas, domain rules, detailed procedures, extended examples, format-specific guidance               |
| **`scripts/`**      | Deterministic execution is more reliable than re-deriving the logic: validation, transformation, data processing, repeated API calls |
| **`assets/`**       | The file is consumed by the output rather than read as instruction: templates, schemas, fixtures, images, boilerplate                |

Keep the common path and short consequential guards in the body. Move substantial detail
needed only for a particular mode into a routed reference; splitting a one-line prerequisite
can hide it behind an unnecessary read.

## Directory conventions

The format recommends common directories; they are organization conventions, not a universal
automatic loader:

```text
skill-name/
├── SKILL.md      required
├── references/   loaded on demand
├── scripts/      executable helpers
├── assets/       files used in generated output
└── agents/       vendor UI metadata (Codex: agents/openai.yaml)
```

The [Agent Skills specification](https://agentskills.io/specification) permits additional
files/directories. An agent or harness can read a routed `docs/` or `evals/` path; the name
alone does not make it load automatically. Preserve established project conventions when
they work. Vendor metadata such as `agents/openai.yaml` is client-specific, not a portable
requirement; inspect the target adapter before adding it.

A skill that needs only `SKILL.md` is a finished skill, not an unfinished one.

## Routing

The body must say _what exists, why, and when to read it_. Prefer conditional routing in
ordinary use; a complete package audit may legitimately require reading every resource:

```markdown
Good: When the task involves database migrations, read references/migrations.md.
Bad: Read all files under references/ before starting.
```

A reference nothing routes to is dead weight the agent will never open. If you cannot
write the condition that reaches a file, you have not established that it is needed.

## Examples

Long or conditional examples belong in `references/`; a short example can clarify a core
rule inline. Examples earn their place by teaching a judgement call, transformation or
failure that prose alone leaves ambiguous.

A worked example is most valuable when it shows the _reasoning_, not the output. "Here is
a correct result" teaches less than "here is the evidence, here is why this reading of it
was chosen over that one, here is what would have changed the conclusion".

Pairs of good and bad are worth the space only when the difference is genuinely
non-obvious. If the bad example is obviously bad, it teaches nothing.

## Scripts

Write a script when determinism materially improves reliability, not to demonstrate tool
use. Good candidates: validation with a pass/fail answer, mechanical transformation,
parsing, anything that would otherwise be re-derived identically on every run.

Two constraints worth stating in the body when scripts exist:

- The agent should run the script rather than reimplement its logic inline.
- Scripts ship as data. Nothing executes them automatically; the agent invokes them
  deliberately in the ordinary skill flow, and the skill should say when. Inspect any
  separate harness automation rather than assuming the same behavior there.

State interpreter/dependency requirements, inputs, outputs and side effects. Before invoking
an unfamiliar helper, inspect its implementation and scope its writes; a skill instruction
does not grant permission to publish, install or mutate external systems. Preserve the
project's baseline and use isolated fixtures for checks that could touch real configuration.

## Splitting a skill that grew too large

Size alone is not the signal. Split when the boundary blurred:

- The description had to list unrelated situations to stay accurate → two skills.
- The body has modes that share almost no rules → two skills, or one skill routing to
  mode-specific references.
- Sections are conditionally relevant but the boundary is coherent → keep one skill, move
  the conditional parts to references.

After splitting, clarify the triggering distinction or intentional composition. Related
skills may legitimately apply together. Keep edits within ownership and report proposed
changes to neighboring descriptions when they are outside scope.

## Validation before finalising

- [ ] Every reference is reachable by an explicit condition in the body
- [ ] Every script has a stated invocation point
- [ ] Every asset is consumed by an output, not read as instruction
- [ ] Detailed rules have one home; repeated guards or summaries serve a clear purpose
- [ ] No file exists "for completeness"
- [ ] The body would still make sense if a reader stopped after it
