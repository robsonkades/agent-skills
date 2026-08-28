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

Review is expensive, serial, and the only quality mechanism that can catch "this is correct but
it is the wrong thing to build". Spending it on missing final keywords and import order wastes
the one check that a machine cannot perform, and it trains authors to skim reviews rather than
read them.

Two failure modes: the review that blocks for a week over preferences, and the approval that
was a formality. Both come from not deciding, up front, what this particular review is for.

## Workflow

1. **Read the description first.** What is it meant to do, and why now? A change you cannot
   summarise in a sentence cannot be reviewed — ask before reading further, because every
   comment you write against a purpose you guessed at will be noise.
2. **Set the depth from the risk**, not the diff size: what breaks if this is wrong, how
   quickly would it be noticed, and can it be rolled back? A 400-line refactoring under test
   is a lighter review than a 4-line change to a payment path.
3. **Look in payoff order** (`references/what-to-look-for.md`): does it do the right thing;
   does it fail well; concurrency and data; compatibility and migration; security; can it be
   operated; are the tests capable of failing. Readability last — it is real, it is just never
   the thing that costs the most.
4. **Run it when the risk warrants.** Check out the branch, run the tests, read the failing
   case. Reviews that never leave the diff view miss everything that is not in the diff — the
   test that was deleted, the caller that was not updated.
5. **Write each finding so it can be acted on**: what, where, why it matters, and what you
   would do — with its severity stated (`references/giving-and-receiving.md`).
6. **Decide explicitly**: approve, approve with non-blocking comments, or block with a named
   reason. "Some thoughts" with no verdict leaves the author guessing and the change stalled.

## Rules

- Never spend a review comment on something a tool can enforce. Formatting, import order,
  unused variables, obvious null checks: fix the pipeline once (quality-gates) instead of
  paying for it in every review, forever.
- State severity on every finding. Without it, the author must guess whether a remark is a
  blocker, and will guess wrong in both directions.
- Block only for: a defect, a security or data-loss risk, a breaking change to a published
  contract, a missing test for risky behaviour, or a decision that is expensive to reverse
  later. Everything else is a comment the author may decline.
- Review the change, not the codebase. Pre-existing problems in touched files are a separate
  ticket unless the change makes them materially worse — a review that demands unrelated
  cleanup is how a two-hour change becomes a fortnight.
- Ask when you do not understand, before asserting. "What happens if this list is empty?"
  finds more defects than "this will NPE", and costs nothing when you are wrong.
- Large changes get worse reviews, not longer ones — attention falls off sharply after a few
  hundred lines. If a change cannot be split, say so and review it in passes with a stated
  focus per pass rather than pretending one pass covered it.
- Approving means you believe it is safe to ship. If you only read part of it, say which part.
- Author self-review first, on the diff, before requesting review. It catches the debug
  statement, the commented-out block and the accidental file, and it costs the reviewer
  nothing.
- Reviews are not a substitute for a conversation about design. If the fundamental approach is
  wrong, stop reviewing lines and raise that alone — a hundred line-comments on an approach you
  will reject is wasted work for both people.

## References

- **What to look for, in payoff order** — `references/what-to-look-for.md`. The ordered pass
  list, with the questions that find defects at each level, the Java-specific hazards worth a
  reviewer's attention (concurrency, resource lifetime, exception translation, API
  compatibility, migrations), and the explicit list of what to hand to automation. Read while
  reviewing.
- **Writing and receiving findings** — `references/giving-and-receiving.md`. The anatomy of an
  actionable comment, severity vocabulary, resolving deadlock between reviewer and author,
  receiving feedback, and when pairing replaces review rather than adding to it. Read when a
  review is stalled, tense, or being rubber-stamped.
