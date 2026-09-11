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

Keep the actor's task input separate from evaluator-only expected answers, grading rubrics
and prior run results. Give the actor the requirements and ordinary resources it would have
in real use. Record the exact input, skill/resource versions, tools and accessible files;
an output-only run cannot verify file edits or commands that its actor cannot execute.

Fresh conversation context does not isolate a shared filesystem, tool state or writable
service. Separate output folders and ownership instructions alone do not prevent reading
another run's answers or the revised skill. Use controlled snapshots and access boundaries
appropriate to the available harness; if separation is procedural, audit exposure and report
that limitation instead of calling it enforced isolation. Do not alter real agent configuration
or build new infrastructure merely to disguise unavailable controls.

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

Exploratory runs can help discover useful criteria. Preserve those runs as exploratory;
freeze the resulting criteria before fresh confirmatory runs rather than grading prior
outputs against criteria chosen to fit them. Keep held-out cases out of development and
actor-visible teaching examples before their evaluation run; they must not already have
supplied answers or feedback to the revision process. Known cases remain useful regression
checks, with that exposure stated.

## Dimensions worth scoring

Choose the dimensions that matter for this skill; a small set is often sufficient:

- **Correctness** — is the conclusion right?
- **Completeness** — did it cover what the boundary promised?
- **Evidence quality** — are conclusions supported, and are gaps admitted?
- **Actionability** — can the reader act without a follow-up conversation?
- **Consistency** — same input, comparable output across runs?
- **Restraint** — did it avoid work outside its boundary?

Use a binary judgement when a criterion has a clear pass/fail contract; a graded rubric can
work when its levels have defined meanings. Bind each judgement to actual response, artifact
or trace evidence. A model's unsupported self-score is not independent verification.
For example, identify which missing evidence made a diagnosis unsupported, rather than
assigning a number without explanation or requiring one tool for every diagnosis.

## Where evaluation material lives

Use the repository's existing evaluation location and authorized write scope. An `evals/`
directory can be used by a harness or read through explicit routing; its name alone neither
loads nor invalidates it. Avoid shipping harness-only fixtures if they add no teaching value.

The exception is when a case doubles as a teaching example — then it belongs in
`references/` and should be routed from the body like any other reference.

A shipped teaching example is ordinary treatment content, not an unseen holdout. If it
contains a test's answers, choose a genuinely unseen case or report a known-example result.
Keep evaluator-only criteria outside actor access; a folder name is not an access control.
Silently excluding an ordinary shipped reference changes the treatment being tested. Record
such a resource restriction and limit the claim to that configuration.

## When a case fails

Investigate the skill, harness and case expectation. Fix a skill defect without weakening a
valid expectation. If the case encodes an incorrect contract, correct it with evidence and
rerun affected comparisons, recording the change; do not silently redefine success to match
the output.

Check first whether the actor received the context and tools the criterion requires. Missing
coverage must be reported rather than relabeled as an end-to-end pass. Preserve valid safety
and regression criteria even if both configurations pass them; a criterion can protect a
contract without discriminating the current comparison.

If the fix is "add more instructions", check first whether the real problem is scope: a
skill that needs ever more rules to cover its cases usually has a boundary that is too
wide.
