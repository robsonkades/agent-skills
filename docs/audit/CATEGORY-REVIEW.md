# Category-level coverage review

**Date:** 2026-09-03. The taxonomy is mutually exclusive: each of the 258 skills has one owner.
Coverage measures breadth of the domain; depth measures treatment inside existing skills; expert
readiness measures whether an agent can make a production decision rather than recite concepts.

## A — JVM Memory and Garbage Collection

**Scope:** allocation, reachability, heap/non-heap/native regions, collectors, safepoints, pauses,
leaks, dumps and memory-pressure diagnosis.

**Coverage:** 19 skills cover allocation profiles, region budgets, object footprint, metaspace,
off-heap memory, G1, ZGC, Shenandoah, Epsilon, pause attribution, safepoints, heap/core analysis
and collector selection/tuning. **Depth:** collector mechanisms and operational evidence are among
the strongest areas in the marketplace. **Duplication/boundary:** GC log interpretation remains A
because its result is a memory/collector diagnosis; generic recording and profiler selection remain
C. JIT escape analysis remains B; A observes the allocation that survives.

**Principal knowledge added:** live-set versus allocation-rate reasoning, concurrent-cycle
headroom, container/native budgets, humongous allocation, remembered-set/barrier cost, TTSP versus
GC pause, safe capture and evidence-specific remediation.

| Coverage | Depth | Expert readiness | State  |
| -------: | ----: | ---------------: | ------ |
|      9.2 |   9.7 |              9.5 | Strong |

**Gap:** dedicated Serial/Parallel GC operational treatment is useful for small heaps and batch
throughput, but lower priority than the collectors most services operate.

## B — JVM Execution and Compilation

**Scope:** bytecode, linking/loading/initialization, interpreter and compilation tiers, inlining,
escape analysis, deoptimization, code cache, assembly, AOT/native image and native interop.

**Coverage:** 17 skills form a complete path from class file through C2/Graal decisions and
machine code, plus startup/CDS/CRaC/Leyden, Native Image, JNI/FFM and JDK upgrades. **Depth:** the
review distinguishes product versus debug builds, speculative optimization versus proof, and API
versus implementation behavior. **Duplication/boundary:** B owns what the runtime does; C owns how
profiles/benchmarks establish its cost. Allocation outcome routes to A; the optimization that
eliminates it stays B.

**Principal knowledge added:** tier transitions, uncommon traps, code-cache pressure, directive
files, assembly pattern recognition, FFM lifetime/native-access constraints, reachability metadata,
closed-world trade-offs and upgrade rollback.

| Coverage | Depth | Expert readiness | State  |
| -------: | ----: | ---------------: | ------ |
|      9.2 |   9.7 |              9.5 | Strong |

**Gap:** no critical missing skill; invokedynamic and JPMS are appropriately embedded in bytecode,
reflection/method-handle and class-loading skills.

## C — Measurement, Profiling and Observability

**Scope:** trustworthy measurement, profiling, JFR, logging, metrics, tracing, SLOs, latency
statistics, benchmarks/load tests, queueing, capacity and production diagnosis.

**Coverage:** 29 skills cover the full investigation lifecycle from evidence capture and tool
selection to statistical comparison, capacity forecasts and regression gates. **Depth:** strong
experimental-design and observer-effect treatment. **Duplication/boundary:** C owns the instrument,
method and inference; A/B/D/E/F own the diagnosed mechanism. `architecture-and-performance` is C
because it provides causal measurement across paths, not architecture governance.

**Principal knowledge added:** coordinated omission, histogram aggregation limits, tail
decomposition, burn-rate alerts, cardinality economics, sampling cost, open/closed workload models,
USL/model falsification and reversible production capture.

| Coverage | Depth | Expert readiness | State  |
| -------: | ----: | ---------------: | ------ |
|      9.6 |   9.6 |              9.5 | Strong |

**Gap:** thresholds and instrumentation budgets are necessarily service-specific; no new skill is
needed.

## D — Concurrency and Parallelism

**Scope:** in-JVM memory ordering, locks/atomics, executors, task lifetime, virtual threads,
structured concurrency, reactive pipelines, cancellation, contention and liveness.

**Coverage:** 23 skills span JMM proofs through practical executor/reactive/virtual-thread
selection and diagnostics. **Depth:** exact happens-before reasoning, structured cancellation and
saturation behavior now replace API-only advice. **Duplication/boundary:** D ends at one JVM. F
begins when coordination crosses a process boundary. `blocking-and-nonblocking-io` stays D because
its primary question is execution model; kernel mechanisms route to E.

**Principal knowledge added:** ownership of cancellation, carrier versus native pinning,
ThreadLocal/scoped-value propagation, boundedElastic semantics, demand translation, CAS contention,
false-sharing proof and shutdown invariants.

