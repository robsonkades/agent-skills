# Runbook and CI

## How long "wait" is

The gate between expand and contract is evidence that the remaining system can use the new contract.
Any waiting period follows from reachable client builds and data, not a fixed clock interval.

| Boundary                              | Window                                   | What "wait" means                                                                                                                                                                                          |
| ------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synchronous HTTP/gRPC                 | supported-client horizon                 | Account for long-lived clients, retries, cached requests, in-flight work and rollback builds.                                                                                                              |
| Kafka topic, `cleanup.policy=delete`  | effective deletion/replay horizon        | `retention.ms` is not exact deletion time; inspect segments, byte retention, offsets, replicas and restore paths.                                                                                          |
| Kafka topic, `cleanup.policy=compact` | potentially indefinite                   | A cold key's last value can retain an old schema; overwritten values eventually compact. `compact,delete` also expires segments. Verify remaining versions rather than assuming all history or no history. |
| Event-sourced store                   | actual replay contract                   | Check snapshots, retained events, archival/backup restore and upcasters; immutable full-history replay often requires lasting compatibility.                                                               |
| Database column                       | verified migration and client retirement | Backfill with concurrent-write protection; retire old writers/readers and account for rollback, CDC and backups.                                                                                           |

Live traffic can appear healthy while a lagging consumer, cold compacted key or restored backup
still presents an older writer schema. The failure may occur immediately or on later replay; the
configured retention interval does not determine when a reader first encounters that schema.

A **key** schema needs a separate byte/partition identity check: with byte-hashing partitioners,
changing serialized key bytes, including framing/schema ID, can move keys or split compaction identity.
Not every compatible schema edit changes bytes; preserve the byte contract or migrate explicitly;
the ordering consequence belongs to `message-ordering-and-partitioning`.

## When contraction is impossible

When incompatible historical values remain reachable, choose a supported migration strategy.

1. **Keep read compatibility.** Retain defaults, aliases or a legacy decoder as needed. This does
   not require every current schema to retain every field: Avro readers can ignore removed writer
   fields and Protobuf readers can preserve unknown fields. Check the required semantics.
2. **Upcast at the read boundary.** Preserve schemas for reachable history and lift v1 → v2 → v3 before the
   domain sees it. That chain belongs to `event-sourcing`; what belongs here is that its
   links may implement semantic transformations that defaults and Protobuf reservations cannot.
3. **Rewrite the topic.** Produce v2 to a new topic, migrate consumers, delete the old. Costs a full
   replay or state migration and a controlled cutover; offset-based bookmarks need remapping. Do not
   delete the source until replay, restore and rollback obligations permit it. Confluent's advice for the
   `NONE` case: "create a brand-new topic and start migrating applications to use the new topic and
   new schema, avoiding the need to handle two incompatible versions in the same topic."

## The precondition for any gate

Establish the authoritative schema and its review-to-runtime chain: checked-in schema files,
reviewed generator inputs plus reproducible outputs, or immutable published artifacts can each
provide it. Preserve exact versions, hashes and references, and verify which artifact the producer
actually registers/selects. `auto.register.schemas=true` alone does not make the JVM the authority;
uncontrolled registrations outside that chain bypass the gate. Restrict registration ownership and
detect unexplained drift against the approved artifacts (`schema-registry:download` plus a diff is
one option). Do not replace an already adequate governed pipeline solely to move files into git.

## Confluent Maven plugin — `io.confluent:kafka-schema-registry-maven-plugin:8.3.1`

Goals: `validate`, `test-local-compatibility`, `set-compatibility`, `test-compatibility`, `register`,
`download`, `derive-schema`. Confluent's published GitHub Actions example binds the first four to the
`validate` phase on a pull request and `register` on push to the main branch. That example includes
the mutating `set-compatibility` goal; copying it is not a read-only PR check. Bind remote mutations
only to the intended authorized registry/policy environment. An isolated disposable registry can
exercise them; an offline compatibility review does not require a real registry mutation.

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
    <verbose>true</verbose>
  </configuration>
</plugin>
```

The offline goal is one useful starting point — "This goal tests compatibility of a local
schema with other existing local schemas during development and testing phases":

```xml
<configuration>
  <schemas><order>src/main/avro/order.avsc</order></schemas>
  <previousSchemaPaths><order>src/main/avro/history/</order></previousSchemaPaths>
  <compatibilityLevels><order>BACKWARD_TRANSITIVE</order></compatibilityLevels>
