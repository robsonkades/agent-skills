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
  The stronger discriminator is attempts per logical request rising after failures/timeouts;
  failover, demand growth and cache-miss amplification can produce the same first two series.
- **Mechanism** — each timeout produces N attempts, multiplying load onto the thing that is
  already slow. Layered retries multiply rather than add: three layers of three is 27 requests
  per logical call.
- **Where it hides** — retries in more than one layer, two of which are usually invisible in
  the repository: a mesh sidecar default, an SDK's built-in retries, a driver reconnect.
- **Owner** — `retries-and-backoff` (budgets, jitter, retrying at exactly one layer).

## Cascading failure

- **Symptom** — the failure spreads beyond direct callers, or the system stays degraded after
  the trigger is removed. These are related but distinct propagation/metastability clues.
- **Mechanism** — a slow dependency holds caller threads and connections; the caller
  saturates; its callers slow; retries add load; it slows further. The loop feeds itself, and
  the system does more work while completing less.
- **Where it hides** — one pool shared across dependencies; a health check that calls
  downstream; an unbounded queue; no concurrency limit on the path. Also in the response:
  adding cold replicas mid-cascade can deepen it when startup, cache warm-up or connection
  creation adds load; warm isolated capacity can instead help.
- **Owner** — `cascading-failures`.

## Timeout stacking

- **Symptom** — the caller has returned an error and the downstream work is still running:
  in-flight counts at the callee exceeding anything the caller admits to.
- **Mechanism** — an inner timeout longer than the remaining caller budget, or a timeout with
  no effective cancellation. Sequential hop/attempt budgets can add; parallel branches take
  a maximum, and retries add further terms. Stopping the wait and stopping the work are
  separate mechanisms.
- **Where it hides** — `future.get()` with no bound; a connect timeout with no read or request
  timeout; a retry policy whose total exceeds the caller's budget; `TimeoutException` caught
  without cancelling; a JDBC call with no `setQueryTimeout`.
- **Owner** — `timeouts-and-deadlines` (deadline propagation and cancellation).

## Unbounded queue growth

- **Symptom** — queue depth and age trend upward while arrival exceeds sustainable goodput;
  latency grows and may eventually hit memory, retention or caller-deadline limits.
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

## Asymmetric partition

- **Symptom** — the dependency is healthy from one region, node or protocol path and
  unreachable from another; aggregate availability hides a sharply segmented failure.
- **Mechanism** — routing, ACL, DNS, MTU, address-family or one-way network failure violates
  the assumption that reachability is symmetric and global.
- **Where it hides** — one synthetic probe location; only server-side metrics; dual-stack
  resolution with a broken IPv6 path; return traffic through a different firewall.
- **Discriminator** — a source×destination×protocol reachability matrix, including request
  and response direction, differs while target process health remains stable.
- **Owner** — `failure-models`; `distributed-tracing-design` and `linux-for-jvm` for evidence.

## Metastable failure

- **Symptom** — the initiating load spike or dependency fault is gone, yet retries, queues,
  cache misses or recovery work keep goodput below arrivals and the system does not recover.
- **Mechanism** — feedback maintains a bad equilibrium: expired work consumes capacity,
  retries amplify it, cold caches raise dependency load, or recovery competes with serving.
- **Where it hides** — FIFO processing of already-expired work, eager fleet reconnect, cache
  flush on restart, recovery without bandwidth/CPU limits.
- **Discriminator** — offered logical load returns to normal but internal attempt/work rate
  and saturation remain elevated; controlled shedding or draining breaks the loop.
- **Owner** — `cascading-failures` and `rate-limiting-and-load-shedding`.

## Correlated/common-mode failure

- **Symptom** — replicas intended to be independent fail nearly together.
- **Mechanism** — they share software version, credentials, DNS/control plane, quota,
  availability zone, deployment action or workload trigger; replica count overstated fault
  independence.
- **Where it hides** — all replicas in one failure domain; one global secret expiry; one bad
  configuration rolled everywhere; shared connection pool or upstream quota.
- **Discriminator** — group failures by failure-domain labels and change/event timeline, not
  instance ID. Correlation follows a shared dimension.
- **Owner** — `failure-models`; `architecture-characteristics` for required independence.
