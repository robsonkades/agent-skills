---
name: concurrency-limiting-and-bulkheads
description: >
  Engineer process-local concurrency limits and bulkheads around scarce resources, with explicit
  admission deadlines, permit ownership, weighted work, partitioning, fairness, observability and
  overload validation. Distinguishes concurrency, rate and queue limits and the assumptions behind
  Little's Law. Use after virtual-thread migrations, during downstream saturation, or when local
  limits leak, over-release, double-queue or fail to compose across replicas.
---

# Concurrency Limiting and Bulkheads

## Purpose and boundary

Bound the work simultaneously holding or competing for a scarce resource inside one JVM. A limit is
correct only when it names the protected resource, admission location, waiting budget, ownership,
rejection behavior and scope.

This Category D skill owns process-local mechanisms. Cluster-wide allocation, rate limiting and
distributed leases cross process boundaries and belong to Category F; this skill detects that
handoff and links to `rate-limiting-and-load-shedding` and `distributed-locks-and-leases` rather than
duplicating their protocols.

## Design workflow

1. Name the constrained unit: calls, connections, bytes, file handles, CPU tasks, tenant share, or a
   provider quota.
2. Decide whether the requirement is simultaneous work, arrivals per time, or waiting backlog.
3. Inventory existing gates and queues from ingress to resource. Avoid accidental serial limits and
   double queueing.
4. Establish a capacity envelope from measurement/provider tests, required throughput, service-time
   distribution, replicas and safety headroom.
5. Place a resource-local gate before costly allocation/launch. Add hierarchical ingress/tenant
   limits only when they protect a distinct failure domain.
6. Define permit weight, acquisition deadline, interruption, rejection/degradation and retry policy.
7. Load-test overload, slow dependency, cancellation, release failure, autoscaling and skew; validate
   useful throughput, tail latency, memory, fairness and dependency health.

## Do not confuse the controls

| Control         | Bounds                           | Typical mechanism                              | Does not guarantee                                                |
| --------------- | -------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| concurrency     | simultaneous admitted work       | semaphore, connection pool, fixed CPU executor | arrivals per time or bounded waiting                              |
| rate            | arrivals/operations per interval | token/leaky bucket                             | simultaneous work when latency changes                            |
| queue/admission | waiting work or bytes            | bounded queue/window plus rejection            | downstream concurrency unless connected to a worker/resource gate |

Little's Law, `L = λW`, relates long-run average in-system work, throughput and average residence
time for a stable, conserved population. It is not a per-request identity, a tail-latency formula or
a guarantee under overload/non-stationary traffic. Use it as a consistency check alongside burst,
variance and queueing analysis.

## Placement and composition

A resource-local limit prevents one slow dependency from consuming capacity intended for another.
An edge/global limit can still be valuable for heap, CPU or total-request protection. These are
hierarchical bounds with different ownership, not “one limit is always wrong.”

```text
ingress memory/CPU admission
  -> tenant or priority partition (optional)
    -> dependency-specific concurrency gate
      -> client connection pool/provider quota
```

If a client/connection pool already limits concurrency, determine whether it also bounds its wait
queue and exposes a usable deadline/rejection signal. A smaller outer gate may reserve headroom and
avoid allocating request state while waiting. An identical outer semaphore often adds a second queue,
but can be justified for observability/admission only if the ownership and order are explicit.

Acquire before starting the protected operation, not after obtaining its scarce connection or
allocating its large buffer. Do not hold one resource's permit while waiting for another without a
global ordering/cycle analysis.

## Permit ownership

- Acquire interruptibly or with a remaining monotonic deadline on cancellable paths.
- Enter `try/finally` only after acquisition succeeds; release exactly once in `finally`.
- A semaphore has no owner: any thread can release and over-release silently raises capacity. Wrap it
  behind an API that makes the permit a scoped capability.
- `Semaphore(1)` is not a reentrant/owned mutex. Use a lock when mutual exclusion and ownership are
  the contract.
- Bulk `acquire(n)` can create head-of-line blocking; large weighted requests can starve or starve
  small requests depending on fairness and arrival pattern.
- Cancellation while waiting must not release an unacquired permit; cancellation after acquisition
  must still execute cleanup.

