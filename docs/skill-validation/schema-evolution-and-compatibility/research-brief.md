# Research brief: schema evolution and compatibility

**Topic**: data crossing a process boundary — Avro, Protobuf, JSON Schema — as practised from Java
services. The deploy-ordering problem, not the throughput problem.
**Audience**: senior/staff Java engineers. The eventual skill is an operational decision guide.
**Researched**: 2026-08-27/28. All local verification on Windows 11, JDK 25 via Maven, in a scratch
project (`avro 1.12.0` + `avro 1.11.4` side by side, `protobuf-java 4.32.0`).

Marks used below: **[SPEC]** normative text quoted from a specification; **[SRC]** read from library
source; **[VERIFIED]** I ran it and this is the output; **[DOC]** vendor documentation;
**[BLOG]** secondary source; **[FOLKLORE]** widely repeated and wrong or version-dependent;
**[UNVERIFIED]** could not confirm.

---

## 0. Versions checked

| Thing                                 | Version I checked                                             | How                                                                         |
| ------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Avro spec                             | 1.11.1 and 1.12.0 (`avro.apache.org/docs/<v>/specification/`) | fetched both, diffed                                                        |
| Avro Java                             | 1.12.0 and 1.11.4                                             | ran both; latest on Central is **1.12.2** (and **1.11.5** on the 1.11 line) |
| Protobuf language guide               | proto3 + proto2 (`protobuf.dev`, current)                     | fetched                                                                     |
| protobuf-java                         | 4.32.0 (ran); latest on Central **4.36.0**                    | ran                                                                         |
| protoc codegen source                 | `v32.0` `src/google/protobuf/compiler/java/full/enum.cc`      | fetched raw                                                                 |
| Jackson 2                             | 2.19 source; latest 2.x on Central **2.22.2**                 | fetched raw                                                                 |
| Jackson 3                             | 3.0 source; latest on Central **3.2.2**                       | fetched raw                                                                 |
| Confluent Platform docs               | "current" (page footer: last published 2026-08-27)            | fetched                                                                     |
| `kafka-schema-registry-maven-plugin`  | **8.3.1** (version in Confluent's own example pom)            | doc                                                                         |
| `confluentinc/schema-registry` source | `master`                                                      | fetched raw                                                                 |
| buf CLI                               | **v1.72.0** (GitHub latest release)                           | GitHub API                                                                  |
| Kafka                                 | `apache/kafka` `trunk` `docs/design/design.md`                | fetched raw                                                                 |
| JSON Schema                           | draft 2020-12 core                                            | fetched                                                                     |

Maven Central "latest" figures were read from `maven-metadata.xml` on 2026-08-28.

---

## 1. The core model

### 1.1 Compatibility is a property of a (writer, reader) pair and a direction

Avro states the model most plainly. There is a **writer's schema** — the schema the bytes were
produced with — and a **reader's schema** — the schema the consuming code expects. Deserialisation is
a _resolution_ of one against the other.

> "Therefore, files or systems that store Avro data should always include the writer's schema for that
> data. Avro-based remote procedure call (RPC) systems must also guarantee that remote recipients of
> data have a copy of the schema used to write that data. … Deserializing data into a newer schema is
> accomplished by specifying an additional schema, the results of which are described in Schema
> Resolution." **[SPEC]** Avro 1.12.0 specification, _Schema Resolution_ preamble (identical text in
> 1.11.1).

Protobuf and JSON have the same pair, just implicit: the reader schema is the generated class or the
DTO the consumer compiled against; the writer schema is whatever the producer had. Nothing on the wire
names either one (except under Confluent's framing, §5.3). This is why "is this schema backward
compatible?" is not a well-formed question. The well-formed question is "can a reader holding schema
R read bytes written with schema W?" — and both R and W must be named.

### 1.2 The four levels and _who upgrades first_

This is the part teams invert. Confluent's own wording, verbatim:

> - **BACKWARD** or **BACKWARD_TRANSITIVE**: "there is no assurance that consumers using older schemas
>   can read data produced using the new schema. Therefore, **upgrade all consumers before you start
>   producing new events**."
> - **FORWARD** or **FORWARD_TRANSITIVE**: "there is no assurance that consumers using the new schema
>   can read data produced using older schemas. Therefore, **first upgrade all producers** to using the
>   new schema and make sure the data already produced using the older schemas are not available to
>   consumers, then upgrade the consumers."
> - **FULL** or **FULL_TRANSITIVE**: "there are assurances that consumers using older schemas can read
>   data produced using the new schema and that consumers using the new schema can read data produced
>   using older schemas. Therefore, **you can upgrade the producers and consumers independently**."
> - **NONE**: "compatibility checks are disabled. Therefore, you need to be cautious about when to
>   upgrade clients."
>
> **[DOC]** Confluent Platform, _Schema Evolution and Compatibility_, "Order of upgrading clients".

The mnemonic that survives contact with an incident: **BACKWARD means the new reader is backward-
compatible with old data, so the reader goes first. FORWARD means the old reader can read forward into
new data, so the writer goes first.** The compatibility level is named for what the _new schema_ is,
not for who moves.

Two footnotes that matter operationally:

- FORWARD does **not** mean "producers first and you're done". Confluent's own text adds "and make
  sure the data already produced using the older schemas are not available to consumers" — FORWARD has
  a _drain_ requirement. On a Kafka topic with any retention at all, that condition is usually false.
  This is why FORWARD is rare in practice and BACKWARD is the default.
- **Kafka Streams is the exception to the exception.** A plain consumer reads only the input topic; a
  Streams app also reads its own changelog/state, which is old-schema data. > "The Kafka Streams apps
  must be upgraded first, then it safe to upgrade the upstream producer that writes into the input
  topic." **[DOC]** Same page. Confluent says only `BACKWARD` (and the stronger `FULL`,
  `FULL_TRANSITIVE`, `BACKWARD_TRANSITIVE`) are supported for Streams.

### 1.3 Transitive vs non-transitive is the retention-window knob

> "If compatibility is configured as transitive, then it checks compatibility of a new schema against
> all previously registered schemas; otherwise, it checks compatibility of a new schema only against
> the latest schema." … "The Confluent Schema Registry default compatibility type BACKWARD is
> non-transitive." **[DOC]** Confluent, same page.

So the non-transitive levels encode an assumption: _nothing older than one schema version is still
readable_. That assumption is a statement about your retention window, and it is checked nowhere.

| Store                                           | Effective retention | Level the data actually requires                                                                                                                 |
| ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request/response HTTP or gRPC                   | seconds (in flight) | non-transitive is genuinely enough; the "old data" is a request that already landed                                                              |
| Kafka topic, `cleanup.policy=delete`, 7d        | 7 days              | non-transitive is safe only if you ship fewer than one schema change per retention period, _and_ never replay from the earliest offset           |
| Kafka topic, `cleanup.policy=compact`           | unbounded per key   | **transitive, always**                                                                                                                           |
| Event-sourced store / Kafka as system of record | infinite            | **transitive, always** — and see §7.3                                                                                                            |
| Blob store of Avro object-container files       | infinite            | transitive; each file carries its own writer schema, so old readers still work, but every new reader must resolve every historical writer schema |

Kafka's compaction guarantee, from the primary source:

> "Log compaction ensures that Kafka will always retain at least the last known value for each message
> key within the log of data for a single topic partition." … "Any consumer progressing from the start
> of the log will see at least the final state of all records in the order they were written.
> Additionally, all delete markers for deleted records will be seen, provided the consumer reaches the
> head of the log in a time period less than the topic's `delete.retention.ms` setting (the default is
> 24 hours)." **[SPEC-ish]** `apache/kafka` `trunk` `docs/design/design.md`, _Log Compaction_, lines
> 368 and 424.

A record written five years ago under schema v1 is still the tail of the log for its key. `BACKWARD`
(non-transitive) will happily let you register v7 that cannot read v1. Nothing fails until a consumer
group resets to earliest, or a new service bootstraps its state from the topic. That is the single
most expensive schema incident shape in this whole brief.

### 1.4 Confluent's per-format allowed-changes matrix

Reproduced verbatim from the _Schema Evolution and Compatibility_ summary tables. ✔ = allowed.

**Avro and Protobuf**

| Allowed change             | Avro BW | Avro FW | Avro Full | Proto BW | Proto FW | Proto Full |
| -------------------------- | :-----: | :-----: | :-------: | :------: | :------: | :--------: |
| Add optional field         |    ✔    |    ✔    |     ✔     |    ✔     |    ✔     |     ✔      |
| Remove optional field      |    ✔    |    ✔    |     ✔     |    ✔     |    ✔     |     ✔      |
| Add required field         |         |    ✔    |           |          |          |            |
| Remove required field      |    ✔    |         |           |          |          |            |
| Add union/oneof variant    |    ✔    |         |           |    ✔     |          |            |
| Remove union/oneof variant |         |    ✔    |           |          |    ✔     |            |
| Widen a scalar type        |    ✔    |         |           |    ✔     |    ✔     |     ✔      |
| Narrow a scalar type       |         |    ✔    |           |    ✔     |    ✔     |     ✔      |

Note the Protobuf column for scalar widening/narrowing: _both_ directions are fully compatible,
because `int32`/`int64`/`uint32`/`uint64`/`bool` share a varint wire type and neither reader nor writer
can tell. That is not safety; that is the _absence of detection_. See §3.5.

**JSON Schema** is split by `compatibilityPolicy` (`LENIENT` / `STRICT`, set via
`PUT /config {"compatibilityPolicy": "LENIENT"}`) and, under STRICT, by content model:

| Allowed change             | Lenient BW/FW/Full | Strict, **open** (`additionalProperties: true` or omitted) BW/FW/Full | Strict, **closed** (`false`) BW/FW/Full |
| -------------------------- | ------------------ | --------------------------------------------------------------------- | --------------------------------------- |
| Add optional field         | ✔ ✔ ✔              | · ✔ ·                                                                 | ✔ · ·                                   |
| Remove optional field      | ✔ ✔ ✔              | ✔ · ·                                                                 | · ✔ ·                                   |
| Add required field         | · ✔ ·              | · ✔ ·                                                                 | · · ·                                   |
| Remove required field      | ✔ · ·              | ✔ · ·                                                                 | · · ·                                   |
| Add union/oneof variant    | ✔ · ·              | ✔ · ·                                                                 | ✔ · ·                                   |
| Remove union/oneof variant | · ✔ ·              | · ✔ ·                                                                 | · ✔ ·                                   |
| Widen a scalar type        | ✔ · ·              | ✔ · ·                                                                 | ✔ · ·                                   |
| Narrow a scalar type       | · ✔ ·              | · ✔ ·                                                                 | · ✔ ·                                   |

**The headline**: under STRICT with the default open content model, _adding an optional field is not
backward compatible_. See §4.4 — this surprises everyone.

---

## 2. Avro

Spec version note: I fetched the 1.11.1 and 1.12.0 specifications and **diffed the entire Schema
Resolution section — it is byte-identical**. [VERIFIED] There is no resolution-rule difference between
the 1.11.x and 1.12.x specs. There _is_ a difference in the **union default** wording elsewhere in the
spec, and a corresponding behaviour change in the Java implementation (§2.7). Avro 1.12.0's release
notes list resolution fixes only in the Rust and Python implementations (AVRO-3814, AVRO-3818,
AVRO-3622) plus better incompatibility reporting (AVRO-3612).

### 2.1 The resolution rules, verbatim

> - **Type promotion**: "int is promotable to long, float, or double; long is promotable to float or
>   double; float is promotable to double; string is promotable to bytes; bytes is promotable to
>   string"
> - **Field matching**: "the ordering of fields may be different: fields are matched by name. schemas
>   for fields with the same name in both records are resolved recursively."
> - **Writer-only field**: "if the writer's record contains a field with a name not present in the
>   reader's record, the writer's value for that field is ignored."
> - **Reader-only field with a default**: "if the reader's record schema has a field that contains a
>   default value, and writer's schema does not have a field with the same name, then the reader should
>   use the default value from its field."
> - **Reader-only field without a default**: "if the reader's record schema has a field with no default
>   value, and writer's schema does not have a field with the same name, an error is signalled."
> - **Enum**: "if the writer's symbol is not present in the reader's enum and the reader has a default
>   value, then that value is used, otherwise an error is signalled."
>
> **[SPEC]** Avro 1.12.0 specification, _Schema Resolution_.

Aliases:

> "Named types and fields may have aliases. An implementation may **optionally** use aliases to map a
> writer's schema to the reader's." … "Aliases function by re-writing the writer's schema using aliases
> from the reader's schema." **[SPEC]** _Aliases_.

Note the "optionally". Alias support is not guaranteed across language implementations; the Java
implementation does honour them (verified below).

### 2.2 What the Java implementation actually does — [VERIFIED] on Avro 1.12.0

Run via `SchemaCompatibility.checkReaderWriterCompatibility(reader, writer)` plus an actual
`GenericDatumWriter` → `GenericDatumReader` round trip.

