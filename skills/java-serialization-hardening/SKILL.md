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
failure modes: `ObjectInputStream` on data from outside the process, which is a
remote-code-execution primitive rather than a parser; and `implements Serializable` added
casually, which publishes the class's private field layout as a compatibility contract nobody
intended to maintain.

## Workflow

1. **Find every deserialization entry point.** `ObjectInputStream`, RMI, JMX, JNDI/LDAP
   lookups, a distributed cache configured with a JDK serializer, session replication, a
   message consumer, and any framework that stores state as bytes. List the ones whose bytes
   are not exclusively produced by trusted code you deploy together.
2. **Remove the mechanism where the data is not trusted.** Replace with JSON, protobuf or Avro
   parsed into explicit types. This is the fix; everything below is mitigation.
3. **Where it must stay, filter.** A per-stream `ObjectInputFilter` allow-listing the expected
   classes, plus a JVM-wide filter as a backstop, plus a depth/size limit.
4. **For each `Serializable` class you own**, decide the serialized form deliberately: default
   or custom, `serialVersionUID` declared, invariants revalidated on read, mutable components
   copied.
5. **Prefer a design where deserialization runs a constructor** — a record, or a serialization
   proxy — so the invariants cannot be bypassed at all.
6. **Test compatibility explicitly**: a golden file from the previous release must still
   deserialize, and a value from the current release must be readable by the previous one if a
   rolling deploy requires it.

## Rules

- Do not use Java serialization for anything new. It is slow, Java-only, produces an opaque
  format with no schema, couples the wire form to class internals, and has a decade of
  remote-code-execution history. Choose JSON for human-inspectable contracts, protobuf/Avro
  where schema and size matter — serialization-performance compares them.
- **Never deserialize untrusted bytes with `ObjectInputStream`.** There is no safe way to
  validate afterwards: the attack executes _during_ deserialization, through the `readObject`,
  `readResolve` and `finalize` methods of whatever classes are on the classpath. The gadget
  chain does not need your classes to be malicious — it needs a library on your classpath that
  can be driven into doing something, and popular libraries have repeatedly qualified.
- A filter is a mitigation, not a fix. `ObjectInputFilter` (JEP 290) and the filter factory
  (JEP 415) let you allow-list classes, cap array sizes, graph depth and total bytes; set the
  narrowest filter that works and treat a rejection as a security event. An allow-list of exact
  classes is worth having; a deny-list of known gadget classes is not — the list of gadgets
  grows with every dependency.
- Implementing `Serializable` is a permanent commitment. The serialized form becomes part of
  the public API: field names and types, the class hierarchy, and anything they reach are now
  compatibility constraints. Refactoring a private field becomes a breaking change; classes
  that could have been redesigned cannot be. Add it only when something concrete requires it.
- Declare `private static final long serialVersionUID` explicitly on every `Serializable`
  class. The generated value depends on the compiler's view of the class — names, modifiers,
  members — so an innocuous edit changes it and produces `InvalidClassException` at runtime,
  in production, on a mixed-version deploy.
- Use the default serialized form only when the physical representation genuinely equals the
  logical content. Where it does not (a linked structure, a cache, a derived index, a doubly
  linked list), write a custom form: `writeObject`/`readObject` with `defaultWriteObject`/
  `defaultReadObject` plus the explicit fields, and mark the rest `transient`. The default form
  over a long linked structure also recurses per element and can overflow the stack.
- `readObject` is a constructor that accepts hostile input. It must revalidate every invariant
  the real constructor enforces, and it must **defensively copy** every mutable component
  before validating — otherwise an attacker who appended extra bytes keeps a reference to the
  object's internals and mutates them after construction. Copy first, validate the copy, and
  never validate a field the attacker can still reach.
- Fields that must never be written must be `transient`, and that includes anything derived,
  any cache, any resource handle, and anything security-sensitive. A `transient` field is
  restored as `null`/`0`, so `readObject` must reconstruct or revalidate it.
- Prefer the **serialization proxy pattern** when a `Serializable` class has non-trivial
  invariants: a private static nested class holding the logical state, `writeReplace` on the
  outer class, and a `readObject` on the outer class that throws `InvalidObjectException`.
  Deserialization then goes through the proxy's `readResolve`, which builds the object with its
  ordinary constructor — invariants enforced, no reflective back door. It does not work for
  classes extensible by clients, or for object graphs with cycles through the proxied class.
- A **record** is deserialized through its canonical constructor, so its compact-constructor
  validation and defensive copies apply to deserialised instances as well. That removes the
  entire `readObject` hazard class, and it is a concrete reason to model serializable value
  types as records. Records cannot customise the deserialization behaviour, which is the point.
- A singleton that implements `Serializable` needs `readResolve` returning the canonical
  instance and every field declared `transient`, or deserialization mints a second instance —
  see java-object-construction, where an enum removes the problem entirely.
- The same attack shape exists in JSON. Jackson's default typing (`enableDefaultTyping`, and
  `@JsonTypeInfo(use = Id.CLASS)`) lets the document name the class to instantiate, which is
  the JSON version of a gadget chain. Use logical type ids registered with
  `@JsonSubTypes`/`registerSubtypes`, or a sealed interface with an explicit discriminator, and
  never resolve a class name from a payload — java-reflection-and-method-handles.
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
