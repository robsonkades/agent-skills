# Remaining expert gaps and new-skill recommendations

**Date:** 2026-09-03. These recommendations follow the complete 258-skill review. They are not a
request to increase package count: each proposal must own a substantial decision surface that
cannot fit cleanly into an existing skill.

## Priority 1 — Linux storage and page-cache behavior for JVM services

**Name:** `linux-storage-and-page-cache-for-jvm`
**Category:** E — Platform, OS and Hardware
**Purpose:** diagnose latency and throughput caused by page cache, readahead, dirty-page writeback,
filesystem/block-device queues, fsync semantics and container ephemeral/persistent storage.
**Scope:** buffered versus direct I/O; page-cache residency/reclaim; major/minor faults; dirty
limits/writeback; filesystem and block-layer latency; fsync/fdatasync; network volumes; cgroup I/O
controls/pressure; Java file/database symptoms; safe `iostat`, PSI, eBPF/perf and `/proc` evidence.
**Why it is missing:** E deeply covers CPU, NUMA, networking and containers, but storage appears
only as a supporting detail in Linux, io_uring and database skills. No owner explains why a JVM
stalls on writeback or why storage p99 changes under page-cache pressure.
**Why separate:** the kernel/filesystem/block path and its failure modes are substantial, while
putting them in `linux-for-jvm` would turn that router into a storage textbook.
**Related skills:** `linux-for-jvm`, `io-uring-and-zero-copy`, `ebpf-for-jvm`,
`tail-latency-analysis`, `sql-query-performance`, `container-awareness`.
**Priority:** High.

## Priority 2 — Contract testing for services and messages

**Name:** `service-and-message-contract-testing`
**Category:** K — Testing
**Purpose:** choose and operate compatibility tests at process boundaries without confusing schema
validation with behavioral interoperability.
**Scope:** provider/consumer ownership; consumer-driven versus provider-driven contracts; HTTP,
gRPC and event schemas; semantic versus syntactic compatibility; generated clients; backward/
forward/full compatibility; test data and provider states; broker/schema-registry gates; false
confidence from mocks; deployment sequencing; production verification.
**Why it is missing:** `java-testing-strategy` selects a contract-test level and
`schema-evolution-and-compatibility` owns evolution semantics, but no K skill teaches how to build,
scope and maintain the test system.
**Why separate:** this has its own ownership model, CI topology, failure modes and operational
cost; adding it to the testing router would obscure retrieval.
**Related skills:** `java-testing-strategy`, `java-test-doubles`,
`schema-evolution-and-compatibility`, `rpc-and-api-contracts`, `delivery-semantics`, `quality-gates`.
**Priority:** High.

## Priority 3 — Database contention and transaction performance

**Name:** `database-contention-and-transaction-performance`
**Category:** M — Data Access Performance
**Purpose:** diagnose application-visible lock waits, deadlocks, isolation costs and long
transactions, then choose the smallest safe change.
**Scope:** transaction duration/round trips; lock acquisition and wait graphs; deadlock victim
selection; optimistic versus pessimistic behavior at load; isolation and predicate/gap locks;
hot-row/index contention; retry safety; batching trade-offs; application traces joined to database
wait events; pool occupancy caused by waiting transactions.
**Why it is missing:** `enterprise-transactions` and `offline-concurrency-control` own conceptual
patterns; `sql-query-performance` owns plans/indexes; none owns the cost and production diagnosis of
database concurrency from the application side.
**Why separate:** the evidence, failure modes and remedies differ from single-statement plan
tuning and from PoEAA pattern choice.
**Related skills:** `sql-query-performance`, `connection-pool-sizing`, `enterprise-transactions`,
`offline-concurrency-control`, `retries-and-backoff`, `idempotency`.
**Priority:** Medium-high.

## Priority 4 — Serial and Parallel GC operation

**Name:** `serial-and-parallel-gc-operation`
**Category:** A — JVM Memory and Garbage Collection
**Purpose:** choose and operate throughput/simple collectors for small heaps, constrained runtimes
and batch workloads, with the same evidence discipline used for G1/ZGC/Shenandoah.
**Scope:** generational layouts; adaptive sizing; promotion failure/full collection; worker sizing;
throughput/footprint/pause trade-offs; small-heap ergonomics; container CPU constraints; GC log
interpretation and migration criteria.
**Why it is missing:** existing fundamentals mention these collectors, but dedicated operational
depth is concentrated on G1 and concurrent collectors.
**Why separate:** only justified if the marketplace intends to support batch/small-footprint JVMs
as first-class workloads; otherwise expansion of `gc-fundamentals` is enough.
**Related skills:** `gc-fundamentals`, `gc-log-analysis`, `jvm-gc-tuning`, `container-awareness`.
**Priority:** Medium.

## Topics that should not become new skills now

| Topic                      | Decision                     | Reason                                                                                                                                               |
| -------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spring/Quarkus performance | Keep out of scope            | It creates a vendor release-train obligation and conflicts with the current framework-neutral identity.                                              |
| CQRS                       | Do not create                | Query objects, event sourcing, distribution and enterprise boundaries already own the meaningful decisions; a label-only skill would duplicate them. |
| Java cryptography          | Expand security basics first | JCA/TLS is substantial, but current demand and taxonomy ownership should be proven before splitting `java-application-security-basics`.              |
| DNS/service discovery      | Cross-link and monitor       | Routing/Linux/network skills cover most incidents; create a skill only if operational depth grows beyond those boundaries.                           |
| Observability pipelines    | Do not create yet            | OpenTelemetry performance, structured logging, tracing and metrics already cover the decision surface; another router would overlap.                 |
| General resilience         | Do not create                | `distributed-systems`, `failure-models` and the focused timeout/retry/breaker/bulkhead skills already form the graph.                                |

## Remaining limitations that no generic skill can remove

- JDK, JVM vendor and preview-feature behavior must be verified on the deployed build.
- Kernel, container runtime and Kubernetes feature gates differ by node image and cluster version.
- Broker, database and ORM guarantees are product/version/configuration dependent.
- Performance thresholds must be derived from the workload, SLO and resource envelope.
- Architecture governance, risk tolerance and test portfolios require project-local overlays.

These are explicit validation obligations, not missing generic prose.
