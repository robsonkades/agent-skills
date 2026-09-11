# Silent, temporal and operational patterns

Same shape: **Symptom** → **Mechanism** → **Where it hides** → **Owner**. These are the
patterns error-rate monitoring cannot show, or that appear only around a deploy or a clock.

## The absence of errors as an error

- **Symptom** — everything is green and something stopped changing: a table whose newest row
  is from yesterday, a queue at depth zero because nothing produces, an identical daily report.
- **Mechanism** — error-rate monitoring measures requests that happened. A dead consumer or a
  job that never fired makes no requests and therefore no errors. The signal that would show
  it is the **age** of something, which nothing computes unless asked.
- **Where it hides** — an exception escaping a periodic `scheduleAtFixedRate` or
  `scheduleWithFixedDelay` task suppresses that task's later executions. Its future completes
  exceptionally (`get()` exposes the cause), not necessarily cancelled, and the executor
  can still run other tasks. Also a consumer thread killed by an unchecked exception; an
  alert defined only as `rate(errors) > x`; unmonitored consumer lag.
- **Discriminator** — compare expected schedule/input activity, independent scrape health
  and last successful progress; inspect the scheduled future. A quiet business period or
  broken exporter can mimic a stalled pipeline.
- **Owner** — `slo-and-alerting` (freshness alerts); `task-queues-and-competing-consumers`
  (oldest-message-age).

## Expected versus unexpected errors

- **Symptom** — an error-rate alert fires and nothing is broken, or a real incident never
  crosses the threshold. A spike traced back to one client sending malformed requests.
- **Mechanism** — unlike outcomes share one numerator: malformed client traffic can dominate
  server defects, while contract-significant 4xx responses such as unexpected authorization
  or throttling failures may be incorrectly dismissed as “client errors.”
- **Where it hides** — one `http_server_requests` alert with no status-class dimension;
  business rejections mapped to 500; a handler mapping every unhandled exception to one status.
- **Owner** — `rpc-and-api-contracts` (error surface); `slo-and-alerting` (what to page on).

## Version skew during a rolling deploy

- **Symptom** — errors that start when a rollout starts and stop when it finishes, so the
  cause is never found: deserialisation failures, unknown enum values, missing fields.
- **Mechanism** — a rolling deploy runs both versions at once against shared databases,
  topics and APIs. Required compatibility direction follows producer/consumer rollout order,
  queued-data lifetime and rollback window; one-direction compatibility fails when traffic
  flows in the opposite direction.
- **Where it hides** — a renamed field; a reused protobuf field number; a new enum constant
  emitted before consumers parse it; a migration dropping a column in the release that stops
  writing it.
- **Discriminator** — group failures by caller/callee/schema version pair. Compare with cold
  cache, startup saturation or configuration changes during the same rollout.
- **Owner** — `rpc-and-api-contracts` (required version matrix, expand-then-contract).

## Stale or obsolete work

- **Symptom** — work completes long after anyone wanted it: a notification for a cancelled
  order, an email about a superseded state, a job whose result is rejected on write.
- **Mechanism** — the task was enqueued assuming it would run soon; under backlog the deadline
  passes or the entity changes, and executing it is worse than dropping it — a wrong side
  effect plus capacity taken from work still inside its deadline.
- **Where it hides** — a task with no applicability deadline/entity version; a consumer that
  never revalidates current state; a DLQ redrive replaying a week-old backlog. Message age
  alone is not expiry: durable obligations may remain valid after the caller stops waiting.
- **Discriminator** — compare the effect's business preconditions and current entity version,
  not only elapsed time. Separate delayed-but-required work from superseded work.
- **Owner** — `task-queues-and-competing-consumers`; `timeouts-and-deadlines`;
  `poison-messages-and-dlq` (redrive).

## Destructive cleanup

- **Symptom** — a retention or reconciliation job removed far more than intended, often
  everything, and reported success.
- **Mechanism** — the delete predicate evaluated far broader than intended: a null parameter
  that removed the filter, a join returning no rows read as "nothing references this", an
  empty allowlist read as "allow nothing". The job then does exactly that, at full speed.
- **Where it hides** — a `DELETE` assembled by concatenation with an optional clause; a
  cleanup driven by the _absence_ of a matching row; a run with no batch limit.
- **Discriminator** — retain selection inputs, candidate IDs/count, actual affected IDs and
  source-data freshness. Distinguish an overbroad predicate from stale reference data or
  multiple individually bounded workers exceeding the intended total.
- **Owner** — this catalogue's cleanup guard guidance immediately below.

Preview the actual predicate and bind required tenant/cutoff/scope parameters. Missing input
or an unavailable reference source is not evidence that an object is unreferenced. Enforce
a batch limit and a durable total budget for the logical run across workers/retries; resetting
a per-process cap can eventually delete everything.

