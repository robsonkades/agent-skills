# Registry and JSON Schema

Confluent Platform documentation captured as "current"; serializer selection/defaults checked against
`confluentinc/schema-registry` tag `v8.3.1`, with header-framing classes checked at `v8.1.1`.
These source checks are separate from the historical provider transcripts and from a live registry.
Where another registry differs, the last section says so; inspect the target version and configuration.

## What the check is, and what it cannot see

The compatibility check runs **at registration**, **per subject**, against the previous version(s)
_of that subject_ — not at produce time and not at consume time. "Compatibility checks are per
subject. Versions are tied to subjects." It therefore cannot verify:

- that any deployed consumer holds the schema version the check assumed;
- that the data on the topic is limited to the versions a non-transitive check compared;
- that an application object can be encoded correctly using the selected schema. With
  `auto.register.schemas=false` + `use.latest.version=true` + `latest.compatibility.strict=false`,
  the serializer skips its application-schema versus selected-latest backward-compatibility check.
  This does not undo checks performed when registered versions were admitted under the subject policy;
- that a non-registry-aware client actually uses the schema the gate checked.

Keep those claims separate: registry history, serializer selection, actual object encoding and
deployed-reader semantics each need appropriate evidence. Disabling one check does not make data
safe, nor does it imply all other checks were absent.

Setting compatibility by REST is global and overrides properties files; `/config/{subject}` sets it
per subject, with a `:.__GLOBAL:` context and a `defaultToGlobal` lookup order (subject → context →
global context).

## Wire format

| Bytes | Area            | Content                                                                  |
| ----- | --------------- | ------------------------------------------------------------------------ |
| 0     | version byte    | `0` when using the schema ID (the default)                               |
| 1–4   | schema ID       | 4-byte ID from the registry, **big-endian** (network byte order)         |
| 5–x   | messaging index | Protobuf only: an array of indexes for the message type; empty otherwise |
| x+1…  | data            | Avro or Protobuf binary encoding                                         |

The Protobuf index array is zigzag varint, length-prefixed, and the very common `[0]` case is
special-cased to a single `0` byte. The format applies to keys and values alike.

**Confluent Platform 8.1.1 adds a second framing**: version byte `1` and a **16-byte schema GUID**
carried in a Kafka header rather than the payload, enabled with `key.schema.id.serializer` /
`value.schema.id.serializer` = `io.confluent.kafka.serializers.schema.id.HeaderSchemaIdSerializer`.
"Starting with Confluent Platform 8.1.1, the default behavior of Schema Registry deserializers has
changed. Before, the deserializer would look for the schema ID in the payload prefix. Now, the
deserializer looks for the schema GUID in the header, and if not found, then looks for the schema ID
in the payload prefix." The GUID is a fingerprint including references, rules and metadata, stable
across registries, resolvable at `/schemas/guids/{guid}`. Migration order depends on the origin:
with existing Schema Registry payload-prefix readers, upgrade **consumers → producers** so readers
understand both framings before producers remove the prefix. With compatible raw payloads and no
registry, **producers → consumers** can work because old readers ignore added headers. Test actual
payload bytes, Protobuf message indexes and header preservation through state stores/connectors.
Rollback to payload-only readers still needs a plan for already retained header-framed records.
None of this is Avro's `C3 01` single-object framing.

## Subject-name strategies

| Behaviour                     | `TopicNameStrategy` (default) | `RecordNameStrategy`                                     | `TopicRecordNameStrategy`               |
| ----------------------------- | ----------------------------- | -------------------------------------------------------- | --------------------------------------- |
| Subject                       | `<topic>` + `-key` / `-value` | `<fully-qualified record name>`                          | `<topic>-<fully-qualified record name>` |
| Unique per topic              | yes                           | **no**                                                   | yes                                     |
| Compatibility checked across… | all schemas in the topic      | any occurrence of that record name **across all topics** | that record name within that topic      |