| Change (reader vs writer)                                               | `SchemaCompatibility` verdict                                                          | Actual read                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Add field **with** default                                              | `COMPATIBLE`                                                                           | `{"id": 7, "nick": "anon"}`                                            |
| Add field **without** default                                           | `INCOMPATIBLE` `READER_FIELD_MISSING_DEFAULT_VALUE` at `/fields/1`                     | `AvroTypeException: Found U, expecting U, missing required field nick` |
| Remove a field                                                          | `COMPATIBLE`                                                                           | `{"id": 7}` — writer's value ignored                                   |
| Rename **with** `aliases:["id"]`                                        | `COMPATIBLE`                                                                           | `{"userId": 7}`                                                        |
| Rename **without** alias                                                | `INCOMPATIBLE` `READER_FIELD_MISSING_DEFAULT_VALUE` at `/fields/0`                     | —                                                                      |
| `int` → `long` (reader long)                                            | `COMPATIBLE`                                                                           | `{"id": 7}`                                                            |
| `long` → `int` (reader int)                                             | `INCOMPATIBLE` `TYPE_MISMATCH: reader type: INT not compatible with writer type: LONG` | —                                                                      |
| `string` → `bytes`                                                      | `COMPATIBLE`                                                                           | —                                                                      |
| `bytes` → `string`                                                      | `COMPATIBLE`                                                                           | —                                                                      |
| Writer enum has extra symbol, reader **has** `default`                  | `COMPATIBLE`                                                                           | `{"c": "RED"}` (fell back to default)                                  |
| Writer enum has extra symbol, reader has **no** `default`               | `INCOMPATIBLE` `MISSING_ENUM_SYMBOLS: [BLUE]`                                          | `AvroTypeException: No match for BLUE`                                 |
| Reader union is a **superset** (`[null,string]` → `[null,string,long]`) | `COMPATIBLE`                                                                           | —                                                                      |
| Reader union is a **subset**                                            | `INCOMPATIBLE` `MISSING_UNION_BRANCH: reader union lacking writer type: LONG`          | —                                                                      |
| Writer non-union `string`, reader `[null,string]`                       | `COMPATIBLE`                                                                           | —                                                                      |
| Change a field's default only                                           | `COMPATIBLE`                                                                           | see §2.8 — **and the old bytes now read differently**                  |

The important structural point: **a rename is an add plus a remove.** Avro's checker reports it as
"reader field has no default value", exactly the same incompatibility as adding a required field.
`aliases` on the _reader_ is the only thing that turns a rename back into a rename.

### 2.3 Enums and the `default` symbol

The `default` attribute on an enum type:

> "A default value for this enumeration, used during resolution when the reader encounters a symbol from
> the writer that isn't defined in the reader's schema (optional). The value provided here must be a
> JSON string that's a member of the symbols array." **[SPEC]** Avro 1.12.0, _Enums_.

**Introduced in Avro 1.9.0.** The 1.9.0 specification is the first to document it. Earlier readers
tolerate but ignore the attribute (it is not a parsing-canonical-form attribute, so it is stripped by
canonicalisation — see §2.9). Practical consequence: **put a `default` on every enum, in the first
version, before you ever need it** — you cannot retro-fit forward tolerance into readers already
deployed.

The default fires only for an _unknown symbol_. It is not a substitute for a field-level default: if
the field itself is absent from the writer, the enum's `default` does nothing.

### 2.4 Unions

> "Unions may not contain more than one schema with the same type, except for the named types record,
> fixed and enum." … "Unions may not immediately contain other unions." **[SPEC]** Avro 1.12.0,
> _Unions_.

Resolution rule for unions is the superset rule: the reader's union must contain every branch the
writer might have used. Adding a branch is safe for readers that already have it (i.e. it is a
consumer-first change); removing a branch is a producer-first change.

### 2.5 Why Avro needs the writer schema at read time, and what that costs

Avro's binary encoding carries **no field names, no tags, no type markers** — a record is just the
concatenation of its fields' encodings in declaration order. Nothing in the bytes tells you which
schema wrote them. So the writer schema must travel some other way. Three mechanisms in the wild:

**(a) Object container file.** The writer schema is in the file header. Self-describing; no registry.

**(b) Avro single-object encoding.** [SPEC] Avro 1.12.0, _Single object encoding_:

> "A two-byte marker, `C3 01`, to show that the message is Avro and uses this single-record format
> (version 1). The 8-byte little-endian CRC-64-AVRO fingerprint of the object's schema. The Avro object
> encoded using Avro's binary encoding."
>
> "Implementations use the 2-byte marker to determine whether a payload is Avro. This check helps avoid
> expensive lookups that resolve the schema from a fingerprint, when the message is not an encoded Avro
> payload."

The fingerprint is over the **Parsing Canonical Form**, and 64-bit Rabin is the recommended algorithm:

> "64-bit fingerprints should guarantee uniqueness for schema caches of up to a million entries (for such
> a cache, the chance of a collision is 3E-8)." … "These fingerprints are not meant to provide any
> security guarantees, even the longer SHA-256-based ones." [SPEC]

**(c) Confluent wire format** — see §5.3. Different bytes, different framing, not interoperable with
(b). A consumer configured for one and fed the other produces a garbage schema id and a
`SerializationException` / "Unknown magic byte".

### 2.6 Parsing Canonical Form: what it strips, and the fingerprint trap

> "STRIP: Keep only attributes that are relevant to parsing data, which are: type, name, fields, symbols,
> items, values, size. Strip all others (e.g., doc and aliases)." **[SPEC]** Avro 1.12.0, _Parsing
> Canonical Form_.

[VERIFIED] on Avro 1.12.0: `SchemaNormalization.parsingFingerprint64` of a record with and without a
`"doc"` attribute is the **same value** (`133121827622752327`). Two schemas that differ only in
documentation are the same schema for fingerprinting purposes.

**Trap**: Confluent Schema Registry does _not_ use the parsing canonical form by default. It registers
and looks up by the _string representation_ — so the same schema with a `doc` added is a **different
schema** to the registry, gets a new schema id, and consumes a version. `normalize.schemas=true` (or
`?normalize=true` on the REST call) is what makes the registry semantic rather than syntactic; its
default is `false` [SRC]. See §5.5.

Note also that canonical form strips **aliases** — so a fingerprint match tells you nothing about
whether alias-based rename resolution will work.

### 2.7 The union-default rule **changed between 1.11 and 1.12** — [FOLKLORE, version-dependent]

This is the single most misstated Avro rule.

**Avro ≤ 1.11.x [SPEC]:**

> "Default values for union fields correspond to the **first** schema in the union."
> "(Note that when a default value is specified for a record field whose type is a union, the type of
> the default value must match **the first element** of the union. Thus, for unions containing 'null',
> the 'null' is usually listed first, since the default value of such unions is typically null.)"

**Avro 1.12.0 [SPEC]:**

> "Default values for union fields correspond to the **first schema that matches** in the union."
> "(Note that when a default value is specified for a record field whose type is a union, the type of
> the default value must match with **one element** of the union."

The Java implementation followed. [VERIFIED], with a plain `new Schema.Parser()` (no options set):

```
--- avro 1.11.4 ---
["null","string"] default "x"   -> REJECTED: AvroTypeException: Invalid default for field v: "x" not a ["null","string"]
["string","null"] default null  -> REJECTED: AvroTypeException: Invalid default for field v: null not a ["string","null"]

--- avro 1.12.0 ---
["null","string"] default "x"   -> ACCEPTED
["string","null"] default null  -> ACCEPTED
["null","string"] default 42    -> REJECTED (matches no branch at all)
```

Also note: on **1.11.4** `new Schema.Parser()` validates defaults _by default_; on **1.12.0** the plain
parser accepts, and even `setValidateDefaults(true)` accepts `["null","string"]` + `"x"`.

And a genuine discrepancy inside 1.12.0 [VERIFIED]:

```
["null","string"] declared default "x" -> Field.defaultVal() = null       <-- lies
["null","string"] read of an old record -> {"id": 1, "v": "x"}            <-- resolver is right
["string","null"] declared default "x" -> Field.defaultVal() = x
```

`Schema.Field.defaultVal()` returns `null` for a non-first-branch union default while the actual
`GenericDatumReader` resolution correctly substitutes `"x"`. Any tooling that introspects
`defaultVal()` — converters, code generators, Connect transforms, custom compatibility linters — will
disagree with the resolver on 1.12.0. Treat this as a live bug surface. [UNVERIFIED] whether this is
tracked upstream; I did not find a JIRA for it.

**Operational rule regardless of version**: keep writing `["null", "T"]` with `"default": null`. It is
correct under both spec versions, under every language implementation, and it is what Confluent's own
documentation recommends:

> "Avro requires that the default value conform to the first branch of the union, so it is common to
> put 'null' first and use `"default": null` for fields that are intended to be optional for schema
> evolution. Note that Avro does not have a built-in optional keyword like Protobuf; instead, the
> union-with-null pattern serves this purpose." **[DOC]** Confluent (note: Confluent's doc still states
> the pre-1.12 rule as though it were current — [FOLKLORE] in a vendor doc).

### 2.8 Changing a field's default is a _data_ change, not a schema change — [VERIFIED]

Both Avro's checker and Confluent's compatibility check call this `COMPATIBLE`. It is, in the narrow
sense. But:

```
writer schema D0: {a: int}                          (record already on disk: a=5)
reader D1: {a: int, b: int = 1}  -> reads {"a": 5, "b": 1}
reader D2: {a: int, b: int = 2}  -> reads {"a": 5, "b": 2}   <-- SAME BYTES
```

The default is applied at read time, retroactively, to every record ever written without that field.
Changing a default silently rewrites history for every old record, and the compatibility gate will
never flag it. This is a rule the skill must state loudly: **a default is not an initialiser; it is a
permanent read-time reinterpretation of all prior data.**

### 2.9 Avro summary table

| Change                                           |          Reader-first (BACKWARD)           | Writer-first (FORWARD) | Notes                                                             |
| ------------------------------------------------ | :----------------------------------------: | :--------------------: | ----------------------------------------------------------------- |
| Add field with default                           |                     ✔                      |           ✔            | fully compatible                                                  |
| Add field without default                        |                     ✘                      |           ✔            | new readers cannot read old data                                  |
| Remove field that had a default                  |                     ✔                      |           ✔            | fully compatible                                                  |
| Remove field without a default                   |                     ✔                      |           ✘            | old readers cannot read new data                                  |
| Rename with `aliases` on the reader              |                     ✔                      |           ✘            | forward requires the _old_ reader to know the new name — it can't |
| Rename without aliases                           |                     ✘                      |           ✘            | add + remove                                                      |
| `int`→`long`, `float`→`double`, `string`↔`bytes` |                     ✔                      |           ✘            | promotion is one-directional                                      |
| Add enum symbol                                  | ✔ only if the reader has an enum `default` |           ✘            | put the `default` in v1                                           |
| Add union branch                                 |                     ✔                      |           ✘            |                                                                   |
| Remove union branch                              |                     ✘                      |           ✔            |                                                                   |
| Change a field's default                         |                     ✔                      |           ✔            | but see §2.8 — changes what old data _means_                      |
| Add/change `doc`                                 |                     ✔                      |           ✔            | new registry version unless `normalize.schemas=true`              |

---

## 3. Protobuf

Base: `protobuf.dev` language guide (proto3 and proto2), _Updating A Message Type_. All local runs on
`protobuf-java 4.32.0` using `DynamicMessage` over descriptors built programmatically, so the results
are the runtime's, not a generated class's.

### 3.1 The field number is the identity

Nothing else on the wire identifies a field. Names exist only in the `.proto` file and in the JSON
mapping.

> "Changing field numbers for any existing field is not safe" — **[SPEC]** protobuf.dev, proto3,
> _Updating A Message Type_ (wire-unsafe changes).

`reserved` is the mechanism that makes removal safe:

> `reserved 2, 15, 9 to 11;` — "Reserved ranges are inclusive." Also reserve names:
> `reserved "foo", "bar";` "(affects TextProto/JSON parsing)". **[SPEC]** protobuf.dev, _Reserved
> Fields_.

Reserve the **number** to stop the wire-level catastrophe (§3.6) and the **name** to stop the JSON-level
one. Both, every time, in the same commit that deletes the field.

### 3.2 Safe / conditionally safe / unsafe, verbatim

**Wire-safe** [SPEC]:

- "Adding new fields is safe"
- "Removing fields is safe"
- "Adding additional values to an enum is safe"
- "Changing a single explicit presence field or extension into a member of a **new** `oneof` is safe"
- "Changing a `oneof` which contains only one field to an explicit presence field is safe"

**Wire-unsafe** [SPEC]:

- "Changing field numbers for any existing field is not safe"
- "Moving fields into an existing `oneof` is not safe"

**Wire-compatible but information-losing** [SPEC]:

- `int32`, `uint32`, `int64`, `uint64`, `bool` are mutually compatible
- `sint32` ↔ `sint64` compatible with each other but **not** with the other integer types
- `string` ↔ `bytes` compatible "if bytes are valid UTF-8"
- `fixed32` ↔ `sfixed32`; `fixed64` ↔ `sfixed64`
- `map<K,V>` ↔ the corresponding `repeated` message field is binary compatible

Confluent's derived Protobuf backward rules add two Confluent-specific ones [DOC]:

- "A field number can be reused by a new field of the same type. A field number cannot be reused by a
  new field of a different type."
- "Type enum is compatible with int32, uint32, int64, and uint64 (can be swapped in the same field)."
- "For string, bytes, and message fields, singular fields are compatible with repeated fields. …
  clients that expect this field to be singular will take the last input value if it is a primitive
  type field or merge all input elements if it is a message type field. **Note that this is not
  generally safe for numeric types, including bool and enum.** Repeated fields of numeric types can be
  serialized in the packed format, which will not be parsed correctly when a singular field is
  expected."

