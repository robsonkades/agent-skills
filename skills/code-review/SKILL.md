---
name: code-review
description: >
  Reviewing a change as an engineering activity: setting review depth from the change's risk
  rather than its size, looking in the order that finds the expensive defects first, refusing
  to spend human attention on what a formatter or linter should own, writing a finding that
  can be acted on, separating blocking objections from preferences, and receiving review
  without either capitulating or defending. Use when reviewing a pull request or a diff, when
  a review has become a list of style comments, when reviews are slow or rubber-stamped, when
  a reviewer and an author are deadlocked, when a defect reached production through an
  approved change, or when deciding what a review must catch versus what CI should. Does not
  cover the smell catalogue (java-code-smells), SOLID as review criteria (java-solid),
  readability heuristics (java-clean-code), or which automated gates to run (quality-gates).
---

# Code Review

## Purpose

Review connects a change to its requirements, callers and operational consequences. Automated
checks help, but passing them does not establish that the right behavior was built. Repeated
formatting comments consume attention that could expose a reachable correctness defect.

Two failure modes: the review that blocks for a week over preferences, and the approval that
was a formality. Both come from not deciding, up front, what this particular review is for.

## Workflow

1. **Establish scope and purpose.** Read the request, description and repository guidance;
   identify the base/head commits or staged/unstaged files being reviewed. Inspect callers,
   tests and relevant contracts before assuming intended behavior. If the requirement remains
   ambiguous, ask a focused question while continuing checks independent of that answer.
2. **Set the depth from the risk**, not the diff size: what breaks if this is wrong, how
   quickly would it be noticed, and can it be rolled back? A four-line payment logic change
   may need deeper review than a 400-line refactor, but the refactoring label and a green suite
   do not prove behavior preservation. Inspect affected invariants, contracts and test coverage
   before reducing review depth.
3. **Look in payoff order** (`references/what-to-look-for.md`): does it do the right thing;
   does it fail well; concurrency and data; compatibility and migration; security; can it be
   operated; are the tests capable of failing. Reorder by concrete risk: authentication changes
   deserve security review first, and unreadable control flow may prevent a correctness judgment.
4. **Verify consequential claims.** Inspect the target compiler release/toolchain, resolved
   libraries, CI/runtime and deployment contract before asserting an API or compatibility defect.
   This review process has no Java baseline; never upgrade a project to make a suggested fix work.
   Run targeted checks in an isolated checkout when needed, preserving unrelated work. Inspect
   test counts, skips and failures. Static reasoning can establish a defect, but state the
   reachable trigger and code path; missing infrastructure is a validation limit, not a pass.
5. **Write each finding so it can be acted on**: what, where, why it matters, and what you
   would do — with its severity stated (`references/giving-and-receiving.md`).
6. **Return the requested review format** with severity-ordered findings and exact locations,
   then coverage and validation limits. When a verdict is requested, state approve, non-blocking
   comments, request changes or incomplete with a concrete reason. No findings means no supported
   issues in the reviewed scope, not proof that shipping is safe. Publishing a review or changing
   approval state requires the user's authorization; a local review result is not that action.

## Rules

- Avoid repeating mechanical feedback already enforced by configured checks. A reachable null
  dereference or other defect remains reportable even if a tool could detect it. Verify what CI
  actually runs; suggest a pipeline improvement through `quality-gates` without expanding the
  requested review into unrelated implementation work.
- State severity on every finding. Without it, the author must guess whether a remark is a
  blocker, and will guess wrong in both directions.
- Block only for: a defect, a security or data-loss risk, a breaking change to a published
  contract without an accepted migration, a missing test that leaves a concrete risky behavior
  unprotected, or an expensive decision with a demonstrated requirement/operational conflict.
  Enforce explicit repository requirements; personal preferences alone are non-blocking.
- Review the change, not the codebase. Pre-existing problems in touched files are a separate
  ticket unless the change makes them materially worse — a review that demands unrelated
  cleanup is how a two-hour change becomes a fortnight.
- Resolve uncertainty from code and contracts first. State an unverified premise as a question,
  and distinguish confidence in the claim from the impact if it occurs. Do not disguise a
  verified defect as a vague question or invent a runtime result to make it sound stronger.
- For a large change, partition by behavior/risk and track coverage across passes. Review
  independent paths after finding a blocker; defer only details that the needed redesign invalidates.
- Scope any approval to the files, behaviors and revision actually reviewed. If the head changes,
  inspect the delta and affected assumptions before carrying conclusions forward.
- Author self-review first, on the diff, before requesting review. It catches the debug
  statement, the commented-out block and the accidental file, and it costs the reviewer
  nothing.
- Reviews are not a substitute for a conversation about design. If the fundamental approach is
  incompatible with the requirements, explain that conflict and defer polishing the affected
  implementation. Continue independent checks and mark the deferred coverage explicitly.

## References

Primary guidance: [Google's review standard](https://google.github.io/eng-practices/review/reviewer/standard.html)
and [review contents](https://google.github.io/eng-practices/review/reviewer/looking-for.html).
Apply the repository's policies and requested scope rather than importing another organization's
approval rules wholesale.

- **What to look for, in payoff order** — `references/what-to-look-for.md`. The ordered pass
  list, with the questions that find defects at each level, the Java-specific hazards worth a
  reviewer's attention (concurrency, resource lifetime, exception translation, API
  compatibility, migrations), and the explicit list of what to hand to automation. Read while
  reviewing.
- **Writing and receiving findings** — `references/giving-and-receiving.md`. The anatomy of an
  actionable comment, severity vocabulary, resolving deadlock between reviewer and author,
  receiving feedback, and when pairing replaces review rather than adding to it. Read when
  writing findings or resolving a stalled, tense, or rubber-stamped review.
