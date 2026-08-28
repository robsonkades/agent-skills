# The Java timeout surface

Every entry below pairs a knob with the failure it does **not** prevent. The second column is
the one that gets designs wrong: a team sets a timeout, sees it in the config, and assumes a
bound the knob never offered.

## `java.net.http.HttpClient` (JDK 11+)

```java
HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(500))       // TCP connect + TLS handshake
        .build();

HttpRequest request = HttpRequest.newBuilder(uri)
        .timeout(Duration.ofSeconds(2))               // this exchange, per attempt
        .GET().build();
```

| Knob                  | Bounds                      | Does not prevent                                                                                               |
| --------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `connectTimeout`      | Establishing the connection | Anything after the connection exists; a hung name resolver, which the platform resolves with no per-call bound |
| `HttpRequest.timeout` | This exchange               | Time spent consuming a streamed body after the handler returns (`BodyHandlers.ofInputStream`)                  |
| _(absent)_            | —                           | A total across redirects and client-level retries: each attempt is granted the request timeout again           |

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

The read timeout being an _inactivity_ bound rather than a _total_ bound is the most misread
setting in this list. A genuine total has to be imposed above the client: a deadline check
plus cancellation.

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

| Knob                                | Bounds                                               | Does not prevent                                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pool `connectionTimeout` (HikariCP) | Waiting to **lease** a pooled connection             | Anything after the lease. It is not a TCP connect timeout, despite the name                                                                              |
| Driver socket timeout               | Inactivity on the socket                             | Server-side execution: closing the socket does not reliably abort a statement already running, and the locks it holds stay held until the server notices |
| `Statement.setQueryTimeout`         | Statement execution, via a driver-issued cancel      | Time spent streaming a large `ResultSet` after the first rows arrive; behaviour is driver-dependent — verify it on yours                                 |
| `@Transactional(timeout = …)`       | The transaction, checked when statements are created | One statement that overruns it: the check happens at statement boundaries, not during a statement                                                        |

Sizing the pool so the lease timeout is not the binding constraint is connection-pool-sizing.

## Kafka consumer

| Knob                    | Bounds                                                           | Does not prevent                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `request.timeout.ms`    | Waiting for a broker response to one client request              | A slow handler; it is a client-to-broker bound, not a processing bound                                                               |
| `session.timeout.ms`    | Broker-side liveness, via background-thread heartbeats (KIP-62)  | A slow handler — heartbeats keep flowing while processing is stuck                                                                   |
| `heartbeat.interval.ms` | Heartbeat cadence; conventionally at or below a third of session | Nothing on its own                                                                                                                   |
| `max.poll.interval.ms`  | The gap between successive `poll()` calls                        | Nothing else — but this is the one a slow handler trips, after which the consumer leaves the group and its partitions are reassigned |
| `max.poll.records`      | Records returned per poll                                        | A single slow record                                                                                                                 |

The characteristic failure: processing outruns `max.poll.interval.ms`, the consumer is removed
from the group mid-batch, its offset commit is rejected, the partitions are reassigned, and
the batch is processed again by another member. That is a duplicate no retry in the code
explains — delivery-semantics owns that diagnosis. The fix is to bound the handler or reduce
`max.poll.records`, not to raise `request.timeout.ms`.

## Cancellation, per mechanism

| Mechanism                        | Stops the work when                                                            |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `Future.cancel(true)`            | The target checks the interrupt flag or sits in an interruptible blocking call |
| Closing the socket or connection | Always for the local resource; the peer notices on its next read or write      |
| gRPC deadline expiry             | The server observes cancellation through its `Context` and can abandon work    |
| `Statement.setQueryTimeout`      | The driver's cancel reaches the server and the server honours it               |
| _Nothing_                        | The caller stops waiting — the callee finishes the work and discards it        |

The last row is the default whenever no cancellation is wired, and it is the mechanism by
which a timeout under overload increases load instead of reducing it.
