---
name: lock-inflation
description: >
  The lifecycle of a Java monitor under contention: the fast-locked and inflated mark word
  states on the current baseline, the LockStack and the ANONYMOUS_OWNER inflation protocol,
  adaptive spinning, the ObjectMonitor entry queues, measuring contention as a fraction of
  wall time, and reducing or partitioning a hot critical section. Use when threads sit in
  BLOCKED on a synchronized block, when jdk.JavaMonitorEnter dominates a recording, when
  throughput stops scaling as threads are added, when -XX:LockingMode or
  -XX:+UseBiasedLocking appears on a JVM command line, or when someone proposes swapping
  synchronized for ReentrantLock to avoid virtual-thread pinning. Does not cover
  happens-before and safe publication (java-memory-model), collecting the profile itself
  (jfr-and-async-profiler), cache-line contention with no lock involved
  (false-sharing-and-contended), or lock-free algorithm design (lock-free-patterns).
---

# Lock Inflation

## Purpose

Decide whether a `synchronized` section is actually costing latency, and if so what to
change. The failure this prevents is the wrong conclusion drawn from a single thread
dump: one thread caught in `BLOCKED` at the instant of sampling is not contention, and
"throughput went up after the fix" is not proof the lock was the bottleneck.

The second failure is folklore about the current baseline. Biased locking is gone,
`LM_LIGHTWEIGHT` is the default, and JEP 491 ended `synchronized` pinning virtual
threads — none of which makes a contended lock cheaper. Each of those changes reduced
the cost of the _uncontended_ path or of _carrier exclusivity_; the cost of waiting is
untouched.

## Workflow

1. **Confirm the mechanism you are measuring against.** Run
   `java -XX:+PrintFlagsFinal -version | grep LockingMode`. `2` (`LM_LIGHTWEIGHT`) is the
   JDK 25 default; `1` means someone set `-XX:LockingMode=1` and inherited a deprecated
   flag — flag it for removal before comparing anything. The flag exists only on the JDK 24–25
   generation: measured, `LockingMode` is **absent on Temurin 21.0.12, present as `2` on
   25.0.4, and absent again on 26.0.2**. So on 21 and from 26 an empty result is the expected
   answer rather than a broken command — the check degrades to a false negative, not an error.
   On those releases read `UseObjectMonitorTable` instead, which decides what an inflated mark
   word looks like.
2. **Name a suspect critical section before instrumenting.** Searching the whole heap for
   contention produces a profile nobody can act on.
3. **Collect over a window, not a moment.** `jcmd <pid> JFR.start settings=profile
duration=60s filename=locks.jfr`, or repeated thread dumps. If the application uses
   virtual threads, `jstack` will not show them — use
   `jcmd <pid> Thread.dump_to_file -format=json`.
4. **Map thread state to the right event.** `BLOCKED` on `synchronized` →
   `jdk.JavaMonitorEnter`; `Object.wait()` → `jdk.JavaMonitorWait`; `LockSupport.park`,
   `ReentrantLock` and connection pools → `jdk.ThreadPark`. Connection-pool waiting is
   never `JavaMonitorEnter`. See `references/measuring-contention.md`.
5. **Express contention as a fraction of aggregate wall time**, not of CPU time, and
   compare it against a baseline run. An isolated percentage decides nothing.
6. **Reduce scope before changing primitive.** Move work that needs no lock out of the
   section; then partition by key; only then reach for a different primitive, chosen by
   the read/write profile and the features you need.
7. **Validate by the same metric that convicted the lock.** Aggregate
   `jdk.JavaMonitorEnter` time or `BLOCKED` count must fall, under the same load and the
   same warm-up, and check which resource became the next limit.

## Rules

- Contention is aggregate time, never a single sample. Require recurring
  `jdk.JavaMonitorEnter` events over 1 ms, or a continuously growing
  `ThreadInfo.getBlockedCount()`, before calling it contention.
- Never conclude contention from one `jstack`. Take multiple dumps.
- The JFR lock events carry a 10 ms threshold in `profile.jfc` (20 ms in `default.jfc`).
  Contention finer than that is invisible until you build a custom `.jfc` with
  `jfr configure` — absence of events at the default threshold is not absence of
  contention.
- Overhead below 5% is usually acceptable, 5–20% is visible in p99, above 20% is likely
  the dominant bottleneck. These are triage bands, not thresholds: calibrate against the
  system's SLO.
- Do not build tuning scripts or runbooks around `-XX:LockingMode=1`. `LM_LEGACY` and
  `LM_MONITOR` were deprecated in JDK 24 (JDK-8334299); the flag became **obsolete in
  JDK 26** — accepted and silently ignored — and was **removed in JDK 27**, where it has
  zero occurrences in `globals.hpp`. Lightweight locking is the only mechanism from 26 on,
  so setting the flag on 26 changes nothing and on 27 is unrecognised.
- `-XX:+UseBiasedLocking` is not a tuning option to restore. Disabled by default in
  JDK 15 (JEP 374), code removed entirely in JDK 18 (JDK-8256425).
- Never choose `ReentrantLock` over `synchronized` "to avoid pinning". Since JEP 491
  (JDK 24) a contended `synchronized` unmounts the virtual thread instead of pinning its
  carrier. Choose on semantics: `tryLock`, an acquisition timeout, explicit fairness, or
  multiple `Condition`s.
- The waiting still costs latency after JEP 491. The task blocked on the monitor is still
  in the request's response time and still appears in `jdk.JavaMonitorEnter`.
- `StampedLock` is **not** reentrant — acquiring it twice on one thread deadlocks against
  itself. `ReentrantReadWriteLock` is reentrant and simpler.
- Monitor wake-up order is not FIFO. `_cxq` and `_EntryList` do not guarantee fairness;
  if service order matters to the SLO, use `new ReentrantLock(true)` and accept the cost.
- Deflation of an idle monitor happens on a periodic asynchronous pass. It is not a
  real-time mitigation and must not appear in a remediation plan.
- Hold the lock for the whole iteration of a synchronized collection, not just while
  obtaining the iterator.
- Double-checked locking requires the field to be `volatile`; prefer the holder idiom.
- Acquire multiple locks in one total order (for example, sorted by identity) or accept
  the deadlock.

## References

- [Monitor lifecycle](references/monitor-lifecycle.md) — mark word tags, the `LockStack`,
  the `ANONYMOUS_OWNER` inflation protocol step by step, the `ObjectMonitor` fields and
  its three queues, and the JDK version table. Read when you need to explain _why_ an
  inflation happened, or when reconciling this baseline against older documentation.
- [Measuring and reducing contention](references/measuring-contention.md) — the
  collection commands, the thread-state-to-JFR-event table, the overhead formula, and the
  primitive-selection and partitioning recipes. Read when collecting a contention profile
  or choosing what to change.
