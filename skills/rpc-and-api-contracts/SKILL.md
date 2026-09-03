---
name: rpc-and-api-contracts
description: >
  The contract between two services and how it changes without a coordinated deploy: partial
  failure as a first-class outcome, an error surface a machine caller can act on (stable
  extensible codes, outcome certainty, retry conditions, RFC 9457), compatibility in both directions and
  expand-then-contract, versioning only where compatibility is impossible, and choosing REST,
  gRPC or messaging on observable conditions. Use when a client branches on an error message
  string, when a field is renamed or a
  proto field number reused, when a rolling deploy breaks consumers, when a synchronous
  endpoint fronts a long-running operation, when a new version is proposed for an additive
  change, or when a consumer fails on an unknown JSON property. Does not cover delivery
  guarantees (delivery-semantics), the deadline itself (timeouts-and-deadlines), wire-format
  cost (serialization-performance), the exception hierarchy (java-exception-design), or event
  contracts (event-driven-architecture).
---

# RPC And API Contracts

## Purpose

A contract binds for as long as the oldest caller and the oldest stored message live, not for
as long as a deploy takes. The failure this prevents is the change that is correct in the
repository and an outage in the fleet: a renamed field, a narrowed type or a reused field
number shipped as one deploy into a rolling upgrade where both versions are running at once.

The second failure is an error surface designed for a human reading a log. A machine caller
has to decide retry or not, fall back or not, page or not. If that decision requires parsing
English, the client is coupled to your wording and every rephrasing is a breaking change.

## Workflow

1. **Decide what the call actually is** before choosing a transport: a synchronous answer, or
   an acceptance of work. A synchronous facade over a long-running operation turns every
   client timeout into an orphan nobody can query, which is the worst available failure mode.
2. **Design the error surface around caller decisions.** Give stable problem types/codes,
   outcome certainty (rejected versus may-have-applied), retry precondition/advice, field
   violations and a status/operation URI where applicable. Retry safety composes method
   semantics, idempotency key, current state and failure—not one universal boolean.
3. **Classify every change** as additive, compatible-in-one-direction, or breaking, and name
   which side may deploy first. See `references/contract-evolution.md`.
4. **Ship a breaking change as expand → migrate → contract** — three deploys. A rename is two
   additive changes and a deletion, never one edit.
5. **Prove the coexistence pairs the rollout can create.** Test old-reader/new-writer and
   new-reader/old-writer where deployment order or durable data permits each. Include retries,
   cached/stored payloads, rollback and unknown error/enum values.
6. **Version only what cannot be made compatible**, and emit requests-per-version with a
   client identifier, so retiring the old one is evidence rather than optimism.

## Rules

- Partial failure is the difference that matters: after dispatch, a timeout/disconnect may mean
  the callee applied the effect. The contract must provide a stable operation/idempotency key,
  status lookup/reconciliation, or explicitly expose the unresolved outcome (`idempotency`).
- Transport exceptions alone often cannot distinguish lost request from lost response.
  Protocol/application evidence can: pre-dispatch failure, durable operation status or a
  deduplicated retry. Do not infer peer state from timeout class.
- Error codes are a documented **extensible** set unless the API version promises otherwise.
  Known meanings remain stable; clients need a conservative unknown-code path. Human-readable
  text is explicitly **not** branching contract and may be reworded,
  localised or redacted without a version change — say so in the documentation, or clients
  will parse it anyway.
- The response can carry `outcome=REJECTED|UNKNOWN`, `retryCondition`, `Retry-After` or an
  operation-status URI. The client combines those with idempotency and deadline. A naked
  `retryable=true` cannot express "refresh state", "same key only" or ambiguity.
- RFC 9457 (which obsoletes RFC 7807) defines `application/problem+json` with `type`,
  `title`, `status`, `detail` and `instance`. Put the machine-readable members — code,
  outcome/retry condition and correlation id — in extension members, never inside `detail`.
- In gRPC, mapping every failure to `INTERNAL` loses semantics, but no status is universally
  retryable. `UNAVAILABLE` may still be ambiguous for a mutation; `RESOURCE_EXHAUSTED` may be
  quota or capacity; `ABORTED` commonly means retry a higher transaction; `DEADLINE_EXCEEDED`
  can occur after effect. Publish method-specific retry policy and structured details.
- Compatibility has a direction, and terminology varies by ecosystem. Define it explicitly:
  backward (new reader reads old data) usually permits consumers first; forward (old reader
  reads new data) permits producers first. Full compatibility permits arbitrary coexistence;
  an ordered rollout can rely on one direction only if rollback and all live/stored pairs are
  controlled.
- The compatibility horizon is the maximum of live old-client lifetime, rollback window,
  broker/cache retention, DLQ/operator replay, backup restore and archived reprocessing.
  Required direction can change across rollout phases; it is not always both for retention.
- Apply format-specific identity rules: never reuse Protobuf field numbers (reserve removed
  numbers/names); JSON/Avro names and aliases differ. Type, validation or domain narrowing is
  breaking for values old clients may send/read. Introduce required fields through an
  optional/defaulted and negotiated transition.
- Proto3 implicit-presence singular scalars conflate absent/default; `optional`, message fields
  and Editions explicit presence preserve it. Check protoc/runtime/API compatibility before
  introducing presence into generated clients.
- Jackson's `FAIL_ON_UNKNOWN_PROPERTIES` is enabled by default; Spring Boot's auto-configured
  `ObjectMapper` disables it, and a hand-constructed `new ObjectMapper()` does not. That one
  line turns a purely additive producer change into a consumer outage.
- You cannot retire a version you cannot count. No per-version request metric means the
  deprecation never ends.
- Choose the transport on conditions, without treating style as destiny: **gRPC** often fits
  controlled service clients when deadline/cancellation propagation, generated schemas or
  streaming matter; browser/public use requires compatible gateway/tooling. **REST/JSON**
  when the caller set is open or browser-based, intermediary caching matters, or clients
  cannot be made to regenerate stubs. REST can stream and gRPC can serve public clients at
  additional ecosystem cost. **Messaging** when the producer must not wait, when
  fan-out or replay is required, or when consumer availability must not bound the producer —
  at which point the delivery guarantee becomes part of the contract (delivery-semantics).

## Contract dimensions often omitted

- authentication/authorization scope, tenant isolation and whether existence errors leak data;
- idempotency namespace/retention and operation-status lifecycle for `202 Accepted`;
- pagination cursor opacity/stability, filtering/sort semantics and snapshot consistency;
- numeric units/ranges, Unicode, time zone/precision and absent/null/empty distinctions;
- payload/metadata limits, compression, cancellation and deadline propagation;
- cache validators/conditional requests, privacy/redaction and audit requirements;
- rate-limit, deprecation/sunset signals and capability negotiation.

Generated OpenAPI/Protobuf/schema artifacts are necessary but insufficient: invariants,
failure semantics and rollout order must be executable in contract/integration tests.

## References

- [Contract and schema evolution](references/contract-evolution.md) — the compatibility
  matrix with who deploys first, the expand/migrate/contract sequence, the concrete rules for
  JSON, Protobuf and Avro, the versioning decision block, and exactly what a consumer-driven
  contract test proves and does not. Read before changing any shared message, endpoint or
  schema, and before proposing a new version.
- [The error contract in Java](references/error-contract.md) — a problem-details record with
  its contract and non-contract members separated, the single place a status becomes a
  decision, the gRPC status mapping table, and how a client acts without matching a string.
  Read when designing or reviewing the error surface of an API or client.
