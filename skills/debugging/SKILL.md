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
   If it only happens in production, collect evidence within the mitigation budget
   (`references/production-evidence.md`).
3. **Shrink.** Remove inputs, steps, data and configuration until removing anything more makes
   the fault disappear, while preserving the original failure signature. Stop when the next
   reduction costs more than it helps; a minimal reproduction need not identify the full cause.
4. **State a hypothesis that predicts something you have not yet looked at.** "If the cause is
   the missing time zone, then the row written at 23:30 local will carry yesterday's date."
   Also name an observation that would refute it. Explaining existing evidence is useful;
   a discriminating prediction makes the next experiment useful.
5. **Test it by changing exactly one thing**, and record the result whether it confirms or
   refutes. Two changes at once means a confirmed hypothesis is still ambiguous.
6. **Check the explanation against the distribution** — frequency, timing, affected and unaffected
   users. Record remaining contradictions and uncertainty instead of forcing one cause to explain
   unrelated failures.
7. **Write the failing test, then fix, then verify** (tdd). The reproduction from step 3 is
   a candidate test. Use the narrowest level preserving the failure; a race may need controlled
   scheduling or integration coverage. Record when reproduction remains intermittent.

Inspect deployed versus source JDK/toolchain, dependencies, JVM flags, configuration and data
versions before version-sensitive diagnostics or changes. This workflow has no universal Java
baseline. Preserve the target environment; upgrading it is a separate decision. Return the fault,
evidence, tested/refuted hypotheses, fix or mitigation, validation and unresolved gaps. Missing
access or reproduction permits an evidence plan, not an invented root cause.

## Rules

- Prefer a causal explanation before a permanent fix. During an incident, a reversible mitigation
  may precede diagnosis; label it as mitigation, preserve the evidence the response budget allows,
  and do not present symptom disappearance as root-cause proof.
- Prefer one controlled variable per experiment. If a batch helps, it implicates the batch but
  does not isolate a member or interaction; reduce/revert the batch in a controlled environment.
- Read the whole stack trace, including cause and suppressed chains. The deepest application frame
  is a useful boundary candidate, not a verdict: framework callbacks, generated code, reflection,
  native frames, and library defects can move or hide the causal frame.
- Balance evidence preservation against customer impact and the incident commander's authority.
  Capture cheap, non-disruptive evidence first when the error budget permits; mitigate immediately
  when delay is unsafe, and record which volatile evidence the action destroyed
  (`references/production-evidence.md`).
- Symptom disappearance is evidence of recovery, not proof of cause or durable correction.
- Question the assumption that the fault is where the symptom is. Corrupted state is written
  in one place and observed in another, often much later. Trace the first contract violation;
  an incorrect write is one candidate, but valid data can also be misread or misinterpreted.
- Consider `git bisect` when verified good/bad revisions and a reliable classifier exist.
  It can narrow a monotone change in roughly log₂(n) classifications; build cost, skipped commits
  and intermittent or nonmonotone outcomes affect that benefit. See the reference's exit protocol.
- Delete the debugging output before the change ships, and if a log line was genuinely useful,
  promote it deliberately with a level and structure (structured-logging) rather than leaving
  a `System.out.println`.
- Timebox according to incident severity and experiment cost. Repeated refutations are a signal
  to revisit observations, harness assumptions and the system model or seek another perspective.

## References

- **The method in detail** — `references/method.md`. Shrinking a reproduction, differential
  diagnosis (what changed — code, data, config, dependency, traffic, time), bisection over
  commits and over data, reading exception chains, and the specific traps of intermittent and
  heisenbug faults. Read when the fault resists the workflow above.
- **Evidence from a running system** — `references/production-evidence.md`. What each source
  can and cannot answer — logs, metrics, traces, thread dumps, heap dumps, JFR, database state,
  deployment history — with volatility, cost and collection order during an incident. Read
  before touching a production system that is currently faulty.
