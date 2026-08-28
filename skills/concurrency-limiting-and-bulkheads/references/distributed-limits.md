# Limits across replicas

## Why a per-JVM limit does not compose

```text
Semaphore(20) × 6 replicas = 120 concurrent calls at the dependency
                                   ↑ the number that matters, and the one nobody configured
```

Everything a `Semaphore` guarantees is scoped to one process. The dependency experiences the
product, and that product changes silently whenever the deployment scales, a rolling update
briefly runs `N+1` pods, or a second service reuses the same client library with its own
limit.

This is not an argument against per-JVM limits — they are cheap, have no failure mode of
their own, and are the right default. It is an argument against _believing the number_
without multiplying it first.

## Dividing a global budget: the strategies and what breaks each

| Strategy                                         | Works when                                    | Breaks when                                                       |
| ------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------- |
| Static divide: `global ÷ replicas`               | replica count is fixed and traffic is even    | autoscaling; rolling updates; uneven sharding or routing          |
| Divide, then round **down** and reserve headroom | mostly stable topology                        | still wrong during a scale event, but wrong in the safe direction |
| Read replica count at startup                    | scaling is rare                               | the value is stale the moment a pod is added                      |
| Watch replica count (K8s API / peers)            | you accept the operational coupling           | the watch itself fails; partitions cause disagreement             |
| Central token service / Redis                    | a genuine hard external quota exists          | adds a dependency to every call; its own latency and failure      |
| Let the dependency enforce it                    | the dependency actually does (429, pool caps) | it does not, or its enforcement is the outage you are causing     |

The first two are what most systems should do. The last is what most systems should _aim
for_: a dependency that enforces its own limit and returns 429 gives every caller correct
behaviour without any coordination at all.

## The uneven-load problem

Dividing assumes traffic is spread evenly. It rarely is:

- A load balancer with sticky sessions concentrates a heavy tenant on one pod.
- Consistent-hash routing sends one hot key to one replica.
- A canary pod takes 5 % of traffic and holds `global ÷ N` of the budget anyway.

Under any of these, the pods that need permits do not have them and the pods that have them
do not need them. The symptom is rejections at the aggregate limit while the aggregate
utilisation is well below it — which reads on a dashboard like a bug in the limiter and is
in fact a bug in the assumption.

Detect it by exporting per-pod saturation and comparing the spread, not the mean. A p99/p50
ratio across pods above about 2 means dividing is no longer a valid model.

## When coordination is genuinely required

Only when the limit is a hard external contract — a vendor quota with financial or legal
consequences, a licence count, a database that will fall over rather than queue. Then:

```text
Token bucket in Redis, refilled by rate, consumed per call
    + cost:    one round trip on every call (or lease a batch of tokens per window)
    + failure: Redis down. Decide NOW: fail open (risk breaching the quota)
               or fail closed (become unavailable). There is no third answer.
    + drift:   clock skew across clients; use the store's own clock/atomics
```

Lease a batch — take 20 tokens, use them locally, return the remainder — to trade precision
for round trips. That is usually the right shape: exact enough for a quota, cheap enough for
a hot path.

Record the fail-open/fail-closed decision in the code next to the client, not in a design
document. It is the thing an on-call engineer needs at 03:00 and the thing that is always
missing.

## Autoscaling and the feedback loop

A concurrency limit interacts with autoscaling in a way that surprises people: when the
dependency slows, each replica's throughput falls (Little's Law), request latency rises, the
autoscaler adds replicas, and the aggregate concurrency at the already-struggling dependency
goes **up**. The limit designed to protect it now scales with the load it was protecting
against.

Two mitigations, both cheap:

- Scale on a signal that does not rise when the dependency is slow — queue depth or
  utilisation of your own resources, not request latency alone.
- Make the aggregate the configured thing: express the limit as
  `globalBudget / currentReplicas` computed from a value the deployment actually knows, and
  alarm when the product exceeds the budget.

## Rate limit versus concurrency limit, across replicas

A **rate** limit divides cleanly and statically: 600 rpm across 6 pods is 100 rpm each, and
that remains true whatever the latency does. A **concurrency** limit does not, because the
rate it implies moves with the dependency's latency. When the external contract is expressed
in requests per unit time, implement a rate limiter and divide it; do not approximate it with
permits.

## What to measure

- Aggregate in-flight at the dependency (sum across pods) versus the intended global budget —
  the only number that answers "are we honouring the contract?"
- Per-pod saturation spread, to detect uneven load invalidating the division
- Rejections per pod, to detect one pod rejecting while others idle
- For a coordinated limiter: its own latency and error rate, on the same dashboard as the
  calls it guards, because it is now on the critical path of every one of them

## Review checklist

- [ ] The per-JVM limit was multiplied by the replica count and compared to the dependency's
      documented capacity
- [ ] The number is re-derived when the deployment scales, or headroom covers the range
- [ ] Uneven load has been considered and per-pod spread is exported
- [ ] Coordination is used only for a hard external contract, with an explicit
      fail-open/fail-closed decision in code
- [ ] Rate contracts are implemented as rate limiters, not as permits
- [ ] Autoscaling signals do not amplify concurrency at a degraded dependency
