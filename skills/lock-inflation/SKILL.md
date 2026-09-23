---
name: lock-inflation
description: >
  Diagnosing and engineering Java intrinsic-monitor contention across fast and inflated monitor
  states without freezing one HotSpot release's internals. Covers ownership, recursion, wait sets,
  entry queues, inflation/deflation, virtual-thread behavior, JFR/thread-dump evidence,
  threshold/censoring, convoys, fairness, lock graphs, critical-section redesign, partitioning and
  validation. Use when `synchronized` wait/hold time is suspected; JMM correctness, explicit locks,
  false sharing and lock-free algorithms have separate owners.
---

# Lock inflation

## Purpose

Determine whether intrinsic-monitor acquisition/ownership is a material cause of latency or
capacity loss, identify the guarded work and owner, then preserve semantics while reducing harmful
serialization. Inflation is an implementation state, not itself proof of a production problem.

Match the evidence to the question and reuse adequate supplied artifacts. A language-level
wait/monitor explanation or a supported keep-current review can finish without a new capture.
Inspect the target project's JDK/vendor and relevant flags before runtime-specific advice;
the Java 25 documentation/source examples below are not a minimum version or upgrade permission.

## Ownership boundary

- This skill owns intrinsic monitors (`synchronized`, `Object.wait/notify`) and HotSpot monitor
  lifecycle evidence.
- `java-thread-safety-contracts` owns API invariant/lock policy.
- `concurrency-diagnostics` owns broad deadlock/starvation/live incident triage.
- `lock-free-patterns` owns nonblocking alternatives; `false-sharing-and-contended` owns cache-line
  sharing without logical lock ownership.

## Investigation contract

For a runtime contention diagnosis, use the relevant fields below. A static semantic explanation
needs the guarded code and applicable contract; a source explanation needs a matching source
version. Neither requires every runtime measurement or a proposed implementation change.

```text
symptom/SLO, load and affected interval:
monitor/critical section and guarded invariant:
contending thread/task roles and key distribution:
acquisition wait, hold time, queue/blocked count and owner path:
JDK/vendor/build, virtual/platform thread mode and effective flags:
JFR event settings/thresholds/stacks/loss and dump cadence:
CPU/quota/GC/safepoint/downstream evidence:
candidate semantic change and correctness/fairness guardrails:
```

## Monitor model

`synchronized` provides mutual exclusion, reentrancy and JMM monitor edges. HotSpot can represent
uncontended/lightweight ownership differently from an inflated `ObjectMonitor`. Contention,
`wait()`, identity/hash/header constraints, diagnostics and runtime heuristics can trigger
transitions depending on release/configuration.

An inflated monitor typically tracks an owner, recursion, contenders/entry structures and waiters,
but field names, queue algorithms, mark-word/table representation, spinning and deflation change
across JDKs. Use release-tagged source and runtime evidence before explaining internals. See
`references/monitor-lifecycle.md`.

Inflation does not mean every later acquisition parks; fast/reentrant/spinning paths and ownership
may still vary. Deflation is lifecycle/housekeeping, not a remediation for active contention.

## Event-to-mechanism mapping

| State/evidence                    | Candidate mechanism                      | Caveat                                                 |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| thread `BLOCKED` entering monitor | intrinsic-monitor acquisition            | one sample has no duration/population                  |
| JFR `JavaMonitorEnter`            | qualifying monitor acquisition wait      | settings/threshold censor shorter waits                |
| JFR `JavaMonitorWait`             | `Object.wait` lifecycle                  | intentional condition wait may be healthy              |
| JFR `ThreadPark`                  | park-based synchronizer/wait             | includes many locks, pools, futures, queues            |
| high CPU in monitor/spin path     | spinning/churn/contention                | require owner/progress and compiled/native attribution |
| deadlock report                   | monitor/ownable synchronizer cycle found | pool/resource/class-init starvation may be absent      |

For event-based claims, discover schemas/settings on the target JDK. Stock JFC thresholds are
version/configuration facts; no fixed 1/10/20 ms rule proves absence. When absence or short-wait
coverage matters, establish sensitivity with an applicable positive control and opportunity estimate;
reuse adequate prior validation. Acquisitions still in progress may not yet have committed events.

Event completion and Java method completion are different boundaries. For `Object.wait` latency,
verify whether `JavaMonitorWait` includes reacquisition; a completed event need not mean the call
returned. A `JavaMonitorEnter` waiter stack and `previousOwner` identity do not establish the
owner's hold stack or explain the whole delay. Read `references/measuring-contention.md` before
making either attribution.

## Measurement

When runtime attribution is needed, select missing evidence that can change the conclusion and
align it to workload:

- event count and duration distribution by monitor class/address/acquisition stack where available;
- affected operations, wait per operation and fraction of requests encountering wait;
- concurrent blocked population/queue trajectory, not only summed thread durations;
- owner hold path and hold-time proxy/instrumentation when acquisition events cannot show it;
- CPU, quota/throttle, GC/safepoint and remote/I/O inside the owner path;
- key/tenant/shard skew without unsafe-cardinality production labels.

