# Warm-up and cold start

The numerical lab/cache observations below are retained from the Temurin 25.0.3 baseline;
they are not measurements of the current service or predictions for another workload.

## Warm-up is a rate, not a clock

```
threshold-crossing time ≈ required invocations/back edges / per-instance execution rate
```

This estimates one policy component, not total warm-up. A service handling 5 req/s on a hot
path invoked twice per request needs far longer than a service at 500 req/s to compile the
same method — and no "wait two minutes" rule captures that.

The numerator is not a constant either. In the referenced loop-free JDK 25 fixture,
notification granularity led to the first relevant check at 256 invocations; this is not
a minimum for every method. Tier-4 invocation thresholds are one input — fewer with back-edges, or more
when the compile queue is congested and the thresholds scale up. The ladder and its scaling
are in `tiered-compilation-model.md`; for the arithmetic here, take
`Tier4InvocationThreshold` as the order of magnitude and confirm with `PrintCompilation` on
the real hot path.

Splitting the same total load across more replicas can lower per-instance profiling rate, while
also reducing queueing and saturation. Deployment decisions must evaluate both effects, plus
availability and rollout risk; fewer hotter instances are not automatically better.

## What the curve is made of

Three costs overlap in the first minutes and they respond to different levers:

| Cost                                     | Lever                                                  | Limits and interactions                                              |
| ---------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| Class loading/linking and initialization | CDS/AOT loading/linking; separately measure `<clinit>` | CDS/AOT does not generally preexecute application `<clinit>`         |
| Running interpreted and at tier 3        | Profiles, thresholds and compiler queue capacity       | No single lever eliminates every delay                               |
| Compile CPU competing with the request   | CPU quota, method mix and compiler mode                | Thresholds/profiles can also change timing and amount of compilation |

A framework-heavy service compiles a large number of methods in its first minutes; do not
estimate it, read it: `jdk.CompilerStatistics.compileCount` and `totalTimeSpent`, or
`-XX:+CITime` in a lab run. Compilation timers measure elapsed work, not consumed CPU;
correlate compiler-thread CPU with process quota/throttling before attributing request starvation.

## An observable readiness criterion

`jcmd <pid> Compiler.queue` is **not** a warm-up criterion. It is an instantaneous
snapshot; later calls, class loading or deoptimisation may add work, and some deoptimisation
actions do not enqueue recompilation. The snapshot alone establishes no convergence.

For a controlled training or canary workload, look for correct responses and stable latency/
throughput across predefined windows. Use compiler-statistics deltas and queue/code-cache state to
explain whether JIT work is converging; they are not a general readiness predicate. On the examined
JDK 25 configs, `jdk.CompilerStatistics` is periodic and carries cumulative `compileCount`:

```bash
jcmd <pid> JFR.start name=warm duration=120s filename=warm.jfr
# JFR.start returns asynchronously. Wait for recording completion before reading.
# Bound the wait; verify the target-written artifact exists and is complete/readable.
jfr print --events jdk.CompilerStatistics warm.jfr | grep -E 'startTime|compileCount'
# delta per window: compiler activity; correlate with workload, queue and latency
```

Use the timestamps of the samples that actually bound each delta, not the requested recording
duration. The `compiler-statistics` view shows the last cumulative JVM values; it includes
pre-recording activity. See `tiered-compilation-model.md` for sample coverage and rate arithmetic.

Use recording status and a bounded deadline to observe completion, then validate the artifact
with `jfr summary` before extraction. If an earlier snapshot is needed, use the target JDK's
supported `JFR.dump` command and validate that output instead. Resolve the destination in the
target JVM's filesystem and transfer a completed file before running local tools; a successful
`JFR.start` response does not prove that the destination has been written.

Do **not** count `jdk.Compilation` events without inspecting recording settings. On the examined
25.0.3 files, that event has a threshold—1000 ms in `default.jfc`, 100 ms in `profile.jfc`—so it records only compilations slower than that,
and a 20-second recording of a JVM that compiled 1542 methods held zero of them (Temurin
25.0.3). `jfr summary | grep -i compilation` therefore reports a JVM that never compiles.

A plateau means no additional counted compilations during that window. Methods can still be
below threshold, excluded, queued, or blocked by compiler/code-cache conditions. Pair it with
the service criterion; a service whose warm-up traffic never touched an
endpoint plateaus early and compiles that endpoint on the first real request.

Do not use a generic “seconds to minutes” expectation as a timeout. Measure the service and retain
the distribution across cold process starts, host shapes, and representative traffic.

## Gating deployment

- [ ] `startupProbe` covers slow process/application startup only where failing liveness/readiness
      probes must be suppressed; `readinessProbe` or load-balancer state owns traffic admission
- [ ] Traffic released or ramped only after correctness dependencies are ready; performance
      training can precede readiness only when it is bounded, safe, and representative
- [ ] Rollout that avoids many cold instances at once (`maxSurge` / `maxUnavailable`, batch
      size), so the warm pods keep the traffic that keeps them warm
