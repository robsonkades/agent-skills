# Evaluating a skill

Read this when the skill's output is costly to act on, when several people depend on the
skill behaving consistently, or when you need to show that a revision improved it rather
than merely changed it.

**Evaluation is proportionate.** A routine formatting change may need only focused checks;
a skill recommending consequential database changes needs cases covering its decision risks.
Follow applicable project evaluation requirements without inventing a new framework.
Building ceremony around a low-stakes skill is one of the ways skills become unmaintained.

## What is actually being tested

Separate three claims: structural checks validate packaging/content, example tests validate
the exercised code, and behavioral runs evaluate an agent's observable decisions. A run
against predefined expectations can reveal a regression or failure without a no-skill
baseline. It does not establish the **improvement caused by the skill**.

For that comparative claim, run matched cases with and without the skill; to assess edits,
compare original and revised versions. Keep model, tools, task context, permissions and
execution conditions comparable, use fresh sessions to avoid answer carryover, and record
differences or stochastic variability. Fix expectations before the runs; retain a held-out
case when feasible. Report the observed cases, not universal correctness or an unsupported
percentage improvement.

The second thing worth testing is **selection**: does the skill activate when it should,
and stay quiet or hand off when it should not. A skill never selected may have a discovery,
installation or routing problem; inspect availability and activation evidence before blaming
its description. Explicitly loading a skill tests execution, not automatic selection.

## Case categories

Pick the categories that carry risk for this skill; do not build all of them by reflex.

| Category           | Question it answers                                               |
| ------------------ | ----------------------------------------------------------------- |
| **Happy path**     | Does it produce the intended outcome on a representative task?    |
| **Edge case**      | Does it hold up at the boundary of its scope?                     |
| **Ambiguous**      | Does it inspect available context and clarify only material gaps? |
| **Failure**        | When evidence or tooling is missing, does it say so?              |
| **Adversarial**    | Under pressure to agree, does it hold a supported position?       |
| **Non-activation** | Given a neighbouring task, does it correctly stay out?            |

The ambiguous and failure cases are usually the most informative, and the most often
skipped. A skill that only ever gets clean inputs in testing will meet its first
ambiguous input in production.

## Writing a case

```text
Input:              the task and context given to the agent
Expected behaviour: what it should do — steps taken, evidence gathered, questions asked
Expected output:    characteristics, not exact text
Failure conditions: what would make this a clear failure
```

**Do not assert exact output when several answers are correct.** String comparison against
a model's prose tests phrasing, not competence, and the suite rots on the first harmless
rewording. Assert behavior: did it use existing evidence and authorization, preserve scope,
qualify uncertainty and ask only when the unresolved information mattered?

Write the input, expected behavior and failure conditions before execution. If no suitable
runner is available, return reproducible written cases and mark behavioral evaluation as
pending. A mental walkthrough or an agent's self-score is not an executed comparison.

## Dimensions worth scoring

Choose the two or three that matter for this skill:

- **Correctness** — is the conclusion right?
- **Completeness** — did it cover what the boundary promised?
- **Evidence quality** — are conclusions supported, and are gaps admitted?
- **Actionability** — can the reader act without a follow-up conversation?
- **Consistency** — same input, comparable output across runs?
- **Restraint** — did it avoid work outside its boundary?

Prefer a binary judgement per dimension with a written reason over a 1–5 score. Numeric
self-scoring by a model produces a comfortable "4" and no signal; "failed, because it
recommended an index without reading the execution plan" is actionable.

## Where evaluation material lives

Use the repository's existing evaluation location and authorized write scope. An `evals/`
directory can be used by a harness or read through explicit routing; its name alone neither
loads nor invalidates it. Avoid shipping harness-only fixtures if they add no teaching value.

The exception is when a case doubles as a teaching example — then it belongs in
`references/` and should be routed from the body like any other reference.

## When a case fails

Investigate the skill, harness and case expectation. Fix a skill defect without weakening a
valid expectation. If the case encodes an incorrect contract, correct it with evidence and
rerun affected comparisons, recording the change; do not silently redefine success to match
the output.

If the fix is "add more instructions", check first whether the real problem is scope: a
skill that needs ever more rules to cover its cases usually has a boundary that is too
wide.