Class names are prefixed `io.confluent.kafka.serializers.subject.`. For record-based strategies, the
record identity is the Avro record
fullname, the Protobuf message name, or — for JSON Schema — the **title**. The strategy configured on
the broker for schema-ID validation does **not** propagate to clients; configure it in both.
The table assumes the same registry namespace/context. Include context, naming overrides, references
and access control when determining which teams/topics share a compatibility boundary.

Three ways to carry several event types on one topic, with different failure modes:

1. **`TopicNameStrategy` plus a union/`oneof` wrapper**, in its modern form as **schema references**:
   register each event type as its own subject, then a union of references as the topic's subject.
   Deliberately select the registered wrapper, for example with `auto.register.schemas=false` and
   `use.latest.version=true`, or a supported explicit schema ID. A lookup path that derives only the
   concrete event schema does not automatically select the wrapper. Auto-registering that event may
   instead attempt to make it the topic subject's latest schema, subject to registration policy.
   Verify schema selection and actual encoding; `40403` alone does not identify this cause.
2. **`RecordNameStrategy`** — share a record contract across topics in the same registry context.
   This can be intentional when ownership and evolution are coordinated; unrelated teams can otherwise
   collide on the same fullname. Inspect access controls and compatibility policy.
3. **`TopicRecordNameStrategy`** — isolate evolution per topic and type, at the cost of more subjects
   and independent policies. Choose it when that isolation is wanted, not merely because it exists.

Retain an adequate strategy that matches the intended compatibility boundary. Switching strategies
changes subject lookup/governance and needs its own migration and retained-data checks.

## Serialiser configuration

Defaults in `AbstractKafkaSchemaSerDeConfig` at `v8.3.1`: `use.latest.version=false`,
`latest.compatibility.strict=true`, `id.compatibility.strict=true`. The Avro serializer first handles
auto-registration, then an explicit ID/GUID, metadata-based selection, latest, or ordinary schema
lookup. Inspect the actual format's path. `use.schema.id` selects an existing schema and has its own
ID compatibility check; it is not a request to register or proof of correct object encoding.
For a schema-reference wrapper that intentionally selects latest:

```properties
auto.register.schemas=false
use.latest.version=true
latest.compatibility.strict=false   # only with separately verified wrapper/reference compatibility
```

With `auto.register.schemas=true`, "`use.latest.version` and `latest.compatibility.strict` are
ignored, so it doesn't matter how those are set". On the **deserialiser**, `use.latest.version=true`
does not override the embedded id: "The deserializer will still try to fetch the schema corresponding
to the message's schema ID… If that schema ID is missing (for example, due to deletion),
deserialization will fail with a schema not found."

Normalisation handles "the ordering of properties in JSON Schema; the ordering of imports and options
in Protobuf; the ordering of schema references; non-qualified names vs. fully-qualified names" —
Confluent's own example of the last is that a descriptor may generate `.google.protobuf.Timestamp`
where the schema says `google.protobuf.Timestamp`, and "Schema Registry considers these two
variations of the same type name to be different". Turn it on with `normalize.schemas=true`,
`?normalize=true` on the REST call, or globally via `/config`.

`avro.use.logical.type.converters` is narrower than its reputation: it is a
`kafka-avro-console-producer` property that works around a logical-type serialisation defect in
`io.confluent:kafka-avro-serializer` **7.5.2 and 7.4.3 only** (symptoms:
`ClassCastException: class java.time.Instant cannot be cast to class java.lang.Number`,
`AvroRuntimeException: Unknown datum type java.time.Instant`, REST Proxy `{"error_code":40801}`).
Fixed in **7.5.3 / 7.4.4**, and in REST Proxy **7.7.0**. It is not a general switch for application
clients.

## JSON Schema: Confluent's rules, since the format has none

