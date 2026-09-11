# Enums across boundaries

An enum represents the constants known to its compiled definition. Stored or wire values can
outlive that definition or reach peers with a different set. Their representation is a contract
of its own; adding a constant may therefore require more than a local source change.

## Persistence

| Storage form                                                              | Rename a constant | Reorder constants        | Add a constant | Verdict                              |
| ------------------------------------------------------------------------- | ----------------- | ------------------------ | -------------- | ------------------------------------ |
| Ordinal mapping (the fallback absent explicit mapping/`@EnumeratedValue`) | safe              | **may reinterpret data** | safe           | avoid for domain identity            |
| `@Enumerated(STRING)` without an explicit value field                     | **breaks reads**  | safe                     | safe           | acceptable; renames need a migration |
| Explicit code + `AttributeConverter`                                      | safe              | safe                     | safe           | preferred for long-lived data        |

Jakarta Persistence 3.2 infers `STRING` when a final `String` field is annotated
`@EnumeratedValue` and no converter/explicit annotation applies; otherwise the inference is `ORDINAL`.
Bare `@Enumerated` explicitly selects its default `ORDINAL`, not String-field inference.
With 3.2 provider support, a final distinct byte/short/int `@EnumeratedValue` supplies numeric
`ORDINAL` codes, or a final distinct non-null String field supplies `STRING` codes. These codes
are independent of declaration position/name; field type must match the mapping. Preserve adequate
existing codes rather than migrating every `ORDINAL` annotation. Older versions lack this facility.
Positional persistence is hazardous because
someone inserts a constant in the middle of the declaration list, the code compiles, the tests
may pass, and affected positions can read as different constants without an error.

The table's "safe" means existing stored identities only, subject to unchanged code values
and constraints. Ordinal additions are safe only when appended; insertion shifts identities.
New values in any mapping can still break older readers or database constraints. Test old
rows with the new reader and new rows with every supported old reader separately.

```java
@Converter(autoApply = true)
public class OrderStatusConverter implements AttributeConverter<OrderStatus, String> {
    @Override public String convertToDatabaseColumn(OrderStatus s) { return s == null ? null : s.code(); }
    @Override public OrderStatus convertToEntityAttribute(String code) {
        if (code == null) return null; // nullable-column policy; reject explicitly if forbidden
        return OrderStatus.byCode(code)
            .orElseThrow(() -> new IllegalStateException("unknown status code in database"));
    }
}
```

The converter also gives you the place to decide what an unknown stored value means — a
contract that must be decided before mapping encounters it. Stable names can already be a valid
published storage contract; separate codes help when source names need to evolve independently.
Do not change an existing mapping without its data and consumer migration plan.

This is a partial Jakarta Persistence sketch with omitted imports and `OrderStatus` code
lookup. Do not combine a converter with `@Enumerated` on the same attribute and assume
portable conversion. Validate null, unknown and duplicate-code handling against the actual provider.

## JSON and HTTP contracts

- **Serialising**, prefer an explicit representation (`@JsonValue` on the code accessor, or a
  converter) over `name()`. `name()` couples the wire format to an identifier that refactoring
  tools will happily rename.
- **Deserialising**, decide what an unknown value means _per direction_:
  - Inbound request from a client: reject values outside the endpoint's accepted contract with
    its documented error policy. A forwarding endpoint may deliberately preserve future raw
    codes; direction alone does not decide validity or permission to disclose accepted values.
  - Inbound response/event from a peer: an unknown value is usually version skew. Choose
    preserve/map/quarantine/reject based on safety; fail-closed rejection can be correct for
    authorization or financial semantics even though it affects availability.
- Jackson configuration deserves an explicit decision rather than acceptance. For example,
  Jackson 2.19 provides disabled-by-default features
  `READ_UNKNOWN_ENUM_VALUES_AS_NULL` and `READ_UNKNOWN_ENUM_VALUES_USING_DEFAULT_VALUE` (with
  `@JsonEnumDefaultValue`). Verify the actual mapper/version and downstream semantics: replacing
  an unknown with null or a default is not raw-code preservation. Write the policy into the contract.

## Messages, events and schemas

Enums in a schema need the actual deployed, rollback and replay reader/writer pairs. Version
skew can last beyond a rollout, and an already tolerant reader may need no change.

- **Separate adding a declaration from emitting a new value.** If reachable consumers cannot
  safely handle it, upgrade or bridge them before emission. Existing meaningful tolerance may
  permit either order; test decoding and application behavior, not just schema registration.
