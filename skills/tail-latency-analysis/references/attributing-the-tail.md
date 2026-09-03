# Attributing the Tail

## Evidence timeline

Align, per instance and request where possible:

- client arrival/start/timeout/cancel/finish;
- admission, queue and executor transitions;
- trace spans and dependency attempts;
- JFR/GC/safepoint/compilation/lock events;
- cgroup CPU, runnable delay, pressure, faults, network and disk;
- rollout/readiness/traffic shifts and control-plane events.

Record clock offset and collection windows. An event that merely occurs somewhere in a
dashboard window is not attributable to a request.

## Cause matrix

| Candidate                  | Signature                                 | Discriminator                                     | Owner                          |
| -------------------------- | ----------------------------------------- | ------------------------------------------------- | ------------------------------ |
| queue/admission            | age/depth rises before latency            | admitted load and service completions             | queueing-models                |
| GC pause/allocation stall  | overlapping JVM event on affected process | pause/allocation chronology, unaffected controls  | pause-attribution / GC skills  |
| time to safepoint          | total pause exceeds collector work        | unified safepoint logs/JFR metadata for exact JDK | safepoints                     |
| deoptimization/compilation | recurring compilation state transitions   | code-cache/compiler events, traffic/class change  | deoptimization                 |
| lock convoy                | waits concentrate on lock/site            | monitor/park profiles and owner progress          | concurrency-diagnostics        |
| CPU scheduling/throttle    | runnable but not scheduled/progressing    | run-queue delay, pressure, cgroup counters        | linux-for-jvm                  |
| memory pressure/faults     | process pause without JVM pause           | faults, reclaim/swap/PSI and RSS                  | linux-for-jvm                  |
| network loss/retransmit    | connection-specific delay/loss            | socket/TCP events and path controls               | tcp-tuning                     |
| dependency tail            | slow spans/attempts on one dependency     | callee/server-side queue and cohort               | distributed tracing            |
| pool exhaustion            | acquisition wait and occupancy saturate   | hold-time, leaks, downstream latency              | connection-pool-sizing         |
| key/partition skew         | affected keys/owners only                 | per-partition load and queue                      | hot-partitions-and-rebalancing |
| cold rollout               | latency depends on instance age           | compilation/cache/connection/routing timeline     | startup/JIT skills             |

Durations are clues, not identifiers. Timer values, cgroup periods, collectors, kernels and
networks differ by configuration/version.

## JFR discipline

- Inspect event metadata and recording settings on the exact JDK.
- Verify event enablement, threshold, stack traces and sampling period.
- Use stable semantic groups in the skill; keep version-specific names in runbooks tested
  against that runtime.
- Lower thresholds only in a controlled recording and account for volume/overhead.
- A JFR absence can mean disabled/thresholded data, not absence of the mechanism.

Use unified logs when they provide the authoritative phase timing, and correlate rather
than estimating one signal from another.

## Causal checks

Strengthen attribution by:

1. temporal precedence and overlap;
2. specificity to affected requests/instances;
3. dose-response across load/event magnitude;
4. negative controls (unaffected cohorts/nodes);
5. intervention and reproduction;
6. elimination of measurement/generator artifacts.

Do not tune GC, enlarge pools, add replicas or change kernel parameters from correlation
alone.

## Troubleshooting path

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
