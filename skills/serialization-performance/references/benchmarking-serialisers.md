# Benchmarking and profiling serializers

## Corpus manifest

Build immutable, privacy-reviewed cohorts rather than one “typical” object:

```yaml
schema_versions: []
producer_consumer_versions: []
payload_count_and_digest: ''
encoded_size_quantiles: ''
nesting_collection_string_numeric_distributions: ''
optional_unknown_default_enum_map_cases: []
compressibility_and_entropy_cohorts: []
malformed_truncated_oversized_bomb_cases: []
```

An encode-only mechanism benchmark can exclude object construction if its boundary is explicit.
For a claim about a production path that constructs objects, include that cost in the relevant
pipeline experiment; do not attribute the isolated encode result to the whole path. For decode,
use immutable source bytes and ensure buffer position/state is reset.
Keep corpus size bounded and report its working set: a tiny repeatedly reused object can fit caches
while production's variable strings, numbers and schemas do not. State whether setup/schema lookup
is amortized or cold. Include the deployed implementation/configuration as the baseline.

Define the semantic oracle before measuring: absent versus null/default, integer range, decimal
precision/scale as required by the contract, timestamps/time zones, enum values and unknown-field
survival through intermediaries. Use independently specified expected values and old/new golden
fixtures; Java `equals` or a same-codec round trip may omit wire-visible distinctions. Only require
byte equality when the protocol requires canonical bytes; otherwise compare the required semantics.

## Benchmark cells

Measure dimensions independently enough to localize cost:

| Cell                           | Boundary                              | Outputs                                    |
| ------------------------------ | ------------------------------------- | ------------------------------------------ |
| encode to new byte array       | codec + growth/copy/result ownership  | time, allocation, bytes                    |
| encode to caller stream/buffer | codec plus selected sink              | time, allocation, written bytes/calls      |
| decode to full model           | parse + object materialization        | time, allocation, semantic result          |
| selective/lazy access          | validation/view + accessed fields     | time, allocation, retained buffer lifetime |
| round trip                     | encode + transfer-copy model + decode | time, allocation, semantic equality        |
| compressed/framed              | real codec pipeline                   | CPU, bytes, allocation, tail               |

Do not compare one library's streaming API to another's new-array convenience API without calling
that boundary difference the experimental factor.

### Complete compressed output

Define whether the measured operation produces a complete compressed message, a batch, or a chunk
of a continuing stream. For Java 17 `GZIPOutputStream`, default `flush()` only flushes the downstream
stream; `syncFlush=true` also flushes pending compressed data but does not finish the GZIP member.
`finish()` completes it, including the trailer, without closing the downstream stream; `close()`
also closes that stream. Assign wrapper cleanup and downstream ownership separately: finishing
output does not replace resource cleanup.

For independent messages, include required finalization in the encode boundary, count all emitted
bytes, and check decompression through end-of-member outside timing; recovering the expected prefix
alone can miss a truncated trailer. For a continuing stream, preserve its flush policy and measure
when each message becomes consumable, accounting for eventual finalization at the batch/session
level. Do not force per-message termination if production deliberately shares compression state.
Exercise finalization failure: successful `write()` calls do not establish a complete output.

## JMH protocol

Follow `jmh-microbenchmarks` and `jmh-advanced`:

- observe the semantic output and verify equality outside timing;
- use `@State` matching codec thread safety and production sharing;
- preserve multiple payload cohorts and raw fork identity;
- choose warm-up from compilation/allocation/GC trajectories;
- report JMH/JDK/library versions, flags, hardware, mode/unit/threads and operations semantics;
- run profiler diagnostics separately when profiler changes the decision path;
- use normalized allocation only with its exact profiler/denominator semantics.

Validate completed forks, processed corpus counts and oracle results before comparing costs.
A fast rejection/drop or empty run is not faster successful serialization. Report failed runs as
inconclusive, retain comparable raw runs and uncertainty, and do not claim a gain below the chosen
practical threshold. Measure the deployed baseline with the same operation boundary and cohorts.

