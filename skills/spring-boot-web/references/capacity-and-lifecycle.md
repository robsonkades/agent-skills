# Capacity and lifecycle

Read for latency/throughput, Tomcat, virtual threads, timeout, compression, admission or
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
[JEP 444](https://openjdk.org/jeps/444),
[Hikari configuration](https://github.com/brettwooldridge/HikariCP#configuration-knobs-baby).
