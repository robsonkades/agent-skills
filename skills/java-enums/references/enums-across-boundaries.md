# Enums across boundaries

An enum inside one process is a closed set the compiler enforces. The moment a constant is
written to a database, a JSON body, a message or another artefact, three things stop being
true: the set is no longer closed (a peer may know constants you do not), the identity is no
longer the object (it is a string or a number), and adding a constant is no longer a local
change.

## Persistence

| Storage form                             | Rename a constant | Reorder constants | Add a constant | Verdict                              |
| ---------------------------------------- | ----------------- | ----------------- | -------------- | ------------------------------------ |
| `@Enumerated(ORDINAL)` — the JPA default | safe              | **corrupts data** | safe           | never                                |
| `@Enumerated(STRING)`                    | **breaks reads**  | safe              | safe           | acceptable; renames need a migration |
| Explicit code + `AttributeConverter`     | safe              | safe              | safe           | preferred for long-lived data        |

`ORDINAL` is the default when `@Enumerated` is omitted, which is why the failure is so common:
someone inserts a constant in the middle of the declaration list, the code compiles, the tests
pass, and every existing row now means something different. There is no error at any point.

```java
@Converter(autoApply = true)
public class OrderStatusConverter implements AttributeConverter<OrderStatus, String> {
    @Override public String convertToDatabaseColumn(OrderStatus s) { return s == null ? null : s.code(); }
    @Override public OrderStatus convertToEntityAttribute(String code) {
        return OrderStatus.byCode(code)
            .orElseThrow(() -> new IllegalStateException("unknown status code in database: " + code));
    }
}
```

The converter also gives you the place to decide what an unknown stored value means — a
question that has no good answer at the point where a row is being mapped, and must therefore
be decided deliberately. A database column holding `'SHIPPED'` is data with a lifetime measured
in years; the Java constant name is source that changes weekly. Decoupling them with a code
field is worth the ten lines.

## JSON and HTTP contracts

- **Serialising**, prefer an explicit representation (`@JsonValue` on the code accessor, or a
  converter) over `name()`. `name()` couples the wire format to an identifier that refactoring
  tools will happily rename.
- **Deserialising**, decide what an unknown value means _per direction_:
  - Inbound request from a client: an unknown value is a client error — reject with a 400 and
    the list of accepted values. Failing loudly is correct; the client sent something invalid.
  - Inbound response from a dependency, or an event from another service: an unknown value is
    a **version skew**, not an error. Rejecting it turns a peer's routine deploy into your
    outage.
- Jackson's defaults deserve an explicit decision rather than acceptance:
  `READ_UNKNOWN_ENUM_VALUES_AS_NULL` and `READ_UNKNOWN_ENUM_VALUES_USING_DEFAULT_VALUE` (with
  `@JsonEnumDefaultValue`) exist precisely for the second case. Silence is not a policy —
  choose one and write it down in the contract.

## Messages, events and schemas

Enums in a schema are where the rolling deploy bites. During any deploy the producer and the
consumer run different versions for a window measured in minutes, and traffic is served
throughout it.

- **Adding a constant is a producer-side change with a consumer-side cost.** The safe order is:
  deploy consumers that tolerate the unknown value first, then deploy the producer that emits
  it. Reversing that order means every consumer sees a value it cannot map, and whether that is
  a dropped message, a poison message or a crash loop depends on code nobody looked at.
- **Protobuf** enums require a zero value and are open by design: an unknown number is
  preserved and surfaces as `UNRECOGNIZED`/the zero value depending on language and edition.
  This is a feature — model the `UNKNOWN = 0` constant deliberately and handle it.
- **Avro** enums are closed unless the reader schema declares a default; without one, an
  unknown symbol fails the read. With Schema Registry, adding a symbol is a
  backward-compatible change for readers that have the new schema and a break for those that
  do not.
- **Removing or renaming a constant is always breaking**, in every format. Deprecate it, stop
  producing it, wait for retention to pass, then remove — the same discipline as any other
  field; rpc-and-api-contracts covers the general rules and poison-messages-and-dlq covers
  where the unhandleable message goes.

## Exhaustive switch and separate compilation

A switch expression over an enum with no `default` is checked at compile time. That check is
against the enum **as it was when the switch was compiled**:

- Same artefact, recompiled together: adding a constant breaks the build. This is the desired
  behaviour and the reason to omit `default`.
- Different artefacts (the enum ships in a library, the switch in your service): adding a
  constant does not break your build — it is not recompiled. At runtime, a value with no
  matching case reaches a synthetic fallback that throws rather than silently choosing a
  branch. The failure is loud, which is right, but it happens in production rather than in CI.

The practical rule: for enums crossing an artefact boundary, keep the exhaustive switch _and_
pin the dependency version, or handle the unknown case explicitly at the boundary where the
value enters. Do not rely on the compiler to protect you across a jar boundary.

## API documentation and clients

An enum in a public API is a closed set your clients hard-code. Two things to state in the
contract, both of which are cheap now and expensive later:

- Whether the set may grow, and what a client should do with a value it does not recognise
  (ignore, treat as "other", or fail).
- Which values are permanent. Generated clients — OpenAPI, gRPC, GraphQL — usually turn an
  enum into a closed type in a statically typed language, so a value added on the server
  becomes a deserialisation error in a client that was generated last quarter.

Where the set genuinely evolves fast (categories, reason codes, feature identifiers), a
validated `String` with a server-side registry is often the honest model, and it keeps clients
working. Reserve enums for sets that change on the scale of a release, not on the scale of a
business rule.

## Review checks

- [ ] No `@Enumerated` left at its default, anywhere.
- [ ] No `ordinal()` outside `EnumSet`/`EnumMap` usage.
- [ ] Enum values written to storage or the wire use an explicit, stable code.
- [ ] Every deserialisation point states what an unknown value does, and the answer differs
      for client input versus peer input.
- [ ] Adding a constant has a documented deploy order (consumers first).
- [ ] Switches over enums the service owns have no `default`; switches over enums from other
      artefacts handle the unknown case explicitly.
- [ ] Removal or rename of a constant is treated as a breaking contract change, with a
      deprecation window covering message retention.
