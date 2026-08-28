# Choosing a format

## The three wire-encoding families

| Strategy                     | How a field is found                                                                     | Formats                  | Decode cost                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| Tag-length-value with VarInt | Each field carries a tag (`field_number << 3 \| wire_type`) as a VarInt, then its value  | Protobuf                 | O(n) over the bytes — every tag must be read to reach the next field; no random access |
| Fixed layout plus vtable     | The schema fixes offsets per version; a small vtable maps field to offset                | FlatBuffers, Cap'n Proto | O(1) per field — direct offset access, earlier fields never decoded                    |
| Delimited text framing       | Structure delimited by braces, commas and colons, with field names repeated per instance | JSON                     | O(n) with a high constant — full lexical parse, a `String` per key and value           |

The second row is what makes zero-copy possible: a "parse" reduces to validating the header and
keeping a pointer. The first row is inherently sequential, which is why Protobuf cannot offer the
same property no matter how it is tuned.

## Selection by scenario

| Scenario                                                    | First choice                                        | Alternative                                  | Avoid                                           |
| ----------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| Kafka, high rate, consumers evolving independently          | Avro plus a Schema Registry (BACKWARD/FORWARD/FULL) | Protobuf, if the ecosystem is already gRPC   | JSON (parse cost); Java serialisation (unsafe)  |
| gRPC or synchronous microservices                           | Protobuf — integrated codegen and streaming         | —                                            | —                                               |
| Distributed cache (Redis, Hazelcast, Memcached), JVM only   | Kryo with mandatory registration                    | MessagePack, if other languages read it      | Native Java serialisation (versioning hell)     |
| Analytics events or a data lake                             | Avro or Parquet                                     | —                                            | —                                               |
| Internal high-performance RPC, few fields read per message  | FlatBuffers (official Java binding)                 | Cap'n Proto, if the peer is already C++/Rust | Protobuf, for this read profile                 |
| Drop-in JSON replacement, still schema-less, multi-language | MessagePack                                         | —                                            | JSON, once parse CPU is the measured bottleneck |

Systems legitimately mix formats — Avro on the main topic and Protobuf on low-latency gRPC calls
inside one service. Treat the table as a starting point, not a rule.

MessagePack keeps JSON's schema-less model in a compact binary encoding, and integrates through
`org.msgpack:jackson-dataformat-msgpack` by swapping the factory on the same `ObjectMapper` and
the same POJOs. Its weakness is JSON's weakness: no compile-time schema, no formal compatibility
rule.

## The Kryo configuration that actually holds

```java
ThreadLocal<Kryo> KRYO = ThreadLocal.withInitial(() -> {
    Kryo kryo = new Kryo();
    kryo.register(Order.class, 10);          // one VarInt on the wire ...
    kryo.register(OrderItem.class, 11);
    kryo.register(java.util.ArrayList.class, 12);
    kryo.setRegistrationRequired(true);      // ... but only because of this line
    return kryo;
});
```

Without `setRegistrationRequired(true)`, Kryo's default reflection fallback accepts unregistered
classes, the full class name still travels on the wire for anything the registry misses, and an
unknown class is deserialised silently. Registration ids must also be stable: reordering
`register` calls between deploys makes previously written data unreadable, which is the shape of
the classic mixed-deploy cache outage.

For a mixed-deploy window that cannot be avoided:

```java
kryo.addDefaultSerializer(Product.class, VersionFieldSerializer.class);
```

or move to a format with native schema evolution.

## Records versus conventional classes under native serialisation

| Aspect                           | Conventional `Serializable` class                    | `record` implementing `Serializable`             |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| How the object is reconstructed  | `Unsafe.allocateInstance()` — no constructor runs    | The canonical constructor, compact or explicit   |
| Invariant validation             | Skipped unless `readObject` reimplements it          | Automatic — the same code as `new`               |
| `writeObject` / `readObject`     | Honoured if declared                                 | **Ignored** — records cannot customise field I/O |
| `writeExternal` / `readExternal` | Honoured via `Externalizable`                        | **Ignored**                                      |
| `readResolve` / `writeReplace`   | Honoured if declared                                 | **Honoured** — the only remaining hooks          |
| Gadget-chain surface             | Wide: constructor-free reconstruction is the exploit | Reduced, not eliminated — still needs the filter |

Non-native paths differ again: Kryo 5.1+ ships a dedicated `RecordSerializer` (check the
compatibility matrix of the version you pin); Protobuf and Avro generate builder classes, not
records, so any record wrapper is yours to write.

## If `ObjectInputStream` cannot be removed

```java
ObjectInputFilter allowList = ObjectInputFilter.Config.createFilter(
      "com.example.model.Order;"
    + "com.example.model.OrderItem;"
    + "java.util.ArrayList;"
    + "java.lang.String;"
    + "maxdepth=10;maxrefs=1000;maxbytes=1048576;maxarray=10000;"
    + "!*");

try (ObjectInputStream ois = new ObjectInputStream(inputStream)) {
    ois.setObjectInputFilter(allowList);
    Order order = (Order) ois.readObject();
}
```

| Pattern                  | Meaning                                             |
| ------------------------ | --------------------------------------------------- |
| `com.example.Order`      | Exactly that class                                  |
| `com.example.*`          | Classes directly in that package                    |
| `com.example.**`         | That package and its subpackages                    |
| `!com.example.Dangerous` | Explicit denial, evaluated in declaration order     |
| `maxdepth=N`             | Reject object graphs deeper than N                  |
| `maxrefs=N`              | Reject streams with more than N internal references |
| `maxbytes=N`             | Reject streams larger than N bytes                  |
| `maxarray=N`             | Reject arrays larger than N elements                |
| `!*`                     | Deny everything unmatched — the safe terminator     |

The four limits mitigate a different attack class from the allow-list: not arbitrary code
execution, but resource exhaustion from a graph built entirely out of _allowed_ classes. A filter
without them leaves that door open.

Process-wide alternatives: `-Djdk.serialFilter=...`, or `jdk.serialFilter` in
`conf/security/java.security`, applied to every stream that sets no filter of its own. From JEP
415 (JDK 17), `ObjectInputFilter.Config.setSerialFilterFactory(...)` selects a different filter
depending on which code opened the stream — a strict allow-list for network-originated data,
something looser for trusted internal paths.
