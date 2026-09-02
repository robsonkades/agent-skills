# Test profiles and the breakpoint procedure

## Which profile answers which question

| Profile        | Question it answers                                                                                                           | Result shape                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Stress**     | How does the system behave _when it fails_? Graceful degradation, controlled 503, total crash, recovery time after load drops | A description of behaviour           |
| **Breakpoint** | What is the maximum req/s before a specific SLO is violated?                                                                  | A capacity number for one instance   |
| **Capacity**   | What does sustaining a traffic level cost in infrastructure?                                                                  | An instance count with headroom      |
| **Soak**       | What degrades only over time — memory, threads, pool exhaustion?                                                              | A trend over hours                   |
| **Spike**      | What happens under a temporal pattern a constant rate never reproduces?                                                       | Behaviour during and after the burst |

The three that are routinely confused:

- **Stress and breakpoint** both push past the expected load. They are independent
  findings: a low breakpoint can coexist with excellent failure behaviour, and a high
  breakpoint with catastrophic collapse 5% above the limit. Publishing only one is
  incomplete.
- **Capacity and breakpoint** are different scopes. Capacity is a budget question about the
  fleet; breakpoint is an engineering question about one binary with one configuration.
  Capacity normally _consumes_ the breakpoint as input — and linear extrapolation above a
  few instances is rarely valid, because shared resources (database, cache, downstream rate
  limits) have their own nominal capacity.

Soak duration follows the phenomenon, not a convention: it must exceed the slowest cycle in
the system under test — log rotation, cache expiry, periodic full GC. An eight-hour soak
has revealed a thread count climbing from 200 to 4,000 in a system that looked stable in
one-hour runs.

## Soak design for leaks

A soak answers "does anything grow without bound at constant load". Every design choice
follows from needing growth to be attributable to time and not to traffic or queueing:

- **Constant open-loop rate, well below the knee** (ρ ≤ 0.6 on the critical resource). Above
  it, queue growth and retry amplification produce rising memory and thread counts that are
  load effects, not leaks.
- **Duration ≥ 3× the slowest cycle**, so at least two full cycles fall inside the window
  you fit a trend to. Discard the first cycle: caches fill, pools reach their size, the JIT
  finishes — all of it looks like growth.
- **Record the after-collection floor, not the sawtooth.** Heap usage between collections is
  meaningless; the series that carries the signal is occupancy _after_ a collection that
  reclaimed the old generation. With G1 that is old-region occupancy after each mixed cycle
  (`jdk.G1HeapSummary`, or `jdk.GCHeapSummary` with `when = "After GC"` filtered to those
  collections); a periodic `jcmd <pid> GC.run` every 10–15 minutes gives comparable full-GC
  points at the cost of a pause the latency series must be annotated with.
- The other series that leak, each with its instrument: metaspace after class unloading
  (`jdk.MetaspaceSummary`), platform thread count (`jfr view thread-count`, or
  `jdk.JavaThreadStatistics`), virtual threads (`jcmd <pid> Thread.dump_to_file
-format=json`, count the entries), direct buffers (`jdk.DirectBufferStatistics`), native
  memory by category (`jdk.NativeMemoryUsage`, or NMT `summary.diff` against a baseline
  taken after the first cycle), RSS (`jdk.ResidentSetSize`), file descriptors
  (`ls /proc/<pid>/fd | wc -l`), and every pool's in-use count.

Decision rule, applied to the after-collection floor over the last two thirds of the run:

```text
fit  floor(t) = a + b·t  by least squares over N collections
leak      : b > 0 and the interval on b excludes 0 across two cycles, and no plateau
cache fill: growth that flattens before the run ends and stays flat — bounded by design
load      : growth that tracks the request-rate series — the rate was not constant
time-to-limit = (limit − floor_now) / b        → the number that decides urgency
```

A slope that is positive but flattening is a cache reaching its bound; report the bound and
whether it fits inside the heap, not a leak. A slope that is positive and straight over two
cycles is a leak, and the next step is a heap dump taken at the end of the run and one from
mid-run, compared by dominator — that analysis is `heap-dump-analysis`. Attribution by
allocation site with `jdk.OldObjectSample` needs `settings=profile` or
`jdk.OldObjectSample#stackTrace=true`, and is empty under ZGC on 25.0.4+ regardless.

## Phase order

The usual sequence is smoke → warm-up → load → stress → soak. The breakpoint test slots in
as an additional phase, typically between stress and soak:

```
Breakpoint phase (variable duration per step, typically 30-60s each)
  Goal:  the maximum req/s before the latency SLO is violated
  Method: incremental search, with the analytical prediction recorded BEFORE the run
  Stop:  first step whose p99 exceeds the threshold, AND dropped_iterations == 0
         at the previous, successful step
```

## Incremental breakpoint search

The construct is a stepped open-loop schedule, not a stepped VU count:

