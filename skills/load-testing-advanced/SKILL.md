---
name: load-testing-advanced
description: >
  Load-test designs beyond a steady rate: ramp, step, spike, soak and breakpoint profiles
  and what each one can actually prove, multi-stage weighted scenarios, correlating
  generator output with server-side telemetry, and characterising a saturation point instead
  of reporting one load level. Use when a capacity number is quoted from a single run, when
  a breakpoint and a stress result are being published interchangeably, when a threshold is
  set against a synthetic distribution without checking its CDF, when a parser reads
  percentiles out of k6 --out json, when summaryTrendStats is left at the default, when
  maxVUs was sized from mean latency, when a soak lasts five minutes, or when a script calls
  jcmd Thread.count. Does not cover open versus closed loop, warm-up, dataset or basic run
  validity (load-testing), the omission mechanism itself (coordinated-omission), or deciding
  whether two resulting numbers differ (latency-statistics).
---

# Advanced Load Testing

## Purpose

Design a load test whose result answers a stated question, and know which question each
profile answers. A steady rate at one level cannot characterise saturation; a stress run
cannot produce a capacity number; a five-minute run cannot find a leak.

The failure this prevents is the well-architected test that still reports a wrong number:
the test is correctly open-loop, the theory is understood, and the automation reads a field
that does not exist in that output format, or asserts a threshold that is impossible by
construction. A script that always passes is more dangerous than one that fails, because it
silently confirms the bias of whoever wrote it.

## Workflow

1. **State the question, then pick the profile.** Failure behaviour is a stress test;
   maximum req/s under an SLO is a breakpoint test; infrastructure cost at a traffic level
   is a capacity test; leaks are a soak. See `references/test-profiles.md`.
2. **Record an analytical prediction before running.** Little's Law or a queueing model
   gives a range for where the breakpoint should fall. A result off by more than an order
   of magnitude indicts the script, not the system.
3. **Size the generator from the worst tolerable latency**, not the mean: `VUs = λ_target ×
W_worst`. Under-sizing `maxVUs` reintroduces omission underneath an open-loop executor.
4. **Model the traffic mix from real access logs**, with weights per endpoint, payload-size
   distribution, and any temporal pattern a constant rate cannot reproduce.
5. **Verify the output format against one real run** before any parser or threshold enters
   a pipeline. Look at the number and confirm it matches what the tool reported.
6. **Run the profile with server-side telemetry correlated by NTP-synchronised
   timestamps** — GC log, thread counts, pool state — not the generator's numbers alone.
7. **Validate the run before reading it.** `dropped_iterations == 0`, `vus` below `maxVUs`,
   error rate within bounds. Then reproduce the headline number in a second run before
   publishing it.

## Rules

- Never publish a breakpoint number from a single run. Reproduce it, and document the
  failure behaviour separately from the capacity number — a system can have a low
  breakpoint with graceful degradation, or a high one with total collapse 5% above it.
- Never extrapolate a single-instance breakpoint linearly to a cluster. Shared resources —
  database pool, central cache, a downstream rate limit — saturate before the sum of the
  instances does. Validate the extrapolation against the whole system.
- Compute the CDF of any synthetic distribution before asserting a threshold against it. If
  `F(x) = q` exactly at the threshold value, `p(q) < x` is impossible by construction at
  any sample size; move the threshold above the jump and below the next distribution value.
- Declare `summaryTrendStats` explicitly for every percentile any downstream consumer uses.
  Relying on the k6 default is relying on unversioned behaviour from inside your own script.
- `--summary-export` aggregates percentiles; `--out json=...` writes one event per sample
  and aggregates nothing. Reading a percentile from the raw event stream fails silently,
  because the field simply does not exist in that format.
- `--latency` is mandatory on wrk2 to get the percentile distribution block at all.
- Make `dropped_iterations` a threshold (`['count<1']`), not something read afterwards.
  Any value above zero invalidates the run; a threshold turns that into an explicit failure.
- Size `maxVUs`/`preAllocatedVUs` from the worst tolerable latency. Mean latency
  systematically under-sizes, and the shortfall bites exactly during the degradation the
  test exists to observe.
- Never use `constant-vus` where the real client is a set of independent arrivals. When the
  server slows, the closed loop lowers its own rate.
- Derive traffic-mix weights from access logs. A heavy endpoint at 10% of request count can
  contribute half the load on a shared resource.
- Set soak duration from the slowest cycle in the system under test — log rotation, cache
  expiry, periodic full GC — never a fixed convention. Five minutes finds no leak.
- Always instrument GC during the run: `-Xlog:gc*,safepoint:file=gc.log:time`, correlated to
  the generator's latency series by synchronised timestamps.
- `jcmd <pid> Thread.count` does not exist in any JDK. Count platform threads with `jcmd
<pid> Thread.print | grep -c 'tid='`; unmounted virtual threads need `jcmd <pid>
Thread.dump_to_file -format=json`.
- Any analysis script must fail loudly — assert or raise — when the expected datum is
  missing, rather than reporting zero or empty.
- Run each breakpoint step long enough (30–60 s at steady state) for deoptimisation
  transients to dissolve: near saturation, error and rejection paths execute in volume for
  the first time and can trigger uncommon traps exactly at the transition point.

## References

- [Test profiles and the breakpoint procedure](references/test-profiles.md) — what each
  profile proves, the stress/breakpoint/capacity distinctions, the incremental search
  procedure with an analytical prediction, and the pre-publication checklist. Read when
  choosing a profile or running a breakpoint search.
- [Generator configuration and output formats](references/generator-configuration.md) — k6,
  Gatling and wrk2 open-loop syntax, generator sizing by Little's Law, the output-format
  traps, and the JVM-side commands to correlate during a run. Read before writing or
  reviewing a generator script or any parser that consumes its output.
