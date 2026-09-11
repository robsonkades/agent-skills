---
name: schema-evolution-and-compatibility
description: >
  Whether a given schema change is safe, in which deploy order, and what breaks when it is
  not: the writer/reader pair, the compatibility levels and who upgrades first, the
  per-format rules for Avro, Protobuf and JSON Schema, registry configuration, and catching
  a break in CI. Use when AvroTypeException reports a missing required field, when "Can't
  get the number of an unknown enum value" is thrown, when UnrecognizedPropertyException
  exposes an unexpected mapper policy, when auto.register.schemas or
  specific.avro.reader is left at its default, when a proto field is deleted without
  reserved or its number reused, when BACKWARD leaves retained history unchecked, when a consumer
  group reset to earliest dies on old records, when an .avsc gains a field with no default,
  or when a typed property is added to an open JSON schema. Not wire size
  (serialization-performance), HTTP API versioning (rpc-and-api-contracts), offsets
  (kafka-consumers-in-java), or upcasters (event-sourcing).
---

# Schema Evolution And Compatibility

## Purpose

Compatibility is a property of a **(writer schema, reader schema) pair and a direction** — can a
reader holding R read bytes written with W? Name the schema/descriptor, parser configuration and
application semantics: a JSON validator and a Java DTO binder are separate contracts.

The failure this prevents is the change the registry accepted. The gate runs at registration, per
subject, against the configured comparison history; it knows neither which schema a deployed consumer holds nor
what is still on the topic — so a change is green on Monday and an outage six months later, when a
group resets to earliest.

## Workflow

Use the steps that establish the requested claim. Reuse supplied pair tests, immutable artifacts
and inventory; retain an adequate decoder or gate without forcing a migration. A narrow explanation
can finish with its supported conclusion and the uncertainty that could change it.

1. **Name the pair and the direction**: which reader schema, which writer schema, who deploys first.
2. **Inventory reachable writers and stored data**: deployed and rollback builds, retries, lag,
   compacted latest values, backups and replay paths. Compaction can retain an old value indefinitely;
   it does not preserve every historical record. Confirm actual cleanup policies and reachable schema
   versions before choosing a gate or waiting period (`references/runbook-and-ci.md`).
3. **Look the change up in the format table**, carry its condition and not only its verdict, and take
   the deploy order from the level table — never from the level's name.
4. **Confirm the actual decoder path**: `specific.avro.reader`, explicit reader selection, deliberate
   writer-aware handling, the injected mapper and generated-code version. A mismatch limits the
   affected decoding claim; it does not erase independently established schema-pair evidence.
5. **For a change, choose a verified transition**, gate the required pairs and verify any migration
   inventory. Expand/contract is one bridge; tested aliases, adapters or controlled cohort replacement
   can avoid dual writes or backfill when the actual contract permits it.

Inspect compiler/toolchain, generated-code and serializer/runtime versions before applying the
versioned examples. Transcripts below are historical observations on their stated versions, not
validation of the target project. Do not upgrade dependencies just to match them. Return the conclusion
and evidence proportionate to the task. For a rollout, include required reader/writer pairs, semantic
assertions, rollout/rollback prerequisites and executed versus pending checks. Missing inventory or
decoder configuration leaves claims that depend on it conditional.

## Compatibility levels: who upgrades first

Named for the **new schema**, not for who moves: new reader reads old data → reader first.

| Level                          | Checked direction (new schema N, compared schema O) | Typical order when only this direction is proven             |
| ------------------------------ | --------------------------------------------------- | ------------------------------------------------------------ |
| `BACKWARD` (Confluent default) | reader N reads writer O; latest compared version    | consumers first                                              |
| `BACKWARD_TRANSITIVE`          | reader N reads writers in all compared history      | consumers first                                              |
| `FORWARD`                      | reader O reads writer N; latest compared version    | producers first; new readers still need a plan for old data  |
| `FORWARD_TRANSITIVE`           | historical readers read writer N                    | producers first; does not establish new-reader replay safety |
| `FULL`                         | both directions against latest                      | either, for the tested pair and semantics                    |
| `FULL_TRANSITIVE`              | both directions against compared history            | either, for covered versions and semantics                   |
| `NONE`                         | no registry compatibility guarantee                 | derive and test the required pairs explicitly                |

