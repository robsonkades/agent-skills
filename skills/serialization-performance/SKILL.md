---
name: serialization-performance
description: >
  Engineering serialization cost as a system budget across encode/decode CPU, allocation and
  retention, wire/storage bytes, copies, buffers, compression, schema evolution, compatibility,
  security, and rollout. Covers format/library selection by workload and contract, streaming
  versus materialization, buffer ownership/backpressure, representative JMH/component/load
  experiments, production attribution, and mixed-version failure tests. Use when serialization
  is measured hot, a new wire/cache/topic format is chosen, or “zero-copy”/binary-format claims
  need validation. General benchmark mechanics, schema governance, and Java native-serialization
  hardening have separate owners.
---

# Serialization performance

## Purpose

Choose and operate a serialization boundary from total system cost and compatibility, not one
library's small-payload throughput chart. The fastest encoder can lose after wire bytes,
compression, copies, allocation, downstream parsing, schema migration, or recovery are included.

## Ownership boundary

- This skill owns serialization performance models, experiments, buffer/copy strategy, and
  production attribution.
- `schema-evolution-and-compatibility` owns compatibility governance and rollout contracts.
- `java-serialization-hardening` owns deep `ObjectInputStream` security/migration.
- `jmh-microbenchmarks` owns harness validity; `load-testing` owns end-to-end arrivals/queueing.
- `off-heap-memory` owns native/direct memory lifecycle; `serialization-performance` owns how the
  codec uses those buffers.

## Decision contract

```text
boundary and trust zone: in-process/cache/process/network/storage/topic
producer/consumer languages, versions, ownership and deployment skew
payload schema, size/cardinality/nesting/optional-field and value distributions
read/write ratio and fields accessed
throughput/latency/tail/CPU/allocation/wire/storage objectives
streaming, framing, random access, compression and batching requirements
buffer ownership/lifetime/backpressure and maximum message policy
compatibility/registry/unknown-field/default/ordering/canonicalization rules
security/resource limits/privacy and malformed-input behavior
migration, dual-read/write, replay, rollback and retained-data horizon
```

## Cost model

Measure stages separately and together:

```text
end-to-end serialization cost =
  object/model construction
  + encode/decode CPU
  + allocation, retention and GC consequence
  + buffer growth/copy/reference-count/lifetime cost
  + compression/decompression
  + framing/checksum/encryption
  + wire/storage bytes and downstream I/O
  + schema lookup/validation/conversion
  + queueing/backpressure/retry/replay effects
```

Normalize per business message and per useful byte/field where appropriate. Batch-level results can
hide per-message tail and oversized-item failure.

## Eliminate by contract before speed

| Constraint                                  | Consequence                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| untrusted input                             | safe parser/resource limits; native Java serialization is not a default |
| long-lived data or rolling deploy           | explicit schema/compatibility and stable identifiers                    |
| multiple languages                          | supported implementations and conformance fixtures for each             |
| selective access to large immutable payload | indexed/lazy format may help if lifetime/validation costs fit           |
| streaming/unknown total size                | incremental API, framing, cancellation, backpressure                    |
| human inspection/interoperability           | text/self-describing trade may outweigh bytes/CPU                       |
| canonical bytes/signatures/dedup            | deterministic/canonical rules, not ordinary serializer defaults         |

No format automatically supplies organizational compatibility. Registry policy, generated code,
field IDs, defaults, unknown fields, enum evolution, maps/order, and implementation versions must
be tested across deployed producers/consumers.

## Format families and trade-offs

- **Text/self-describing** (for example JSON): broad interoperability and inspectability; repeated
  names and lexical conversion can increase bytes/CPU. Parsers may reuse field-name symbols and
  stream tokens, so “one String per key/value” is not a valid universal model.
- **Tagged schema formats** (for example Protocol Buffers/Avro variants): compact fields and
  explicit evolution rules, with sequential wire scanning during parse/skip. Generated in-memory
  objects may provide direct field access after materialization.
