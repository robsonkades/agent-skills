# Cross-skill knowledge graph

This document records the principal learning/diagnostic paths and the ownership edges that prevent
the 13 mutually exclusive categories from duplicating one another. Manifest dependencies remain
the machine-readable graph; this is the human/agent retrieval view.

## Runtime performance investigation

```mermaid
flowchart LR
  JP[java-performance] --> PM[performance-methodology]
  JP --> IC[incident-evidence-capture]
  PM --> JFR[jfr-and-async-profiler]
  JFR --> AP[async-profiler-advanced]
  JFR --> JFRA[jfr-advanced]
  PM --> LS[latency-statistics]
  LS --> TL[tail-latency-analysis]
  TL --> PA[pause-attribution]
  PA --> GC[gc-log-analysis]
  PA --> CD[concurrency-diagnostics]
  PA --> LX[linux-for-jvm]
```

Ownership: C establishes trustworthy evidence. The final mechanism is interpreted by A (memory), B
(execution), D (concurrency), E (platform) or F (distributed systems).

## Memory and garbage collection

```mermaid
flowchart LR
  MR[jvm-memory-regions] --> GF[gc-fundamentals]
  GF --> GT[jvm-gc-tuning]
  GT --> G1[g1-internals]
  G1 --> G1M[g1-concurrent-marking]
  G1 --> G1S[g1-tuning-for-slo]
  GT --> ZS[zgc-and-shenandoah]
  ZS --> ZGI[zgc-generational-internals]
  MR --> HD[heap-dump-analysis]
  MR --> NM[off-heap-memory]
  GF --> AL[allocation-profiling]
  AL --> EA[jit-inlining-and-escape-analysis]
```

Potential conflict: allocation is observed in A, while the compiler transformation that removes it
is B. Cross-reference; do not duplicate escape-analysis internals in allocation diagnosis.

## Compilation and execution

```mermaid
flowchart LR
  BC[jvm-bytecode] --> JIT[jit-compilation]
  JIT --> CI[compilation-and-inlining-logs]
  JIT --> DE[deoptimization]
  JIT --> C2[c2-sea-of-nodes]
  C2 --> EA[escape-analysis-internals]
  CI --> ASM[reading-jit-assembly]
  JIT --> CC[code-cache-segments]
  CL[jvm-class-loading] --> START[startup-cds-crac-leyden]
  START --> NI[graalvm-native-image]
  REF[java-reflection-and-method-handles] --> FFM[jni-and-ffm]
```

Potential conflict: compiler logs and assembly mechanics are B; experimental methodology and
profiling-tool selection are C.

## Concurrency evolution

```mermaid
flowchart LR
  JC[java-concurrency] --> JMM[java-memory-model]
  JMM --> VH[varhandles-and-memory-ordering]
  JMM --> TS[java-thread-safety-contracts]
  JC --> EX[executors-and-task-lifecycle]
  EX --> VT[thread-sizing-and-virtual-threads]
  VT --> VTI[virtual-threads-internals]
  VT --> VTM[virtual-thread-migration]
  VTM --> SC[structured-concurrency]
  SC --> SV[scoped-values]
  JC --> RX[reactive-and-virtual-thread-selection]
  RX --> BP[reactive-backpressure]
  JC --> CAN[cancellation-and-interruption]
```

Potential conflict: reactive backpressure inside one JVM is D. Backpressure across service or
broker boundaries is F and must state delivery/recovery consequences.

## Distributed request resilience

```mermaid
flowchart LR
  DS[distributed-systems] --> FM[failure-models]
  FM --> TD[timeouts-and-deadlines]
  TD --> RB[retries-and-backoff]
  RB --> ID[idempotency]
  RB --> CB[circuit-breakers]
  CB --> BL[concurrency-limiting-and-bulkheads]
  BL --> RL[rate-limiting-and-load-shedding]
  FM --> CF[cascading-failures]
  CF --> SG[scatter-gather]
  ID --> TX[distributed-transactions-and-sagas]
```

Common combination: deadline + bounded attempts + idempotency + concurrency limit + load shedding.
Potential conflict: each layer must share one end-to-end budget; independent retry policies
multiply attempts.

## Messaging, streaming and topology