- Non-transitive checks do not prove compatibility with older versions; they do not prove
  incompatibility either. For replay, test every reachable writer against the target reader.
  `BACKWARD_TRANSITIVE` and `FULL_TRANSITIVE` can cover this when the compared history is complete;
  explicit historical-pair tests or verified adapters can also establish it. Preserve schemas,
  references and identifier resolution needed by retained bytes, including backups.
- **Kafka Streams inverts the exception**: a Streams app also reads its own changelog and state,
  which is old-schema data, so Confluent's instruction is to upgrade the Streams apps first and only
  then the upstream producer for backward-compatible changes. Include state/changelog schemas and
  restore paths in the matrix; a forward-only gate is insufficient evidence for restoration.

## What a change does, by format

Historical probes used Avro 1.12.0, protobuf-java 4.32.0, Jackson 2.19.0 and 3.0.0, and Confluent's
`STRICT` checker on `kafka-json-schema-provider` 8.3.1. Table orders concern the stated format
transition, not every application: actual reader projections, adapters, allowed values and retained
semantics can change the required pairs or order.

| Change            | Avro                                                                                                                                     | Protobuf                                                                                                                                                                                                                                     | JSON Schema (Confluent)                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Add a field       | both ways **with a default**; reader-hostile without one                                                                                 | binary-compatible on a new number; test required semantics and ProtoJSON                                                                                                                                                                     | restrictive property can break backward compatibility with an open writer; inspect content models and actual values |
| Remove a field    | new readers can ignore removed writer fields; old readers that still expect a missing field need a meaningful default or adapter         | binary-compatible for non-required fields; reserve number and name; ProtoJSON readers may reject the old key                                                                                                                                 | mirror of add                                                                                                       |
| Rename a field    | reader-first alias resolution when the implementation honors reader aliases; otherwise verify an add/remove or adapter bridge            | free on the wire, **breaks ProtoJSON** unless `json_name` keeps the old key                                                                                                                                                                  | add+remove; there is no alias                                                                                       |
| Widen a scalar    | reader-first only (`int`→`long`→`float`→`double`); `string`↔`bytes` resolves both ways; arbitrary bytes need not preserve text semantics | wire-compatible but potentially lossy across `int32`/`int64`/`uint*`/`bool`; constrain values during rollout                                                                                                                                 | reader-first (`integer` → `number`)                                                                                 |
| Narrow a scalar   | writer-first only                                                                                                                        | same undetectable set; another **same-wire-type** change reads a plausible _wrong_ value (`int32(300)`→`sint32` = 150) with an **empty** unknown-field set, a wire-type change reads zero with the bytes in `unknownFields` — neither throws | writer-first                                                                                                        |
| Add an enum value | new reader first; old readers need a suitable enum default to accept new symbols                                                         | wire-safe, but a Java reader gets `UNRECOGNIZED` — reader-first, or read `getXValue()`                                                                                                                                                       | reader-first; **JSON Schema has no enum default**, so no fallback exists                                            |
| Reuse a number    | n/a — fields match by name, so reordering is free                                                                                        | **never**: the same wire type reinterprets old bytes into a valid-looking object                                                                                                                                                             | n/a                                                                                                                 |
| Change a default  | accepted by the recorded structural checks, yet can change what old data _means_; semantic gates can reject it                           | proto3 has implicit defaults; proto2 can declare explicit defaults; test presence/meaning                                                                                                                                                    | `default` is an annotation, not automatic value insertion; inspect binder/adapter behavior                          |

