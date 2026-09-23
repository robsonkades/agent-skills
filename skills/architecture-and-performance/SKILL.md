---
name: architecture-and-performance
description: >
  Attribute endpoint latency and throughput limits to architectural choices when query counts
  grow with result size, remote calls are chatty, connections are held across other work,
  or a cache, layer removal or service extraction is proposed as a performance fix.
  Compare fetching, call topology, resource occupancy and data movement across the whole
  request path. Does not replace investigation methodology (performance-methodology),
  profiling (jfr-and-async-profiler), individual SQL tuning (sql-query-performance),
  pool configuration (connection-pool-sizing) or load-test construction (load-testing).
---

# Architecture and Performance

The unit is the operation from arrival to its promised completion, including work deferred
to other services when that completion requires it. Attribute cost to concrete choices:
how much data is fetched, how often a boundary is crossed, which calls must wait for others,
and how long scarce resources remain occupied. Separate direct work savings from indirect
queue effects: faster mapping may reduce pool waits when it shortens connection holds, even
with unchanged SQL. Neither that effect nor an end-to-end gain follows from local timing alone.

## Workflow

1. **Define the operation and workload.** Obtain the latency/throughput objective, measurement
   boundary, request mix and rate, page/payload sizes, data distribution, concurrency and cache
   state. Identify the relevant code, SQL/call graph and deployment/framework versions.
   Without measurements, produce a conditional cost model and ask for the smallest evidence
   needed to distinguish options; do not announce a bottleneck or predict an empirical speedup.
2. **Map work and waits.** Record query/remote-call counts as functions of input size, rows
   and bytes returned, serial versus parallel dependencies, retries, queue waits and resource
   hold intervals. Compare expected work with observed work. Read
   [request-path-budget.md](references/request-path-budget.md) when attributing a slow path,
   estimating occupancy or checking whether measurements support a proposal.
3. **Locate the multiplier or limiting resource.** Correlate representative normal and slow
   requests with SQL, pool, downstream and CPU evidence. A growing call count suggests a
   repeated-access problem; low CPU or any nonzero pool wait alone does not identify its cause.
   Keep observation, hypothesis and recommendation distinct. State what would refute the
   proposed architectural explanation.
4. **Compare the smallest adequate change.** For fetching, persistence boundaries, mapping,
   locking or remote-call alternatives, read
   [persistence-cost-model.md](references/persistence-cost-model.md). Predict the mechanism:
   calls removed, rows avoided, occupancy reduced or critical-path work overlapped. Compare
   against keeping the design and fixing a local query/implementation issue.
5. **Validate the mechanism and outcome.** Preserve authorization, invariants, consistency,
   pagination and failure behavior. Re-run comparable work and check both the predicted
   mechanism and end-to-end latency, achieved throughput and errors. Delegate experimental
   design to `performance-methodology`; code/query-budget tests do not establish a production
   latency improvement.

## Decision constraints

- Count round trips, but also work per trip. One huge join can cost more than several bounded
  queries. There is no universal query-count threshold proving an architectural defect.
- Separate time on the critical path from total resource consumption. Parallel calls can
  shorten elapsed time while increasing downstream concurrency, queues and failure exposure.
- Distinguish method duration, transaction lifetime, connection hold time and lock hold time.
  Changing one does not guarantee that the others change.
- Before adding a cache, quantify source demand and representative hit/miss behavior, lookup
  cost, freshness requirements and miss amplification. A cache can reduce saturated-source
  load, but cannot repair incorrect fetching or make stale reads acceptable by itself.
- Before extracting a service, identify the resource or placement advantage that extraction
  creates and the new network/serialization/coordination cost. Neither “distribution scales”
  nor “distribution can never reduce latency” is a supported conclusion without this model.
- Do not remove a useful layer or weaken a consistency boundary based on a pattern's reputation.
  State the observable cost and prove required behavior survives the adjustment.

## Minimum deliverable

For a small review, report evidence or gap, architectural hypothesis, consequence, proposed
adjustment and a confirming/refuting check. For a design, add the workload assumptions,
cost/budget comparison and correctness constraints. Separate measured results from estimates
and tests still to run; leave unsupported conclusions open.

For worked decision boundaries or when reviewing this skill's behavior, use
[validation-cases.md](references/validation-cases.md). These teaching cases include expected
behavior; they are known examples, distinct from tests of application code.
