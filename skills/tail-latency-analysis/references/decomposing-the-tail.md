# Decomposing the tail

## Amplification: the numbers, verified

`P(at least one of N is slow) = 1 − (1 − p)^N`, for N independent calls that each exceed
the threshold with probability p. Computed:

| p (per call)     | N     | P(user request slow) | Reading                                           |
| ---------------- | ----- | -------------------- | ------------------------------------------------- |
| 1/100 (p99)      | 10    | 9.6%                 | ten p99 calls give the user roughly p90           |
| 1/100 (p99)      | 100   | 63.4%                | Dean & Barroso's headline figure                  |
| 1/10,000         | 100   | 1.0%                 | a p99.99 leaf becomes a p99 root                  |
| 1/10,000         | 2,000 | 18.1%                | the paper's 2,000-server example                  |
| 1/100, 3 chained | 3     | 2.97%                | chained calls: same formula for the _probability_ |

The inverse is the budget derivation: `p_service = 1 − (1 − p_user)^(1/N)`. A 1% user-facing
miss budget over a 100-way fan-out is `1 − 0.99^0.01 ≈ 1.0 × 10⁻⁴` per service — one in ten
thousand, not one in a hundred. A 0.1% budget over 10 calls is also ≈ 1 × 10⁻⁴.

Both directions assume **independence**. Calls that share a host, a pool, a downstream, or a
fleet-wide synchronised pause fail together: amplification is then smaller than the formula
says, and the budget derived from it is stricter than needed — but the fan-out also buys
less, because it was never parallel in the dimension that matters. State which case holds
before using either number. (Paper: Dean & Barroso, "The Tail at Scale", CACM 56(2), 2013;
formula and table computed here, the paper's own figures quoted from it and not re-fetched.)

## p99 of a sum is not the sum of p99s

For chained stages the probability composes as above, but the **latency** is a sum, and a
percentile of a sum is not a sum of percentiles — in either direction:

- **Independent stages:** simultaneous tail events are rare, so
  `p99(A + B) < p99(A) + p99(B)`. Two independent lognormal stages with p99 ≈ 30 ms each
  give a p99 of the sum of ≈ 45 ms, not 60 ms (simulated, 2 × 10⁶ samples). Summing
  per-stage p99s over-states the end-to-end tail and produces a budget nobody can meet.
- **Correlated stages:** a shared cause — the same STW pause, the same throttled node, the
  same saturated pool — lands in both stages of the same request. With a 1% shared 100 ms
  pause added to both, `p99(A + B) ≈ 206 ms` while each stage's p99 is ≈ 102 ms: the sum of
  the p99s is now an accurate, even slightly optimistic, estimate. Per-stage dashboards
  that "do not add up" to the end-to-end p99 are the normal state; the question is which
  case, and only per-request data answers it.

The same rule forbids subtraction: `p99(total) − p99(downstream)` is not the p99 of the
local work. A stage's contribution to the tail is measured on the same requests, never
derived from two independent percentiles.

## Two decomposition methods, and when each is the right one

| Method                            | Cost                                         | Answers                                                                        | Cannot answer                                                            |
| --------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Histogram per stage (always on)   | One histogram per stage, no per-request cost | Whether one stage's own tail is as bad as the end-to-end tail — a single owner | Which stage was slow for _this_ slow request; correlation between stages |
| Per-request trace / timing record | Sampling, storage, a span per stage          | Where the time of one slow request went; whether stages were slow together     | Anything about the distribution unless enough tail requests are sampled  |

Run them in this order:

1. **Stage histograms first.** If one stage's p99.9 is within a few percent of the
   end-to-end p99.9 and the others are flat, that stage owns the tail and the cause
   catalogue in `attributing-the-tail.md` applies to it alone.
2. **If no stage explains it**, the tail is either the sum of moderately slow correlated
   stages or a queue _between_ stages that no stage histogram measures (thread pool
   hand-off, connection acquisition, a serialised gather). Both need per-request data.
3. **Sample the tail deliberately.** Head-based sampling at 1% catches 1% of a p99.9 event
   — ten traces per million requests. Use tail-based sampling, a per-request JFR event
   committed only above a threshold (see `attributing-the-tail.md`), or histogram
   exemplars: an exemplar attaches a trace id to a sample in the slow bucket, so the slow
   bucket links to a request that was actually in it. `distributed-tracing-design` owns the
   span model and the exemplar join; the requirement from this skill is only that the
   sampling decision is made _after_ the latency is known.
4. **Timestamp everything on one clock.** Attribution is a join on time between the
   request record and the JVM's own events; a per-stage number without a start timestamp
   cannot be joined to a GC or safepoint event and stays a hypothesis.

## Systematic tail versus rare event

The shape of the histogram answers this before any tool does. A dominant fast mode plus one
small slow mode at a stable offset is **one slow path** — a cache miss, a lock, a pause —
and acting on it moves the number. Three or more stable modes are **several distinct
causes**, and fixing one alone moves p99.9 by only that mode's share. A smear with no
second mode is **queueing**: the tail is the body of the distribution stretched by waiting,
and belongs to `queueing-models`, not to a cause catalogue.

Dean & Barroso's list of variability sources is the checklist for the "several causes"
case: shared resources on the machine (CPU, memory bandwidth, network), background daemons,
global shared resources (switches, shared file systems), maintenance activities (log
compaction, data reconstruction), queueing at several levels, power and thermal limits
(turbo throttling), garbage collection, and energy management (power-saving states with a
wake-up cost). Each is a different owner; the JVM-side ones are catalogued with their
signatures in `attributing-the-tail.md`.

## The measurement trap

A tail measured by a closed-loop load generator, or by a server-side `Timer` that records
only completed calls, is under-counted precisely during the events under investigation: the
generator stops issuing while the system is slow, and the timer never sees the requests a
full queue or an open breaker rejected. The number then improves as the system degrades.
Before decomposing, confirm the source is free of this — `coordinated-omission` owns the
detection (planned-versus-issued reconciliation, MAX/p99 ratio) and the correction.