- [ ] First-minutes latency compared with both the SLO/error budget and warm baseline; “expected
      warm-up” does not excuse a user-visible SLO violation

Warming up by hitting `/health` warms the health endpoint. The training traffic has to
exercise the hot paths that matter, through representative entry points — a loop inside `main`
can warm its OSR body and callees without reproducing request call-site profiles. Probe semantics and the
readiness gate itself are `kubernetes-service-lifecycle`.

## Autoscaled fleets and small pods

A cold JVM can have substantial compilation work competing with application execution, but
startup can also be idle or dependency-bound and need not be its CPU peak. Investigate these
fleet-level failure mechanisms against actual startup CPU, traffic and service evidence:

- **Cold-start cascade.** An HPA on CPU utilization can see the startup spike as load, add
  replicas, each of which is cold and takes a share of the traffic the warm ones needed.
  Evaluate request rate, concurrency, latency, CPU, stabilization windows, and warm minimum
  capacity together; no single signal works for every workload.
- **Equal share for a cold pod.** A load balancer without slow-start may immediately give a
  cold pod a warm pod's traffic share; inspect its actual routing policy. Fleet p99 comes from
  pooled request latencies for a defined window and outcome/timeout policy, weighted by included
  request counts. Track offered/completed traffic and omitted errors separately. It is not the
  cold pod's p99 or an average of pod percentiles. Evaluate slow-start, warm-up weighting or
  safe self-training when cold traffic violates the service contract.
- **One C2 thread.** A pod limited to 1-3 CPUs gets two compiler threads (one C1, one C2),
  in the examined default mode. Queue congestion and tier 2 are possible while compiling and
  serving share quota; the slowdown depends on workload and throttling. More compiler threads
  add no CPU; measure resource and policy alternatives rather than assuming a fixed multiplier.

## The AOT cache

On the JDK 25 baseline the warm-up story is AOT cache, not only CDS:

| Mechanism                       | Work shifted ahead of time                           | Work still needed                                   |
| ------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Ordinary CDS                    | class-file reading/parsing through shared metadata   | runtime loading/linking, `<clinit>`, profiling, JIT |
| AOT cache (JEP 483, JDK 24+)    | reading/parsing plus supported class loading/linking | `<clinit>`, JIT profiling, compilation              |
| AOT profiles (JEP 515, JDK 25+) | + profiles for trained methods                       | `<clinit>`, compilation, adaptation to new behavior |

CDS can reduce class-startup cost without providing JEP 483's loaded-and-linked class state.
Do not prescribe JDK 24/25 AOT flags to an older runtime or infer AOT use from a mapped CDS
archive. Preserve the project's runtime; inspect which mechanism is available and actually used.
Unsupported AOT loading/linking cases fall back to runtime work, so cache presence does not
prove every class avoids that work. These mechanisms do not generally preexecute application
static initializers.

Among these cache mechanisms, JEP 515 targets the profiling phase. It caches **profiles,
not compiled application methods**: the training run's
`MethodTrainingData` is written into the cache (verified in the `-Xlog:aot` creation log)
and replayed at start-up (`AOTReplayTraining=true`, ergonomic, in `PrintFlagsFinal` with the
cache mapped), so C2 no longer waits for tier-3 statistics on methods the training run made
hot. Compilations still consume compiler resources under the same CPU quota, although their
number, timing and live thread count can change. Measure the service's startup/latency curve
and compiler CPU before crediting a benefit; `jdk.CompilerStatistics.totalTimeSpent` is elapsed
compilation time, not CPU consumption. JEP 514 (JDK 25) reduced cache creation to a
single command (`-XX:AOTCacheOutput`). Caching compiled code itself is not delivered on the
JDK 25 baseline (`AOTAdapterCaching` and `AOTStubCaching` exist as diagnostic flags, off by
default, and cover adapters and stubs, not methods); check the JEP status for later releases
rather than assuming.

Cache compatibility depends on JDK, command line, class path, and implementation checks. A known
JDK 25 issue, JDK-8377932, reports a rebuilt JAR not being detected in a particular cache path;
verify the exact update/fix status instead of assuming all JDK 25 builds behave identically.
Validate cache use with `-Xlog:aot`, make artifact identity part of CI, and make the training
run representative — a cache trained on a run that never touched the hot endpoints caches
the wrong profiles. The creation flow, the Spring training-run recipe and the validation
rules are `startup-cds-crac-leyden`.

## Related evaluations

GraalVM Native Image removes runtime JIT compilation but still has application/cache/connection
startup and may win or lose steady-state metrics. CRaC restores checkpointed process state subject
to resource and correctness constraints. Both are architectural decisions and need cold,
steady-state, operational, and lifecycle comparison.

## Primary references

- [Project Leyden](https://openjdk.org/projects/leyden/)
- [JEP 483: Ahead-of-Time Class Loading & Linking](https://openjdk.org/jeps/483)
- [JEP 514: Ahead-of-Time Command-Line Ergonomics](https://openjdk.org/jeps/514)
- [JEP 515: Ahead-of-Time Method Profiling](https://openjdk.org/jeps/515)
- [Kubernetes probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)