Fixed heap and pre-touch are not universal validity requirements. They may isolate heap expansion or
page faults while changing startup, NUMA, RSS, and GC ergonomics. Use controlled and representative
runs when those factors matter.

GC during measurement does not automatically invalidate a serialization benchmark. It may be a
real consequence of allocation. Report GC CPU/pause/throughput and use additional mechanism runs to
separate codec execution from collector consequences.

## Avoid mutable-buffer traps

Establish these invariants through appropriate correctness controls, including checks outside the
timed body or in a separate run. Preserve observable output and the actual lifecycle work included
in the claimed boundary; validation need not become measured codec work. Invocation fixtures are
not free of timing/arbitration effects (`jmh-advanced`).

- input buffer position/limit/order and source bytes are reset;
- output writer index/position is reset without exposing stale tenant data;
- returned bytes remain valid for the promised consumption lifetime;
- growth/oversize path is exercised and included/excluded deliberately;
- pooled message/graph state resets according to the codec contract; intentional registrations,
  configuration and caches may persist, with compatible protocol and tenant isolation;
- checksum/semantic oracle consumes the correct number of bytes.

A borrowed view is valid when its consumer finishes before backing storage is mutated/reused.
Returning or passing the view to a Blackhole does not by itself validate its contents or prove an
asynchronous consumer has finished. A view still needed after reuse can silently observe new bytes.
For an asynchronous component test, deliberately delay consumption, encode another message, and
verify the first message's bytes stay unchanged until actual consumption finishes. Exercise timeout
and cancellation while that consumer still owns the bytes; releasing a lease at caller completion
can be too early. After mid-write failure, reject partial output and discard or reset the codec
according to its contract before it re-enters the pool.

Reset is not universal erasure or deallocation. In Kryo 5.6.2, `Kryo.reset()` clears graph state
including references/unregistered-name state; the default resolver keeps explicit registrations.
`Output.reset()` sets position and total to zero without wiping or shrinking the backing array.
`Output.getBuffer()` exposes that array; only `[0, position)` is current output. `toBytes()` copies
that range. Inspect the actual version, custom serializers and transport lease before choosing a
reset/copy/reuse policy; reset alone does not establish safe cross-tenant access.

For a legacy Java object stream, make its identity scope explicit. `ObjectOutputStream.writeObject`
can encode a repeated object as a back-reference; mutating that object between writes does not
automatically emit a new snapshot. This can make a repeated-object benchmark appear cheap while
the reader still sees the earlier state. Test the required values and shared identity across
successive messages. If identity across writes is intentional, preserve it rather than adding
resets merely to make the benchmark resemble another codec.

`ObjectOutputStream.reset()` clears remembered objects and emits a reset marker within the existing
stream; its cost and changed identity semantics belong in a snapshot experiment that uses it.
`ByteArrayOutputStream.reset()` only discards accumulated output, leaving a wrapping codec's state
intact. Neither recreates a standalone serialization header. If each payload is read by a fresh
`ObjectInputStream`, produce and validate a complete stream per payload, including construction
and header cost in that boundary. `writeUnshared()` is not a recursive snapshot operation: its
special treatment applies to the root, not transitively referenced objects. Exercise a mutated
shared child as well as a repeated root. See `java-serialization-hardening` for legacy input safety.

## Production evidence map

| Question            | Evidence                                                     | Limitation                                |
| ------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| CPU location        | CPU profile, work normalized                                 | sampling and inclusive/context ambiguity  |
| elapsed wait/copy   | wall/JFR/trace + buffer/queue metrics                        | thread time is not request critical path  |
| allocation source   | JFR/async allocation or JMH GC profiler                      | creation is not retention                 |
| GC consequence      | GC logs/JFR with workload timeline                           | correlation alone is not causation        |
| wire/storage impact | bytes/message, compression ratio, network/storage counters   | protocol framing/retries must be included |
| buffer pressure     | pool acquire/wait/miss, capacity retained, direct/native use | cardinality and instrumentation cost      |

Use existing adequate recordings, or explicitly start and complete a bounded recording when the
claim needs one. JFR metadata describes available events, not enabled or recorded observations;
check settings and actual counts. Missing/failed optional diagnostics limit their own attribution
claims without erasing independently valid results.

