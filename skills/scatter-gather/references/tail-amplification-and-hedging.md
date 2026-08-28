# Choosing N, and hedging safely

## The only number that matters at the root

The root waits for the slowest leaf, so its latency distribution is the distribution of the
maximum over N leaves. Two consequences that a leaf dashboard cannot show:

- **The root's p99 is governed by a much deeper leaf percentile.** With N leaves, the leaf
  percentile that lands in the root's p99 is roughly the p(100 − 1/N)th. At N = 20 a leaf
  budget must be met at p99.95, not p99. Derive it with the amplification formula in
  `tail-latency-analysis`; do not copy the root SLO down to the leaves.
- **A leaf's rare event becomes the root's common event.** A GC pause, a safepoint, a cold
  connection or a rebalanced partition that hits one leaf in a thousand hits the root once
  every `1000/N` requests.

Correlation cuts both ways and must be stated, not assumed. Leaves on the same host, behind
the same pool, or sharing a saturated dependency fail _together_ — the tail is then not
amplified but the fan-out gains nothing either, because it was never parallel.

## Choosing N

Model the root as three terms:

```text
root ≈ max over N of leaf_service_time(W/N)     # shrinks as N grows
     + fan_out_cost(N)                          # serialisation, N requests issued, N sockets
     + gather_cost(N)                           # merge, sort, dedup at the root
```

Only the first term improves with N, and it improves only while per-leaf work still dominates
the leaf's **noise floor** — the part of the leaf's latency that does not depend on how much
work it was given: scheduling delay, queueing behind other tenants, a GC pause, a TLS
handshake, one retransmit. Below that floor, splitting further buys nothing on the body of the
distribution and keeps buying tail exposure and fan-out cost.

That crossover is the decision, and it is only visible at the root:

| Symptom                                                       | Reading            |
| ------------------------------------------------------------- | ------------------ |
| Leaf p50 falls with N, root p50 flat                          | Past the crossover |
| Leaf p99 flat or improving, root p99 rising with N            | Past the crossover |
| Root p50 still tracking `1/N`                                 | N is below optimum |
| Root p99 ≫ root p50 while every leaf p99 ≈ leaf p50           | Tail amplification |
| Root p99 and leaf p99 move together across all leaves at once | Correlated cause   |

**"One leaf per shard" is a default, not a decision.** It comes from the data layout, and it
is right only while shard count is also a sensible N. When the owners are fewer than the
shards, coalesce: one leaf per _owner_ carrying the list of shards it must read cuts N without
changing what is read. When one shard holds most of the answer, ask it first and fan out only
for the remainder.

## Hedging

A hedge (backup request) is a duplicate of a leaf call, issued once the original has already
spent a chosen percentile of its expected time; the first answer wins and the other is
cancelled. It converts leaf-local, uncorrelated slowness into an extra request. It does not
fix a slow system.

**Both conditions must hold before any hedge is enabled:**

1. **The leaf operation is read-only or idempotent** (`idempotency`). A hedge is a deliberate
   duplicate send, so a non-idempotent leaf executes twice by design, not by accident.
2. **The hedge rate is capped as a small fraction of traffic.** Without a cap, hedging fires
   hardest precisely when the dependency is slow across the board — it is then a load
   multiplier arriving at a system already past its knee. Dean and Barroso's _The Tail at
   Scale_ reports capping backup requests at a few percent of requests; take that as the shape
   of the constraint and measure your own.

Implement the cap by role, not by hope: a rolling counter of hedges issued over requests
issued in a short window, checked before each hedge, with hedging suppressed while the ratio
is over the cap. The window must be short enough to react within one incident.

**Placement rules**

- Issue the hedge from the **root**, not inside the leaf client — the root is the only place
  that knows the remaining budget and the completion rule.
- Send it to a **different replica**. A hedge to the same instance queues behind the same
  saturated pool or the same stop-the-world pause.
- The hedge inherits the _remaining_ budget, not a fresh one. It is a second attempt inside
  one deadline, never an extension of it.
- Cancel the loser as soon as either answer arrives, on the same path that cancels leaves at
  the deadline.
- The trigger percentile decides the load cost; that table, and the rule that hedging
  backfires on a saturated shared resource, are `tail-latency-analysis`.

## Knowing whether hedging is helping

Four series, published together with the change:

| Series                                        | What it tells you                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| hedges issued ÷ requests issued               | Whether the cap is holding; if it is pinned at the cap, hedging is not the fix |
| responses won by the hedge ÷ hedges issued    | Near zero means the trigger is too late — pure added load                      |
| downstream request rate and utilisation delta | The load actually added, measured at the callee rather than inferred           |
| root p99 and p99.9 before/after               | Whether the point of the change happened at all                                |

Disable hedging when the hedge win rate collapses while the hedge rate is at the cap: that
combination says leaf slowness is correlated, and duplication is making it worse. Wire the
cap and the disable as configuration you can change without a deploy — the moment you need
them is an incident.
