# Overload and amplification patterns

Uniform entry shape: **Symptom** → **Mechanism** → **Where it hides** (the code or config that
produces it) → **Owner** (the skill with the fix). No entry contains a remedy.

## Thundering herd

- **Symptom** — a synchronised spike in requests, connections or cache misses at one instant:
  a restart, a deploy, a TTL boundary, or the moment a dependency comes back.
- **Mechanism** — many clients were made to act at the same time by a shared event and nothing
  spread them out. Unjittered backoff makes it worse: they failed together, so they wake
  together.
- **Where it hides** — one fixed TTL over entries created in a bulk load; a job at `0 * * * *`
  on every replica; a fixed reconnect delay; a fleet restart with no stagger; a cache warmed
  on startup by every instance at once.
- **Owner** — `cascading-failures` (recovery herd, staggered restart); `caching-strategies`
  (stampede, TTL jitter); `retries-and-backoff` (jitter).

## Retry storm

- **Symptom** — a dependency's inbound request rate **rises** while its success rate **falls**.
  Nothing else produces that pair: organic growth raises both, a pure fault leaves inbound flat.
- **Mechanism** — each timeout produces N attempts, multiplying load onto the thing that is
  already slow. Layered retries multiply rather than add: three layers of three is 27 requests
  per logical call.
- **Where it hides** — retries in more than one layer, two of which are usually invisible in
  the repository: a mesh sidecar default, an SDK's built-in retries, a driver reconnect.
- **Owner** — `retries-and-backoff` (budgets, jitter, retrying at exactly one layer).

## Cascading failure

- **Symptom** — the failure spreads to services that never call the failing one, and the
  system stays down after the trigger is removed.
- **Mechanism** — a slow dependency holds caller threads and connections; the caller
  saturates; its callers slow; retries add load; it slows further. The loop feeds itself, and
  the system does more work while completing less.
- **Where it hides** — one pool shared across dependencies; a health check that calls
  downstream; an unbounded queue; no concurrency limit on the path. Also in the response:
  adding replicas mid-cascade deepens it.
- **Owner** — `cascading-failures`.

## Timeout stacking

- **Symptom** — the caller has returned an error and the downstream work is still running:
  in-flight counts at the callee exceeding anything the caller admits to.
- **Mechanism** — an inner timeout longer than the outer one, or a timeout with no
  cancellation. Per-hop timeouts compose by addition, so three hops at 5 s is a 15 s worst
  case nobody configured. Stopping the wait and stopping the work are separate mechanisms.
- **Where it hides** — `future.get()` with no bound; a connect timeout with no read or request
  timeout; a retry policy whose total exceeds the caller's budget; `TimeoutException` caught
  without cancelling; a JDBC call with no `setQueryTimeout`.
- **Owner** — `timeouts-and-deadlines` (deadline propagation and cancellation).

## Unbounded queue growth

- **Symptom** — queue depth and time-in-queue climb steadily, latency rises linearly with
  time, completions per second fall while the service looks busy. Eventually heap exhaustion.
- **Mechanism** — a queue does not absorb overload, it converts it into latency. Once queue
  wait exceeds the caller's timeout every dequeued item is waste, so the service spends its
  whole capacity producing responses that are discarded.
- **Where it hides** — `new LinkedBlockingQueue<>()` with no capacity in an executor;
  unlimited consumer prefetch; an in-memory batch accumulator; an HTTP client's pending-acquire
  queue; any `submit()` whose rejection path was never written.
- **Owner** — `rate-limiting-and-load-shedding` (bounds, rejection, oldest-first);
  `littles-law-and-queueing` for the arithmetic that predicts it.

## Resource exhaustion

- **Symptom** — failures on endpoints unrelated to the fault: pool acquisition timeouts,
  `Too many open files`, `unable to create native thread`, heap growing with in-flight count.
  The blast radius is wrong for the trigger, which is the tell.
- **Mechanism** — a finite resource (pooled connections, request threads, file descriptors,
  memory per in-flight request) is consumed by calls waiting on something slow. The resource,
  not the dependency, is what the rest of the system then fails on.
- **Where it hides** — one pool shared across dependencies; a permit released outside a
  `finally`; a retry sleeping while holding a pooled connection or an open transaction;
  unbounded per-request fan-out after virtual threads removed the bounding pool.
- **Owner** — `concurrency-limiting-and-bulkheads`; `connection-pool-sizing` for the database
  pool; `cascading-failures` for the propagation.

## Input explosion

- **Symptom** — one request produces an enormous amount of downstream work: millions of
  queries, a multi-gigabyte response, an exhausted heap. No rate limit was violated.
- **Mechanism** — cost per request is unbounded because the input is. A requests-per-second
  limit is not a limit on work when one request can cost a million times another.
- **Where it hides** — a list field with no maximum length; a query with no `LIMIT` over a
  client-controlled filter; a batch endpoint with no cap; a date range defaulting to "all".
- **Owner** — `rpc-and-api-contracts` (bound it in the contract) and
  `rate-limiting-and-load-shedding` (cost-weighted limits).

## Duplicate processing

- **Symptom** — two records, charges or emails for one intent. Timestamps differ by roughly
  the client timeout plus one backoff, or by a consumer rebalance interval.
- **Mechanism** — delivery is at-least-once and application was not made idempotent. A timeout
  is ambiguous, so a retry may reapply a write that already happened; separately, a consumer
  that processes before committing its offset reprocesses after a rebalance or a crash.
- **Where it hides** — a POST retried after a timeout with no idempotency key; a dedup guard
  written as `if (exists) return;` before an insert, which duplicates under two concurrent
  copies; an ack placed before the side effect.
- **Owner** — `delivery-semantics` (why duplicates arrive); `idempotency` (surviving them).

## Gray failure / slow node

- **Symptom** — one instance is up and passing its health check while its clients see ten
  times the normal latency. Fleet averages look fine; per-instance percentiles do not.
- **Mechanism** — the system's view of health differs from the client's. No failure detector
  over an asynchronous network can distinguish a slow process from a crashed one, so the slow
  instance keeps its endpoint, keeps taking traffic, and holds a caller resource per request.
- **Where it hides** — a health endpoint returning a static 200; a check whose timeout exceeds
  the client's; balancing on liveness but not latency; a dashboard of aggregates only, hiding
  the max-to-mean ratio across instances.
- **Owner** — `failure-models` (the fault class, differential observability);
  `load-balancing-and-routing` (outlier ejection and its fleet-ejection hazard);
  `kubernetes-service-lifecycle` (probe design).
