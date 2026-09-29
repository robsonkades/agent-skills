---
name: spring-http-clients
description: >-
  Implement and diagnose outbound Spring HTTP calls when RestClient, WebClient or
  HttpExchange proxies lose Boot configuration, stall, buffer oversized responses
  or retry uncertain mutations. Covers transport wiring and response ownership;
  hands off general retry, deadline and idempotency policy. Excludes server endpoints
  and automatic framework migration.
---

# Spring HTTP Clients

Use for outbound integration code: a new peer client, an ineffective timeout, missing
TLS/observation configuration, an HTTP interface proxy, leaked responses, or unsafe
failure mapping. Preserve a sound existing client and the requested outcome: design,
diagnosis, review or implementation. A `RestTemplate` call is not authorization to
migrate the application.

## Establish the actual client

Inspect the compiler/toolchain and resolved Boot, Framework and transport versions,
the caller's execution model, client factories, effective configuration and peer API
contract. This skill's authoring and worked-example baseline is **Java 25,
Boot 4.1.1, Framework 7.0.9**, using managed dependencies and no preview features.
Report differences in the target project; do not silently upgrade it or add a starter
to make a copied snippet work. Boot minor releases can change configuration names.

Trace one invocation from its caller through proxy, client, factory/connector,
interceptors/filters and any retry layers. Collect the evidence that changes the fix:
which factory runs, which phase stalled, actual attempts, response size, pending pool
acquisitions or the last authoritative mutation result. A timeout alone proves no
particular transport or remote outcome. If evidence is missing, retain that uncertainty
and identify the smallest discriminating check; continue independent local work.

## Make the boundary explicit

| Situation                                   | Decision and verification                                                                                                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imperative caller, ordinary finite response | Prefer the project's configured `RestClient`. Virtual threads can run blocking calls but do not supply downstream admission control.                                                                           |
| Reactive caller or existing reactive stream | Preserve a composed `WebClient` pipeline. Keep blocking calls and `.block()` off event loops; identify cancellation and body ownership.                                                                        |
| Typed remote API contract                   | On a compatible Boot release, use an `@HttpExchange` interface registered by `@ImportHttpServices` and peer group properties. Preserve an adequate existing client; an interface is not required for one call. |
| Configured settings appear ineffective      | Follow the injected Boot builder and selected transport to the wire. A separately created client may bypass customizers; a later connector/factory replacement can discard earlier settings.                   |
| Caller reports failure after a mutation     | Preserve the intent and unresolved outcome until the provider contract resolves it. A timeout, cancellation or `5xx` is not evidence of no effect.                                                             |

When constructing clients, selecting a factory/connector, configuring TLS, or preserving
context, read [wiring and transports](references/wiring-and-transports.md).

For an ordinary finite response, start with a DTO and the framework's body extraction
and status handling. Add a peer adapter when it translates a real protocol or domain
contract, not merely to wrap every client method. Manual proxy factories, raw stream
decoders and new exception hierarchies need a constraint that simpler Boot facilities
cannot satisfy. HTTP interfaces still inherit the underlying transport and failure
contract; they do not make mutations retry-safe or responses size-limited.

When constructing clients programmatically, use **injected Boot builders** at the
application composition boundary. Builders are mutable; clone before diverging configurations when reusing
one instance. Keep per-user credentials out of singleton default headers and define
the destination to which they may be sent. Do not create a transport or pool per call.

## Bound work and retain its outcome

Before changing a timeout or adding resilience, read
[failure, time and response bounds](references/failure-and-response-bounds.md).
Keep these decisions visible at the call site:

- Name the phase each limit covers: admission/pool lease, connect/TLS, response, body
  and complete logical operation. A read setting is not a portable end-to-end deadline.
  Do not mutate a shared client for each request's remaining budget.
- Establish the response-size contract for success **and error** data. For untrusted
  or large bodies, enforce the required bound before aggregation; use existing codec
  or transport facilities before writing a decoder. Decide how streams end and release
  resources. `Content-Length` alone is not a bound, and a byte cap is not a time limit.
- Separate status/transport evidence from retry permission. `429` can carry delay
  advice; `400`/`401` normally require correction, not repeated identical calls. Apply
  the peer's documented semantics. Never retry all `RestClientException` instances.
- Give the logical operation one retry owner, account for transport/proxy attempts,
  and release failed responses before backoff. An idempotency header works only when
  the provider supports its identity, retention and replay contract.
- Keep endpoint templates and bounded result categories in metrics. Raw URLs, tokens,
  request/response bodies and exception messages may disclose secrets or create
  unbounded labels. Observation wiring does not prove propagation through a custom
  executor or reactive boundary.

## Verify and deliver

When adding a client or substantiating a failure/lifecycle claim, read
[verification](references/verification.md). Use the project's Spring test facilities
for its actual client path; the worked example is a pattern, not a separate application
to import. A mock request test can prove serialization or headers; only a real
transport test can exercise the chosen
timeouts, cancellation and connection behavior.

Deliver the focused change or finding, actual versions and selected transport, the
operation/error contract, checks run and unverified boundaries. Scale this to the task;
no new resilience framework, benchmark or lengthy report is required for a simple
client. Stop when the requested contract has evidence and remaining limits are clear.

## Optional handoffs

- `spring-boot`: pass builder registration, conditions and property origins for missing
  auto-configuration; expect a composition/configuration correction.
- `timeouts-and-deadlines`: pass phase settings, caller budget and release observations
  for a shrinking deadline and cancellation design.
- `retries-and-backoff` and `idempotency`: pass all attempt owners, operation identity,
  provider replay/reconciliation contract and unresolved outcomes; expect a safe retry
  policy or explicit stop/recovery state.
- `circuit-breakers` and `concurrency-limiting-and-bulkheads`: pass scoped failures,
  saturation and downstream capacity for admission/degradation decisions. A breaker
  does not by itself limit simultaneous calls.
- `distributed-tracing-design` and `spring-boot-observability`: pass the client creation
  path, propagation boundary and observed telemetry for trace design or Boot wiring.
- `java-application-security-basics`: pass credential ownership, authorization rules
  and secret-bearing types for code-level access and disclosure review. Transport
  trust, allowed destinations and redirects stay in this skill's wiring analysis.

These are optional collaborators. If unavailable, retain the guards here and state
the missing evidence. Server endpoint contracts belong to `spring-boot-web`; do not
activate this skill merely because an inbound controller uses HTTP.
