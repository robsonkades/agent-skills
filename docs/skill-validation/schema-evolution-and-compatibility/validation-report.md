# Validation report — `schema-evolution-and-compatibility`

**Current gate result (iteration 1): FAIL.** 2 BLOCKER, 5 MAJOR.

| Iteration | Date       | Gate     | BLOCKER | MAJOR | MINOR | NIT |
| --------- | ---------- | -------- | ------- | ----- | ----- | --- |
| 1         | 2026-08-28 | **FAIL** | 2       | 5     | 4     | 2   |

Validated by an independent validator who did not author the skill or the research brief.
Gate criterion: PASS requires zero BLOCKER and zero MAJOR.

**External blocker, not held against the gate.** `registry/skills.yaml` cannot be regenerated:
`npm run registry:build` aborts on an unrelated in-flight directory
(`skills/architecture-fitness-functions`, which has no `skill.yaml`). This package is
consequently absent from the index — see "External blocker" at the end. Same situation as
iteration 2 of `concurrent-collections-and-synchronizers`.

---

## Method note

Everything below marked _executed_ was run on **Temurin JDK 25.0.3+9 / Maven 3.9.15** on this
machine, against artefacts resolved from Maven Central and `packages.confluent.io`. Nothing
in the "verified" column was taken from the skill's prose or from the research brief.

**Executed** (build outputs written only to the scratchpad, never into the repo):

| What                                                                                                                            | How                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Avro union-default rule                                                                                                         | `new Schema.Parser()` on **1.11.4, 1.11.5, 1.12.0, 1.12.1, 1.12.2**, with and without `setValidateDefaults(true)`                                                                                                        |
| Avro `Field.defaultVal()` vs `GenericDatumReader`                                                                               | real writer→reader round trip on 1.12.0 and 1.12.2                                                                                                                                                                       |
| The whole Avro reader/writer matrix (15 rows)                                                                                   | `SchemaCompatibility.checkReaderWriterCompatibility` **plus** a real `GenericDatumWriter`→`GenericDatumReader` round trip                                                                                                |
| Avro parsing fingerprint                                                                                                        | `SchemaNormalization.parsingFingerprint64`, doc vs no-doc                                                                                                                                                                |
| `SchemaValidatorBuilder` level equivalences                                                                                     | `canReadStrategy`/`mutualReadStrategy` × `validateAll`/`validateLatest` on 1.12.0                                                                                                                                        |
| Protobuf presence, unknown-field round trip, packed/singular, reused numbers, enum unknowns, **9 type-change corruption modes** | `DynamicMessage` over programmatically built descriptors, **protobuf-java 4.32.0**, asserted on bytes                                                                                                                    |
| Jackson `FAIL_ON_UNKNOWN_PROPERTIES`                                                                                            | **2.19.0** (`com.fasterxml`) and **3.0.0** (`tools.jackson`), default mapper, real deserialise                                                                                                                           |
| Spring's builders                                                                                                               | `Jackson2ObjectMapperBuilder`, `MappingJackson2HttpMessageConverter`, spring-kafka `JacksonUtils.enhancedObjectMapper()` on spring-web 6.2.11 / spring-kafka 3.3.7; deprecation checked on spring-web **7.0.0** bytecode |
| Confluent serialiser defaults                                                                                                   | `AbstractKafkaSchemaSerDeConfig` and `AbstractKafkaAvroDeserializer` source from `confluentinc/schema-registry` `master`                                                                                                 |
| `kafka-schema-registry-maven-plugin:8.3.1`                                                                                      | goal list from the shipped `META-INF/maven/plugin.xml`; `verbose` default from constructor bytecode; **`test-local-compatibility` actually run** on a scratch project, both `BACKWARD_TRANSITIVE` and `BACKWARD`         |
| Confluent JSON Schema checker                                                                                                   | `kafka-json-schema-provider` **8.3.1** and **7.9.9**: `ObjectSchemaDiff` bytecode compared, and the open-content-model rejection **reproduced** through `JsonSchema.isBackwardCompatible`                                |
| `buf breaking`                                                                                                                  | **buf CLI v1.72.0 downloaded and run** against a real git repo, `WIRE_JSON` vs `WIRE`, using the skill's exact `--against` string                                                                                        |
| Confluent compatibility-level table                                                                                             | full text of `docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html`                                                                                                                     |
| Avro spec wording, 1.11.1 vs 1.12.0                                                                                             | both published specs fetched and compared                                                                                                                                                                                |
| protobuf `enum.cc` line citations                                                                                               | `protocolbuffers/protobuf` tag `v32.0` source fetched                                                                                                                                                                    |
| protobuf 3.5.0 / 3.15.0 release-note quotations                                                                                 | GitHub releases API                                                                                                                                                                                                      |
| AWS Glue registry claims                                                                                                        | AWS Glue developer guide                                                                                                                                                                                                 |
| Package hygiene                                                                                                                 | `node packages/cli/bin/agent-skills.mjs validate`; description truncation measured at 1024                                                                                                                               |

**Read only, not executed:** the Confluent Platform 8.1.1 header-GUID framing (no CP 8.1.1
broker available); Apicurio and Karapace behaviour (no running product); the Testcontainers
recipe (compiled, not run); `kafka-protobuf-serializer` against protobuf-java 4.x;
`SpecificDatumReader`'s handling of the enum `default` symbol; `test-compatibility` against a
live registry. See "What I could not verify".

---

# BLOCKER

## B1 — `references/protobuf.md:108-117`: the reused-field-number transcript is labelled verified and does not reproduce

**Quoted** (`references/protobuf.md:110-116`, under the heading _"## Reusing a field number — verified"_):

```text
payload "\nabc"           -> address { street: "abc" }   <-- a valid object, wrong data
payload "bob@example.com" -> InvalidProtocolBufferException: While parsing a protocol message,
                             the input ended unexpectedly in the middle of a field.
```

> `"\nabc"` happens to be `field 1, wire type 2, length 3, "abc"` — a perfectly well-formed `Address`.

