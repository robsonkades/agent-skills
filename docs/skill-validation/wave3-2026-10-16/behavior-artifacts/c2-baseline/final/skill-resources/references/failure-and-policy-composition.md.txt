# Failure surface and policy composition

## Diagnose the hop, not just the upstream

| Observation                                       | Candidate explanation                          | Evidence to distinguish it                                               |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Loopback connection refused                       | Proxy stopped, wrong port or listener binding  | Listener state, effective config, proxy restart history                  |
| Several upstreams slow together                   | Proxy saturation or shared downstream problem  | App/proxy timing, pending requests, CPU throttling and upstream timing   |
| One logical request has several upstream attempts | Retries in one or more layers                  | Correlated attempt logs and effective retry policies, including SDK/mesh |
| Local 503 with no upstream request                | Route miss, no healthy host or local rejection | Proxy response details, route version and host health                    |
| Requests succeed after policy failure             | An alternate path bypassed enforcement         | Actual destination and authenticated identity, not just status code      |

These are hypotheses, not diagnoses. Match request populations and time windows before
comparing metrics. The general two-container lifecycle matrix belongs to `sidecar-pattern`.

For independent mandatory components, availabilities multiply (two 99.9% components give
about 99.8%). Shared pod failures and degraded paths invalidate that simple model; measure
proxy-attributable errors rather than presenting the product as a prediction.

## Assign owners and contracts

| Concern            | Contract to record                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Retry              | Owner, retryable operations/failures, total attempt bound and replayability                       |
| Deadline           | App deadline, proxy total/per-attempt ceilings, queue/backoff accounting and cancellation         |
| Breaker            | Scope of the observed failures; a per-pod breaker sees only that pod's traffic                    |
| TLS                | Termination on each hop, trust roots, peer identity/SAN verification, SNI and credential rotation |
| Load balancing     | Which layer selects the real upstream and which merely selects a local listener                   |
| Operation identity | App supplies stable intent identity; server enforces deduplication atomically                     |

Do not automatically retry non-idempotent operations. A POST that can commit before its
response is lost needs a verified idempotency contract before proxy replay: key scope,
retention through the retry window, concurrent duplicate handling, payload mismatch behavior
and replayed result. A timeout does not prove the operation failed. Streaming bodies also need
explicit replay support and bounded buffering. See `retries-and-backoff` for retry policy design.

TLS may terminate in the app, proxy, or on both separate hops; two TLS hops are not inherently
a misconfiguration. TLS pass-through preserves encryption to the upstream but removes HTTP
routing visibility. For proxy-originated TLS, encryption alone does not establish peer identity:
configure certificate chain and name validation. Do not silently disable those checks for failover.

### Address and identity

Record four separate values: connection address, HTTP `Host`/`:authority`, upstream TLS SNI,
and the certificate identity the TLS client verifies. They can differ deliberately, but the
mapping must preserve the upstream's virtual-host and authentication contract. For example,
connecting to `127.0.0.1:15001` does not establish that `payments.example` remains the request
authority. Changing a signed authority or path can also invalidate application signatures.

A local reverse-proxy URL needs explicit upstream authority/identity handling; a client
configured with a forward proxy can retain the origin URL and use CONNECT for an HTTPS tunnel.
Verify the client's actual proxy support. A CONNECT tunnel carrying end-to-end TLS does not
give the ambassador visibility into the encrypted HTTP request.

For TLS origination, configure a trusted destination-to-identity mapping. Setting SNI alone
does not enable certificate verification. In Envoy, automatic SNI and automatic SAN validation
are separate options and may derive values from request headers; validate the destination
before relying on that mechanism. A valid certificate for an attacker-chosen host does not
make that host an authorized destination. Never fix a localhost/authority mismatch by disabling
name verification. Test wrong-name certificates signed by a trusted CA, forged authority and
the legitimate upstream virtual host, checking both acceptance and rejection paths.

## Count actual pools

The estimate `pods × m` holds only when `m` is the total upstream connections per identical
pod for the population being counted. Sum across replicas and actual pool partitions
(upstream hosts, worker threads, protocol, priority and TLS identity, as applicable); include
rollout surge and draining connections. A per-pool limit is not necessarily a pod-wide cap.

HTTP/2 can multiplex streams, but stream limits, flow control and additional connection
creation still matter. TCP pass-through does not imply HTTP multiplexing. Loopback pools
also consume sockets, buffers and queue capacity; making them arbitrarily small can throttle
the app. Measure connections, active streams, pending requests and queue wait at both hops.
Use `connection-pool-sizing` for sizing and `littles-law-and-queueing` for queue arithmetic.

## Deadline and trace propagation

