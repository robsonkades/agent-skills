# Runbook and CI

## How long "wait" is

The wait between the expand and contract halves is not a formality; it is the whole mechanism. It is
measured in the store's retention, never in deploy time.

| Boundary                              | Window           | What "wait" means                                                                                                        |
| ------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Synchronous HTTP/gRPC                 | seconds          | one rolling deploy; in-flight requests drain. Both halves can be minutes apart — keep them separate deploys for rollback |
| Kafka topic, `retention.ms=7d`        | 7 days           | every message written in the old shape must age out **and** no group may reset to an offset older than that              |
| Kafka topic, `cleanup.policy=compact` | **never**        | the contract half is not available; the old shape stays readable forever, or you rewrite the topic                       |
| Event-sourced store                   | **never**        | same                                                                                                                     |
| Database column                       | until backfilled | measured by the backfill query, not by the clock                                                                         |

The failure mode is not subtle: expand on Monday, contract on Wednesday, everything green because the
seven-day window means no consumer has met an old record yet. It breaks four days later, or six
months later when someone resets a group.

A **key** schema is a special case of "never": partition assignment depends on the serialised key
bytes, so a change that the registry calls compatible still redistributes keys. Freeze key schemas;
the ordering consequence belongs to `message-ordering-and-partitioning`.

## When contraction is impossible

On a compacted topic or any infinite-retention log there are only three honest options.

1. **Never contract.** Deprecate in documentation, keep the field in the schema forever with a
   default, accept a monotonically growing schema. This is the default answer and it is fine: a
   schema with tombstoned fields is cheaper than either alternative.
2. **Upcast at the read boundary.** Keep every historical schema and lift v1 → v2 → v3 before the
   domain sees it. That chain belongs to `event-sourcing`; what belongs here is that most of its
   links exist only because the format could not carry the change — Avro defaults and Protobuf
   `reserved` remove the need for most of them.
3. **Rewrite the topic.** Produce v2 to a new topic, migrate consumers, delete the old. Costs a full
   replay and a dual-read period and breaks offset-based bookmarks. Confluent's own advice for the
   `NONE` case: "create a brand-new topic and start migrating applications to use the new topic and
   new schema, avoiding the need to handle two incompatible versions in the same topic."

## The precondition for any gate

The `.avsc`/`.proto`/`.json` files in the repository are the source of truth; the registry is a
deployment target, exactly as a database is a deployment target for migrations. If a producer's
`auto.register.schemas` can change the registry, the source of truth is a running JVM somewhere and
CI cannot check anything. The repo copy can drift, so add a job that fails when they disagree
(`schema-registry:download` plus a diff).

## Confluent Maven plugin — `io.confluent:kafka-schema-registry-maven-plugin:8.3.1`

Goals: `validate`, `test-local-compatibility`, `set-compatibility`, `test-compatibility`, `register`,
`download`, `derive-schema`. Confluent's own GitHub Actions example binds the first four to the
`validate` phase on a pull request and `register` on push to the main branch.

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

The offline goal, which most pipelines should start with — "This goal tests compatibility of a local
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

Over a version history, with the level equivalences verified on 1.12.0:

```java
var history = loadAll("schemas/order").reversed();          // most recent first
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
exactly the shape Apicurio documents for the same divergence.) Keep the history in the repo as
`src/test/resources/schemas/<subject>/v1.avsc`, `v2.avsc`, …

## Golden bytes

Check a hex fixture of a serialised v1 record into the repository and assert that every future reader
decodes it into the expected **values**. Never regenerate it. One byte array and one assertion per
schema version, and it is the only technique that survives someone tidying up the historical schema
files.

## Testcontainers: the registry's own verdict

The library check and the registry's check are not the same thing, and only this shape exercises the
second — including registry-side surprises such as the open-content-model rejection.

```java
// org.testcontainers:kafka — compiles, but this recipe has not been run here
var kafka = new ConfluentKafkaContainer("confluentinc/cp-kafka:<pin>");
GenericContainer<?> sr = new GenericContainer<>("confluentinc/cp-schema-registry:<pin>")
                             .withEnv("SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS", ...)
                             .withExposedPorts(8081);
```

In one test: `PUT /config/<subject> {"compatibility":"BACKWARD_TRANSITIVE"}` to the level you claim
to run, register v1, produce a v1 record with `auto.register.schemas=false`, register v2, produce a
v2 record, and consume **both** with a v1-generated consumer and a v2-generated one. Pin the image
tag to the version you run in production — the wire-format default changed at 8.1.1.