| Coverage | Depth | Expert readiness | State  |
| -------: | ----: | ---------------: | ------ |
|      9.4 |   9.6 |              9.4 | Strong |

**Gap:** preview concurrency APIs require continuing version maintenance, not a new skill.

## E — Platform, OS and Hardware

**Scope:** Linux/kernel/cgroups, CPU caches/NUMA, scheduling, TCP and byte movement, Kubernetes
runtime behavior, resource isolation and sidecar composition.

**Coverage:** 11 skills deeply cover containers, CPU/NUMA, TCP, io_uring/zero-copy, serialization,
Kubernetes lifecycle and the sidecar family. **Depth:** evidence interpretation and operational
failure modes are strong. **Duplication/boundary:** E explains underlying behavior; C explains how
to design the measurement. D owns scheduling/execution abstractions inside Java; E owns the kernel
and hardware consequences.

**Principal knowledge added:** cgroup-v2 event evidence, throttling/PSI, page residence versus
remote access, coherent native-transport fallback, QoS/Pod-level resources, socket option and
ephemeral-port qualification, native sidecar ordering and per-replica resource economics.

| Coverage | Depth | Expert readiness | State                        |
| -------: | ----: | ---------------: | ---------------------------- |
|      8.7 |   9.4 |              9.3 | Uneven breadth, expert depth |

**Gap:** filesystem, block-storage, page-cache/writeback and storage-latency diagnosis deserve a
separate skill.

## F — Distributed Systems and Messaging

**Scope:** cross-process failure/consistency, replication/partitioning, caches, messaging,
streaming, retries/timeouts, idempotency, coordination, transactions and recovery.

**Coverage:** 37 skills cover the failure model through concrete resilience, data topology,
messaging and streaming choices. **Depth:** mature treatment of partial failure, ambiguous outcome
and operability. **Duplication/boundary:** in-JVM concurrency remains D. F owns semantic guarantees;
technology-specific performance measurement routes to C and data access cost to M.

**Principal knowledge added:** end-to-end attempt budgets, fencing, quorum assumptions, delivery
claim decomposition, poison-message operations, resharding windows, hot-key repair, convergence,
reconciliation and partial-result contracts.

| Coverage | Depth | Expert readiness | State  |
| -------: | ----: | ---------------: | ------ |
|      9.5 |   9.5 |              9.4 | Strong |

**Gap:** service discovery/DNS behavior is partly distributed across routing and platform skills;
it does not yet justify a standalone skill.

## G — Java Language Craftsmanship

**Scope:** types, contracts, APIs, immutability/encapsulation, exceptions/nulls, smells/refactoring,
design principles, security basics and modern Java features.

**Coverage:** 31 skills cover the core language/design decisions a production Java review needs.
**Depth:** recommendations now include compatibility, failure and migration costs rather than style
preference. **Duplication/boundary:** G owns general design forces; H owns GoF pattern vocabulary.
Enterprise business/data organization remains I.

**Principal knowledge added:** semantic versioning of APIs, equality/numeric/text edge cases,
serialization hardening, resource ownership, reflection/module constraints, collection/stream
semantics, staged refactoring and security trust boundaries.

| Coverage | Depth | Expert readiness | State  |
| -------: | ----: | ---------------: | ------ |
|      9.3 |   9.4 |              9.3 | Strong |

**Gap:** cryptography/TLS could expand the existing security skill if demand proves sufficient;
creating a thin separate skill now would fragment ownership.

## H — Design Patterns (Gang of Four)

**Scope:** all 23 GoF patterns, modern Java interpretations, selection, confusion, misuse,
combinations and refactoring toward/away from patterns.

**Coverage:** 28 skills cover all patterns plus five meta-skills. **Depth:** force-based decisions,
lookalikes, modern language alternatives and removal criteria are explicit. **Duplication/boundary:**
object-level GoF patterns stay H; distributed analogies route to F; PoEAA patterns stay I.

**Principal knowledge added:** concurrency/distribution consequences, pattern combinations,
accidental-pattern detection, framework-provided alternatives and the economic point at which a
pattern becomes ceremony.

| Coverage | Depth | Expert readiness | State               |
| -------: | ----: | ---------------: | ------------------- |
|     10.0 |   9.4 |              9.3 | Complete and strong |

**Gap:** none requiring a new skill.

## I — Enterprise Application Architecture

**Scope:** PoEAA organization of domain logic, service/web/data-source layers, transactions,
repositories, mapping, identity, concurrency control and representations.

