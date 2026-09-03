---
name: java-serialization-hardening
description: >
  Java built-in serialization as an attack surface and a permanent API commitment: why
  readObject is an extra constructor that accepts arbitrary bytes, gadget chains and what
  deserialization filters (JEP 290/415) can and cannot do, the cost of implementing
  Serializable, serialVersionUID and the custom serialized form, validating and defensively
  copying in readObject, the serialization proxy pattern, why records are different, and the
  same risk in JSON polymorphic typing. Use when Serializable, readObject, readResolve or
  Externalizable appears, when ObjectInputStream reads bytes from a cache, queue, session
  store, RMI or JMX, when Jackson default typing is enabled, or when a mixed-version deploy
  breaks a serialized cache. Format cost is serialization-performance, contract evolution is
  rpc-and-api-contracts, and the reflective access underneath is
  java-reflection-and-method-handles.
---

# Java Serialization Hardening

## Purpose

Keep the built-in serialization mechanism away from anything an attacker can influence, and —
where it cannot be removed — make each `Serializable` class defend its own invariants. Two
failure modes: `ObjectInputStream` on attacker-influenced data, which instantiates arbitrary
allowed object graphs and invokes serialization hooks before the caller can validate the result;
with a reachable gadget this can become code execution, and without one it can still exhaust
resources or violate invariants. The second is `implements Serializable` added
casually, which publishes the class's private field layout as a compatibility contract nobody
intended to maintain.

## Workflow

1. **Find every deserialization entry point.** Direct `ObjectInputStream`, RMI/JMX paths,
   JNDI providers that can return serialized state, a distributed cache configured with a JDK serializer, session replication, a
   message consumer, and any framework that stores state as bytes. List the ones whose bytes
   are not exclusively produced by trusted code you deploy together.
2. **Remove the mechanism where the data is not trusted.** Replace with JSON, protobuf or Avro
   parsed into explicit types. This is the fix; everything below is mitigation.
3. **Where it must stay, filter and compose deliberately.** Use a context-specific
   `ObjectInputFilter` for expected classes and graph limits. Configure a JVM-wide backstop, then
   verify how the active filter factory combines it with stream filters—the built-in factory can
   replace the static filter when a stream-specific filter is set rather than intersecting both.
4. **For each `Serializable` class you own**, decide the serialized form deliberately: default
   or custom, `serialVersionUID` declared, invariants revalidated on read, mutable components
   copied.
5. **Prefer a design where deserialization runs a constructor** — a record, or a serialization
   proxy — so the invariants cannot be bypassed at all.
6. **Test compatibility and rollout explicitly**: released golden data must still deserialize.
   If old readers coexist, keep writing the old/enveloped form or dual-write safely until they are
   gone; merely teaching the new release to read both formats does not protect the old release.

## Rules

- Default decision: do not use Java serialization for a new trust or persistence boundary. It is
  Java-specific, opaque, hard to govern as a schema and capable of executing class hooks. A closed,
  ephemeral in-process use may have different constraints, but convenience alone is insufficient.
  It is often slower/larger than schema formats, but measure the actual payload and workload.
  Choose a schema and parser based on interoperability, evolution, observability and measured
  cost—JSON, protobuf and Avro have different trade-offs (serialization-performance).
- **Never treat validation after `readObject()` as protection for hostile bytes.** Hooks and graph
  construction occur _during_ deserialization through methods such as `readObject` and
  `readResolve`; `finalize` is not a serialization callback. The gadget
  chain does not need your classes to be malicious — it needs a library on your classpath that
  can be driven into doing something, and popular libraries have repeatedly qualified.
- A filter is a mitigation, not a proof of safety. `ObjectInputFilter` (JEP 290) and the filter factory
  (JEP 415) let you allow-list classes, cap array sizes, graph depth and total bytes; set the
  narrowest filter that works and treat a rejection as a security event. An allow-list of exact
  classes is worth having; a deny-list of known gadget classes is not — the list of gadgets
  grows with every dependency.
- Implementing `Serializable` creates a compatibility commitment for as long as old bytes or
  consumers survive. Under the default form, field names/types, hierarchy and reachable types
  constrain evolution; a custom serial form or proxy can decouple representation. Add it only
  for a concrete requirement with retention and migration policy.
