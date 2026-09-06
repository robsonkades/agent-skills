---
name: gc-log-analysis
description: >
  Configuring and reading JVM unified GC logs: the -Xlog:gc* baseline with decorators and
  rotation, the cause field, the before->after->capacity triple and headroom, pause
  distribution, Eden-refill and old-region-growth estimates derived from region lines,
  adaptive tenuring pressure via gc+age, and correlation with -Xlog:safepoint. Use when a log needs to be
  interpreted, when GC logging is not enabled and the right GC tag-sets have to be chosen,
  when full collections or Metadata GC Threshold appear, when the heap floor rises after
  equivalent reclamation points, when an allocation or promotion proxy has to come from the log
  rather than a profiler, when a log starts above zero uptime, or when an analysis script
  reports zero pauses. Does not cover collector mechanics (gc-fundamentals),
  collector choice and heap sizing (jvm-gc-tuning), or allocation profiling
  (jfr-and-async-profiler). Syntax is unified-logging; cross-layer pause attribution is
  pause-attribution.
---

# GC Log Analysis

## Purpose

Get testable hypotheses out of low-overhead JVM evidence. GC logging needs no agent and can
persist across the incident, but its overhead and volume depend on tag level, sink and I/O;
measure the production configuration. Enabling it after an incident cannot reconstruct
the missing interval, so a bounded baseline belongs in the service template.

## Workflow

1. **Identify the JDK build, collector, process identity, decorators and captured window.**
   Analyze available evidence with its limits; if logging is missing, arrange an authorized
   bounded capture without claiming it reconstructs the past. Do not upgrade to match a recipe.
2. **Read the cause, collector, event type and adjacent lines before forming a
   hypothesis.** The cause routes the investigation but is not a root-cause verdict; one
   trigger can lead to several mechanisms and collectors use different vocabularies.
3. **Separate duration from frequency.** Many short pauses violate no per-pause threshold
   and still consume throughput: one hundred 20 ms pauses per minute is 2 seconds per
   minute stopped, over 3%, and no duration-based alert fires.
4. **Read the `after` number in collector context, and more than it, its trend.** In
   `before->after(capacity)`, compare equivalent reclamation points under equivalent load.
   A rising floor is a retention hypothesis, not proof: delayed concurrent reclamation,
   adaptive sizing, humongous occupancy and phase selection can change the number.
5. **Check reported committed-capacity headroom** — capacity minus `after`, not necessarily
   distance to `-Xmx`, usable evacuation space or contiguous allocation capacity.
6. **Reconcile with the observed pause.** If they disagree, go to the safepoint log; the
   reported pause excludes Time-To-SafePoint.
7. **If you need to know how much is allocated and how much survives**, the log can
   provide bounded proxies: Eden refill and old-region growth come from the `Eden regions`
   and `Old regions`
   lines and the region size in `gc,init` — see `references/rates-from-the-log.md`. **If
   you need to know who allocated**, it cannot — take JFR with
   `jdk.ObjectAllocationSample`.

## Rules

- Candidate baseline: `-Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m`.
  Both `time` **and** `uptime` decorators — one correlates with incidents, the other with
  process lifetime. Size rotation and retention from event rate, disk budget and incident
  look-back; protect against both overwriting the relevant window and filling the volume.
- Consider `-Xlog:safepoint:file=safepoint.log:time,uptime` alongside it when the latency
  SLO needs TTSP attribution. Validate its volume and sink as part of the same budget.
- Unified logging is **synchronous by default**. The thread emitting the line — including
  a GC thread inside the safepoint — waits for the write, so on slow or throttled I/O the
  instrument can add latency to the pause it is measuring. `-Xlog:async` (JDK 17+) moves writes
  to a logging thread; it does not remove formatting/queue overhead. Check the target release's
  drop/stall mode and dropped-message notices before treating a capture as complete.
- Never read only the mean pause. Report count, total stop-the-world pause fraction, an
  explicitly defined percentile estimator and max, split by event type and operating
  regime. Small samples make p99 effectively one of the largest observations; attach the
  sample size and window.
- Three-argument `match()` is not POSIX awk; unsupported implementations may reject its syntax.
  OS name does not identify the awk implementation. Use `RSTART`/`RLENGTH`, inspect stderr and
  every pipeline stage's status, and test against known events plus empty/unsupported input.
- `new threshold` below `max threshold` in a `gc+age` line means adaptive tenuring chose an
  earlier promotion age; that can be healthy. Call it premature only when promotion,
  old-generation pressure or downstream collection cost is harmful and the age table
  shows survivor pressure. A larger young/survivor budget is then one candidate; validate
  it because lowering the pause target can shrink young and worsen the same mechanism.
- Raising the heap is not the first response to frequent short pauses. Allocation rate and
  ergonomic young sizing are common causes; a larger heap can change frequency, young
  size, concurrent-cycle timing and failure headroom, with collector-specific pause
  effects. Confirm the mechanism: estimate allocation rate from the log and compare
  it with the Eden target `(N)` and ergonomic logs; a small target alone does not establish
  why it was chosen. See `references/rates-from-the-log.md`.
- A first uptime above zero can reflect rotation, late activation, truncation or an excerpt.
  Inspect file continuity and process identity; rotated suffixes are a ring, not a chronological
  sort. Use measured window boundaries, not process lifetime, and avoid duplicate overlap.
- Treat log-derived rates as estimates with explicit blind spots: region rounding,
  humongous allocation, collector phase and rotation boundaries. Cross-check surprising
  values with JFR or another independent counter before changing capacity.
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
  arithmetic for Eden refill, old growth, survivor occupancy and STW pause share with the
  caveats that change the number (humongous, mixed collections, rotation), a validated
  POSIX awk recipe, and a symptom-to-cause table. Read when an allocation or promotion proxy
  has to come out of the log, when a young pause grows without changing frequency, or when
  a log starts at an uptime well above zero.
- [Cause field reference](references/cause-field.md) — what each cause means and what to
  investigate next, including the ZGC log format change. Read when the cause in
  parentheses is unfamiliar or the log format does not match the examples you know.
