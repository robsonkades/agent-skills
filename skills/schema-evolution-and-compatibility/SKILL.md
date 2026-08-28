---
name: schema-evolution-and-compatibility
description: >
  Whether a given schema change is safe, in which deploy order, and what breaks when it is
  not: the writer/reader pair, the compatibility levels and who upgrades first, the
  per-format rules for Avro, Protobuf and JSON Schema, registry configuration, and catching
  a break in CI. Use when AvroTypeException reports a missing required field, when "Can't
  get the number of an unknown enum value" is thrown, when UnrecognizedPropertyException
  comes from a hand-built new ObjectMapper(), when auto.register.schemas or
  specific.avro.reader is left at its default, when a proto field is deleted without
  reserved or its number reused, when BACKWARD is set on a compacted topic, when a consumer
  group reset to earliest dies on old records, when an .avsc gains a field with no default,
  or when a JSON schema ships with additionalProperties left at true. Not wire size
  (serialization-performance), HTTP API versioning (rpc-and-api-contracts), offsets
  (kafka-consumers-in-java), or upcasters (event-sourcing).
---

# Schema Evolution And Compatibility

## Purpose

Compatibility is a property of a **(writer schema, reader schema) pair and a direction** — can a
reader holding R read bytes written with W? Both must be named: explicitly in Avro, implicitly in
Protobuf and JSON, where the reader schema is the class the consumer compiled against.

The failure this prevents is the change the registry accepted. The gate runs at registration, per
subject, against the previous version; it knows neither which schema a deployed consumer holds nor
what is still on the topic — so a change is green on Monday and an outage six months later, when a
group resets to earliest.

## Workflow

1. **Name the pair and the direction**: which reader schema, which writer schema, who deploys first.
2. **Name the store's effective retention** — seconds for HTTP/gRPC, the window for a
   `cleanup.policy=delete` topic, **unbounded** for a compacted topic or event store. It decides
   transitive versus not, and how long "wait" means (`references/runbook-and-ci.md`).
3. **Look the change up in the format table**, carry its condition and not only its verdict, and take
   the deploy order from the level table — never from the level's name.
4. **Confirm the reader actually resolves**: `specific.avro.reader`, the mapper the consumer really
   uses, the age of its generated code. One that does not voids everything above it.
5. **Ship expand and contract as separate releases**, gate in CI, watch the two production signals.

## Compatibility levels: who upgrades first

Named for the **new schema**, not for who moves: new reader reads old data → reader first.

| Level                 | Permits (the new schema may…)         | Upgrade first                                            | Retention assumption                                    |
| --------------------- | ------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| `BACKWARD` (default)  | delete a field, add an optional field | **all consumers**, before producing new events           | nothing older than **one** version is still read        |
| `BACKWARD_TRANSITIVE` | same, against **every** version       | all consumers                                            | all history readable — the only level safe for a replay |
| `FORWARD`             | add a field, delete an optional field | **all producers**, _and_ old-schema data must be drained | old data is gone; on a retained topic it is not         |
| `FORWARD_TRANSITIVE`  | same, against every version           | all producers, same drain condition                      | as above                                                |
| `FULL`                | add or delete an **optional** field   | **either order** — the point of separate services        | one version back                                        |
| `FULL_TRANSITIVE`     | same, against every version           | either order                                             | all history                                             |
| `NONE`                | anything                              | undefined; the ordering is yours                         | none                                                    |

- **Non-transitive is the retention-window knob**: comparing only against the latest version encodes
  "no data older than one schema version survives", which nothing verifies. Rewinding "to the
  beginning of the topic" — Confluent's own reason for the `BACKWARD` default — already needs
  `BACKWARD_TRANSITIVE`, as does any compacted or infinitely retained subject.
- **Kafka Streams inverts the exception**: a Streams app also reads its own changelog and state,
  which is old-schema data, so Confluent's instruction is to upgrade the Streams apps first and only
  then the upstream producer. Only `BACKWARD`, `BACKWARD_TRANSITIVE`, `FULL`, `FULL_TRANSITIVE`.

## What a change does, by format

Avro rows verified on 1.12.0, Protobuf rows on protobuf-java 4.32.0, Jackson claims on 2.19 and 3.0;
JSON Schema is Confluent's `STRICT` checker on `kafka-json-schema-provider` 8.3.1.