[VERIFIED] both halves of that last one:

```
repeated string ["a","b"] read as singular string       -> "b"                (last wins)
packed repeated int32 [1,2] bytes = 0a 02 01 02
  read as singular int32                                -> field unset (0), bytes land in unknownFields[1]
```

The numeric case fails **silently and completely**: the singular reader sees `0`, no exception.

### 3.3 Field presence: the "did they send 0 or nothing?" bug class

> **Optional fields**: "the field is set, and contains a value that was explicitly set or parsed from
> the wire. It will be serialized to the wire" or "the field is unset, and will return the default
> value. It will not be serialized to the wire."
> **Implicit fields**: for non-message types, "the field is set to the default (zero) value. It will not
> be serialized to the wire. In fact, you cannot determine whether the default … value was set or parsed
> from the wire or not provided at all." **[SPEC]** protobuf.dev, proto3, field cardinality.

[VERIFIED] on protobuf-java 4.32.0:

```
implicit int32:  explicit 0 -> 0 bytes on the wire, hasField() = false
proto3 optional: explicit 0 -> 2 bytes (08 00),     hasField(explicit 0) = true, hasField(absent) = false
```

An implicitly-present field cannot express "the user cleared their credit limit" as distinct from "the
producer's build predates this field". Every partial-update, every patch endpoint, every "0 means
unlimited" flag is a bug waiting on this. `optional` (which costs a synthetic `oneof` in the descriptor
and one `hasX()` method in Java) is the fix.

**Version**: proto3 `optional` was experimental behind `--experimental_allow_proto3_optional`, and:

> "Optional fields for proto3 are enabled by default, and no longer require the
> `--experimental_allow_proto3_optional` flag." **[DOC]** protobuf **v3.15.0** release notes.

Anyone still repeating "proto3 removed optional" is quoting 2015. [FOLKLORE]

Message-typed fields always have presence, `optional` or not, because a submessage's absence is
representable on the wire.

### 3.4 Renaming: free on the wire, breaking in JSON

The binary encoding never carries the name, so a rename is a pure source-level change. ProtoJSON
derives the JSON key from the field name (lowerCamelCase, overridable with `json_name`), so a rename
_does_ change the JSON contract. If any consumer speaks ProtoJSON — a grpc-gateway, Connect, a browser
— treat a rename as breaking and set `json_name` to the old key instead. This is precisely why buf has
a separate `WIRE_JSON` category (§9.2).

### 3.5 Type changes: which ones corrupt, and how quietly — [VERIFIED]

```
int32(300) bytes = 08 ac 02
  read by an int64-typed field 1  -> count: 300          (clean)
int32(-1)
  read by an int64-typed field 1  -> count: -1           (clean; -1 int32 is a 10-byte varint)

int32 bytes (08 ac 02)
  read by a STRING-typed field 1  -> value = ""   unknownFields = [1]   NO EXCEPTION
```

The wire-type mismatch case (varint bytes hitting a length-delimited field) does not throw. The parser
routes the bytes to the unknown-field set and the typed accessor returns the zero value. A consumer
that changed `int32 amount = 3` to `string amount = 3` reads **every message as `""`** and logs
nothing.

### 3.6 Reusing a field number: garbage that deserialises into a valid object — [VERIFIED]

Field 5 was `string email`. Someone deletes it, later reuses 5 for `Address address`. Both are wire
type 2 (length-delimited), so the parser will attempt the reinterpretation:

```
payload "\nabc"           -> parsed as message: address { street: "abc" }   <-- valid object, wrong data
payload "bob@example.com" -> InvalidProtocolBufferException: While parsing a protocol message,
                             the input ended unexpectedly in the middle of a field.
```

Whether you get an exception or a plausible-looking object depends on the _content_ of the old value.
`"\nabc"` happens to be `field 1, wire type 2, length 3, "abc"` — a perfectly well-formed `Address`.
This is the case that survives every test with synthetic data and fails on one customer's record in
production. `reserved 5;` costs nothing and makes it impossible.

### 3.7 Unknown-field retention: dropped in 3.0, restored in 3.5

> "Unknown fields are now preserved in proto3 for most of the language implementations for proto3 by
> default." … Java: "Proto3 messages are now preserving unknown fields by default. If you'd like to drop
> unknown fields, please use the DiscardUnknownFieldsParser API." **[DOC]** protobuf **v3.5.0** release
> notes.

[VERIFIED] on 4.32.0 — the round trip is byte-identical:

```
new bytes      = 08 05 12 05 68 65 6c 6c 6f     (field 1 = 5, field 2 = "hello")
parsed by an OLD descriptor that has only field 1, then re-serialised:
old round trip = 08 05 12 05 68 65 6c 6c 6f     identical = true, unknown = [2]
after DiscardUnknownFieldsParser = 08 05        (field 2 gone)
```

Why this matters: **a proxy, enricher or router that parses a message and re-emits it does not destroy
fields it does not know about** — on protobuf ≥ 3.5. On 3.0–3.4 it silently did. Two exceptions still
apply on any version [SPEC]: unknown fields are lost if you "Serialize a proto to JSON", or if you copy
field-by-field instead of using "message-oriented APIs, such as `CopyFrom()` and `MergeFrom()`".

### 3.8 Enums: open in proto3, and what Java does with an unknown number

> "Enums require the first defined enum value … must be 0" and should follow the pattern
> `ENUM_TYPE_NAME_UNSPECIFIED`. **[SPEC]**
> "In languages that support open enum types with values outside the range of specified symbols, such as
> C++ and Go, the unknown enum value is simply stored as its underlying integer representation. In
> languages with closed enum types such as Java, a case in the enum is used to represent an
> unrecognized value." **[SPEC]** protobuf.dev, proto3, _Enumerations_.

Java's "case" is `UNRECOGNIZED`. From the protoc source, `v32.0`
`src/google/protobuf/compiler/java/full/enum.cc`, generated only when the enum is **not closed**
(i.e. proto3 / open) [SRC]:

```cpp
// line 118 — the extra constant
printer->Print("${$UNRECOGNIZED$}$(-1),\n", ...);

// lines 171-189 — getNumber()
"public final int getNumber() {\n"
"  if (this == UNRECOGNIZED) {\n"
"    throw new java.lang.IllegalArgumentException(\n"
"        \"Can't get the number of an unknown enum value.\");\n"
"  }\n"
"  return value;\n"
"}\n"

// lines 255-268 — getValueDescriptor()
"  if (this == UNRECOGNIZED) {\n"
"    throw new java.lang.IllegalStateException(\n"
"        \"Can't get the descriptor of an unrecognized enum value.\");\n"
"  }\n"
```

So in Java, adding an enum value is **producer-first-hostile**: an old consumer that receives the new
number gets `UNRECOGNIZED`, and:

- `getNumber()` → `IllegalArgumentException("Can't get the number of an unknown enum value.")`
- `getValueDescriptor()` → `IllegalStateException`
- `forNumber(int)` → returns `null` for an unknown number [SPEC]
- a `switch` over the enum silently falls to `default`, or has no matching case at all

The escape hatch is the generated `getXValue()` / `setXValue(int)` integer accessors — code that must
tolerate unknown values should read the int, not the enum. Also note the raw number _is_ preserved on
the wire; [VERIFIED] a `DynamicMessage` parse of enum number 9 against a 2-symbol enum yields
`UNKNOWN_ENUM_VALUE_Status_9` and re-serialises to the identical `08 09`.

`getNumber()` throwing on `UNRECOGNIZED` is the single most common Protobuf-in-Java production surprise
and is not documented in the Java generated-code guide — I confirmed the guide "does not explicitly
document what `getNumber()` returns for UNRECOGNIZED"; the codegen source is the only primary source.

### 3.9 `oneof`

> "Changing a single explicit presence field … into a member of a **new** `oneof` is safe" and
> "Changing a `oneof` which contains only one field to an explicit presence field is safe." **[SPEC]**
> Everything else is a minefield: "Moving fields into an existing `oneof` is not safe"; "You may lose
> some of your information (some fields will be cleared) after the message is serialized and parsed";
> "This may clear your currently set oneof field" when deleting and re-adding oneof fields. Splitting or
> merging oneofs has the same problem. [SPEC]

The mechanism: a `oneof` is a _reader-side_ construct — setting one member clears the others. Two
fields that were independently settable become mutually exclusive, so a message that legitimately had
both loses one on the next round trip.

### 3.10 `required` in proto2 is the classic one-way door

> **"Required Is Forever"** — "Required fields should be treated as permanent, immutable elements of the
> message definition." … changing `required` to `optional` is nearly impossible to do safely if any old
> readers exist, as they will reject messages lacking that field. The guide also notes the enum
> interaction: an unrecognised enum value is treated as _missing_, which then fails the required check.
> The recommendation is to enforce required semantics at the application layer. **[SPEC]**
> protobuf.dev, proto2 guide.

Both halves are one-way: you cannot add `required` (old writers omit it) and you cannot remove it (old
readers demand it). If a proto2 schema in your estate has `required` fields, the only exit is a new
field number with `optional`, dual-write, migrate, and eventually a new message type.

Proto2 has always preserved unknown fields [SPEC], so the 3.0–3.4 gap is a proto3-only story.

### 3.11 Protobuf summary table

| Change                                       |    Reader-first    |    Writer-first    | Notes                                                                |
| -------------------------------------------- | :----------------: | :----------------: | -------------------------------------------------------------------- |
| Add a field (new number)                     |         ✔          |         ✔          | fully compatible; presence semantics decide whether you can tell     |
| Remove a field + `reserved <n>, "<name>";`   |         ✔          |         ✔          | reserve both, in the same commit                                     |
| Remove a field without `reserved`            |         ✔          |      ✔ _now_       | the bomb detonates on a future reuse                                 |
| Reuse a field number, different type         |         ✘          |         ✘          | §3.6 — garbage-into-valid-object                                     |
| Reuse a field number, same type              | (Confluent allows) | (Confluent allows) | wire-safe, semantically a lie — do not                               |
| Rename a field                               |         ✔          |         ✔          | wire-safe; **breaks ProtoJSON** unless you set `json_name`           |
| `int32`↔`int64`↔`uint32`↔`uint64`↔`bool`     |         ✔          |         ✔          | undetectable in both directions; sign/overflow is on you             |
| `sint32`↔`sint64`                            |         ✔          |         ✔          | not compatible with the plain int types                              |
| `string`↔`bytes`                             |         ✔          |         ✔          | only if the bytes are valid UTF-8                                    |
| any other type change on the same number     |         ✘          |         ✘          | silent zero value + unknown-field bucket                             |
| singular → `repeated` (string/bytes/message) |         ✔          |         ✔          | last-wins / merge                                                    |
| singular → `repeated` (numeric/bool/enum)    |         ✘          |         ✘          | packed encoding breaks it, silently                                  |
| implicit → `optional` on the same field      |         ✔          |         ✔          | wire-identical for non-zero values; changes zero-value serialisation |
| Add an enum value                            |     ✘ in Java      |         ✔          | `UNRECOGNIZED`; ship the reader first, or read `getXValue()`         |
| Field into a **new** `oneof`                 |         ✔          |         ✔          |                                                                      |
| Field into an **existing** `oneof`           |         ✘          |         ✘          |                                                                      |
| `required` anything (proto2)                 |         ✘          |         ✘          | one-way door                                                         |

---

## 4. JSON and JSON Schema

### 4.1 JSON without a schema is not flexible; it delegates compatibility to each consumer's parser

There is no negotiated contract. Whether an added field breaks a consumer depends entirely on that
consumer's deserialiser configuration, which the producer cannot see, cannot query, and cannot test.
"Flexible" describes the _format_; the _system_ is as strict as its strictest reader, and you find out
which reader that is in production.

### 4.2 Jackson `FAIL_ON_UNKNOWN_PROPERTIES` — the actual defaults, which have changed

**Jackson 2.x** [SRC] `com/fasterxml/jackson/databind/DeserializationFeature.java` (2.19 branch):

```java
/**
 * ...
 * Feature is enabled by default (meaning that a
 * {@link JsonMappingException} will be thrown if an unknown property
 * is encountered).
 */
FAIL_ON_UNKNOWN_PROPERTIES(true),
```

**Jackson 3.0** [SRC] `tools/jackson/databind/DeserializationFeature.java` (3.0 branch):

```java
/**
 * ...
 * Feature is disabled by default as of Jackson 3.0 (in 2.x it was enabled).
 */
FAIL_ON_UNKNOWN_PROPERTIES(false),
```

So the classic "consumer throws on an additive change" is a Jackson-2 default. But — and this is where
teams get confused about whether the folklore is true — **the Spring stack has always turned it off**:

- [SRC] `spring-web` `Jackson2ObjectMapperBuilder`: Javadoc lists
  "`DeserializationFeature#FAIL_ON_UNKNOWN_PROPERTIES` is disabled", and the builder does
  `configureFeature(objectMapper, FAIL_ON_UNKNOWN_PROPERTIES, false)` unless the caller set it.
- [SRC] `spring-kafka` `JacksonUtils.enhancedObjectMapper()`:
  `.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)`.

