# Choosing a continuous profiling architecture

None of these reinvent the sampling engine. They differ in **where the decision to collect
is made and where the data goes** — inside the process pushing to a server, outside the
process via the kernel, or inside the process and going nowhere until you export it.

## Decision path

```
Multiple languages on the same host or cluster?
  yes -> Parca (eBPF): one collector for every language
  no, JVM only:
      third-party agent acceptable, self-hosted -> Pyroscope Java SDK (async-profiler underneath)
      third-party agent acceptable, SaaS        -> Datadog Continuous Profiler or equivalent
      zero third-party footprint required       -> native JFR
            need your own backend, queries, alerts -> exporter over RecordingStream
            local retention is enough              -> JFR.start with maxsize/maxage
```

## The four, compared

| Criterion                              | Pyroscope (agent)                 | Parca (eBPF)                       | Native JFR (`RecordingStream`)              | Commercial SaaS                  |
| -------------------------------------- | --------------------------------- | ---------------------------------- | ------------------------------------------- | -------------------------------- |
| Needs a `-javaagent` or JVM dependency | Yes                               | No                                 | No — JDK API                                | Yes, the vendor's language agent |
| Needs kernel privilege / `perf_events` | No (`itimer`/`ctimer` by default) | Yes, for the host eBPF collector   | No                                          | Depends on the product's engine  |
| Covers multiple languages on one host  | No — one agent per language       | Yes, natively                      | No — JVM only                               | Yes, with an agent per language  |
| Backend, UI and alerting ready         | Yes (Grafana)                     | Yes (own UI)                       | No — you build it                           | Yes, vendor operated             |
| Cost model                             | Self-hosted infrastructure        | Self-hosted infrastructure         | No third parties; cost is your engineering  | Recurring, per host or usage     |
| Historical retention                   | Configured on the server          | Configured on the server (FrostDB) | Yours to define — local disk or your export | Vendor managed                   |

They do not all compete for the same question. Pyroscope and Parca compete with each other
(agent versus eBPF, same "backend included" proposition). Native JFR competes on zero
third-party footprint, paid for by building the backend. SaaS competes on delegating the
operation entirely, paid for by a recurring contract and less control over where the data
lives.

Parca's structural cost: eBPF sees memory addresses only, so JIT-compiled Java frames need
an externally generated perf-map to become method names — a dependency Pyroscope avoids by
running inside the process.

## Overhead by channel

Lab estimates. Measure your own workload before treating any of these as a capacity budget.

| Channel                                    | Typical overhead                               | Note                                                                                   |
| ------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| CPU (`cpu` / `itimer` / `ctimer` / `wall`) | ~1–2%, typically under 2%                      | Same order as a one-off profile; the difference is running 24/7, not the sampling rate |
| Allocation (`alloc`)                       | ~1–5%, depending on the byte threshold         | Lower threshold means more samples means more overhead — not a fixed cost              |
| Lock (`lock`)                              | Typically low, proportional to real contention | An uncontended application pays almost nothing; heavy contention generates more events |

Continuous profiling has to sample statistically rather than instrument exhaustively,
precisely because any overhead becomes permanent infrastructure cost multiplied by every
instance, every day.

## Pyroscope `EventType` to async-profiler engine

| `EventType`            | Engine                | When to choose it                                                      |
| ---------------------- | --------------------- | ---------------------------------------------------------------------- |
| `ITIMER` (SDK default) | `itimer`              | No guaranteed access to `perf_events`; portable, including off Linux   |
| `CPU`                  | `cpu` (`perf_events`) | Unrestricted Linux host; highest resolution, kernel stacks             |
| `CTIMER`               | `ctimer`              | Container under default seccomp; no kernel stacks, no extra capability |
| `WALL`                 | `wall`                | Latency diagnosis with low CPU — samples every thread, running or not  |

One CPU engine at a time. Allocation and lock are not `EventType` values; they are separate
channels each with a `String` threshold, in the same spirit as `asprof`'s `--alloc` and
`--lock` flags.

## What the JDK 25 sampling machinery changes here

- **JEP 509 — JFR CPU-Time Profiling (experimental, Linux).** A native sampler driven by
  real per-thread CPU time (`CLOCK_THREAD_CPUTIME_ID`) rather than wall clock. Under a
  shared host or a throttled CFS quota, the profile reflects what the thread actually
  consumed — accuracy that matters more the longer the recording runs.
- **JEP 518 — JFR Cooperative Sampling (delivered).** Replaces asynchronous unwinding from a
  signal handler with a stack walk the thread performs at a point it controls. For a
  recording that never stops, that means fewer corrupted or discarded samples and less
  accumulated risk from keeping sampling permanently on.
- **JEP 520 — JFR Method Timing and Tracing (delivered).** Configuration-driven bytecode
  instrumentation for specific methods. It is the opposite of a cheap continuous channel —
  a narrow, temporary lens. Its value here is operational: a broad continuous profile plus
  a short surgical window on one suspect method, without a redeploy.

## Retention

- Pyroscope / Parca: configured on the server.
- Native JFR on disk: `maxsize` and `maxage` on the recording.
- Native JFR via `RecordingStream`: nothing is retained unless you export it — retention is
  whatever your exporter's sink keeps.
