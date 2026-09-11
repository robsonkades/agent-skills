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
omits the following possible effects:

- **Second-order eviction.** The remapped keys land on the nine survivors, whose memory did
  not grow. If memory headroom is insufficient, eviction can lower survivor hit rate and
  raise origin load above 7,250 beyond the re-warm of one node.
- **Duplicate misses.** A hot key in the lost range is requested by many callers
  concurrently, and every one of them misses until the first fill completes. Without
  coalescing the origin sees the concurrency, not the key count. The 5,000 req/s already
  includes these requests: do not add a second duplicate multiplier to that request rate.
  Coalescing reduces origin calls; retries or explicit hedging may add calls beyond arrivals.
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
  system can serve that full rate, cold start needs an admission/ramp plan before accepting
  the full offered load; an empty cache does not by itself make recovery impossible.

## The levers

| Lever                        | What it does                                                | Cost                                                                |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| **Replication factor > 1**   | A ready replica can preserve hits after detection/promotion | RF × memory; lag, promotion delay, reduced remaining capacity       |
| **More, smaller nodes**      | Can reduce worst-node request share if traffic balances     | More connections, more membership churn, more to operate            |
| **Request coalescing**       | Collapses concurrent misses of one key per coalescing scope | Cancellation/deadline/failure sharing; fleet-wide duplicates remain |
| **Origin admission control** | Caps what reaches the origin, sheds or queues the rest      | Rejected or delayed requests — `rate-limiting-and-load-shedding`    |
| **Gradual warming**          | Bounds the _rate_ of misses a returning node produces       | Longer period of reduced hit rate                                   |
| **Staggered restarts**       | Turns N simultaneous losses into N sequential ones          | A slower rollout                                                    |

Coalescing helps repeated concurrent misses for the same key within its scope; it does not
cap a storm of distinct-key misses. Origin admission must cover the aggregate work from
request misses, retries and warming, with bounded queues and tenant fairness where required.
Compare that budget with measured origin capacity. Local limits need a bounded aggregate
across all active instances; a per-instance coalescer alone supplies no such bound. Use the
protection the failure estimate requires, rather than introducing every lever.

## Warming a returning node

An empty node rejoining a client-side ring can immediately take ownership without cached data.
Products that transfer slots or synchronize replicas have different rejoin behavior; inspect
the actual readiness and routing protocol. For an empty ownership target, options include:

1. **Rejoin gradually.** Bring the node back in stages so it takes a fraction of its
   keyspace at a time; use the measured request share of each stage, not just key count, to
   estimate misses. Verify that this client/proxy/product supports staged ownership and keep
   admission control in place; stages with a hot key can still exceed origin capacity.
2. **Pre-warm before advertising.** Fill the node from the origin, or from a peer, and only
   then add it to the membership. The correctness hazard is warming with values that go
   stale during the warm. Establish a cutover condition covering concurrent updates, deletes
   and late fills. If using version/tombstone checks to reject stale fills, cover absent
   entries too; a one-time invalidation replay followed by unsynchronized fills is
   insufficient. `caching-strategies` owns that protocol. A short TTL is only acceptable when
   the resulting source-age window meets the contract and expiry reloads fresh data. Bound
   warming traffic and abort on lost origin headroom. Rollback routing must preserve the same
   read contract; the old owner may no longer be current.
3. **Let it miss, behind coalescing and admission control.** Simplest, and adequate whenever
   the measured request share and query mix fit remaining origin capacity.

Prefer rejoin below peak with an abort threshold. Emergency capacity restoration may justify a
peak-time rejoin, but gradual ownership and origin admission control must bound its cost.

## The test

Exercise node loss under representative load; assertions must include the **origin**, not only
the cache. A passing run establishes behavior for its workload and failure scenario only.

```
1. Drive steady load at production-shaped key distribution — replay a recorded key
   distribution, since a uniform synthetic load has an unrealistically flat miss profile.
2. Wait for the hit rate to reach steady state. Record origin req/s as the baseline.
3. Crash one node without handoff, then separately simulate a slow/partitioned node; fail-fast
   crashes and timeout failures exercise different client pool and retry behavior.
4. Assert: origin rate, concurrency and queue depth stay below agreed bounds throughout.
5. Assert: client-visible error rate stays within the SLO, and p99 stays within budget.
6. Restore the node and assert recovery stays within the same bounds; record time to readiness.
```

For a migration, include concurrent updates/deletes and delayed fills across cutover and rollback;
assert the declared read contract on every still-routable owner, not just successful transfer.

Origin/client bounds are the acceptance evidence. "The cache recovered" or a restored hit rate is
insufficient: recovery can be slow, fail, or succeed only after the origin violated its SLO.

Two variants worth running once each:

- **Rolling restart of the whole tier**, with the intended production pause between nodes.
  This is the scenario that actually happens, and the pause is the parameter under test.
- **Cold start**: origin plus empty cache, ramping load from zero. It establishes whether the
  system can be started at all in a full-recovery scenario, which is a different question
  from whether it survives one node.