- **Indexed/in-place access formats** (for example FlatBuffers/Cap'n Proto designs): avoid full
  object materialization for some access patterns, while adding offset traversal, validation,
  alignment/layout, buffer-lifetime, implementation and mutation constraints.
- **Object-graph/library-specific codecs** (for example Kryo): flexible and often efficient within
  controlled ecosystems; class registration, graph/reference semantics and version compatibility
  become application protocol responsibilities.

“Zero-copy” is a claim about specific copies and stages, not end-to-end absence of copying. Kernel,
TLS, framing, decompression, buffer conversion, alignment and application materialization may remain.

## Buffer, ownership, and streaming

Prefer writing to the next stage's bounded buffer/stream when it eliminates a demonstrated copy.
Before reuse/pooling, define:

- owner, thread-safety, handoff and release point;
- maximum retained capacity and oversized-message behavior;
- heap/direct/native accounting and container headroom;
- partial write/read, cancellation, timeout and exception cleanup;
- reference-count/use-after-release and data leakage between tenants;
- pool exhaustion/backpressure and shutdown/redeploy cleanup.

`ThreadLocal` avoids concurrent codec use but can retain large buffers per platform thread and
behaves differently with virtual-thread workloads. Pools bound instances only if acquisition,
capacity reset, eviction, failure and telemetry are designed. Reuse can reduce allocation while
increasing retained memory or contention.

## Library-specific caution

Do not infer protocol safety from a benchmark snippet:

- Kryo registrations can use compact/stable IDs for registered types even when registration is not
  globally required. `setRegistrationRequired(true)` rejects accidental unregistered types; it is
  not what makes existing registered types use their IDs.
- registration IDs and serializers must remain compatible with retained bytes and rolling versions;
  order-based implicit registration is fragile unless frozen and tested.
- Kryo instances are generally not thread-safe; choose confinement/pooling and test reset state.
- disabling graph reference tracking changes semantics for shared/cyclic graphs, not only speed.
- library defaults and version serializers are not substitutes for cross-version golden fixtures.

Never pin versions or capability claims from memory. Inspect the current official documentation,
release artifact and supported JDK/platform matrix.

## Measurement ladder

1. **Corpus characterization:** production-derived, privacy-safe cohorts for size, nesting, values,
   optional/unknown fields, compressibility, malformed and maximum inputs.
2. **Semantic/conformance tests:** round-trip, cross-language/version, unknown/default fields,
   deterministic bytes where required, corruption/resource limits.
3. **JMH mechanism benchmark:** encode and decode separately plus round trip where relevant; CPU,
   allocation, output size, buffer mode, lifecycle, multiple forks and raw results.
4. **Component benchmark:** framing, registry, compression, buffer pool, network/storage and
   backpressure with realistic concurrency.
5. **Production/canary evidence:** profiles, allocation/GC, queue depth, payload sizes, errors,
   retries and SLOs normalized by useful work.
6. **Migration/failure test:** rolling versions, replayed old bytes, rollback, poison/max messages,
   dependency/registry outage and resource exhaustion.

Use `references/benchmarking-serialisers.md` for the experiment matrix.

## Production attribution

CPU samples at `ObjectMapper.readValue`, a generated parser, or codec method show sampled CPU
location, not automatically optimization value. Establish frequency per business operation,
inclusive/self cost, payload cohort, compilation/native frames, allocation/GC consequence, queueing,
and whether I/O or compression dominates end-to-end latency.

Allocation profiles find creation sites; they do not prove retained memory. Correlation between
allocation and GC pauses is not additive causal attribution because thread durations overlap and
collector work is phase-dependent. Use aligned work-normalized evidence and a controlled change.

## Security and resource safety

Treat all deserialization across a trust boundary as parser attack surface:

- cap bytes, nesting/depth, collections/arrays, references and decompressed expansion;
- reject/route malformed, incompatible, unknown-type and oversized messages deterministically;
- bound time, memory, concurrency and retries; avoid poison-message loops;
- authenticate/integrity-check at the correct layer and protect sensitive payload/profile data;
- fuzz/property-test parsers and cross-version fixtures.

Avoid Java native serialization for new external boundaries. If legacy `ObjectInputStream` remains,
use `ObjectInputFilter` with class and resource constraints, per-context policy where applicable,
and a migration plan; follow `java-serialization-hardening` and official serialization-filter docs.

## Decision framework

Prefer a candidate when it:

- satisfies trust, language, compatibility and retained-data constraints;
- meets CPU/allocation/wire/tail objectives over all important payload cohorts;
- has supported implementations, tooling and observable failure modes;
- integrates with bounded buffers/backpressure and operational recovery;
- survives mixed-version, rollback and malformed/max-input tests.

Reject or defer when the measured benefit is below migration risk/cost, only a toy corpus was tested,
the producer/consumer rollout cannot be made compatible, or buffer/native headroom is unbounded.

## Anti-patterns

| Anti-pattern                        | Why dangerous                           | Better alternative                          | Narrow exception                        |
| ----------------------------------- | --------------------------------------- | ------------------------------------------- | --------------------------------------- |
| Choose fastest median encode        | ignores decode/tail/bytes/compatibility | weighted system scorecard and failure tests | isolated one-way ephemeral path         |
| “Binary is faster”                  | payload/library/hardware vary           | representative corpus and stages            |
| “Zero-copy” as architecture         | copy boundaries/lifetime hidden         | byte-movement and ownership map             | verified single-stage claim             |
| ThreadLocal unbounded buffers       | retained memory multiplies by threads   | cap/shrink/pool/stream with telemetry       | few stable platform threads             |
| New byte array per message by habit | copy/allocation pressure                | stream/bounded reusable buffer after proof  | ownership requires immutable byte array |
| Raw registration order as protocol  | mixed deploy corrupts meaning           | explicit stable IDs/schema/golden fixtures  | single disposable session               |
| Same-process A/B called controlled  | order/JIT/GC interference remains       | blocked/forked experiment and controls      | exploratory diagnosis                   |

## Definition of done

- [ ] Contract, trust boundary, compatibility horizon and migration are explicit.
- [ ] Representative corpus includes size/value/schema/malformed/max cohorts.
- [ ] Encode, decode, round trip, bytes, allocation, copies, compression and failure are measured as relevant.
- [ ] Buffer ownership, retention, backpressure, cancellation and shutdown are bounded/tested.
- [ ] JMH results preserve fork/corpus identity and component/load behavior validates impact.
- [ ] Cross-version/language, rollback/replay and registry/dependency failures pass.
- [ ] Security/resource limits and observability exist in production.

## References

- [Format-selection scorecard](references/format-selection.md)
- [Benchmarking and profiling serializers](references/benchmarking-serialisers.md)
- [Java serialization filtering](https://docs.oracle.com/en/java/javase/25/core/serialization-filtering1.html)
- [Protocol Buffers encoding](https://protobuf.dev/programming-guides/encoding/)
- [Apache Avro specification](https://avro.apache.org/docs/current/specification/)
- [FlatBuffers internals](https://flatbuffers.dev/internals/)
- [Cap'n Proto encoding](https://capnproto.org/encoding.html)
- [Kryo documentation](https://github.com/EsotericSoftware/kryo)
