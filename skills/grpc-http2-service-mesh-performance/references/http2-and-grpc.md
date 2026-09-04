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

## Flow-control diagnosis

Capture negotiated settings, connection and stream window updates, active/pending streams, bytes,
event-loop utilization, socket signals and backend service time. A stream can wait despite spare
stream slots because its own window, the connection window, the event loop, socket or backend is
the actual constraint.

Derive an initial window experiment from bandwidth-delay product, then bound it by active-stream
memory. Keep frame size, maximum concurrent streams and both flow-control levels as separate
variables. Validate by observing fewer stalls and higher goodput without memory or tail regression.

## Runtime review

- Reuse stubs/channels and close them during service shutdown.
- Do not block a Netty event loop with application or file/database work.
- Attribute direct-buffer growth outside the Java heap and verify allocator/leak evidence.
- Propagate deadlines as remaining time and cancel abandoned work.
- Record unary, client-streaming, server-streaming and bidirectional calls separately.
- Benchmark encoding with representative schemas and payload distributions; bytes alone do not
  capture allocation, copies or CPU.

Primary references: [RFC 9113](https://www.rfc-editor.org/rfc/rfc9113),
[gRPC performance practices](https://grpc.io/docs/guides/performance/), and
[gRPC deadlines](https://grpc.io/docs/guides/deadlines/).
