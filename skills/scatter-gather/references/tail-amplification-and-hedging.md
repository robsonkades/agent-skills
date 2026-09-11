# Choosing N, and hedging safely

## Root order statistics

For all-of-N, the root waits for the slowest required leaf. For first-success it observes the
minimum acceptable success; k-of-N observes the kth acceptable distinct success, followed by
any remaining coordinator/merge time. Failed, ineligible-stale or duplicate answers do not count toward that order. The familiar closed
forms require independent identically distributed leaves; shared hosts, queues and dependencies
make joint traces/load tests essential.

- **The leaf maximum reaches a deeper leaf percentile.** For iid all-of-N before remaining
  root overhead, leaf CDF at the maximum's p99 is `0.99^(1/N)`; at N=20 this is about 99.9498%, often called p99.95. Derive it in
  `tail-latency-analysis`; do not copy the root SLO down to the leaves.
- **A rare independent leaf event becomes common at the root.** Probability of at least one is
  `1-(1-p)^N`, approximately `Np` only when `Np` is also small; do not state `1000/N` as exact.

Correlation can increase or decrease the iid amplification relative to the product model.
Common pauses make leaves move together; contention created by the fan-out can also make later
leaves slower conditional on N. Measure joint events and placement, not only marginals.

## Choosing N

For all-of-N, align timestamps to the root and follow the critical path:

```text
root ≈ max_i(dispatch_offset_i + leaf_elapsed_i)
     + remaining_nonoverlapped_gather_and_return
# leaf_elapsed includes queue/admission/client/server work after its dispatch origin
# dispatch and incremental merge may overlap leaf execution: count each interval once
```

For first-success/k-of-N use the corresponding eligible root-relative completion statistic.
An additive dispatch + leaf + merge approximation is useful only for non-overlapping stages
or explicitly modeled overlap; do not sum separate stage percentiles. N requests are not
necessarily N sockets: persistent connections and HTTP/2 multiplexing change connection cost.

Splitting can reduce divisible leaf work until fixed costs or contention dominate. Scheduling,
queueing, GC, connection setup and retransmission need not shrink with the data slice, and
their distribution can change with N and load. Measure the resulting root latency and work
rather than treating a fixed noise floor or linear speedup as universal.

Use comparable workloads/placement when looking for a crossover. These are hypotheses to
check against root traces and resource cost:

| Symptom                                                       | Reading                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| Leaf p50 falls with N, root p50 flat                          | Possible crossover or overlapping root cost; inspect traces   |
| Leaf p99 flat or improving, root p99 rising with N            | Added tail exposure/root cost may outweigh leaf gains         |
| Root p50 still tracking `1/N`                                 | Median still benefits; optimum also depends on tails and cost |
| Root p99 ≫ root p50 while every leaf p99 ≈ leaf p50           | Tail amplification or root queue/merge cost; inspect traces   |
| Root p99 and leaf p99 move together across all leaves at once | Shared cause/load change is a hypothesis to investigate       |

**One leaf per shard can be a deliberate bounded contract.** Preserve it when isolation,
per-shard budgets or transport behavior justify the cost. If owners serve several shards,
coalescing may reduce requests while retaining all required reads; check payload, head-of-line
blocking and scheduling effects. Selective/ordered dispatch can help only when the completion
and freshness contract permits stopping early or waiting for later owners. Neither an index
nor a precomputed view is automatically better once maintenance and consistency costs count.

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
   Scale_ motivates latency/cost trade-offs; its workload examples do not establish your
   admission cap. Choose and verify a bound for the actual protected resource.
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

For a material hedge-policy change, compare these relevant series with the intended latency,
availability and resource objective, using adequate existing evidence when available:

| Series                                         | What it tells you                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| hedges issued ÷ original eligible requests     | Whether the ratio cap holds; saturation alone does not establish benefit or harm     |
| responses won by the hedge ÷ hedges issued     | Near zero may mean late trigger, correlated delay or ineligible answers; investigate |
| downstream request rate and utilisation delta  | The load actually added, measured at the callee rather than inferred                 |
| root p99 and p99.9 before/after                | Whether the point of the change happened at all                                      |
| loser residual duration / cancellation success | Whether returned latency hides continuing downstream work                            |

Reduce or disable hedging when its measured benefit no longer justifies the extra work or a
resource guardrail is breached. A low win rate at the cap warrants investigation, but a rare
win can still protect the relevant extreme tail. Check placement, trigger timing, eligibility
and residual cost before assigning cause. Use the system's supported bounded rollback/control
path; a narrow review does not require introducing a new live configuration mechanism.

Match the arrival model to the actual population. For independent external arrivals, use an
offered-rate model that does not silently slow with response time; report scheduled, started,
delayed and dropped arrivals rather than assuming the configured rate was achieved. A closed
model is appropriate for a real completion-paced population with its think times/concurrency;
it cannot establish behavior under independent demand. Segment by original/hedge placement
and consistency result; a fast answer outside the accepted watermark is not a win.

## Primary references

- [Dean and Barroso, The Tail at Scale](https://research.google/pubs/the-tail-at-scale/)
- [Jeff Dean, Achieving Rapid Response Times in Large Online Services](https://research.google/pubs/achieving-rapid-response-times-in-large-online-services/)
- [RFC 9113: HTTP/2 streams and multiplexing](https://www.rfc-editor.org/rfc/rfc9113#section-5)
- [Gatling: workload models](https://docs.gatling.io/testing-concepts/workload-models/) — arrival-model concepts; no Gatling API or version-specific configuration assumed
