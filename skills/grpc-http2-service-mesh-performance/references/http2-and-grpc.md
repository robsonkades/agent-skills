# HTTP/2 and gRPC mechanics

## Keep the units distinct

| Unit                 | What it owns                           | Typical misleading metric                 |
| -------------------- | -------------------------------------- | ----------------------------------------- |
| gRPC channel         | resolver, policy and call abstraction  | channel count as connection capacity      |
| transport connection | TLS/socket and connection flow control | connection count as request balance       |
| HTTP/2 stream        | one multiplexed exchange               | stream count as independent network paths |
| event loop/executor  | runnable protocol/application work     | low thread count as proof of saturation   |

A channel may create one or more connections, and a connection carries many streams. Confirm the
deployed library's behavior rather than encoding a universal mapping.
An active streaming RPC attempt occupies a stream until it finishes; retries/hedges add attempts.
A terminating HTTP proxy has its own upstream pools: extra client channels need not create extra
backend connections or fix backend skew. Observe actual connections and selected endpoints.

## Flow-control diagnosis

Capture negotiated settings, connection and stream window updates, active/pending streams, bytes,
event-loop utilization, socket signals and backend service time. A stream can wait despite spare
stream slots because its own window, the connection window, the event loop, socket or backend is
the actual constraint.

Derive an initial window experiment from bandwidth-delay product, then bound it by active-stream
memory. Keep frame size, maximum concurrent streams and both flow-control levels as separate
variables. Validate by observing fewer stalls and higher goodput without memory or tail regression.

HTTP/2 flow control is receiver-advertised, directional and hop-local. DATA consumes both stream
and connection credit; SETTINGS_INITIAL_WINDOW_SIZE changes stream windows, while connection
credit is changed with WINDOW_UPDATE. It does not throttle HEADERS/control frames. Identify which
peer's setting limits outgoing traffic; SETTINGS_MAX_CONCURRENT_STREAMS is a separate peer limit.
The same tuning key may map differently in a proxy/transport or enable automatic window tuning.

Multiplexing does not remove TCP head-of-line blocking from loss on a shared connection. Conversely,
pending calls may be waiting for stream slots, name resolution, connectivity or admission rather
than DATA credit. Frame/window evidence must distinguish those cases. BDP is a starting hypothesis,
not a formula for applying the full connection budget independently to every stream.

For streaming, transport credit and application message demand/readiness are separate. A write
accepted by the API need not have reached the peer. Bound producer buffering, respect readiness,
and test slow readers; both peers writing while neither reads can stall or deadlock.

## Runtime review

- Reuse stubs/channels. Stubs are not closeable connections; the ManagedChannel owner initiates
  shutdown, awaits bounded termination, and escalates cancellation when needed. Close owned custom
  executors/event-loop groups according to the transport contract; shared ones need shared ownership.
- Distinguish Netty transport event loops from gRPC callback/application executors. directExecutor
  can run application callbacks on transport threads; blocking them can stall unrelated streams.
  A channel pool may still share those same executors/event loops, so measure the actual bottleneck.
- Attribute direct-buffer growth outside the Java heap and verify allocator/leak evidence.
- Set deadlines from the caller's remaining budget; gRPC has no deadline by default. Include
  connectivity/wait-for-ready and stream-slot queues in the budget. Java can propagate deadlines
  through gRPC Context, but async context loss or other APIs need explicit propagation. Cancellation
  requires server/application cooperation and does not roll back an already committed effect.
- Record unary, client-streaming, server-streaming and bidirectional calls separately.
- Benchmark encoding with representative schemas and payload distributions; bytes alone do not
  capture allocation, copies or CPU.

Primary references: [RFC 9113](https://www.rfc-editor.org/rfc/rfc9113),
[gRPC performance practices](https://grpc.io/docs/guides/performance/), and
[gRPC deadlines](https://grpc.io/docs/guides/deadlines/).
For Java-specific executor/ownership behavior inspect
[ManagedChannelBuilder](https://grpc.github.io/grpc-java/javadoc/io/grpc/ManagedChannelBuilder.html)
(served as grpc-java 1.84.0 when reviewed), and the deployed transport API.
See [gRPC streaming flow control](https://grpc.io/docs/guides/flow-control/) for read/write readiness;
manual streaming API advice does not mean unary HTTP/2 DATA is exempt from protocol flow control.
