# Choosing N, and hedging safely

## Root order statistics

For all-of-N, the root waits for the slowest required leaf. For first-success it observes the
minimum acceptable success; k-of-N observes the kth acceptable distinct success, plus
coordinator/merge time. Failed, stale or duplicate answers do not count toward that order. The familiar closed
forms require independent identically distributed leaves; shared hosts, queues and dependencies
make joint traces/load tests essential.

- **The root's p99 is governed by a deeper leaf percentile.** For iid all-of-N, leaf CDF at the
  root p99 is `0.99^(1/N)`; at N=20 this is about 99.9498%, often called p99.95. Derive it in
  `tail-latency-analysis`; do not copy the root SLO down to the leaves.
- **A rare independent leaf event becomes common at the root.** Probability of at least one is
  `1-(1-p)^N`, approximately `Np` only when `Np` is also small; do not state `1000/N` as exact.

Correlation can increase or decrease the iid amplification relative to the product model.
Common pauses make leaves move together; contention created by the fan-out can also make later
leaves slower conditional on N. Measure joint events and placement, not only marginals.

## Choosing N

Model the root as three terms:

```text
root ≈ order statistic of leaf_service_time(W_i, placement, load)
     + fan_out_cost(N)                          # serialisation, N requests issued, N sockets
     + gather_cost(N)                           # merge, sort, dedup at the root
```

Only the first term improves with N, and it improves only while per-leaf work still dominates
the leaf's **noise floor** — the part of the leaf's latency that does not depend on how much
work it was given: scheduling delay, queueing behind other tenants, a GC pause, a TLS
handshake, one retransmit. Below that floor, splitting further buys nothing on the body of the
distribution and keeps buying tail exposure and fan-out cost.

That crossover is the decision, and it is only visible at the root:

| Symptom                                                       | Reading                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| Leaf p50 falls with N, root p50 flat                          | Past the crossover                                            |
| Leaf p99 flat or improving, root p99 rising with N            | Past the crossover                                            |
| Root p50 still tracking `1/N`                                 | Median still benefits; optimum also depends on tails and cost |
| Root p99 ≫ root p50 while every leaf p99 ≈ leaf p50           | Tail amplification or root queue/merge cost; inspect traces   |
| Root p99 and leaf p99 move together across all leaves at once | Correlated cause                                              |

**"One leaf per shard" is a default, not a decision.** It comes from the data layout, and it
is right only while shard count is also a sensible N. When the owners are fewer than the
shards, coalesce: one leaf per _owner_ carrying the list of shards it must read cuts N without
changing what is read. When one shard holds most of the answer, ask it first and fan out only
for the remainder.

## Hedging

A hedge (backup request) is a duplicate of a leaf call, issued once the original has already
spent a chosen percentile of its expected time; the first semantically acceptable success wins and the other is
signalled for cancellation. An early error or stale answer need not end the race. It converts leaf-local, uncorrelated slowness into an extra request. It does not
fix a slow system.

All conditions must hold before a hedge is enabled:

1. **The leaf operation is semantically equivalent across candidates and read-only or
   downstream-idempotent** (`idempotency`). Consistency/session guarantees must still hold.
2. **The hedge and total in-flight rate are capped.** Without a cap, hedging fires
   hardest precisely when the dependency is slow across the board — it is then a load
   multiplier arriving at a system already past its knee. Dean and Barroso's _The Tail at
   Scale_ reports capping backup requests at a few percent of requests; take that as the shape
   of the constraint and measure your own.
3. **Placement changes the likely cause.** Exclude the original host/zone/queue where possible;
   otherwise correlated work rarely wins.
4. **One deadline and cancellation contract apply.** The hedge receives only remaining time;
   residual loser work is included in capacity even if cancellation is advisory.

Use atomic admission for hedge issuance, not a racy ratio-check followed by issue. Combine a
ratio of hedges to original eligible requests with absolute rate, burst and in-flight limits;
a short window alone permits startup bursts or concurrent overshoot. Coordinate across roots
and instances at the scope of the protected resource. Include retries and loser residual work.

**Placement rules**

- Assign one hedge owner: root or a client explicitly given the same deadline, completion
  policy and shared admission budget. Avoid independent layered hedging.
- Send it to a **different replica**. A hedge to the same instance queues behind the same
  saturated pool or pause; a different replica sharing a database may still be correlated.
- The hedge inherits the _remaining_ budget, not a fresh one. It is a second attempt inside
  one deadline, never an extension of it.
- Signal cancellation once an acceptable answer satisfies the contract, on the same path that cancels leaves at
  the deadline.
- The trigger percentile decides the load cost; that table, and the rule that hedging
  backfires on a saturated shared resource, are `tail-latency-analysis`.

## Knowing whether hedging is helping

Publish these series together with the change:

| Series                                         | What it tells you                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| hedges issued ÷ original eligible requests     | Whether the ratio cap holds; saturation alone does not establish benefit or harm     |
| responses won by the hedge ÷ hedges issued     | Near zero may mean late trigger, correlated delay or ineligible answers; investigate |
| downstream request rate and utilisation delta  | The load actually added, measured at the callee rather than inferred                 |
| root p99 and p99.9 before/after                | Whether the point of the change happened at all                                      |
| loser residual duration / cancellation success | Whether returned latency hides continuing downstream work                            |

Disable hedging when the hedge win rate collapses while the hedge rate is at the cap: that
combination shows little measured benefit for the extra work, but does not by itself prove
correlation. Check placement, trigger timing and answer eligibility before assigning cause. Wire the
cap and the disable as configuration you can change without a deploy — the moment you need
them is an incident.

Measure with an open-loop load model at fixed offered traffic. A closed-loop client reduces
arrivals when the root slows and can make extra hedge load look harmless. Segment by original/
hedge placement and consistency result; a fast stale answer is not a win.

## Primary references

- [Dean and Barroso, The Tail at Scale](https://research.google/pubs/the-tail-at-scale/)
- [Jeff Dean, Achieving Rapid Response Times in Large Online Services](https://research.google/pubs/achieving-rapid-response-times-in-large-online-services/)
