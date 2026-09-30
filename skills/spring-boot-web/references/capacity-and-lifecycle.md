# Capacity and lifecycle

Read for latency/throughput, Tomcat, virtual threads, timeout, compression, quota, admission or
pool questions. A configuration value is a hypothesis about a workload and resource budget.
Do not copy a YAML block and call it tuning.

## Establish the bottleneck

Record arrival rate and burst shape, in-flight requests, latency distribution, errors,
CPU including container quota, allocation/GC, blocking durations and downstream saturation.
Inspect the actual Boot/Java/Tomcat versions and executor customizations. For each relevant
pool, measure active/idle/pending work, acquisition time and resource hold time. Include all
replicas and background jobs in the database's global connection budget.

| Evidence                                                         | Candidate decision                                                               | Condition that changes it                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Many independent blocking waits, CPU headroom, worker scarcity   | Trial virtual request threads on a supported JDK, retaining downstream admission | Database/network already saturated: reduce work or bound admission before increasing waiting requests |
| CPU quota saturated, hashing/serialization/compression dominates | Bound CPU parallelism, reduce work or add justified capacity                     | If evidence instead shows blocking/worker starvation, revisit executor choice                         |
| Hikari waiting, database healthy and global capacity available   | Investigate hold time/transactions and cautiously test a pool adjustment         | Slow SQL/locks or global connection exhaustion: a larger pool can amplify pressure                    |
| Queue grows while completions plateau                            | Bound admitted work and reject/degrade within the contract                       | Brief tolerable bursts with spare downstream capacity may justify a measured small buffer             |
| Idle-to-burst acquisition dominates                              | Compare maintained idle capacity against connection cost and deployment budget   | Steady traffic or expensive idle connections can favor another minimum-idle policy                    |

Do not pool virtual threads to enforce a concurrency ceiling: use a bounded semaphore,
bulkhead or admission policy around the resource. Bound the wait to obtain that permit,
release it on every terminal path and decide rejection behavior. Thousands of cheap waiting
threads still retain request objects, deadlines and downstream demand. Virtual threads do not
increase CPU cores, connection capacity or lock throughput.

## Quotas, rate and concurrency solve different problems

Investigate limits when public/partner exposure, abuse, per-call cost, fairness or an agreed
consumer quota justifies them. Inspect gateway policies, routing and enforcement evidence
first, including internal paths that bypass the gateway. Reuse an adequate existing policy;
do not create an application limiter or Redis dependency for a routine controller change.
When the quota is undocumented, ask its owner about the contractual unit and scope, with a
recommendation to enforce it at the existing trusted entry point when that meets the need.
Continue independent endpoint work without inventing numerical limits or a fail-open policy.

| Need established by evidence                             | Control to assess                                                       | What it does not establish                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Limit arrivals/cost per caller over time                 | Rate/quota policy, often at the gateway                                 | A safe number of simultaneous slow downstream operations                    |
| Protect finite connections/CPU or isolate expensive work | Bounded in-flight work and bounded permit wait at the resource boundary | A contractual per-tenant rate or daily usage allowance                      |
| A demand-aware stream risks unbounded producer buffering | Backpressure through the supporting pipeline, with bounded buffers      | Automatic protection for ordinary Servlet handlers or a blocking dependency |

A quota decision includes trusted identity/key (tenant, client, operation or weighted work),
time window/refill, allowed burst, replica sharing, response/retry policy and owner. IP may
group unrelated callers or change behind proxies; an unverified tenant header is not a trusted
key. Decide whether rejected/failed attempts consume budget. Independent in-memory counters
on each replica cannot promise a single shared quota unless that aggregate policy is explicit.
If shared state is justified, account for atomic updates, key lifecycle/cardinality, provider
latency and outage behavior; adding a distributed store does not choose these policies.

For caller-rate rejection, document 429 and any meaningful Retry-After value at the enforcing
boundary. Global overload may instead use the established 503 policy; do not classify every
permit timeout as a caller quota violation. State which layer owns headers/body and whether
gateway errors differ from MVC Problem Details. Reusing a gateway does not make its operation
someone else's undocumented problem: retain its policy reference and relevant verification.

When implemented or changed, exercise the limit and burst boundary, independent callers and
tenants, concurrent requests across replicas, reset/refill and the chosen provider-failure
behavior. Confirm rejected work produces no business side effects and no unbounded waiting.
Use controlled time where supported instead of sleep-based timing guesses. For concurrency
controls, verify permit release after success, failure, timeout and cancellation; observe
saturation/recovery without tenant IDs or unbounded caller values as metric labels.

## Match the knob to the mechanism

- `spring.threads.virtual.enabled` is a Boot integration switch on compatible Java; inspect
  which executors it actually supplies. Custom executors may change that composition.
- With virtual threads enabled, Boot's `server.tomcat.threads.max` and `min-spare` do not
  control virtual workers. With platform threads, sizing remains workload/queue dependent.
- Tomcat `max-connections` is about connections, `accept-count` about the connector's listen
  backlog; neither is a database bulkhead. HTTP/2 multiplexing further separates connection
  count from concurrent operations. Inspect the exact connector/protocol semantics.
- A JDBC pool and outbound HTTP connection pool own different resources. Size them using
  measured resource occupancy and backend limits, not the servlet thread count. A connection
  pool wait timeout is not a query timeout or request deadline.
- Compression trades bytes for CPU; test representative payload sizes and compressibility.
  HTTP/2 requires checking the full client/proxy/server path, not just setting a property.

Do not adopt `maximum-pool-size: 20`, `minimum-idle: 0` or acquisition `250ms` as defaults
for all deployments. Hikari's minimum accepted acquisition timeout does not define an SLO.
Derive limits from load, service budgets and downstream capacity, with a measured baseline.

## Time budget and terminal paths

Separate request-header/body reads, idle keep-alive, Servlet async timeout, permit wait,
connection acquisition, connect/read to downstream, query/lock and end-to-end deadline.
Document units, when the timer starts, what gets cancelled and what can continue running.
Tomcat connection timeout is not a universal maximum request execution duration.

Propagate remaining budget rather than granting a fresh full timeout at every nested call.
Avoid an automatic retry when time has already expired; classify idempotency and failure
before retrying. On timeout/disconnect/shutdown, close owned streams, cancel cooperative work,
release permits/connections and clean context. Record limits when a library cannot interrupt
an in-progress operation; the user-facing timeout alone does not establish resource release.

Check graceful shutdown against ingress draining and the actual long-running request types.
Virtual threads are daemon threads; use Boot keep-alive only when needed to keep a process
alive for its lifecycle, not as a capacity setting.

Verify changes with representative load including saturation/recovery and the same workload
and environment before/after. Observe p95/p99, completions, errors, queueing and resource cost;
do not claim scalability from a faster single request. Keep a working setup if no evidence
supports a bottleneck or contract violation.

Sources: [Boot property contracts](https://docs.spring.io/spring-boot/appendix/application-properties/index.html),
[Boot task execution](https://docs.spring.io/spring-boot/reference/features/task-execution-and-scheduling.html),
[Tomcat HTTP connector](https://tomcat.apache.org/tomcat-11.0-doc/config/http.html),
[429 semantics, RFC 6585](https://www.rfc-editor.org/rfc/rfc6585.html#section-4),
[Retry-After and 503 semantics, RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html),
[JEP 444](https://openjdk.org/jeps/444),
[Hikari configuration](https://github.com/brettwooldridge/HikariCP#configuration-knobs-baby).
