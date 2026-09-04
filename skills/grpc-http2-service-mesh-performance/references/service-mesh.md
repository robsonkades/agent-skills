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

## Policy composition

Inventory timeout, retry, hedge, circuit breaking, connection-pool and outlier policies at client,
proxy, ingress and server. Compute the maximum attempts reaching the backend and test overload and
ambiguous-outcome cases. A valid object accepted by the API does not prove the intended field was
effective; use schema validation and the proxy's effective configuration.

Removing a workload from interception is a security and operations decision as well as a
performance change. State which identity, encryption, authorization, telemetry and traffic policy
must be replaced. Prefer the smallest scoped exception or a cheaper dataplane when it preserves the
required guarantees.

Primary references: the deployed mesh's versioned API and performance documentation,
[TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446), and the relevant proxy configuration dump.