Summed waits across threads overlap and can exceed wall-clock interval. Divide only by a compatible
denominator (for example total request operations or total eligible thread-time) and state it.
An acquisition-event percentile is not a per-operation percentile; the latter needs an operation
cohort and correlated wait aggregation with incomplete/thresholded observations accounted for.
Arbitrary “5/20% contention bands” are not SLO evidence.

## Remediation decision tree

```text
unrelated/slow work inside lock?
  -> move/precompute only if invariant, callback ordering and failure atomicity remain correct
one hot key/global invariant but independent partitions exist?
  -> shard/stripe/owner model; test skew, cross-partition operations and memory cost
read-mostly immutable-replace semantics?
  -> volatile/atomic immutable snapshot
needs interruptible/timed/multiple-condition/fairness API?
  -> ReentrantLock chosen for semantics, then measure
short exact counter/operation?
  -> atomic/adder only if consistency semantics fit
lock is not bottleneck or change adds complexity?
  -> keep synchronized
```

Changing primitive without changing serialization often moves the same queue. Fair
`ReentrantLock` can alter barging/throughput/tail but is not a FIFO/SLO guarantee in all operations.
`StampedLock` is non-reentrant and optimistic reads require validation/retry; use only after evidence.

## Virtual threads and versions

JEP 491 in JDK 24 changed HotSpot monitor behavior so blocking in `synchronized` generally no longer
pins a virtual thread to its carrier. It did not make the critical section parallel or remove wait
latency. Native/foreign/implementation edge cases and older JDKs still require target evidence.

Locking flags and mark-word/monitor-table internals have changed across JDK 17/21/24/25 and later.
Never build a runbook around one numeric `LockingMode` value or assume an absent flag means a broken
command. Verify support/effect against the exact build and route lifecycle review to
`jvm-performance-review`.

## Correctness and failure tests

Select tests for the proposed semantic change and affected failure paths; reuse adequate existing
results. Capture controls support measurement claims, not every static explanation.

- invariant/history tests before and after reducing/splitting lock scope;
- callback reentry/throw/block and I/O timeout while owning lock;
- reverse multi-lock order, equal-key tie and class initialization;
- `wait` spurious wakeup, notify/timeout/interrupt/shutdown races;
- pool/queue/future starvation with no monitor cycle;
- hot key, many virtual threads, CPU quota/throttle and GC pause;
- fairness/starvation and owner death/long hold;
- JFR threshold positive control and artifact loss.

## Anti-patterns

| Anti-pattern                              | Failure                               | Better approach                            | Narrow exception                  |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------ | --------------------------------- |
| One `jstack` proves contention            | moment has no rate/duration           | repeated/JFR window + workload denominator | immediate deadlock cycle evidence |
| Inflation equals bottleneck               | state can persist/idly exist          | acquisition/hold/queue/SLO evidence        |
| Fixed event threshold means no contention | censored waits                        | inspect settings and positive control      |
| Swap to `ReentrantLock` for speed         | serialization unchanged               | choose semantic feature/redesign invariant | measured implementation effect    |
| Fair lock guarantees SLO                  | scheduling/barging/hold time remain   | measure fairness/tail and overload         |
| Identity-sort solves every deadlock       | collisions/ties/external locks        | stable total order with tie handling       |
| JEP 491 removes lock cost                 | only carrier pinning behavior changed | bound contention and resource demand       |

## Definition of done

Return the supported conclusion, its evidence/assumptions and any material limitation or smallest
next check. Apply the items relevant to the request; a correct explanation or adequate current
design is a complete result without an invented capture or finding.

- [ ] The relevant monitor/invariant and semantic, source or runtime evidence are identified.
- [ ] For capture-based claims, settings, thresholds, opportunity, loss and target JDK are validated.
- [ ] For performance claims, event/operation populations, overlap and request/SLO impact are reported.
- [ ] A proposed alternative preserves atomicity, callback order, failure and progress semantics.
- [ ] Applicable hot-key, virtual-thread, fairness, shutdown and deadlock/starvation checks
      support the proposed change; unavailable checks and remaining risks are explicit.
- [ ] A changed implementation improves the targeted metric without shifting failure elsewhere,
      or the result is explicitly keep-current/rejected/inconclusive with its evidence.

## References

- [Version-scoped monitor lifecycle](references/monitor-lifecycle.md) — read when interpreting
  inflation, wait/reacquisition, headers or monitor-state evidence.
- [Measuring and reducing contention](references/measuring-contention.md) — read when planning
  a capture or changing critical-section scope/partitioning.
- [JEP 491](https://openjdk.org/jeps/491)
- [JLS 17 monitors and waits](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html)
- [OpenJDK 25 GA monitor source example](https://github.com/openjdk/jdk/tree/jdk-25-ga/src/hotspot/share/runtime) — match the target vendor/build before attributing a runtime path.
