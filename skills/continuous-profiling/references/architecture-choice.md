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

## Overhead by channel — the arithmetic

Overhead is `samples/s × cost per sample`, and the cost per sample is dominated by the
stack walk, which scales with depth (`setJavaStackDepthMax`, `asprof -j`). Percentages
quoted by vendors are one workload's value of that product. Derive yours:

| Channel                     | Samples per second                                            | What bounds it                                                                                 |
| --------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `cpu` / `ctimer` / `itimer` | `running threads × (1 / interval)` ≤ `cores × (1 / interval)` | Cores. 8 cores at 10 ms = 800/s whatever the thread count                                      |
| `wall`                      | `all threads × (1 / interval)`                                | **Nothing.** 2,000 threads at 10 ms = 200,000/s; use `--wall 100ms` and `--filter`             |
| `alloc`                     | `allocation rate / byte threshold`                            | The threshold. 2 GB/s ÷ 512 kB ≈ 4,000/s; ÷ 1 kB ≈ 2,000,000/s — why `1k` is the anti-pattern  |
| `lock`                      | contended acquisitions whose wait exceeded the threshold      | Real contention. An uncontended service pays a check per contended entry and nothing else      |
| JFR `jdk.ExecutionSample`   | ≤ `(5 Java + 1 native) / period`                              | The sampler itself: at most 5 Java threads per round (`jfrThreadSampler.cpp`); 20 ms → ≤ 250/s |
| JFR `jdk.CPUTimeSample`     | `throttle` — a rate cap (`500/s`) or a CPU-time period        | Explicit; `jdk.CPUTimeSamplesLost` reports when the cap dropped samples                        |

Worked budget: a 16-core service, 300 platform threads, 1.5 GB/s allocation.
`cpu` at 10 ms is at most 1,600 samples/s; `alloc` at `512k` adds ~3,000/s; `wall` at
10 ms would add 30,000/s — twenty times the CPU channel — and at 100 ms adds 3,000/s.
With a measured 5 µs per sample (measure it: run the agent against the service under load
and compare CPU seconds per request with and without) that is 0.8% + 1.5% + 1.5% of one
core-second per second. Whether that is "2%" depends on the core count; the per-channel
numbers are what to defend.

Continuous profiling has to sample statistically rather than instrument exhaustively,
precisely because any overhead becomes permanent infrastructure cost multiplied by every
instance, every day. JEP 520's method tracing is the exception that proves it — bytecode
instrumentation of a named method for a bounded window, not a channel.

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

- **JEP 509 — JFR CPU-Time Profiling (JDK 25, experimental, Linux).** `jdk.CPUTimeSample`
  is driven by per-thread CPU time rather than by a wall-clock sampler visiting threads, so
  under a shared host or a throttled CFS quota the profile reflects what each thread
  actually consumed. Both shipped `.jfc` files carry it **disabled**: `default.jfc` with
  `throttle=500/s`, `profile.jfc` with `throttle=10ms` (`jfr metadata`, Temurin 25.0.3).
  Enable it with `jdk.CPUTimeSample#enabled=true` on `JFR.start` and watch
  `jdk.CPUTimeSamplesLost`.
- **JEP 518 — JFR Cooperative Sampling (JDK 25).** The sampler thread no longer walks a
  suspended thread's stack; it arms the thread's poll page and the thread walks its own
  stack at its next safepoint poll. For a recording that never stops, that means fewer
  corrupted or discarded samples. It did not lift the per-round cap: `jdk.ExecutionSample`
  still samples at most 5 Java and 1 native thread per period, so on a many-threaded
  service each thread is visited every `threads × period / 5`.
- **JEP 520 — JFR Method Timing and Tracing (delivered).** Configuration-driven bytecode
  instrumentation for specific methods. It is the opposite of a cheap continuous channel —
  a narrow, temporary lens. Its value here is operational: a broad continuous profile plus
  a short surgical window on one suspect method, without a redeploy.

## Retention

- Pyroscope / Parca: configured on the server.
- Native JFR on disk: `maxsize` and `maxage` on the recording.
- Native JFR via `RecordingStream`: nothing is retained unless you export it — retention is
  whatever your exporter's sink keeps.