### Java client compatibility

This skill declares no Java execution baseline and includes no executable Java example;
its routing contracts are language-independent. Before changing Java client code, inspect
Maven/Gradle release and toolchain settings, resolved HTTP/gRPC dependencies, CI and runtime
images. Keep the project's Java and client versions; applying this skill does not authorize
an upgrade or dependency addition. Verify timeout, cancellation and context propagation in
that client's version: gRPC Java behavior below is not a JDK HTTP-client guarantee. If version
evidence is missing, retain a protocol-level design and mark code/API choices conditional.

### Budget and trace contracts

A local HTTP request timeout does not itself transmit a deadline. Use the selected proxy's
documented mechanism. A custom header requires implemented parsing and enforcement; it is
not portable proxy configuration. Define units, trust boundary, malformed/missing/expired
behavior and a server-side maximum. Strip or clamp untrusted policy-control headers.

For a relative budget, deduct elapsed queueing and processing before forwarding or retrying;
do not restart the original duration on each attempt. Account for transit/dispatch delay or
reserve headroom. For an absolute timestamp, specify the clock-skew allowance. Check when the
proxy's timer actually starts, especially for uploads and streaming calls. Cancellation must
stop further attempts; stopping server work requires server cooperation and does not undo a
committed side effect. See `timeouts-and-deadlines` for budget design.

gRPC encodes propagated deadlines as remaining time, and Java supports automatic propagation
within its RPC context. Verify that the actual terminating proxy/filter chain preserves and
decrements it. This does not imply automatic propagation by arbitrary HTTP clients.

Continue valid trace context across the hop using instrumentation: a proxy can create a
child span and inject its span context while preserving the trace ID. Do not require byte-for-byte
copying of a parent's span ID or start an unrelated root. Preserve trace state under the
applicable trust policy; use bounded route identifiers, not raw subject keys, in metrics.
Instrumentation overhead belongs to `opentelemetry-performance`.

## Runtime validation

Use an isolated app → real proxy → counting stub path with the target image/config:

- **Attempt bound:** with one app attempt, three proxy attempts, retryable stub failures,
  replayable input and enough deadline, expect three stub requests. With early expiry or a
  non-retryable failure expect fewer; never exceed the bound. Count logical operations as well
  as attempts. Include commit-then-disconnect to expose duplicate effects.
- **Deadline:** delay both queueing and upstream response; check elapsed client time, cancellation
  and absence of later retries. An expired budget must not start a new upstream attempt.
- **Faults:** stop the proxy under load, inject latency/503 and remove a route separately.
  Assert bounded failure, reconnection and the specified fallback for each; a synthetic 503
  alone does not test a process crash. Use open-loop load to expose the outage
  (`coordinated-omission`), only in an isolated test environment.
- **Security/config:** present both an untrusted certificate and a trusted-CA certificate for
  the wrong name, forged authority/destination/policy headers,
  and an invalid config update. Assert rejection without bypass, retained last-good config
  where supported, visible config version and successful rollback.

These are implementation tests, not evidence that the skill improves agent behavior.

## Primary sources and limits

Checked 2026-09-05. Envoy links use its moving latest documentation (then 1.40 development);
verify configuration fields against the deployed version before emitting runnable config.
Address/identity sources additionally checked 2026-09-19 against Envoy 1.40 development docs;
these establish the option distinction, not compatibility with an unspecified deployed version.

- [RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2):
  idempotency and restrictions on automatic retries.
- [Envoy connection pooling](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/connection_pooling):
  pool partitioning and protocol-dependent concurrency.
- [Envoy TLS](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/security/ssl):
  certificate verification requires configuration, beyond simply enabling TLS.
- [RFC 9110 §§7.2, 9.3.6](https://www.rfc-editor.org/rfc/rfc9110.html#section-7.2):
  request authority identifies the target origin; CONNECT establishes a tunnel.
- [Envoy upstream HTTP protocol options](https://www.envoyproxy.io/docs/envoy/latest/api-v3/config/core/v3/protocol.proto#envoy-v3-api-msg-config-core-v3-upstreamhttpprotocoloptions):
  separate automatic SNI and SAN validation controls and their header-derived inputs.
- [Envoy router](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/router_filter):
  retry and timeout controls are implementation-specific.
- [gRPC deadlines](https://grpc.io/docs/guides/deadlines/):
  elapsed-time deduction, propagation and cancellation responsibilities.
- [W3C Trace Context](https://www.w3.org/TR/trace-context/#processing-model):
  forwarding versus participating in a trace.

The pool estimate, diagnostic hypotheses and test acceptance conditions above are engineering
reasoning and proposed checks, not measurements from a running deployment.