Run positive controls and validate event settings, weights, loss, and target population. Comparing
two codecs simultaneously inside one JVM does not remove environment: order, compilation, GC,
caches, and shared resource interactions remain.

## Component and load experiment

Use realistic concurrency, arrival rate and backpressure. Include:

- connection/framing/TLS/compression/checksum as deployed;
- message-size and schema-version mixture;
- batch formation and flush policy;
- buffer-pool size, miss/fallback and direct-memory limit;
- consumer processing and acknowledgement/retry behavior;
- CPU quota, memory limit, network bandwidth and downstream bottlenecks;
- an arrival model representing production: a closed population can correctly model workers/users
  whose next request depends on completion. For independently scheduled arrivals, record scheduled
  and started work, lateness, drops and generator capacity; closed feedback reduces offered work
  during stalls. Histogram correction does not recreate omitted requests or overload behavior.

Measure successful useful messages/s, end-to-end percentile distribution, CPU/message, allocated
and retained memory, GC, wire bytes, errors/retries/drops, queue depth, and pool pressure.

## Failure tests

Choose the failures relevant to the changed codec, trust, ownership or compatibility contract;
this list does not require every format/API review to exercise every dependency.

- truncated, corrupt, invalid tag/offset/length and unsupported schema/version;
- deeply nested, huge array/map/string and decompression expansion;
- pool exhaustion, direct/native OOM and output buffer growth failure;
- timeout/cancellation/partial stream and peer disconnect;
- schema registry unavailable/stale/authorization failure;
- rolling old-new producers/consumers, replay old bytes, rollback;
- unknown enum/field/default/map-order and deterministic-byte requirements;
- codec throws mid-write/read and instance is returned to pool;
- compression finalization fails or a truncated trailer follows an otherwise decodable payload;
- shutdown while buffers/messages are in flight.

## Comparison report

Report the fields needed for the claim, including a supported keep/no-change conclusion. Distinguish
mechanism results, system-impact evidence and pending experiments rather than filling unrelated cells.

```text
decision and practical threshold:
corpus and schema/version matrix:
API/boundary per candidate:
JMH effects with fork-level uncertainty:
bytes/compression/allocation/copies and buffer retention:
component/load SLO/capacity results:
compatibility/security/failure outcomes:
operational/tooling/migration cost:
selected candidate, rejected alternatives and residual risks:
```

## Authoritative references

- [OpenJDK JMH](https://github.com/openjdk/jmh)
- [JFR API Programmer's Guide, Java 25](https://docs.oracle.com/en/java/javase/25/jfapi/index.html)
- [Java 25 JFR recording API and settings](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/package-summary.html)
- [async-profiler](https://github.com/async-profiler/async-profiler)
- [Protocol Buffers Java generated code](https://protobuf.dev/reference/java/java-generated/)
- [Apache Avro 1.12.0 Java API](https://avro.apache.org/docs/1.12.0/api/java/)
- [Kryo 5.6.2 reset](https://github.com/EsotericSoftware/kryo/blob/kryo-parent-5.6.2/src/com/esotericsoftware/kryo/Kryo.java)
- [Kryo 5.6.2 Output](https://github.com/EsotericSoftware/kryo/blob/kryo-parent-5.6.2/src/com/esotericsoftware/kryo/io/Output.java)
- [JMH 1.37 invocation fixture contract](https://github.com/openjdk/jmh/blob/1.37/jmh-core/src/main/java/org/openjdk/jmh/annotations/Level.java)
- [Java 17 GZIPOutputStream completion](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/zip/GZIPOutputStream.html)
- [Java 17 DeflaterOutputStream flush and close](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/zip/DeflaterOutputStream.html)
- [OpenJDK 17u GZIP trailer emission](https://github.com/openjdk/jdk17u/blob/master/src/java.base/share/classes/java/util/zip/GZIPOutputStream.java)
- [Java 17 ObjectOutputStream identity, reset and writeUnshared](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/io/ObjectOutputStream.html)
- [Java 17 ByteArrayOutputStream reset](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/io/ByteArrayOutputStream.html)
