# Contract and schema evolution

## The two directions, and who deploys first

| Property            | A reader on …                            | Deploy order                    | Changes that keep it                                         |
| ------------------- | ---------------------------------------- | ------------------------------- | ------------------------------------------------------------ |
| Backward compatible | the **new** schema can read **old** data | consumers, then producers       | delete a field; add a field that has a default               |
| Forward compatible  | the **old** schema can read **new** data | producers, then consumers       | add a field; delete a field that had a default               |
| Full (both)         | either reads either                      | **any order**                   | additive-optional only                                       |
| Breaking            | neither direction holds                  | none — coordinate or don't ship | rename, retype, narrow, reuse a number, add a required field |

Only the "full" row survives a rolling deploy, because during one both versions are running
and neither is "first". Every single-step change to a shared schema must therefore be
additive-optional; anything else is a three-deploy sequence.

The window over which both directions must hold is the **retention of the data**, not the
length of the deploy: seven days for an event on a seven-day topic, the lifetime of the rows
for a persisted column, the TTL for a cached payload.

## Expand → migrate → contract

**Deploy 1, expand.** Add the new field, endpoint or column alongside the old. Producers
write both. Consumers tolerate the new one being absent and keep reading the old one. This
deploy is additive-optional in both directions, so the rolling upgrade is safe.

**Deploy 2, migrate.** Backfill stored data. Switch consumers to read the new field, still
falling back to the old. Producers still write both. Nothing is removed.

**Deploy 3, contract.** Stop writing the old field, then remove it — but only once a
per-field or per-version usage metric shows no consumer reads it, **and** the retention
window of any stored message containing it has passed. A constraint such as NOT NULL or a
required-field validation is added here, after the backfill has proved there are no gaps,
never in deploy 1.

A rename is exactly this sequence: add the new name, write both, move readers, delete the old
name. There is no rename operation on a contract.

## Per format

Everything below is about compatibility. Which format is _cheaper_ — bytes on the wire,
allocation and throughput — is serialization-performance's question, and the two decisions
are independent: a format can be cheap and evolve badly, or the reverse.

**JSON.** Nothing on the wire enforces anything, so compatibility is a property of the
readers. Consumers must ignore unknown fields — Jackson's `FAIL_ON_UNKNOWN_PROPERTIES` is
enabled by default and Spring Boot's auto-configured mapper disables it, so a hand-built
`new ObjectMapper()` is the shape that breaks on an additive producer change. Never change a
field's type, including a numeric id to a string. Define absent versus `null` versus empty
once, in the contract. Publish a JSON Schema and verify it in CI, or the contract is
whichever implementation was deployed last.

**Protobuf.** Field _numbers_ are the identity; names are not on the wire (they are in the
JSON mapping). Never reuse either — `reserved 4, 7;` and `reserved "old_name";` make the
compiler enforce it. The varint family (`int32`, `int64`, `uint32`, `uint64`, `bool`) is
mutually wire-compatible, so widening `int32` to `int64` is safe and narrowing truncates
silently; changing between different wire types is not compatible at all. proto3 singular
scalars have no presence, so declare `optional` when unset must be distinguishable from zero.
Give every enum a zero-valued `UNSPECIFIED` member and give every reader a default branch: an
unrecognised value arrives as its number, not as an error.

**Avro.** Decoding needs both the writer's and the reader's schema, and resolution is by field
name. Add fields only with a default, and remove only fields that have one — without a
default there is no value for the other side to use. Renames use `aliases`, which map the old
name onto the new one for readers. A union's default must correspond to its first branch, so
reordering a union's branches changes what the default means.

## When a new version is genuinely required

```text
Ship a new major version when:
- an existing field changes meaning or type, or an input becomes required
- an error code changes class — a permanent failure becomes retryable, or the reverse —
  because clients have already encoded the old classification in their retry policy
- the operation's idempotency or ordering properties change

Avoid a new version when:
- the change is an optional field, a new endpoint, or a new enum value for which every
  reader has a defined default branch
- the change is only to human-readable text, diagnostics or documentation

Prefer expand-and-contract instead when:
- the change is breaking but the two shapes can coexist for one retention window, which is
  true of every rename, widening and split
- the client population cannot be made to move on your schedule — a public API, mobile
  clients, partner integrations — so "both versions are live" is a fact rather than a plan
```

When a new version does ship, both must run simultaneously for the whole deprecation, and
retirement is gated on a requests-per-version metric carrying a client identifier. Without
that metric the old version is removed on a guess.

## What a consumer-driven contract test proves

It proves: for each **registered** consumer, for the interactions that consumer actually
exercised, the provider returns a response matching the recorded expectations, given a named
provider state the provider sets up as a fixture.

It does not prove: anything about a consumer not registered with the broker; that the
provider's behaviour is _correct_ rather than merely shaped correctly; anything about fields
no consumer asserted on — which is deliberate, and is what makes additive change safe;
anything about latency, ordering or failure paths that were never recorded; or that the
fixture state resembles production.

Two operational rules follow. Provider verification runs in the **provider's** pipeline
against every registered consumer's expectations and blocks its deploy — run nightly, it
documents breakage instead of preventing it. And error responses need recorded interactions
too: a suite covering only happy paths leaves the error contract, which is the part clients
branch on, entirely unverified.