| Change            | Avro                                                                                      | Protobuf                                                                                                                                                                                                                                     | JSON Schema (Confluent)                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Add a field       | both ways **with a default**; reader-hostile without one                                  | both ways, on a **new number**                                                                                                                                                                                                               | **not backward compatible on an open schema** — needs `additionalProperties: false` in v1, or `LENIENT` |
| Remove a field    | reader-first always; writer-first only if it **had** a default                            | both ways — `reserved <n>, "<name>";` in the deletion commit                                                                                                                                                                                 | mirror of add                                                                                           |
| Rename a field    | reader-first **with `aliases` on the reader**; otherwise add+remove                       | free on the wire, **breaks ProtoJSON** unless `json_name` keeps the old key                                                                                                                                                                  | add+remove; there is no alias                                                                           |
| Widen a scalar    | reader-first only (`int`→`long`→`float`→`double`); `string`↔`bytes` is safe **both ways** | both ways and **undetectable** across `int32`/`int64`/`uint*`/`bool`                                                                                                                                                                         | reader-first (`integer` → `number`)                                                                     |
| Narrow a scalar   | writer-first only                                                                         | same undetectable set; another **same-wire-type** change reads a plausible _wrong_ value (`int32(300)`→`sint32` = 150) with an **empty** unknown-field set, a wire-type change reads zero with the bytes in `unknownFields` — neither throws | writer-first                                                                                            |
| Add an enum value | reader-first, **only if the reader's enum has a `default` symbol**                        | wire-safe, but a Java reader gets `UNRECOGNIZED` — reader-first, or read `getXValue()`                                                                                                                                                       | reader-first; **JSON Schema has no enum default**, so no fallback exists                                |
| Reuse a number    | n/a — fields match by name, so reordering is free                                         | **never**: the same wire type reinterprets old bytes into a valid-looking object                                                                                                                                                             | n/a                                                                                                     |
| Change a default  | `COMPATIBLE` in every checker, yet it changes what old data _means_                       | no schema defaults; the implicit zero is not one                                                                                                                                                                                             | reader-side default, same retroactive effect                                                            |

## Expand then contract

Two halves in **opposite deploy orders**, never in one release. Expand is a BACKWARD change (readers
first); contract is a FORWARD change (writers first). In one artefact no version of the system reads
both shapes, so rolling back the contract rolls back the expand: the release boundary _is_ the
rollback point.

```text
Release N — EXPAND (additive, readers first)
  1. Add the field: with a default (Avro) / a new number + `optional` (Protobuf) / non-required (JSON).
  2. Register from CI, never from a producer. FULL_TRANSITIVE if affordable, BACKWARD_TRANSITIVE floor.
  3. Deploy CONSUMERS that read both shapes; nothing branches on the new field yet.
  4. Then deploy PRODUCERS that write it, alongside the old field if this is a replacement.
MIGRATE — 5. backfill a mutable store, driving "old shape only" to zero by metric; 6. flip the
  consumer to prefer the new field, the old one still written and read as a fallback.
Release N+1 — CONTRACT (subtractive, writers first)
  7. Deploy PRODUCERS that stop writing the old field.
  8. Wait one retention window (references/runbook-and-ci.md — on a compacted topic this is never).
  9. Deploy CONSUMERS that no longer read it, then remove it (Protobuf: `reserved` number and name).
Rollback of N+1 runs in the SAME order as the deploy — producers first. Reverting the consumers
alone puts them back on a field nothing writes, which is safe only if it kept its default.
```

## Rules

- **`record.get("newField")` throws `AvroRuntimeException: Not a valid schema field` although git's
  schema gives it a default — and worse, nothing else throws at all.** `specific.avro.reader`
  defaults to `false`, so the deserialiser sets **reader schema = writer schema**: no defaults, no
  enum defaults, no promotion, and never a resolution error, so an incompatible producer change
  arrives as silently different data. Set it `true` with `SpecificRecord`s, or pass a reader schema.
- **A laptop defined production's contract, and the subject has twelve versions differing only in
  whitespace.** `auto.register.schemas` defaults to `true` and overrides `use.latest.version` and
  `latest.compatibility.strict`; `normalize.schemas` defaults to `false`, so lookup is by string.
  Register from CI with `auto.register.schemas=false`, `use.latest.version=true`, normalisation on.
- **`UnrecognizedPropertyException` on an additive change is a hand-rolled mapper, not the
  framework.** `FAIL_ON_UNKNOWN_PROPERTIES` is `true` in Jackson 2.x and `false` as of Jackson 3.0,
  and Spring has always disabled it (`Jackson2ObjectMapperBuilder`, spring-kafka's
  `JacksonUtils.enhancedObjectMapper()`). Grep for `new ObjectMapper(` outside configuration, and
  keep the feature `true` in tests — tolerance also stops detecting your own typos.
- **The Avro union-default rule changed in the 1.12 spec, and vendor documentation still teaches the
  old one.** Under ≤ 1.11 the default must match the **first** branch, and `new Schema.Parser()` on
  1.11.4 and 1.11.5 reject `["null","string"]` with `"default":"x"`; 1.12.0 says "the first schema
  that matches" and accepts it. On **1.12.0 and 1.12.1** `Schema.Field.defaultVal()` returns `null`
  for a non-first-branch union default while `GenericDatumReader` substitutes the value correctly —
  **fixed in 1.12.2**. Pin 1.12.2, and write `["null", "T"]` with `"default": null` regardless.
- **A `.proto` field deleted with a comment instead of `reserved`** is a delayed detonation: reusing
  the number later at the same wire type yields an exception or a well-formed object with wrong
  contents, per record, depending on the old payload's bytes. Reserve the **number** (wire) and the
  **name** (ProtoJSON) in the deletion commit.
