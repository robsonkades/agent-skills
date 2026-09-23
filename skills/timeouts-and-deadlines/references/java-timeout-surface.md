# The Java timeout surface

Every entry below pairs a knob with the failure it does **not** prevent. The second column is
the one that gets designs wrong: a team sets a timeout, sees it in the config, and assumes a
bound the knob never offered.

## `java.net.http.HttpClient` (JDK 11+)

```java
HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(500))       // connection establishment
        .build();

HttpRequest request = HttpRequest.newBuilder(uri)
        .timeout(Duration.ofSeconds(2))               // this request
        .GET().build();
```

| Knob                  | Bounds                                                                                                              | Does not prevent                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `connectTimeout`      | Establishing the connection                                                                                         | Anything after the connection exists; a hung name resolver, which the platform resolves with no per-call bound |
| `HttpRequest.timeout` | JDK 25 built-in implementation: request through response headers; JDK 26 extends through body-subscriber completion | JDK 25 body stalls, arbitrary application retry policy and caller processing after body consumption            |
| _(absent)_            | —                                                                                                                   | Any finite request bound; the specified behavior is effectively infinite                                       |

The two are independent. A client built with only `connectTimeout` has no bound against a
server that accepts the connection and then never answers. Set `HttpRequest.timeout`, then
verify the scope on the deployed implementation. On JDK 25, a server can send headers promptly
and stall the body even with `BodyHandlers.ofString()`. Enforce the remaining outer lifetime
across body consumption and wire cancellation to the original exchange or stream. Merely adding
`orTimeout` changes future completion; it does not abort the exchange and can leave that future
already completed when a later `cancel` is attempted. Streaming bodies must be consumed or
closed/cancelled by their owner. JDK 26's wider timer does not remove that ownership requirement.

## Spring `RestClient` / `RestTemplate`

Both delegate to a `ClientHttpRequestFactory`. For example, Spring Boot 3.5 exposes
`spring.http.client.connect-timeout` and
`spring.http.client.read-timeout`; the programmatic route is
`ClientHttpRequestFactorySettings`.

| Knob               | Bounds                                          | Does not prevent                                                                                                           |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| connect timeout    | Establishing the connection                     | A server that connects and then stalls                                                                                     |
| read timeout       | Factory/version-specific read or response phase | When it is inactivity-based, dribbling bytes can keep it alive without a total bound                                       |
| pool lease timeout | Waiting for a connection from the pool          | Anything once leased; it also fires before a byte is sent, so it reads as a downstream failure when it is a local shortage |

Whether a read timeout is socket inactivity or a broader response bound depends on the selected
request factory/client and version. A genuine end-to-end total must be imposed and fault-tested
above phase knobs: deadline plus cancellation/resource cleanup.

`new RestTemplate()` and a hand-rolled `RestClient.create()` bypass the Boot-configured
builder, inheriting neither these properties nor the observability wiring. Grep for both
shapes before believing the configuration.

## JDBC, the driver and the pool

```java
try (PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setQueryTimeout(2);   // seconds; asks the driver to cancel the running statement
    ...
}
```

| Knob                                | Bounds                                                             | Does not prevent                                                                      |
| ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Pool `connectionTimeout` (HikariCP) | Waiting to **lease** a pooled connection                           | Anything after the lease. It is not a TCP connect timeout, despite the name           |
| `Connection.setNetworkTimeout`      | Waiting for a database reply; expiry closes the connection         | A guaranteed database execution/lock deadline after connectivity is lost              |
| Driver socket timeout               | Vendor-specific network wait                                       | Uniform closure, cancellation or transaction-recovery semantics across drivers        |
| `Statement.setQueryTimeout`         | Driver wait for statement execution in seconds                     | Uniform batch/result-stream behavior; driver may also apply it to `ResultSet` methods |
| Database statement timeout          | Server execution according to vendor semantics                     | Pool acquisition, client DNS/connect or transaction work outside that statement       |
| Spring transaction timeout          | Framework transaction policy, often applied to resource operations | Guaranteed asynchronous interruption of arbitrary current Java/server work            |

Treat JDBC network timeout as a connection-failure backstop, normally longer than query/transaction
limits so ordinary cancellation can run first. Configure it before dispatch: changes do not affect
outstanding requests. On expiry, the connection and its statements become unusable; ensure the pool
discards/replaces that physical connection. Query cancellation with a healthy network need not close
them, but resolve any active transaction before reuse. Check vendor socket settings independently.

