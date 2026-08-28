---
name: debugging
description: >
  Finding the cause of a fault instead of a change that makes the symptom go away:
  reproducing before diagnosing, shrinking the reproduction until nothing is removable,
  stating a hypothesis that predicts an observation, changing one variable at a time,
  bisecting, and choosing which evidence to collect from a running production system before
  it is destroyed. Use when a fix is being guessed at, when a change "seems to work", when
  the same bug keeps coming back, when a fault cannot be reproduced, when a production
  incident needs a cause rather than a restart, when print statements are being added
  everywhere, or when several changes were made at once and it now works. Does not cover
  JVM performance triage (java-performance), GC (jvm-gc-tuning), live thread diagnosis
  (concurrency-diagnostics), heap dump mechanics (heap-dump-analysis), or deliberately
  injecting failures (distributed-systems-testing).
---

# Debugging

## Purpose

Turn a report into a cause. The alternative — changing things until the symptom disappears —
produces code nobody understands, a bug that returns under a slightly different input, and no
way to tell whether the change helped or moved the failure somewhere quieter.

The discipline is cheap and it is nearly always skipped under pressure, which is exactly when
guessing is most expensive.

## Workflow

1. **Restate the fault as an observation.** "Customer 88123 saw a negative balance at 14:02"
   is an observation. "The refund logic is broken" is a hypothesis wearing a report's clothes,
   and adopting it early is how the wrong subsystem gets investigated for a day.
2. **Reproduce it.** Deterministically if possible, intermittently if not — but know which,
   because "I cannot reproduce it" and "it reproduces one time in ten" lead to different work.
   If it only happens in production, collect evidence there before touching anything
   (`references/production-evidence.md`).
3. **Shrink.** Remove inputs, steps, data and configuration until removing anything more makes
   the fault disappear. What remains is the fault's actual surface, usually far smaller than
   the report, and often small enough to be a unit test.
4. **State a hypothesis that predicts something you have not yet looked at.** "If the cause is
   the missing time zone, then the row written at 23:30 local will carry yesterday's date."
   A hypothesis that only explains what you already saw cannot be wrong, and so cannot be
   tested.
5. **Test it by changing exactly one thing**, and record the result whether it confirms or
   refutes. Two changes at once means a confirmed hypothesis is still ambiguous.
6. **Confirm the cause explains everything**, including the parts that seemed irrelevant — the
   frequency, the timing, the customers affected and the ones not. An explanation that covers
   the symptom but not its distribution is usually a second symptom.
7. **Write the failing test, then fix, then verify** (tdd). The reproduction from step 3 is
   the test; it costs nothing extra at this point.

## Rules

- Never fix what you cannot explain. A change that makes the symptom go away without a causal
  account is a coincidence you have promoted to a release — and it silently removes the
  evidence that would have found the real cause.
- One variable at a time. If a batch of changes makes it work, you have learned nothing about
  which one mattered, and you now carry the other four for ever.
- Read the whole stack trace, not the first line: the deepest frame in your own code is where
  to look, and the `Caused by` chain at the bottom usually names the actual fault. A trace
  with no frame from your code means the fault is in how you called something, not in it.
- Preserve evidence before restoring service where the two conflict, and where they do not
  conflict, collect first — a restart destroys thread state, heap contents and in-flight
  requests, and there is no way to get them back (`references/production-evidence.md`).
- "It works now" is not a resolution. Either you know what changed, or the fault is still
  present and you have lost the reproduction.
- Question the assumption that the fault is where the symptom is. Corrupted state is written
  in one place and observed in another, often much later; the write is the bug.
- Bisect when the code used to work. `git bisect` over a reliable reproduction script finds the
  commit in log₂(n) steps and is almost always faster than reasoning about the diff.
- Delete the debugging output before the change ships, and if a log line was genuinely useful,
  promote it deliberately with a level and structure (structured-logging) rather than leaving
  a `System.out.println`.
- Timebox. If two hours of hypotheses have all been refuted, the model of the system is wrong
  somewhere; go back to observations, or ask someone who has a different model.

## References

- **The method in detail** — `references/method.md`. Shrinking a reproduction, differential
  diagnosis (what changed — code, data, config, dependency, traffic, time), bisection over
  commits and over data, reading exception chains, and the specific traps of intermittent and
  heisenbug faults. Read when the fault resists the workflow above.
- **Evidence from a running system** — `references/production-evidence.md`. What each source
  can and cannot answer — logs, metrics, traces, thread dumps, heap dumps, JFR, database state,
  deployment history — with volatility, cost and collection order during an incident. Read
  before touching a production system that is currently faulty.
