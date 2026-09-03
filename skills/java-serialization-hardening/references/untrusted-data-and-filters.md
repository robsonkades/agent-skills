# Untrusted data and filters

## The attack model

`ObjectInputStream.readObject()` reconstructs an object graph, resolves stream class descriptors,
allocates ordinary serializable instances without running their own constructors, populates state,
and invokes serialization hooks such as `readObject` and `readResolve`. Records invoke their
canonical constructor; `Externalizable` invokes a public no-arg constructor and `readExternal`.
`finalize` is not a serialization callback. An attacker can select stream-reachable classes and
graph shapes subject to class loading and active filters.

A gadget chain is a sequence of such classes — none of them malicious, each doing something
ordinary — that composes into a useful primitive: invoking a method, writing a file, opening a
socket, executing a command. Consequences that follow directly:

- **Validation after `readObject` returns is too late.** The damage is done during
  deserialization.
- **Your classes need not be involved.** A library you depend on transitively is enough, and
  new chains are found in libraries that were previously considered safe.
- **"The data comes from our own service" is a boundary claim, not a fact.** It holds only
  while every producer, every network path and every store between them is trusted.

The practical rule: an `ObjectInputStream` reading attacker-influenced bytes is a high-risk sink.
Exploitability and impact depend on reachable classes, hooks, resource limits and surrounding
privileges, but absence of a currently known RCE gadget is not evidence of safety.

Native serialization provides neither confidentiality nor integrity. TLS protects a network hop,
not bytes later poisoned in a cache/file; signatures authenticate a producer/key, not the safety
of gadget-capable data from a compromised producer. Record provenance, retention and every writer.

## Where it hides

| Entry point                                                           | Why it is often missed                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| RMI, JMX over RMI                                                     | any exposed port deserialises by design                                  |
| JNDI/LDAP lookups with a remote reference                             | the lookup result can carry a serialized object                          |
| Distributed cache (Redis, Memcached, Hazelcast) with a JDK serializer | poisoning the cache is enough; no direct connection to the app is needed |
| HTTP session replication / persistent sessions                        | session bytes travel between nodes and through a store                   |
| Message consumers with a Java-serialization codec                     | the queue is a trust boundary                                            |
| Serialized objects in cookies, hidden fields, or files                | often an "internal" format that reaches the client                       |
| Framework internals (some remoting, some job schedulers)              | the code is not yours                                                    |

Audit by searching for `ObjectInputStream`, `readObject`, `Externalizable`, `SerializationUtils`,
`JdkSerializationRedisSerializer` and equivalent codec configuration, then asking for each: who
can write these bytes?

## Filters (JEP 290 and JEP 415)

`ObjectInputFilter` inspects each class, array length, graph depth, reference count and stream
size before the object is created. Three ways to apply it:

```java
// 1. Per stream — the narrowest and the one to prefer
var filter = ObjectInputFilter.Config.createFilter(
    "maxdepth=20;maxarray=10000;maxrefs=1000;maxbytes=1048576;"
  + "com.acme.cache.CachedOrder;com.acme.cache.CachedLine;"
  + "java.base/java.lang.String;java.base/java.util.ArrayList;!*");
ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(bytes));
in.setObjectInputFilter(filter);
```

```properties
# 2. JVM-wide baseline, as a system property or in conf/security/java.security.
# java.base/* is broad; narrow it when the application's graph is known.
-Djdk.serialFilter=maxdepth=20;maxarray=10000;maxrefs=1000;maxbytes=1048576;com.acme.**;java.base/*;!*
```

```java
// 3. A startup-installed filter factory (JEP 415) to select/compose context filters,
//    including for streams created by libraries you do not control
ObjectInputFilter.Config.setSerialFilterFactory(new PerContextFilterFactory());
```

Rules for writing one:

- **Allow-list, then reject everything**: patterns are evaluated in order and `!*` at the end
  is what makes the filter closed. A filter that only lists forbidden classes stops yesterday's
  gadgets.
- **Set the limits too**: `maxdepth`, `maxarray`, `maxrefs`, `maxbytes` defend against the
  denial-of-service variant. Also bound compressed/container input before decompression; filter
  byte counts cannot undo resource consumption in an upstream decoder.
- **Compose, do not assume layering.** No filter is enabled by default. With the built-in factory,
  setting a stream filter can replace the static JVM filter. If both constraints matter, install
  and test a factory that intersects/composes them. Factory/global configuration is process-wide
  startup policy; a stream filter may be set only once and before reading objects.
