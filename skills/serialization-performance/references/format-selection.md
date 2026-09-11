# Format-selection scorecard

Do not select from a universal scenario-to-format table. Score the exact boundary, implementation,
version, and workload. A format family does not guarantee performance or compatibility quality in
every language binding.

## Weighted scorecard

| Dimension                                       | Requirement/weight | Candidate evidence |
| ----------------------------------------------- | ------------------ | ------------------ |
| producer/consumer languages and support horizon |                    |                    |
| rolling/backward/forward/full compatibility     |                    |                    |
| retained-data/replay/migration horizon          |                    |                    |
| encode/decode CPU and tail by corpus            |                    |                    |
| heap allocation/retention and native buffers    |                    |                    |
| wire/storage bytes and compression              |                    |                    |
| streaming, framing, random/selective access     |                    |                    |
| deterministic/canonical bytes                   |                    |                    |
| schema registry/code generation/tooling         |                    |                    |
| malformed/resource-exhaustion security          |                    |                    |
| debuggability/observability                     |                    |                    |
| operational dependency and recovery             |                    |                    |
| migration/dual-read-write/rollback cost         |                    |                    |

Hard constraints eliminate candidates before weighted preferences. Select relevant dimensions;
a narrow configuration review need not fill every cell. Document consequential uncertainty and
use a focused check when it could change the decision, rather than assigning invented precision
or requiring a spike for an irrelevant unknown. An adequate candidate can remain unchanged.

## Compatibility questions

For a selection or compatibility change, test the applicable contracts and reachable pairs:

- adding/removing/renaming fields and changing field IDs/types;
- required/optional/default/presence semantics;
- unknown-field retention or loss through read-modify-write intermediaries;
- enum additions and unknown values;
- numeric narrowing/sign/overflow and string/bytes changes;
- map ordering, duplicate fields, canonicalization and signatures;
- generated-code/runtime version skew and cross-language conformance;
- schema registry subject/naming/compatibility/cache/outage policy;
- tombstone/null/empty and malformed historical data;
- rollback after new writers emitted new bytes.

Compatibility claims belong to the deployed reader/writer matrix, not only the format spec.

## Tagged and schema-ordered formats

Tagged encodings can skip unknown fields and evolve by stable identifiers under format-specific
rules. Costs depend on tag/value encoding, schema resolution, generated versus reflective paths,
object materialization, string/bytes handling and implementation optimizations.

Protocol Buffers field tags combine field number and wire type. Deterministic serialization is
not canonical across builds/versions/languages; do not use it alone to justify stable signatures
or persistent deduplication hashes. Define the exact canonicalization contract where needed.

Avro binary records are different: field values follow writer-schema order, without per-field
tags. Readers need the writer schema and resolve it against the reader schema; skipping unknown
fields relies on that schema, not a Protobuf-style tag. Defaults fill fields absent from the
writer schema during resolution; they do not omit default-valued fields from binary encoding.
Writer-schema retrieval, embedded schemas or registry/cache availability belong in the cost model.

## Indexed/in-place formats

Offset/vtable/pointer-oriented formats can provide field access without constructing a complete
object tree. Evaluate:

- validation bounds and behavior on corrupt offsets/lengths;
- number/locality of fields accessed and repeated traversal;
- backing buffer ownership and how long it is retained;
- compression incompatibility with random access unless decompressed/materialized;
- alignment/endian and implementation behavior;
- mutation/build complexity and schema evolution constraints;
- Java binding maturity, supported JDKs, release cadence and interoperability fixtures.

The right comparison is against the actual materialization/access pattern, not “O(1) versus O(n)”
as a complete performance conclusion.

## JSON and self-describing text

JSON offers ecosystem reach, inspection and flexible producers. Measure name/number/string parsing,
binding/reflection/codegen, UTF-8/transcoding, unknown fields, duplicate keys, numeric precision,
canonicalization, compression and allocation for the chosen library/configuration. Streaming/token
APIs and tree/data-binding APIs have different costs and semantics.

