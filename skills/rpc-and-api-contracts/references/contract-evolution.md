# Contract and schema evolution

## The two directions, and who deploys first

| Property            | Meaning                                                    | Typical rollout, subject to actual pairs               |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Backward compatible | new reader accepts old writer data with required semantics | consumers before producers                             |
| Forward compatible  | old reader accepts new writer data with required semantics | producers before consumers                             |
| Full (both)         | both reader/writer pairs preserve the contract             | either order for those tested versions                 |
| Incompatible pair   | one required pair fails parsing or semantics               | bridge, restrict rollout pairs or version the contract |

These labels do not classify a field edit by themselves. Defaults, unknown-field behavior,
presence, aliases, generated APIs and domain meaning determine the result. An optional
addition can break a strict JSON reader; removing an unused optional field can be compatible
for tolerant readers. Test each supported format/version and the intended semantics.

Full compatibility of a pair does not establish compatibility with every historical version.
For arbitrary coexistence, verify the entire required producer/consumer set, including retained
data and rollback. A registry's non-transitive FULL check against the latest schema can pass
while an older supported reader fails. A controlled rollout can rely on one direction when
the allowed cohorts are enforced and no rollback or durable/cached data introduces an untested
pair. Optional additions still need the actual reader's acceptance and semantic checks.

The horizon includes deployed old clients, rollback, caches/topics, DLQ/manual replay, backups
and archives. New readers may need to read old data for its retained/replay lifetime; old
readers need new-writer compatibility until they are gone (and during rollback). Do not assume
one symmetric retention window.

## Expand → migrate → contract

This is one common rename bridge. Select the steps needed for the actual transition;
preserve a verified adapter, alias or retirement path that already covers the supported pairs.
No stored data means no backfill, and dual-writing needs a reason and consistency protocol.

**Phase 1, expand.** Add the new field, endpoint or column alongside the old. Producers
write both. Consumers tolerate the new one being absent and keep reading the old one. Verify old readers tolerate the extra field and new readers accept its absence;
dual-writing is not automatically safe. Define authoritative value and conflict handling if
old/new fields disagree, and keep updates consistent through old writers and rollback.

**Phase 2, migrate.** Backfill stored data. Switch consumers to read the new field, still
falling back to the old. Producers still write both. Nothing is removed.

**Phase 3, contract.** Stop writing the old field, then remove it — but only once a
supported-client inventory, contract evidence and usage/acknowledgements establish that
required readers no longer depend on it. Field reads inside clients may not be observable
at the server. Stored old data may remain if readers retain tested aliases/defaults or a
migration adapter; elapsed retention alone does not address backups and replay. A constraint such as NOT NULL or a
required-field validation can be added only after data and every still-supported writer meet
it, including rollback writers; a successful backfill alone is insufficient.

This sequence is a common rename bridge, not the only one. Protobuf binary identity uses
field numbers and Avro reader aliases can support selected renames; JSON, generated APIs,
reflection and application semantics still require independent checks.

## Per format

Everything below is about compatibility. Which format is _cheaper_ — bytes on the wire,
allocation and throughput — is serialization-performance's question, and the two decisions
are independent: a format can be cheap and evolve badly, or the reverse.

**JSON.** Compatibility is reader/writer behavior, not guaranteed by syntax. If additive
fields are part of the policy, readers must ignore/retain them as required; a strict reader
makes addition breaking. Jackson defaults differ by framework/configuration, so test the
actual `ObjectMapper`. Changing type or absent/null/empty semantics is breaking unless a
union/coercion transition is explicit. JSON Schema can assert encoded constraints; it does
not establish unexpressed business behavior or the actual runtime's validation configuration.

**Protobuf.** Field numbers are binary identity; names affect generated/JSON/TextFormat APIs.
Reserve removed numbers and names. Some scalar changes share a wire type, but parseability is
not semantic/full compatibility: a new `int64` value can truncate in an old `int32` reader,
and signed encodings differ in cost/meaning. Follow the official safe-change matrix and test
maximum values both ways. Proto3 implicit presence conflates absent/default; `optional` or
message fields restore it, while Editions default to explicit presence. Give enums a zero
`UNSPECIFIED` and test generated-language unknown-value behavior.

**Avro.** Decoding uses writer and reader schemas; record fields resolve by name/aliases.
Adding a reader field absent from old data needs a reader default. Deleting a writer field
still expected by an old reader requires that reader to have a default. Aliases are reader-side resolution aids,
so registry/tooling must evaluate the actual pair. Union ordering affects binary branch indices
and default interpretation; follow the deployed Avro spec/version rather than assuming a rename
is transparent.

## Choosing the version and transition policy

Distinguish an artifact/schema release identifier from a parallel breaking API version. Follow
the existing policy: compatible additions may still get a release identifier. A separate
major/endpoint version is one way to isolate incompatible contracts, not the only bridge.

