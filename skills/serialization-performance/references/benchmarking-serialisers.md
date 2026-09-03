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

Keep object construction outside an encode benchmark only when production also receives the object
already built. For decode, use immutable source bytes and ensure buffer position/state is reset.

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

## JMH protocol

Follow `jmh-microbenchmarks` and `jmh-advanced`:

- observe the semantic output and verify equality outside timing;
- use `@State` matching codec thread safety and production sharing;
- preserve multiple payload cohorts and raw fork identity;
- choose warm-up from compilation/allocation/GC trajectories;
- report JMH/JDK/library versions, flags, hardware, mode/unit/threads and operations semantics;
- run profiler diagnostics separately when profiler changes the decision path;
- use normalized allocation only with its exact profiler/denominator semantics.

Fixed heap and pre-touch are not universal validity requirements. They may isolate heap expansion or
page faults while changing startup, NUMA, RSS, and GC ergonomics. Use controlled and representative
runs when those factors matter.

GC during measurement does not automatically invalidate a serialization benchmark. It may be a
real consequence of allocation. Report GC CPU/pause/throughput and use additional mechanism runs to
separate codec execution from collector consequences.

## Avoid mutable-buffer traps

For each invocation verify:

- input buffer position/limit/order and source bytes are reset;
- output writer index/position is reset without exposing stale tenant data;
- returned bytes remain valid after buffer reuse/release;
- growth/oversize path is exercised and included/excluded deliberately;
- pooled codec state, references, class registrations, dictionaries and caches do not leak between
  payloads or forks;
- checksum/semantic oracle consumes the correct number of bytes.

A benchmark that returns a view into a buffer immediately reused by the next invocation may be fast
and semantically invalid.

## Production evidence map

| Question            | Evidence                                                     | Limitation                                |
| ------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| CPU location        | CPU profile, work normalized                                 | sampling and inclusive/context ambiguity  |
| elapsed wait/copy   | wall/JFR/trace + buffer/queue metrics                        | thread time is not request critical path  |
| allocation source   | JFR/async allocation or JMH GC profiler                      | creation is not retention                 |
| GC consequence      | GC logs/JFR with workload timeline                           | correlation alone is not causation        |
| wire/storage impact | bytes/message, compression ratio, network/storage counters   | protocol framing/retries must be included |
| buffer pressure     | pool acquire/wait/miss, capacity retained, direct/native use | cardinality and instrumentation cost      |

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
- open-loop or corrected workload generation for latency claims.

Measure successful useful messages/s, end-to-end percentile distribution, CPU/message, allocated
and retained memory, GC, wire bytes, errors/retries/drops, queue depth, and pool pressure.

## Failure tests

- truncated, corrupt, invalid tag/offset/length and unsupported schema/version;
- deeply nested, huge array/map/string and decompression expansion;
- pool exhaustion, direct/native OOM and output buffer growth failure;
- timeout/cancellation/partial stream and peer disconnect;
- schema registry unavailable/stale/authorization failure;
- rolling old-new producers/consumers, replay old bytes, rollback;
- unknown enum/field/default/map-order and deterministic-byte requirements;
- codec throws mid-write/read and instance is returned to pool;
- shutdown while buffers/messages are in flight.

## Comparison report

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
- [JFR runtime guide](https://docs.oracle.com/en/java/javase/25/jfapi/flight-recorder-runtime-guide/index.html)
- [async-profiler](https://github.com/async-profiler/async-profiler)
- [Protocol Buffers Java generated code](https://protobuf.dev/reference/java/java-generated/)
- [Apache Avro Java API](https://avro.apache.org/docs/current/api/java/)
- [Kryo documentation](https://github.com/EsotericSoftware/kryo)
