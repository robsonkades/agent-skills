# Silent, temporal and operational patterns

Same shape: **Symptom** → **Mechanism** → **Where it hides** → **Owner**. These are the
patterns error-rate monitoring cannot show, or that appear only around a deploy or a clock.

## The absence of errors as an error

- **Symptom** — everything is green and something stopped changing: a table whose newest row
  is from yesterday, a queue at depth zero because nothing produces, an identical daily report.
- **Mechanism** — error-rate monitoring measures requests that happened. A dead consumer or a
  job that never fired makes no requests and therefore no errors. The signal that would show
  it is the **age** of something, which nothing computes unless asked.
- **Where it hides** — an exception escaping a `ScheduledExecutorService` task, which silently
  cancels all its future executions; a consumer thread killed by an unchecked exception; an
  alert defined only as `rate(errors) > x`; unmonitored consumer lag.
- **Owner** — `slo-and-alerting` (freshness alerts); `task-queues-and-competing-consumers`
  (oldest-message-age).

## Expected versus unexpected errors

- **Symptom** — an error-rate alert fires and nothing is broken, or a real incident never
  crosses the threshold. A spike traced back to one client sending malformed requests.
- **Mechanism** — client and server errors counted in one series: a 4xx rise from one bad
  caller reads as an outage, and a 5xx rise is diluted by a large 4xx baseline.
- **Where it hides** — one `http_server_requests` alert with no status-class dimension;
  business rejections mapped to 500; a handler mapping every unhandled exception to one status.
- **Owner** — `rpc-and-api-contracts` (error surface); `slo-and-alerting` (what to page on).

## Version skew during a rolling deploy

- **Symptom** — errors that start when a rollout starts and stop when it finishes, so the
  cause is never found: deserialisation failures, unknown enum values, missing fields.
- **Mechanism** — a rolling deploy runs both versions at once against one database, one topic
  and each other, so a change compatible in only one direction fails for exactly that window —
  which lasts far longer when a rollback stalls or a consumer group is half upgraded.
- **Where it hides** — a renamed field; a reused protobuf field number; a new enum constant
  emitted before consumers parse it; a migration dropping a column in the release that stops
  writing it.
- **Owner** — `rpc-and-api-contracts` (both-direction compatibility, expand-then-contract).

## Stale or obsolete work

- **Symptom** — work completes long after anyone wanted it: a notification for a cancelled
  order, an email about a superseded state, a job whose result is rejected on write.
- **Mechanism** — the task was enqueued assuming it would run soon; under backlog the deadline
  passes or the entity changes, and executing it is worse than dropping it — a wrong side
  effect plus capacity taken from work still inside its deadline.
- **Where it hides** — a queued task with no deadline and no entity version; a consumer that
  never compares `now` with the message timestamp; a DLQ redrive replaying a week-old backlog.
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
- **Owner** — this catalogue, because no other skill owns it. Three guard rails: a **dry run**
  reporting what would be removed; a **bounded batch** per execution; and an **absolute cap
  that aborts** when the predicate selects more rows than is plausible — the cap is what fails
  closed against a predicate that has silently become universal.

## The optional-dependency assumption

- **Symptom** — a dependency everyone called optional went down, and the request path with it.
- **Mechanism** — the classification lived in a document while the code called it
  synchronously, with a timeout as long as the whole request budget and no fallback branch.
- **Where it hides** — an enrichment call with no fallback; a feature-flag service consulted
  per request; an audit write on the request path; an authorisation cache falling through to
  a synchronous call.
- **Owner** — `failure-models` (availability arithmetic); `cascading-failures` (criticality).

## The second-system effect

- **Symptom** — the replacement is more general, more distributed and less reliable than what
  it replaces, and the migration does not finish.
- **Mechanism** — the rewrite is designed against the old system's known limitations and
  imagined future requirements rather than its operational behaviour. Each new boundary adds a
  partial-failure surface the monolith did not have, and series availability multiplies down.
- **Where it hides** — more services than teams; a queue between two components always
  deployed together; a first milestone that is a framework; "we will need this later".
- **Owner** — `architecture-decision-making` and `distribution-boundaries` (whether the
  boundary should exist); `failure-models` (pricing it).

## Split-brain

- **Symptom** — two instances both believe they hold the lock, the lease or the leadership:
  two writers, interleaved updates, or the same job running twice.
- **Mechanism** — a lock with a TTL is a lease, and a lease alone does not exclude. The holder
  can stall past expiry — a long GC pause, a descheduled container, a partition — and keep
  writing while a second holder is admitted, with no error anywhere. Mutual exclusion is not
  guaranteed across a pause without a fencing token the protected resource itself enforces.
- **Where it hides** — a Redis lock released without an owner check; a scheduled job guarded
  only by a lock with no fencing; a lock duration shorter than the job's real runtime.
- **Owner** — `distributed-locks-and-leases` (fencing tokens); `consensus-and-quorums`.

## Clock skew

- **Symptom** — negative durations, events ordered wrongly across hosts, leases expiring early
  or late, tokens rejected as not-yet-valid, a metric that jumps backwards.
- **Mechanism** — wall-clock time on two hosts differs, and NTP corrects by stepping, so one
  host's clock can also move backwards. Anything subtracting timestamps from different
  machines, or timing an interval with `System.currentTimeMillis()`, inherits that error.
- **Where it hides** — an absolute deadline timestamp on the wire instead of a remaining
  duration; last-writer-wins keyed on wall-clock time; latency as `receivedAt − sentAt`.
- **Owner** — `timeouts-and-deadlines` (send a duration, convert against a monotonic source);
  `distributed-locks-and-leases` (clock assumptions behind lease expiry).