**Therefore**: a Spring Boot `@RestController`, `RestClient` or Spring Kafka `JsonDeserializer` using
the container-managed mapper tolerates unknown properties. The consumer that blows up is the one with a
**hand-rolled `new ObjectMapper()`** — in a util class, a static field, a custom `Deserializer`, a
library — on Jackson 2. That is the precise diagnosis the skill should give, because "Jackson fails on
unknown properties" is simultaneously true (the library default) and false (in the framework the reader
is almost certainly using). [FOLKLORE, half-true]

**The tension, stated honestly**: `FAIL_ON_UNKNOWN_PROPERTIES=false` buys forward compatibility and
loses typo detection — `{"amount": 100}` misspelled as `{"ammount": 100}` deserialises to a zero
amount with no error. The defensible position is: tolerant at the boundary (accept unknown fields),
strict inside (validate required fields explicitly, and use `@JsonAnySetter` or a schema-validation
step if you want to _observe_ the unknowns rather than ignore them). Alternatively
`FAIL_ON_UNKNOWN_PROPERTIES=true` in tests and CI, `false` in production — which detects typos in your
own fixtures without breaking on a partner's additive change.

### 4.3 What JSON Schema 2020-12 itself defines — and does not

The spec's own scope: "JSON Schema is a JSON media type for defining the structure of JSON data. JSON
Schema is intended to define validation, documentation, hyperlink navigation, and interaction control
of JSON data." Validation is an assertion: "JSON Schema can be used to assert constraints on a JSON
document, which either passes or fails the assertions"; "An instance can only fail an assertion that is
present in the schema." [SPEC] JSON Schema draft 2020-12 core.

**The specification defines no notion of compatibility, versioning, or evolution between two schemas.**
`$schema` identifies a dialect; `$vocabulary` declares vocabularies; neither says anything about
whether schema v2 can read v1's data. Every compatibility rule you will ever see for JSON Schema is a
_registry vendor's invention_. This is the most important sentence in this section.

### 4.4 What Confluent's JSON Schema compatibility checker actually implements

> "The JSON Schema compatibility rules are loosely based on similar rules for Avro, however, the rules
> for backward compatibility are more complex." **[DOC]**

**Content models** [DOC]:

- open — `additionalProperties: true`, "which is the default"
- closed — `additionalProperties: false`
- partially open — a schema for `additionalProperties`, or `patternProperties`

**The Avro rules, adapted** [DOC] verbatim:

> - "The ordering of fields may be different: fields are matched by name."
> - "If the writer's schema contains a field with a name not present in the reader's schema, then the
>   reader's schema must have an open content model or a partially open content model that captures the
>   missing field."
> - "If the reader's schema has a required field that contains a default value, and the writer's schema
>   has a closed content model and either does not have a field with the same name, or has an optional
>   field with the same name, then the reader should use the default value from its field."
> - "If the reader's schema has a required field with no default value, and the writer's schema either
>   does not have a field with the same name, or has an optional field with the same name, an error is
>   signaled."
> - "If the reader's schema has an optional field, and the writer's schema has a closed content model
>   and does not have a field with the same name, then the reader should ignore the field."

**JSON-Schema-specific rules** [DOC] verbatim — note these are all "the writer may be _more_
constrained than the reader":

> - "The writer's schema may have a `minProperties` value that is greater than the `minProperties` value
>   in the reader's schema or that is not present in the reader's schema; or a `maxProperties` value that
>   is less than …"
> - "The writer's schema may have a `required` value that is a **superset** of the `required` value in the
>   reader's schema or that is not present in the reader's schema."
> - "The writer's schema may have a `dependencies` value that is a superset …"
> - "The writer's schema may have an `additionalProperties` value of **false**, whereas it can be true or
>   a schema in the reader's schema."

**Primitives** [DOC]: "A writer's schema of integer may be promoted to the reader's schema of number."
Plus the loosening rules for `minLength`/`maxLength`/`pattern`/`minimum`/`maximum`/`multipleOf`, and
for arrays `minItems`/`maxItems`/`uniqueItems`.

**Enums** [DOC]: "The Avro rule for enums is directly applicable to JSON Schema. If the writer's symbol
is not present in the reader's enum, then an error is signaled." — **there is no enum default in JSON
Schema.** Adding an enum value is strictly reader-first, with no fallback available.

**Unions (`oneOf`)** [DOC]: "If the reader's and writer's schemas are both unions, then the writer's
schema must be a **subset** of the reader's schema."

### 4.5 The open-content-model trap — the thing that surprises everyone

Because `additionalProperties` defaults to `true`, a JSON schema is **open** by default. Under
Confluent's STRICT policy, adding an optional property to an open schema is _not backward compatible_:

> ```
> Schema being registered is incompatible with an earlier schema for subject
> "test.v6-value", details: [{errorType:"PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL",
> description:"The new schema has an open content model and has a property or item at
> path '#/properties/dname' which is missing in the old schema'}
> ```
>
> **[DOC]** Confluent, _serdes-json_, "How to address 'The new schema has an open content model …'".

The reasoning, verbatim: "if the writer's schema has an open content model, then the writer may have
produced JSON documents with `myProperty` using a different type than the type expected for
`myProperty` in the reader's schema." Confluent's own worked example: schema 1 has only `field1` and is
open, so the data `{"field1":"100","field2":123}` is legal under it; schema 2 adds `field2` as a
string; the old data is now invalid under the new schema. Backward compatibility is genuinely violated.

> "To resolve this, you need to manually set the `additionalProperties: false` attribute in the initial
> schema. This ensures that any new properties added later will be compatible." **[DOC]**

**Decision rule**: if you use JSON Schema in a registry, set `"additionalProperties": false` **in the
very first version**. You cannot add it later without a breaking change, and without it you cannot add
fields later either. This is a one-way door disguised as a default.

The `LENIENT` `compatibilityPolicy` (`PUT /config {"compatibilityPolicy":"LENIENT"}`) makes JSON Schema
behave like Avro — additive changes allowed regardless of the content model — at the cost of no longer
detecting the case above.

### 4.6 `null` versus absent

JSON distinguishes `{"x": null}` from `{}`. JSON Schema distinguishes them (`"type": ["string","null"]`
vs `required`). Jackson **does not**, by default: a missing property and an explicit `null` both leave
the field at its Java default. If your API means "clear this value" by `null` and "don't touch it" by
absence, you need `JsonNullable`/`Optional<T>` wrappers or a raw `JsonNode`/`Map` pass — Jackson's
POJO binding erases the distinction. This is the JSON analogue of proto3 implicit presence (§3.3), and
it bites exactly the same PATCH endpoints.

---

## 5. Schema Registry

### 5.1 When the check happens, and what it does not check

> "Schema evolution is the practice of safely changing schemas over time while maintaining compatibility
> with existing producers and consumers. Schema Registry enforces compatibility by comparing new schema
> versions against previous versions using configurable compatibility types." … "When schemas are
> updated, Schema Registry checks compatibility **before accepting the new version**." **[DOC]**

The check is at **registration**, per **subject**, against the previous version(s) _of that subject_.
It is not at produce time and not at consume time. Concretely, this means the registry cannot and does
not verify:

- that any deployed consumer actually holds the schema version the check assumed
- that the data currently on the topic is limited to the versions the non-transitive check compared
- anything at all about a producer using `auto.register.schemas=false` + `use.latest.version=true` +
  `latest.compatibility.strict=false` (that combination explicitly skips the check — §5.5)
- anything at all if the client is not a Schema-Registry-aware serialiser

> "Compatibility checks are per subject. Versions are tied to subjects." **[DOC]**

### 5.2 Levels and the default

`BACKWARD` (default), `BACKWARD_TRANSITIVE`, `FORWARD`, `FORWARD_TRANSITIVE`, `FULL`, `FULL_TRANSITIVE`,
`NONE`. Confluent's stated reason for the default:

> "The main reason that BACKWARD compatibility mode is the default, and preferred for Kafka, is so that
> you can rewind consumers to the beginning of the topic. With FORWARD compatibility mode, you aren't
> guaranteed the ability to read old messages. Also, FORWARD compatibility mode is harder to work with.
> In a sense, you need to anticipate all future changes." **[DOC]**

Note the internal tension: the justification for `BACKWARD` is "so that you can rewind consumers to the
beginning of the topic", but plain `BACKWARD` only guarantees X can read X-1. Rewinding to the
beginning requires `BACKWARD_TRANSITIVE`. The default is weaker than its own rationale.

Confluent's format-specific recommendation:

> "Note that best practice for Protobuf is to use `BACKWARD_TRANSITIVE`, as adding new message types is
> not forward compatible." **[DOC]**

A REST call to set compatibility is global and overrides properties files [DOC]; per-subject settings
are available on `/config/{subject}`; there is a `:.__GLOBAL:` context and a `defaultToGlobal` lookup
order (subject → context → global context).

### 5.3 The wire format

**Schema id in the payload prefix** (the classic form) [DOC]:

| Bytes | Area            | Description                                                                                         |
| ----- | --------------- | --------------------------------------------------------------------------------------------------- |
| 0     | Version Byte    | "Confluent serialization format version number, which is 0 when using the schema ID (the default)." |
| 1-4   | Schema ID       | "4-byte schema ID as returned by Schema Registry."                                                  |
| 5-x   | Messaging index | "For Protobuf, an array of indexes that correspond to the message type. Otherwise, this is empty."  |
| x+1…  | Data            | binary encoding for Avro or Protobuf                                                                |

> "The schema ID is encoded with big-endian ordering; that is, standard network byte order." … "The wire
> format applies to both Kafka message keys and message values." **[DOC]**

The Protobuf message-index array is zigzag varint, length-prefixed, and the extremely common `[0]` case
is special-cased to a single `0` byte [DOC].

**New in Confluent Platform 8.1.1 — schema GUID in a header** [DOC]:

- version byte `1`, then a **16-byte schema GUID** carried in a Kafka message header, not the payload.
- Enabled with `key.schema.id.serializer` / `value.schema.id.serializer` =
  `io.confluent.kafka.serializers.schema.id.HeaderSchemaIdSerializer`.
- "Starting with Confluent Platform 8.1.1, the default behavior of Schema Registry deserializers has
  changed. Before, the deserializer would look for the schema ID in the payload prefix. Now, the
  deserializer looks for the schema GUID in the header, and if not found, then looks for the schema ID
  in the payload prefix."
- The GUID is a fingerprint of the schema including references, rules and metadata, and is stable
  across registries; `/schemas/guids/{guid}` resolves it.
- Migration order given by Confluent is **producers → consumers**, because "older consumers that ignore
  headers will continue to work while you roll out producers."

This is _not_ Avro's single-object encoding (`C3 01` + 8-byte little-endian CRC-64-AVRO). The two
framings are mutually unintelligible.

### 5.4 Subject-name strategies

| Behaviour                     | `TopicNameStrategy` (default) | `RecordNameStrategy`                                                                        | `TopicRecordNameStrategy`                                                                                                                                                            |
| ----------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Subject format                | `<topic>` + `-key`/`-value`   | `<fully-qualified record name>`                                                             | `<topic>-<fully-qualified record name>`                                                                                                                                              |
| Unique subject per topic      | Yes                           | **No**                                                                                      | Yes                                                                                                                                                                                  |
| Compatibility checked across… | "all schemas in a topic"      | "No, checks compatibility of any occurrences of the same record name **across all topics**" | "different topics may contain mutually incompatible versions of the same record name, since the compatibility check is scoped to a particular record name within a particular topic" |

[DOC] verbatim. Full class names are the strategy name prefixed by
`io.confluent.kafka.serializers.subject.`. The subject for `RecordNameStrategy`/`TopicRecordNameStrategy`
is: "For Avro, the record fullname (namespace + record name). For Protobuf, the message name. For JSON
Schema, the **title**."

> "The default naming strategy (TopicNameStrategy) names the schema based on the topic name and
> implicitly requires that all messages in the same topic conform to the same schema, otherwise a new
> record type could break compatibility checks on the topic." **[DOC]**

**Consequences for multi-type topics** — three real options, with different failure modes:

1. **`TopicNameStrategy` + a union/`oneof` wrapper type.** One subject, one evolving schema. Confluent's
   own newer guidance uses **schema references**: register each event type as its own subject, then
   register a union of references as the topic's subject. This requires
   `auto.register.schemas=false` + `use.latest.version=true`, otherwise the serialiser registers the
   concrete event type and _overwrites the union as the latest schema_ [DOC].
2. **`RecordNameStrategy`.** Global namespace. `com.acme.OrderPlaced` means the same thing on every
   topic in the cluster — including one owned by another team who will register an incompatible v2 and
   break you.
3. **`TopicRecordNameStrategy`.** Per-topic-per-type. Usually the least-bad of the three, at the cost of
   subject sprawl.

Also: "The subject name strategy configured on a topic in the broker for schema ID validation does not
propagate to clients. The subject name strategy must be configured separately in the clients." [DOC]

### 5.5 Serialiser configuration, with source-verified defaults

From `confluentinc/schema-registry` `master`,
`schema-serializer/.../AbstractKafkaSchemaSerDeConfig.java` [SRC]:

| Property                      | Default    | Source line                                                               |
| ----------------------------- | ---------- | ------------------------------------------------------------------------- |
| `auto.register.schemas`       | **`true`** | `AUTO_REGISTER_SCHEMAS_DEFAULT = true` (L91)                              |
| `use.latest.version`          | `false`    | `USE_LATEST_VERSION_DEFAULT = false` (L114)                               |
| `latest.compatibility.strict` | `true`     | `LATEST_COMPATIBILITY_STRICT_DEFAULT = true` (L124)                       |
| `normalize.schemas`           | `false`    | `NORMALIZE_SCHEMAS_DEFAULT = false` (L86)                                 |
| `id.compatibility.strict`     | `true`     | [DOC]                                                                     |
| `specific.avro.reader`        | `false`    | [SRC] `AbstractKafkaAvroDeserializer.useSpecificAvroReader = false` (L67) |

**The `auto.register.schemas=true` problem.** With it on, the schema the _producer's build_ derived
becomes the registered version, at the first message, in whatever environment starts first. Confluent's
own behaviour table: "When `auto.register.schemas` is set to true, `use.latest.version` and
`latest.compatibility.strict` are ignored, so it doesn't matter how those are set; `auto.register.schemas`
overrides them." [DOC]

Consequences: a developer laptop or a canary pod can define production's contract; a trivial syntactic
difference registers a duplicate schema and burns a version (Confluent's own example: "a fully-qualified
type name such as `google.protobuf.Timestamp` may code-generate a descriptor with the type name
`.google.protobuf.Timestamp`. Schema Registry considers these two variations of the same type name to be
different" [DOC]); and the multi-type-topic union gets overwritten (§5.4).

The production posture Confluent documents:

```properties
auto.register.schemas=false
use.latest.version=true
latest.compatibility.strict=false   # only when using schema references
```

with schemas registered by CI (`schema-registry:register`, §9.1). Note `latest.compatibility.strict=false`
disables the serialisation-time check entirely — do not set it reflexively; it is for the schema-references
case.

On the **deserialiser** side, `use.latest.version=true` does _not_ override the embedded id:

> "this setting does not override the embedded schema ID in existing messages. The deserializer will
> still try to fetch the schema corresponding to the message's schema ID… If that schema ID is missing
> (for example, due to deletion), deserialization will fail with a schema not found." **[DOC]**

**Normalisation.** > "Schema normalization is disabled by default. It is highly recommended that you
enable schema normalization." Handles: "The ordering of properties in JSON Schema; The ordering of
imports and options in Protobuf; The ordering of schema references; Non-qualified names vs.
fully-qualified names." [DOC] Enable it (`normalize.schemas=true`, or `?normalize=true` on the REST
call, or globally via `/config`) — the default of `false` is a source of phantom versions.

**`avro.use.logical.type.converters`** — narrower than its reputation. It is the
`kafka-avro-console-producer` property that works around a logical-type serialisation defect in
`io.confluent:kafka-avro-serializer` **7.5.2 and 7.4.3** only:

> errors observed: `java.lang.ClassCastException: class java.time.Instant cannot be cast to class
java.lang.Number`, `org.apache.avro.AvroRuntimeException: Unknown datum type java.time.Instant`,
> REST Proxy `{"error_code":40801,"message":"Error serializing Avro message"}`.
> "This misbehavior is fixed with the release of Confluent Platform 7.5.3 and 7.4.4, but you must add
> the kafka-avro-console-producer property: `--property avro.use.logical.type.converters=true`. The REST
> Proxy does not support setting the above property as of now. This is resolved in REST Proxy 7.7.0."
> **[DOC]**

It is not a general "turn on logical types" switch for application clients; if a skill mentions it, it
must mention the version window.

### 5.6 Alternatives — do not assume Confluent

**Apicurio Registry** (3.3.x) [DOC apicur.io]

- Modes: `NONE`, `BACKWARD`, `BACKWARD_TRANSITIVE`, `FORWARD`, `FORWARD_TRANSITIVE`, `FULL`,
  `FULL_TRANSITIVE` — same vocabulary as Confluent.
- Key semantic difference: compatibility is a **rule** you attach at global, group or artifact level,
  and rules are inherited. "To disable a rule inherited from a higher level, you must explicitly set the
  rule at the lower level to `NONE`." A registry with no rule configured accepts anything — Apicurio is
  _permissive by default_ where Confluent is `BACKWARD` by default. Its Confluent-compatible (`ccompat`)
  endpoint, though, defaults to `BACKWARD` when no rule is set [BLOG/ADR — from
  `Apicurio/apicurio-registry/adr/0001-confluent-schema-registry-compatibility.md`; medium confidence,
  verify against your deployed version].
- Apicurio also has separate **validity** and **integrity** rules that Confluent has no equivalent of;
  Confluent's nearest analogue is Data Contracts rulesets.
- Apicurio documents the `BACKWARD` vs `BACKWARD_TRANSITIVE` divergence with a worked Avro example: v1
  `{name}`, v2 `{name, email=""}`, v3 `{name, email}` (default removed) — "Version 3 passes the BACKWARD
  check but fails the BACKWARD_TRANSITIVE check." I reproduced exactly this shape in Avro Java (§9.3).

**AWS Glue Schema Registry** [DOC aws]