For an already-stuck request, use supported `Statement.cancel` or `Connection.abort` with explicit
resource ownership; a late `setNetworkTimeout` is not cancellation. `SQLTimeoutException` from
statement execution establishes an attempted cancel, not remote termination or rollback.

Whether pool capacity, admission or the lease policy should change belongs to connection-pool-sizing;
removing lease timeouts by enlarging the pool can overload the database.

## Kafka consumer

| Knob                                                         | Bounds                                              | Does not prevent                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `request.timeout.ms`                                         | Waiting for a broker response to one client request | A slow handler; it is a client-to-broker bound, not a processing bound                    |
| `session.timeout.ms` / broker consumer-session timeout       | Group liveness; owner depends on group protocol     | Application processing budget; static membership can defer reassignment after poll expiry |
| `heartbeat.interval.ms` / broker consumer-heartbeat interval | Heartbeat cadence; owner depends on protocol        | Processing completion or request timeout                                                  |
| `max.poll.interval.ms`                                       | Gap between successive `poll()` calls               | Handler cancellation; dynamic/static reassignment timing differs                          |
| `max.poll.records`                                           | Records returned per poll                           | A single slow record                                                                      |

The characteristic failure is processing outrunning the poll interval, loss/eventual loss of
partition ownership, failed commit and duplicate processing after reassignment. Static members
may retain assignment until session expiry; the consumer group protocol moves heartbeat/session
configuration to the broker. Bound processing/poll cadence, pause partitions or hand off safely,
and make effects repeat-safe—raising `request.timeout.ms` targets the wrong phase.

## Cancellation, per mechanism

| Mechanism                        | Stops the work when                                                               |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `Future.cancel(true)`            | The target exits/unwinds on interruption; checking the flag alone is insufficient |
| Closing the socket or connection | Releases the local resource; peer detection and server-work termination vary      |
| gRPC deadline expiry             | The server observes cancellation through its `Context` and can abandon work       |
| `Statement.setQueryTimeout`      | The driver's cancel reaches the server and the server honours it                  |
| _No cancellation wired_          | Caller wait can end while callee work continues, including committing effects     |

All mechanisms race completion and may leave an unknown business outcome. A cancelled future does
not establish when its task exits or releases resources. The last row is the
default whenever no cancellation is wired, and it is how timeouts plus retries can increase load.

The Future row assumes an implementation that interrupts its task (for example FutureTask).
Plain CompletableFuture cancellation does not use `mayInterruptIfRunning` to interrupt the
computation; `orTimeout` completes the future exceptionally without stopping the supplier.
Specialized client futures may override cancellation behavior. Wire ownership explicitly.

Unit conversion is part of the policy: JDBC query timeout is integer seconds and zero means
unlimited. A positive sub-second remainder must not be truncated to zero. Either refuse work,
use a finer-grained supported limit, or retain an independently enforced outer deadline while
documenting any rounded-up server/driver timeout. Check range and sentinel semantics before casts.

## Verification matrix

Select relevant phases and test them independently: pool acquisition, DNS/proxy, TCP/TLS, request upload,
response headers, slow/dribbling body, JDBC execution/result streaming and cancellation. Record
caller release, connection/pool return, callee cancellation observation, database session/lock
release and committed business outcome. Documentation gives API intent; only the deployed JDK,
HTTP implementation, driver, database and framework versions establish operational behavior.
For JDBC, exercise query cancellation and network expiry separately, checking transaction recovery
and pool replacement rather than treating every timeout as a reusable-connection outcome.

## Primary references

- [Spring Boot 3.5 HTTP clients](https://docs.spring.io/spring-boot/3.5/reference/io/rest-client.html) — builder and request-factory configuration.
- [CompletableFuture](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html) — cancellation and timeout completion are not task interruption.
- [JDBC `Connection.setNetworkTimeout`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.sql/java/sql/Connection.html#setNetworkTimeout(java.util.concurrent.Executor,int)>) — closure, ordering and no effect on outstanding requests.
- [JDBC `Statement.executeQuery`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.sql/java/sql/Statement.html#executeQuery(java.lang.String)>) — timeout exceptions require an attempted cancellation.
- [OpenJDK 25 `MultiExchange`](https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/java.net.http/share/classes/jdk/internal/net/http/MultiExchange.java) — request timer cancelled before response-body reading in this baseline.
- [JDK 26 `HttpRequest.Builder.timeout`](<https://docs.oracle.com/en/java/javase/26/docs/api/java.net.http/java/net/http/HttpRequest.Builder.html#timeout(java.time.Duration)>) — body-subscriber completion coverage is explicitly documented for the JDK 26 built-in implementation.