- **Protobuf** enum rules and generated APIs vary by syntax/edition/language. Proto3 requires a
  zero-valued first constant; Java APIs can preserve raw unknown numeric values and expose
  `UNRECOGNIZED` in enum accessors. Do not conflate an absent/default zero with an unknown wire
  number; test the generated version you ship.
- **Avro 1.12** resolves a writer symbol absent from the reader enum using that reader's enum
  default, or fails if no default exists. Adding a symbol lets the new reader read old symbols;
  old-reader compatibility depends on its actual default and application semantics. Registry
  compatibility does not establish every deployed reader's behavior (schema-evolution-and-compatibility).
- **Removing or renaming an externally represented constant is normally breaking** unless the
  format/schema provides a compatible mapping and all relevant consumers honor it. Deprecate it,
  stop producing it, then prove retained rows, compacted values, backups, replay and rollback paths
  no longer need it or have a tested mapping before removal. Waiting alone is insufficient — as for any
  field; rpc-and-api-contracts covers the general rules and poison-messages-and-dlq covers
  where the unhandleable message goes.

## Exhaustive switch and separate compilation

A switch expression over an enum with no catch-all is checked at compile time. That check is
against the enum **as it was when the switch was compiled**:

- Recompiled against the changed enum: adding an uncovered constant fails compilation. This
  is useful when every constant needs an explicit decision; an intentional catch-all still compiles.
- Different artefacts (the enum ships in a library, the switch in your service): adding a
  constant does not break your build — it is not recompiled. At runtime, a value with no
  matching case reaches compiler/JDK-version-specific synthetic failure behavior rather than a
  source recompilation error. Java 14–20-target enum expressions use `IncompatibleClassChangeError`;
  Java 21+ uses `MatchException`. An old traditional statement switch can do nothing when no case
  matches. Test the actual compiled form and target, not only the runtime version.

The practical rule: for enums crossing an artefact boundary, keep the exhaustive switch _and_
pin the dependency version, or handle the unknown case explicitly at the boundary where the
value enters. Verify the deployed dependency graph and decoding policy: a `default` cannot catch
wire text that the enum decoder already rejected. Do not rely on the compiler across a jar boundary.

## API documentation and clients

An enum in a public API is a closed set your clients hard-code. Two things to state in the
contract, both of which are cheap now and expensive later:

- Whether the set may grow, and what a client should do with a value it does not recognise
  (ignore, treat as "other", or fail).
- Which values are permanent. Generated clients may use a closed type and reject a newly
  emitted value, or supply explicit unknown-value handling. Inspect the generated type and
  effective decoder instead of inferring behavior from its age or generator name.

Where the set genuinely evolves fast (categories, reason codes, feature identifiers), a
validated `String` with a server-side registry may preserve open codes. Client business logic still
needs an unknown-value contract; a String alone does not establish compatibility. Choose enum
closure from the supported compatibility horizon, not a fixed rate of business change.

## Review checks

- [ ] Every persistent enum has explicit Persistence-version-aware mapping (`@Enumerated`,
      `@EnumeratedValue`, converter, or scalar code) and unknown-value policy.
- [ ] Declaration positions/hashes are not used as independently stable domain identity.
- [ ] Stored/wire identity is explicit and stable, including names if that is the accepted contract.
- [ ] Unknown-value behavior follows each endpoint's accepted semantics and authority.
- [ ] New-value emission and removal are safe for required reader/writer and retained-data pairs.
- [ ] Switches expose uncovered constants or have an intentional tested fallback; boundary
      decoding and separately compiled consumers are checked where relevant.
- [ ] Changes to externally represented codes have a compatibility decision and any required
      migration/removal evidence covering reachable retained data, restores and rollback.

Primary mapping references: [Persistence 3.2 Enumerated](https://jakarta.ee/specifications/persistence/3.2/apidocs/jakarta.persistence/jakarta/persistence/enumerated)
and [EnumeratedValue](https://jakarta.ee/specifications/persistence/3.2/apidocs/jakarta.persistence/jakarta/persistence/enumeratedvalue).
For format and switch details: [Avro 1.12 schema resolution](https://avro.apache.org/docs/1.12.0/specification/#schema-resolution),
[JEP 441's enum-switch change](https://openjdk.org/jeps/441), and
[Jackson 2.19 feature contracts](https://github.com/FasterXML/jackson-databind/blob/jackson-databind-2.19.0/src/main/java/com/fasterxml/jackson/databind/DeserializationFeature.java).