```mermaid
flowchart LR
  DS[delivery-semantics] --> MO[message-ordering-and-partitioning]
  DS --> PM[poison-messages-and-dlq]
  DS --> KJ[kafka-consumers-in-java]
  MO --> TQ[task-queues-and-competing-consumers]
  MO --> SP[streaming-pipeline-topologies]
  SH[sharding-and-partitioning] --> CH[consistent-hashing]
  CH --> HP[hot-partitions-and-rebalancing]
  CH --> CR[cache-sharding-and-replication]
  CM[consistency-models] --> CQ[consensus-and-quorums]
  CQ --> LE[leader-election]
  LE --> DL[distributed-locks-and-leases]
```

Potential conflict: “exactly once” is decomposed among delivery, processing, state commit and
external side effects; no single broker flag owns the end-to-end claim.

## Java design to enterprise architecture

```mermaid
flowchart LR
  API[java-api-design] --> CT[java-design-by-contract]
  CT --> IM[java-immutability]
  API --> RF[java-refactoring]
  RF --> CS[java-code-smells]
  RF --> PS[gof-pattern-selection]
  PT[gof-pattern-thinking] --> PS
  PS --> GOF[23 GoF pattern skills]
  EA[enterprise-application-architecture] --> DL[domain-logic-organization]
  EA --> L[layering-and-boundaries]
  DL --> SL[service-layer-design]
  L --> RP[repository-pattern]
  RP --> ORM[ORM pattern family]
```

Ownership: G supplies general Java principles, H names object-level GoF collaborations, and I owns
enterprise transaction/domain/data-source structures.

## Architecture governance and evolution

```mermaid
flowchart LR
  AC[architecture-characteristics] --> TA[architecture-trade-off-analysis]
  TA --> ADR[architecture-decision-making]
  ADR --> FF[architecture-fitness-functions]
  FF --> AT[architecture-testing]
  CQ[architecture-coupling-and-quanta] --> RB[component-and-release-boundaries]
  RB --> AR[architecture-refactoring-paths]
  AR --> LM[legacy-enterprise-modernization]
  ADR --> TD[technical-debt-decisions]
```

Potential conflict: I owns the application patterns; J owns recording, enforcing and evolving the
choice. Architecture fitness tests remain J because their purpose is governance, not general test
design.

## Testing and delivery

```mermaid
flowchart LR
  TS[java-testing-strategy] --> TD[java-test-design]
  TD --> DB[java-test-doubles]
  TD --> TDD[tdd]
  TD --> LT[java-legacy-code-testing]
  TS --> QG[quality-gates]
  REQ[requirements-and-acceptance] --> FE[feature-engineering]
  FE --> DISC[feature-discovery]
  DISC --> CTX[feature-context-analysis]
  CTX --> DEC[feature-decision-analysis]
  DEC --> PLAN[feature-implementation-plan]
  PLAN --> EXEC[feature-execution]
  EXEC --> READY[feature-readiness-review]
  READY --> REVIEW[code-review]
```

Ownership: K decides what and how to test. L controls work sequencing, authority, evidence and
delivery gates. Domain-specific concurrency/distributed/performance tests cross-reference K but
retain the semantics of their owning domain.

## Data access cost path

```mermaid
flowchart LR
  DS[data-source-patterns] --> RP[repository-pattern]
  RP --> OF[orm-fetch-and-batching-performance]
  OF --> SQL[sql-query-performance]
  SQL --> CP[connection-pool-sizing]
  ET[enterprise-transactions] --> OF
  OCC[offline-concurrency-control] --> SQL
  CP --> LQ[littles-law-and-queueing]
```

Ownership: I owns the conceptual pattern; M owns statement count, execution plan and pool cost. A
future database-contention skill belongs M only if it remains an application-performance diagnosis
rather than restating transaction patterns.

## High-risk hubs

Changes to these skills deserve extra cross-reference review because many workflows depend on
their definitions: `performance-methodology`, `failure-models`, `littles-law-and-queueing`,
`latency-statistics`, `gof-pattern-thinking`, `java-memory-model`, `jvm-memory-regions`,
`layering-and-boundaries`, `delivery-semantics`, `idempotency`, `timeouts-and-deadlines` and
`skill-engineering`.