**Evidence.** `field 5` declared `string email`, deleted, number 5 reused for `Address address`
(both wire type 2), `DynamicMessage` on protobuf-java 4.32.0:

```
payload "\nabc"          inner bytes = [0a 61 62 63]     full = [2a 04 0a 61 62 63]
   -> InvalidProtocolBufferException: While parsing a protocol message, the input ended unexpectedly
payload "\n\u0003abc"    inner bytes = [0a 03 61 62 63]  full = [2a 05 0a 03 61 62 63]
   -> PARSED: address { street: "abc" }
payload "bob@example.com" inner bytes = [62 6f 62 40 ...] -> InvalidProtocolBufferException
```

The Java string `"\nabc"` is the four bytes `0a 61 62 63`. `0a` is field 1 / wire type 2, and
the **next** byte is the length: `0x61` = 97, far beyond the 2 bytes remaining — hence the
exception. The explanation "`length 3`" is arithmetically wrong; a length byte of `0x03` has to
be _present_, which requires the five-byte payload `"\n\u0003abc"`.

The research brief §3.6 carries the identical payload and the identical wrong arithmetic, also
tagged `[VERIFIED]`. Skill and brief agreeing is not evidence — this is the failure mode.

**The conclusion survives**; only the demonstration is false. A reused number at the same wire
type does produce a well-formed wrong object for some payloads, as the middle line above shows.

**Fix.** In `references/protobuf.md`, replace the payload and the explanation:

```text
payload "\n\u0003abc"     -> address { street: "abc" }   <-- a valid object, wrong data
payload "bob@example.com" -> InvalidProtocolBufferException: While parsing a protocol message,
                             the input ended unexpectedly in the middle of a field.
```

> `"\n\u0003abc"` is the bytes `0a 03 61 62 63` — `field 1, wire type 2, length 3, "abc"` — a
> perfectly well-formed `Address`.

Correct the brief's §3.6 as well, or it will be re-imported on the next pass.

---

## B2 — `SKILL.md:83`: "any other type change on the number reads as zero, silently" is false, and it disarms the skill's own detector

**Quoted** (`SKILL.md:83`, format table, _Narrow a scalar_ / Protobuf column):

> same undetectable set; any _other_ type change on the number reads as zero, silently

**Evidence.** Nine type changes, writer value `300` (or `"hi"`), protobuf-java 4.32.0,
`DynamicMessage` over two descriptors:

```
int32 -> sint32    bytes=08 ac 02        -> value=150      unknown=[]
int32 -> uint32    bytes=08 ac 02        -> value=300      unknown=[]
int32 -> bool      bytes=08 ac 02        -> value=true     unknown=[]
sint32 -> int32    bytes=08 d8 04        -> value=600      unknown=[]
fixed32 -> float   bytes=0d 2c 01 00 00  -> value=4.2E-43  unknown=[]
fixed32 -> int32   bytes=0d 2c 01 00 00  -> value=0        unknown=[1]
int32 -> string    bytes=08 ac 02        -> value=""       unknown=[1]
int32 -> double    bytes=08 ac 02        -> value=0.0      unknown=[1]
string -> bytes    bytes=0a 02 68 69     -> value="hi"     unknown=[]
```

Only the three rows where the **wire type** differs read as zero. A change that keeps the wire
type but changes the interpretation — `int32`↔`sint32` (zigzag), `fixed32`↔`float` — produces a
**plausible non-zero wrong value**, and the field is _not_ routed to the unknown-field set.

Two consequences, both load-bearing:

1. The stated corruption mode is the _safer_ one. The dangerous mode — `int32 amount` becoming
   `sint32 amount` and every amount reading 150 instead of 300 — is not stated anywhere in the
   skill or its references.
2. It contradicts the skill's own prescribed production detector. `SKILL.md:171-173` says
   "`msg.getUnknownFields().asMap().size()` on every Protobuf parse path: non-zero is the steady
   state during expand". For the sint32/fixed32 confusions `unknown` is **empty**, so the
   detector the skill tells you to build is blind to exactly the change that silently corrupts
   numbers. A reader who trusts both statements concludes "unknown fields are clean, therefore
   no type drift" — which is the wrong conclusion.

