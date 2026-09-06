# Behavioral validation cases

Status: written cases, not executed model evaluations. No measured improvement is claimed.
These test the skill's decisions; query-budget tests or load tests of an application are
different evidence.

For each case, submit only the request/context in a fresh session. Compare the same model/version,
settings, tools and surrounding instructions without this skill versus with SKILL.md and access
to its references. Keep expected answers hidden. Record output, tool calls, environment and
pass/fail for each required characteristic with supporting excerpts. For selection, keep the
same neighboring descriptions in both runs, adding this skill's description in the treatment.
Judge observable reasoning and changes, not exact wording. Execution and results remain pending.

## 1. Representative repeated fetching

**Request/context:** “Review GET /orders. At page sizes 10 and 25, isolated cold-cache captures
show 11 and 26 SQL executions. The root query returns the requested orders; each order then
loads its lines. The endpoint must keep ordering, tenant filtering and complete line totals.
Most request time is in these sequential calls. Propose a fix without changing the response.”

**Expected behavior:** Identify evidence for repeated collection loading and compare a bounded
fetch/projection strategy against both query and returned-row costs.

**Required output:** Predicted count behavior with assumptions, preserved pagination/tenant and
total semantics, checks at multiple page sizes and end-to-end validation.

**Failure:** One giant join without row/pagination checks, a cache as proof the fetching defect
is fixed, or an invented measured speedup.

## 2. Transaction, OSIV and pool arithmetic

**Request/context:** “Our request p99 is 900 ms and OSIV is enabled. The pool sees 120 successful
checkouts/s and a measured mean checkout-to-return time of 80 ms. We have not measured burstiness
or DB capacity. Set the pool to 108 because 120 × 0.9 = 108; OSIV holds each connection all request.”

**Expected behavior:** Correct the lifetime and percentile assumptions without prescribing a
replacement pool size from averages alone.

**Required output:** 9.6 mean occupied connections; request/persistence-context/transaction/hold
lifetimes distinguished; database capacity and acquisition-wait/burst evidence requested.

**Failure:** Accepting 108 as established need, rounding 9.6 into a recommended size of 10, or
claiming OSIV itself makes the transaction request-long.

## 3. Ambiguous counter and instrumentation

**Request/context:** “A global Hibernate prepared-statement counter increased by 40 while one
request ran, but several other requests ran too. Statistics are disabled in the integration
test and its zero-delta query-budget assertion passes. Confirm that the endpoint uses the write
model incorrectly because it exceeds 30 queries.”

**Expected behavior:** Reject attribution from the global concurrent delta and detect the
false-positive test before diagnosing an architectural cause.

**Required output:** Isolated enabled-statistics test or request-correlated execution capture,
positive instrumentation control, and distinction between preparations and executions.

**Failure:** Assigning all 40 to the request, trusting the disabled counter, or inferring the
read/write model solely from a threshold.

## 4. Entity graphs, batching and pagination

**Request/context:** “Hibernate serves a page of 25 orders, each with 4 lines and 3 payments.
Approve a graph fetching both collections: entity graphs guarantee one SQL query and therefore
must be faster. Alternatively @BatchSize(25) means exactly two queries for every page size.
No SQL capture or collection mapping details are available.”

**Expected behavior:** Treat loading requirements separately from SQL shape; identify missing
provider/mapping evidence and compare query count with row amplification and pagination behavior.

**Required output:** Conditional 300-row join example, possible mapping restrictions, batching
growth with N, and checks for actual SQL, limits, contents and ordering.

**Failure:** Guaranteed single SQL, constant two-query promise for unbounded N, or approving
pagination solely because the ORM returns 25 roots after hydration.

## 5. Evidence contradicts a round-trip-first rule

**Request/context:** “This endpoint spends 15 ms in two SQL calls and 180 ms CPU serializing a
large response, confirmed by a profile correlated to the request. Propose adding a DB cache
before touching serialization because architecture performance is primarily round trips.”

**Expected behavior:** Prioritize the measured serialization/payload work, checking consumer
requirements before changing fields or representation.

**Required output:** A mechanism-based serialization/data-volume proposal, correctness checks
and comparable end-to-end measurement; no claim that fewer queries removes the 180 ms.

**Failure:** Deferring dominant CPU work until a cache is added, or attributing serialization
CPU solely from bytes divided by network throughput.

## 6. Parallel spans and service extraction

**Request/context:** “Two independent all-required calls each took 100 ms and overlapped fully
within a 120 ms request. Their component p99 values are each 180 ms. Sum those p99s to predict
the endpoint, then extract a service to make it faster. We have no saturated-resource evidence.”

**Expected behavior:** Use the dependency timeline, reject percentile addition and leave the
extraction benefit unproven.

**Required output:** Roughly 100 ms elapsed for the observed parallel region versus 200 ms
total call duration; remaining attribution gap; downstream capacity/deadline considerations
and a resource/placement hypothesis needed before extraction.

**Failure:** Negative residual from subtracting overlapping spans, predicted endpoint p99 of
360 ms by addition, or asserting distribution always helps or can never help.

## 7. Non-activation boundary

**Request/context:** “Explain these G1 evacuation-failure log lines and choose heap/collector
settings. No request-path or architectural change is being considered.”

**Expected behavior:** Route to JVM/GC expertise; do not activate architectural cost modeling.

**Required output:** GC evidence requirements and appropriate specialist routing.

**Failure:** Requiring a query budget or proposing service extraction as the answer to GC logs.

## 8. Parallel reads that break transaction ownership

**Request/context:** “Our Java 11 application uses Hibernate 5.6 and Spring imperative
transactions. Move three reads in one @Transactional method into CompletableFuture workers,
sharing its EntityManager. All reads must retain the existing transaction's snapshot semantics.
Also copy your Hibernate 7.1 statistics example unchanged; no upgrades are authorized.”

**Expected behavior:** Reject concurrent persistence-context access and assumed transaction
propagation. Keep the target toolchain and inspect its statistics API rather than upgrading.

**Required output:** A sequential or set-based alternative preserving the required semantics;
separate contexts identified as a possible consistency change, not an automatic fix; Java 17
minimum for the cited Hibernate 7.1 baseline distinguished from the Java 11 target.

**Failure:** Shared EntityManager in workers, transaction propagation assumed from the caller's
annotation, independent transactions claimed to preserve the original snapshot automatically,
or upgrading dependencies to make the reference example fit.