For Jackson, record the major/minor version, modules, target types, parser constraints and actual
framework overrides. Configure a Jackson 2 mapper before its first read/write; do not benchmark a fresh
mapper per message against a warmed shared production mapper unless lifecycle is the intended
factor. Do not transfer defaults across major versions: Jackson 3.0 changed
`FAIL_ON_UNKNOWN_PROPERTIES` to false and `FAIL_ON_NULL_FOR_PRIMITIVES` and
`FAIL_ON_TRAILING_TOKENS` to true. Test the effective configuration rather than silently changing
acceptance behavior to win a benchmark. JDK/module compatibility must come from the resolved release.

Binary replacements can reduce bytes/CPU while adding schema/tooling/compatibility dependencies.
For a replacement justified by performance, require measured benefit sufficient for migration and
operational cost. A new boundary or a necessary contract repair can be chosen for hard requirements;
do not claim an unmeasured performance win.

## Kryo/object-graph codecs

Registered classes can use their registrations/IDs even if unregistered classes remain permitted.
Enabling registration-required changes unknown-type handling by rejecting them and helps keep the
protocol closed; it is not the switch that retroactively makes registered types compact.

Protocol checklist:

- explicit stable registration IDs and no accidental order dependence;
- serializer configuration/version pinned and golden bytes retained;
- reference tracking consistent with cyclic/shared graph semantics;
- class evolution and custom/version serializer behavior tested;
- codec instance confinement/reset and pool failure behavior;
- trust boundary: class instantiation and resource limits reviewed;
- old bytes, mixed deploy and rollback tested.

Raw session-scoped use may be reasonable for ephemeral trusted data. Long-lived use is possible
only when the team deliberately owns this protocol and proves compatibility; it is not categorically
forbidden, but its governance cost may outweigh a schema-first format.

## Java native serialization

Do not choose it for a new untrusted or independently evolved boundary. Legacy compatibility may
require it. Records have special serialization semantics, including canonical-constructor-based
reconstruction, while ordinary serializable classes use different construction/hooks. Neither
removes the need for filtering and resource limits.

For retained legacy paths:

- inventory origins/trust and serializable graph;
- apply `ObjectInputFilter` class and resource constraints using tested pattern/API semantics;
- use per-context filter factories where appropriate;
- test allowed/rejected graphs, depth/references/array/bytes, proxies and substitution hooks;
- authenticate/integrity-check and bound transport/decompression before object parsing;
- when migration is justified, test the required dual-read/version envelope and rollback paths.

Follow `java-serialization-hardening` for the security design.

## Selection result

Return the fields needed to explain the actual decision. A supported keep/no-change result or a
narrow API interpretation need not include a full experiment or migration plan.

```text
hard constraints and candidates eliminated:
weighted dimensions and evidence quality:
payload/version/language corpus:
performance experiment and total system cost:
compatibility/failure/security results:
operational dependencies and ownership:
migration/rollback plan:
decision, review date and triggers to revisit:
```

## Authoritative references

- [Protocol Buffers language guide](https://protobuf.dev/programming-guides/proto3/)
- [Protocol Buffers encoding](https://protobuf.dev/programming-guides/encoding/)
- [Protocol Buffers serialization is not canonical](https://protobuf.dev/programming-guides/serialization-not-canonical/)
- [Avro 1.12.0 binary encoding and resolution](https://avro.apache.org/docs/1.12.0/specification/)
- [Jackson 3.0.0 deserialization defaults](https://github.com/FasterXML/jackson-databind/blob/jackson-databind-3.0.0/src/main/java/tools/jackson/databind/DeserializationFeature.java)
- [Jackson 2 ObjectMapper lifecycle](https://github.com/FasterXML/jackson-databind/blob/jackson-databind-2.18.0/src/main/java/com/fasterxml/jackson/databind/ObjectMapper.java)
- [FlatBuffers documentation](https://flatbuffers.dev/)
- [Cap'n Proto encoding](https://capnproto.org/encoding.html)
- [Kryo 5.6.2 documentation](https://github.com/EsotericSoftware/kryo/tree/kryo-parent-5.6.2)
- [Java Object Serialization specification](https://docs.oracle.com/en/java/javase/25/docs/specs/serialization/)
- [Java serialization filtering](https://docs.oracle.com/en/java/javase/25/core/serialization-filtering1.html)