`references/protobuf.md:96-103` states the narrower, correct claim ("A wire-type mismatch does
not throw"). The body over-generalises past its own reference.

**Fix.** Replace the cell at `SKILL.md:83` with two cases:

> same undetectable set; a change that keeps the wire type reads a **plausible wrong value**
> (`int32(300)`→`sint32` = 150, `fixed32`→`float` = 4.2E-43) with an **empty** unknown-field set;
> a change that alters the wire type reads as zero, bytes in `unknownFields`. Neither throws.

and add the same distinction to `references/protobuf.md` under _"Type changes that corrupt"_,
with the transcript above. Then qualify `SKILL.md:171-173`: unknown-field count detects
wire-type drift only, never a same-wire-type reinterpretation — for that, golden bytes.

---

# MAJOR

## M1 — `PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL` is deprecated and is not emitted by the 8.x line the skill pins

**Quoted**, `SKILL.md:19` and `skill.yaml:21` (frontmatter trigger):

> when a registry returns PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL

and `references/registry-and-json.md:139-146`, headed _"The rejection you will actually see"_:

```text
details: [{errorType:"PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL", description:"The new schema has an
open content model and has a property or item at path '#/properties/dname' which is missing in
the old schema'}
```

**Evidence.** `confluentinc/schema-registry` `master`,
`json-schema-provider/.../diff/Difference.java:47`:

```java
    @Deprecated PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL,
    REQUIRED_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL,
    REQUIRED_PROPERTY_WITH_DEFAULT_ADDED_TO_OPEN_CONTENT_MODEL,
    OPTIONAL_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL,
```

and the deprecated constant is **not** a member of `propertyOrItemAddedToOpen` (`:122-127`), so
no error message is ever built from it. Confirmed against the shipped artefacts by decompiling
`ObjectSchemaDiff`:

```
=== kafka-json-schema-provider 7.9.9 emits: ===   PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL
=== kafka-json-schema-provider 8.3.1 emits: ===   OPTIONAL_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL
                                                  REQUIRED_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL
                                                  REQUIRED_PROPERTY_WITH_DEFAULT_ADDED_TO_OPEN_CONTENT_MODEL
```

Reproduced end to end on 8.3.1 — v1 open with `field1`, v2 adding `dname`:

```
BACKWARD, open v1, optional added -> [{errorType:"OPTIONAL_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL", …}]
BACKWARD, open v1, required added -> [{errorType:"REQUIRED_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL", …}]
BACKWARD, closed v1, optional added -> COMPATIBLE
```

The skill pins the 8.x line everywhere else (`kafka-schema-registry-maven-plugin:8.3.1`, the CP
8.1.1 header framing), so its own recommended stack emits a code its frontmatter does not name.
The substantive claim is correct and the fix it prescribes (`additionalProperties: false` in v1)
is verified COMPATIBLE — only the identifier is stale.

**Fix.** In the frontmatter (both files): _"when a registry returns
`REQUIRED_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL` or `OPTIONAL_PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL`"_.
In `registry-and-json.md`, replace the transcript with the reproduced 8.3.1 output above and add
one sentence: _"On the 7.x line this was the single, now-deprecated
`PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL`; 8.x splits it by whether the added property is required."_

---

## M2 — the `defaultVal()` "live bug surface" is fixed in 1.12.2, which is the version the skill tells you to run

**Quoted**, `SKILL.md:128-130`:

> On 1.12.0 `Schema.Field.defaultVal()` returns `null` for a non-first-branch union default while
> `GenericDatumReader` substitutes the value correctly, so a linter reading it disagrees with the
> resolver.

`references/avro.md:74` heads the section _"The union-default divergence, and **a live bug
surface**"_, and `:97-98` says:

> Any tool that introspects `defaultVal()` — converters, code generators, Connect transforms,
> custom linters — **will** disagree with `GenericDatumReader` on 1.12.0 for a non-first-branch
> union default.

Meanwhile `references/avro.md:3` opens with:

> Coordinates. Runtime `org.apache.avro:avro:1.12.2` (the 1.11 line is `1.11.5`)

and `references/runbook-and-ci.md:121` repeats `org.apache.avro:avro:1.12.2`.

**Evidence.** Same probe across four releases, `["null","string"]` with `"default":"x"`:

```
avro 1.11.4  -> REJECTED: AvroTypeException: Invalid default for field v: "x" not a ["null","string"]
avro 1.11.5  -> REJECTED: (identical)
avro 1.12.0  -> ACCEPTED   defaultVal()=null      <-- the "lie"
avro 1.12.1  -> ACCEPTED   defaultVal()=null      <-- still
avro 1.12.2  -> ACCEPTED   defaultVal()=x         <-- FIXED
```

and on 1.12.2 the resolver and the accessor now agree:

```
["null","string"] default "x"  -> read {"id": 1, "v": "x"} | defaultVal()=x
```

The spec-change story is untouched (1.12.2 still accepts what 1.11.5 rejects), so the rule
_"write `["null","T"]` with `"default": null`"_ stands. But the hazard is presented in the
present tense, in a section titled "a live bug surface", about a defect that does not exist on
the runtime the same file tells you to pin. A reader ships a linter workaround for nothing.

The brief's §15 item 4 hedged this as "could not say whether intentional or a regression". It is
now settled empirically: **1.12.0 and 1.12.1 are affected; 1.12.2 is not.** I found no JIRA.

**Fix.** `SKILL.md:128-130` → _"On **1.12.0 and 1.12.1** `Schema.Field.defaultVal()` returns
`null` for a non-first-branch union default while `GenericDatumReader` substitutes the value
correctly — **fixed in 1.12.2**. Pin 1.12.2, or a linter reading it disagrees with the
resolver."_ Rename the `avro.md` section heading (drop "live"), add the 1.12.1/1.12.2 rows to the
transcript at `avro.md:91-95`, and close brief §15 item 4.

---

## M3 — 32% of the description is truncated away, and it is the wrong 32%: 8 of 9 selection triggers are invisible

**Evidence.** `agent-skills validate`:

```
  ! description  Description is 1496 characters; Claude Code shows roughly the first 1024
```

Truncated at 1024 myself, this is exactly what the selector sees (verbatim):

> Whether a given schema change is safe, in which deploy order, and what breaks when it is not:
> the writer/reader pair, the compatibility levels and who upgrades first under each, the
> per-format rules for Avro, Protobuf and JSON Schema, the registry settings that decide what is
> enforced, and catching a break in CI. Does not cover throughput, allocation or wire size
> (serialization-performance), hostile ObjectInputStream (java-serialization-hardening), the REST
> error surface and HTTP API versioning (rpc-and-api-contracts, which owns whether a contract may
> change; this owns the format's rules and the registry), what an event means
> (event-driven-architecture), offsets and rebalance (kafka-consumers-in-java), partition keys and
> ordering (message-ordering-and-partitioning), module release boundaries
> (component-and-release-boundaries), upcaster chains (event-sourcing), or the permanently failing
> record (poison-messages-and-dlq). Use when AvroTypeException reports a missing required field,
> when "Can't get the number of

And this is what is **lost**:

> an unknown enum value" is thrown, when UnrecognizedPropertyException comes from a hand-built
> new ObjectMapper(), when auto.register.schemas or specific.avro.reader is left at its default,
> when a proto field is deleted without reserved or its number reused, when a registry returns
> PROPERTY_ADDED_TO_OPEN_CONTENT_MODEL, when BACKWARD is set on a compacted topic, when one
> release both adds and drops a field, or when a consumer group reset to earliest dies on old
> records.

The author's claim that "exclusions end at ~char 1000" is **correct and slightly better than
claimed**: `Use when` starts at char **934**. That is not the problem. The problem is the
allocation: the exclusion list occupies chars 314–933 (**620 chars, 41% of the whole
description**) and sits entirely inside the cut, while the trigger clause is 562 chars and lands
almost entirely outside it. Nine `Use when` symptoms; **one** survives intact.

`skill-engineering/SKILL.md:73-75` is explicit: _"A description that lists capabilities … does
not discriminate. A description that names situations … does. Write the situations."_ The
situations are the part that got cut.

This is worse than the precedent it resembles (iteration 2 N6 on
`concurrent-collections-and-synchronizers`, graded MINOR, where two topic words were lost). Here
the entire discriminating surface is lost, and the loss has a concrete misrouting consequence —
see M4: a prompt pasting `UnrecognizedPropertyException` has no in-cut trigger here and its
nearest in-cut match is `rpc-and-api-contracts`, whose copy of that fact is stale.

### Trigger test, judged against the first 1024 characters only

Six that must select this skill — all six do, on the in-cut capability clause:

| #   | Prompt                                                                                                        | In-cut text that selects it                                            |
| --- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | "Adding `discountCode` to the OrderPlaced `.avsc` on a compacted topic — safe, and who deploys first?"        | "whether a given schema change is safe, in which deploy order"; "Avro" |
| 2   | "The registry rejected v3 of the payments JSON schema. What compatibility level should this subject be on?"   | "the registry settings that decide what is enforced"; "JSON Schema"    |
| 3   | "`AvroTypeException … missing required field currency` in the settlement consumer since last night's deploy." | the one surviving trigger, verbatim                                    |
| 4   | "Can I change `int32 amount = 3` to `string amount = 3`, or do I need a new number?"                          | "the per-format rules for … Protobuf"; "what breaks when it is not"    |
| 5   | "Rename `customer_id` to `party_id` across the event contract — what's the release sequence?"                 | "in which deploy order"                                                |
| 6   | "Add a CI gate that fails the PR on a breaking `.avsc` change."                                               | "catching a break in CI"                                               |

Four near misses — all four are correctly repelled, and each exclusion is inside the cut:

| #   | Prompt                                                                               | Must select                    | In-cut exclusion                                 |
| --- | ------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------ |
| 1   | "Avro is burning CPU in the consumer — would Protobuf be smaller and faster?"        | `serialization-performance`    | "throughput, allocation or wire size"            |
| 2   | "Do we version `POST /orders` as `/v2` or by header, and what goes in the 409 body?" | `rpc-and-api-contracts`        | "the REST error surface and HTTP API versioning" |
| 3   | "The group keeps rebalancing and commits offsets it hasn't processed."               | `kafka-consumers-in-java`      | "offsets and rebalance"                          |
| 4   | "We `ObjectInputStream` a partner feed — is that a risk?"                            | `java-serialization-hardening` | "hostile ObjectInputStream"                      |

The exclusion half of the description is doing its job well. It is simply eating the budget the
triggers needed.

**Fix.** Move the `Use when` clause **before** `Does not cover`, and cut the exclusion list to
the four neighbours a mis-selection is actually plausible for — `serialization-performance`,
`rpc-and-api-contracts`, `kafka-consumers-in-java`, `event-sourcing`. Dropping the five
low-collision exclusions (`java-serialization-hardening`, `event-driven-architecture`,
`message-ordering-and-partitioning`, `component-and-release-boundaries`,
`poison-messages-and-dlq`) recovers roughly 300 characters, which is enough to bring the whole
trigger list inside 1024. Apply to `SKILL.md` and `skill.yaml` identically — they are currently
byte-identical (verified) and must stay so.

---

## M4 — shipping this skill leaves three contradictions and two stale pointers live in neighbouring skills

The author flagged the `rpc-and-api-contracts` overlap. It is real, it is larger than flagged,
and two of the duplicated facts are now **provably wrong** where they still live.

### Which facts have two homes

| Fact                                     | Home A (new skill)                     | Home B (existing)                                    | Verdict                                         |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| BACKWARD/FORWARD/FULL + deploy order     | `SKILL.md:50-70` (7 levels, retention) | `contract-evolution.md:5-14` (4 rows, no transitive) | **new skill** — B is a strict subset            |
| Retention is the window, not deploy time | `runbook-and-ci.md:3-22`               | `contract-evolution.md:16-18`                        | **new skill** — B lacks the unbounded case      |
| Expand → migrate → contract              | `SKILL.md:88-107`                      | `contract-evolution.md:20-36`                        | **new skill** — B is 3 deploys, A is 2 releases |
| Protobuf field-number/reserved rules     | `references/protobuf.md`               | `contract-evolution.md:52-59`                        | **new skill**                                   |
| Avro defaults / aliases / union default  | `references/avro.md`                   | `contract-evolution.md:61-65`                        | **new skill**                                   |
| Jackson `FAIL_ON_UNKNOWN_PROPERTIES`     | `SKILL.md:120-124`                     | `contract-evolution.md:44-50`                        | **new skill**                                   |

`rpc-and-api-contracts` should keep §_"When a new version is genuinely required"_ (`:67-90`) and
§_"What a consumer-driven contract test proves"_ (`:92-108`) — those are its own — and reduce the
direction table and the whole §_"Per format"_ to one pointer at
`schema-evolution-and-compatibility`.

### The three that are now wrong where they still live

**(a) `contract-evolution.md:64-65` teaches the pre-1.12 Avro union rule as current:**

> A union's default must correspond to its first branch, so reordering a union's branches changes
> what the default means.

Executed, `new Schema.Parser()`, no options:

```
avro 1.12.2  ["null","string"] default "x"  -> ACCEPTED   defaultVal()=x
avro 1.11.5  ["null","string"] default "x"  -> REJECTED
```

The 1.11.1 spec says _"Default values for union fields correspond to the first schema in the
union"_; the 1.12.0 spec says _"…the first schema **that matches** in the union"_ and drops the
parenthetical entirely. This is a direct, executed contradiction between two shipped skills.

**(b) `contract-evolution.md:58-59` states the C++/Go enum behaviour as universal, in a
Java-focused repo:**

> an unrecognised value arrives as its number, not as an error.

In Java, closed enums generate `UNRECOGNIZED`, whose `getNumber()` throws
`IllegalArgumentException: Can't get the number of an unknown enum value` — verified in
`protocolbuffers/protobuf` `v32.0` `compiler/java/full/enum.cc:118` and `:171-186`. That exact
message is the new skill's own advertised trigger (`SKILL.md:14-15`, `:135-138`). The neighbour
tells a Java reader the opposite of what the owner skill exists to warn about.

**(c) `contract-evolution.md:45-46` states the Jackson default without a version:**

> Jackson's `FAIL_ON_UNKNOWN_PROPERTIES` is enabled by default

Executed:

```
jackson 2.19.0 FAIL_ON_UNKNOWN_PROPERTIES enabled by default = true
jackson 3.0.0  FAIL_ON_UNKNOWN_PROPERTIES enabled by default = false
```

An unversioned claim that changed between releases. The new skill states it correctly
(`SKILL.md:121-122`); the neighbour does not.

### Two stale pointers

`event-driven-architecture/references/event-design.md:75-76`:

> The per-format rules and the expand/migrate/contract sequence are `rpc-and-api-contracts`

and `:88`:

> The Jackson default and Spring Boot's override are in `rpc-and-api-contracts`.

Both now name the wrong owner. The new skill's own description asserts the split
("`rpc-and-api-contracts`, which owns whether a contract may change; **this owns the format's
rules and the registry**"), so these two lines contradict it.

**Fix.** One coordinated edit, not a rewrite of this package: (i) delete
`contract-evolution.md:38-65` (§_Per format_) and `:5-18`, replacing them with a pointer to
`schema-evolution-and-compatibility`; (ii) repoint `event-design.md:75-76` and `:88` at
`schema-evolution-and-compatibility`. Until then, three verified-false statements stay reachable
from the fleet.

**Other neighbours are clean.** I grepped `serialization-performance`,
`kafka-consumers-in-java`, `message-ordering-and-partitioning`,
`component-and-release-boundaries`, `event-sourcing`, `architecture-testing`,
`poison-messages-and-dlq` and `java-serialization-hardening` for every overlapping claim: only
passing mentions, no contradictions. `event-sourcing`'s upcaster material and this skill's
`runbook-and-ci.md:29-34` agree and route to each other correctly.

---

## M5 — `SKILL.md:144-148`: the Avro half of "two one-way doors … cannot be retrofitted" is retrofittable, and the two cases are not comparable

**Quoted:**

> **Two one-way doors ship in v1 and cannot be retrofitted**: an Avro enum without a `default`
> symbol (since 1.9.0; older readers tolerate and ignore it) can never gain a symbol without a
> consumer-first deploy, and a JSON Schema left at the default `additionalProperties: true` can
> never gain a property under `STRICT`.

**Evidence.** Adding a `default` symbol to an existing enum in v2 is free in both directions on
Avro 1.12.0:

```
v1(no default) writer -> v2(with default) reader [add default] -> COMPATIBLE
v2(with default) writer -> v1(no default) reader               -> COMPATIBLE
```

The JSON half genuinely is a one-way door — reproduced on `kafka-json-schema-provider` 8.3.1:

```
v1 open -> v2 closed (BACKWARD) = [{errorType:"ADDITIONAL_PROPERTIES_REMOVED", …}]
```

So the two cases sit at opposite ends of the cost scale and the sentence groups them under one
label. Omitting the enum `default` in v1 costs **one free schema edit plus one consumer-first
deploy** — which is the ordinary cost of the BACKWARD level anyway. Omitting
`additionalProperties: false` in v1 costs **editing an already-registered v1, or a topic
rewrite**. Presenting the first as an un-retrofittable v1 decision is misleading in the direction
that matters: it can push a team toward `runbook-and-ci.md:36-38`'s "rewrite the topic" for a
problem a one-line schema edit fixes. The sentence's own trailing clause ("without a
consumer-first deploy") is accurate and contradicts its headline.

**Fix.** Split them:

> **One one-way door ships in v1**: a JSON Schema left at the default `additionalProperties: true`
> can never gain a property under `STRICT` — verified, `v1 open → v2 closed` is rejected
> `ADDITIONAL_PROPERTIES_REMOVED`, so the only fix is editing v1. **An Avro enum without a
> `default` symbol is cheaper**: adding the `default` in v2 is `COMPATIBLE` both ways, but every
> reader already deployed on v1 must be replaced before a new symbol can be written — a
> consumer-first deploy, not a rewrite.

---

# MINOR

## m1 — `SKILL.md:111`: "returns null" is not the symptom; it throws

**Quoted:**

> **`record.get("newField")` returns null although git's schema gives it a default**, or throws
> `AvroRuntimeException: Not a valid schema field`.

**Evidence**, `GenericData.Record` on both lines:

```
== 1.12.0 ==  get("nick") -> org.apache.avro.AvroRuntimeException: Not a valid schema field: nick
== 1.11.4 ==  get("nick") -> org.apache.avro.AvroRuntimeException: Not a valid schema field: nick
```

Under the premise the sentence sets (the producer has not upgraded, so the field is absent from
the writer schema, which is also the reader schema), the field is not in the record's schema at
all and `get` **always** throws. `null` is only what you see if the producer _has_ upgraded and
wrote a null — a different situation entirely. Leading with the non-reproducible symptom weakens
the diagnosis the rule exists to give.

The rest of the rule is verified correct against
`AbstractKafkaAvroDeserializer.getReaderSchema:378-400`, including the escape hatch: the method
returns early when an explicit reader schema is supplied (`:380-382`), which is the "or pass a
reader schema" branch.

**Precision note for the "no resolution" claim.** `readerSchema = writerSchema` means the
identity resolution, so "no defaults, no enum defaults, no promotion" is exactly right. Worth
adding what it does _not_ mean, since that is the sharper half: such a consumer also **never
throws** a resolution error, so an incompatible producer change surfaces as silently different
data rather than as an exception — the reason `SKILL.md:47` says it "voids everything above it".

**Fix.** `SKILL.md:111` → _"**`record.get("newField")` throws `AvroRuntimeException: Not a valid
schema field` although git's schema gives it a default** — and worse, nothing else throws at
all."_

## m2 — the references recommend coordinates that were never tested, one of them against their own warning

`references/avro.md:3` pins `avro:1.12.2` and `references/runbook-and-ci.md:121` repeats it,
while `:4-5` says everything was run on 1.12.0. `references/protobuf.md:3` pins
`protobuf-java:4.36.0` while `:7` says everything was run on 4.32.0, and `:10-14` then warns that
Confluent documents Protobuf **v4** as unsupported by `kafka-protobuf-serializer`. So the file's
headline coordinate is both untested and the one its own caveat says may not work.

I confirmed all four coordinates resolve (`avro:1.12.2`, `avro:1.11.5`,
`avro-maven-plugin:1.12.2`, `protobuf-java:4.36.0` — all HTTP 200 on Central) and re-ran the
Avro suite on 1.12.2 and 1.11.5, which is how M2 was found. The protobuf suite was **not** re-run
on 4.36.0.

**Fix.** State the tested version beside each pin — _"Runtime `avro:1.12.2`; everything below was
run on 1.12.0 except the union-default table, re-run on 1.12.2"_ — and for protobuf, either pin
4.32.0 (which the evidence covers and which sidesteps the Confluent caveat) or say plainly that
4.36.0 is untested here.

## m3 — the runbook never states the rollback order for either half

`SKILL.md:92-93` is the only rollback statement — _"rolling back the contract rolls back the
expand: the release boundary *is* the rollback point"_ — and it argues for splitting the
releases, not for what to do when one is reverted. Neither Release N nor Release N+1 in
`SKILL.md:95-107` says what happens on revert.

It matters for the contract half specifically. Release N+1 deploys producers first (step 7) then
consumers (step 9). **Reverting it must also go producers first**: if you revert step 9 alone,
consumers resume reading a field producers are no longer writing, which is safe only if that
field has a default. Reverting in the mirror order is the intuitive move and the wrong one.

**Fix.** Add one line after step 9: _"Rollback runs in the same order as the deploy — producers
first. Reverting the consumers alone puts them back on a field nothing writes, which is safe only
if it kept its default."_

## m4 — `SKILL.md:82`: `string`↔`bytes` is symmetric and is filed under "reader-first only"

**Quoted** (_Widen a scalar_ / Avro): "reader-first only (`int`→`long`→`float`→`double`,
`string`↔`bytes`)". Executed:

```
string -> bytes (reader bytes)  | COMPATIBLE | {"s": "hi"}
bytes -> string (reader string) | COMPATIBLE | {"s": "hi"}
```

`int`→`long` is genuinely one-way (`long`→`int` is `INCOMPATIBLE TYPE_MISMATCH`, verified), but
`string`↔`bytes` is safe in both deploy orders, so grouping it under "reader-first only"
understates it and makes the _Narrow a scalar_ row silently wrong for the same pair.

**Fix.** Move it out: _"reader-first only (`int`→`long`→`float`→`double`); `string`↔`bytes` is
safe **both ways**."_

---

# NIT

## n1 — `SKILL.md:69-70` silently repairs a quotation

The skill quotes Confluent as _"The Kafka Streams apps must be upgraded first, then it is safe to
upgrade the upstream producer."_ The source reads _"…then it safe to upgrade the upstream producer
that writes into the input topic."_ The inserted "is" fixes Confluent's typo inside quotation
marks. Either paraphrase without quotes or quote with `[sic]`. The substance — including the
level list, `BACKWARD`/`BACKWARD_TRANSITIVE`/`FULL`/`FULL_TRANSITIVE` — is exactly right.

## n2 — `runbook-and-ci.md:165-170`: the Testcontainers sketch uses raw types

Compiles against `org.testcontainers:kafka:1.21.3` with three `[rawtypes]` warnings.
`ConfluentKafkaContainer` and the `GenericContainer(String)` constructor both exist, so nothing
is broken; `GenericContainer<?>` and `DockerImageName.parse(...)` would be the current idiom.

---

# Verified correct

Everything in this section was executed or read against a primary source, and reproduced.

**Avro — every row of `references/avro.md:36-50` reproduces exactly**, both the
`SchemaCompatibility` verdict and the real round-trip value, including the `{"id": 7, "nick":
"anon"}` and `{"c": "RED"}` outputs and the exact exception strings (`AvroTypeException: Found U,
expecting U, missing required field nick`; `No match for BLUE`). `TYPE_MISMATCH`,
`MISSING_ENUM_SYMBOLS`, `MISSING_UNION_BRANCH` and `READER_FIELD_MISSING_DEFAULT_VALUE` all
appear with the stated JSON-pointer locations.

**The parsing fingerprint is exact**: `parsingFingerprint64` with and without a `doc` attribute
both return `133121827622752327` — the literal number at `avro.md:124`.

**The union-default spec change is real**, not folklore. 1.11.1: _"Default values for union
fields correspond to the first schema in the union"_ plus the explicit parenthetical requiring
the first element. 1.12.0: _"…the first schema **that matches** in the union"_, parenthetical
removed. And Confluent's current page still teaches the old rule verbatim — _"Avro requires that
the default value conform to the first branch of the union"_ — which is exactly the claim at
`SKILL.md:125-126` that vendor documentation is behind the spec.

**The compatibility-level table is correct on every row**, checked against Confluent's own text:

- `BACKWARD` default, and the stated rationale — _"so that you can rewind consumers to the
  beginning of the topic"_. The skill's observation that this rationale actually requires
  `BACKWARD_TRANSITIVE` is a sound critique, correctly framed as one.
- `FORWARD`'s drain condition is Confluent's, near-verbatim: _"first upgrade all producers to
  using the new schema and make sure the data already produced using the older schemas are not
  available to consumers, then upgrade the consumers."_ This is the row most likely to be
  inverted; it is not.
- Kafka Streams: _"only BACKWARD compatibility is supported… FULL, FULL_TRANSITIVE, and
  BACKWARD_TRANSITIVE compatibilities are always supported"_ — the skill's four-level list and
  the changelog/state rationale are both right.
- The per-format allowed-changes grid at `SKILL.md:77-86` matches Confluent's Avro/Protobuf table
  row for row, and I independently confirmed the Avro rows by execution — including the
  asymmetric removal case (`writer-first` needs the removed field to _have had_ a default:
  `COMPATIBLE` with one, `INCOMPATIBLE` without).

**`references/registry-and-json.md`'s JSON Schema tables** (`:126-137`) match Confluent's
lenient / strict-open / strict-closed grids cell for cell, and the prescribed fix
(`additionalProperties: false` in v1) is executed-COMPATIBLE.

**Serialiser defaults, source-verified with the line numbers the reference cites:**
`NORMALIZE_SCHEMAS_DEFAULT = false` (L86), `AUTO_REGISTER_SCHEMAS_DEFAULT = true` (L91),
`ID_COMPATIBILITY_STRICT_DEFAULT = true` (L108), `USE_LATEST_VERSION_DEFAULT = false` (**L114**),
`LATEST_COMPATIBILITY_STRICT_DEFAULT = true` (**L124**) — both cited line numbers are exact.

**`specific.avro.reader` defaults to `false`**, `AbstractKafkaAvroDeserializer.java:378-400`, and
the quoted snippet is faithful to the real branch structure.

**The Confluent wire-format table** (`:24-32`) is verbatim-correct, including "big-endian
(network byte order)", the Protobuf message-index array, zigzag encoding and the `[0]` → single
`0` byte special case; and the CP 8.1.1 header-GUID section including
`HeaderSchemaIdSerializer`, the version byte `1`, the 16-byte GUID and the quoted default-change
sentence.

**Protobuf, all executed on 4.32.0 and byte-identical to the reference's transcripts:**

```
implicit int32:  explicit 0 -> 0 bytes, hasField() = false
proto3 optional: explicit 0 -> 2 bytes (08 00), hasField(explicit 0)=true, hasField(absent)=false
int32(300) = 08 ac 02   read as int64 -> 300
int32(-1)  = 08 ff…01   read as int64 -> -1
repeated string [a,b] = 0a 01 61 0a 01 62  read as singular -> "b"   (last wins)
packed repeated int32 [1,2] = 0a 02 01 02  read as singular -> 0, unknown=[1]
new bytes = 08 05 12 05 68 65 6c 6c 6f ; old round trip identical=true unknown=[2]
after DiscardUnknownFieldsParser = 08 05
enum number 9 vs 2-symbol enum -> UNKNOWN_ENUM_VALUE_Status_9, reserialises to 08 09
```

**`enum.cc` citations check out** at tag `v32.0`: line 118 is exactly
`printer->Print("${$UNRECOGNIZED$}$(-1),\n", …)`, the `getNumber()` `IllegalArgumentException`
block is at 171-186, `getValueDescriptor()`'s `IllegalStateException` at 253-270.

**Release-note quotations are verbatim.** v3.5.0: _"Unknown fields are now preserved in proto3
for most of the language implementations for proto3 by default"_ and the Java
`DiscardUnknownFieldsParser` sentence. v3.15.0: _"Optional fields for proto3 are enabled by
default, and no longer require the `--experimental_allow_proto3_optional` flag."_

**Jackson and Spring:**

```
jackson 2.19.0 FAIL_ON_UNKNOWN_PROPERTIES = true   -> UnrecognizedPropertyException on {"ammount":100}
jackson 3.0.0  FAIL_ON_UNKNOWN_PROPERTIES = false  -> read ok, amount=0
Jackson2ObjectMapperBuilder.json().build()          = false
spring-kafka JacksonUtils.enhancedObjectMapper()    = false
MappingJackson2HttpMessageConverter default mapper  = false
```

The `{"ammount": 100}` → zero-amount claim at `registry-and-json.md:165-166` reproduces exactly.

**CI tooling — I ran it, not just read it.**
`kafka-schema-registry-maven-plugin:8.3.1` exists on `packages.confluent.io` (not Central) and is
the newest published version, closing brief §15 item 7. All seven goals are exactly as listed
(`validate`, `test-local-compatibility`, `set-compatibility`, `test-compatibility`, `register`,
`download`, `derive-schema`), the goal prefix is `schema-registry`, every configuration parameter
named in the reference exists on the right mojo, and `verbose` defaults to `true` (constructor
bytecode: `iconst_1; putfield verbose`). The offline goal was executed with the reference's exact
configuration shape, via the execution-id form the reference documents:

```
$ mvn schema-registry:test-local-compatibility@bwtrans
[ERROR] … Schema is not backward_transitive compatible with previous schemas.
        {errorType:'READER_FIELD_MISSING_DEFAULT_VALUE', description:'The field 'n' at path
        '/fields/1' in the new schema has no default value and is missing in the old schema'}
```

and the documented restriction reproduces too:

```
[ERROR] … Provide exactly one file for backward check for schema …/order.avsc
```

**`buf breaking` — downloaded v1.72.0 and ran the skill's exact command line** against a real git
repo:

```
$ buf breaking --against '.git#branch=main,subdir=proto'
proto/acme/user.proto:5:3: Field "2" with name "email_address" on message "User" changed option
    "json_name" from "email" to "emailAddress".
proto/acme/user.proto:5:10: Field "2" on message "User" changed name from "email" to "email_address".
exit=100
```

and with `WIRE` instead of `WIRE_JSON`, the same rename passes (`exit=0`). The claim _"`WIRE_JSON`
is the floor if anything speaks ProtoJSON — it catches the rename that is free on the wire"_ is
exactly right. Category order and the default (`FILE`) confirmed against buf's docs.

**`SchemaValidatorBuilder` equivalences**, executed on 1.12.0 — `canRead/validateAll` fails what
`canRead/validateLatest` passes, so the `BACKWARD_TRANSITIVE` / `BACKWARD` mapping at
`SKILL.md:157-159` and the transcript at `runbook-and-ci.md:142-147` both hold.

**AWS Glue claims are exact**: eight modes with those exact names including `DISABLED`, Avro
**v1.11.4**, JSON Schema **draft-04/06/07 only**, Protobuf proto2/proto3 without `extensions` or
`groups`, the movable **checkpoint** via `UpdateSchema`, gRPC service definitions, and the limits
(100 registries, 10 000 schema versions per region, 170 KB per schema).

**`avro.use.logical.type.converters`** — affected versions 7.5.2 / 7.4.3, fixed in 7.5.3 / 7.4.4,
and the `ClassCastException: class java.time.Instant cannot be cast to class java.lang.Number`
symptom, all confirmed.

**Distributed-correctness discipline: clean.** No "exactly-once" or "guaranteed delivery" claim
appears anywhere in the package (grepped). Compacted topics and event stores are consistently
marked **unbounded** — `SKILL.md:41-43`, `:66-67`, `:105`, `:149-152`,
`runbook-and-ci.md:12-13`, `:29-38` — and the skill states what that forces (never contract, or
rewrite the topic).

**Hedging discipline: good.** Every one of the brief's ten §15 items is either carried with an
explicit hedge or correctly dropped. Item 1 (Karapace) → `registry-and-json.md:190-193`
"**unverified**". Item 2 (Apicurio `ccompat`) → `:175-177` "**unverified** against a running
product". Item 3 (Kafka compaction wording) → dropped, correctly. Item 4 (`defaultVal()`) →
`avro.md:99-100` hedged; I have now settled it (see M2). Item 5 (`SpecificDatumReader` enum
default) → `avro.md:157-159` "**Unverified**", with AVRO-3313 named. Item 6 (Confluent vs
protobuf v4) → `protobuf.md:10-14` "**not tested** here"; the only complaint is that the file
still pins 4.36.0 above it (m2). Item 7 → closed by me; 8.3.1 is current. Item 8
(`test-local-compatibility` vs the server) → `runbook-and-ci.md:87-90` "**Unverified**". Item 9
(`map` ↔ `repeated`) → `protobuf.md:45` "(quoted from the spec, not tested here)". Item 10 →
dropped rather than hedged, correctly. **No hedge reads as a fact, and no item should have been
dropped that was not.**

**Package hygiene.** `agent-skills validate` → valid with one warning (the description length,
M3). `SKILL.md` and `skill.yaml` descriptions are byte-identical (1496 chars each, verified
programmatically). `name` matches the directory. Body is 196 lines / 2259 words, in line with the
passing peer `concurrent-collections-and-synchronizers` (190 / 2093). All four references are
routed from `SKILL.md:180-196` by an explicit "Read when…" condition, and each condition reaches
that file's sections.

---

# What I could not verify

1. **Confluent Platform 8.1.1 header-GUID framing in operation.** The configuration keys, the
   version byte `1`, the 16-byte GUID, `/schemas/guids/{guid}` and the producers→consumers
   migration order are all confirmed in Confluent's current documentation, but no CP 8.1.1 broker
   or registry was run. `registry-and-json.md:34-43` and `SKILL.md:175` rest on documentation.
2. **`test-compatibility` against a live registry.** Needs a running Schema Registry; only
   `test-local-compatibility` was executed. The reference's own hedge
   (`runbook-and-ci.md:87-90`) therefore stands unresolved — I could not compare the local goal's
   verdicts with the server's.
3. **The Testcontainers recipe** (`runbook-and-ci.md:160-175`) compiles against
   `org.testcontainers:kafka:1.21.3` but was not run; no container was started.
4. **`kafka-protobuf-serializer` against protobuf-java 4.x.** Not tested — the same gap the
   reference flags at `protobuf.md:10-14`. This decides whether `protobuf-java:4.36.0` is
   pinnable at all in a Confluent stack, and it remains open.
5. **`SpecificDatumReader` and the enum `default` symbol.** All enum-default resolution here went
   through `GenericDatumReader`. The reference's "Unverified" note is still correct.
6. **Apicurio and Karapace.** No running product; the reference's hedges stand.
7. **Whether `avro.md:7-9`'s "byte-identical Schema Resolution section between 1.11.1 and 1.12.0"
   is literally byte-identical.** I compared the union-resolution and promotion sentences (which
   match) but did not diff the full sections character by character.
8. **`protobuf-java 4.36.0`.** The protobuf suite was executed on 4.32.0 only; 4.36.0 was
   confirmed to exist and resolve, but no behaviour was re-measured on it.
9. **Protobuf `map` ↔ `repeated` message binary compatibility** (`protobuf.md:45`) — quoted from
   the spec by the author and not tested by me either.

---

# External blocker — not a finding against this package

`registry/skills.yaml` does not list `schema-evolution-and-compatibility`, and it cannot be
regenerated:

```
$ npm run registry:build
AgentSkillsError: C:\git\agent-skills\skills\architecture-fitness-functions is not a skill
package: no skill.yaml
  code: 'ASK_INVALID_PACKAGE'
```

Two directories are missing from the index — `architecture-fitness-functions` (another agent's
in-flight work, no manifest) and this one. The failure is caused by the former. `npm run verify`
will fail until that directory gains a `skill.yaml` or is removed; then
`npm run registry:build` must be re-run so this package's integrity hash is indexed. Recorded as
**blocked-external**, consistent with how the same situation was handled for
`concurrent-collections-and-synchronizers`. I did not modify `registry/skills.yaml`; its
pre-existing working-tree modification is unrelated to this validation.
