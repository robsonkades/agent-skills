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

| Knob                  | Bounds                                                                                                                   | Does not prevent                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `connectTimeout`      | Establishing the connection                                                                                              | Anything after the connection exists; a hung name resolver, which the platform resolves with no per-call bound |
| `HttpRequest.timeout` | At least execution through response construction; current JDK built-in implementation through body-subscriber completion | Caller work after a streaming body is returned, and arbitrary application retry policy                         |
| _(absent)_            | —                                                                                                                        | Any finite request bound; the specified behavior is effectively infinite                                       |

The two are independent. A client built with only `connectTimeout` has no bound against a
server that accepts the connection and then never answers — the most common production stall
shape. Prefer setting `HttpRequest.timeout` over relying on cancelling the
`CompletableFuture` returned by `sendAsync`; the timeout is the bound the client documents.

## Spring `RestClient` / `RestTemplate`

Both delegate to a `ClientHttpRequestFactory`. Spring Boot exposes the two values it can set
uniformly across factories as `spring.http.client.connect-timeout` and
`spring.http.client.read-timeout`; the programmatic route is
`ClientHttpRequestFactorySettings`.

| Knob               | Bounds                                      | Does not prevent                                                                                                           |
| ------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| connect timeout    | Establishing the connection                 | A server that connects and then stalls                                                                                     |
| read timeout       | **Inactivity between reads**, not the total | A server dribbling one byte per interval — the read timeout never fires and the call runs indefinitely                     |
| pool lease timeout | Waiting for a connection from the pool      | Anything once leased; it also fires before a byte is sent, so it reads as a downstream failure when it is a local shortage |

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

| Knob                                                   | Bounds                                                              | Does not prevent                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Pool `connectionTimeout` (HikariCP)                    | Waiting to **lease** a pooled connection                            | Anything after the lease. It is not a TCP connect timeout, despite the name           |
| `Connection.setNetworkTimeout` / driver socket timeout | Driver wait for database request/network activity, vendor-dependent | A guaranteed database execution/lock deadline after connectivity is lost              |
| `Statement.setQueryTimeout`                            | Driver wait for statement execution in seconds                      | Uniform batch/result-stream behavior; driver may also apply it to `ResultSet` methods |
| Database statement timeout                             | Server execution according to vendor semantics                      | Pool acquisition, client DNS/connect or transaction work outside that statement       |
| Spring transaction timeout                             | Framework transaction policy, often applied to resource operations  | Guaranteed asynchronous interruption of arbitrary current Java/server work            |

Sizing the pool so the lease timeout is not the binding constraint is connection-pool-sizing.

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

| Mechanism                        | Stops the work when                                                            |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `Future.cancel(true)`            | The target checks the interrupt flag or sits in an interruptible blocking call |
| Closing the socket or connection | Releases the local resource; peer detection and server-work termination vary   |
| gRPC deadline expiry             | The server observes cancellation through its `Context` and can abandon work    |
| `Statement.setQueryTimeout`      | The driver's cancel reaches the server and the server honours it               |
| _Nothing_                        | The caller stops waiting — the callee finishes the work and discards it        |

All mechanisms race completion and may leave an unknown business outcome. The last row is the
default whenever no cancellation is wired, and it is how timeouts plus retries can increase load.

## Verification matrix

Test each named phase independently: pool acquisition, DNS/proxy, TCP/TLS, request upload,
response headers, slow/dribbling body, JDBC execution/result streaming and cancellation. Record
caller release, connection/pool return, callee cancellation observation, database session/lock
release and committed business outcome. Documentation gives API intent; only the deployed JDK,
HTTP implementation, driver, database and framework versions establish operational behavior.