```text
Consider a breaking version or a verified transition when:
- an existing field changes meaning or type, or an input becomes required
- an error code changes class — a permanent failure becomes retryable, or the reverse —
  because clients have already encoded the old classification in their retry policy
- the operation's idempotency or ordering properties change

A separate breaking endpoint version is usually unnecessary when:
- the change is an optional field, a new endpoint, or a new enum value and the affected
  deployed/generated clients have tested compatible behavior (including strict schemas,
  unknown values and routing interactions)
- only non-contract detail/documentation changes, preserving applicable standard and
  published presentation/diagnostic guarantees

Prefer expand-and-contract instead when:
- the change is breaking but both shapes can coexist through the measured compatibility
  horizon; widening is not automatically safe for old readers accepting larger new values
- the client population cannot be made to move on your schedule — a public API, mobile
  clients, partner integrations — so "both versions are live" is a fact rather than a plan
```

When a new version ships, provide the coexistence or replacement path promised by the
deprecation/support contract; a controlled, verified replacement need not run both indefinitely.
Retirement needs evidence covering supported callers and replay. Version metrics, protected
client-level logs and consumer acknowledgements can contribute; avoid unbounded client-ID
metric labels and account for dormant clients.

## What a consumer-driven contract test proves

It proves: for each **registered** consumer, for the interactions that consumer actually
exercised, the provider returns a response matching the recorded expectations, given a named
provider state the provider sets up as a fixture.

It supports the registered assertions that actually ran under those fixture states, including
semantic values, error outcomes and consumer handling when asserted. It does not establish
all business correctness, behavior of unregistered consumers, unasserted fields, latency,
ordering or unrecorded failures, nor that fixtures reproduce production. An unasserted field
alone does not prove every real client will tolerate changing it.

Two operational rules follow. Provider verification runs in the **provider's** pipeline
against the consumer versions the candidate can actually coexist with, according to the
existing deployment policy. Registered historical versions outside support need not all
block forever; nightly verification alone cannot prevent an intervening incompatible deploy. And error responses need recorded interactions
too: a suite covering only happy paths leaves the error contract, which is the part clients
branch on, entirely unverified.

## Evolution gates

Choose gates for the affected contract and claimed rollout, reusing adequate existing evidence.
A narrow default/format explanation need not create a migration or full fleet matrix.

- Build a matrix from real schema artifacts and generated clients for each supported version/
  language; do not rely only on registry compatibility labels.
- Exercise rollback: new writer to old reader is often missed by forward-only deployment tests.
- Test unknown JSON fields/enums, absent/null/default, numeric boundaries, malformed/oversized
  data and security validation.
- Inventory payloads outside the live broker: DLQ, object storage, audit exports, backups,
  mobile offline queues and webhook retries.
- Gate contraction on observed usage plus completion of retention/replay and restore tests—not
  merely elapsed deployment time.

## Primary references

- [Protocol Buffers: updating a message type](https://protobuf.dev/programming-guides/proto3/#updating)
- [Protocol Buffers field presence](https://protobuf.dev/programming-guides/field_presence/)
- [Apache Avro 1.12.0: schema resolution](https://avro.apache.org/docs/1.12.0/specification/#schema-resolution) — reader defaults and writer/reader pairs; check the deployed version.
- [JSON Schema specification](https://json-schema.org/specification)
- [Jackson 3.0 release notes](https://github.com/FasterXML/jackson/wiki/Jackson-Release-3.0) — changed unknown-property default; inspect the actual target mapper.
- [Pact: how it works](https://docs.pact.io/getting_started/how_pact_works) — registered interactions, consumer assertions and provider state.
- [Pact Broker deployment checks](https://docs.pact.io/pact_broker/can_i_deploy) — candidate/environment version verification, not an arbitrary historical compatibility guarantee.
- [Confluent compatibility modes](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html#compatibility-types) — FULL versus FULL_TRANSITIVE; inspect the configured registry/version.
- [Jackson 2.18.3 deserialization features](https://github.com/FasterXML/jackson-databind/blob/jackson-databind-2.18.3/src/main/java/com/fasterxml/jackson/databind/DeserializationFeature.java) and [Jackson 3.0.0 features](https://github.com/FasterXML/jackson-databind/blob/jackson-databind-3.0.0/src/main/java/tools/jackson/databind/DeserializationFeature.java) — plain defaults differ from framework/custom mappers.
- [Boot 3.5.0 Jackson configuration](https://github.com/spring-projects/spring-boot/blob/v3.5.0/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/jackson/JacksonAutoConfiguration.java) and [Framework 6.2.7 mapper builder](https://github.com/spring-projects/spring-framework/blob/v6.2.7/spring-web/src/main/java/org/springframework/http/converter/json/Jackson2ObjectMapperBuilder.java) — the auto-configured builder path and its overrideable unknown-property default.