- **Eight** modes: `NONE`, `DISABLED`, `BACKWARD`, `BACKWARD_ALL`, `FORWARD`, `FORWARD_ALL`, `FULL`,
  `FULL_ALL`. Note `_ALL` where everyone else says `_TRANSITIVE`, and `DISABLED` ("prevents versioning
  for a particular schema. No new versions can be added") which has no Confluent equivalent.
- Comparison is against a **checkpoint** version, not simply "the latest": "A schema version that is
  marked as a checkpoint is used to determine the compatibility of registering new versions of a schema."
  You can move the checkpoint with `UpdateSchema`. This is a different model from Confluent's
  latest-vs-all and will produce different verdicts.
- Format support is pinned and narrower: "AVRO (v1.11.4)", "JSON Data format with JSON Schema format …
  (specifications **Draft-04, Draft-06, and Draft-07**)" via the Everit library, "Protocol Buffers
  (Protobuf) versions proto2 and proto3 **without support for `extensions` or `groups`**". **Glue does
  not support JSON Schema 2020-12.**
- Glue explicitly extends compatibility to gRPC service definitions: "adding new RPC service or RPC
  method is a backward compatible change"; removing one is forward-compatible. Confluent's checker says
  nothing about services.
- Hard limits worth knowing: 100 registries per region, 10 000 schema versions per region, 170 KB schema
  payload.

**Karapace** (Aiven) — an open-source, Confluent-REST-API-compatible registry. [BLOG, medium confidence]
sources put its API parity at "up to Confluent Schema Registry 6.1.1", and a 2026 comparison claims it
currently supports **Avro and JSON Schema only, not Protobuf**, while an older source claims 3.2.0
supported all three. I could not resolve this from a primary source — **[UNVERIFIED]**; check
`karapace.io` / the release notes for your version before assuming Protobuf works.

**Cross-registry rule**: the compatibility _vocabulary_ is portable; the _semantics_ are not. Verify per
registry: (a) what happens when no rule is configured, (b) whether "transitive" means all versions or a
checkpoint, (c) which JSON Schema drafts are implemented, (d) whether the wire framing is Confluent's
magic-byte + 4-byte id (Karapace and Apicurio's `ccompat` mode: yes; Glue: no, Glue has its own header).

---

## 6. Java-side mechanics

### 6.1 Avro: `SpecificRecord` vs `GenericRecord` — and the fact that changes everything

`avro-maven-plugin` (`org.apache.avro:avro-maven-plugin`, current **1.12.2**, 1.11 line **1.11.5**)
generates a class per record with a `public static final Schema SCHEMA$` embedding the schema **as of
build time**. That embedded schema is the _reader_ schema, permanently, for that build. A running
consumer's reader schema is therefore whatever was in `src/main/avro` when its jar was built — not what
is in the registry, not what is in git.

Now the part almost nobody knows. From `AbstractKafkaAvroDeserializer.getReaderSchema` [SRC]:

```java
} else if (useSpecificAvroReader) {
  readerSchema = getSpecificReaderSchema(writerSchema);
  readerSchemaCache.put(writerSchemaId, readerSchema);
} else {
  readerSchema = writerSchema;     // <-- !!
}
```

with `protected boolean useSpecificAvroReader = false;` (L67), i.e. **`specific.avro.reader` defaults to
`false`**.

**So a `GenericRecord` consumer performs no schema resolution at all.** Reader schema = writer schema.
Every registry compatibility guarantee you configured buys that consumer precisely nothing: it receives
whatever shape the producer wrote, including fields it has never heard of and _missing_ fields it
expects, and `record.get("newField")` returns `null` or throws `AvroRuntimeException: Not a valid
schema field` depending on the Avro version and access path. Defaults are not applied. Enum defaults are
not applied. Type promotion is not applied.

**Decision rule**: if you want Avro's schema resolution to protect you, you must either set
`specific.avro.reader=true` and consume generated `SpecificRecord`s, or pass an explicit reader schema.
`GenericRecord` consumers are hand-rolling their own compatibility, whether they know it or not. (There
is a legitimate `GenericRecord` use case — a generic sink or router that should follow the writer —
which is exactly why this is the default.)

### 6.2 Protobuf: `protoc`, plugins, and presence-dependent accessors

- Legacy standard plugin: `org.xolstice.maven.plugins:protobuf-maven-plugin` **0.6.1** — last release
  2018, still ubiquitous, requires a `protoc` artifact or binary.
- Actively maintained alternative: `io.github.ascopes:protobuf-maven-plugin` **3.1.0**.
- Runtime: `com.google.protobuf:protobuf-java` **4.36.0** (I ran 4.32.0).

Generated builder shape by presence mode:

| Declaration                   | Accessors generated                                               | `hasX()`                   |
| ----------------------------- | ----------------------------------------------------------------- | -------------------------- |
| `int32 n = 1;` (implicit)     | `getN()`, `setN()`, `clearN()`                                    | **no**                     |
| `optional int32 n = 1;`       | + `hasN()`                                                        | yes                        |
| `Address a = 1;` (message)    | `getA()`, `hasA()`, `setA()`, `clearA()`, `mergeA()`              | yes (always, for messages) |
| `repeated string t = 1;`      | `getTList()`, `getTCount()`, `getT(i)`, `addT()`, …               | n/a (`getTCount() == 0`)   |
| `Status s = 1;` (proto3 enum) | `getS()` → may be `UNRECOGNIZED`; **`getSValue()`** → the raw int | no                         |

The `getXValue()` integer accessor is the forward-compatible read path for enums (§3.8).

Adding `optional` to an existing implicit field is source-compatible for readers (it only adds
`hasN()`), and wire-compatible for every non-zero value. It changes serialisation of the zero value —
which is exactly the behaviour change you wanted.

### 6.3 Pinned versions for the eventual skill

```xml
<!-- Avro -->
<dependency><groupId>org.apache.avro</groupId><artifactId>avro</artifactId><version>1.12.2</version></dependency>
<plugin><groupId>org.apache.avro</groupId><artifactId>avro-maven-plugin</artifactId><version>1.12.2</version></plugin>

<!-- Protobuf -->
<dependency><groupId>com.google.protobuf</groupId><artifactId>protobuf-java</artifactId><version>4.36.0</version></dependency>
<plugin><groupId>io.github.ascopes</groupId><artifactId>protobuf-maven-plugin</artifactId><version>3.1.0</version></plugin>

<!-- Registry CI -->
<plugin><groupId>io.confluent</groupId><artifactId>kafka-schema-registry-maven-plugin</artifactId><version>8.3.1</version></plugin>

<!-- Jackson: 2.22.2 (FAIL_ON_UNKNOWN_PROPERTIES=true) or 3.2.2 (=false) -->
```

Versions read from Maven Central `maven-metadata.xml` on 2026-08-28; the Confluent plugin version is
the one in Confluent's own documented example (Confluent artefacts are on `packages.confluent.io`, not
Central).

---

## 7. The deploy sequence

### 7.1 Expand-then-contract, as an ordered runbook

The rule that carries all the weight: **never ship the expand and the contract in the same deploy.**
There must be at least one release boundary — ideally one full retention window — between them.

**Release N — EXPAND (additive only)**

1. Add the new field/type/enum value to the schema _with a default_ (Avro), _with a new field number and
   `optional`_ (Protobuf), or _as a non-required property_ (JSON Schema).
2. Register the schema from CI (not from a producer). Compatibility level for a Kafka topic:
   `FULL_TRANSITIVE` if you can afford it, `BACKWARD_TRANSITIVE` as the floor.
3. Deploy **consumers** that can read both shapes: they tolerate the field's absence and its presence.
   Nothing branches on the new field yet, or the branch is behind a flag defaulting off.
4. Only then deploy **producers** that write the new field, alongside the old one if the change is a
   replacement.
5. Wait. The wait is not a formality — it is the whole mechanism. See §7.2 for how long.

**Between N and N+1 — MIGRATE**

6. Backfill, if the store is mutable. Verify by metric, not by assumption: count messages/records still
   carrying only the old shape, and drive it to zero (§10.5).
7. Flip the consumer's behaviour flag to read the new field. Old field is still written and still read
   as a fallback.

**Release N+1 — CONTRACT (subtractive)**

8. Deploy **producers** that stop writing the old field.
9. Wait one more retention window.
10. Deploy **consumers** that no longer read the old field.
11. Remove the field from the schema. Protobuf: `reserved <number>, "<name>";` in the same commit.
    Avro: only if it had a default, or you accept that old readers break.
12. Register the contracted schema.

Note that steps 3–4 (consumer first) and 8–10 (producer first) go in **opposite orders**. Expand is a
BACKWARD change (readers first); contract is a FORWARD change (writers first). Getting this backwards is
the most common way an "expand/contract" migration still causes an outage.

### 7.2 How long is "wait"?

| Boundary                              | Window           | What "wait" means                                                                                                                                           |
| ------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synchronous HTTP/gRPC                 | seconds          | one rolling deploy; the in-flight requests drain. Both halves can be minutes apart.                                                                         |
| Kafka topic, `retention.ms=7d`        | 7 days           | the contract half cannot ship until every message written under the old shape has aged out **and** no consumer group can reset to an offset older than that |
| Kafka topic, `cleanup.policy=compact` | **never**        | the contract half is not available. The old shape must remain readable forever, or you rewrite the topic (§7.3)                                             |
| Event-sourced store                   | **never**        | same                                                                                                                                                        |
| Database column                       | until backfilled | measured by the backfill query, not by time                                                                                                                 |

The failure mode is not subtle: a team ships expand on Monday, contract on Wednesday, and everything is
green because the 7-day window means no consumer has hit an old record yet. It breaks four days later,
or six months later when someone resets a consumer group.

### 7.3 Compacted topics and event stores: the special cases

On a compacted topic (or any infinite-retention log), **schema removal is not a thing you can do**. The
only true options:

1. **Never contract.** Deprecate in documentation, keep the field in the schema forever with a default,
   accept the schema growing monotonically. This is the honest default and it is fine — the cost is a
   schema with tombstoned fields, which is cheaper than the alternatives.
2. **Upcasting at the read boundary.** Keep every historical schema, and have a versioned upcaster chain
   that lifts v1 → v2 → v3 before the domain sees it. This is the event-sourcing answer; it belongs in
   the `event-sourcing` skill, and this skill should route there. What belongs _here_ is: the upcaster
   chain is only necessary because the format could not carry the change, and choosing Avro-with-defaults
   or Protobuf-with-reserved often removes the need for most links in the chain.
3. **Rewrite the topic.** Produce v2 records to a new topic, migrate consumers, delete the old. Costs a
   full replay and a dual-read period, and breaks offset-based bookmarks. Confluent's own advice for the
   `NONE` case: "create a brand-new topic and start migrating applications to use the new topic and new
   schema, avoiding the need to handle two incompatible versions in the same topic." [DOC]

And for a request/response API where the window is seconds: expand-then-contract still applies, but the
two halves can be the same afternoon. The reason to keep them separate deploys is rollback — if the
contract half is in the same artefact as the expand half, rolling back the contract rolls back the
expand too, and you have no safe state to return to.

---

## 8. CI enforcement

Version control of the schema files is the precondition for all of this. The `.avsc`/`.proto`/
`.json` files in the repository are the source of truth; the registry is a _deployment target_, exactly
like a database is a deployment target for Flyway migrations. If a producer's `auto.register.schemas`
can change the registry, the source of truth is a running JVM somewhere, and CI cannot check anything.

### 8.1 Confluent Maven plugin — `kafka-schema-registry-maven-plugin` **8.3.1**

Six goals [DOC]: `validate`, `test-local-compatibility`, `set-compatibility`, `test-compatibility`,
`register`, `download`, `derive-schema`.

**`test-compatibility`** — reads local schemas, tests them against a _live_ registry:

> "This goal is used to read schemas from the local file system and test them for compatibility against
> the Schema Registry servers. This goal can be used in a continuous integration pipeline to ensure that
> schemas in the project are compatible with the schemas in another environment." [DOC]

```xml
<plugin>
  <groupId>io.confluent</groupId>
  <artifactId>kafka-schema-registry-maven-plugin</artifactId>
  <version>8.3.1</version>
  <configuration>
    <schemaRegistryUrls><param>http://schema-registry:8081</param></schemaRegistryUrls>
    <!-- userInfoConfig: user:password — required for Confluent Cloud -->
    <subjects>
      <Orders-value>src/main/resources/order.avsc</Orders-value>
      <Flights-value>src/main/resources/flight.proto</Flights-value>
    </subjects>
    <schemaTypes><Flights-value>PROTOBUF</Flights-value></schemaTypes>  <!-- AVRO is the default -->
    <verbose>true</verbose>   <!-- default true: prints WHY it failed -->
  </configuration>
</plugin>
```

Invocation: `mvn io.confluent:kafka-schema-registry-maven-plugin:8.3.1:test-compatibility`, or bind it
to an execution id and run `mvn schema-registry:test-compatibility@test-compatibility`. Confluent's own
GitHub Actions example binds `validate`, `test-local-compatibility`, `set-compatibility` and
`test-compatibility` to the `validate` phase on PR, and `register` on push to master. [DOC]

**`test-local-compatibility`** — the offline one, and the one most CI setups should start with:

> "This goal tests compatibility of a local schema with other existing local schemas during development
> and testing phases. Before the addition of `schema-registry:test-local-compatibility`, if you wanted to
> check compatibility of a new schema you had to connect to the Schema Registry." [DOC]

```xml
<configuration>
  <schemas><order>src/main/avro/order.avsc</order></schemas>
  <previousSchemaPaths><order>src/main/avro/history/</order></previousSchemaPaths> <!-- dir or file -->
  <compatibilityLevels><order>BACKWARD_TRANSITIVE</order></compatibilityLevels>
</configuration>
```

Note: "For compatibility level BACKWARD, FORWARD, or FULL, exactly one previousSchema is expected per
schema." [DOC] — the transitive levels are the ones that take a directory.

`register` also takes `normalizeSchemas` (default `false`) — set it `true`.

### 8.2 Protobuf — `buf breaking`, buf CLI **v1.72.0**

Four rule categories, strictest to most lenient [DOC buf.build]:

- **`FILE`** (default) — "Detects changes that move generated code between files, breaking generated
  source code on a per-file basis." Needed for C++/Python where file structure affects compilation.
- **`PACKAGE`** — "Detects changes that break generated source code changes on a per-package basis."
  Suitable for Go.
- **`WIRE_JSON`** — "Detects changes that break wire (binary) or JSON encoding." "Recommended as a
  minimum baseline when using JSON-based transports like Connect, gRPC-Gateway, or gRPC JSON."
- **`WIRE`** — "Detects changes that break wire (binary) encoding." Most permissive.

**For a Java service that also exposes ProtoJSON anywhere, `WIRE_JSON` is the correct floor** — it is
the category that catches the rename that is free on the wire and breaking in JSON (§3.4). `FILE` is
what you want if you publish generated Java as a library, because it also protects generated-source
compatibility.

```yaml
# buf.yaml
version: v2
modules:
  - path: proto
breaking:
  use:
    - WIRE_JSON
```

```bash
buf breaking --against '.git#branch=main,subdir=proto'
buf breaking --against 'https://github.com/org/repo.git#branch=main,subdir=proto'
buf breaking --against buf.build/org/module
```

Buf also offers a server-side "BSR breaking check" that "run[s] the same detection on every push to the
registry, enforced from the server side" — useful when you cannot trust every repo's local config.

`buf breaking` checks the `.proto` files against each other. It knows nothing about your registry's
compatibility level or about the data already on a topic. It is complementary to, not a replacement
for, `test-compatibility`.

### 8.3 Avro — `SchemaCompatibility` and `SchemaValidatorBuilder` from a plain test

Two APIs, both in `org.apache.avro`, no registry needed. [VERIFIED] on 1.12.0.

**Pairwise, with structured diagnostics** — the one to use when you want a good failure message:

```java
var result = SchemaCompatibility.checkReaderWriterCompatibility(reader, writer);
assertEquals(SchemaCompatibility.SchemaCompatibilityType.COMPATIBLE, result.getType(),
             () -> result.getResult().getIncompatibilities().toString());
```

Failures come back as e.g.
`Incompatibility{type:READER_FIELD_MISSING_DEFAULT_VALUE, location:/fields/1, message:nick, …}` —
`location` is a JSON pointer into the schema, which is exactly what you want in a CI log.

**Level-equivalent, over a version history** — [VERIFIED] mapping:

| Registry level                   | Avro API                                                          |
| -------------------------------- | ----------------------------------------------------------------- |
| `BACKWARD`                       | `new SchemaValidatorBuilder().canReadStrategy().validateLatest()` |
| `BACKWARD_TRANSITIVE`            | `new SchemaValidatorBuilder().canReadStrategy().validateAll()`    |
| `FORWARD` / `FORWARD_TRANSITIVE` | `.canBeReadStrategy().validateLatest()` / `.validateAll()`        |
| `FULL` / `FULL_TRANSITIVE`       | `.mutualReadStrategy().validateLatest()` / `.validateAll()`       |

`validate(newSchema, existingSchemasMostRecentFirst)`. [VERIFIED] output demonstrating the divergence
that Apicurio documents:

```
canRead/validateAll    v2 vs [v1]      -> VALID
canRead/validateAll    v3 vs [v2,v1]   -> INVALID: Unable to read schema {id} using schema {id,n}
canRead/validateLatest v3 vs [v2,v1]   -> VALID          <-- BACKWARD passes what BACKWARD_TRANSITIVE fails
mutualRead/validateAll v2 vs [v1]      -> VALID
```

(v1 = `{id}`, v2 = `{id, n:string=""}`, v3 = `{id, n:string}` with the default removed.)

Keep the history in the repo — `src/test/resources/schemas/order/v1.avsc`, `v2.avsc`, … — and have the
test validate the current schema against all of them. That is `BACKWARD_TRANSITIVE` enforced at build
time with no registry, no network, and no Confluent licence.

---

## 9. Failure modes, with the symptom actually observed

**9.1 The consumer that throws on an additive change.**
Symptom: `UnrecognizedPropertyException: Unrecognized field "shippingMethod" (class com.acme.OrderDto),
not marked as ignorable`. Cause: a hand-constructed `new ObjectMapper()` on Jackson 2.x, where
`FAIL_ON_UNKNOWN_PROPERTIES` is `true` [SRC]. Diagnostic that saves an hour: grep for `new ObjectMapper(`
outside configuration classes. The Spring-managed mapper would not have thrown (§4.2).

**9.2 The consumer that throws on an additive change, Avro edition.**
Symptom: `org.apache.avro.AvroTypeException: Found com.acme.User, expecting com.acme.User, missing
required field nick` [VERIFIED]. Cause: a field added _without_ a default; the new reader cannot read
old bytes. The message is confusing because both schemas print with the same name.

**9.3 The field that silently reads as zero.**
Symptom: none. A dashboard goes flat; a total is short. Cause (Protobuf): a type change on the same
field number across a wire-type boundary — [VERIFIED] `int32` bytes read by a `string`-typed field
produce `""` and route the bytes to `unknownFields`, no exception. Or (Protobuf, presence): an implicit
`int32` where the producer meant "not supplied" and the consumer read `0`. Or (Protobuf, repeated): a
packed `repeated int32` read as singular — [VERIFIED] the singular field reads `0` and the bytes go to
unknown fields.
Detection: log/meter `getUnknownFields().asMap().size()` on the parse path. It is the only signal.

**9.4 The enum that becomes `UNRECOGNIZED`.**
Symptom: `java.lang.IllegalArgumentException: Can't get the number of an unknown enum value.` [SRC], or
a `switch` silently taking `default`, or a persisted row with the enum's zero value. Cause: producer
added an enum symbol, consumer's generated code predates it. Fix path: consumers first, always; and
read `getXValue()` when you must tolerate. Avro's equivalent: `AvroTypeException: No match for BLUE`
[VERIFIED] — preventable by putting a `default` on the enum in v1 (§2.3).

**9.5 The reused field number that deserialises garbage into a valid-looking object.**
Symptom: a well-formed object with wrong contents, no exception, no log. [VERIFIED] a `string` field 5
carrying `"\nabc"`, read after 5 was reused for a `message Address`, yields
`address { street: "abc" }`. With a different payload (`"bob@example.com"`) the same change throws
`InvalidProtocolBufferException: … the input ended unexpectedly in the middle of a field`. So it is
content-dependent: the test suite passes, one customer's record fails, and another customer's record
succeeds _wrongly_. Prevention: `reserved`, always, in the deletion commit.

**9.6 The compacted topic that cannot be read after a "safe" removal.**
Symptom, months later: a new service bootstraps from the topic and dies on record 4 million with
`AvroTypeException: missing required field`; or a consumer group reset to `earliest` never catches up.
Cause: `BACKWARD` (non-transitive) allowed schema v5 to drop a field that v1 records still have — or
allowed v5 to require a field v1 records never had. Kafka's compaction guarantee means those v1 records
are still the current value for their keys [SPEC, `design.md` L368]. Prevention: `*_TRANSITIVE` on any
subject whose topic is compacted or infinitely retained, enforced in CI (§8.3).

**9.7 The multi-type topic whose union got overwritten.**
Symptom: `Schema not found; error code: 40403` on a producer, or a consumer failing to resolve a
subject. Cause: a topic carrying several event types via schema references, where one producer had
`auto.register.schemas=true` and registered a concrete event type as the latest version of the topic
subject, displacing the union. [DOC] Prevention: `auto.register.schemas=false` + `use.latest.version=true`.

**9.8 The phantom schema version.**
Symptom: the subject has 47 versions and the last twelve are identical apart from whitespace, or the
producer gets "Schema not found" against a schema that visually matches the registered one. Cause:
registration/lookup is by string representation, not semantics; `normalize.schemas` defaults to `false`
[SRC]. Confluent's own worked example is `google.protobuf.Timestamp` vs `.google.protobuf.Timestamp`
[DOC].

**9.9 The `GenericRecord` consumer that ignored every compatibility guarantee.**
Symptom: `record.get("field")` returns `null` for a field the schema in git says has a default; or
`AvroRuntimeException: Not a valid schema field`. Cause: `specific.avro.reader=false` (the default), so
reader schema = writer schema and **no resolution runs** [SRC §6.1].

**9.10 The JSON Schema that cannot accept a new optional property.**
Symptom: `PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL: The new schema has an open content model and has a
property or item at path '#/properties/dname' which is missing in the old schema` [DOC]. Cause:
`additionalProperties` was left at its default of `true` in v1. Fix requires editing v1, i.e. a
compatibility break or a `NONE` window.

**9.11 The default that rewrote history.**
Symptom: a report's totals change after a deploy that touched no data and no code path. Cause: someone
changed an Avro field's `default` from `0` to `-1` (or from `""` to `"UNKNOWN"`). Every record ever
written without that field now reads differently [VERIFIED §2.8], and every compatibility gate said
`COMPATIBLE`.

---

## 10. Anti-patterns

| Anti-pattern                                                                            | The wrong version                                                              | Why                                                                                                     |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Bumping a version number instead of evolving                                            | new topic `orders.v2` / new message `OrderV2` for an additive change           | you now maintain two contracts and a fan-out forever, to avoid a change the format already supports     |
| `auto.register.schemas=true` in production                                              | producer defines the contract at first send                                    | any environment can define production's schema; duplicates burn versions; unions get overwritten (§5.5) |
| Leaving compatibility at the default `BACKWARD` on a compacted topic                    | non-transitive on infinite retention                                           | §9.6                                                                                                    |
| Deleting a Protobuf field without `reserved`                                            | `// removed: string email = 5;`                                                | §9.5. The comment does not stop `protoc`                                                                |
| Renaming instead of add-then-remove                                                     | Avro field rename without `aliases`; Protobuf rename with a ProtoJSON consumer | §2.2, §3.4                                                                                              |
| Both halves of expand/contract in one release                                           | "add `fullName`, drop `firstName`/`lastName`"                                  | there is no version of the system that can read both, so there is no safe rollback point                |
| `FAIL_ON_UNKNOWN_PROPERTIES=true` on an inbound event consumer                          | a hand-built `ObjectMapper` in a Kafka `Deserializer`                          | §9.1                                                                                                    |
| `FAIL_ON_UNKNOWN_PROPERTIES=false` everywhere including tests                           | global lenient mapper                                                          | you stop detecting your own typos as well as their additions                                            |
| Relying on `GenericRecord` and believing the registry protects you                      | `specific.avro.reader` unset                                                   | §9.9                                                                                                    |
| Treating `latest.compatibility.strict=false` as the standard production setting         | copied from the schema-references recipe                                       | it disables the serialisation-time compatibility check entirely                                         |
| `RecordNameStrategy` chosen for "flexibility"                                           | one topic, several event types                                                 | your subject is now cluster-global; another team's `com.acme.Order` collides with yours (§5.4)          |
| An Avro enum shipped without a `default` symbol                                         | `{"type":"enum","symbols":["A","B"]}`                                          | you can never add a symbol without a consumer-first deploy, forever (§2.3)                              |
| A JSON Schema shipped without `"additionalProperties": false`                           | the default                                                                    | you can never add a property under STRICT (§4.5)                                                        |
| `NONE` compatibility "temporarily, to unblock the release"                              | it is never removed                                                            | the registry becomes a schema _store_, not a schema _registry_                                          |
| Registering schemas from the application at startup                                     | an `@PostConstruct` that calls the registry                                    | same problem as `auto.register.schemas`, with more steps                                                |
| Checking compatibility only against `latest` in CI while the registry is `*_TRANSITIVE` | `validateLatest()`                                                             | CI is greener than production                                                                           |

---

## 11. Open disagreements — state them as disagreements

**11.1 Should `auto.register.schemas` ever be `true`?**

- _Never in production_: the contract must be a reviewed artefact registered by CI; a producer that can
  mutate the registry means the schema is whatever the last deploy said it was, and the diff is
  invisible. This is Confluent's own documented production posture.
- _Yes, in dev and often in practice_: turning it off means every schema change needs a registry write
  from CI with credentials, which teams without platform support will not build, and the fallback is
  worse (`NONE` compatibility, or no registry at all). Also, with `BACKWARD` enforced, auto-registration
  cannot register an incompatible schema — the failure mode is a _rejected produce_, which is loud.
- The disagreement is really about whether the compatibility gate is sufficient governance. It catches
  incompatibility; it does not catch a typo'd field name, a duplicate schema, or a schema nobody
  reviewed.

**11.2 `RecordNameStrategy` vs a wrapper/union type for several event types on one topic.**

- _`RecordNameStrategy`_: each event type evolves independently; no coordination between teams owning
  different event types; the natural model when a topic is "everything about this entity".
- _Wrapper/union_: one subject means one place to look, compatibility is checked for the topic as a
  whole, and consumers get an exhaustive `oneof`/union to switch on. Confluent's schema-references
  approach is the modern form of this. Cost: `auto.register.schemas=false` becomes mandatory, and adding
  an event type is a change to the shared union.
- _`TopicRecordNameStrategy`_ is the compromise nobody argues about and everybody forgets exists.
- Unresolved: `RecordNameStrategy`'s cluster-global subject namespace is a genuine multi-tenancy hazard
  and its defenders generally have a single-team cluster.

**11.3 Is JSON-with-a-schema a reasonable production choice at all?**

- _No_: the format has no notion of compatibility (§4.3), so every rule is a vendor's invention; the
  open-content-model trap (§4.5) means the default configuration is a one-way door; and the whole point
  of a schema — that the reader knows what the writer sent — is undermined by the fact that consumers
  can and do parse the JSON with something other than the schema.
- _Yes_: humans can read it in a log; every language has a parser; you do not need code generation or a
  registry to get started; and for a topic consumed by analysts and ad-hoc tooling the debuggability
  wins. And the alternative for many teams is not Avro, it is JSON _without_ a schema.
- The honest middle: JSON Schema is defensible when the schema is enforced at a single choke point you
  control, and indefensible when it is advisory. Confluent's own doc concedes "JSON Schema does not
  explicitly define compatibility rules."

**11.4 Avro vs Protobuf for an evolving event contract.**

- _Avro_: evolution is a first-class specified operation with named defaults, aliases and enum defaults;
  the schema travels with the data (or its id does); resolution is performed by the library so the
  consumer's code sees its own shape.
- _Protobuf_: the field number gives you rename-for-free and a much smaller class of "forgot the
  default" mistakes; tooling (`buf`) is better; but presence is subtle, enums are hostile to Java
  consumers, and there is no equivalent of an enum default or an alias.
- Unresolved and probably unresolvable: Avro's resolution is safer _when the reader schema is correct_,
  and Protobuf's tag-based model is safer _when it isn't_. Which risk dominates depends on whether your
  consumers use `SpecificRecord` (§6.1).

**11.5 Should the schema history live in the repo or only in the registry?**

- _Repo_: enables offline CI (`test-local-compatibility`, `SchemaValidatorBuilder`), makes the change
  reviewable in a PR diff, and survives losing the registry.
- _Registry only_: the registry is the truth; a repo copy drifts and then lies.
- Practical resolution: repo is the source, registry is the deployment target, and CI has a job that
  fails if they disagree (`schema-registry:download` + diff).

**11.6 `FULL_TRANSITIVE` as the default for everything.**

- _For_: it is the only setting under which producers and consumers deploy independently, which is the
  entire point of having separate services.
- _Against_: it forbids removing a required field ever, forbids type promotion, and in practice teams
  respond by setting `NONE` for the one change they need — losing all enforcement. `BACKWARD_TRANSITIVE`
  with a disciplined consumer-first deploy order is more likely to survive contact with a roadmap.

---

## 12. Version matrix

| Change                                             | Version                                                                                                                                | What changed                                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avro enum `default` symbol                         | **1.9.0**                                                                                                                              | reader can fall back on an unknown writer symbol; tolerated-and-ignored by older readers                                                                                  |
| Avro union default must match _first_ branch       | **≤ 1.11.x** spec, and enforced by `new Schema.Parser()` in Java 1.11.4 [VERIFIED]                                                     | `["null","string"]` + `"default":"x"` is rejected                                                                                                                         |
| Avro union default may match _any_ branch          | **1.12.0** spec ("the first schema that matches"); Java 1.12.0 accepts [VERIFIED]                                                      | but `Field.defaultVal()` disagrees with the resolver for non-first-branch defaults [VERIFIED]                                                                             |
| Avro Schema Resolution rules                       | **unchanged** 1.11.1 → 1.12.0 [VERIFIED by diff]                                                                                       | no resolution difference between the two spec lines                                                                                                                       |
| Avro 1.12.0 resolution fixes                       | 1.12.0                                                                                                                                 | AVRO-3814/3818 (Rust), AVRO-3622 (Python), AVRO-3612 (better incompatibility locations)                                                                                   |
| proto3 unknown-field retention                     | **dropped in 3.0**, **restored in 3.5.0**                                                                                              | "Proto3 messages are now preserving unknown fields by default" [DOC v3.5.0 release notes]                                                                                 |
| proto3 explicit presence (`optional`)              | experimental behind `--experimental_allow_proto3_optional`, **GA in 3.15.0**                                                           | "no longer require the --experimental_allow_proto3_optional flag" [DOC]                                                                                                   |
| protobuf-java major version scheme                 | 4.x (tracks protoc 2x.x)                                                                                                               | 4.36.0 current on Central; Confluent notes "Google Protobuf v.4 is currently not supported" by `kafka-protobuf-serializer` [DOC] — **check this against your CP version** |
| Jackson `FAIL_ON_UNKNOWN_PROPERTIES`               | `true` in 2.x, **`false` as of 3.0**                                                                                                   | [SRC] both branches                                                                                                                                                       |
| Spring `Jackson2ObjectMapperBuilder`               | all versions                                                                                                                           | disables `FAIL_ON_UNKNOWN_PROPERTIES` [SRC]                                                                                                                               |
| Spring Kafka `JacksonUtils.enhancedObjectMapper()` | current                                                                                                                                | disables `FAIL_ON_UNKNOWN_PROPERTIES` [SRC]                                                                                                                               |
| Confluent logical-type serialisation defect        | broken in **CP 7.5.2 / 7.4.3**, fixed in **7.5.3 / 7.4.4** with `avro.use.logical.type.converters=true`; REST Proxy fixed in **7.7.0** | [DOC]                                                                                                                                                                     |
| Confluent SR client 429 auto-retry                 | **7.7.4+**                                                                                                                             | earlier clients do not retry rate limiting [DOC]                                                                                                                          |
| Confluent wire format: schema GUID in header       | **CP 8.1.1**                                                                                                                           | version byte `1` + 16-byte GUID; deserialiser default now checks header first, then payload prefix [DOC]                                                                  |
| Confluent `SubjectNameStrategy` interface          | `io.confluent.kafka.serializers.subject.SubjectNameStrategy` deprecated **as of 4.1.3**                                                | use `…subject.strategy.SubjectNameStrategy`; the old one "may have some performance degradation" [DOC]                                                                    |
| Confluent schema references                        | **CP 5.5.0+** and Confluent Cloud                                                                                                      | Avro, Protobuf, JSON Schema [DOC]                                                                                                                                         |
| AWS Glue format support                            | current                                                                                                                                | Avro **1.11.4**; JSON Schema **draft-04/06/07 only**; Protobuf proto2/proto3 without `extensions`/`groups` [DOC]                                                          |

---

## 13. Verification techniques (8)

**13.1 Offline transitive compatibility as a unit test (no registry, no network).**
Keep every historical schema in `src/test/resources/schemas/<subject>/vN.avsc`. One parameterised test:

```java
var history = loadAll("schemas/order").reversed();          // most recent first
new SchemaValidatorBuilder().canReadStrategy().validateAll()
    .validate(current, history);                            // == BACKWARD_TRANSITIVE
```

[VERIFIED] this catches the exact v1/v2/v3 default-removal case that plain `BACKWARD` waves through.
For a better failure message, loop `SchemaCompatibility.checkReaderWriterCompatibility` and print
`getResult().getIncompatibilities()` with its JSON-pointer `location`.

**13.2 Round-trip test: old reader against new writer, and new reader against old bytes.**
The only test that actually models the deploy. Serialise with schema N, deserialise with schema N-1 and
with schema N+1, assert on the _values_, not just the absence of an exception. This is what caught
§2.8 (a "compatible" default change silently altering old records) — the compatibility API is green and
the assertion on the value fails.
For Protobuf, do it with `DynamicMessage` over two descriptors so you do not need two builds of
generated code (the whole §3 verification table was produced this way).

**13.3 Golden bytes.**
Check a hex fixture of a serialised v1 record into the repo, and assert every future reader can decode
it into the expected values. Regenerate never. This is the only technique that survives someone
"cleaning up" the historical schema files. Cheap: one byte array and one assertion per schema version.

**13.4 `buf breaking` in CI, with the category matched to your transports.**

```bash
buf breaking --against '.git#branch=main,subdir=proto'
```

`breaking.use: [WIRE_JSON]` at minimum if anything speaks ProtoJSON; `FILE` if you publish generated
Java as a library. Run it on the PR, not on merge.

**13.5 `test-compatibility` against the real registry, per environment.**
`mvn io.confluent:kafka-schema-registry-maven-plugin:8.3.1:test-compatibility` with
`schemaRegistryUrls` pointing at staging _and_ production. This is the check that knows what is actually
registered, including the versions your repo forgot about. `verbose` defaults to `true` — keep it.
Pair with `schema-registry:download` + a diff to detect repo/registry drift.

**13.6 Testcontainers shape: a real registry, a real broker, two schema versions.**

```
GenericContainer kafka   = new ConfluentKafkaContainer("confluentinc/cp-kafka:<pin>");
GenericContainer sr      = new GenericContainer("confluentinc/cp-schema-registry:<pin>")
                              .withEnv("SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS", ...)
                              .withExposedPorts(8081);
```

Then, in one test: set the subject's compatibility to the level you claim to run
(`PUT /config/<subject> {"compatibility":"BACKWARD_TRANSITIVE"}`), register v1, produce a v1 record with
`auto.register.schemas=false`, register v2, produce a v2 record, and consume **both** with a v1-generated
consumer and a v2-generated consumer. This is the only test that exercises the registry's _actual_
verdict rather than the library's, and it catches registry-side surprises like the open-content-model
rejection (§4.5). Pin the CP image tag to the version you run in production — the wire-format default
changed at 8.1.1 (§5.3).

**13.7 The production signal for Protobuf: unknown-field volume.**
Meter it on every parse path:

```java
int unknown = msg.getUnknownFields().asMap().size();
```

Non-zero is not an error — it is the expected steady state during an expand phase, and the number
should fall to zero after the contract phase. A _rise_ on a service you did not deploy means someone
upstream shipped a field you do not know about. A _persistent_ non-zero after a migration means the
contract half never completed. This is also the only signal for the silent wire-type-mismatch corruption
in §9.3, because the corrupted bytes land in exactly this bucket.

**13.8 The production signal for the registry: schema-id cardinality per topic.**
Tag a counter with the schema id extracted from bytes 1–4 of the payload (or the header GUID on CP
8.1.1+). Then:

- more than two distinct ids on a topic = a rollout in progress; alert if it persists past your deploy
  window
- an id you have never seen = someone auto-registered
- during a contract phase, watch the _old_ id's rate go to zero — that is the measurement that tells you
  the wait in §7.2 is over, rather than guessing from the retention setting
  For Avro consumers, also log `AvroTypeException` and `SerializationException` with the schema id
  attached; without the id, those stack traces are unactionable.

---

## 14. Boundary with existing skills in this repository

Read from each skill's `description` frontmatter. Where this topic touches theirs:

| Skill                                | Boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serialization-performance`          | Owns throughput, allocation per operation, wire size, buffer reuse, benchmarking. Its description already mentions "schema evolution together" as a _comparison axis_ — this skill owns the evolution rules themselves; that one owns the cost. Route wire-size and CPU questions there. It also owns the Kryo mixed-deploy `ClassCastException`, which is the same _shape_ of failure as ours but a different mechanism.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `java-serialization-hardening`       | Owns `Serializable`, `readObject`, `serialVersionUID`, deserialization filters, and Jackson **polymorphic typing / default typing** as an attack surface. This skill must not discuss `serialVersionUID` (it is the Java-native analogue of a fingerprint, and belongs there) nor `@JsonTypeInfo`-based type resolution as a security matter. Explicitly cross-referenced already: its description says "cross-service contract evolution (rpc-and-api-contracts)".                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `rpc-and-api-contracts`              | The nearest neighbour and the most important boundary to get right. It owns: the error surface (stable codes, retryable flag, RFC 9457), HTTP/REST versioning, choosing REST vs gRPC vs messaging, and **expand-then-contract for a REST contract** — and its trigger list already includes "when a field is renamed or a proto field number reused" and "when a consumer fails on an unknown JSON property". **Proposed split**: `rpc-and-api-contracts` owns the _decision that a contract must change and how the two services coordinate_; this skill owns _the format's rules for what a given change does to the bytes, and the registry mechanics_. Practically: "should this be v2 of the endpoint?" → theirs. "Is `int32`→`int64` on field 7 safe, and who deploys first?" → ours. The overlap on expand-then-contract is real and the two descriptions must name each other. |
| `event-driven-architecture`          | Owns what an event _is_, event naming, granularity, choreography vs orchestration, and explicitly disclaims "schema evolution rules (rpc-and-api-contracts)" — that disclaimer should be repointed at this skill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `kafka-consumers-in-java`            | Owns offsets, groups, rebalance, the poll loop, `auto.offset.reset`. Touches us at exactly one point: **`auto.offset.reset=earliest` and consumer-group resets are the trigger that turns a latent transitive-compatibility violation into an outage** (§9.6). Name the link in both directions; do not duplicate the offset machinery.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `message-ordering-and-partitioning`  | Owns keys, partitions, ordering scope. No real overlap; a schema change does not affect ordering. One thin link: changing the _key's_ schema is far worse than changing the value's, because the partition assignment depends on the serialised key bytes. Worth one sentence here, since neither skill currently says it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `component-and-release-boundaries`   | Owns whether code becomes an independently releasable module and the cost of a shared jar. Touches us where a **generated-schema artefact is published as a shared jar** — then a schema change becomes a library upgrade with all the coupling that skill describes. Route "should the `.proto` files live in their own repo/module?" there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `delivery-semantics` / `idempotency` | Not overlapping, but adjacent: a schema failure in a consumer becomes a poison message. Route the "record that never succeeds" to `poison-messages-and-dlq`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `event-sourcing`                     | Its description already names "event schema change" as one of "the problems that have no clean answer". Upcasting chains and infinite-retention migration belong there; this skill supplies the format rules that determine how many upcasters you need (§7.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `flyway-migrations` (java-skills)    | Expand/contract for a _database_ column. Same runbook shape, different substrate. Worth a cross-reference only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

---

## 15. UNVERIFIED / could not confirm

1. **Karapace's current format support.** Sources disagree: one claims Avro/JSON only (no Protobuf) as
   of 2026, another claims all three from 3.2.0. Both are [BLOG]. I did not reach a primary source.
   Also unverified: how far its Confluent API parity now extends (a secondary source says "up to 6.1.1",
   which would predate schema references and the CP 8.1.1 header format).
2. **Apicurio's `ccompat` default when no rule is configured.** The ADR in the Apicurio repo says the
   `ccompat` compatibility endpoint defaults to `BACKWARD`; the user-facing docs say rules are inherited
   and absent rules mean no checking. These may both be true (different endpoints) but I did not confirm
   it against the running product or the source.
3. **Kafka log-compaction wording from `kafka.apache.org`.** The doc site is JS-rendered and could not be
   fetched through this tooling. The two quotations in §1.3 are taken from `apache/kafka` `trunk`
   `docs/design/design.md` (the source of that page), which I did fetch — treat as primary but note the
   published page may have been edited since.
4. **`Field.defaultVal()` returning `null` for a non-first-branch union default on Avro 1.12.0.**
   [VERIFIED] as behaviour; I did not find a JIRA issue for it and cannot say whether it is intentional
   or a regression from the 1.12 spec relaxation.
5. **Whether `SpecificDatumReader` honours the enum `default` symbol.** I verified enum-default
   resolution via `GenericDatumReader` only. AVRO-3313 reports that the enum default did not work in
   some configuration; I did not reproduce it, and I did not test the `SpecificRecord` path.
6. **Confluent's "Google Protobuf v.4 is currently not supported" note.** The current CP docs say the
   `kafka-protobuf-serializer` works with Protobuf v3 and that v4 is not supported. protobuf-java has
   been on 4.x since 2024, so this is either stale documentation or a real constraint. I did not test
   `kafka-protobuf-serializer` against `protobuf-java 4.x`. **Verify before recommending a version pair.**
7. **`kafka-schema-registry-maven-plugin` latest version.** 8.3.1 is the version in Confluent's own
   example pom on the current docs page; Confluent artefacts are not on Maven Central so I could not
   query `packages.confluent.io` for a newer one.
8. **Whether `test-local-compatibility` implements exactly the same algorithm as the server.** Confluent
   documents it as a convenience for development. I did not compare its verdicts against a live
   registry, so a CI setup that relies only on the local goal may diverge from the server on edge cases
   (notably JSON Schema content models).
9. **Protobuf `map` ↔ `repeated` message binary compatibility.** Quoted from the spec; not tested.
10. **JSON Schema 2020-12 support in Confluent.** The docs describe content models and the Avro-adapted
    rules but I did not find a statement of which JSON Schema drafts the checker implements. Glue's
    limitation to draft-04/06/07 is documented; Confluent's is not, in what I read.

---

## 16. Sources

**Specifications**

- Apache Avro 1.12.0 specification — `https://avro.apache.org/docs/1.12.0/specification/`
- Apache Avro 1.11.1 specification — `https://avro.apache.org/docs/1.11.1/specification/` (diffed
  against 1.12.0)
- Apache Avro 1.10.2 specification — `https://avro.apache.org/docs/1.10.2/spec.html` (union default
  wording)
- Protocol Buffers, Language Guide (proto3) — `https://protobuf.dev/programming-guides/proto3/`
- Protocol Buffers, Language Guide (proto2) — `https://protobuf.dev/programming-guides/proto2/`
- Protocol Buffers, Java Generated Code Guide — `https://protobuf.dev/reference/java/java-generated/`
- JSON Schema draft 2020-12 core — `https://json-schema.org/draft/2020-12/json-schema-core`
- Apache Kafka design docs — `apache/kafka` `trunk` `docs/design/design.md`, _Log Compaction_

**Release notes**

- protobuf v3.5.0 — `https://github.com/protocolbuffers/protobuf/releases/tag/v3.5.0`
- protobuf v3.15.0 — `https://github.com/protocolbuffers/protobuf/releases/tag/v3.15.0`
- Avro 1.12.0 — `https://github.com/apache/avro/releases/tag/release-1.12.0`

**Library source**

- `protocolbuffers/protobuf` `v32.0` `src/google/protobuf/compiler/java/full/enum.cc` (UNRECOGNIZED,
  `getNumber()`, `getValueDescriptor()`)
- `FasterXML/jackson-databind` `2.19` and `3.0` `DeserializationFeature.java`
- `spring-projects/spring-framework` `main` `spring-web/.../Jackson2ObjectMapperBuilder.java`
- `spring-projects/spring-kafka` `main` `spring-kafka/.../support/JacksonUtils.java`
- `confluentinc/schema-registry` `master`
  `schema-serializer/.../AbstractKafkaSchemaSerDeConfig.java`,
  `avro-serializer/.../AbstractKafkaAvroDeserializer.java`

**Vendor documentation**

- Confluent Platform, _Schema Evolution and Compatibility_ —
  `docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html`
- Confluent Platform, _Formats, Serializers, and Deserializers_ (wire format, subject-name strategies,
  `auto.register.schemas`, normalisation, Protobuf backward rules) —
  `.../fundamentals/serdes-develop/index.html`
- Confluent Platform, _JSON Schema Serializer and Deserializer_ (JSON Schema compatibility rules, open
  content model error) — `.../fundamentals/serdes-develop/serdes-json.html`
- Confluent Platform, _Protobuf Serializer and Deserializer_ — `.../serdes-develop/serdes-protobuf.html`
- Confluent Platform, _Avro Serializer and Deserializer_ — `.../serdes-develop/serdes-avro.html`
- Confluent Platform, _Schema Registry Maven Plugin_ — `.../schema-registry/develop/maven-plugin.html`
- Buf, _Breaking change rules_ and _Breaking quickstart_ — `buf.build/docs/breaking/...`
- Apicurio Registry 3.3.x, _Schema compatibility modes_ —
  `apicur.io/registry/docs/apicurio-registry/3.3.x/getting-started/assembly-registry-compatibility-modes.html`
- AWS Glue Developer Guide, _Schema registry_ — `docs.aws.amazon.com/glue/latest/dg/schema-registry.html`

**Secondary [BLOG] — low/medium confidence, used only where flagged**

- `Apicurio/apicurio-registry` `adr/0001-confluent-schema-registry-compatibility.md`
- Pi Stack, "Apicurio Registry vs Karapace vs Confluent" (2026-04) — Karapace format support claim
- Confluent blog posts _Understanding Protobuf Compatibility_ and _Understanding JSON Schema
  Compatibility_ (referenced by the official docs; not fetched)

**Local verification**
All [VERIFIED] results in this brief came from a scratch Maven project run on JDK 25 with
`avro 1.12.0`, `avro 1.11.4` (separate classpath), `protobuf-java 4.32.0` and `jackson-databind 2.19.0`.
Five programs: `AvroCheck` (resolution matrix, fingerprints, defaults), `UnionDefault` +
`ParserDefault` + `UnionDefaultRead` (the 1.11/1.12 union-default divergence),
`ValidatorCheck` (`SchemaValidatorBuilder` ↔ registry level mapping), `ProtoCheck` (presence, type
changes, reused numbers, unknown fields, repeated↔singular, unknown enum numbers, all via
`DynamicMessage`).