- Declare `private static final long serialVersionUID` explicitly on ordinary `Serializable`
  classes and annotate serialization declarations with `@Serial`. Enums have fixed UID `0L` and
  ignore such declarations; records default to `0L` and waive UID matching. For ordinary classes,
  the generated value depends on the compiler's view of the class — names, modifiers,
  members — so an innocuous edit changes it and produces `InvalidClassException` at runtime,
  in production, on a mixed-version deploy.
- Use the default serialized form only when the physical representation genuinely equals the
  logical content. Where it does not (a linked structure, a cache, a derived index, a doubly
  linked list), write a custom form: `writeObject`/`readObject` with `defaultWriteObject`/
  `defaultReadObject` plus the explicit fields, and mark the rest `transient`. The default form
  over a long linked structure also recurses per element and can overflow the stack.
- `readObject` is an additional construction path that accepts hostile input. Constructors and
  field initializers of serializable classes do not establish the object; the no-arg constructor
  of the first non-serializable superclass does run. Revalidate every invariant
  the real constructor enforces, and it must **defensively copy** every mutable component
  before validating — otherwise an attacker who appended extra bytes keeps a reference to the
  object's internals and mutates them after construction. Copy first, validate the copy, and
  never validate a field the attacker can still reach.
- Exclude derived caches, resource handles, credentials/capabilities and other non-logical state
  with `transient` or an explicit serial form. `transient` is not encryption and does not exclude
  the same object if it is reachable through another non-transient path. A transient field is
  restored as `null`/`0`, so `readObject` must reconstruct or revalidate it.
- Prefer the **serialization proxy pattern** when a `Serializable` class has non-trivial
  invariants: a private static nested class holding the logical state, `writeReplace` on the
  outer class, and a `readObject` on the outer class that throws `InvalidObjectException`.
  Deserialization then goes through the proxy's `readResolve`, which builds the object with its
  ordinary constructor — invariants enforced, no reflective back door. It does not work for
  classes extensible by clients, or for object graphs with cycles through the proxied class.
- A **record** is deserialized through its canonical constructor, so its compact-constructor
  validation and defensive copies apply to deserialised instances as well. That removes the
  `readObject` invariant-bypass hazard. Its `writeObject`, `readObject`, `readObjectNoData`,
  `writeExternal` and `readExternal` hooks are ignored, but `writeReplace`/`readResolve` may still
  substitute objects. Records also do not preserve cycles through their components.
- A singleton that implements `Serializable` needs `readResolve` returning the canonical
  instance and every field declared `transient`, or deserialization mints a second instance —
  see java-object-construction, where an enum removes the problem entirely.
- A related attack shape exists in JSON. Jackson's class-name default typing and broad
  `@JsonTypeInfo(use = Id.CLASS)` let the document name the class to instantiate, which is
  the JSON version of a gadget chain. Use logical type ids registered with
  a closed logical-id registry plus an explicit discriminator and strict mapper configuration.
  `Id.NAME` or a sealed interface alone is not an allow-list if other modules can register or
  discover subtypes. Never resolve arbitrary class names from a hostile payload.
- Serialized data crosses versions in time as well as space. A distributed cache, a session
  store or a queue holds bytes written by the previous release while the new one reads them,
  and vice versa during a rolling deploy. Decide the compatibility policy — and if the answer
  is "we flush the cache on deploy", write it down and make the flush automatic.

## References

- [Untrusted data and filters](references/untrusted-data-and-filters.md) — read when
  `ObjectInputStream` reads anything not produced by code you deploy, when configuring
  `ObjectInputFilter` or a filter factory, when auditing RMI/JMX/JNDI/cache exposure, or when
  polymorphic JSON typing is in use.
- [If you must implement Serializable](references/implementing-serializable.md) — read when
  writing or reviewing a `Serializable` class: choosing the serialized form,
  `serialVersionUID`, `readObject` validation and defensive copies, the serialization proxy,
  records, and compatibility testing across versions.

## Primary sources

- [Java SE 25 Serialization Filtering Guide](https://docs.oracle.com/en/java/javase/25/core/java-serialization-filters.html)
- [Java Object Serialization Specification](https://docs.oracle.com/en/java/javase/25/docs/specs/serialization/index.html)
- [Serializable API contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/io/Serializable.html)
- [JEP 290 — Filter Incoming Serialization Data](https://openjdk.org/jeps/290)
- [JEP 415 — Context-Specific Deserialization Filters](https://openjdk.org/jeps/415)
