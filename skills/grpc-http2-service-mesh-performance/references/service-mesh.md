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
proxy, ingress and server. Compute the maximum attempts reaching the backend and test overload and
ambiguous-outcome cases. A valid object accepted by the API does not prove the intended field was
effective; use schema validation and the proxy's effective configuration.

Normalize retries versus total attempts: two client retries mean three attempts; one proxy retry
means two per incoming attempt. If both layers can fully retry, the configured envelope is 3 × 2 = 6
backend attempts per logical call, not 3 + 2. Deadlines, retryable status, response commitment,
buffers and retry throttling can reduce it; hedges overlap in time. Count actual attempts and
backend effects, and distinguish gRPC transparent retries before application processing from
configured retries. Response headers commit a gRPC call for retry purposes; this is not proof that
the business effect has or has not committed. A timeout can still leave an ambiguous result.

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
