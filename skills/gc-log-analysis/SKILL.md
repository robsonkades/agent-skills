---
name: gc-log-analysis
description: >
  Configuring and reading JVM unified GC logs: the -Xlog:gc* baseline with decorators and
  rotation, the cause field, the before->after->capacity triple and headroom, pause
  distribution, allocation and promotion rate derived from the region lines, premature
  promotion via gc+age, and correlating with -Xlog:safepoint. Use when a GC log needs to be
  interpreted, when GC logging is not enabled and the right GC tag-sets have to be chosen,
  when full collections or Metadata GC Threshold appear, when the heap floor rises after
  each complete collection, when an allocation or promotion rate has to come out of the log
  rather than a profiler, when a log starts at an uptime well above zero, or when an
  analysis script reports zero pauses. Does not cover collector mechanics (gc-fundamentals),
  collector choice and heap sizing (jvm-gc-tuning), or allocation profiling
  (jfr-and-async-profiler). The -Xlog syntax itself is unified-logging. Attributing an
  observed pause across layers is pause-attribution.
---

# GC Log Analysis

## Purpose

Get a conclusive answer out of the cheapest observability the JVM offers. A GC log costs a
fraction of a percent, needs no agent, and persists — and enabling it during the incident
does not recover what already happened, which makes it baseline configuration rather than
a diagnostic step.

## Workflow

1. **Confirm the baseline configuration exists** (see Rules). If it does not, fix that
   first; everything else is guesswork until the next incident.
2. **Read the cause in parentheses before forming any hypothesis.** It is the most
   informative field on the line, and four common values lead to four unrelated
   investigations.
3. **Separate duration from frequency.** Many short pauses violate no per-pause threshold
   and still consume throughput: one hundred 20 ms pauses per minute is 2 seconds per
   minute stopped, over 3%, and no duration-based alert fires.
4. **Read the `after` number, and more than it, its trend.** In `before->after(capacity)`,
   a floor that rises after each complete cycle is retention, and no flag fixes retention.
5. **Check headroom** after each collection — capacity minus `after`.
6. **Reconcile with the observed pause.** If they disagree, go to the safepoint log; the
   reported pause excludes Time-To-SafePoint.
7. **If you need to know how much is allocated and how much survives**, the log can
   tell you: allocation and promotion rate come from the `Eden regions` and `Old regions`
   lines and the region size in `gc,init` — see `references/rates-from-the-log.md`. **If
   you need to know who allocated**, it cannot — take JFR with
   `jdk.ObjectAllocationSample`.

## Rules

- Baseline: `-Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m`.
  Both `time` **and** `uptime` decorators — one correlates with incidents, the other with
  process lifetime. Rotation is not optional: an unrotated diagnostic log becomes the
  incident.
- Enable `-Xlog:safepoint:file=safepoint.log:time,uptime` alongside it. A whole class of
  latency problem is invisible without it.
- Unified logging is **synchronous by default**. The thread emitting the line — including
  a GC thread inside the safepoint — waits for the write, so on slow or throttled I/O the
  instrument adds latency to the pause it is measuring. `-Xlog:async` (JDK 17+) fixes
  that, at the cost of dropping messages under saturation; accept that trade deliberately.
- Never read the mean pause. GC pauses are the canonical heavy tail: the mean is dominated
  by routine collections and hides the rare event that breaks the SLO. Use p99 and max.
- Do not trust an analysis script using three-argument `match()` — that is a GNU
  extension. Outside Linux it does not fail, it prints **zero**, which is worse. Use
  `RSTART`/`RLENGTH`, and test any third-party script against a log you know has pauses.
- `new threshold` below `max threshold` in a `gc+age` line is premature promotion,
  diagnosable before any heap dump. The fix is usually a **larger** young generation — and
  the intuitive intervention, lowering the pause target, makes it worse.
- Raising the heap is not the first response to frequent short pauses. That is almost
  always allocation pressure; a bigger heap defers the symptom and **lengthens** the pause
  when it finally arrives. Confirm it: derive the allocation rate from the log and compare
  it with the Eden target `(N)` — a tiny target with a modest rate is the pause target
  sizing young down, not the workload. See `references/rates-from-the-log.md`.
- A log whose first uptime is well above zero has rotated, not restarted. The `gc,init`
  block — region size, `Using N workers` — lives in the oldest file, and any rate must
  span the first to the last pause in the file, not the process lifetime.
- A production GC log reveals load pattern, installed capacity and deploy cadence.
  Uploading it to a third-party analysis service is a security decision, not a convenience
  one. Prefer local tools by default.
- Pre-JDK-9 GC logging flags are a mixed trap: some survive as deprecated aliases, others
  were removed — and a removed flag stops the JVM from starting at all.

## References

- [Log analysis recipes](references/log-analysis-recipes.md) — POSIX awk scripts for pause
  distribution, cause counts and headroom, plus the JFR commands for allocation sources.
  Read when you have a log in hand and need numbers out of it.
- [Rates from the log](references/rates-from-the-log.md) — the anatomy of a G1 line, the
  arithmetic for allocation rate, promotion rate, survival ratio and GC overhead with the
  caveats that change the number (humongous, mixed collections, rotation), a validated
  POSIX awk recipe, and a symptom-to-cause table. Read when an allocation or promotion rate
  has to come out of the log, when a young pause grows without changing frequency, or when
  a log starts at an uptime well above zero.
- [Cause field reference](references/cause-field.md) — what each cause means and what to
  investigate next, including the ZGC log format change. Read when the cause in
  parentheses is unfamiliar or the log format does not match the examples you know.
