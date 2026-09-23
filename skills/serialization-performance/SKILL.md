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

Inspect the project's toolchain, resolved codec versions/modules, framework configuration and
deployed readers before choosing an API. This skill has no universal Java/library baseline;
documentation examples are not authorization to upgrade the target. Missing measurements leave
performance benefits hypothetical; missing compatibility evidence can block a format migration.

Use the contract fields and checks relevant to the requested decision. Adequate existing evidence
can support a narrow API, ownership or no-change conclusion. A new boundary can be selected from
hard constraints without inventing a predecessor or migration benefit; a performance claim needs
the corresponding measurements.

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

Separate resource dimensions from elapsed time. The relevant contributors are:

```text
object/model construction and encode/decode work
allocation rate, retained capacity and GC consequence
buffer growth/copies/reference counting and lifetime
compression/decompression, framing/checksum/encryption
wire/storage bytes and downstream I/O
schema lookup/validation/conversion
queueing/backpressure/retry/replay
```

Report CPU time, allocation per message, retained bytes, wire/storage bytes and latency with their
own units and populations. These are not terms in one arithmetic sum. For end-to-end latency,
measure the actual elapsed boundary/critical path; overlapping work and component percentiles
cannot simply be added. A weighted decision model must state its normalization and preferences.

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
- **Schema-based formats:** Protocol Buffers uses numbered field tags; Avro binary records encode
  values in writer-schema order without per-field tags. Their parsing, skipping and evolution
  rules differ. Generated objects may provide direct access after materialization. Use
  `references/format-selection.md` when comparing formats or changing codec configuration.
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

An asynchronous send must retain exclusive ownership or an appropriate lease until the transport
has finished reading the bytes. Enqueue, timeout or cancellation alone does not prove that point.
A read-only view can still observe mutations through another alias; copy or defer reuse when the
handoff contract cannot establish safety. Discard/reset a failed codec only by its documented policy.

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

Select the levels needed for the claim or changed boundary; this is not a mandatory full campaign.
A mechanism benchmark can answer a local cost question. System-impact and format-migration claims
need the corresponding pipeline and compatibility evidence. Reuse adequate supplied results.

1. **Corpus characterization:** production-derived, privacy-safe cohorts for size, nesting, values,
   optional/unknown fields, compressibility, malformed and maximum inputs.
2. **Semantic/conformance tests:** an independent contract oracle plus round-trip and
   cross-language/version fixtures for unknown/default/null/presence and numeric fidelity;
   canonical bytes where required, corruption/resource limits. A same-codec round trip alone
   cannot prove interoperability or that both directions did not normalize away required data.
3. **JMH mechanism benchmark:** encode and decode separately plus round trip where relevant; CPU,
   allocation, output size, buffer mode, lifecycle, multiple forks and raw results.
4. **Component benchmark:** framing, registry, compression, buffer pool, network/storage and
   backpressure with realistic concurrency.
5. **Production/canary evidence:** profiles, allocation/GC, queue depth, payload sizes, errors,
   retries and SLOs normalized by useful work.
6. **Migration/failure test:** rolling versions, replayed old bytes, rollback, poison/max messages,
   dependency/registry outage and resource exhaustion.

Use `references/benchmarking-serialisers.md` for the experiment matrix.
For stateful or compressed streams, establish whether one operation produces an independent
message or advances a session. Include required finalization and validate the resulting bytes;
buffer reset, codec reset, flush and stream completion are different contracts.

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
and assess the retention or migration decision for that boundary; follow
`java-serialization-hardening` and official serialization-filter docs. A narrow filter review need
not invent a migration, and filtering alone does not establish safety.

## Decision framework

Prefer a candidate when it:

- satisfies trust, language, compatibility and retained-data constraints;
- meets CPU/allocation/wire/tail objectives over all important payload cohorts;
- has supported implementations, tooling and observable failure modes;
- integrates with bounded buffers/backpressure and operational recovery;
- survives mixed-version, rollback and malformed/max-input tests.

Reject or defer when the measured benefit is below migration risk/cost, only a toy corpus was tested,
the producer/consumer rollout cannot be made compatible, or buffer/native headroom is unbounded.
Return the relevant contract, target baseline, supported keep/change conclusion and material limits.
Propose an experiment when a consequential unknown needs one. A failed/missing observation limits
the claim that depends on it; retain independently valid results, while missing successful-work
denominators or semantic validation prevent a valid performance comparison. Report measured gains
separately from unexecuted rollout or failure tests.

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

Apply these checks to the actual decision/change. A narrow explanation or adequate boundary can
finish without a new benchmark, deployment or migration.

- [ ] Relevant contract, trust boundary and compatibility/retention horizon are explicit; migration is covered when proposed.
- [ ] Measurements use representative cohorts; semantic/security checks cover relevant malformed/max cases separately where appropriate.
- [ ] Encode, decode, round trip, bytes, allocation, copies, compression and failure are measured as relevant.
- [ ] Changed buffer/lifecycle behavior has bounded ownership and relevant reuse/failure controls.
- [ ] JMH comparisons preserve fork/corpus identity; claimed system impact has corresponding component/load evidence.
- [ ] Compatibility/migration claims cover reachable versions/languages, rollback/replay and applicable dependencies.
- [ ] Relevant security/resource limits and operational observability are established or explicitly unverified.

## References

- [Format-selection scorecard](references/format-selection.md) — when comparing formats or changing codec configuration.
- [Benchmarking and profiling serializers](references/benchmarking-serialisers.md) — when designing or interpreting a codec experiment or profile.
- [Java serialization filtering](https://docs.oracle.com/en/java/javase/25/core/serialization-filtering1.html)
- [Protocol Buffers encoding](https://protobuf.dev/programming-guides/encoding/)
- [Apache Avro 1.12.0 specification](https://avro.apache.org/docs/1.12.0/specification/)
- [FlatBuffers internals](https://flatbuffers.dev/internals/)
- [Cap'n Proto encoding](https://capnproto.org/encoding.html)
- [Kryo 5.6.2 documentation](https://github.com/EsotericSoftware/kryo/tree/kryo-parent-5.6.2)