- **Treat rejection as a rate-limited security signal.** Record context, rule/limit and class when
  available, but not raw payloads or secrets. A flood of rejected inputs must not become a logging
  denial of service.
- **Do not build the filter from the payload** (a "declared types" header). The stream cannot
  be trusted to describe itself.
- **Test the filter**, including that it rejects a class you deliberately removed from the
  allow-list; filters written and never exercised are frequently misspelled and silently
  permissive.

Filters reduce the reachable surface. They do not make deserialization of hostile input safe:
if any allowed class is itself a usable gadget, the filter passes it. A filter is invoked zero or
more times and sees classes/array lengths/graph metrics, not domain field validity; keep invariant
validation and outer request-size/deadline controls.

## Removing the mechanism

The migration that actually resolves the problem:

1. **Define the data explicitly.** A record (or a DTO) per message/cache entry, containing only
   the fields the consumer needs — not the domain object.
2. **Choose a schema-bearing format.** JSON with an explicit mapper configuration for
   inspectable contracts; protobuf or Avro where size, schema evolution and cross-language
   support matter.
3. **Design the mixed-version matrix.** Deploy readers that accept old and new first, while writers
   still emit the old form. After all old readers are fenced, switch to a versioned new writer (or
   dual-write only where duplicate storage/effects are safe). Retain the old reader until old data
   has expired/drained, then remove it and the gadget-bearing dependency.
4. **Remove `implements Serializable`** from the classes that only had it for this purpose —
   otherwise the next developer wires it back in.

For a cache, explicit JSON may be an acceptable migration despite size/CPU cost: it survives Java
class renames and removes Java serialization hooks. Cache poisoning can still inject invalid data,
oversized structures or authorization-confused state, so schema/domain validation and limits remain.

## The JSON version of the same bug

Polymorphic deserialization that lets the _document_ name the Java class reproduces the
problem in a different syntax:

```java
// Dangerous: the payload chooses the class to instantiate
mapper.activateDefaultTyping(LaissezFaireSubTypeValidator.instance, ...);
@JsonTypeInfo(use = JsonTypeInfo.Id.CLASS)      // same problem, per type
```

Safe shapes:

```java
@JsonTypeInfo(use = Id.NAME, property = "type")            // logical ids, not class names
@JsonSubTypes({ @Type(value = CardPayment.class, name = "card"),
                @Type(value = PixPayment.class,  name = "pix") })
public sealed interface Payment permits CardPayment, PixPayment { }
```

- Logical type ids decouple the wire format from class names. They restrict instantiation only
  when subtype registration/resolution is itself closed and reviewed.
- A sealed interface makes Java's permitted set explicit and gives exhaustive `switch` on the
  consumer side (java-composition-over-inheritance covers sealed hierarchies).
- If default typing cannot be removed immediately, a strict `PolymorphicTypeValidator`
  allow-listing base types and packages is the interim mitigation — with the same caveat as
  serialization filters.

The same review applies to YAML tags, `XMLDecoder`/XStream-style object construction, and any
format with type resolution or executable setters. The mechanics differ, so use the parser's
safe mode/allow-list and version-specific security guidance; changing syntax alone does not make
arbitrary type construction safe.

## Review checklist

- [ ] Every `ObjectInputStream` in the codebase is enumerated, with its trust boundary stated.
- [ ] None of them reads bytes an attacker can influence; where one does, migration is planned
      and a filter is in place today.
- [ ] A JVM-wide `jdk.serialFilter` baseline with depth/array/ref/byte limits is configured.
- [ ] Per-stream filters are closed allow-lists, and the active factory's composition with the
      global baseline is tested rather than assumed.
- [ ] Rejections are logged and alertable.
- [ ] RMI/JMX exposure has explicit network policy, authentication/authorization, TLS where
      needed, and protocol-appropriate filters; unnecessary endpoints are disabled.
- [ ] Cache, session and queue codecs are named explicitly in configuration, not defaulted.
- [ ] Jackson class-name/broad default typing is off for untrusted inputs; logical-id polymorphism
      has a closed, tested subtype registry and parser depth/size limits.
- [ ] Dependencies known to provide gadget chains are tracked, and the classpath is minimised —
      a smaller classpath is a smaller gadget surface.