## Expand then contract

Separate compatibility bridges from removal so rollback retains a version that understands both
shapes. Additive and subtractive do not universally mean BACKWARD and FORWARD: format, defaults,
content model and application behavior decide. This is a replacement-field recipe; verify its pairs
and perform backfill only for stores that require it. An already compatible change needs no bridge.

```text
Release N — EXPAND (additive, readers first)
  1. Add the field: with a default (Avro) / a new number + `optional` (Protobuf) / non-required (JSON).
  2. Register reviewed schemas from CI; select checks covering all required pairs/history.
  3. Deploy CONSUMERS that read both shapes; nothing branches on the new field yet.
  4. Then deploy PRODUCERS that write it, alongside the old field if this is a replacement.
MIGRATE — 5. backfill a mutable store with a race-safe policy for concurrent/old writers;
  6. verify new-field semantics, then prefer it while retaining the old-field fallback.
Release N+1 — CONTRACT (subtractive, writers first)
  7. Deploy PRODUCERS that stop writing the old field.
  8. Prove remaining readers, replay data, retries, restores and rollback builds can use the new
     contract; waiting alone or a zero production rate does not establish this.
  9. Remove obsolete reader dependence and schema fields only when the pair tests permit it
     (Protobuf: reserve number and name; preserve needed historical schemas/Avro aliases).
Rollback must be evaluated as another rollout. Restoring dual writers cannot repair records already
written without the old field; old readers need tested meaningful defaults/adapters or migrated data.
```

## Rules

- **`record.get("newField")` throws `AvroRuntimeException: Not a valid schema field` although git's
  newer schema gives it a default.** `specific.avro.reader`
  defaults to `false`; the ordinary generic path follows the writer schema unless reader-selection
  configuration supplies another. Defaults in an unrelated newer schema do not apply. Generic
  decoding still fails on corrupt data, missing schemas or conversions; successful decoding does not
  prove application compatibility. Use SpecificRecords, an explicit reader, or deliberate
  writer-aware generic handling and test the actual configured path.
- **Unexpected registrations may bypass schema review.** `auto.register.schemas` defaults to `true`
  and overrides `use.latest.version`
  and `latest.compatibility.strict`. Bind runtime schemas to reviewed source or generated artifacts;
  CI registration is one enforcement path. Choose lookup of the application's registered schema,
  a supported explicit schema ID, or an intentionally selected latest schema.
  Normalization reduces supported syntactic differences; whitespace alone need not create versions.
- **`UnrecognizedPropertyException` identifies the effective reader policy, not its origin.**
  Bare Jackson 2.x defaults to failing on unknown properties; Jackson 3.0 changes that default.
  Framework builders may disable it, but custom beans, annotations and explicit configuration
  matter. Inspect the injected mapper; test production tolerance and separate strict producer/DTO
  validation so unknown-field tolerance does not hide misspelled required data.
- **The Avro union-default rule changed in the 1.12 spec, and vendor documentation still teaches the
  old one.** Under ≤ 1.11 the default must match the **first** branch, and `new Schema.Parser()` on
  1.11.4 and 1.11.5 reject `["null","string"]` with `"default":"x"`; 1.12.0 says "the first schema
  that matches" and accepts it. On **1.12.0 and 1.12.1** `Schema.Field.defaultVal()` returns `null`
  for a non-first-branch union default while `GenericDatumReader` substitutes the value correctly —
  **fixed in the recorded 1.12.2 probe**. Verify the deployed version; matching the first branch
  remains a portable convention (for a nullable field, `["null", "T"]` with `"default": null`).
- **A `.proto` field deleted with a comment instead of `reserved`** is a delayed detonation: reusing
  the number later at the same wire type yields an exception or a well-formed object with wrong
  contents, per record, depending on the old payload's bytes. Reserve the **number** (wire) and the
  **name** (ProtoJSON) in the deletion commit.