**Coverage:** 21 skills cover the enterprise pattern system rather than isolated definitions.
**Depth:** transaction/identity/fetch boundaries and modernization consequences are explicit.
**Duplication/boundary:** I owns application structure; J owns governance/evolution. I owns data
access concepts; M owns their runtime cost.

**Principal knowledge added:** consistency and transaction scopes, identity-map/unit-of-work
interaction, mapping inheritance, framework coupling, anaemic/god-service diagnosis, remote DTO
evolution and architecture tests.

| Coverage | Depth | Expert readiness | State  |
| -------: | ----: | ---------------: | ------ |
|      9.5 |   9.4 |              9.3 | Strong |

**Gap:** no critical missing skill; CQRS is covered where it interacts with query objects,
event-sourcing and distribution rather than duplicated as a label-only package.

## J — Architecture Governance and Evolution

**Scope:** characteristics, decisions/ADRs, fitness functions, constraints, coupling, governance,
modularization, migration, modernization and technical debt.

**Coverage:** 11 skills cover decision formation through automated enforcement and staged change.
**Depth:** strong falsifiability, economics and rollback. **Duplication/boundary:** J records and
evolves intent; I supplies the application structures being governed. Architecture testing stays J
when it enforces architectural characteristics, while general test design stays K.

**Principal knowledge added:** characteristic prioritization, quantum/coupling measures, ADR
expiry/falsifiers, fitness-function failure policy, release boundaries, strangler sequencing,
rollback and debt option value.

| Coverage | Depth | Expert readiness | State  |
| -------: | ----: | ---------------: | ------ |
|      9.3 |   9.5 |              9.4 | Strong |

**Gap:** organizational governance thresholds are intentionally local; use overlays rather than a
new generic skill.

## K — Testing

**Scope:** test-level selection, unit/integration/component/contract/E2E strategy, doubles,
testability, determinism, property/mutation/concurrency/performance/failure testing.

**Coverage:** six broad skills provide a strong testing spine, especially level selection, doubles,
legacy seams, TDD and gates. Domain-specific concurrency/distributed/performance test mechanics
remain with their domains and are cross-referenced. **Depth:** expert within present scope.
**Duplication/boundary:** K owns test design; L owns workflow/gates around delivery. Architecture
fitness enforcement remains J.

**Principal knowledge added:** risk-based portfolios, sociable versus solitary tests, double
contract limits, brittleness symptoms, deterministic clocks/randomness, mutation-test economics and
legacy characterization seams.

| Coverage | Depth | Expert readiness | State             |
| -------: | ----: | ---------------: | ----------------- |
|      8.5 |   9.4 |              9.3 | Narrow but strong |

**Gap:** inter-service API/event contract testing deserves dedicated treatment.

## L — Engineering Process and Delivery

**Scope:** requirements, decomposition, workflow, review/debugging, estimation, communication,
standards, agent discipline, validation, change management and feature delivery.

**Coverage:** 22 skills include a complete feature-engineering workflow plus general review,
debugging, communication and delivery practices. **Depth:** authority, provenance and completion
evidence are explicit. **Duplication/boundary:** K decides tests; L decides when and how work passes
delivery gates. Technical domain methods are delegated to their owning categories.

**Principal knowledge added:** uncertainty ranges, decision authority, reversible task ordering,
risk registers, readiness/completion gates, resumable evidence dossiers and agent-safe scope.

| Coverage | Depth | Expert readiness | State  |
| -------: | ----: | ---------------: | ------ |
|      9.5 |   9.4 |              9.3 | Strong |

**Gap:** project-specific commands and ownership belong in repository overlays, not generic skills.

## M — Data Access Performance

**Scope:** SQL plans/indexes/query shape, ORM statement/fetch/batch behavior, round trips,
connection-pool sizing and application-side transaction/locking cost.

**Coverage:** three dense skills own the statement, ORM and pool layers. **Depth:** measurement and
decision quality are expert. **Duplication/boundary:** PoEAA repositories/mappers/unit-of-work stay
I; M quantifies their database cost. Distributed database guarantees stay F.

**Principal knowledge added:** selectivity/statistics/sargability, pagination and plan instability,
N+1 mechanism selection, persistence-context growth, batch preconditions, queueing-based pool
sizing and leak/saturation diagnosis.

| Coverage | Depth | Expert readiness | State             |
| -------: | ----: | ---------------: | ----------------- |
|      8.4 |   9.5 |              9.4 | Narrow but strong |

**Gap:** lock waits, isolation anomalies and transaction contention from the application-performance
perspective warrant a separate skill without duplicating I's conceptual transaction patterns.

## Overall category assessment

No category is underdeveloped in depth after review. E, K and M have the clearest breadth gaps.
H is structurally complete. A–D and F are the deepest technical clusters; I–L now match them in
decision quality even where performance is not the central subject.
