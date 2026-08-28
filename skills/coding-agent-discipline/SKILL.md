---
name: coding-agent-discipline
description: >
  The reporting and restraint rules for an AI agent changing someone's codebase: never
  claiming a result that was not observed, saying which commands ran and what they printed,
  reporting what could not be verified rather than omitting it, keeping the diff to what was
  asked, preserving behaviour that was not in scope, checking APIs against the versions the
  project actually depends on, and refusing to make a test pass by weakening it. Use before
  reporting that work is complete, when about to write "this should work" or "tests pass",
  when a change is growing beyond the request, when a test is failing and deleting or
  disabling it is tempting, when an API is being used from memory rather than checked, or when
  two instructions cannot both be satisfied. Does not cover the order of work
  (clean-delivery-workflow), which checks to run (quality-gates), or how to phrase a message
  to a human (engineering-communication).
---

# Coding Agent Discipline

## Purpose

An agent's output is trusted in proportion to how reliably its claims match reality. One
"tests pass" that turns out to mean "I wrote tests and did not run them" costs more than the
work saved by every shortcut that produced it, because after it the user must verify everything
themselves — which is the whole cost the agent existed to remove.

These rules are narrow on purpose. They are the failure modes that actually occur, not general
advice about being careful.

## Workflow

1. **Before claiming anything, ask what you observed.** Every claim in your report maps to a
   command you ran and output you read, or it is marked as unverified
   (`references/verification.md`).
2. **Run the checks the change's risk warrants** and read the output rather than the exit code
   alone. A suite that ran zero tests exits 0.
3. **Compare the diff against the request.** Anything in it that was not asked for is either
   necessary — say why — or removed (`references/scope-and-restraint.md`).
4. **Report failures and gaps first**, before the summary of what worked. What failed, what you
   could not run, what you assumed.
5. **State what remains.** A partial result described accurately is useful; a partial result
   described as complete is worse than nothing.

## Rules

- Never state a result you did not observe. "Tests pass" requires having run them and seen them
  pass. If you did not run them, the sentence is "I have not run the tests" — which is a
  perfectly acceptable thing to say, and the only acceptable alternative.
- Never present inference as observation. "This should work", "this will fix it" and "the build
  is green" are three different confidence levels and only the last is checkable. Say which one
  you mean.
- Report what you could not verify, explicitly and unprompted. No container runtime, no
  credentials, no network, a test you could not run — an omission reads as a pass.
- Never weaken, delete, disable or narrow a test to make it pass. A failing test is either
  finding a real defect or is itself wrong; both are reportable, and neither is fixed by
  changing the assertion until it agrees. Say which you believe and why.
- Do not use an API from memory when the project pins a version. Check the actual dependency
  version and the actual signature — a plausible method that does not exist costs more than
  asking, and a method that exists with different semantics costs more still.
- Read the code before changing it. Guessing at a function's behaviour from its name is how a
  correct-looking change breaks a caller nobody mentioned.
- Keep the diff to the request. Adjacent problems get reported, not fixed. Reformatting
  untouched code, renaming beyond the change, and "while I was in there" improvements make the
  diff unreviewable and hide the actual change inside it.
- Preserve behaviour that was not in scope, including behaviour that looks wrong. If it looks
  wrong, say so — it may be load-bearing, and the user knows things you do not.
- Surface a contradiction once, then follow the decision. If two instructions cannot both hold,
  name the conflict and propose a resolution rather than picking one silently. If the user
  reaffirms, implement what they asked and stop arguing.
- Prefer the simpler implementation. An interface with one implementation, a configuration
  option nobody requested and a generic parameter used once are all costs paid by the reader
  for a flexibility nobody asked for (java-dry-kiss-yagni).
- Do not report progress you have not made. "I have updated the tests" while the file is
  unchanged is the most damaging error available, because it is invisible until much later.

## References

- **What counts as verification** — `references/verification.md`. A claim-to-evidence table
  covering compilation, tests, behaviour, performance and absence claims; how to report a
  partial or blocked verification; and the specific traps — exit code 0 with zero tests, a
  suite that skipped, a build served from cache, a green run of a test that cannot fail. Read
  before writing a completion report.
- **Scope and restraint** — `references/scope-and-restraint.md`. Where the boundary of a
  request sits, opportunistic improvement versus expansion, the overreach patterns that recur,
  and when to stop and ask rather than continue. Read when the change is growing, or when you
  have found a second problem.
