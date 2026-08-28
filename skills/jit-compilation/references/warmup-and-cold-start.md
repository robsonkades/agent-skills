# Warm-up and cold start

## Warm-up is a rate, not a clock

```
warm-up time ≈ invocations required to reach tier 4 / invocation rate
```

Both terms matter and only one is under your control. A service handling 5 req/s on a hot
path invoked twice per request needs far longer than a service at 500 req/s to compile the
same method — and no "wait two minutes" rule captures that.

The corollary is a deployment decision: splitting the same total load across more replicas
lowers the per-instance rate and delays tier 4 in **all** of them. For a low-traffic
service, fewer and hotter instances can beat many cold ones.

## An observable readiness criterion

`jcmd <pid> Compiler.queue` is **not** a warm-up criterion. It is an instantaneous
snapshot; it empties and refills on every deoptimisation, and it asserts nothing about
convergence.

Use instead: **throughput stable across two consecutive windows, with the rate of new
compilations on a plateau.**

```bash
jcmd <pid> JFR.start name=warm settings=profile duration=60s filename=warm.jfr
jfr summary warm.jfr | grep -i compilation   # compare successive windows
```

In practice, typical business applications need tens of seconds to a few minutes.

## Gating deployment

- [ ] `startupProbe` sized from the **measured** warm-up curve, not from a guess
- [ ] Traffic released only after the instance meets the readiness criterion
- [ ] Rollout that avoids many cold instances at once
- [ ] First-minutes latency compared with the **warm baseline**, not with the SLO —
      otherwise a normal warm-up reads as a regression

Warming up by hitting `/health` warms the health endpoint. The training traffic has to
exercise the hot paths that matter.

## The AOT cache

On the JDK 25 baseline the warm-up story is AOT cache, not only CDS:

| Mechanism              | Accelerates                      | Does not accelerate       |
| ---------------------- | -------------------------------- | ------------------------- |
| CDS                    | class loading, linking           | `<clinit>`, JIT profiling |
| AOT cache (JEP 483)    | class loading, linking           | `<clinit>`, JIT profiling |
| AOT profiles (JEP 515) | + C2 starts with method profiles | `<clinit>`                |

JEP 515 is the only strategy that attacks the _profiling_ phase directly — everything else
attacks class loading. JEP 514 (JDK 25) reduced cache creation to a single command
(`-XX:AOTCacheOutput`).

The cache is invalidated **silently** by a classpath or JDK change. Validate with
`-Xlog:aot`, and make the training run representative — a cache trained on a run that
never touched the hot endpoints caches the wrong profiles.

## Related evaluations

GraalVM native image and CRaC change the shape of the problem rather than tuning it: the
first eliminates warm-up along with the JIT's peak performance, the second restores a
warmed process image. Both are architectural decisions, not flags, and both need the same
warm-baseline comparison to be judged.
