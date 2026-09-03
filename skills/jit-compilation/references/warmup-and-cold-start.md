# Warm-up and cold start

## Warm-up is a rate, not a clock

```
threshold-crossing time ≈ required invocations/back edges / per-instance execution rate
```

This estimates one policy component, not total warm-up. A service handling 5 req/s on a hot
path invoked twice per request needs far longer than a service at 500 req/s to compile the
same method — and no "wait two minutes" rule captures that.

The numerator is not a constant either. On the JDK 25 defaults a method needs 256
interpreted invocations before tier 3 is even considered (the interpreter notifies the policy
every 128 calls) and 5000 more at tier 3 before tier 4 — or fewer with back-edges, or more
when the compile queue is congested and the thresholds scale up. The ladder and its scaling
are in `tiered-compilation-model.md`; for the arithmetic here, take
`Tier4InvocationThreshold` as the order of magnitude and confirm with `PrintCompilation` on
the real hot path.

Splitting the same total load across more replicas can lower per-instance profiling rate, while
also reducing queueing and saturation. Deployment decisions must evaluate both effects, plus
availability and rollout risk; fewer hotter instances are not automatically better.

## What the curve is made of

Three costs overlap in the first minutes and they respond to different levers:

| Cost                                   | Lever                                               | Does not respond to      |
| -------------------------------------- | --------------------------------------------------- | ------------------------ |
| Class loading, linking, `<clinit>`     | CDS, AOT cache (JEP 483), fewer classes on the path | any JIT flag             |
| Running interpreted and at tier 3      | Invocation rate, `CompileThresholdScaling`, JEP 515 | more compiler threads    |
| Compile CPU competing with the request | CPU quota, fewer methods, `TieredStopAtLevel=1`     | thresholds, AOT profiles |

A framework-heavy service compiles a large number of methods in its first minutes; do not
estimate it, read it: `jdk.CompilerStatistics.compileCount` and `totalTimeSpent`, or
`-XX:+CITime` in a lab run. On one CPU the compile CPU is the same seconds the request
threads do not get.

## An observable readiness criterion

`jcmd <pid> Compiler.queue` is **not** a warm-up criterion. It is an instantaneous
snapshot; it empties and refills on every deoptimisation, and it asserts nothing about
convergence.

For a controlled training or canary workload, look for correct responses and stable latency/
throughput across predefined windows. Use compiler-statistics deltas and queue/code-cache state to
explain whether JIT work is converging; they are not a general readiness predicate. On the examined
JDK 25 configs, `jdk.CompilerStatistics` is periodic and carries cumulative `compileCount`:

```bash
jcmd <pid> JFR.start name=warm duration=120s filename=warm.jfr
jfr print --events jdk.CompilerStatistics warm.jfr | grep -E 'startTime|compileCount'
# delta per window: still climbing = still warming; flat = compiled everything it has seen
```

Do **not** count `jdk.Compilation` events without inspecting recording settings. On the examined
25.0.3 files, that event has a threshold—1000 ms in `default.jfc`, 100 ms in `profile.jfc`—so it records only compilations slower than that,
and a 20-second recording of a JVM that compiled 1542 methods held zero of them (Temurin
25.0.3). `jfr summary | grep -i compilation` therefore reports a JVM that never compiles.

A plateau in `compileCount` means "compiled everything it has seen", not "seen everything".
Pair it with the throughput criterion; a service whose warm-up traffic never touched an
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
exercise the hot paths that matter, through the real entry points — a loop inside `main`
warms an OSR compilation of `main` (`tiered-compilation-model.md`). Probe semantics and the
readiness gate itself are `kubernetes-service-lifecycle`.

## Autoscaled fleets and small pods

A cold JVM is at its most CPU-hungry when it can serve least: interpreter, C1 and C2 all
run at once. Three fleet-level failure modes follow, all reproducible from that one fact:

- **Cold-start cascade.** An HPA on CPU utilization can see the startup spike as load, add
  replicas, each of which is cold and takes a share of the traffic the warm ones needed.
  Evaluate request rate, concurrency, latency, CPU, stabilization windows, and warm minimum
  capacity together; no single signal works for every workload.
- **Equal share for a cold pod.** A load balancer without slow-start sends a new pod the same
  fraction of traffic as a warm one from its first second, so the fleet p99 is the cold pod's
  p99 until it converges. Use the balancer's slow-start or warm-up weighting where it exists,
  or gate readiness behind self-training.
- **One C2 thread.** A pod limited to 1-3 CPUs gets two compiler threads (one C1, one C2),
  the C2 queue congests, methods pass through tier 2, and the CPU quota is shared between
  compiling and serving. The same image warms up several times slower than on a
  workstation, and adding compiler threads does not add CPU. The lever is the quota, not a
  flag — `tiered-compilation-model.md`, "Small containers and autoscaled fleets".

## The AOT cache

On the JDK 25 baseline the warm-up story is AOT cache, not only CDS:

| Mechanism              | Accelerates                      | Does not accelerate                    |
| ---------------------- | -------------------------------- | -------------------------------------- |
| CDS                    | class loading, linking           | `<clinit>`, JIT profiling, compilation |
| AOT cache (JEP 483)    | class loading, linking           | `<clinit>`, JIT profiling, compilation |
| AOT profiles (JEP 515) | + C2 starts with method profiles | `<clinit>`, compilation                |

JEP 515 is the only strategy that attacks the _profiling_ phase directly — everything else
attacks class loading. It caches **profiles, not compiled code**: the training run's
`MethodTrainingData` is written into the cache (verified in the `-Xlog:aot` creation log)
and replayed at start-up (`AOTReplayTraining=true`, ergonomic, in `PrintFlagsFinal` with the
cache mapped), so C2 no longer waits for tier-3 statistics on methods the training run made
hot. The compilations still run, on the same compiler threads, under the same CPU quota:
expect a shorter curve, not a flat one, and measure `jdk.CompilerStatistics.totalTimeSpent`
before crediting the cache with anything. JEP 514 (JDK 25) reduced cache creation to a
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