- **`IllegalArgumentException: Can't get the number of an unknown enum value.`** Java closes proto3's
  open enums with an `UNRECOGNIZED` constant whose `getNumber()` and `getValueDescriptor()` throw,
  while `forNumber` returns `null` and a `switch` falls to `default`. Adding a symbol is
  consumer-first in Java; a reader that must tolerate unknowns reads the generated `getXValue()` int.
- **proto3 presence is a decision, not a detail**: an implicit scalar cannot distinguish "cleared"
  from "the producer's build predates this field" — an explicit `0` puts zero bytes on the wire and
  `hasField()` is `false`. `optional` has been GA since **3.15.0** ("proto3 removed optional" is 2015
  folklore), and unknown-field retention was dropped in 3.0 and **restored in 3.5.0**, so a proxy
  that re-emits what it parsed keeps fields it never heard of.
- **One one-way door ships in v1**: a JSON Schema left at the default `additionalProperties: true`
  can never gain a property under `STRICT`, and closing it later is itself rejected
  (`ADDITIONAL_PROPERTIES_REMOVED`), so the only fix is editing v1. Draft 2020-12 has no evolution
  vocabulary at all, so every JSON Schema compatibility rule is a registry vendor's invention.
- **An Avro enum without a `default` symbol is the cheaper mistake**: adding the `default` in v2 is
  `COMPATIBLE` both ways, so the schema edit is free — but every reader deployed on v1 must be
  replaced before a new symbol can be written. A consumer-first deploy, not a topic rewrite.
- **`BACKWARD` on a compacted topic is a latent outage**: a record written under v1 is still the
  current value for its key and the non-transitive check never compared against it. The trigger is a
  group reset to earliest — `kafka-consumers-in-java` owns the reset, this owns the fatal level.

## Verification

- **Offline, no registry, no network**: keep every historical schema in the repo and validate the
  current one against all of them. On Avro 1.12.0 `new SchemaValidatorBuilder().canReadStrategy()`
  with `.validateAll()` is `BACKWARD_TRANSITIVE`, `.validateLatest()` `BACKWARD`, mutual read `FULL`.
  **Match the strategy to the registry's level**, or CI is greener than production.
- **`mvn io.confluent:kafka-schema-registry-maven-plugin:8.3.1:test-compatibility`** against staging
  and production is the only check that knows what is actually registered (`verbose` defaults to
  `true`); `test-local-compatibility` is the offline goal to start CI with.
- **`buf breaking --against '.git#branch=main,subdir=proto'`** (buf CLI v1.72.0) on the PR.
  `WIRE_JSON` is the floor if anything speaks ProtoJSON — it catches the rename that is free on the
  wire; `FILE` if you publish generated Java as a library. It knows nothing of the registry or the
  topic, so it complements `test-compatibility` rather than replacing it.
- **The round trip is the only test that models the deploy.** Serialise with schema N, deserialise
  with N−1 and with N+1, and **assert on the values, not on the absence of an exception** — that is
  what catches a changed default (`COMPATIBLE` from every API, different value) and a same-wire-type
  reinterpretation, which no metric below can see. For Protobuf use `DynamicMessage` over two
  descriptors.
- **Two production signals.** `msg.getUnknownFields().asMap().size()` on every Protobuf parse path:
  non-zero is the steady state during expand, a rise on a service you did not deploy means someone
  upstream shipped a field you do not know, a persistent non-zero after migration means the contract
  half never finished — but it detects **wire-type drift only**, since an `int32`→`sint32` or
  `fixed32`→`float` reinterpretation leaves it empty. And a counter tagged with the schema id from
  bytes 1–4 of the payload (or the header GUID on Confluent Platform 8.1.1+): >2 ids on a topic is a
  rollout, an unknown id is an auto-registration, the old id's rate reaching zero ends the wait.

## References

- [Avro](references/avro.md) — resolution rules verbatim, the verified reader/writer matrix, aliases,
  the enum `default` symbol, the union-default divergence across five releases, the fingerprint trap,
  what a changed default does to old records, `SpecificRecord` versus `GenericRecord`. Read when the
  change is to an `.avsc`, or when an Avro reader throws.
- [Protobuf](references/protobuf.md) — the wire-safe, unsafe and lossy lists, presence and generated
  accessors, the eleven verified type-change outcomes, reused numbers, packed repeated and unknown
  fields, the `UNRECOGNIZED` codegen source, `oneof`, proto2 `required`. Read when the change is to a
  `.proto`.
- [Registry and JSON Schema](references/registry-and-json.md) — the Confluent wire format, subject
  strategies, source-verified serialiser defaults, what the registry does not check, Confluent's JSON
  Schema rules and content models, Jackson's null-versus-absent gap, Apicurio/Glue/Karapace. Read
  when the change is to a JSON schema or DTO, or when configuring a registry.
- [Runbook and CI](references/runbook-and-ci.md) — how long "wait" is per store, the options when
  contraction is impossible, and the CI wiring: Maven plugin configuration, `buf.yaml`, the Avro
  validator and round-trip tests, golden bytes, Testcontainers. Read when planning a breaking
  change's deploy, or when building the gate.
