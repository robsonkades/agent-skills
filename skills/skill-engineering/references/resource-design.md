# Resource design

Read this when deciding where a piece of knowledge belongs, or when a skill has grown
past the point where the body is comfortable to read.

## The one question

Every supporting file must answer:

> **What capability does this provide that the body cannot?**

If the answer is "it explains the same thing in more words", the file should not exist.
If the answer is unclear, the file should not exist yet.

## Where things go

| Put it in           | When                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **`SKILL.md` body** | It must influence _every_ execution: purpose, workflow, constraints that always apply, decision rules, output shape, routing to the rest |
| **`references/`**   | It is needed for _some_ tasks: schemas, domain rules, detailed procedures, extended examples, format-specific guidance                   |
| **`scripts/`**      | Deterministic execution is more reliable than re-deriving the logic: validation, transformation, data processing, repeated API calls     |
| **`assets/`**       | The file is consumed by the output rather than read as instruction: templates, schemas, fixtures, images, boilerplate                    |

The test for the body is temporal, not topical: _is this relevant every single time the
skill activates?_ A section that applies to one of four modes belongs in a reference, even
if it is short.

## Directory conventions

Runtimes recognise a small set:

```text
skill-name/
├── SKILL.md      required
├── references/   loaded on demand
├── scripts/      executable helpers
├── assets/       files used in generated output
└── agents/       vendor UI metadata (Codex: agents/openai.yaml)
```

`workflows/`, `evals/`, `docs/` and similar are not conventions any runtime reads. They
are just directories, which is fine — but do not create them because a template suggested
them. A procedure is a reference; evaluation material is a reference or lives outside the
package entirely.

A skill that needs only `SKILL.md` is a finished skill, not an unfinished one.

## Routing

The body must say _what exists, why, and when to read it_. Conditional routing, never
bulk loading:

```markdown
Good: When the task involves database migrations, read references/migrations.md.
Bad: Read all files under references/ before starting.
```

A reference nothing routes to is dead weight the agent will never open. If you cannot
write the condition that reaches a file, you have not established that it is needed.

## Examples

Examples belong in `references/` and earn their place only by teaching something the
rules cannot state directly — a judgement call, a transformation, a subtle failure.

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
  deliberately, and the skill should say when.

## Splitting a skill that grew too large

Size alone is not the signal. Split when the boundary blurred:

- The description had to list unrelated situations to stay accurate → two skills.
- The body has modes that share almost no rules → two skills, or one skill routing to
  mode-specific references.
- Sections are conditionally relevant but the boundary is coherent → keep one skill, move
  the conditional parts to references.

After splitting, each description must exclude the other by name. Two skills that both
plausibly match the same request will be selected unpredictably.

## Validation before finalising

- [ ] Every reference is reachable by an explicit condition in the body
- [ ] Every script has a stated invocation point
- [ ] Every asset is consumed by an output, not read as instruction
- [ ] No file restates something already in the body
- [ ] No file exists "for completeness"
- [ ] The body would still make sense if a reader stopped after it
