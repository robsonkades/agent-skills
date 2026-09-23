# Service-mesh cost and policy composition

## Compare paths

Use the same workload and placement for direct, proxied and alternative dataplane paths. Report:

- per-hop and end-to-end latency distributions;
- proxy and application CPU, memory, queueing and throttling;
- connection establishment/resumption rate and certificate rotation events;
- payload/rate/concurrency and telemetry configuration;
- error, retry, ejection and load-distribution changes.

Vendor benchmark numbers are hypotheses for capacity, not transferable results. Pin the proxy,
control-plane, kernel, TLS and telemetry versions.

Match offered load, placement, warm-up, connection reuse and payloads, and report useful completions
including timeouts/cancellations. Keep required identity, encryption and authorization comparable;
a plaintext bypass is not an isolated measurement of proxy implementation cost. Trace overlapping
spans and queue boundaries carefully: per-hop quantiles are not additive, and removing a proxy can
change routing, connection count and backend load rather than simply remove one fixed delay.

## Policy composition

Inventory timeout, retry, hedge, circuit breaking, connection-pool and outlier policies at client,
proxy, ingress and server. Compute the configured-policy attempt envelope and separately account for
transport retries; test overload and ambiguous-outcome cases. A valid object accepted by the API does not prove the intended field was
effective; use schema validation and the proxy's effective configuration.

Normalize retries versus total attempts: two client retries mean three attempts; one proxy retry
means two per incoming attempt. If both layers can fully retry, the configured envelope is 3 × 2 = 6
policy-driven backend attempts per logical call, not 3 + 2. Deadlines, retryable status, response commitment,
buffers and retry throttling can reduce it; hedges overlap in time. Count actual attempts and
backend effects, and distinguish gRPC transparent retries before application processing from
configured retries. Receiving initial gRPC response metadata commits the call for retry purposes.
A trailers-only error also travels in an HTTP/2 HEADERS frame, but may still be retryable under the
configured status, buffer and budget rules. Seeing a HEADERS frame alone does not establish retry
commitment. Neither response form proves whether the business effect committed; preserve repeat-safe
effect protection or authoritative outcome resolution. A timeout can still leave an ambiguous result.

The configured envelope is not a universal bound on physical attempts. Transparent retries may
leave the configured attempt counter unchanged; local-only attempts do not reach the backend,
while attempts rejected by the server library can still consume network/proxy resources without
application processing. Verify the implementation's separate limits and counters. grpc-java 1.84.0
retains the prior attempt count for transparent retries; do not infer application invocations or
business effects from that counter alone.

Long-lived streams need a reconnect/resume contract: proxy drain, GOAWAY, maximum connection age
and keepalive enforcement can interrupt them. Transport reconnection does not replay application
progress safely without sequence/idempotency semantics. Inspect both proxy connection legs.

Removing a workload from interception is a security and operations decision as well as a
performance change. State which identity, encryption, authorization, telemetry and traffic policy
must be replaced. Prefer the smallest scoped exception or a cheaper dataplane when it preserves the
required guarantees.

Primary references: the deployed mesh's versioned API and performance documentation,
[TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446), and the relevant proxy configuration dump.
For attempt and response-commit behavior see [gRPC retry](https://grpc.io/docs/guides/retry/).
The counter and initial-metadata commitment distinctions are visible in
[grpc-java 1.84.0 RetriableStream](https://github.com/grpc/grpc-java/blob/v1.84.0/core/src/main/java/io/grpc/internal/RetriableStream.java).
For trailers-only framing see the [gRPC HTTP/2 protocol](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md#responses);
[grpc-java 1.84.0 NettyClientStream](https://github.com/grpc/grpc-java/blob/v1.84.0/netty/src/main/java/io/grpc/netty/NettyClientStream.java)
routes end-of-stream headers to trailers and distinguishes attempts that fail before stream allocation.
