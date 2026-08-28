---
name: clean-delivery-workflow
description: >
  The order of work for a change, and how much of that order a given change actually warrants:
  understanding before editing, clarifying what is ambiguous, deciding the test approach,
  implementing in reversible steps, keeping refactoring in separate commits from behaviour,
  running the gates the risk deserves, and verifying before declaring done. Also the entry
  point that routes a situation to the skill that owns it. Use when starting a change and the
  order is not obvious, when a change has sprawled and needs re-sequencing, when refactoring
  and behaviour changes have been mixed in one commit, when work is being declared done
  without verification, when the same ceremony is being applied to a one-line fix and a
  migration, or when you know the problem but not which skill covers it. Does not itself cover
  any step in depth — it routes to requirements-and-acceptance, java-testing-strategy, tdd,
  java-refactoring, code-review and quality-gates, each of which owns its own.
---

# Clean Delivery Workflow

## Purpose

Two failures this exists to prevent, and they look nothing alike. The first is the change that
starts in the editor: code written before anyone established what was being asked, discovering
in review that it solves the wrong problem. The second is ceremony applied uniformly — a
one-line configuration fix carrying a design discussion, an acceptance-criteria table and the
full pipeline, until the process becomes something people route around.

The order below is fixed; how much of each step a change deserves is a judgement, and making
that judgement well is the skill.

## Workflow

1. **Understand.** Read the code that exists before proposing a change to it. Find the callers,
   the tests, and the last three commits that touched it — an unexplained line is usually a
   defect someone fixed.
2. **Clarify.** Ambiguities that change the work get asked; the rest get recorded as
   assumptions (requirements-and-acceptance). Batch the questions.
3. **Establish the risk.** What breaks if this is wrong, how soon would anyone notice, how hard
   is it to undo? This one answer sets the test level, the gate set and the review depth for
   everything that follows.
4. **Decide the test approach** before implementing: which level, and whether the change is
   driven by tests or verified after (java-testing-strategy, tdd). For a bug, the reproduction
   comes first.
5. **Implement in reversible steps**, each leaving the tree green. Separate commits for
   refactoring and for behaviour — a mixed commit cannot be reviewed, and cannot be reverted
   without taking the other half with it (java-refactoring).
6. **Verify.** Run the gates the risk warrants (quality-gates) and read the output. Not "the
   build should pass" — what it printed.
7. **Review** at a depth set by the risk, not by the diff size (code-review).
8. **Record what the code cannot say**: assumptions, the trade you took, the decision and its
   alternatives (technical-debt-decisions, architecture-decision-making).
9. **Deliver**, and say what you did not do — what is out of scope, unverified, or deferred.

## Rules

- The order is fixed; the depth is not. Skipping step 1 is never justified by urgency — under
  urgency it is the step that saves the most time.
- Ceremony scales with risk, and risk is not proportional to diff size. A 900-line rename
  verified by the compiler is a lighter change than a one-character timeout default
  (`references/workflow-by-risk.md`).
- Do not start editing to understand. Read first; if the code is genuinely unreadable, that is a
  finding to report, not a reason to start rewriting it.
- One logical change per commit, and never a refactoring in the same commit as a behaviour
  change. This is the single highest-value habit here: it makes review possible, makes revert
  safe, and makes `git bisect` meaningful (debugging).
- Keep the tree green between steps. A sequence of green commits localises a regression to one
  step; a single large commit localises it to an afternoon.
- Do not expand the change. Adjacent problems are reported, not fixed, unless the change makes
  them materially worse or leaving them makes your change wrong.
- "Done" means verified, not written. If a gate could not be run, that is part of the report,
  not an omission (coding-agent-discipline).
- If something turns out to be blocked, finish everything that is not, and say precisely what
  was left and why. Silently reducing scope is the failure mode that costs the most trust.

## References

- **Workflow by risk** — `references/workflow-by-risk.md`. What each step actually collapses to
  at three risk levels, walked through on a configuration fix, a new endpoint and a schema
  migration — including which steps disappear entirely and which never do. Read when deciding
  how much process a change warrants.
- **Routing** — `references/routing.md`. Situation-to-skill map across this repository: the
  craftsmanship skills, the Java language and design skills, testing, concurrency, performance,
  architecture and operations. Read when you know the problem but not which skill owns it, or
  when two skills seem to disagree.
