# Process-to-cluster boundary

This file does not define a distributed limiter. It identifies when the process-local mechanism in
this skill is insufficient and routes ownership to Category F.

## Aggregate exposure

With per-process limits `Li`, dependency concurrency is bounded above by the sum of active instance
limits plus any other callers and work not covered by those gates:

```text
observed dependency concurrency
  <= Σ active local limits + uncovered/other-client concurrency
```

`limit × replicas` is only the equal-limit upper bound, not the actual concurrency. Traffic skew,
rolling overlap, retries/hedges, stale instances and partial gate coverage matter. Autoscaling changes
the bound and may amplify load precisely when a dependency slowdown increases latency.

## Local allocation strategies

| Strategy                               | Useful when                                                 | Failure mode                                                           |
| -------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| conservative static per-instance share | replica range is bounded and headroom tolerates overlap     | wastes capacity at low replica count; can breach at high overlap       |
| deployment-computed share              | orchestrator has an authoritative desired/max replica count | running and desired topology differ during rollout/failure             |
| dynamic topology observation           | redistribution benefit exceeds coupling                     | stale/partitioned observers disagree and limits oscillate              |
| dependency-enforced admission          | provider has explicit queue/rejection contract              | rejection may arrive after expensive work and can be an outage symptom |

Per-pod saturation spread reveals skew, but no universal p99/p50 threshold decides validity. Compare
aggregate unused allocation, rejected demand and routing/tenant distribution.

## When coordination is required

A hard aggregate concurrency entitlement cannot be implemented exactly by independent semaphores.
It requires a distributed semaphore/lease/allocation protocol with:

- authoritative membership or leased capacity chunks;
- expiry, renewal and recovery from client/process failure;
- fencing when stale holders can still act;
- behavior during network partition and coordinator outage;
- oversubscription/underutilization budget;
- monotonic identity and auditability where quota has legal/financial consequences.

A token bucket governs rate, not in-flight concurrency, unless tokens are leased and returned under a
separate concurrency protocol. Batch leasing reduces coordination round trips while increasing
temporary oversubscription and stranded capacity.

Failure policy is more than a slogan: fail-closed protects entitlement but reduces availability;
fail-open protects availability but can breach it; a bounded cached allocation can degrade between
them but still needs expiry/fencing assumptions. Route protocol design to
`distributed-locks-and-leases` and `failure-models`.

## Rate-limit boundary

Rate allocation also does not “divide cleanly” under autoscaling and skew. Independent local buckets
need a replica-count/allocation model and define burst synchronization; coordinated/global buckets add
a critical dependency. Route rate semantics, load shedding and response behavior to
`rate-limiting-and-load-shedding`.

## Autoscaling interaction

Before using a concurrency-related autoscaling signal, model the loop:

```text
dependency slows -> residence time rises -> local permits stay held
-> local throughput falls / queue grows -> scaler adds replicas
-> aggregate local permits rise -> dependency receives more potential concurrency
```

Queue depth is not automatically safe—it can rise in this loop too. Cap aggregate exposure using
maximum rollout/replica count, choose signals tied to owned bottlenecks, and simulate dependency
degradation plus scale-out.

## Required observability

- sum of effective local limits over live/terminating instances;
- actual aggregate dependency in-flight from both caller and provider perspectives;
- uncovered callers, retries and hedges;
- per-instance/partition rejection, wait and unused allocation;
- rollout/autoscaling state aligned to limit changes;
- coordinator/lease latency, failures, expiry and fencing events if introduced.

## Handoff checklist

- [ ] Is the requirement process-local protection or a hard aggregate contract?
- [ ] Are all callers and rollout overlap included?
- [ ] Is the controlled quantity concurrency or rate?
- [ ] Are partition, stale membership, lease loss and coordinator failure modeled?
- [ ] Is precision worth the new distributed critical path?
- [ ] Does the provider enforce a documented contract, and at what cost/rejection point?