"The JSON Schema compatibility rules are loosely based on similar rules for Avro, however, the rules
for backward compatibility are more complex." Three content models: **open** (`additionalProperties:
true`, "which is the default"), **closed** (`false`), and **partially open** (a schema for
`additionalProperties`, or `patternProperties`).

The Avro rules as adapted: fields match by name; "If the writer's schema contains a field with a name
not present in the reader's schema, then the reader's schema must have an open content model or a
partially open content model that captures the missing field"; a reader's **required** field with a
default is used when the writer has a closed content model and lacks or optionalises that field; a
reader's required field **without** a default signals an error in the same situation; a reader's
optional field is ignored when the writer is closed and lacks it.

JSON-specific rules, all of the form "the writer may be _more_ constrained than the reader": the
writer may have a larger `minProperties`, a smaller `maxProperties`, a `required` that is a
**superset** of the reader's, a `dependencies` that is a superset, and an `additionalProperties` of
`false` where the reader has `true` or a schema. `integer` may be promoted to `number`, with the
matching loosening rules for `minLength`/`maxLength`/`pattern`/`minimum`/`maximum`/`multipleOf` and
for `minItems`/`maxItems`/`uniqueItems`. For unions, "If the reader's and writer's schemas are both
unions, then the writer's schema must be a **subset** of the reader's schema." For enums, "The Avro
rule for enums is directly applicable… If the writer's symbol is not present in the reader's enum,
then an error is signaled" — and there is no enum default to fall back on.

Under `STRICT`, per content model (✔ = allowed; columns are BW / FW / Full):

| Allowed change        | Lenient | Strict, **open** (default) | Strict, **closed** |
| --------------------- | ------- | -------------------------- | ------------------ |
| Add optional field    | ✔ ✔ ✔   | · ✔ ·                      | ✔ · ·              |
| Remove optional field | ✔ ✔ ✔   | ✔ · ·                      | · ✔ ·              |
| Add required field    | · ✔ ·   | · ✔ ·                      | · · ·              |
| Remove required field | ✔ · ·   | ✔ · ·                      | · · ·              |
| Add union variant     | ✔ · ·   | ✔ · ·                      | ✔ · ·              |
| Remove union variant  | · ✔ ·   | · ✔ ·                      | · ✔ ·              |
| Widen a scalar        | ✔ · ·   | ✔ · ·                      | ✔ · ·              |
| Narrow a scalar       | · ✔ ·   | · ✔ ·                      | · ✔ ·              |

The rejection you will actually see, reproduced on `kafka-json-schema-provider` **8.3.1** with v1
open holding only `field1` and v2 adding `dname`:

```text
BACKWARD, open v1, optional added   -> [{errorType:"OPTIONAL_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL", …}]
BACKWARD, open v1, required added   -> [{errorType:"REQUIRED_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL", …}]
BACKWARD, closed v1, optional added -> COMPATIBLE
```

**The constant depends on the line you run.** The historical 7.9.9 probe emitted the single
`PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL`. In the recorded 8.3.1 implementation that constant is
`@Deprecated` and the relevant path instead splits the case by whether the added property is required,
emitting `REQUIRED_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL`,
`REQUIRED_PROPERTY_WITH_DEFAULT_ADDED_TO_OPEN_CONTENT_MODEL` or
`OPTIONAL_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL`. Searching only for the old name can miss these
8.3.1 outcomes; do not generalize the probe to every future provider release.

Why rejection can be correct: "If the writer's schema has an open content model, then the writer may
have produced JSON documents with `myProperty` using a different type than the type expected for
`myProperty` in the reader's schema." Confluent's worked example: v1 has only `field1` and is open,
so `{"field1":"100","field2":123}` is legal under it; v2 adds `field2` as a string; the old data is
now invalid. Designing a closed initial contract can prevent this particular ambiguity, but do not
rewrite a published v1: closing an existing open contract can itself fail backward checking
(`ADDITIONAL_PROPERTIES_REMOVED` in the recorded 8.3.1 probe). A property with schema `true` adds
no restriction; a typed property requires a compatibility bridge, data migration or new contract
when existing values violate it. `LENIENT` suppresses some checks without making those values safe.
Treat the table as the stated provider's representative transitions, not every possible JSON Schema.

JSON Schema `default` is an annotation: validation does not automatically insert missing fields or
provide enum fallback. A registry checker accepting a default does not prove the runtime binder or
validator supplies it. Verify explicit transformation and validation separately.

## Jackson: null versus absent

JSON distinguishes `{"x": null}` from `{}` and JSON Schema distinguishes them
(`"type": ["string","null"]` versus `required`). A plain nullable POJO field often collapses them,
but initializers, setters, creator requirements and null policies can differ: missing may retain an
initializer while explicit null replaces it. For PATCH semantics, use an explicit presence flag,
a verified three-state wrapper/module, or `JsonNode.has`/`Map.containsKey` before reading the value.
Ordinary `Optional<T>` does not represent absent, explicit null and non-null by itself. Test all three
states on the actual mapper and then validate required business values.

Tolerance needs separate required-value validation: the recorded plain numeric-field example with
unknown properties ignored reads `{"ammount": 100}` as zero amount without a binding error. A required
creator property, initializer or subsequent validation can differ. `@JsonAnySetter` can observe the
unknowns; test the actual binder and validation instead of treating tolerance as silent success.

## Other registries — the vocabulary is portable, the semantics are not

**Apicurio Registry 3.3.x** uses the same seven mode names, but compatibility is a **rule**. Its
rule reference documents artifact-specific rules overriding global rules; an explicit artifact-level
`NONE` suppresses an inherited global check, whereas removing the local rule can expose it again.
No applicable compatibility rule means no compatibility check, not an absence of validity, integrity
or authorization checks. Verify the effective rules and endpoint/version; the native rule table does
not establish `ccompat` defaults. Apicurio also has separate validity and reference-integrity rules;
Confluent Data Contracts rulesets are not evidence of identical behavior.

**AWS Glue Schema Registry** has **eight** modes: `NONE`, `DISABLED`, `BACKWARD`, `BACKWARD_ALL`,
`FORWARD`, `FORWARD_ALL`, `FULL`, `FULL_ALL` — `_ALL` where everyone else says `_TRANSITIVE`, plus
`DISABLED` ("prevents versioning for a particular schema"). Comparison is against a **checkpoint**
version you can move with `UpdateSchema`, not simply the latest, so it can produce different
verdicts from Confluent for the same history. Format support is pinned and narrower: Avro 1.11.4;
JSON Schema **draft-04, draft-06 and draft-07 only** (no 2020-12); Protobuf proto2/proto3 without
`extensions` or `groups`. Check service-definition compatibility separately from message decoding;
format support alone does not establish what a provider checks. Limits: 100 registries and 10 000 schema versions per region,
170 KB per schema.

**Karapace** (Aiven): the official README inspected for this review lists Avro, JSON Schema and
Protobuf support and claims Schema Registry 6.1.1 API compatibility, with caveats for normalization
and exact error messages. This is a documentation claim, not a running-product or full-parity test.
Check the deployed release for reference handling, rules and newer framing such as GUID headers;
an API-compatibility label alone does not prove those paths.

Before trusting any of them, verify four things: what happens when no rule is configured; whether
"transitive" means all versions or a checkpoint; which JSON Schema drafts are implemented; and
whether the wire framing is Confluent's magic byte plus 4-byte id (Karapace and Apicurio `ccompat`:
yes; Glue: no, it has its own header).

Sources: [Confluent framing and migration order](https://docs.confluent.io/platform/current/schema-registry/fundamentals/serdes-develop/index.html),
[Confluent v8.3.1 serializer selection](https://github.com/confluentinc/schema-registry/blob/v8.3.1/avro-serializer/src/main/java/io/confluent/kafka/serializers/AbstractKafkaAvroSerializer.java),
[v8.3.1 schema lookup checks](https://github.com/confluentinc/schema-registry/blob/v8.3.1/schema-serializer/src/main/java/io/confluent/kafka/serializers/AbstractKafkaSchemaSerDe.java),
[JSON Schema default annotation](https://json-schema.org/understanding-json-schema/reference/annotations),
[Apicurio 3.3 rule reference](https://www.apicur.io/registry/docs/apicurio-registry/3.3.x/getting-started/assembly-rule-reference.html),
[AWS Glue schema registry](https://docs.aws.amazon.com/glue/latest/dg/schema-registry.html),
[Karapace README](https://github.com/Aiven-Open/karapace/blob/main/README.rst).