```javascript
// k6 — each stage holds a rate; the ramp between steps is a separate short stage
scenarios: {
  breakpoint: {
    executor: 'ramping-arrival-rate',
    startRate: 100, timeUnit: '1s',
    preAllocatedVUs: 200, maxVUs: 3000,     // from λ_max × W_worst, not from the mean
    stages: [
      { target: 100, duration: '60s' },  { target: 150, duration: '10s' },
      { target: 150, duration: '60s' },  { target: 225, duration: '10s' },
      { target: 225, duration: '60s' },  { target: 340, duration: '10s' },
      { target: 340, duration: '60s' },  { target: 100, duration: '60s' },  // recovery
    ],
  },
},
```

The last stage ramps back down on purpose: a system whose p99 does not return to its
pre-overload value within a step of the overload ending has a recovery problem — queue
drainage, a saturated pool, a circuit breaker stuck open — which is a stress finding reported
alongside the breakpoint, not instead of it.

1. Compute the analytical prediction before running anything.
2. Start well below it — around 25% of nominal capacity.
3. Measure 30–60 s at steady state, after warm-up has finished. Record p50/p99/max,
   `dropped_iterations` and error rate.
4. If the SLO holds and `dropped_iterations == 0`, raise the rate (×1.5) and repeat.
5. When the SLO is violated, the breakpoint is the last rate that passed.
6. Compare against the prediction. A divergence over an order of magnitude points at a bug
   in the measurement script, not at the system.

Steps above capacity do not need to run long. For any `λ > c×μ` the queue grows without
bound for as long as the overload lasts — there is no "slightly over capacity and still
fine". By Little's Law the average delay for those queued at the end of a window of
duration `T` is about `(λ − c×μ) × T / (c×μ)`: with `λ=22`, `c×μ=20`, `T=30 s` that is
roughly 3 s, from a 10% overload held for 30 seconds.

Worked prediction, for a service with two processing threads and 100 ms deterministic
service time (M/D/2):

```
c = 2 servers, μ = 1/0.100s = 10 req/s each  →  nominal capacity 20 req/s

M/D/2 queues less than M/M/2 at the same utilisation, but the knee still falls
between ρ = 0.75 and ρ = 0.90:

  ρ = 0.75 → λ = 15 req/s   small queue, p99 still dominated by service time
  ρ = 0.90 → λ = 18 req/s   queue already several multiples of service time
  ρ ≥ 1.00 → λ ≥ 20 req/s   unbounded growth for the duration of the test

Recorded prediction: the breakpoint for an SLO of p99 < 500 ms falls between
15 and 20 req/s.
```

## Thresholds against a known distribution

Any threshold asserted against a synthetic or historical distribution needs its CDF worked
out first. Take a generator built from discrete buckets:

```
r ~ Uniform(0,1)
r < 0.50 → 10 ms    r < 0.80 → 30 ms    r < 0.95 → 100 ms
r < 0.99 → 500 ms   else     → 2000 ms
```

| x (ms) | F(x) |
| ------ | ---- |
| 10     | 0.50 |
| 30     | 0.80 |
| 100    | 0.95 |
| 500    | 0.99 |
| 2000   | 1.00 |

The population p99 is the smallest `x` with `F(x) ≥ 0.99`. Since `F(500) = 0.99` exactly,
the p99 _is_ 500 ms — there is no `x < 500` with `F(x) ≥ 0.99`, because the CDF jumps
straight from `F(499.999…) = 0.95` to `F(500) = 0.99`. A threshold `p(99) < 500` therefore
demands a measured p99 strictly below the exact population p99: impossible by construction,
at any sample size, with any generator, on any JDK. Finite samples with linearly
interpolated percentiles (what both k6 and HdrHistogram use) converge on exactly 500 ms as
N grows; sampling noise can push the estimate to the other side of the jump (2000 ms),
never strictly below 500.

`p(99) < 600` is the correct form: real margin above the jump, still below the next
distribution value, so the assertion can genuinely pass and genuinely fail. The same check
applies to every percentile — `p(95) < 100` would be impossible here for the same reason,
while `p(95) < 200` is safe.

Discrete distributions with few distinct values are the prone case, and they are exactly
what synthetic test generators produce. Real continuous latency distributions almost never
have this problem, which is why the reflex to check does not develop from looking at
production graphs.

## Checklists

Before accepting any load-test automation script:

- [ ] The exact output format (`--summary-export` JSON, wrk2 `--latency` text) checked
      against a real run, not assumed from documentation or memory
- [ ] Every threshold against a known distribution has its CDF computed, with real margin
      above any exact jump value
- [ ] An analytical prediction (Little's Law, M/M/c or M/D/c) recorded before the run

Before running:

- [ ] `maxVUs`/`preAllocatedVUs` sized from the worst tolerable latency, not the mean
- [ ] `--latency` enabled on wrk2; `summaryTrendStats` declared explicitly in k6, including
      every percentile used downstream

During and immediately after collection:

- [ ] `dropped_iterations == 0` — anything above zero invalidates the run
- [ ] Result within an order of magnitude of the analytical prediction
- [ ] The analysis script fails loudly when the expected datum is absent, rather than
      silently reporting zero or empty

Before publishing a breakpoint as a capacity number:

- [ ] Reproduced across at least two runs with consistent results
- [ ] Failure behaviour (stress) documented separately from the capacity number
      (breakpoint), without conflating them
