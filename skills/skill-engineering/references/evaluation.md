# Evaluating a skill

Read this when the skill's output is costly to act on, when several people depend on the
skill behaving consistently, or when you need to show that a revision improved it rather
than merely changed it.

**Evaluation is proportionate, not mandatory.** A skill that formats commit messages does
not need an evaluation suite. A skill that recommends production database changes does.
Building ceremony around a low-stakes skill is one of the ways skills become unmaintained.

## What is actually being tested

Not the model. The **delta the skill produces**: does the agent do better with it than
without it? That framing decides the method — every case needs a baseline run without the
skill, or the result says nothing about the skill.

The second thing worth testing is **selection**: does the skill activate when it should,
and stay quiet when it should not. A skill that is never selected has a description
problem, and no amount of body quality fixes it.

## Case categories

Pick the ones that carry risk for this skill; do not build all five by reflex.

| Category           | Question it answers                                            |
| ------------------ | -------------------------------------------------------------- |
| **Happy path**     | Does it produce the intended outcome on a representative task? |
| **Edge case**      | Does it hold up at the boundary of its scope?                  |
| **Ambiguous**      | Does it ask, or does it invent?                                |
| **Failure**        | When evidence or tooling is missing, does it say so?           |
| **Adversarial**    | Under pressure to agree, does it hold a supported position?    |
| **Non-activation** | Given a neighbouring task, does it correctly stay out?         |

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
rewording. Assert behaviour: did it ask before assuming, did it cite the measurement, did
it refuse to recommend without evidence, did it stay inside its boundary.

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

Outside the skill package, or in `references/` if it is small and genuinely instructive.
Runtimes do not read an `evals/` directory, so shipping one inside the package adds weight
the agent loads nothing from.

The exception is when a case doubles as a teaching example — then it belongs in
`references/` and should be routed from the body like any other reference.

## When a case fails

Fix the skill, not the case. A failing case that gets rewritten to match current behaviour
converts a test into documentation of a bug.

If the fix is "add more instructions", check first whether the real problem is scope: a
skill that needs ever more rules to cover its cases usually has a boundary that is too
wide.
