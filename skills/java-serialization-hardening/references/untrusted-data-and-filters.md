# Untrusted data and filters

## The attack model

`ObjectInputStream.readObject()` does not "parse data". It reads a class name from the stream,
loads that class, allocates an instance without running its constructor, populates its fields
from the stream, and calls its `readObject`, `readResolve` and (historically) `finalize`
methods. The attacker therefore chooses _which code runs_, limited only by what is on the
classpath.

A gadget chain is a sequence of such classes — none of them malicious, each doing something
ordinary — that composes into a useful primitive: invoking a method, writing a file, opening a
socket, executing a command. Consequences that follow directly:

- **Validation after `readObject` returns is too late.** The damage is done during
  deserialization.
- **Your classes need not be involved.** A library you depend on transitively is enough, and
  new chains are found in libraries that were previously considered safe.
- **"The data comes from our own service" is a boundary claim, not a fact.** It holds only
  while every producer, every network path and every store between them is trusted.

The practical rule: an `ObjectInputStream` reading bytes that any attacker can influence is a
vulnerability, independent of what the bytes currently contain.

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
    "com.acme.cache.CachedOrder;com.acme.cache.CachedLine;java.util.*;java.lang.*;!*");
ObjectInputStream in = new ObjectInputStream(bytes);
in.setObjectInputFilter(filter);
```

```properties
# 2. JVM-wide backstop, as a system property or in conf/security/java.security
-Djdk.serialFilter=maxdepth=20;maxarray=10000;maxrefs=1000;com.acme.**;java.base/*;!*
```

```java
// 3. A filter factory (JEP 415) to apply context-specific filters per stream, including
//    for streams created by libraries you do not control
ObjectInputFilter.Config.setSerialFilterFactory(new PerContextFilterFactory());
```

Rules for writing one:

- **Allow-list, then reject everything**: patterns are evaluated in order and `!*` at the end
  is what makes the filter closed. A filter that only lists forbidden classes stops yesterday's
  gadgets.
- **Set the limits too**: `maxdepth`, `maxarray`, `maxrefs`, `maxbytes` defend against the
  denial-of-service variant, where a small payload expands into an enormous graph.
- **Log every rejection** as a security event, with the class name — the first sign of an
  attempted attack is a rejected class, and a filter nobody monitors wastes the signal.
- **Do not build the filter from the payload** (a "declared types" header). The stream cannot
  be trusted to describe itself.
- **Test the filter**, including that it rejects a class you deliberately removed from the
  allow-list; filters written and never exercised are frequently misspelled and silently
  permissive.

Filters reduce the reachable surface. They do not make deserialization of hostile input safe:
if any allowed class is itself a usable gadget, the filter passes it.

## Removing the mechanism

The migration that actually resolves the problem:

1. **Define the data explicitly.** A record (or a DTO) per message/cache entry, containing only
   the fields the consumer needs — not the domain object.
2. **Choose a schema-bearing format.** JSON with an explicit mapper configuration for
   inspectable contracts; protobuf or Avro where size, schema evolution and cross-language
   support matter.
3. **Migrate with both readers active.** Write in the new format, read both, until the old data
   has aged out of the cache/queue/store; then remove the old reader and the dependency that
   provided it.
4. **Remove `implements Serializable`** from the classes that only had it for this purpose —
   otherwise the next developer wires it back in.

For a cache specifically, the simplest correct answer is often: store the JSON, and accept the
size difference. The bytes are inspectable, the format survives a class rename, and cache
poisoning stops being an execution primitive.

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

- Logical type ids decouple the wire format from class names and restrict instantiation to the
  registered set.
- A sealed interface makes the permitted set explicit and gives exhaustive `switch` on the
  consumer side (java-composition-over-inheritance covers sealed hierarchies).
- If default typing cannot be removed immediately, a strict `PolymorphicTypeValidator`
  allow-listing base types and packages is the interim mitigation — with the same caveat as
  serialization filters.

The same rule applies to YAML (`!!javax.script.ScriptEngineManager`-style tags in unsafe
loaders), XML (`XMLDecoder` is equivalent to `ObjectInputStream`; XStream has its own history),
and any format with a type-resolution feature. Configure the parser to reject type directives
from the document.

## Review checklist

- [ ] Every `ObjectInputStream` in the codebase is enumerated, with its trust boundary stated.
- [ ] None of them reads bytes an attacker can influence; where one does, migration is planned
      and a filter is in place today.
- [ ] A JVM-wide `jdk.serialFilter` backstop with depth/array/ref limits is configured.
- [ ] Per-stream filters are allow-lists ending in `!*`, and are tested.
- [ ] Rejections are logged and alertable.
- [ ] No RMI/JMX port is reachable from an untrusted network.
- [ ] Cache, session and queue codecs are named explicitly in configuration, not defaulted.
- [ ] Jackson default typing is off; polymorphism uses logical ids over a closed set.
- [ ] Dependencies known to provide gadget chains are tracked, and the classpath is minimised —
      a smaller classpath is a smaller gadget surface.
