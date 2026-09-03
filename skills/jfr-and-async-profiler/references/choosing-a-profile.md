# Choosing a profile

## From symptom to discriminating evidence

| Observed state              | Competing hypotheses                                                            | First evidence                                                      | Escalate when                                   |
| --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| high CPU per completed work | application compute, GC, JIT, native/kernel, spin/instrumentation               | per-thread/process/cgroup CPU + CPU stacks + JFR runtime chronology | native/kernel/PMU/JIT detail remains ambiguous  |
| high latency, modest CPU    | queue/pool/downstream I/O, locks, pause/throttling, load skew, client timing    | service/trace/queue + JFR duration events + wall/off-CPU stacks     | kernel/network or logical owner is missing      |
| frequent/expensive GC       | high allocation, live set, humongous/reference/card work, heap/collector policy | GC logs/JFR + work-normalized allocation/occupancy                  | allocation site/lifetime/retention is needed    |
| RSS/native growth           | heap commitment, stacks, direct/native, mappings/page cache, leak               | cgroup/proc + NMT if enabled + JFR/memory evidence                  | native allocation/core/heap artifact required   |
| liveness/deadlock           | monitor/park/queue/dependency/scheduler/GC/safepoint                            | repeated thread/task dumps + lock/JFR/OS state                      | attach fails or native owner requires core/eBPF |
| startup/readiness           | class loading, JIT/AOT, cache/connection/data init, probes                      | JFR from start + readiness phase markers                            | compilation/class/I/O owners need targeted data |
| one pod/tenant/operation    | traffic/data/host/version/lifecycle skew                                        | segmented metrics/traces and compatible control                     | context-aware profile is safe and bounded       |

The table chooses an evidence set, not a fix.

## Which clock or event?

### CPU/event sampling

Use when the decision concerns compute capacity or a CPU/PMU event. Confirm whether samples
include Java, native, JVM service, and kernel frames; whether selection is per CPU consumed or a
sampler policy; and whether throttling/loss exists. Normalize CPU cost per completed work where
appropriate.

### Wall/off-CPU sampling

Use to locate where eligible threads reside during elapsed time. It mixes healthy idleness and
harmful waiting unless split by role/state/work. With many threads, event volume and overhead can
be large. It cannot by itself identify the resource owner or request critical path.

### Duration events

Use JFR/app/trace events for typed start/duration/fields. Thresholds censor short events and
event coverage may omit async work or certain APIs. Summed durations across threads overlap.
Inspect event schema/settings and correlate with request/work identifiers carefully.

### Allocation events

Use when the question is creation rate/site. Determine whether weight is estimated bytes,
actual bytes, event count, TLAB event, or sampled object. Allocation is not retention. Compare
per work and verify whether GC/user outcome changes.

### Lock events

Use when contention is supported by monitor/park/thread evidence. Thresholded lock profiles
select only qualifying waits and may cover several mechanisms differently by tool/version.
Application queues, pool acquisition, I/O, condition waits, and lock ownership need separate
evidence.

## Event opportunity and zero results

For every expected event, estimate opportunity:

```text
eligible operations/threads/allocations during window
* fraction above threshold or selected by sampler
* target/filter coverage
= expected recorded population before loss
```

When zero appears:

1. Was the target/load active during the exact recording time?
2. Does the event exist and support this platform/JDK/tool?
3. Was it enabled with the intended threshold/period/throttle/stack/filter?
4. Did the parser/view include the right event and schema?
5. Did buffers/rate/memory/disk lose or suppress it?
6. Does a synthetic positive control appear?
7. Only then report no qualifying observed events, bounded to this window/configuration.

`jfr summary` validates actual file event counts; metadata validates schemas. Neither alone
proves the application had an opportunity to emit an event.

## Adequacy model

For an unweighted random sample, expected count of a frame with share `p` is roughly `N*p`, but
real profilers introduce clustering, autocorrelation, weighting, batching, rate limits, and
selection bias. Use this only for planning.

Design adequacy by:

- minimum frame/event contribution relevant to the decision;
- expected total selected events/weight;
- independent recording repetitions/blocks;
- acceptable unknown/truncated/lost fraction;
- confidence/power needed for a comparison;
- overhead and incident duration.

A frame absent from 100 total samples could still be material. “About 100 samples on the frame”
is not a universal confidence rule. Follow `latency-statistics` for inference and
`performance-regression-ci` for gates.

## Warm-up and lifecycle

For steady-state evidence, monitor:

- throughput/latency/error per stable work mix;
- compilation/deoptimization/code-cache activity;
- heap occupancy/allocation/GC cycles;
- connection/cache/data initialization;
- traffic ramp/autoscaling/readiness;
- background/scheduled work.

Declare the stability window and acceptable drift. For startup/warm-up incidents, retain all
these phases instead of waiting them away.

## Target population

Choose among:

- whole JVM including GC/JIT/native service threads;
- application platform-thread roles;
- logical virtual-thread/task population where tool supports it;
- one operation/workload cohort with bounded context;
- one affected instance and matched healthy control;
- host/cgroup/process family for interference.

Filtering after collection changes analysis but not always collection overhead. Thread-name or
frame filters can misclassify idle/reused/carrier threads. Record inclusion/exclusion and the
fraction of total weight retained.

## Complementary pairs

| Pair                                  | Why                                                               |
| ------------------------------------- | ----------------------------------------------------------------- |
| CPU stacks + GC/JIT JFR               | split application versus runtime CPU and phase chronology         |
| wall stacks + typed JFR waits + trace | location, mechanism, and critical-path ownership                  |
| allocation profile + GC log/JFR       | source plus collector consequence                                 |
| JFR + host/cgroup metrics             | JVM chronology plus scheduler/resource enforcement                |
| affected profile + matched control    | isolate cohort-specific mechanism, subject to experimental design |

Do not run complementary tools concurrently unless timestamps must align and combined overhead
is calibrated. Sequential captures can miss transients; decide the trade explicitly.

## Virtual threads

Java 21 and 25 differ materially, including synchronization pinning changes from JEP 491 in
Java 24 and newer JFR features. Check:

- target-JDK virtual-thread event types/settings and stock enablement;
- whether thread dumps include logical virtual threads and at what cost;
- whether profiler stacks reconstruct mounted logical frames or mainly carriers;
- unmounted/parked task visibility;
- context propagation and carrier-name misattribution;
- pool/bulkhead removal and downstream concurrency.

No pinned event can mean below threshold/disabled/post-JEP behavior, not proof that virtual
threads are healthy.

## Production decision table

| Constraint                                | Prefer                                                  | Caveat                                                          |
| ----------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| no new privilege/agent; JVM events enough | existing/native JFR                                     | attach/storage/config/event coverage still required             |
| precise targeted CPU/native stacks        | async-profiler                                          | engine/access/stack/version/overhead validation                 |
| history before alert                      | calibrated continuous JFR/profiler                      | permanent cost, retention, evidence-quality operations          |
| very short recovery budget                | preserve existing evidence                              | new capture may miss or worsen incident                         |
| restrictive container                     | JFR or supported timer engine                           | changed engine semantics; debug container/attach may still fail |
| sensitive multi-tenant system             | aggregate/minimal context and approved targeted capture | profiles can expose code/tenant information                     |

## Capture proposal template

```text
Question:
Selected event/tool and why:
Alternative not chosen and why:
Target population and workload/lifecycle window:
Weight/denominator and minimum observable contribution:
Duration/interval/threshold/stack/filter:
Expected count/weight and controls:
Overhead/storage/privilege/privacy bounds and abort:
Artifact validation and owning analysis skill:
```
