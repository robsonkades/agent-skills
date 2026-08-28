---
name: serialization-performance
description: >
  The cost of turning objects into bytes: comparing formats and libraries on throughput,
  allocation per operation, wire size and schema evolution together, buffer reuse and
  streaming, why Java serialisation is the wrong default and how to harden the paths that
  cannot be removed, and benchmarking a serialiser without lying. Use when a consumer's
  flame graph is dominated by ObjectMapper.readValue, when ObjectInputStream appears on a
  path that reads data from outside the process, when Kryo register() calls sit beside the
  default setRegistrationRequired(false), when a mixed deploy broke a distributed cache with
  KryoException, when a serialiser comparison is timed with System.nanoTime in a loop, when
  a benchmark reports average time and no allocation figure, or when picking a format for a
  new topic or contract. Does not cover writing the benchmark correctly
  (jmh-microbenchmarks), finding the allocation in production (allocation-profiling), or
  buffers outside the heap (off-heap-memory).
---

# Serialization Performance

## Purpose

Pick a serialisation format on all four axes at once — throughput, allocation per operation,
wire size and schema evolution — rather than on the one axis a blog post measured. Format
choice is not an isolated performance decision: it is a joint decision about latency, bytes on
the wire, how consumers will evolve, and how many languages have to read the payload.

Two failure modes justify the skill. First, a serialiser chosen from a throughput number, then
discovered months later to be structurally unable to survive a mixed deploy. Second, Java's
native serialisation surviving as the default on a path that reads bytes from outside the
process — the shape that produced the 2015 Commons Collections gadget chain and made
`ObjectInputFilter` an operational requirement rather than a good practice.

## Workflow

1. **Answer the two eliminating questions first.** Does the data cross a process or language
   boundary? Does it outlive a single session or deploy — a long-lived cache, persisted state,
   a Kafka topic? Those two answers remove most candidates before performance is discussed.
2. **State the schema-evolution mechanism explicitly** — a registry with compatibility rules, a
   format-native rule, or a versioned serialiser. "We will be careful" is not a mechanism.
3. **Characterise the read profile.** Few fields read out of large messages favours zero-copy;
   most fields read every time makes a full parse fine and zero-copy pointless.
4. **Measure on the real payload with JMH and `-prof gc`.** Compare `gc.alloc.rate.norm`
   alongside time; a format that is faster and allocates twice as much has not necessarily won.
5. **Take allocation out of the hot path.** Reuse working buffers, write straight to the output
   stream where possible, and pool or thread-confine the serialiser instance.
6. **Harden or delete every remaining `ObjectInputStream`** that reads data originating outside
   the process, before shipping.

## Rules

- Java's native serialisation is not a default for anything crossing a process boundary. It
  carries a deserialisation vulnerability class, reflection-driven slowness, `serialVersionUID`
  fragility, and class and field names on the wire.
- Every `ObjectInputStream` that reads data from outside the process gets an `ObjectInputFilter`
  (JEP 290; per-context factories since JEP 415, JDK 17). The filter ends in `!*` and sets
  `maxdepth`, `maxrefs`, `maxbytes` and `maxarray` — a class allow-list alone still leaves the
  denial-of-service path open, since a hostile graph of _allowed_ classes can be arbitrarily
  deep.
- A `record`'s canonical constructor **does** run during native deserialisation, so declared
  validation cannot be bypassed — unlike a conventional class, which is reconstructed without
  any constructor. This removes one bug class, not two: it is not a substitute for
  `ObjectInputFilter`, because a gadget chain acts on intermediate objects in the graph before
  your constructor is ever reached.
- Records ignore `writeObject`/`readObject` and `writeExternal`/`readExternal`. Only
  `readResolve` and `writeReplace` still apply. Code relying on the others silently does nothing.
- `kryo.register(Type.class, id)` without `kryo.setRegistrationRequired(true)` is decorative:
  the default reflection fallback still accepts unregistered classes, so the wire never shrinks
  to the numeric id and unknown classes pass silently. Both calls, or neither.
- Kryo registration ids must be stable across versions. Changing the registration order between
  deploys makes existing serialised data unreadable.
- Kryo instances are not thread-safe. Use a `ThreadLocal` or a pool; a shared instance is a
  latent corruption bug, not a performance choice.
- Raw Kryo is disqualified for data that outlives one JVM session or deploy window. Use
  `VersionFieldSerializer` or a schema-carrying format when a mixed deploy is possible.
- Benchmarks use JMH — never `System.nanoTime()` or `currentTimeMillis()` in a hand-written
  loop. Each `@Benchmark` is named unambiguously as round-trip or as one direction only.
- Run with `-prof gc` and report `gc.alloc.rate.norm` (bytes per operation), not just average
  time. Fix the heap (`-Xms`/`-Xmx`) and add `-XX:+AlwaysPreTouch` in the forks; a non-trivial
  `gc.count` during measurement means the timing comparison is partly measuring collections.
- Zero-copy formats (Cap'n Proto, FlatBuffers) shift the cost from "full parse, once" to
  "offset arithmetic, per field read". That is a win only when few fields of large messages are
  actually read, and neutral-to-negative when most fields are.
- The Cap'n Proto Java binding is community-maintained, unlike the C++ and Rust cores. Check its
  commit and issue history before depending on it; FlatBuffers is the zero-copy option with an
  official Java binding.
- Never pin a serialisation library version from memory — `protobuf-java` has moved from the
  3.25.x line to 4.x and Editions. Check Maven Central at the time you write the POM.
- A format migration starts from a profiler finding, not intuition: `ObjectMapper.readValue`
  dominating sampled CPU in a high-rate consumer is the actionable evidence.

## References

- [Choosing a format](references/format-selection.md) — the three wire-encoding families and
  what each costs to decode, a per-scenario selection table with what to avoid in each, the
  Kryo configuration that actually holds, the record-versus-class deserialisation semantics
  table, and the `ObjectInputFilter` pattern syntax for paths that cannot be removed. Read when
  selecting a format for a new contract, or when hardening a legacy `ObjectInputStream`.
- [Benchmarking and profiling serialisers](references/benchmarking-serialisers.md) — a correctly
  configured JMH harness with the flags that make the comparison valid, which tool answers which
  question, and the buffer-reuse and pooling recipes for Protobuf and Kryo. Read before
  publishing any serialisation measurement or optimising an existing hot path.