Fair semaphores order acquisition at documented internal points, not by wall-clock method arrival;
untimed `tryAcquire` can barge even on a fair semaphore. Fairness can reduce starvation/variance at a
throughput cost, but it does not solve tenant isolation or priority inversion. Measure the actual
hold-time distribution and queue age.

## Selecting a static limit

Do not choose the arithmetic minimum of “capacity, share, average demand” mechanically. Required
average concurrency `λW` at target throughput would imply full utilization if used with no headroom;
variability then creates queueing. Instead:

1. measure dependency throughput/latency/error behavior at increasing concurrency;
2. identify the knee before tail/error/resource collapse;
3. cap by contractual/provider and local resource ceilings;
4. reserve headroom for variance, other clients, rolling overlap and failure recovery;
5. verify that the chosen limit can meet required load without violating the SLO;
6. test slow-tail and burst scenarios, not just average service time.

Adaptive control is appropriate only with a trustworthy feedback signal, minimum/maximum bounds,
stability analysis, exploration policy and safe behavior when telemetry fails. A controller can
oscillate or chase downstream latency caused by unrelated load; start static when the ceiling is
stable and revisit from evidence.

## Bulkhead partitioning

Partition by the failure domain that must be isolated: dependency, tenant, operation cost, priority,
or workload class. Partitioning trades utilization for isolation. A shared reserve/borrowing policy
recovers utilization but must prevent one partition from permanently consuming it.

Per-tenant maps require lifecycle/cardinality control; otherwise the bulkhead itself becomes an
unbounded memory structure. Hashing tenants into cells bounds state but permits noisy-neighbor
collisions. Dedicated limits fit a small set of high-value tenants; long-tail tenants can share a
bounded pool.

## Virtual threads

`newVirtualThreadPerTaskExecutor()` removes platform-thread scarcity; it does not create resource
capacity or admission control. It can still reject after shutdown and fail under resource
exhaustion. Audit every old fixed pool to identify which resource its size had accidentally bounded,
then replace that side effect with resource-specific gates. Do not pool virtual threads merely to
recreate platform-thread scarcity.

## Operability

Measure by named limiter/resource:

- configured/effective limit and any dynamic changes;
- requested weight, successful/failed/interrupted acquisition and rejection reason;
- wait duration and queue age distribution;
- acquired/in-flight and hold duration;
- over-release/leak conservation violations;
- downstream concurrency, latency, errors and late work;
- per-partition saturation and unused capacity.

`availablePermits()` is a momentary value, not proof of in-flight count or correctness. Maintain
accepted/acquired/released lifecycle counters and reconcile with known dynamic resizing. Alert on SLO
risk using wait/queue age, rejection and downstream health; no one signal is universally earliest.

## Failure-mode diagnosis

| Symptom                                          | Distinguish with                                     | Likely change                                                     |
| ------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------- |
| wait grows before dependency saturation          | gate is too early/global or another resource is held | move/split gate and analyze acquisition order                     |
| dependency sees more than local limit            | replicas/other clients/retries or over-release       | sum scoped limits; reconcile permit lifecycle                     |
| permits fall over days                           | acquisition/release conservation and dynamic config  | repair scoped ownership; recover abandoned resources deliberately |
| low aggregate utilization but one tenant rejects | per-partition skew and borrowing                     | adjust partitions/reserve/routing, not only total limit           |
| bounded concurrency but heap grows               | queue/live future count and captured bytes           | bound admission/windowing in addition to execution                |
| increased limit lowers throughput                | dependency knee, contention and service time         | reduce to stable envelope; eliminate hold time/contention         |

## Review checklist

- [ ] Requirement is correctly classified as concurrency, rate or queue/byte bound.
- [ ] Protected resource and process/cluster scope are named.
- [ ] Existing queues/pools/gates and acquisition order are inventoried.
- [ ] Limit derives from measured capacity and required load with headroom, not average arithmetic alone.
- [ ] Acquisition is deadline-aware/interruptible; release is exactly once after success.
- [ ] Rejection/degradation/retry semantics are explicit and tested.
- [ ] Partition state is bounded and skew/borrowing behavior is observable.
- [ ] Per-replica limits are treated as an aggregate upper bound, not a global guarantee.

## References

- [Limit selection and implementation](references/limit-selection.md)
- [Process-to-cluster boundary](references/distributed-limits.md)
- [Java 25 `Semaphore`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Semaphore.html)
- [Java 25 virtual-thread adoption guide](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
