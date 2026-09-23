# Attributing the Tail

## Evidence timeline

For the competing attribution hypotheses, align the relevant signals per instance and request
where possible; adequate existing evidence need not trigger every source below:

- client arrival/start/timeout/cancel/finish;
- admission, queue and executor transitions;
- trace spans and dependency attempts;
- JFR/GC/safepoint/compilation/lock events;
- cgroup CPU, runnable delay, pressure, faults, network and disk;
- rollout/readiness/traffic shifts and control-plane events.

Record clock offset and collection windows. An event that merely occurs somewhere in a
dashboard window is not attributable to a request.

Direct effects require overlap with affected work, but an earlier trigger can have a later
effect through persistent queue or application state. For a backlog hypothesis, extend the
timeline to its buildup and recovery: align capacity loss, arrivals, service completions and
queue age/depth on the affected resource. Without that connecting evidence, retain a hypothesis;
neither proximity to an earlier pause nor lack of direct overlap settles attribution.

Preserve each source's measurement scope: cgroup throttled time is not directly lost CPU
capacity, aggregate waits are not one request's elapsed time, and process-wide events do not
identify which request was runnable. Collect the discriminator before assigning those durations
to a critical path.

## Cause matrix

| Candidate                  | Signature                               | Discriminator                                     | Owner                          |
| -------------------------- | --------------------------------------- | ------------------------------------------------- | ------------------------------ |
| queue/admission            | age/depth rises before latency          | admitted load and service completions             | queueing-models                |
| GC pause/allocation stall  | direct overlap or residual backlog      | pause/stall, queue recovery, unaffected controls  | pause-attribution / GC skills  |
| time to safepoint          | total pause exceeds collector work      | unified safepoint logs/JFR metadata for exact JDK | safepoints                     |
| deoptimization/compilation | recurring compilation state transitions | code-cache/compiler events, traffic/class change  | deoptimization                 |
| lock convoy                | waits concentrate on lock/site          | monitor/park profiles and owner progress          | concurrency-diagnostics        |
| CPU scheduling/throttle    | runnable but not scheduled/progressing  | run-queue delay, pressure, cgroup counters        | linux-for-jvm                  |
| memory pressure/faults     | process pause without JVM pause         | faults, reclaim/swap/PSI and RSS                  | linux-for-jvm                  |
| network loss/retransmit    | connection-specific delay/loss          | socket/TCP events and path controls               | tcp-tuning                     |
| dependency tail            | slow spans/attempts on one dependency   | callee/server-side queue and cohort               | distributed tracing            |
| pool exhaustion            | acquisition wait and occupancy saturate | hold-time, leaks, downstream latency              | connection-pool-sizing         |
| key/partition skew         | affected keys/owners only               | per-partition load and queue                      | hot-partitions-and-rebalancing |
| cold rollout               | latency depends on instance age         | compilation/cache/connection/routing timeline     | startup/JIT skills             |

Durations are clues, not identifiers. Timer values, cgroup periods, collectors, kernels and
networks differ by configuration/version.

## JFR discipline

- Inspect event metadata and recording settings on the exact JDK.
- Verify event enablement, threshold, stack traces and sampling period.
- Use stable semantic groups in the skill; keep version-specific names in runbooks tested
  against that runtime.
- Lower thresholds when missing coverage matters to the decision, in a controlled recording
  that accounts for volume/overhead.
- A JFR absence can mean disabled/thresholded data, not absence of the mechanism.

Use unified logs when they provide the authoritative phase timing, and correlate rather
than estimating one signal from another.

The OpenJDK `jdk-25+36` [HotSpot metadata](https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/share/jfr/metadata/metadata.xml)
defines native events; Java-side definitions include
[SocketReadEvent](https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/jdk.jfr/share/classes/jdk/jfr/events/SocketReadEvent.java).
The `.jfc` files instead configure recording settings. Inspect the actual target's metadata
and recording; these source examples neither prove enablement nor require a JDK upgrade.

## Causal checks

Strengthen attribution by:

1. temporal precedence with direct overlap or an evidenced lagged mechanism;
2. specificity to affected requests/instances;
3. dose-response across load/event magnitude;
4. negative controls (unaffected cohorts/nodes);
5. intervention and reproduction;
6. elimination of measurement/generator artifacts.

Do not tune GC, enlarge pools, add replicas or change kernel parameters from correlation
alone.

### A pause can leave a queue behind

Consider an illustrative single FIFO server taking 10 ms per request. Requests arrive at
10, 30, 50, 70, 90 and 110 ms. Without a pause, each finishes 10 ms after arrival. If the
server cannot work from 0 to 100 ms while arrivals continue queueing, completion times become
110, 120, 130, 140, 150 and 160 ms. The request arriving at 110 ms has 50 ms latency despite
never overlapping the pause: 40 ms waiting plus 10 ms service. Its elapsed time does not
include the earlier 100 ms pause, so do not subtract that pause from its latency.

Change one condition: if no earlier requests queued, the same 110 ms arrival finishes at
120 ms despite the earlier pause. The trigger alone cannot explain a later tail. This is a
queue model, not operational proof; confirm the actual admission, scheduling, cancellations
and service rates before applying it. [Google SRE's queue management discussion](https://sre.google/sre-book/addressing-cascading-failures/#xref_cascading-failure_queue-management)
explains how queued work increases latency; the timings above are a constructed example.

## Troubleshooting path

For an unresolved attribution/intervention task, use the applicable path. Stop when the
requested conclusion is adequately supported; select reproduction/degradation work for the
actual proposed change, and state what remains unverified.

```text
Tail regression
  -> validate population, censoring and estimator
  -> segment by outcome/path/instance/load/deploy age
  -> inspect request critical paths
  -> align queue/JVM/OS/network/dependency events
  -> collect discriminator for top competing causes
  -> change one causal mechanism
  -> reproduce under same workload and degraded scenario
```
