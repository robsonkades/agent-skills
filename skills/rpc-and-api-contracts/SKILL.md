---
name: rpc-and-api-contracts
description: >
  The contract between two services and how it changes without a coordinated deploy: partial
  failure as a first-class outcome, an error surface a machine caller can act on (stable
  codes, a retryable flag, RFC 9457), compatibility in both directions and
  expand-then-contract, versioning only where compatibility is impossible, and choosing REST,
  gRPC or messaging on observable conditions. Use when a client branches on an error message
  string, when every endpoint returns a different error shape, when a field is renamed or a
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
2. **Design the error surface around the caller's decision.** Enumerate the codes, mark each
   one retryable, non-retryable or ambiguous, and state which members are contract and which
   are diagnostics that may change freely.
3. **Classify every change** as additive, compatible-in-one-direction, or breaking, and name
   which side may deploy first. See `references/contract-evolution.md`.
4. **Ship a breaking change as expand → migrate → contract** — three deploys. A rename is two
   additive changes and a deletion, never one edit.
5. **Prove coexistence, not just correctness.** A rolling deploy runs both versions
   simultaneously; test old-consumer/new-producer and new-consumer/old-producer explicitly.
6. **Version only what cannot be made compatible**, and emit requests-per-version with a
   client identifier, so retiring the old one is evidence rather than optimism.

## Rules

- Partial failure is the difference that matters: a remote call has a third outcome where the
  callee succeeded and the caller learned nothing. The contract must say what the caller does
  in that case, which in practice means an idempotency key (idempotency).
- No protocol distinguishes a lost request from a lost response. Any contract that asks the
  client to know which occurred is mis-specified.
- Error codes are a closed, documented set, stable across versions and separate from the HTTP
  status. The human-readable text is explicitly **not** contract and may be reworded,
  localised or redacted without a version change — say so in the documentation, or clients
  will parse it anyway.
- Retryability is a field the response carries, not an inference the client makes. Retry
  policy on top of it is retries-and-backoff; modelling it on the in-process exception type
  is java-exception-design.
- RFC 9457 (which obsoletes RFC 7807) defines `application/problem+json` with `type`,
  `title`, `status`, `detail` and `instance`. Put the machine-readable members — code,
  retryable, correlation id — in extension members, never encoded inside `detail`.
- In gRPC, mapping every failure to `INTERNAL` discards the closed status enum's whole point.
  `UNAVAILABLE` is the retryable one, `FAILED_PRECONDITION` means do not retry until state
  changes, `ABORTED` means retry the enclosing operation, `DEADLINE_EXCEEDED` is ambiguous.
- Compatibility has a direction, and the direction names who deploys first: backward
  compatible (a new reader reads old data) means consumers first; forward compatible (an old
  reader reads new data) means producers first. Only "both" is safe in any order, which is
  what a rolling deploy requires.
- The compatibility window is the **data's retention**, not the deploy's duration. A change
  to an event on a seven-day topic must be readable both ways for seven days; to a persisted
  column, for as long as rows exist.
- Never reuse a field number or name; never narrow a type; never add a field that the
  receiver is required to have. Adding validation to an existing field is the same breaking
  change as adding a required field, and it passes review more easily.
- proto3 singular scalars carry no presence: unset and zero are indistinguishable unless the
  field is declared `optional`. Treating 0 or `""` as meaningful is a bug that ships quietly.
- Jackson's `FAIL_ON_UNKNOWN_PROPERTIES` is enabled by default; Spring Boot's auto-configured
  `ObjectMapper` disables it, and a hand-constructed `new ObjectMapper()` does not. That one
  line turns a purely additive producer change into a consumer outage.
- You cannot retire a version you cannot count. No per-version request metric means the
  deprecation never ends.
- Choose the transport on conditions: **gRPC** when both ends are services you control,
  deadline propagation and cancellation must live in the transport, schema enforcement is
  required, or call rates and streaming matter — browsers need a proxy layer. **REST/JSON**
  when the caller set is open or browser-based, intermediary caching matters, or clients
  cannot be made to regenerate stubs. **Messaging** when the producer must not wait, when
  fan-out or replay is required, or when consumer availability must not bound the producer —
  at which point the delivery guarantee becomes part of the contract (delivery-semantics).

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
