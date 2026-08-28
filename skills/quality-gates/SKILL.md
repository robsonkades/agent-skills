---
name: quality-gates
description: >
  Choosing which automated checks a change must pass, and making them cheap enough that they
  stay switched on: matching the gate set to the change's risk rather than running everything
  on everything, where each gate belongs (pre-commit, pull request, main, release), the Java
  toolchain that enforces each class of defect, ratcheting a gate onto a codebase that already
  violates it, and what to do when a gate goes red. Use when setting up or trimming a
  pipeline, when the build is slow enough that people push without running it, when a check is
  routinely bypassed or its failures ignored, when a defect class keeps reaching production,
  when a coverage or static-analysis threshold is being proposed, or when deciding whether a
  small change really needs the full pipeline. Does not cover writing the tests
  (java-testing-strategy), architecture rules (architecture-testing), performance thresholds
  (performance-regression-ci), or human review (code-review).
---

# Quality Gates

## Purpose

A gate is a claim the build makes on your behalf: "this class of defect is not in this change".
Its value is the defects it stops; its cost is paid by every change, including the ones that
could never have contained that defect.

Two failure modes. The pipeline that runs everything on everything becomes slow enough that
people work around it — and a bypassed gate protects nothing while still costing the wait. The
pipeline that gates nothing pushes every defect class to review or production, where each costs
orders of magnitude more.

## Workflow

1. **Name the defect classes that actually reach your production**, from incidents and from
   review comments. That list — not a generic checklist — is what the pipeline exists to stop.
2. **Assign each class to the cheapest mechanism that catches it**: the compiler, a static
   analyser, a test, a review. Anything a human catches repeatedly is a missing gate
   (code-review).
3. **Place each gate where its cost is bearable** (`references/gate-catalogue.md`): seconds
   pre-commit, minutes on the pull request, longer on main, longest at release.
4. **Select per change, by risk** (`references/selecting-gates.md`). A README edit and a schema
   migration should not face the same pipeline, and pretending they do is how the pipeline
   becomes something to be endured.
5. **Ratchet, do not big-bang.** Introducing a gate onto an existing codebase means baselining
   current violations and failing only on new ones. A gate that goes red on 400 pre-existing
   findings gets disabled that afternoon.
6. **When a gate goes red, fix the cause or remove the gate deliberately.** A red build that is
   normal has already stopped being a gate; it is now a slow way to not notice things.

## Rules

- Every gate needs a stated defect class it prevents. A check that is enabled because it came
  with the template will be the first one someone disables under deadline, and nobody will know
  what was lost.
- Gates must be deterministic. A gate that fails intermittently teaches everyone to re-run the
  build, which trains away the response you need when a real failure appears.
- Speed is a correctness property of a pipeline. Past roughly ten minutes to feedback, people
  batch changes and stop running it locally, and both effects make quality worse — so a slow,
  thorough pipeline can catch fewer defects than a fast, narrower one.
- Turn a warning into an error or delete it. `javac -Xlint:all -Werror` fails the build on
  warnings; a warning nobody must act on is output nobody reads (verified: with `-Werror`,
  javac reports `error: warnings found and -Werror specified`).
- Never gate on a coverage percentage. It is satisfiable by tests that assert nothing, and the
  number moves for reasons unrelated to quality. Publish coverage of the diff as _information_
  for the reviewer instead (java-testing-strategy).
- A bypass mechanism must exist, must be logged, and must be visible after the fact. Teams
  without one do not stop bypassing; they bypass by disabling the gate for everyone.
- Suppressions carry a reason and an owner: `@SuppressWarnings("unchecked") // JDBC row map,
checked by the query's projection`. A bare suppression is a silent removal of the gate at
  that line.
- The gate set is not the definition of done. Passing every check says the known defect classes
  are absent, not that the change does what was asked (requirements-and-acceptance).
- Pin and reproduce: fixed toolchain version, locked dependency versions, no `LATEST` ranges. A
  build whose result depends on when it ran cannot gate anything.

## References

- **The gate catalogue** — `references/gate-catalogue.md`. Each gate for a Java build: the
  defect class it catches, its typical runtime, its false-positive profile, where it belongs in
  the pipeline, and how to ratchet it onto an existing codebase. Read when adding, moving or
  removing a check.
- **Selecting gates for a change** — `references/selecting-gates.md`. Risk tiers with the gate
  set each warrants, five worked changes from a docs typo to a hotfix under incident, and the
  rules for what may legitimately be skipped and what may never be. Read when deciding what
  this particular change must pass.