- **`IllegalArgumentException: Can't get the number of an unknown enum value.`** Java closes proto3's
  open enums with an `UNRECOGNIZED` constant whose `getNumber()` and `getValueDescriptor()` throw,
  while `forNumber` returns `null` and a `switch` falls to `default`. Adding a symbol is
  consumer-first when existing readers cannot handle unknowns; a tolerant reader can use the
  generated `getXValue()` int with the declared unknown-value policy.
- **proto3 presence is a decision, not a detail**: an implicit scalar cannot distinguish "cleared"
  from "the producer's build predates this field" — an explicit `0` puts zero bytes on the wire and
  `hasField()` is `false`. `optional` has been GA since **3.15.0** ("proto3 removed optional" is 2015
  folklore), and unknown-field retention was dropped in 3.0 and **restored in 3.5.0**, so a proxy
  that preserves the parsed binary message can retain fields it never heard of. JSON conversion,
  field-by-field copying or explicit discarding can lose them; test every intermediary.
- **An open JSON schema may already allow incompatible values for a newly declared property.**
  Under a backward STRICT gate, adding a restrictive property can fail; an unconstrained property
  need not narrow the accepted language. Do not edit published v1 to erase the problem. Use a tested
  bridge/migration or a new contract; LENIENT changes enforcement, not existing data.
- **An Avro enum default can be added in a reader transition**: the recorded v2 addition is
  `COMPATIBLE` both ways. Before emitting a new symbol, each reader that can receive it must have
  tested handling, such as a suitable default or adapter. This often needs a consumer-first deploy;
  it does not inherently require rewriting the topic.
- **`BACKWARD` alone leaves a replay evidence gap** when old compacted values survive outside the
  compared history. Check their actual pairs; incompatibility is a possibility, not a consequence
  of the mode name. `kafka-consumers-in-java` owns offset resets.

## Verification

- **Offline checks**: preserve immutable schemas/references for the required supported and reachable
  history, in the repository or a controlled artifact store. Test the relevant pairs and any broader
  published compatibility policy; every schema ever created need not remain a required pair.
  On Avro 1.12.0 `new SchemaValidatorBuilder().canReadStrategy()`
  with `.validateAll()` is `BACKWARD_TRANSITIVE`, `.validateLatest()` `BACKWARD`, mutual read `FULL`.
  Check the intended registry policy as well as actual runtime obligations; neither substitutes for
  the other when their comparison sets differ.
- **`mvn io.confluent:kafka-schema-registry-maven-plugin:8.3.1:test-compatibility`** against the intended
  registry checks registered history, as can the compatibility REST API (`verbose` defaults to
  `true`); `test-local-compatibility` is the offline goal to start CI with.
- **`buf breaking --against '.git#branch=main,subdir=proto'`** (buf CLI v1.72.0) on the PR.
  `WIRE_JSON` is the floor if anything speaks ProtoJSON — it catches the rename that is free on the
  wire; `FILE` if you publish generated Java as a library. It knows nothing of the registry or the
  topic, so it complements `test-compatibility` rather than replacing it.
- **Test the actual rollout matrix.** Serialize with deployed, candidate and retained writer schemas,
  decode with supported/rollback readers, and **assert values, not merely absence of exceptions** — that is
  what exposes a changed default or same-wire-type reinterpretation in the exercised cases.
  Structural/default-change rules can also detect these edits. `DynamicMessage` over two descriptors
  tests Protobuf runtime resolution; use actual generated clients when their API behavior is the claim.
- **Signals guide investigation, not proof of completion.** Unknown Protobuf field counts can show
  added/removed fields or wire-type mismatches, including legitimate history. They miss same-wire
  reinterpretations. Count schema identifiers only after validating framing, excluding tombstones
  and bounding metric cardinality. Multiple IDs or an unfamiliar ID do not identify a cause.
  An old ID's observed rate reaching zero does not prove no retained/backup records use it.

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