</configuration>
```

"For compatibility level BACKWARD, FORWARD, or FULL, exactly one previousSchema is expected per
schema" — only the transitive levels accept a directory. Bind it to an execution id and it runs as
`mvn schema-registry:test-local-compatibility@<id>`. Set `register`'s `normalizeSchemas` to `true`.

**Unverified**: whether `test-local-compatibility` implements exactly the same algorithm as the
server. Confluent documents it as a development convenience, and its verdicts were not compared
against a live registry — a pipeline relying only on the local goal may diverge on edge cases,
JSON Schema content models most likely.

## `buf breaking` — buf CLI v1.72.0

Four categories, strictest first: **`FILE`** (default) "Detects changes that move generated code
between files"; **`PACKAGE`**; **`WIRE_JSON`** "Detects changes that break wire (binary) or JSON
encoding… Recommended as a minimum baseline when using JSON-based transports like Connect,
gRPC-Gateway, or gRPC JSON"; **`WIRE`**, the most permissive.

```yaml
# buf.yaml
version: v2
modules:
  - path: proto
breaking:
  use:
    - WIRE_JSON
```

The `--against` target can also be a remote repository or a BSR module:

```bash
buf breaking --against 'https://github.com/org/repo.git#branch=main,subdir=proto'
buf breaking --against buf.build/org/module
```

Buf also runs the same detection server-side on every push to the BSR, which is what you want when
you cannot trust every repository's local configuration.

## Avro compatibility as a plain unit test

`org.apache.avro:avro:1.12.2` (the transcripts below were produced on 1.12.0; the API is unchanged
on 1.12.2), no registry and no network. Pairwise, for a good failure message:

```java
var result = SchemaCompatibility.checkReaderWriterCompatibility(reader, writer);
assertEquals(SchemaCompatibility.SchemaCompatibilityType.COMPATIBLE, result.getType(),
             () -> result.getResult().getIncompatibilities().toString());
```

Failures come back as `Incompatibility{type:READER_FIELD_MISSING_DEFAULT_VALUE, location:/fields/1,
message:nick, …}` — `location` is a JSON pointer into the schema, which is what a CI log needs.

Partial Java 17 snippets: supply Avro imports, collection imports, assertions and the history loader.
Over a version history, with the level equivalences recorded on 1.12.0:

```java
var history = new ArrayList<>(loadAll("schemas/order"));   // partial: loader returns oldest first
Collections.reverse(history);                             // most recent first, Java 17 compatible
new SchemaValidatorBuilder().canReadStrategy().validateAll()
    .validate(current, history);                            // == BACKWARD_TRANSITIVE
```

Verified output showing why the strategy must match the registry's level:

```text
canRead/validateAll    v2 vs [v1]      -> VALID
canRead/validateAll    v3 vs [v2,v1]   -> INVALID: Unable to read schema {id} using schema {id,n}
canRead/validateLatest v3 vs [v2,v1]   -> VALID     <-- BACKWARD passes what BACKWARD_TRANSITIVE fails
mutualRead/validateAll v2 vs [v1]      -> VALID
```

(v1 = `{id}`, v2 = `{id, n:string=""}`, v3 = `{id, n:string}` with the default removed. This is
exactly the shape Apicurio documents for the same divergence.) Preserve the required comparison
history as immutable files or artifacts, for example `src/test/resources/schemas/<subject>/v1.avsc`,
`v2.avsc`, …; do not silently rewrite a historical schema to make a gate pass.

## Golden bytes

An immutable serialized fixture with its writer schema/references and expected **values** can detect
accidental changes to historical encoding or interpretation. Do not regenerate it with the candidate
writer and call that historical evidence. Test supported future readers against the required history.
One record per version is not sufficient for all boundaries: include relevant absent/default/null,
enum, range, presence and hostile-byte cases. Immutable published writer artifacts, reproducible
generators and independently constructed payloads can provide complementary or adequate equivalent
controls. Structural compatibility rules can detect schema edits that runtime samples miss; semantic
decoding checks catch meaning that a structural verdict omits. Preserve an adequate existing suite.

## Testcontainers: the registry's own verdict

The library check and the registry's check are distinct claims. When the latter is needed, an
isolated registry matching the target can exercise it, including registry-side configuration and
provider behavior. Testcontainers is one option; a controlled equivalent environment also works.

```java
// Pseudocode: requires pinned Testcontainers/images, network/aliases and omitted configuration.
var kafka = new ConfluentKafkaContainer("confluentinc/cp-kafka:<pin>");
GenericContainer<?> sr = new GenericContainer<>("confluentinc/cp-schema-registry:<pin>")
                             .withEnv("SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS", ...)
                             .withExposedPorts(8081);
```

In one test: `PUT /config/<subject> {"compatibility":"BACKWARD_TRANSITIVE"}` to the level you claim
to run, register v1, produce a v1 record with `auto.register.schemas=false`, register v2, produce a
v2 record, and consume **both** with a v1-generated consumer and a v2-generated one. Pin the image
tag to the version you run in production. Assert success only for pairs the chosen level guarantees;
BACKWARD_TRANSITIVE does not by itself guarantee that v1 readers accept v2 writers. On 8.1.1+ the
deserializer lookup default changes; producers still need explicit configuration to emit header GUIDs.

Sources: [Kafka 4.1 topic cleanup policies](https://kafka.apache.org/41/configuration/topic-configs/),
[Confluent compatibility](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html).
