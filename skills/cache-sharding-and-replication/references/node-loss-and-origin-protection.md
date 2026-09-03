# Node loss and origin protection

## The arithmetic, worked

Take a concrete cache tier and compute what one node's departure does to the origin. Use
your own numbers; the point is that the calculation exists, not these values.

```
Given:
  request rate to the cache          R = 50,000 req/s
  steady-state hit rate              h = 0.95
  cache nodes                        N = 10   (consistent hashing, RF = 1)
  measured request share on node i  q_i = 0.10  (uniform example only)

Baseline origin load:
  R × (1 − h)                          = 2,500 req/s

Lose node i. Its measured request share has no cached copy:
  requests to the lost share           = R × q_i           = 5,000 req/s, all misses
  requests to the survivors            = R × (1 − q_i)     = 45,000 req/s
  misses from the survivors            = 45,000 × 0.05    = 2,250 req/s

Origin load immediately after the loss:
  5,000 + 2,250                        = 7,250 req/s   ≈ 2.9 × baseline
```

The arithmetic assumes fail-fast remapping, uniform miss rate on survivors and identical origin
cost per key. Heavy-tailed access can make `q_i` very different from key share or `1/N`. It also
understates:

- **Second-order eviction.** The remapped keys land on the nine survivors, whose memory did
  not grow. Eviction rises there, so the survivors' hit rate falls below 0.95 too, and the
  origin load is higher than 7,250 and stays elevated longer than the re-warm of one node.
- **Duplicate misses.** A hot key in the lost range is requested by many callers
  concurrently, and every one of them misses until the first fill completes. Without
  coalescing the origin sees the concurrency, not the key count.
- **Retries.** If the origin starts failing or timing out, clients retry, multiplying the
  rate that caused the failure. `retries-and-backoff` owns the mechanism; here it is why the
  curve is not linear once the origin passes its knee.

The question is not just a scalar capacity check: can the origin serve this query mix and
concurrency for the rewarm duration while meeting its tail-latency/error SLO? If yes, RF=1 may be
legitimate; also test detection/remapping delay, during which callers may time out rather than miss.

Two derived numbers worth writing down next to the cache's configuration:

- **`R × q_max` — the worst measured node request share.** `R/N` is a planning approximation;
  more/smaller balanced nodes reduce it but increase connections and membership churn.
- **Approximately `R` at cold start — the initial full storm.** `R × (1 − h)` is the warm
  baseline, not the cold-cache load. This is the number for a regional
  failure, a `FLUSHALL`, or a cache-tier redeploy that does not warm. If nothing in the
  system can serve it, the origin cannot be brought up behind an empty cache at all, and cold
  start needs a plan of its own.

## The levers

| Lever                        | What it does                                                | Cost                                                                |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| **Replication factor > 1**   | A ready replica can preserve hits after detection/promotion | RF × memory; lag, promotion delay, reduced remaining capacity       |
| **More, smaller nodes**      | Reduces `R / N` proportionally                              | More connections, more membership churn, more to operate            |
| **Request coalescing**       | Collapses concurrent misses of one key per coalescing scope | Cancellation/deadline/failure sharing; fleet-wide duplicates remain |
| **Origin admission control** | Caps what reaches the origin, sheds or queues the rest      | Rejected or delayed requests — `rate-limiting-and-load-shedding`    |
| **Gradual warming**          | Bounds the _rate_ of misses a returning node produces       | Longer period of reduced hit rate                                   |
| **Staggered restarts**       | Turns N simultaneous losses into N sequential ones          | A slower rollout                                                    |

Coalescing and admission control are the two that protect the origin regardless of _why_ the
misses arrived — node loss, cold start, a TTL wave — which makes them worth having before
any of the others.

## Warming a returning node

A node that rejoins the ring takes back its share of the keyspace instantly and holds none of
it. Options, in order of how much they cost to build:

1. **Rejoin gradually.** Bring the node back in stages so it takes a fraction of its
   keyspace at a time; the miss rate is then bounded by the fraction rather than by 1/N.
   Requires the mapping layer to support partial membership, which client-side sharding
   usually does not and a proxy usually does.
2. **Pre-warm before advertising.** Fill the node from the origin, or from a peer, and only
   then add it to the membership. The correctness hazard is warming with values that go
   stale during the warm — write the warm entries with a short TTL, or accept the staleness
   window explicitly.
3. **Let it miss, behind coalescing and admission control.** Simplest, and adequate whenever
   the arithmetic above says the origin survives `R / N`.

Prefer rejoin below peak with an abort threshold. Emergency capacity restoration may justify a
peak-time rejoin, but gradual ownership and origin admission control must bound its cost.

## The test

The only proof is a node loss under load, and the assertion is on the **origin**, not on the
cache.

```
1. Drive steady load at production-shaped key distribution — replay a recorded key
   distribution, since a uniform synthetic load has an unrealistically flat miss profile.
2. Wait for the hit rate to reach steady state. Record origin req/s as the baseline.
3. Crash one node without handoff, then separately simulate a slow/partitioned node; fail-fast
   crashes and timeout failures exercise different client pool and retry behavior.
4. Assert: origin request rate stays below the agreed bound for the whole window.
5. Assert: client-visible error rate stays within the SLO, and p99 stays within budget.
6. Restore the node and assert the recovery has no second spike.
```

Origin/client bounds are the acceptance evidence. "The cache recovered" or a restored hit rate is
insufficient: recovery can be slow, fail, or succeed only after the origin violated its SLO.

Two variants worth running once each:

- **Rolling restart of the whole tier**, with the intended production pause between nodes.
  This is the scenario that actually happens, and the pause is the parameter under test.
- **Cold start**: origin plus empty cache, ramping load from zero. It establishes whether the
  system can be started at all in a full-recovery scenario, which is a different question
  from whether it survives one node.