A separate `COUNT` followed by unrestricted `DELETE` is not enforcement. Use engine-appropriate
transaction isolation/locking or a bounded candidate-ID manifest, with version/reference
revalidation atomically coupled to deletion when references can change. A dry-run manifest
alone can become stale. The isolation choice must be checked on the target store; PostgreSQL
Read Committed, for example, permits successive statements to see different snapshots.
Test missing filters, empty/unavailable source, cap overflow, concurrent updates and retry
budget reuse in a disposable fixture; assert protected objects remain. A cap limits blast
radius but does not establish that the selected objects are correct.

## The optional-dependency assumption

- **Symptom** — a dependency everyone called optional went down, and the request path with it.
- **Mechanism** — the classification lived in a document while the code called it
  synchronously, with a timeout as long as the whole request budget and no fallback branch.
- **Where it hides** — an enrichment call with no fallback; a feature-flag service consulted
  per request; an audit write on the request path; an authorisation cache falling through to
  a synchronous call.
- **Discriminator** — verify which operations can legitimately succeed without this result.
  Required authorization or audit durability may correctly block completion; calling them
  optional does not authorize bypass. Compare the accepted degraded contract with actual behavior.
- **Owner** — `failure-models` (availability arithmetic); `cascading-failures` (criticality).

## The second-system effect

- **Symptom** — the replacement is more general, more distributed and less reliable than what
  it replaces, and the migration does not finish.
- **Mechanism** — the rewrite is designed against the old system's known limitations and
  imagined future requirements rather than its operational behaviour. Each new boundary adds a
  partial-failure surface the monolith did not have. Multiplying marginal availabilities
  requires independence assumptions; shared causes and fallback change that arithmetic.
- **Where it hides** — more services than teams; a queue between two components always
  deployed together; a first milestone that is a framework; "we will need this later".
- **Owner** — `architecture-decision-making` and `distribution-boundaries` (whether the
  boundary should exist); `failure-models` (pricing it).

## Split-brain

- **Symptom** — two instances both believe they hold the lock, the lease or the leadership:
  two writers, interleaved updates, or the same job running twice.
- **Mechanism** — a lock with a TTL is a lease. Its service may serialize acquisition while
  the lease is valid, but a holder can stall past expiry — a long GC pause, descheduling or a
  partition — and resume after a successor is admitted. A protected resource outside the
  lease service cannot reject that stale holder without a fencing/version check it enforces.
- **Where it hides** — a Redis lock released without an owner check; a scheduled job guarded
  only by a lock with no fencing; a lock duration shorter than the job's real runtime.
- **Discriminator** — inspect grant IDs/epochs and which writes the protected resource
  accepted. Two processes claiming leadership in logs is not proof of two valid authorities;
  effective fencing can reject the stale one.
- **Owner** — `distributed-locks-and-leases` (fencing tokens); `consensus-and-quorums`.

## Clock skew

- **Symptom** — negative durations, events ordered wrongly across hosts, leases expiring early
  or late, tokens rejected as not-yet-valid, a metric that jumps backwards.
- **Mechanism** — wall clocks differ and synchronization daemons may slew or, under configured
  conditions, step corrections. Cross-host timestamp subtraction includes offset and network
  asymmetry; local interval timing with `System.currentTimeMillis()` can include wall-clock
  adjustment. Monotonic clocks measure local elapsed time but are not comparable across hosts.
- **Where it hides** — last-writer-wins keyed only on wall time; latency as
  `receivedAt − sentAt`; lease correctness assuming an unstated maximum clock error; a
  relative timeout reset at every hop so total work exceeds the original budget.
- **Owner** — `timeouts-and-deadlines` (propagate one budget/deadline with explicit clock and
  transit assumptions; use a monotonic source for local elapsed time);
  `distributed-locks-and-leases` (clock assumptions behind lease expiry).

## Control-plane/data-plane coupling

- **Symptom** — established data requests fail or instances restart during an outage in
  discovery, identity, configuration or orchestration.
- **Mechanism** — the request path depends synchronously on control-plane freshness. This may
  be unnecessary coupling or a required correctness/authorization constraint; a last-known-good
  snapshot is an alternative only within its accepted freshness, revocation and authority contract.
- **Where it hides** — per-request feature-flag or discovery fetch, startup refusing cached
  config, credential refresh with no overlap, readiness tied to a remote control plane.
- **Discriminator** — existing endpoints/data remain healthy while control operations fail;
  a canary using cached state may demonstrate continued availability, not correct authorization
  or current ownership. Check the protected operation's contract before treating fail-closed
  behavior as a defect or widening cached-state use.
- **Owner** — `failure-models`, `caching-strategies`, and
  `kubernetes-service-lifecycle` for lifecycle coupling.

## Source

- [PostgreSQL 18 statement snapshots and transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html)
- [RFC 7662 — token-introspection caching and stale authorization trade-offs, section 4](https://www.rfc-editor.org/rfc/rfc7662.txt)
