# Registry and JSON Schema

Confluent Platform documentation as published for "current"; serialiser defaults read from
`confluentinc/schema-registry` `master`. Where another registry differs, the last section says so.

## What the check is, and what it cannot see

The compatibility check runs **at registration**, **per subject**, against the previous version(s)
_of that subject_ — not at produce time and not at consume time. "Compatibility checks are per
subject. Versions are tied to subjects." It therefore cannot verify:

- that any deployed consumer holds the schema version the check assumed;
- that the data on the topic is limited to the versions a non-transitive check compared;
- anything at all about a producer with `auto.register.schemas=false` + `use.latest.version=true` +
  `latest.compatibility.strict=false`, which skips the check by design;
- anything at all about a client that is not a registry-aware serialiser.

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
across registries, resolvable at `/schemas/guids/{guid}`. Confluent's migration order is
**producers → consumers**, because older consumers that ignore headers keep working while producers
roll out. None of this is Avro's `C3 01` single-object framing; the two are mutually unintelligible.

## Subject-name strategies

| Behaviour                     | `TopicNameStrategy` (default) | `RecordNameStrategy`                                     | `TopicRecordNameStrategy`               |
| ----------------------------- | ----------------------------- | -------------------------------------------------------- | --------------------------------------- |
| Subject                       | `<topic>` + `-key` / `-value` | `<fully-qualified record name>`                          | `<topic>-<fully-qualified record name>` |
| Unique per topic              | yes                           | **no**                                                   | yes                                     |
| Compatibility checked across… | all schemas in the topic      | any occurrence of that record name **across all topics** | that record name within that topic      |

Class names are prefixed `io.confluent.kafka.serializers.subject.`. The subject is the Avro record
fullname, the Protobuf message name, or — for JSON Schema — the **title**. The strategy configured on
the broker for schema-ID validation does **not** propagate to clients; configure it in both.

Three ways to carry several event types on one topic, with different failure modes:

1. **`TopicNameStrategy` plus a union/`oneof` wrapper**, in its modern form as **schema references**:
   register each event type as its own subject, then a union of references as the topic's subject.
   This requires `auto.register.schemas=false` + `use.latest.version=true`, or a serialiser registers
   the concrete event type and **overwrites the union as the latest schema** — symptom on a producer,
   `Schema not found; error code: 40403`.
2. **`RecordNameStrategy`** — a cluster-global namespace. `com.acme.OrderPlaced` means the same thing
   on every topic, including one owned by a team that will register an incompatible v2.
3. **`TopicRecordNameStrategy`** — per topic per type. Usually the least bad, at the cost of subject
   sprawl, and the option teams forget exists.

## Serialiser configuration

Defaults not stated in the skill body, read from `AbstractKafkaSchemaSerDeConfig` on `master`:
`use.latest.version` = `false` (L114), `latest.compatibility.strict` = `true` (L124),
`id.compatibility.strict` = `true`. The production posture Confluent documents:

```properties
auto.register.schemas=false
use.latest.version=true
latest.compatibility.strict=false   # ONLY when using schema references
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

**The constant depends on the line you run.** On 7.x this was the single
`PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL` — reproduced on 7.9.9. In 8.x that constant is `@Deprecated`
and is never used to build a message; 8.x splits the case by whether the added property is required,
emitting `REQUIRED_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL`,
`REQUIRED_PROPERTY_WITH_DEFAULT_ADDED_TO_OPEN_CONTENT_MODEL` or
`OPTIONAL_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL`. Grepping logs for the old name finds nothing on a
current registry.

Why the rejection is correct: "If the writer's schema has an open content model, then the writer may
have produced JSON documents with `myProperty` using a different type than the type expected for
`myProperty` in the reader's schema." Confluent's worked example: v1 has only `field1` and is open,
so `{"field1":"100","field2":123}` is legal under it; v2 adds `field2` as a string; the old data is
now invalid. The fix — "you need to manually set the `additionalProperties: false` attribute in the
initial schema" — requires editing v1, because closing it in v2 is itself rejected
(`ADDITIONAL_PROPERTIES_REMOVED`, reproduced on 8.3.1). `PUT /config
{"compatibilityPolicy":"LENIENT"}` makes JSON Schema behave like Avro instead, at the cost of no
longer detecting this case.

## Jackson: null versus absent

JSON distinguishes `{"x": null}` from `{}` and JSON Schema distinguishes them
(`"type": ["string","null"]` versus `required`). Jackson's POJO binding does not: a missing property
and an explicit `null` both leave the field at its Java default. An API that means "clear this value"
by `null` and "don't touch it" by absence needs `Optional<T>`/`JsonNullable` wrappers or a raw
`JsonNode`/`Map` pass. This is the JSON analogue of proto3 implicit presence and it bites the same
PATCH endpoints.

The cost of tolerance is real and worth naming: with unknown properties ignored, `{"ammount": 100}`
deserialises to a zero amount with no error. `@JsonAnySetter` lets you _observe_ the unknowns instead
of discarding them.

## Other registries — the vocabulary is portable, the semantics are not

**Apicurio Registry 3.3.x** uses the same seven mode names, but compatibility is a **rule** attached
at global, group or artifact level, and rules are inherited: "To disable a rule inherited from a
higher level, you must explicitly set the rule at the lower level to `NONE`." A registry with no rule
configured accepts anything — permissive by default where Confluent is `BACKWARD` by default. Its
Confluent-compatible `ccompat` endpoint is claimed by an in-repo ADR to default to `BACKWARD`;
that is **unverified** against a running product, and the user-facing docs say absent rules mean no
checking. Apicurio also has validity and integrity rules with no Confluent equivalent (Confluent's
nearest analogue is Data Contracts rulesets).

**AWS Glue Schema Registry** has **eight** modes: `NONE`, `DISABLED`, `BACKWARD`, `BACKWARD_ALL`,
`FORWARD`, `FORWARD_ALL`, `FULL`, `FULL_ALL` — `_ALL` where everyone else says `_TRANSITIVE`, plus
`DISABLED` ("prevents versioning for a particular schema"). Comparison is against a **checkpoint**
version you can move with `UpdateSchema`, not simply the latest, so it will produce different
verdicts from Confluent for the same history. Format support is pinned and narrower: Avro 1.11.4;
JSON Schema **draft-04, draft-06 and draft-07 only** (no 2020-12); Protobuf proto2/proto3 without
`extensions` or `groups`. It also extends compatibility to gRPC service definitions, which
Confluent's checker says nothing about. Limits: 100 registries and 10 000 schema versions per region,
170 KB per schema.

**Karapace** (Aiven) is Confluent-REST-API-compatible, but its current format support is
**unverified**: secondary sources disagree on whether it supports Protobuf today, and on how far its
API parity extends (one says "up to Confluent Schema Registry 6.1.1", which would predate schema
references and the 8.1.1 header format). Check its release notes for your version before assuming.

Before trusting any of them, verify four things: what happens when no rule is configured; whether
"transitive" means all versions or a checkpoint; which JSON Schema drafts are implemented; and
whether the wire framing is Confluent's magic byte plus 4-byte id (Karapace and Apicurio `ccompat`:
yes; Glue: no, it has its own header).
