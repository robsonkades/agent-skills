# Catalog review — 2026-09-19

Escopo autorizado: todas as **275 skills**, em rodada independente da revisão anterior.
Árvore inicial limpa no commit `37b054b935ef9a38c317b05d2bb09b9bbfb9dba6`. Retomada autorizada em 2026-09-22.

**Concluídas e validadas: 275/275.** Implementadas aguardando integração: 0.
Em revisão: 0. Pausadas: 0. Pendentes: 0. Bloqueadas: 0.

**Revisão encerrada:** 264 skills atualizadas e 11 mantidas após revisão. Índice regenerado; verificação completa aprovada, com 355 testes em 67 suítes e zero falhas ou testes ignorados.
Alterações disponíveis na árvore de trabalho, sem commit ou publicação.

Vinte agentes customizados `skill-reviewer` foram criados na sessão de retomada.
Cada skill teve um responsável exclusivo; `skill-engineering` foi revisada por último, isoladamente.
O coordenador inspeciona as entregas, regenera o índice e verifica a integração após os escritores pararem.

O [registro estruturado](catalog-review-2026-09-19.json) preserva achados, versões, arquivos, fontes, verificações e limitações.
O [registro comportamental](catalog-review-2026-09-19-evaluation.json) preserva as respostas, critérios, comparações e limites das avaliações executadas.
Casos escritos, testes de mecanismos e avaliações de agentes são evidências distintas. Não foi estabelecido ganho causal ou superioridade.

## Skills concluídas

1. **adapter-sidecar-pattern — validada.** 2.3.1 → 2.3.2.
   Gate scrape-time collection on non-destructive source reads and bounded load. Define delta/read-reset ownership, replay, accumulator lifetime and loss limits. Distinguish histogram time accumulation from cumulative bucket boundaries and give a semantic fixture. Label shipped evaluation cases as exposed teaching resources, including restricted-treatment disclosure.
   Validação local: passed; integração: passed.
   Limites: promtool unavailable; exposition parser and deployment not executed. Written teaching cases are not independently executed evaluations. No comparative superiority or causal behavioral improvement measured.

2. **allocation-profiling — validada.** 2.1.2 → 2.1.3.
   Check JFR recording loss without treating lost recording-buffer bytes as application allocation. Document async-profiler 4.1 live-sample actual-size units and finite tracking capacity. Separate measured heap-allocation reduction from native memory, retention and lifecycle costs. Declare off-heap-memory handoff and clarify exposed teaching-case evaluation limits.
   Validação local: passed; integração: passed.
   Limites: async-profiler runtime unavailable on this Windows environment; tagged4.1 source inspected. Isolated buffer measurements demonstrate the exercised accounting distinction, not production savings. No controlled no-skill/original/revised comparison executed.

3. **ambassador-pattern — validada.** 1.3.2 → 1.3.3.
   Separate authoritative logical-shard ownership from replica health and proxy host hashing. Keep failover/retries within endpoints authorized for the shard and operation. Separate socket address, HTTP authority, SNI and verified certificate identity with explicit proxy mode. Add hostile wrong-shard/wrong-name/forged-authority teaching cases and disclose evaluator exposure.
   Validação local: passed; integração: passed.
   Limites: Envoy sources are 1.40 development documentation; deployed-version compatibility remains required. No actual proxy configuration/runtime exercised. Response actors share filesystem; separation is procedural. No measured causal improvement or superiority.

4. **architecture-and-performance — validada.** 1.3.1 → 1.3.2.
   Distinguish direct mapper savings from indirect connection-occupancy and queue effects. Qualify traces by actual completion dependencies, clocks and sampling population. Clarify exposed teaching-case methodology.
   Validação local: passed; integração: passed.
   Limites: No application benchmark or independent response evaluation; Java snippets unchanged.

5. **architecture-characteristics — validada.** 1.2.1 → 1.2.2.
   Preserve measurement boundary, workload population, clock and statistical meaning in quality scenarios. Prioritize concrete scenarios without averaging away obligations under a shared attribute. Separate stakeholder agreement from evidenced technical feasibility.
   Validação local: passed; integração: passed.
   Limites: No behavioral actor execution or executable Java changes. Full ISO normative text unavailable; some SEI PDF fetches failed, accessible primary HTML supports additions.

6. **architecture-coupling-and-quanta — validada.** 1.1.2 → 1.1.3.
   Preserve all-of, any-of and quorum completion requirements instead of inferring independence from single-peer outages. Qualify dependency evidence by warm serving, cold start, recovery and expiry horizon. Keep analytical dependency notation separate from quantum-count and measured availability claims.
   Validação local: passed; integração: passed.
   Limites: Written cases7–8 not executed; no live fault or independent behavioral tests.

7. **architecture-decision-making — validada.** 2.1.2 → 2.1.3.
   Separate ADR acceptance, effective scope/cohort and actual rollout under local lifecycle policy. Preserve transition guidance and detect incompatible accepted successors without newest-date assumptions. Disclose restricted-resource evaluation treatment.
   Validação local: passed; integração: passed.
   Limites: Cases8–9 documented only; no executable snippet changes. Local lifecycle guidance is conditional, not a universal normative standard.

8. **architecture-fitness-functions — validada.** 1.3.1 → 1.3.2.
   Bind evidence to the actual artifact/revision, rule configuration and selected population. Distinguish skipped-job success from an executed passing control. Allow justified reuse of evidence when relevant inputs, coverage and validity remain equivalent.
   Validação local: passed; integração: passed.
   Limites: No real CI/scanner/ArchUnit integration. Two revised-skill response cases passed using a reused support thread; no baseline comparison, natural-activation measurement or causal improvement claim.

9. **architecture-refactoring-paths — validada.** 1.4.1 → 1.4.2.
   Require an explicitly compatible rollback artifact and prepare-before-new-write semantics. Define write-authority transfer using drainage/fencing/reconciliation and resumed-old-writer checks. Treat shipped answer cases as exposed teaching resources.
   Validação local: passed; integração: passed.
   Limites: No live migration/fault/behavioral tests or executable Java examples. Full Chubby PDF retrieval failed; verified HDFS source used for published authority claim.

10. **architecture-testing — validada.** 1.3.2 → 1.3.3.
    Distinguish nonempty class import from complete coverage of required modules. Require build-derived module inventory, presence checks and missing-module negative control. Preserve complete shipped treatment and disclose resource restrictions/evaluation isolation.
    Validação local: passed; integração: passed.
    Limites: Java snippets unchanged and historical example record not rerun. Partial-classpath teaching variant documented; no fresh behavioral actor run.

11. **architecture-trade-off-analysis — validada.** 1.2.2 → 1.2.3.
    Correct ATAM sensitivity to require an architectural property critical to a quality response; tradeoff points require sensitivity for multiple attributes.
    Validação local: passed; integração: passed.
    Limites: No agent behavioral run or research reproduction; no executable Java examples.

12. **async-profiler-advanced — validada.** 1.3.2 → 1.3.3.
    Use recorded JFR ActiveSetting evidence to identify the primary CPU engine. Document live engine prerequisites, finite reference tracking and actual-size weights, plus explicit live conversion. Preserve meaningful converter-filter fixture and identify teaching-case exposure. Coordinator aligned direct retention/root handoffs with heap-dump-analysis.
    Validação local: passed; integração: passed.
    Limites: No live capture, controller-loss/overhead trial or behavioral comparison. Converter probe uses synthetic live samples; it does not establish production retention coverage.

13. **blocking-and-nonblocking-io — validada.** 1.3.2 → 1.3.3.
    Separate retained native carriers from explicit compensation hooks; correct buffered-file assumptions for OpenJDK25. Remove the virtual-thread timer helper from carrier counting. Correct BlockHound coordinates and event-loop readiness/thread-affinity explanation. Qualify native offloading by caller frame and bounded admission.
    Validação local: passed; integração: passed.
    Limites: No runtime I/O/JNI/BlockHound or behavioral agent tests; executable snippets unchanged. JEP491 page returned403; tagged source and Oracle docs available.

14. **c2-sea-of-nodes — validada.** 1.4.3 → 1.4.4.
    Distinguish value/control/memory semantics from required/precedence input taxonomy. Explain Region/Phi and MergeMem alias-slice interpretation without memory-copy or happens-before claims. Require compilation/phase identity before inferring allocation elimination from graph-node absence. Correct -XX:-Inline experiment semantics and develop-only InlineAccessors startup rejection.
    Validação local: passed; integração: passed.
    Limites: No performance benchmark, debug IR capture or behavioral comparison. Runtime observations apply to the exercised Temurin build.

15. **cache-sharding-and-replication — validada.** 1.3.3 → 1.3.4.
    Calculate loss of usable cache access across coverage/quorum policies before origin fallback demand. Describe empty persistence-disabled Redis primary restart propagating an empty dataset to replicas. Distinguish adding shards from eligible replica reads for hot keys. Judge proxy overhead against cache-hit and end-to-end latency budgets.
    Validação local: passed; integração: passed.
    Limites: No real Redis failure experiment or benchmark. Revised skill only, reused support thread, procedural shared-workspace separation. Cases supplied by reviewer and not held out; no baseline comparison.

16. **caching-strategies — validada.** 1.2.2 → 1.2.3.
    Account for refresh, warming, retries and miss coalescing separately from cache-hit ratio. Separate cache-key isolation from current authorization, revocation and advice-order contracts. Bound distinct-key loader concurrency and queueing separately from entry count/weight and same-key coalescing. Require hostile warm-hit revocation/tenant checks and admission tests with a blocked origin.
    Validação local: passed; integração: passed.
    Limites: No Java11 runtime; --release11 compilation does not establish runtime11 behavior. No real Spring advice-chain/Redis deployment or agent behavioral comparison. Mechanism probes do not establish a target application's security or load contract.

17. **cancellation-and-interruption — validada.** 1.1.2 → 1.1.3.
    Require operation-owner policy before bridging caller cancellation to shared work. Explain shared orTimeout mutation and HTTP-derived/copy future exchange cancellation authority. Use caller-local base-future relay while preserving ownership, late-failure observation and cleanup. Bound abort hooks and dispatch, including admission, starvation, rejection and escalation; route graph/view construction to completablefuture-composition.
    Validação local: passed; integração: passed.
    Limites: No Java17 runtime execution or database/native/provider-general cancellation validation. Saturated/rejected abort dispatcher cases prepared, not executed. No agent behavioral comparison; mechanism checks support only exercised contracts.

18. **capacity-planning — validada.** 1.3.2 → 1.3.3.
    Treat generator/measurement saturation as a measurement ceiling, not a failing service-capacity upper boundary. Preserve valid delivered-load observations and require service evidence before reporting a capacity bracket. Require compatible classic-histogram schemas or valid common-boundary coarsening with explicit resolution limits.
    Validação local: passed; integração: passed.
    Limites: promtool unavailable; no PromQL engine execution. Three generator-bound, valid-service-failure and mixed-schema behavioral cases prepared, not executed. No Java examples changed or service capacity benchmark executed.

19. **cascading-failures — validada.** 1.3.2 → 1.3.3.
    Bound active work and waiter admission separately; timed semaphore acquisition does not bound waiter count and blocks event-loop callers. Keep aggregate retry budgets and per-request attempt/deadline caps together. Use observations and discriminating evidence for capacity-loss cascades with no retries or unbounded queues. Remove exact 100% utilization/full-timeout prerequisites for intervention.
    Validação local: passed; integração: passed.
    Limites: AWS queue-backlog source redirected without extractable text; no new conclusion relies on it. Five behavioral cases prepared, not executed. No runtime load/fault-injection tests or agent comparisons.

20. **circuit-breakers — validada.** 1.3.2 → 1.3.3.
    Derive effective count-window and half-open minimum samples, including early recovery with probes pending. Explain OR composition of recording classes/predicate and ignore precedence. Separate recordResult health accounting from original caller-visible result and exception-only fallback. Add discriminating assertions for sample boundaries and returned-result behavior.
    Validação local: passed; integração: passed.
    Limites: No Spring/reactive integration, live HTTP, timers or load tests. Four agent scenarios prepared, not executed. No Java21 runtime available; compilation compatibility and Java25 execution are distinct.

21. **clean-delivery-workflow — validada.** 1.1.2 → 1.1.3.
    Condition rename safety on dynamic, persisted and external contracts beyond compiler-visible references. Check effective timeout applicability; HikariCP idleTimeout depends on minimumIdle below maximumPoolSize. Allow authorized incident mitigation before reproduction while keeping cause and permanent-fix validation open. Define recovery by migration phase and distinguish architecture comparison from ADR recording.
    Validação local: passed; integração: passed.
    Limites: Five reproducible behavioral cases prepared, not executed. No runtime, benchmark or comparative agent evaluation.

22. **code-cache-segments — validada.** 2.1.2 → 2.1.3.
    Separate fallback already present in JDK17 from sweeper removal in JDK20. Match measured25.0.3+9 sizing to alignment-up and explicit-total adjustment rather than GA arithmetic. Identify PrintCodeCacheExtension as debug-only and distinguish fallback attempt from success. Correct epoch versus GC-cycle accounting and distinguish temporal aging from retired off-stack code. Treat JITRestart as a restart attempt; require current state, counter delta and successful work initiated after transition. Keep oscillation/thrashing causal diagnosis conditional on compilation, unloading and demand evidence.
    Validação local: passed; integração: passed.
    Limites: No debug JVM, actual exhaustion/permanent-shutdown reproduction, benchmark or agent behavioral comparison. Five reproducible agent scenarios prepared, not executed. Independent reachability audit establishes a source-code path, not production frequency.

23. **code-review — validada.** 1.0.2 → 1.0.3.
    Choose review depth from affected contracts, invariants and relevant coverage rather than a refactor label or green suite. Distinguish repeated mechanical feedback from contextual preferences before proposing automation. Declare 18 existing specialist suggestions while retaining the quality-gates dependency.
    Validação local: passed; integração: passed.
    Limites: Three behavioral cases prepared, not executed; no agent comparison. No executable examples changed.

24. **coding-agent-discipline — validada.** 1.0.2 → 1.0.3.
    Attribute personal execution, inspected CI/cache evidence and collaborator reports to their actual sources and checked inputs. Limit no-reference conclusions to search coverage, including default exclusions and dynamic/external consumers. Allow a controlled equivalent-defect negative control with a narrowly stated result, without claiming historical reproduction. Redact sensitive failure excerpts and declare seven existing handoffs.
    Validação local: passed; integração: passed.
    Limites: Five behavioral cases prepared, not executed. No runtime, mutation run or agent comparison; no executable examples changed.

25. **collaborative-feature-definition — validada.** 1.1.2 → 1.1.3.
    Separate functional delivery acceptance from evidence that the expected benefit occurred, preserving explicit outcome obligations. Distinguish accepted snapshot submission with validation Not run from independent next-stage readiness approval. Keep current-stage blockers unresolved unless the documented gap and accountable acceptance contract applies.
    Validação local: passed; integração: passed.
    Limites: Three behavioral cases prepared, not executed. Official EBM HTML blocked by JavaScript challenge; official May2024 PDF pages5–7 consulted. No executable example added; no Java compile or benchmark needed.

26. **compilation-and-inlining-logs — validada.** 2.0.2 → 2.0.3.
    Distinguish compilation-attempt headers and inlining decisions from successful installation. Document missing COMPILE SKIPPED bailout records in examined unified logging and require outcome correlation. Treat Compiler.codelist as a current snapshot rather than complete compilation history.
    Validação local: passed; integração: passed.
    Limites: No agent behavioral evaluation or production benchmark; prepared cases remain unexecuted. Other runtimes and live jcmd mutation not tested. JDK-8366118 tracker inaccessible; broader release history not reverified.

27. **completablefuture-composition — validada.** 1.2.2 → 1.2.3.
    Explain that either-stage operators do not guarantee first successful completion. Clarify caller relay cancellation isolation versus inline execution and rejection handling. Bound retained observers and operation lifetime; preserve separate shared-resource ownership and cleanup contracts.
    Validação local: passed; integração: passed.
    Limites: No Java17 runtime or real HttpClient/network probe; provider behavior used a controlled subclass. Four behavioral scenarios prepared, not executed as agent evaluations.

28. **component-and-release-boundaries — validada.** 1.2.2 → 1.2.3.
    Replace mandatory duplication from permitted divergence with maintenance, autonomy, correctness and support trade-offs. Condition domain-rule divergence on ownership and reasons for change. Verify published metadata and separate consumer compile/runtime dependencies; explain API exposure, mediation and compatibility limits of convergence/BOMs/locks.
    Validação local: passed; integração: passed.
    Limites: No Maven/Gradle publication or resolution execution; probes establish Java classpath/linkage mechanisms. No Java11 runtime or behavioral agent comparison; three scenarios prepared. Gradle current docs identified9.7.1; pinned8.14.3 page unavailable.

29. **concurrency-diagnostics — validada.** 1.3.2 → 1.3.3.
    Explain that Java25 JSON monitor tokens are class-plus-identity-hash strings, allowing collisions across distinct live objects. Require corroboration before inferring unique lock ownership or a cycle while preserving supported runtime detector findings.
    Validação local: passed; integração: passed.
    Limites: Probe demonstrates token ambiguity, not a reproduced false cycle. Two agent scenarios prepared, not executed. jq unavailable; existing jq examples not executed. JEP491 source returned403; other applicable sources consulted.

30. **concurrency-limiting-and-bulkheads — validada.** 1.3.3 → 1.3.4.
    Make timed permit acquisition's blocking behavior explicit and preserve event-loop/completion-executor progress. Tie a streaming HTTP exchange's lease to body consumption and cleanup, including handoff failure, rather than response-future completion.
    Validação local: passed; integração: passed.
    Limites: No Java11 runtime execution, benchmark or comparative agent evaluation. Two response cases prepared, not executed.

31. **concurrency-testing — validada.** 1.1.2 → 1.1.3.
    Preserve worker and teardown failures with grouped assertions and a shared wait deadline. Check the intended StructuredTaskScope failure cause instead of accepting any wrapper failure. Treat carrier timing as screening, require corroboration, and bound retry amplification by policy. Preserve original stress-failure evidence and distinguish random-seed reproduction from OS scheduling.
    Validação local: passed; integração: passed.
    Limites: Manual invocation exercised assertions, not the JUnit engine or @Timeout/@RepeatedTest annotations; child processes had an external30s deadline. No Java21 runtime; four agent scenarios prepared, not executed. Code-example comparison is distinct from a behavioral agent comparison.

32. **concurrent-collections-and-synchronizers — validada.** 1.2.3 → 1.2.4.
    Distinguish CHM atomic callback contracts from skip-list reevaluation and duplicate resource/effect risks. Separate post-await election from the barrier action and its ordering guarantees. Check whether arrivals can execute while other tasks hold workers/resources; distinguish impossible barriers from valid sequential latch completion.
    Validação local: passed; integração: passed.
    Limites: Four behavioral cases prepared, not executed; no comparative improvement claim. No benchmark or rerun of unchanged historical tests. JBS8371740 inaccessible; related PR consulted without asserting backport confirmation.

33. **connection-pool-sizing — validada.** 1.2.2 → 1.2.3.
    Use completed usage count with mean hold time; Hikari acquire timer also counts acquisition timeouts. Make interrupted/unadmitted/outstanding requests' missing metric coverage explicit and distinguish failed SQL from completed connection usage. Treat Little's Law occupancy as observed admitted work, not evidence that a saturated pool satisfies offered demand. Correct L as connection count and L/c as occupied fraction.
    Validação local: passed; integração: passed.
    Limites: No production sizing benchmark or agent comparison; three behavioral cases prepared. Java17 source/API compilation and Java25 execution do not establish a Java17 runtime test.

34. **consensus-and-quorums — validada.** 1.2.2 → 1.2.3.
    Keep voting membership fixed when testing voter failure; distinguish stopping nodes from membership reconfiguration. Calculate intermediate voter/learner availability, including quorum increase during3-to4 expansion. Join fixed-revision snapshot pagination to inclusive r+1 watch and checkpoint only complete applied revisions/batches. Preserve coherent state/checkpoint recovery, replay limits and compaction reconstruction; distinguish stream uniqueness from external-effect guarantees. Bind cached state/checkpoint to cluster/history and watched scope; invalidate on restored history, preserve original snapshot r and distinguish progress from creation responses. Condition reuse of existing database CAS on required guarantees rather than unsupported prevalence claims.
    Validação local: passed; integração: passed.
    Limites: No real consensus cluster, SDK watch or agent evaluation executed; four response scenarios prepared. Quorum enumeration establishes bounded mathematical cases, not a consensus implementation proof. Restore/history correction supported by independent primary-source audit, without runtime recovery experiment.

35. **consistency-models — validada.** 1.3.3 → 1.3.4.
    Explain acquisition-bound routing and outer transaction settings; late primary overrides do not reroute bound connections. Require replica freshness before establishing the data snapshot; existing repeatable-read snapshots do not refresh with server replay progress. Route single-owner transaction design to enterprise-transactions and cross-owner coordination to distributed-transactions-and-sagas.
    Validação local: passed; integração: passed.
    Limites: Recording JDBC connections verified Spring routing, not PostgreSQL replication/snapshot execution. No Java17 runtime or agent comparison; three behavioral cases prepared.

36. **consistent-hashing — validada.** 1.2.2 → 1.2.3.
    Normalize node load against intended capacity shares; equal mean applies only to equal targets. Specify malformed UTF-16 and normalization policies as versioned placement contracts.
    Validação local: passed; integração: passed.
    Limites: No Java16 or Guava runtime execution; existing example bodies unchanged. Two behavioral cases prepared; no actor comparison.

37. **container-awareness — validada.** 1.2.2 → 1.2.3.
    Compare JVM heap and Kubernetes limits in actual bytes; distinguish decimal/binary/milli units. Diagnose memory.high reclaim/throttling with local/ancestor counters without assuming MemoryQoS or causal proof.
    Validação local: passed; integração: passed.
    Limites: Windows JVM probe only; no Linux cgroup or Kubernetes runtime, benchmark or actor evaluation.

38. **continuous-profiling — validada.** 1.3.2 → 1.3.3.
    Align profile numerator and operation denominator to actual process/time/filter coverage. Use ratio of sums for operation-weighted aggregates; constrain fleet extrapolation and missing-cohort bias. Account for joint JFR collection settings and overlapping recording epochs.
    Validação local: passed; integração: passed.
    Limites: No production overhead measurement or agent comparison; three behavioral cases prepared.

39. **coordinated-omission — validada.** 1.3.2 → 1.3.3.
    Separate k6 duration from scheduling and connection clocks; do not add component percentiles. Reconcile JMeter end-of-schedule interruptions with bounded draining. Require stable histogram snapshots and explicit correction/export/recycling ownership.
    Validação local: passed; integração: passed.
    Limites: No k6/JMeter runtime/load test; three behavioral cases prepared, not actor-executed.

40. **cpu-cache-and-numa — validada.** 1.3.2 → 1.3.3.
    Distinguish Parallel GC Eden preferred/local policy from old-generation interleave and observed physical residence. Correct JDK27 compact-header release/default status while keeping JDK25 opt-in behavior version-specific.
    Validação local: passed; integração: passed.
    Limites: No NUMA hardware/PMU benchmark, JDK27 runtime or actor evaluation.

41. **data-source-patterns — validada.** 1.3.2 → 1.3.3.
    Prove JDBC/JPA shared transaction participation instead of relying on the database URL. Specify flush/clear/refresh ordering and their effects on pending entity changes. Preserve the original optimistic token and provider-owned managed @Version; reject fresh-token substitution.
    Validação local: passed; integração: passed.
    Limites: H2 and Java25 runtime only; no actual Java17, production DB, JTA or second-level-cache test. Four behavioral cases prepared, no actor comparison.

42. **database-bulk-loading — validada.** 1.0.2 → 1.0.3.
    Separate round-trip/statement/row costs and conditional client-side work reduction. Validate PostgreSQL identity allocators after COPY without blind reseeding or assuming rollback undoes setval. Explain MySQL REPLACE delete/insert semantics and absent historical FK revalidation. Verify SQL Server enabled versus trusted constraints and budget validation locks.
    Validação local: passed; integração: passed.
    Limites: No database runtime; four behavioral cases prepared, no actor comparison.

43. **database-engine-selection-and-migration — validada.** 1.0.2 → 1.0.3.
    Require demonstrated common data versions for shadow comparisons; applied watermark alone does not freeze query snapshots. Gate cutover and reversal on sequence/identity/ORM allocator readiness and first generated-key writes.
    Validação local: passed; integração: passed.
    Limites: No SQL/CDC/migration runtime; two revised-skill response cases passed in a reused support thread with criteria frozen before dispatch. No original/revised controlled comparison or natural-activation measurement.

44. **database-index-design — validada.** 1.0.2 → 1.0.3.
    Check expression/predicate eligibility, immutable/deterministic contracts and engine-specific session requirements before DDL. Distinguish reverse scans from mixed ordering and require single-valued fixed prefixes. Plan PostgreSQL concurrent index removal around lock waits, transaction/constraint/partition restrictions and recovery.
    Validação local: passed; integração: passed.
    Limites: No database DDL/EXPLAIN/benchmark; three behavioral cases prepared, not actor-executed.

45. **database-performance — validada.** 1.0.2 → 1.0.3.
    Separate server/execute/first-row/full-consumption/mapping timers; displaced fetch work does not prove endpoint improvement. Route manual call amplification/data movement/connection hold scope to architecture-and-performance; synchronize suggests. Distinguish statement analysis from PostgreSQL generic/custom plan mechanism and clarify triage completion.
    Validação local: passed; integração: passed.
    Limites: No database/example runtime or actor execution; four behavioral cases prepared.

46. **debugging — validada.** 1.1.2 → 1.1.3.
    Preserve the same bisect classifier and prove the intended test actually executed; missing/skipped cases are not good revisions. Interpret empty JFR results only within verified event/window/settings coverage; distinguish absent stack, filters, recording loss and positive-control limits.
    Validação local: passed; integração: passed.
    Limites: Synthetic probes establish only exercised mechanisms, not production overhead/coverage or agent improvement. JEP444 retrieval returned403; official virtual-thread documentation used as alternative. No behavioral agent evaluation.

47. **delivery-semantics — validada.** 1.2.2 → 1.2.3.
    Separate poll position from committed progress; require explicit unfinished-work recovery. Commit only the completed delivery-order prefix despite numeric offset gaps; pause only limits intake. Use Kafka4.1 nextOffsets metadata after full batch completion; transactional visibility is not a complete poll envelope.
    Validação local: passed; integração: passed.
    Limites: Mocks only, no broker/rebalance/network-fault/transactional-visibility integration. Java17 compilation target with Java25 runtime; no behavioral agent comparison.

48. **deoptimization — validada.** 2.1.2 → 2.1.3.
    Distinguish old-method metadata/inline-cache invalidation from broad fallback when recording is incomplete. Use redefine+class+nmethod diagnostics; late attachment alone does not imply whole-code-cache invalidation. Qualify fast-throw/JVMTI Action_none hypotheses and diagnostic flag costs while preserving exception contracts.
    Validação local: passed; integração: passed.
    Limites: Observed runtime behavior is limited to Temurin25.0.3+9 isolated probes. Fast-throw conditions source-verified, not a fresh JVMTI exception-delivery runtime probe. No behavioral agent runs, production overhead measurements or causal comparison.

49. **distributed-aggregation-and-barriers — validada.** 1.3.3 → 1.3.4.
    Preserve join multiplicity/build-side semantics and account for existing partitioning. Separate partial population coverage from sketch error bounds. Bind membership and readable selected outputs to the release epoch; preserve logical work across worker replacement. Validate authority with conditional publication and reject stale rebasing; qualify salting by order sensitivity.
    Validação local: passed; integração: passed.
    Limites: No real Spark/S3/distributed recovery or agent behavioral execution. Java16 release compilation ran on Java25; models establish only modeled properties, no causal improvement comparison.

50. **distributed-failure-catalogue — validada.** 1.3.2 → 1.3.3.
    Move timeout reset per hop to timeout stacking; it also fails under synchronized clocks. System.nanoTime values share an origin only within a JVM; align timeout handoff.
    Validação local: passed; integração: passed.
    Limites: No fresh application/service integration or agent behavioral comparison executed; documented cases remain pending.

51. **distributed-locks-and-leases — validada.** 1.3.2 → 1.3.3.
    Azure Append Block supports operation-specific ETag/position/lease conditions; distinguish CAS from authority. Late grant/renewal cannot restart full TTL from response arrival. Redis asynchronous failover may lose ownership before original TTL expires.
    Validação local: passed; integração: passed.
    Limites: No fresh application/service integration or agent behavioral comparison executed; documented cases remain pending.

52. **distributed-systems — validada.** 1.3.2 → 1.3.3.
    Distinguish stale edit concurrency from broker ordering. Condition outlier ejection on observable per-replica failures/capacity. Route freshness-signal design to slo-and-alerting. Preserve retry exception when non-application is established.
    Validação local: passed; integração: passed.
    Limites: No fresh application/service integration or agent behavioral comparison executed; documented cases remain pending.

53. **distributed-systems-testing — validada.** 1.1.2 → 1.1.3.
    Attempt counts alone do not verify backoff/deadline. Use per-operation controlled sequences and histories, not aggregate counts. WireMock reset support has OS caveats; test capabilities rather than assume a strict fault ladder.
    Validação local: passed; integração: passed.
    Limites: No fresh application/service integration or agent behavioral comparison executed; documented cases remain pending.

54. **distributed-tracing-design — validada.** 1.3.2 → 1.3.3.
    Specify intentional HTTP cancellation vs timeout error recording. Clarify messaging creation context, ambient parents/links and send kind. Version exception-event migration to correlated logs at semconv1.44 while preserving target compatibility.
    Validação local: passed; integração: passed.
    Limites: No fresh application/service integration or agent behavioral comparison executed; documented cases remain pending.

55. **distributed-transactions-and-sagas — validada.** 1.3.3 → 1.3.4.
    Persist definition identity and stable step IDs across deployments, not current list positions. Use step-specific durable effect context and stable idempotency keys.
    Validação local: passed; integração: passed.
    Limites: Fixture supplies omitted collaborators; no real persistence/network or Java17runtime; no agent evaluation.

56. **distribution-boundaries — validada.** 1.2.2 → 1.2.3.
    Outbox atomicity needs rollback on serialization/persistence failure, including checked exceptions. Condition local rehearsal/coarsening on actual constraints; local calls can still require schema/contract migration. Inspect target compatibility for partial examples.
    Validação local: passed; integração: passed.
    Limites: No fresh application/service integration or agent behavioral comparison executed; documented cases remain pending.

57. **domain-logic-organization — validada.** 1.3.3 → 1.3.4.
    Choose script/model/mapping by actual invariants and change costs, preserving adequate models. Distinguish Table Module business ownership from set-based SQL gateways. Records are shallowly immutable and inherit component equality, not automatic domain value semantics.
    Validação local: passed; integração: passed.
    Limites: No runtime code tests needed for unchanged snippets; no behavioral agent run.

58. **ebpf-for-jvm — validada.** 2.1.2 → 2.1.3.
    Exact cgroup ID is not subtree scope; account for recreation. Inspect target JVM effective flags rather than launching PATH java for USDT evidence. Separate USDT semaphore activation and JVM enablement; consider ancestor CPU limits.
    Validação local: passed; integração: passed.
    Limites: No BPF/jcmd runtime checks, performance measurements or agent evaluation; no toolchain installed.

59. **engineering-communication — validada.** 1.1.2 → 1.1.3.
    Preserve sample population/window and distinguish deployment from validated recovery. Define discriminating outcomes before timeboxed experiments. Preserve technical rationale while removing personal disagreement comments.
    Validação local: passed; integração: passed.
    Limites: No fresh application/service integration or agent behavioral comparison executed; documented cases remain pending.

60. **enterprise-application-architecture — validada.** 1.2.4 → 1.2.5.
    Route JVM races, one-transaction concurrency and stale edits across transactions separately. Retain adequate projections; condition gateway/keyset/schema changes on evidence and ownership.
    Validação local: passed; integração: passed.
    Limites: No Java/example runtime or agent evaluation.

61. **enterprise-architecture-smells — validada.** 1.2.2 → 1.2.3.
    Session container map safety does not protect mutable attributes or compound updates. Duplicated pure rules can use a shared function without domain-model migration. Stable/consistent code can still have independently demonstrated correctness/security harm.
    Validação local: passed; integração: passed.
    Limites: No fresh application/service integration or agent behavioral comparison executed; documented cases remain pending.

62. **enterprise-base-patterns — validada.** 1.2.2 → 1.2.3.
    Make unexpected stub calls fail; configure valid declines explicitly and validate relevant request arguments. Special Case can retain presentation distinctions while sharing domain operation behavior. Direct constructor mapping requires editable owned types.
    Validação local: passed; integração: passed.
    Limites: Fixture domain support only; no Spring or JDK17runtime integration or agent evaluation.

63. **enterprise-transactions — validada.** 1.3.2 → 1.3.3.
    SERIALIZABLE protects same-transaction read-modify-write, not prior-transaction stale input. Row locks do not protect absent predicates; aggregate lock protocols require common writer participation. Payment retries/compensation need durable effect identity and recovery state. Qualify REQUIRES_NEW physical connection claims by resource acquisition.
    Validação local: passed; integração: passed.
    Limites: No Spring/PostgreSQL runtime tests or agent evaluations; executable snippets unchanged.

64. **epsilon-and-shenandoah-internals — validada.** 2.1.2 → 2.1.3.
    Generational Shenandoah ignores non-adaptive heuristics; flags may retain requested value. Evacuation reserve is not a hard failure boundary when overflow borrowing is enabled. Epsilon pre-touch hints depend on default/unset flag state.
    Validação local: passed; integração: passed.
    Limites: Probes limited to installed build; no benchmark or agent evaluation.

65. **escape-analysis-internals — validada.** 2.0.2 → 2.0.3.
    Eliminated boxing has a distinct eliminate_boxing log and CallStaticJavaNode path. String concatenation depends on compiler target/bytecode, not javac version alone. Lock elimination needs balanced region and policy prerequisites as well as escape state. EA-off allocation comparison should route reproducible partial increases, not only full object sizes.
    Validação local: passed; integração: passed.
    Limites: The eliminate_boxing path is source-verified, not reproduced by runtime probes; no benchmark or agent comparison. Temporary probe artifacts removed.

66. **estimation-under-uncertainty — validada.** 1.1.2 → 1.1.3.
    Separate resource serialization from statistical correlation. Draw a shared risk once and apply distinct impacts without duplicating common wait. Distinguish conditional uncalibrated model intervals from both arbitrary scenarios and calibrated intervals.
    Validação local: passed; integração: passed.
    Limites: Arithmetic establishes illustrative model properties; no calibration study or agent evaluation.

67. **event-driven-architecture — validada.** 1.3.2 → 1.3.3.
    Require consistent snapshot-to-stream handoff and deletion coverage, without overlaying stale state. Include compacted old values in compatibility-horizon inventory.
    Validação local: passed; integração: passed.
    Limites: No distributed runtime, Java changes or behavioral execution.

68. **event-sourcing — validada.** 1.2.2 → 1.2.3.
    Preserve native composite feed cursors rather than reducing to one number. Bind projection rows and checkpoint to generation/feed/definition; isolate rebuilds. Read-your-writes must use the generation/replica/snapshot that includes the watermark. Qualify unsupported blanket bitemporal cost claims.
    Validação local: passed; integração: passed.
    Limites: No Kurrent/PostgreSQL/Spring integration or distributed fencing/failover/cutover test; no agent comparison.

69. **executors-and-task-lifecycle — validada.** 1.3.2 → 1.3.3.
    Separate accepted/enqueued tasks from actual starts and result completion. Diagnose worker creation and hook failures; settle never-started results without bypassing required context.
    Validação local: passed; integração: passed.
    Limites: Java17 runtime not exercised; no behavioral evaluation.

70. **failure-models — validada.** 1.3.2 → 1.3.3.
    Distinguish canceling wait, preventing/cooperatively stopping work, and proof of no effect. Crash-stop alone does not establish previous operation outcome.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

71. **false-sharing-and-contended — validada.** 1.1.2 → 1.1.3.
    False sharing and true contention can coexist; do not require global exclusion. Writer/reader pairs can false-share; two independent writers not required.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

72. **feature-architecture-analysis — validada.** 1.1.2 → 1.1.3.
    Include unchanged dependencies whose use changes semantics even without greater load. Bind evidence to repository revisions and working-tree state; revisit affected findings on drift. Declare existing feature-solution-analysis handoff as suggestion.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

73. **feature-context-analysis — validada.** 1.1.2 → 1.1.3.
    Managed dependency coordinates do not establish inclusion or runtime use; cite module/config/source. F IDs are sourced facts, not verification evidence. Distinguish compiler toolchain, release target, configured and observed runtime.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

74. **feature-contract-definition — validada.** 1.0.2 → 1.0.3.
    Only amend authoritative artifacts under project authority; external guarantees stay attributed/versioned separately from local requirements and sandbox observations.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

75. **feature-decision-analysis — validada.** 1.2.2 → 1.2.3.
    Unknown historical provenance does not invalidate independently documented current acceptance. Record-only requests should record/handoff deviations rather than edit implementation.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

76. **feature-decomposition — validada.** 1.1.2 → 1.1.3.
    Single-resource shortcuts retain stable identity,scope and validation. Allow accepted regression/independent shared-validation scope without inventing product work. Separate implementation dependency cycles from joint validation/release gates.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

77. **feature-discovery — validada.** 1.1.2 → 1.1.3.
    Nonfalsifiable premise is not thereby a requirement. Preserve conflicting source assertions while marking effective proposition unresolved. Tech-feature outcome can improve quality or preserve behavior under new constraints. Scale ledger to material propositions and reuse existing evidence.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

78. **feature-engineering — validada.** 1.1.3 → 1.1.4.
    Readiness with accepted gaps does not establish Required-criterion completion or deployment authority. Align summary depth drivers with material risk and Light prerequisites. Preserve sanctioned redaction with correction trail. Shipped cases are exposed teaching/regression material; unknown authority is U/Q, not accepted GAP.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

79. **feature-execution — validada.** 1.1.2 → 1.1.3.
    Bind test evidence to actual revision/artifact; cross-package dist may need prerequisite builds. Revalidate affected evidence after generators/fixers/hooks change tested inputs, preserving valid caches.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

80. **feature-feasibility-experiment — validada.** 1.0.2 → 1.0.3.
    State experimental unit and uncertainty rule; correlated requests in one run are not independent replication. Inconclusive precision does not prove equivalence or low failure rate; deterministic checks need no artificial statistical ritual.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed. Full ASA DOI article returned HTTP403; official statement accessible. Arithmetic check is not an experiment.

81. **feature-implementation-plan — validada.** 1.1.2 → 1.1.3.
    Separate implementation, validation and release dependencies. Include accepted advancement/stop/recovery criteria without inventing missing thresholds. Optional classification alone does not select or authorize work.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

82. **feature-progress-tracking — validada.** 1.2.2 → 1.2.3.
    CANCELLED must preserve Required commitments like SKIPPED. Git conflict detection does not protect concurrent writers in one shared file. Make sample log provenance/evidence consistent. Give blockers owner/unblock condition and validate answer applicability/authority.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

83. **feature-readiness-review — validada.** 1.2.2 → 1.2.3.
    Fix contradictory criterion/resource/evidence statuses in completion example. Check GAP validity, expiry/reopen and blocked scope, not merely field presence. Remove unsupported claims about review error frequency/exclusivity.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

84. **feature-requirement-clarification — validada.** 1.1.2 → 1.1.3.
    Preserve/supersede changed answers and reopen only affected dependencies. Distinguish material undecided authority from delegated routine choices or isolated fixtures. Use proportionate inline records without mandatory dossier IDs.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

85. **feature-risk-analysis — validada.** 1.2.2 → 1.2.3.
    Default/backfill do not prevent ongoing explicit NULL writes; verify rollout compatibility. Use dossier IDs only when the feature workflow applies.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed. PostgreSQL runtime behavior not newly tested.

86. **feature-scope-analysis — validada.** 1.1.2 → 1.1.3.
    Distinguish obligations from authorized optional additions; track selection source and benefit without inventing requirements or repeated approvals.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

87. **feature-solution-analysis — validada.** 1.1.2 → 1.1.3.
    Analyze material monetary costs even when budget ownership is unknown; record authority gaps separately.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed.

88. **flame-graph-analysis — validada.** 1.4.2 → 1.4.3.
    Correct inclusive/self arithmetic with explicit immediate-child weight and limits of inference. Reconcile sampling rates/probabilities/weights before workload normalization; no generic JFR CPU conversion.
    Validação local: passed; integração: passed.
    Limites: No fresh agent behavioral comparison executed; written cases remain unexecuted. No executable Java added or materially changed. No real profiling performed; numerical checks only.

89. **forkjoinpool-and-work-stealing — validada.** 1.1.2 → 1.1.3.
    Interrupted close initiates shutdownNow and waits active tasks; queued work may be discarded. Version/caller/task-dependent submit wrappers change interruption behavior. Compensation saturation rejection can occur inside already accepted work before block; saturation allowance does not assure progress.
    Validação local: passed; integração: passed.
    Limites: No Java17 execution, benchmark or agent behavioral comparison. Temporary probe artifacts removed.

90. **framework-coupling-and-independence — validada.** 1.2.3 → 1.2.4.
    Separate persistence ownership from one/two object representations. Bean wiring need not use scanning. Library callbacks do not by themselves imply framework lifecycle control.
    Validação local: passed; integração: passed.
    Limites: No agent behavioral evaluation or comparative improvement measured. No executable Java added or materially changed.

91. **g1-concurrent-marking — validada.** 1.3.2 → 1.3.3.
    Distinguish evacuation Allocation/Pinned/both before capacity or IHOP diagnosis. Normal TAMS-filtered liveness does not exclude root scans aboveTAMS or recovery bitmap use.
    Validação local: passed; integração: passed.
    Limites: No agent behavioral evaluation or comparative improvement measured. No executable Java added or materially changed. No evacuation/JNI reproduction or performance benchmark. Launcher/source checks have their stated scope. JEP423 fetch403; pinned sources and Oracle documentation supplied corroboration.

92. **g1-internals — validada.** 1.3.2 → 1.3.3.
    Use explicit debug selectors for required phase/humongous detail. Separate Old retention from threshold-dependent candidate retention; evacuation destination can be Survivor or Old.
    Validação local: passed; integração: passed.
    Limites: No agent behavioral evaluation or comparative improvement measured. No executable Java added or materially changed. No evacuation/JNI reproduction or performance benchmark. Launcher/source checks have their stated scope.

93. **g1-tuning-for-slo — validada.** 2.1.2 → 2.1.3.
    Python correlator counted endpoint-only/empty intersections; require positive-duration overlap. Humongous concerns aligned individual object size rather than retained graph. Update JDK27GA compatibility notes and G1IHOP filter while retaining executed25baseline.
    Validação local: passed; integração: passed.
    Limites: JDK27 checked through official docs/source only, not executed. No load benchmark or repeated historical capture. OpenJDK403 alternatives Oracle/raw sources used. Agent behavioral cases and comparisons not executed; no measured gain claimed.

94. **gc-fundamentals — validada.** 1.4.2 → 1.4.3.
    Promotion compares prior age before increment; survivor exhaustion can promote below threshold. Related JFR safepoint intervals overlap and depend on configuration; coordination contributes to synchronization.
    Validação local: passed; integração: passed.
    Limites: Promotion source-verified; no new object-promotion experiment or GC/JFR capture. Some JEP403 responses resolved by direct fetch. Agent behavioral cases and comparisons not executed; no measured gain claimed.

95. **gc-log-analysis — validada.** 1.4.2 → 1.4.3.
    ThreadAllocationStatistics allocated is cumulative, not interval totals; use same-thread/JVM differences. Preserve decreasing-counter and incomplete coverage limitations; no exact process-wide total.
    Validação local: passed; integração: passed.
    Limites: No agent behavioral evaluation or comparative improvement measured. No executable Java added or materially changed.

96. **gof-abstract-factory — validada.** 1.2.2 → 1.2.3.
    Switch exhaustiveness covers selector cases, not registry completeness or product compatibility. Preserve deliberate non-sealed branches and extensible plugin identifiers instead of forcing closed keys.
    Validação local: passed; integração: passed.
    Limites: No agent behavioral evaluation or comparative improvement measured. No executable Java added or materially changed.

97. **gof-adapter — validada.** 1.3.2 → 1.3.3.
    Domain failures distinguish throttling/connection using typed reasons without vendor-cause policy. Provider monetary encoding requires explicit operation-specific units/precision/range. Recorded fixtures need capture/version/redaction provenance and bounded claims.
    Validação local: passed; integração: passed.
    Limites: No real SDK/provider interaction; fixture C:/Users/robso/AppData/Local/Temp/gof-adapter-review-Yb4H7X retained. No agent behavioral evaluation or measured improvement; --release compilation, when used, ran on JDK25 rather than target baseline runtime.

98. **gof-bridge — validada.** 1.2.2 → 1.2.3.
    Classify roles by independent responsibilities rather than subclass counts. Preserve valid Notifier/Channel composition and distinguish Notification content hierarchy. State stream ownership, capability/null limits and real provider integration work.
    Validação local: passed; integração: passed.
    Limites: Fakes do not validate real providers/network/concurrency/batching/remote cleanup. PDFtext read;screenshotstimeout. Fixture C:/Users/robso/AppData/Local/Temp/gof-bridge-review-pwpEmP retained. No agent behavioral evaluation or measured improvement; --release compilation, when used, ran on JDK25 rather than target baseline runtime.

99. **gof-builder — validada.** 1.2.2 → 1.2.3.
    Whole construction sessions need ownership/locking; synchronized methods alone allow mixed fields. Exclusive safe transfer differs from overlapping lambda use. Early cross-field protocol checks can be valid while final product invariants remain required.
    Validação local: passed; integração: passed.
    Limites: Probe retained: C:/Users/robso/AppData/Local/Temp/gof-builder-review-45325003d4384f79a90dbbd740fa93e2. No Lombok/ORM integration. No agent behavioral evaluation or measured improvement; --release compilation, when used, ran on JDK25 rather than target baseline runtime.

100. **gof-chain-of-responsibility — validada.** 1.2.2 → 1.2.3.
     Explicit list bean does not guarantee collection injected into Spring consumer; construct/test actual owner. Fallbackpresence proves totality, not accepted decisionpolicy; test boundaries.
     Validação local: passed; integração: passed.
     Limites: Direct methods not JUnitengine; jqwik property not executed. No realpayment/distributedsystem. Fixture C:/Users/robso/AppData/Local/Temp/chain-review-cd790a8dad0844e899daa66e7fd8d135 retained. No agent behavioral evaluation or measured improvement; --release compilation, when used, ran on JDK25 rather than target baseline runtime.

101. **gof-command — validada.** 1.2.2 → 1.2.3.
     Request retries recreated command ID/time; preserve issued intent and omitted atomic claim protocol. Records are shallowly immutable; snapshot capture needs consistent ownership and alias control. Label partial framework and Java17/21 fragments with prerequisites.
     Validação local: passed; integração: passed.
     Limites: Stub harness does not validate real transactions, concurrent deduplication, persistence or provider. ExecutedJDK25 not runtime17. Agent behavioral cases and comparisons not executed; no measured gain claimed.

102. **gof-composite — validada.** 1.2.2 → 1.2.3.
     Preserve public structural equality instead of replacing with IDs solely for speed. Single-parent map cannot represent shared DAG parents. Nonnegative exact byte totals reject long overflow via addExact.
     Validação local: passed; integração: passed.
     Limites: No benchmark/concurrency/illustrativepermissions run. No agent behavioral evaluation or measured improvement; --release compilation, when used, ran on JDK25 rather than target baseline runtime.

103. **gof-decorator — validada.** 1.2.2 → 1.2.3.
     Preserve security chain; MVC interceptor path matching does not establish endpoint protection. Successful third retry does not test exhaustion; add persistentfailure boundary. ZeroHTTPcalls do not establish breaker/retry ordering. RestClient example needs Spring6.1+ and declaredAssertJ prerequisites.
     Validação local: passed; integração: passed.
     Limites: Methods invokedreflectively, notJUnitengine; controlled domain/deadline/backoff and modeledbreaker notResilience4j. No actualappwiring/cache/transport/fullsecuritychain; matcherfixture does not prove app exploit. Compiledtarget17 runtime25only. No agent behavioral comparison executed or measured gain claimed.

104. **gof-facade — validada.** 1.2.2 → 1.2.3.
     Per-order limit cannot enforce aggregate credit; invariant needs actual exposure/reservation owner. JPMS requires named-module deployment and constrains unnamedclients too; opens differs from exports.
     Validação local: passed; integração: passed.
     Limites: Factoryfixtures do not establish transactions/persistence/concurrent credit. ExistingSpring/stream/preview examples source-reviewed only. Repro C:/Users/robso/AppData/Local/Temp/facade-review-0e7c71da51e04b7e8fa34ab13ae072e0/check.mjs. No agent behavioral evaluation or measured improvement; --release compilation, when used, ran on JDK25 rather than target baseline runtime.

105. **gof-factory-method — validada.** 1.2.2 → 1.2.3.
     Factory Method need not be invoked by an inherited algorithm; preserve public creation contracts when considering composition. Handle null registry keys before Map.of lookup; retain explicit unknown-key errors without reflection.
     Validação local: passed; integração: passed.
     Limites: Target17 compiled; runtime25 only. Fixture collaborators not realparsing/Spring/concurrency/resources/binarycompatibility; retained C:/Users/robso/AppData/Local/Temp/gof-factory-method-review-bb919b4c036e40149a6d7ff362922f89. PDFfullopen exceededlimit; indexedParticipants and later fullpublisherexcerpt confirmedclaim. No agent behavioral comparison executed or measured gain claimed.

106. **gof-flyweight — validada.** 1.2.2 → 1.2.3.
     HotSpot17 local StringTable weak handles differ from strong application canonical map. WeakHashMap values can strongly retain their own keys; weak keys alone do not bound retention.
     Validação local: passed; integração: passed.
     Limites: No GC timing experiment or benchmark; no changed Java snippets or recompilation. Agent behavioral cases and comparisons not executed; no measured gain claimed.

107. **gof-interpreter — validada.** 1.2.2 → 1.2.3.
     Reject forbidden comparisons before inspecting hidden operator/type metadata; still validate independent branches. Require deeply stable owned and bounded operands despite shallow records. Respect engine cached-accessor lifecycle across security contexts.
     Validação local: passed; integração: passed.
     Limites: No parser/publicserializer/SQL/SpEL runtime or concrete Value implementation exercised; current Springguidance requires targetversion check. No agent behavioral evaluation or measured improvement; --release compilation, when used, ran on JDK25 rather than target baseline runtime.

108. **gof-iterator — validada.** 1.2.2 → 1.2.3.
     Preserve public null contract when choosing copyOf or snapshot versus view. Unknown size must not advertise SIZED; MAX sentinel alone does not override characteristics. Success-only tests can miss timeout mistaken for EOF.
     Validação local: passed; integração: passed.
     Limites: No remote or concurrency test; fixture C:/Users/robso/AppData/Local/Temp/gof-iterator-probe-jx2nDf/Probe.java retained. No agent behavioral evaluation or measured improvement; --release compilation, when used, ran on JDK25 rather than target baseline runtime.

109. **gof-mediator — validada.** 1.2.2 → 1.2.3.
     Distinguish eventloop-confined HashMap from rejected shared ConcurrentHashMap attempt. Compute callbacks cannot modify map; no exception does not prove valid reentry. Durable state/outbox needs workflow resumption owner and deadlines.
     Validação local: passed; integração: passed.
     Limites: Partial snippets not compiled/executed; no distributed recovery test. No agent behavioral evaluation or measured improvement; --release compilation, when used, ran on JDK25 rather than target baseline runtime.

110. **gof-memento — validada.** 1.2.2 → 1.2.3.
     Mutable captures need isolation during restore as well as initial capture. Stale-writer generation must be compared and updated atomically with state, including restores.
     Validação local: passed; integração: passed.
     Limites: No dynamic concurrency test or Java compilation; unchanged snippets. No agent behavioral evaluation.

111. **gof-observer — validada.** 1.2.3 → 1.2.3.
     Revisada sem alterações. Existing lifecycle, concurrency, failure, transaction and recovery guidance adequately covers the inspected contracts; no supported defect justified an edit or bump.
     Validação local: passed; integração: passed.
     Limites: Unchanged partial examples not compiled or integration-tested. No agent behavioral evaluation or measured improvement.

112. **gof-pattern-antipatterns — validada.** 1.2.2 → 1.2.3.
     Disposal must account for captured callbacks separately from membership and collectability. Factory splits preserve cross-call-site compatibility families. Static construction routes to java-object-construction; Factory Method includes external-client calls.
     Validação local: passed; integração: passed.
     Limites: Official COW API read through indexed result after stalled fetch. No executable changes or behavioral runs.

113. **gof-pattern-confusion — validada.** 1.2.2 → 1.2.3.
     Factory Method can be invoked by external clients; an inherited algorithm is optional. Route readers to existing creational comparisons as well as behavioral comparisons.
     Validação local: passed; integração: passed.
     Limites: Unchanged Java17 sketches not compiled; no behavioral evaluation.

114. **gof-pattern-selection — validada.** 1.3.2 → 1.3.3.
     Select hooks by actual interception coverage, ordering and lifecycle rather than transport/domain label. Lambda Strategy may capture state; final references do not establish object immutability or thread safety.
     Validação local: passed; integração: passed.
     Limites: Documentation-only changes; no Spring runtime or behavioral evaluation.

115. **gof-pattern-thinking — validada.** 1.3.2 → 1.3.3.
     Known implementation count does not negate contractual runtime extension. Dependency injection includes manual composition roots without a container.
     Validação local: passed; integração: passed.
     Limites: Java17/21 snippets unchanged and not recompiled; no behavioral evaluation or measured improvement.

116. **gof-patterns-and-distribution — validada.** 1.3.2 → 1.3.3.
     Architecture contracts do not inherently require separate deployments. Do not compare absolute nanoTime deadlines across JVMs; inspect budget propagation. Uniform proxy syntax may preserve a correct remote contract; Facade does not guarantee coarse operations.
     Validação local: passed; integração: passed.
     Limites: No transport integration or executable snippet changes; no behavioral evaluation.

117. **gof-patterns-in-modern-java — validada.** 1.3.2 → 1.3.3.
     Defensive cloning of record array components does not preserve generated content equality. Sealed expansion can retain binary linkage while old switches throw MatchException.
     Validação local: passed; integração: passed.
     Limites: Probes executed onTemurin25.0.3+9, not17/21 runtimes. No agent evaluation.

118. **gof-prototype — validada.** 1.2.2 → 1.2.3.
     Copy merge silently dropped identity-distinct but equals-equal rule keys; registry overwrote equivalent names. Both now reject collisions under explicit String.equals contract. Collection copy guidance now distinguishes owned mutation isolation from equality/comparator/order/cardinality, including TreeMap constructor overload semantics.
     Validação local: passed; integração: passed.
     Limites: Compiled for Java 17, executed on JDK 25; minimal collaborators only. No CMS/persistence/concurrency/performance integration. Collision rejection alone does not validate all map/comparator policies. No agent behavioral evaluation.

119. **gof-proxy — validada.** 1.2.2 → 1.2.3.
     Initializing guard detects same-thread recursion only; factory waiting for another thread needing proxy can form a monitor dependency cycle. Safe publication does not imply bounded/interruptible waiting; documented factory dependency and lifecycle constraints. Self-invocation detection now follows implicit/explicit this and raw-target aliases, checking actual proxy advice and required transaction scope.
     Validação local: passed; integração: passed.
     Limites: --release17 compiled, execution on JDK25.0.3; probes are not agent evaluations or a general concurrency proof. Receiver probe used JDK proxy, not real Spring/Hibernate/transaction configuration. Cycle deliberately unwound by bounded timeout; no deadlocked process left. Probe sources/classes removed; no agent behavioral evaluation.

120. **gof-singleton — validada.** 1.2.2 → 1.2.3.
     Holder choice depends on failure policy, not universal ranking. Class loading differs from active-use initialization and eager/holder creation timing. Direct prototype injection into singleton retains one instance and requires explicit cleanup ownership.
     Validação local: passed; integração: passed.
     Limites: No Spring context runtime; target17 compilation ran on25, no general concurrency/performance or agent evaluation.

121. **gof-state — validada.** 1.2.2 → 1.2.3.
     Persistence mapper omitted REFUNDING and diverged from the canonical five-state schema and stable reason codes. CAS retry can silently replace a caller revision precondition; latest-state re-evaluation must be an explicit command policy. Distinguish a time-derived display query from a durable expiry transition with history/effects.
     Validação local: passed; integração: passed.
     Limites: Compilation targeted Java 21; execution used JDK 25.0.3. No actual database/ORM, CAS schedule, migration, outbox or scheduler exercised. Synthetic fixture retained at C:/Users/robso/AppData/Local/Temp/gof-state-review-punmiH; no agent behavioral evaluation.

122. **gof-strategy — validada.** 1.2.2 → 1.2.3.
     Shipping refactoring silently replaced configurable pickup rate with zero and invented a minimum freight weight; restored original semantics and separated new destination eligibility policy. Only unknown-key free shipping was demonstrated; removed claim that all three failures previously returned free shipping. Choose functional or cohesive contracts by operations, lifecycle and API compatibility; local classes are valid; corrected Bridge and Factory Method boundaries.
     Validação local: passed; integração: passed.
     Limites: --release 17 compilation, JDK 25.0.3 execution; annotation stubs rather than Spring runtime. No concurrency, reload, performance or real JUnit/jqwik engine evaluation. Fixture retained at C:/Users/robso/AppData/Local/Temp/gof-strategy-review-1Drxn8; no agent evaluation.

123. **gof-template-method — validada.** 1.2.2 → 1.2.3.
     Synchronized hooks can reenter on same thread and corrupt shared run state. Input equality after validate does not prove purity, determinism or absence of temporary/external effects.
     Validação local: passed; integração: passed.
     Limites: No complete JUnit/AssertJ suite; target17 runtime25 only. No agent behavioral evaluation.

124. **gof-visitor — validada.** 1.2.2 → 1.2.3.
     Image non-null contract needed constructor validation while allowing empty alt. Pruning belongs to supplied StyleGuide policy, not nonexistent Section field. Operation placement depends on type ownership and public extension contract.
     Validação local: passed; integração: passed.
     Limites: Helper domain/inRow supplied; no renderer/pruning/Unknown/binary compatibility tests. Target21 ran25; no agent evaluation. Fixture C:/Users/robso/AppData/Local/Temp/gof-visitor-probe-virns3/Probe.java retained.

125. **graalvm-jit — validada.** 2.1.2 → 2.1.3.
     Compiler name alone counts failed/unrelated JFR compilation attempts. Require succeded=true, compileLevel=4, relevant method/caller, measured fork and time window; compilation does not prove later execution. JMH @Fork arguments can discard launcher C2 flags. Explicit fork JVM/arguments and actual fork evidence are required. Different JDK distributions compare a combined runtime migration, not an isolated compiler treatment.
     Validação local: passed; integração: passed.
     Limites: Smoke proves configuration/evidence mechanism only; no performance gain measured. No compiler failure deliberately induced. No agent behavioral evaluation.

126. **graalvm-native-image — validada.** 2.0.2 → 2.0.3.
     typeReached requires analysis inclusion and runtime activation; metadata can be present but inactive. Reflective bootstrap conditioned on the plugin itself can create a circular prerequisite; choose prior trigger or justified narrow unconditional metadata. Legacy typeReachable migration requires semantic/order review, not a key rename.
     Validação local: passed; integração: passed.
     Limites: Schema-fragment checks are not full Draft 2019-09 schema validation. native-image unavailable on PATH; no native build or runtime integration executed. No agent behavioral evaluation.

127. **grpc-http2-service-mesh-performance — validada.** 1.0.2 → 1.0.3.
     Cached withDeadlineAfter stub retains an aging absolute deadline; derive per-RPC options from remaining budget. Initial metadata differs from retry-eligible trailers-only HEADERS. Local retry attempts may fail before stream allocation.
     Validação local: passed; integração: passed.
     Limites: Source/documentation verified grpc-java1.84.0; no transport runtime, benchmark or behavioral evaluation.

128. **heap-dump-analysis — validada.** 1.3.3 → 1.3.4.
     Thread.dump_to_file recipe lacked required filepath; explicit destination plus target help and parsed JSON now required. jdk.trackAllThreads=false can omit direct-created virtual threads; absence from textual dump does not establish absent heap retention. MAT comparison workflow corrected to Navigation History/Compare Basket; timing follows investigated cycle and object addresses/IDs are not cross-snapshot identities.
     Validação local: passed; integração: passed.
     Limites: Compiled for Java 21, executed only on JDK 25.0.3. Initial console-limit expectation corrected after installed build required filepath; final probe passed. Console support/limit verified in consulted source, not reproduced in installed runtime. MAT GUI, HPROF parsing and heap comparison not executed; only synthetic thread dumps. No production process or agent behavioral evaluation.

129. **hot-partitions-and-rebalancing — validada.** 1.3.3 → 1.3.4.
     Enabling/disabling salting changes layout like changing S; a configuration toggle can hide existing data and cross retry/deduplication domains. Added versioned transition, coexistence/merge, original retry routing, writer control and retirement conditions. Logical buckets do not guarantee distinct physical partitions or proportional capacity.
     Validação local: passed; integração: passed.
     Limites: Migration consequences inferred from example contracts and reproduced with synthetic keys; AWS docs do not specify universal migration protocol. No real migration, durability, concurrent store or performance measurement. Fixture retained at C:/Users/robso/AppData/Local/Temp/hot-partitions-review-8b1b1d6246ea4a98878500ab7f284d53; no agent evaluation.

130. **humble-objects-and-functional-core — validada.** 1.2.3 → 1.2.3.
     Revisada sem alterações. Full review found no supported defect: existing guidance distinguishes Humble Object from purity, preserves contracts/boundary tests, qualifies shallow immutability/concurrency, and avoids extraction without benefit.
     Validação local: passed; integração: passed.
     Limites: Partial Java sketches not compiled or integrated. Four agent cases prepared, not executed; no measured performance/testability gain.

131. **idempotency — validada.** 1.2.2 → 1.2.3.
     Latest pre-dispatch rejection cannot resolve earlier UNKNOWN attempts; preserve durable operation-wide uncertainty through retry/takeover. Pseudocode now records pre-dispatch failure with atomic epoch/state check, preserves terminal results and earlier evidence; includes late completion after timeout/restart scenario. Validate key format and bounds separately from generator uniqueness; one token cannot establish entropy and adequate deterministic IDs remain valid.
     Validação local: passed; integração: passed.
     Limites: Pseudocode only; no database/provider integration. Operation-wide uncertainty conclusion is inference from contracts, not experimental result. No agent behavioral evaluation.

132. **incident-evidence-capture — validada.** 1.3.2 → 1.3.3.
     Preserve current NMT reports/existing-baseline diffs before replacing baseline; a new baseline destroys the previous comparison. Distinguish capture time, known/unknown baseline time and missing comparison; absence is not zero growth. New windows must fit recovery budget and existing tracking level.
     Validação local: passed; integração: passed.
     Limites: No target NMT capture, Java compilation, benchmarks or agent behavioral evaluation.

133. **inheritance-mapping-strategies — validada.** 1.3.2 → 1.3.3.
     TABLE_PER_CLASS can have concrete root/intermediate tables, not only leaves; root rows do not cover descendants for a polymorphic FK. A query naming a nonleaf subtype remains polymorphic and may UNION descendants. DML migration/cutover now addresses versions, concurrency, stale managed contexts and shared caches, including warmed-cache stale-write test proposal.
     Validação local: passed; integração: passed.
     Limites: No ORM/database/cache/migration execution; existing Java/SQL examples unchanged and not compiled. Agent cases prepared, not executed.

134. **io-uring-and-zero-copy — validada.** 1.2.2 → 1.2.3.
     Owned binding guidance lacked CQE correlation and stream ordering; submission order does not guarantee execution/completion order. Documented IOSQE_IO_LINK batch/chain scope, short I/O, errors/cancellation and lack of atomicity. CPU accounting now includes attributable pollers/workers and avoids double counting shared rings or treating displaced work as total reduction.
     Validação local: passed; integração: passed.
     Limites: No Linux io_uring/tracing/benchmark execution; primary-source documentary corrections. No executable Java changed and no agent behavioral evaluation.

135. **java-annotations — validada.** 1.2.2 → 1.2.3.
     TYPE_USE occurrences do not trigger JSR269 matching by annotation name; explicit processor selection or retention change does not ensure process invocation. Separate processor selection, TypeMirror/AST traversal and actual rejection coverage; universal checking can use '*' and return false to preserve other processors.
     Validação local: passed; integração: passed.
     Limites: Host compiler25 with release17, not host17. Fixture covers generic field argument, not all nested/array/method-body positions. Compiler probes not agent evaluations.

136. **java-api-design — validada.** 1.2.2 → 1.2.3.
     Binary compatibility means preserved linkage, not unchanged execution; added methods can change precompiled super-call dispatch. Declaring a first constructor removes implicit no-argument constructor unless explicitly preserved. Old→new rename forwarding can bypass legacy overrides; choose bridge direction by extension contract and test precompiled subclasses.
     Validação local: passed; integração: passed.
     Limites: Controlled JDK25 probes not all consumers/hierarchies; no japicmp/Revapi of published library. No agent behavioral evaluation.

137. **java-application-security-basics — validada.** 1.3.2 → 1.3.3.
     Legacy hash wrapping lacked OWASP cracking/password-shucking qualifications; prefer direct rehash after valid authentication or reset, with explicit temporary-wrapper encoding/retirement. rg quoted globs were literal paths; use -g filters and -l filenames with incomplete-triage limitation. A changed salted hash does not establish stronger cost; verify persisted algorithm/policy, password checks, no invalid-login write and CAS protection from concurrent reset. Library verifiers need no explicit MessageDigest call.
     Validação local: passed; integração: passed.
     Limites: OWASP checked2026-09-21. Hostile fixture verifies command only; no KDF/concurrency/timing tests and no Java changes. No agent behavioral evaluation.

138. **java-clean-code — validada.** 2.2.2 → 2.2.3.
     Extracting helper arguments consolidates/advances cutoff observations and can change first-failure ordering; state stability assumptions and preserve observation placement where required. Injecting RandomGenerator can lose Math.random concurrent-use guarantees; preserve implementation/sharing/distribution contracts. Added java-thread-safety-contracts suggestion.
     Validação local: passed; integração: passed.
     Limites: Probe covers extraction mechanism, not complete settlement/batch application. Random contract checked in APIs, no stochastic stress. No agent evaluation, measured skill-version comparison or reader-comprehension measurement.

139. **java-code-smells — validada.** 1.4.2 → 1.4.3.
     Sealed direct closure does not exclude external indirect implementations through non-sealed branches. Optional chains require ownership/absence contract evidence before findings; nullable fallback can be valid. Deferred migration does not erase supported finding/evidence/impact. Negative transposition fixture now compiles against real After model rather than duplicated surrogate, with classpath set.
     Validação local: passed; integração: passed.
     Limites: release21 on runtime25, no runtime21; plugin exercised classpath/packages not named modules. Fixture retained C:/Users/robso/AppData/Local/Temp/code-smells-review-7A1swW. No agent evaluation.

140. **java-cohesion-coupling — validada.** 1.2.2 → 1.2.3.
     Select dependency edges by intended rule and contract ownership, not how many decisions a package makes; adapter→policy port can be correct. Separate authoring JDK25 baseline from actual project target; unknown version requires conditional advice. Stable modules can warrant current-cost or explicit preventive boundary correction; speculative future maintenance alone may not justify migration.
     Validação local: passed; integração: passed.
     Limites: Java examples unchanged and not compiled; no real graph or measured maintenance benefit. No agent behavioral evaluation.

141. **java-composition-over-inheritance — validada.** 1.2.3 → 1.2.4.
     Wrappers inherit interface defaults without forwarding to delegate overrides; new abstract and default methods need distinct treatment. Bulk defaults can introduce partial effects; deliberate forwarding must preserve delegate semantics and wrapper checks.
     Validação local: passed; integração: passed.
     Limites: Compiled21, ran25 only; no general concurrency/atomicity proof. JLS21 chapter8/JEP441/456 fetches failed; official guides used. No agent evaluation.

142. **java-concurrency — validada.** 1.2.2 → 1.2.3.
     Semaphore fair acquisition supports internal FIFO points, with untimed tryAcquire barging; distinguish completion order and per-tenant share. Reactive demand counts items, not retained bytes or active tasks; inspect buffers, prefetch, payloads, fan-out and replenishment after asynchronous dispatch.
     Validação local: passed; integração: passed.
     Limites: No executable Java changed; no scheduler/pipeline/benchmark execution. No agent behavioral evaluation.

143. **java-defensive-programming — validada.** 1.2.2 → 1.2.3.
     strip before ISO control check erased forbidden leading/trailing controls; now size-bound raw text then reject controls before permitted normalization. Specify1000 UTF16-unit raw bound and stable error codes. Remove internal checks only with same-invariant proof; required runtime enforcement cannot become assertion merely due internal caller.
     Validação local: passed; integração: passed.
     Limites: release16 ran25 only. Synthetic effects counter is not HTTP/Spring/ledger integration. No atomicity/concurrency/fullIBAN/additional finance constraints tested. Fixture retained C:/Users/robso/AppData/Local/Temp/java-defensive-programming-review-AEGwg9; no agent evaluation.

144. **java-dependency-inversion — validada.** 1.2.2 → 1.2.3.
     jdeps misses source-only dependencies such as SOURCE annotations; require source/build inspection and fresh output with mechanism absent, distinguishing accepted build-time coupling. Preserve collaborator lifetime/sharing when moving injection; Clock versus RandomGenerator contracts differ; recording double is sequential.
     Validação local: passed; integração: passed.
     Limites: Compilation targeted17 using25tools; no Java17 runtime. No concurrency measurement, SMTP integration or agent evaluation; existing code snippets unchanged.

145. **java-design-by-contract — validada.** 1.2.2 → 1.2.3.
     Compare permitted outcomes before labeling new failures as contract narrowing. Checked exception already covered by declared supertype adds no caller obligation; throws-only changes preserve binary compatibility, not necessarily source/behavior. Collection optional failures must be distinguished from stronger concrete implementation promises.
     Validação local: passed; integração: passed.
     Limites: Fixture retained C:/Users/robso/AppData/Local/Temp/contract-review-jzFoPe. Specific compilation/execution probes only; reservation example unchanged/unexecuted; no agent evaluation.

146. **java-dry-kiss-yagni — validada.** 1.2.2 → 1.2.2.
     Revisada sem alterações. No supported defect: authority/change reasons, compatibility, legitimate parameters and example equivalence are explicitly scoped. Targeted probes confirmed examined behavior; no bump needed.
     Validação local: passed; integração: passed.
     Limites: Java17 target executed on25.0.3 with synthetic missing domain types, not real consumers. HALF_EVEN direct comparison, no mutation tool. No agent behavioral evaluation or measured improvement.

147. **java-enums — validada.** 1.2.2 → 1.2.3.
     Jackson2.19 can accept ordinal integers/quoted indexes despite text @JsonValue; define token/coercion policy separately from unknown values. Explain FAIL_ON_NUMBERS_FOR_ENUMS defaults and creator/mapper overrides; preserve intentional numeric codes and digit-containing textual codes.
     Validação local: passed; integração: passed.
     Limites: release17 ran25; isolated Jackson only, not real endpoint/persistence/schema. JEP441 fetch failed; switch guidance unchanged/unexecuted. Artifacts retained C:/Users/robso/AppData/Local/Temp/java-enums-review-3092ea0087f94b50b0ffd2ca1f57aace; no agent evaluation.

148. **java-exception-design — validada.** 1.3.2 → 1.3.3.
     Interrupted HTTP wait can leave remote effect UNKNOWN; preserve cancellation control flow and recovery facts rather than implying operation absent. GatewayCancellationException remains CancellationException, preserves cause/flag and typed UNKNOWN; stop retries and pass facts to existing recovery owner, without claiming durable handoff.
     Validação local: passed; integração: passed.
     Limites: release21 onruntime25; HTTP/parser/ledger simulated, no gateway/cancellation race/transaction/durable recovery. One adapter call is not validation of external retry policy; no agent evaluation.

149. **java-fluent-apis — validada.** 1.2.3 → 1.2.4.
     Resource acquired inside failing fluent initializer may never register for try-with-resources cleanup. Register acquisition before later setup; verify setup/traversal failures and success while respecting API-specific guarantees.
     Validação local: passed; integração: passed.
     Limites: Mechanism probes Java25 only; Java8 case prepared, not run. Existing builder/stage/binary evolution examples unchanged/uncompiled. No agent evaluation.

150. **java-generics — validada.** 1.2.2 → 1.2.3.
     Raw-type prohibition contradicted legitimate legacy interoperability in the same skill; checklist now preserves supported raw boundary contracts with proof/validation of unchecked operations.
     Validação local: passed; integração: passed.
     Limites: No Java examples changed or compiled; no agent evaluation. JEP506 HTTP403; official21/25 APIs used.

151. **java-immutability — validada.** 1.2.3 → 1.2.4.
     Read-only ByteBuffer shares bytes and has mutable cursor; copy/view decisions must isolate content and preserve private cursor state. Define snapshot range, stable equality/hash and byte order; view factories reset order and independent accessors must reapply intended order.
     Validação local: passed; integração: passed.
     Limites: release17 executed25 only; mechanism check not concurrency publication/binder integration/agent behavior. No skill-version behavioral comparison.

152. **java-lambdas-and-functional-interfaces — validada.** 1.3.3 → 1.3.4.
     Boxing/unboxing depends on primitive/reference conversions, not merely Function<Integer,Integer>; preserve null/absence and avoid fixed allocation claims. Consumer.andThen skips second consumer after first failure; mandatory cleanup needs explicit ownership-aware control, while valid fail-fast sequencing remains appropriate.
     Validação local: passed; integração: passed.
     Limites: No executable snippet changed, compilation/benchmark/allocation measurement or agent evaluation.

153. **java-law-of-demeter — validada.** 1.2.2 → 1.2.3.
     ReceiptData snapshot guidance copied collection without capturing mutable element state; project required values under owner consistency protocol, sharing already immutable elements. Clarified shallow record/copyOf semantics, null rejection and lack of atomic capture; proposed postcapture mutation isolation separately from concurrent consistency.
     Validação local: passed; integração: passed.
     Limites: No executable Java changed/compiled, no agent behavior/performance measured.

154. **java-legacy-code-testing — validada.** 1.1.2 → 1.1.3.
     Expose Static Method must preserve instance dispatch/synchronization/binary contracts where required; static helper still triggers class initialization. Separate Wrap Method and Wrap Class; only callers routed through wrapper receive behavior.
     Validação local: passed; integração: passed.
     Limites: verify.sh syntax checked, examples launched directly (not full script); --source21 on25 not runtime21 or release21 API check. No Mockito/ApprovalTests/Testcontainers/realDB integration or agent evaluation.

155. **java-memory-model — validada.** 1.3.2 → 1.3.3.
     Interrupt synchronization also permits another thread observing target interruption; distinguish interruptor publication from target results/termination and identify actual interrupt. Program order follows intra-thread semantics. Final-field freeze occurs at assigning constructor exit, normal or abrupt; freeze does not prove successful construction/invariant.
     Validação local: passed; integração: passed.
     Limites: No Java changed, compilation/jcstress/concurrency tests or agent evaluation executed.

156. **java-null-safety — validada.** 1.2.2 → 1.2.3.
     Raw DTO nullable elements must remain List<@Nullable LineDto> after checking only container; validate each element. Made DTOnullable components and NullMarked conversion scope explicit; static negative checker case documented.
     Validação local: passed; integração: passed.
     Limites: No nullnesschecker executed; staticnegative remains prepared. release16 executed25, HashMap support not binder/HTTP/ORM integration. Runtime checks not agentbehavior improvement.

157. **java-numeric-types — validada.** 1.2.2 → 1.2.3.
     UNNECESSARY validates exact representability, not lexical scale: removable zeros normalize; lexical grammar needs original-text check. Money.percentage takes fractional rate0.19 for19% and returns share, not increased total; convert external percent19 once, preserve arithmetic.
     Validação local: passed; integração: passed.
     Limites: release17 runtime25 only; isolated Money not real serializer/DB/policy. Negative-allocation/JSON behavioral cases not run; no agent evaluation.

158. **java-object-construction — validada.** 1.3.2 → 1.3.3.
     Describe public sealed variants as part of the consumer contract: adding a variant can preserve binary linkage while breaking exhaustive switches at runtime and on recompilation. Qualify readResolve singleton guarantees: callbacks can retain a temporary instance before replacement. Review the object graph, preserve valid primitive state and route to serialization hardening.
     Validação local: passed; integração: passed.
     Limites: Java 21 compilation target was executed on Java 25, not a Java 21 runtime. Mechanism probes do not establish behavioral improvement; agent evaluations were not executed.

159. **java-object-contracts — validada.** 1.2.2 → 1.2.3.
     Explain that mutable comparison keys or comparator state can invalidate sorted collections even when equals/hashCode remain stable; remove before updating, define ties and rebuild under a stable comparator when necessary. Distinguish protocol canonical order: JCS uses UTF-16 ordering, whereas deterministic CBOR uses encoded-byte ordering; String natural order is not universal. Check comparator transitivity with triples, not only pairs; remove unsupported frequency ranking.
     Validação local: passed; integração: passed.
     Limites: Observed failures are not portable failure guarantees. TreeSet was executed; TreeMap was checked against its contract only. Examples do not establish serializer conformance. No agent behavioral evaluation was executed.

160. **java-optional — validada.** 1.2.2 → 1.2.3.
     Catalogue stored-null corruption distinct from missingSKU; staticfixture Map.copyOf rejectsnulls and explicitly freezesmappings, withoutdeepcopy/amountguarantee. Use Function.apply and preserve nullmapper validation plus factory evaluation/effects/failures in Optionalrewrite. Removed mechanical lambda statementcount and alignedJava21sources.
     Validação local: passed; integração: passed.
     Limites: release21 executed25; snippets only,no integration/performance/agent evaluation.

161. **java-performance — validada.** 2.6.2 → 2.6.3.
     Samples/op normalization insufficient when event/selection/interval/weight differ; compare provenance, absolute totals and work. Profile share growth is not absolute cost growth; route detailed interpretation to flame-graph-analysis and retain capture metadata.
     Validação local: passed; integração: passed.
     Limites: Arithmetic synthetic; no profiler/benchmark/process capture, Java change or agent evaluation.

162. **java-refactoring — validada.** 1.4.2 → 1.4.3.
     Preserve continue/break/return destinations, labels and finally behavior when introducing loop guards. Constrain Java 25 constructor prologue assignments to eligible own fields without initializers; read-modify-write operations remain invalid. Make validation proportional for a syntax-only local rename and clarify schema ownership when routing inheritance changes.
     Validação local: passed; integração: passed.
     Limites: Fixtures establish specific language contracts, not general refactoring correctness; nested labels and switches were not executed. JEP 513 returned HTTP 403; normative Java 25 specification and compiler supported the checks. No agent behavioral evaluation.

163. **java-reference-types-and-leaks — validada.** 1.3.2 → 1.3.3.
     Trace strong value→key paths across all WeakHashMap entries; weak links differ from strong retention and weak entire values alter lifetime contract. OpenJDK25.0.3 null key uses static strong sentinel; remove/replace obsolete null mapping explicitly.
     Validação local: passed; integração: passed.
     Limites: Documentation/source only, no GC probe or executable change. Null implementation scoped25.0.3+9; no agent evaluation.

164. **java-reflection-and-method-handles — validada.** 1.4.3 → 1.4.4.
     Distinguish private invocation access from LambdaMetafactory full privilege access: cross-module privateLookupIn loses MODULE even if invocation is allowed. Explain that bindTo yields an indirect implementation handle; capture the receiver through the factory or use a typed adapter/owner factory without widening opens or leaking Lookup capabilities. Describe reflection as method-handle based by default since JDK 18 and acknowledge removal of the old implementation in JDK 22.
     Validação local: passed; integração: passed.
     Limites: Java 17 target was executed on Java 25 only; no benchmark, native-image, loader-unloading or agent behavioral evaluation. JEP 416 returned HTTP 403; versioned OpenJDK sources and official release notes supported the relevant claims.

165. **java-resource-management — validada.** 1.2.2 → 1.2.3.
     Explain that cancelling a dependent whenComplete stage can skip cleanup, and cancelling a source need not mean actual use has ended. Keep private cleanup ownership tied to real termination and separate the public result. Preserve the construction failure even when cleanup throws unchecked exceptions or Error; catch Throwable only after a primary failure and guard against self-suppression. Define interruption policy for close: suppression of InterruptedException can lose the signal and does not prove release completed.
     Validação local: passed; integração: passed.
     Limites: Java 21 target ran on Java 25 only. No concurrent stress, JDBC driver or real pool integration. StructuredTaskScope preview content was unchanged and not executed. No agent behavioral evaluation.

166. **java-serialization-hardening — validada.** 1.2.2 → 1.2.3.
     Convert the proxy constructor expected IllegalArgumentException into InvalidObjectException with its cause; ordinary readResolve does not automatically apply record-constructor wrapping. Preserve unexpected defects and other stream exceptions instead of broadly catching RuntimeException/Throwable. Qualify generated serialVersionUID changes as possible rather than inevitable after innocent edits.
     Validação local: passed; integração: passed.
     Limites: Partial examples required omitted constructors and controlled fixtures. Java 17 target ran on Java 25 only. No claim of arbitrary deserialization safety, production-filter validity or cross-release compatibility. No agent behavioral evaluation.

167. **java-solid — validada.** 1.2.2 → 1.2.3.
     Require explicit consumer migration before relaxing a published supertype contract; a limit query does not restore substitutability. Distinguish the example fixed cap from mutable balance/limit TOCTOU requiring atomic checks; do not invent a race from the constant query alone. Explain both equality symmetry and equal-object hash violations in Sku/VersionedSku; fixing hashes alone is insufficient. Separate covariant return types from nullability, effect and failure guarantees; preserve intentionally invalid teaching examples.
     Validação local: passed; integração: passed.
     Limites: Java 17 target ran on Java 25 only. Concurrency and unchanged Java 21 payment flow were not executed. JLS 21 chapter fetch failed; JLS 25 and release-17 compilation supported the longstanding covariance rule. A later Liskov/Wing PDF fetch failed and supplied no new claims. Checks characterize teaching violations, not agent behavior; no behavioral evaluation or A/B comparison.

168. **java-streams — validada.** 1.2.2 → 1.2.3.
     Distinguish null mapper values from null merge results: a null toMap merge removes the entry, and later occurrences can reinsert it; define collision policy and associativity. Explain that flatMap closes consumed inner streams; return them open and lazy, while outer sources and preopened unvisited streams retain separate owners. Specify empty, short, exact and long windowSliding inputs: one short window for an entire short input, otherwise only full windows; windowFixed may retain a short final batch.
     Validação local: passed; integração: passed.
     Limites: Java 21/24 targets ran only on Java 25. Cleanup used in-memory streams/onClose, not file/JDBC/JPA integration. No general parallelism, arbitrary merge-associativity or performance validation. No agent behavioral evaluation.

169. **java-strings-and-text — validada.** 1.2.2 → 1.2.3.
     Correct file.encoding guidance: UTF-8 and COMPAT are both supported override values; other values are unspecified. Separate literal delimiter quoting from preserving trailing fields: choose split limit according to the field contract, including repeated separators and empty input. Distinguish getBytes length from input validity; use a reporting CharsetEncoder for strict rejection and count the accepted encoded bytes.
     Validação local: passed; integração: passed.
     Limites: JEP 400 returned HTTP 403; official Java 25 APIs supplied the relevant contracts. Only Windows Temurin 25.0.3 was executed; no Java 17, database/collation or regex-growth integration. No agent behavioral evaluation or comparison.

170. **java-tell-dont-ask — validada.** 1.2.2 → 1.2.3.
     references/placement-decision.md: framework accessors may legitimately feed separately owned policies; target duplicated object-owned rules and unsafe mutations instead.
     Validação local: passed; integração: passed.
     Limites: No Java compilation needed: executable examples unchanged. Jakarta deep-section and Spring Javadoc retrieval failed; no new framework-specific claims introduced. Behavioral evaluation unexecuted; no measured improvement.

171. **java-test-design — validada.** 1.0.2 → 1.0.3.
     SKILL.md and junit5-patterns.md: isolate fallible arrangement from exception assertion; select subtype versus exact-class assertion by contract. Document Jupiter5.7 exact-class fallback and assertion diagnostic versus exception-message semantics.
     Validação local: passed; integração: passed.
     Limites: No Java execution or behavioral agent evaluation; snippets unchanged.

172. **java-test-doubles — validada.** 1.0.3 → 1.0.4.
     references/mockito-hazards.md: captors retain mutable references; record relevant values at invocation time and account for shallow copies. Allow whole-value equality and broad matchers when they match the contract; distinguish fake state from persistence evidence. skill.yaml: replace unconditional Fakes over mocks presentation with contextual choice.
     Validação local: passed; integração: passed.
     Limites: No Java execution: snippets unchanged. Initial local checker mishandled an angle-bracketed external URL; corrected and rerun. Two fresh revised-skill response cases passed predefined criteria; no original/no-skill comparison or measured improvement.

173. **java-testing-strategy — validada.** 1.0.3 → 1.0.4.
     references/test-levels.md: explain real-server versus test transactions, fixture visibility and committed cleanup. references/selection-scenarios.md: verify contractual outbound request fields, isolate request journal and avoid assuming both test scopes are cheap.
     Validação local: passed; integração: passed.
     Limites: No executable Java examples introduced; no Spring/WireMock runtime tests. Structured walkthroughs only; independent behavioral evaluation and measured improvement unavailable.

174. **java-thread-safety-contracts — validada.** 1.2.2 → 1.2.3.
     Capture immutable aggregate once for coherent reads; coordinate derived multi-writer changes; updater callbacks can repeat. DCL requires non-reentrant factory; account for overwrite, cleanup and failure retries.
     Validação local: passed; integração: passed.
     Limites: No behavioral evaluation; Java25 mechanism execution only. Unchanged JEP491 direct source retrieval unavailable; new fixes do not depend on it. Recursive cleanup rejected; explicit nonrecursive removal succeeded.

175. **jdk-upgrade-impact — validada.** 1.2.2 → 1.2.3.
     Preserve old --release while auditing destination JavaSE APIs via jdeprscan; inspect diagnostics and scan dependencies explicitly. Qualify privateLookupIn privileges/readability/opens and finalized FFM JDK22 baseline.
     Validação local: passed; integração: passed.
     Limites: No agent behavioral evaluation; walkthroughs only. JEP454 fetch403; official JDK22 API supplied baseline evidence.

176. **jfr-advanced — validada.** 1.3.2 → 1.3.3.
     Use bounded String/int codes instead of unsupported enum/array event fields. Initialize custom-filter inputs before shouldCommit; predicates can repeat and settings combine permissively. Java20+ RecordingStream.stop drains callbacks from lifecycle code; separate external export completion and Java17 alternative.
     Validação local: passed; integração: passed.
     Limites: No Java17 runtime execution, callback-deadlock execution or behavioral agent evaluation.

177. **jfr-and-async-profiler — validada.** 1.4.2 → 1.4.3.
     CPU-loop off-CPU samples can reflect preemption/runnable delay; avoid universal negative control. Duration-event visibility depends on commit/completion; dumps do not force in-flight waits to emit. Clarify documented HotSpot25/async-profiler4.4 baseline versus actual target capability.
     Validação local: passed; integração: passed.
     Limites: Native park lifecycle and Linux scheduler source-verified only; Windows host lacks Linux async-profiler run. Initial PowerShell -D splitting corrected; recursive cleanup rejected, explicit cleanup succeeded. No agent evaluation.

178. **jhsdb-and-core-dumps — validada.** 1.3.2 → 1.3.3.
     Use actual crashed executable with --exe, including native launchers embedding HotSpot. Document Linux25.0.3 SA_ALTROOT lookup, suffix fallback, accessible core/executable paths and asset identity/symlink checks.
     Validação local: passed; integração: passed.
     Limites: Linux remapping source-verified only; no Linux core/live attach experiment. Shell syntax checked, commands not executed; no agent behavioral evaluation.

179. **jit-compilation — validada.** 1.3.2 → 1.3.3.
     JFR compiler-statistics LAST values are cumulative; derive rates from timed same-JVM deltas with edge coverage limits. Distinguish ordinary CDS parsing from AOT loading/linking/profiles. Code-cache exhaustion can retain usable C1/C2 code; service health unknown and compiler recovery depends on flushing.
     Validação local: passed; integração: passed.
     Limites: No behavioral/controlled performance evaluation; probe tests mechanism only.

180. **jit-inlining-and-escape-analysis — validada.** 2.1.2 → 2.1.3.
     Separate C1 no-static-binding/not-inlineable verdicts from C2; attribute compiler/root/caller/BCI. Absent helper nmethod does not prevent bytecode inlining; InlineSmallCode relaxes heuristic rather than copies machine code. Aggregate JFR allocation sample weights; qualify sampled pressure and retention.
     Validação local: passed; integração: passed.
     Limites: No measured performance gain or agent evaluation; recursive cleanup rejection resolved via exact files.

181. **jmh-advanced — validada.** 1.2.2 → 1.2.3.
     Auxiliary counters can include synchronization calls outside primary measurement; -wi0 does not align windows. Primary-only OPI/batch scaling and EVENTS sum aggregation require explicit units/populations before ratios.
     Validação local: passed; integração: passed.
     Limites: No runtime benchmark, Java17 runtime or behavioral evaluation; stalled repeat source request terminated. Recursive cleanup blocked, explicit file removal succeeded.

182. **jmh-microbenchmarks — validada.** 1.4.2 → 1.4.3.
     Clarify destructive-input reset and whether preserving copy belongs in measured operation. Distinguish SingleShotTime batch size from operations-per-invocation; variable work and normalized batch percentiles do not yield element latency. Pin fixture contracts to JMH1.37.
     Validação local: passed; integração: passed.
     Limites: No executable snippets changed or benchmark run; walkthroughs only, no agent evaluation.

183. **jni-and-ffm — validada.** 1.3.2 → 1.3.3.
     JNI JNIEnv/local reference ownership and native worker attachment/global reference quiescence. C varargs need promotions and firstVariadicArg; fixed float stays float; qualify errno snippet. JDK25 Serial/Parallel critical-region change, final JNI_COMMIT cleanup and JNI_ABORT direct-pointer limits.
     Validação local: passed; integração: passed.
     Limites: JNI lifecycle/collector source-verified; no behavior/performance comparison. Initial indentation fixed; recursive cleanup blocked, explicit removal succeeded.

184. **jvm-bytecode — validada.** 2.1.2 → 2.1.3.
     Select deployed multi-release entry explicitly; record artifact/digest and boot/custom-loader exceptions. Method identity includes full descriptor/return type; preserve bridges and interface linkage. Separate symbolic method resolution from receiver selection; diagnose rejected transformed bytes with private members.
     Validação local: passed; integração: passed.
     Limites: No agent behavior/performance evaluation. Reviewer cleanup policy-blocked; coordinator inspected and reversibly moved14 files to ignored .codex/review-resumed-artifacts/2026-09-22/jvm-bytecode-probe. Scratch directory absent from skill; blocker resolved without deletion.

185. **jvm-class-loading — validada.** 1.4.2 → 1.4.3.
     Null parent is bootstrap visibility; select platform/shared API defining loader as needed. Distinguish loader resource unconditional opens from caller-sensitive Class lookup and qualified opens. Drain plugin work before URLClassLoader.close; already loaded code can fail later on new dependencies.
     Validação local: passed; integração: passed.
     Limites: No Java17 runtime or concurrent-close race/agent evaluation. Bulk cleanup rejected; explicit known files/empty dirs removed successfully.

186. **jvm-gc-tuning — validada.** 2.5.2 → 2.5.3.
     Permit provisional new-service policy while requiring matching evidence for a confirmed tuning fix. Separate explicit GC from capacity/evacuation failures; trace caller before growth/suppression. Qualify concurrent versus suppressed explicit GC and direct-buffer recovery effects.
     Validação local: passed; integração: passed.
     Limites: No agent evaluation/performance measurement; historical worker probes preserved not rerun.

187. **jvm-memory-regions — validada.** 1.6.3 → 1.6.4.
     Check effective MaxHeapSize; small-memory ergonomics/MinRAMPercentage and alignment can override simple percentage arithmetic. JFR NMT events require startup NMT; empty events do not prove zero native usage. Remove stale JDK27 pre-GA phrase; retain JDK25 baseline and consistent cgroup scope.
     Validação local: passed; integração: passed.
     Limites: No Linux cgroup/live JFR/JDK27 runtime exercise or behavioral evaluation. JEP534 retrieval403; official JDK27 release notes used.

188. **jvm-ml-inference — validada.** 1.0.2 → 1.0.3.
     Correct ORT1.22 getBufferRef documented-empty versus implementation null dereference discrepancy; track storage ownership explicitly. Explain Result-owned versus caller-pinned output cleanup and asynchronous consumer lifetime.
     Validação local: passed; integração: passed.
     Limites: Source analysis only; no native engine execution/performance measurement/agent behavioral evaluation. OpenJDK browser403 resolved via direct HTTPS.

189. **jvm-performance-review — validada.** 1.3.2 → 1.3.3.
     Defaults probes can inherit option variables; command-line origin can hide JDK_JAVA_OPTIONS provenance. Respect JVM/application argument boundary. Reconcile ancestor cgroup budgets and named high/max/oom/oom_kill deltas; distinguish pressure from kill.
     Validação local: passed; integração: passed.
     Limites: Linux hierarchy/events source-verified; no live Linux/agent behavioral run.

190. **kafka-consumers-in-java — validada.** 1.3.2 → 1.3.3.
     Partition-local offset reset can skip new-partition records with latest; retain valid checkpoints.
     Validação local: passed; integração: passed.
     Limites: No Kafka broker or independent agent execution.

191. **kubernetes-service-lifecycle — validada.** 1.3.2 → 1.3.3.
     Probe health depends on HTTP status; custom Boot health mappings replace default DOWN/OUT_OF_SERVICE mappings.
     Validação local: passed; integração: passed.
     Limites: No cluster, Spring runtime or agent evaluation.

192. **latency-statistics — validada.** 1.4.2 → 1.4.3.
     Distinguish empty/malformed histogram evidence; +Inf quantile fallback is not compliance. Inclusive bucket boundaries differ from strict business thresholds.
     Validação local: passed; integração: passed.
     Limites: No promtool or PromQL backend/agent execution.

193. **layering-and-boundaries — validada.** 1.2.2 → 1.2.3.
     Clean/Onion rings are schematic, not mandatory class counts; denylist covers only listed dependencies; shortcuts preserve authoritative contracts.
     Validação local: passed; integração: passed.
     Limites: No Java or agent execution.

194. **leader-election — validada.** 1.3.2 → 1.3.3.
     Leadership does not ensure once-only effects; stable work identity spans terms; missed ShedLock intervals need an explicit policy.
     Validação local: passed; integração: passed.
     Limites: No cluster or agent evaluation.

195. **legacy-enterprise-modernization — validada.** 1.2.2 → 1.2.3.
     Owner API can split a local atomic transaction; account for actual DB privileges and in-flight old-owner writes. Added saga suggestion for independently committed boundaries.
     Validação local: passed; integração: passed.
     Limites: psql unavailable and Docker daemon unreachable; no DB security runtime or agent evaluation.

196. **linux-for-jvm — validada.** 1.3.2 → 1.3.3.
     Diagnose memory.high reclaim throttling separately from OOM; distinguish THP allocation, defrag and per-size override policy.
     Validação local: passed; integração: passed.
     Limites: No induced memory pressure, sysfs writes, causal production measurement or agent evaluation.

197. **littles-law-and-queueing — validada.** 1.5.2 → 1.5.3.
     Same-pool parents waiting for queued children can starve independently of average capacity; larger queues do not repair it.
     Validação local: passed; integração: passed.
     Limites: No agent comparison; legacy Denning/Buzen PDF unavailable, new claims verified from Java contracts.

198. **load-balancing-and-routing — validada.** 1.2.2 → 1.2.3.
     Envoy detection counters do not prove enforced ejection; statistical gates and active-health unejection alter protection.
     Validação local: passed; integração: passed.
     Limites: No Envoy runtime or agent execution.

199. **load-testing — validada.** 1.4.2 → 1.4.3.
     k6 fail aborts iteration without guaranteeing failed test exit; distinguish acceptance thresholds and safety abort. VU demand uses full scenario iteration occupancy and verified scenario tags.
     Validação local: passed; integração: passed.
     Limites: k6 unavailable; no load or agent execution.

200. **load-testing-advanced — validada.** 1.3.2 → 1.3.2.
     Revisada sem alterações. Existing guidance and examples passed source/structural checks; no material defect warrants edits or version bump.
     Validação local: passed; integração: passed.
     Limites: No k6/Gatling/JMeter executable or behavioral evaluation.

201. **lock-free-patterns — validada.** 1.2.2 → 1.2.3.
     Read stamped reference/value coherently before CAS derivation; stamp protocols, ABA, reclamation and progress are separate contracts.
     Validação local: passed; integração: passed.
     Limites: Sequential checks do not prove concurrency/progress; no Java8 runtime or agent evaluation.

202. **lock-inflation — validada.** 1.2.2 → 1.2.3.
     JDK25 JavaMonitorWait duration ends before reacquisition; full Object.wait latency differs; previousOwner is not an owner-hold trace.
     Validação local: passed; integração: passed.
     Limites: No runtime/JFR or agent evaluation; one JEP source unavailable, unchanged claim checked against migration documentation.

203. **low-latency-jvm — validada.** 1.0.2 → 1.0.3.
     Select spin/park/block against actual CPU bandwidth and shared capacity; onSpinWait is a hint, not publication or yield.
     Validação local: passed; integração: passed.
     Limites: No Linux performance or agent run; no executable changes.

204. **message-ordering-and-partitioning — validada.** 1.3.3 → 1.3.4.
     Contiguous sequence is prerequisite for current+1; classify gaps before state transition legality. Newer snapshot guard accepts jumps; snapshots do not restore mandatory intermediate effects.
     Validação local: passed; integração: passed.
     Limites: Sequential SQL predicate only, not production concurrency/Kafka; no agent evaluation.

205. **metadata-mapping — validada.** 1.3.2 → 1.3.3.
     Compiler JDK controls annotation-processing defaults independently of --release; verify fresh generated output. Trusted fixture dump comparison uses supported fixed restriction key while protecting operational/untrusted dumps.
     Validação local: passed; integração: passed.
     Limites: Small custom processor, not Hibernate; pg_dump/Flyway simulated, no real migration; no agent evaluation.

206. **metaspace-internals — validada.** 1.3.2 → 1.3.3.
     Free ratios adjust GC high-water mark rather than directly returning RSS; individual eligible metadata blocks can be reused before CLD death.
     Validação local: passed; integração: passed.
     Limites: Source-level verification only; no runtime or agent evaluation.

207. **metrics-and-cardinality — validada.** 1.3.2 → 1.3.3.
     Prometheus registration type/tag-key constraints can lose cohorts despite live counter handles. Filter ACCEPT bypasses later caps; collapsed gauge IDs retain first source rather than sum.
     Validação local: passed; integração: passed.
     Limites: Client registration/exposition only; no Prometheus/promtool or behavioral evaluation.

208. **mvc-and-request-handling — validada.** 1.3.2 → 1.3.3.
     Spring response writing precedes postHandle for converted bodies; committed responses need late-failure handling. Domain invariants apply beyond request validation; distinguish MVC input400 from return500 and AOP validation paths.
     Validação local: passed; integração: passed.
     Limites: No Spring runtime or agent evaluation.

209. **mysql-innodb-performance — validada.** 1.0.2 → 1.0.3.
     ConnectorJ rewrite can return SUCCESS_NO_INFO; exact per-item result contract must be preserved. Unique found-record lock exception differs from range/missing lookups; READ COMMITTED retains some gaps; queued online DDL can block readers.
     Validação local: passed; integração: passed.
     Limites: No MySQL/JDBC or agent execution.

210. **numa-and-cpu-affinity — validada.** 1.2.2 → 1.2.3.
     Live task affinity, current-thread coverage and future allocation differ from resident-page migration.
     Validação local: passed; integração: passed.
     Limites: No Linux runtime or agent evaluation.

211. **object-layout-and-footprint — validada.** 1.4.2 → 1.4.3.
     Corrected unbounded ArrayList spare capacity and transition peaks; updated JDK27 GA status with source-only layout evidence.
     Validação local: passed; integração: passed.
     Limites: No JOL/Java27/benchmark or agent execution; initial web403 resolved by direct primary HTTP.

212. **off-heap-memory — validada.** 1.3.2 → 1.3.2.
     Revisada sem alterações. No material defect; preserve explicit/automatic arena lifetime, alignment, accounting and profiler evidence boundaries.
     Validação local: passed; integração: passed.
     Limites: No independent behavioral evaluation or measured improvement; no executable examples changed.

213. **offline-concurrency-control — validada.** 1.2.2 → 1.2.3.
     Validate presence/null before primitive version binding; preserve legitimate zero; distinguish HTTP existence/snapshot and missing/failed preconditions.
     Validação local: passed; integração: passed.
     Limites: No runtime/database races or agent evaluation.

214. **opentelemetry-performance — validada.** 1.2.2 → 1.2.3.
     Collector0.160 span-ingest changes cross-batch selection; retain connection metadata for pod association and valid resource-attribute alternatives.
     Validação local: passed; integração: passed.
     Limites: No Go/Collector binaries; no runtime, overhead or behavioral evaluation.

215. **orm-behavioral-patterns — validada.** 1.3.2 → 1.3.3.
     Correct remove state/cascade behavior and failed-flush recovery; rollback retains Java mutations, IDs and versions; distinguish expected no-result.
     Validação local: passed; integração: passed.
     Limites: No Spring/container lifecycle, actual optimistic-conflict recovery or independent agent evaluation; healthybatch/routing walkthrough only.

216. **orm-fetch-and-batching-performance — validada.** 1.2.2 → 1.2.3.
     Separate root eligibility from collection fetching; verify optimistic-lock detection through actual versioned batching.
     Validação local: passed; integração: passed.
     Limites: Fixture disables proxies/reflection optimizer; no targetdriver generalization, performance or agent evaluation.

217. **orm-structural-mapping — validada.** 1.3.2 → 1.3.3.
     Established PK immutability and MapsId parent prerequisites; link replacement differs from stable independent-id FK reassignment.
     Validação local: passed; integração: passed.
     Limites: Earlier6.6 provider patch than reference; no guarantees for undefined PKmutation and no agent run.

218. **pattern-selection-and-composition — validada.** 1.3.3 → 1.3.4.
     Outbox follows durable-publication requirement regardless of logic organization; relay duplicates and consumer/external effects need separate protection.
     Validação local: passed; integração: passed.
     Limites: Conceptual diagrams only; no broker/code or agent execution.

219. **patterns-and-modern-frameworks — validada.** 1.2.2 → 1.2.3.
     Sealed root can expose non-sealed plugin branch; exhaustiveness covers branch; record value support does not establish identifier-role support.
     Validação local: passed; integração: passed.
     Limites: No native17/21 or ORM/agent execution; recursive cleanup rejected, explicit artifact removal succeeded.

220. **pause-attribution — validada.** 1.4.2 → 1.4.3.
     Safe stable native state is not a TTSP blocker by duration alone; require unsafe-state/transition/non-arrival evidence.
     Validação local: passed; integração: passed.
     Limites: Python unavailable so native snippet unexecuted; no production capture or agent evaluation; JEP web errors resolved via HTTP.

221. **performance-engineering-program — validada.** 1.0.2 → 1.0.2.
     Revisada sem alterações. No material defect; preserve conditional adoption, evidence states, denominator discipline and calibrated gates.
     Validação local: passed; integração: passed.
     Limites: No independent behavioral evaluation or measured improvement; no executable examples changed.

222. **performance-incident-response — validada.** 1.0.2 → 1.0.3.
     Require accepted command transfer and retained owner/removal criteria for temporary controls.
     Validação local: passed; integração: passed.
     Limites: No live incident/code or agent execution.

223. **performance-methodology — validada.** 1.4.2 → 1.4.3.
     Align table with safe comparator alternatives, comparable periods and refutable hypotheses without invented precision.
     Validação local: passed; integração: passed.
     Limites: No executable examples or agent runs; JEP491 unavailable, Java content unchanged.

224. **performance-regression-ci — validada.** 1.1.2 → 1.1.3.
     Calibration rates need independent trial counts and uncertainty; separate pilot tuning from confirmation and resampling.
     Validação local: passed; integração: passed.
     Limites: Conditional calculations only, no empirical calibration/benchmark/workflow/agent evaluation.

225. **poison-messages-and-dlq — validada.** 1.2.2 → 1.2.3.
     Distinguish tombstone/null decoding, preserve ordered repeated binary headers, bound whole envelope and account for compaction identity.
     Validação local: passed; integração: passed.
     Limites: No broker, real serializer, operational size/defensivecopy/redrive or agent execution.

226. **postgresql-performance — validada.** 1.0.2 → 1.0.3.
     Interpret statistic cache/reporting/reset/visibility before rates; transaction_timeout terminates session and excludes prepared transactions.
     Validação local: passed; integração: passed.
     Limites: No PG binaries/database or agent evaluation.

227. **project-valhalla — validada.** 1.0.2 → 1.0.3.
     Source-scoped migration gates for weak keys, reflective construction and serialization; matching-preview unchanged control; Sep22JDK28EA16 snapshot.
     Validação local: passed; integração: passed.
     Limites: No supportingJDK28: no preview/runtime/performance or agent execution.

228. **quality-gates — validada.** 1.0.3 → 1.0.4.
     Failsafe integration-test defers enforcement to verify; required GitHub aggregate must enforce selected upstream outcomes and correct trigger.
     Validação local: passed; integração: passed.
     Limites: No Mavenfixture/hostedCI or agent evaluation.

229. **query-objects-and-specifications — validada.** 1.3.2 → 1.3.3.
     Correct joinOR/NOT quantifiers and absent versus false Specification semantics; hostile empty-authorization fixtures.
     Validação local: passed; integração: passed.
     Limites: No provider/database execution; independent source-comparison output evaluation recorded separately.

230. **queueing-models — validada.** 1.3.2 → 1.3.3.
     Exploratory Allen-Cunneen arithmetic remains allowed with explicit unvalidated status; operational prediction still requires evidence.
     Validação local: passed; integração: passed.
     Limites: MIT PDF too large; no agent/production statistical evaluation.

231. **rate-limiting-and-load-shedding — validada.** 1.3.2 → 1.3.3.
     Bound rejection and telemetry costs; condition early connection admission on actual overload while protecting accepted work and audit.
     Validação local: passed; integração: passed.
     Limites: No load/agent execution; Envoy version page unavailable, generic mechanism documented only.

232. **reactive-and-virtual-thread-selection — validada.** 1.3.3 → 1.3.4.
     Helidon4 HTTP/1.1 uses connection-lifetime threads; reactive publisher does not prove nonblocking I/O.
     Validação local: passed; integração: passed.
     Limites: No server/runtime/agent evaluation.

233. **reactive-backpressure — validada.** 1.1.2 → 1.1.3.
     Demand unit changes through buffer; groupBy consumption/cardinality/concurrency can prevent progress.
     Validação local: passed; integração: passed.
     Limites: No runtime or agent evaluation; tagged sources replace unavailable docs.

234. **reading-jit-assembly — validada.** 1.2.2 → 1.2.3.
     Correct quoted JMH perfasm semicolon option assignments; preserve comma-separated events.
     Validação local: passed; integração: passed.
     Limites: No perf/hsdis capture or agent run; safe empty-dir cleanup resolved rejected command.

235. **refactoring-automation — validada.** 1.1.2 → 1.1.3.
     Distinguish dry-run detection from CI enforcement, preconditions from parse/generation scope, and immutable LST updates from in-place edits.
     Validação local: passed; integração: passed.
     Limites: No cached Rewrite dependencies/runtime or agent execution.

236. **remote-facade-and-dto — validada.** 1.3.2 → 1.3.3.
     Separate batch structural/item validation from execution atomicity; root List @Valid is not proof of element validation, and existing array wire contracts remain compatible.
     Validação local: passed; integração: passed.
     Limites: No independent agent evaluation or JVM17 runtime; mechanism probe covers specified versions, not a framework matrix.

237. **repository-pattern — validada.** 1.3.2 → 1.3.3.
     Repository Stream needs explicit resource/context lifetime; distinguish cursor from independent materialized DTOs and verify memory behavior.
     Validação local: passed; integração: passed.
     Limites: No SpringData4.1.1 or Java17 runtime/memorybenchmark/agent execution.

238. **requirements-and-acceptance — validada.** 1.1.2 → 1.1.3.
     CSV criteria distinguish spreadsheet formula interpretation from lossless machine import and avoid universal sanitization.
     Validação local: passed; integração: passed.
     Limites: Python unavailable; replacement parserprobe passed; no spreadsheetengine or agent evaluation.

239. **retries-and-backoff — validada.** 1.1.2 → 1.1.3.
     Separate proxy interception, recoverer selection/wrapper failures, noRetryFor and notRecoverable.
     Validação local: passed; integração: passed.
     Limites: Initial fixture advisor misuse corrected; no Framework6.0.23/Java17 runtime or agent evaluation; ambiguity cases walkthrough only.

240. **rpc-and-api-contracts — validada.** 1.1.2 → 1.1.3.
     Normalize optional/ill-typed Problem Details members and unknown extensions before typed mapping; check unknown-field preservation through Protobuf relays.
     Validação local: passed; integração: passed.
     Limites: No decoder/generatedclient/Java compilation or agent run.

241. **safepoints — validada.** 1.3.2 → 1.3.3.
     Differentiate critical FFM transition omission from native-safe calls and G1 JNI pinning; metadata availability is not capture evidence.
     Validação local: passed; integração: passed.
     Limites: No native reproduction/JFRrecording/agent evaluation; tableformat corrected.

242. **scatter-gather — validada.** 1.3.2 → 1.3.3.
     Distinguish impossible strict threshold from useful partial collection and count eligible logical owners across hedges.
     Validação local: passed; integração: passed.
     Limites: Ownerbound is logical inference; no runtime/agent evaluation.

243. **schema-evolution-and-compatibility — validada.** 1.2.3 → 1.2.4.
     Move Properties inline comment out of Boolean value; qualify configured BSR breaking-check activation/default-label enforcement.
     Validação local: passed; integração: passed.
     Limites: No KafkaConfigDef/BSR/registry/agent runtime; empty-dir cleanup rejection resolved literalpath.

244. **scoped-values — validada.** 1.3.2 → 1.3.3.
     Captured absence requires an explicit propagation policy so executing-thread outer tenant cannot leak; null/Optional binding changes reader semantics. Replace unsupported local-variable cost comparison with versioned cache behavior and conditional immutable-context aggregation.
     Validação local: passed; integração: passed.
     Limites: No independent agent, performance or framework runtime evaluation; JEP506 fetch failed, required claims verified in API contracts.

245. **serialization-performance — validada.** 1.1.2 → 1.1.3.
     Include correct compressor finalization and message/session boundary; OOS references/reset/header state changes snapshot semantics.
     Validação local: passed; integração: passed.
     Limites: No Java17 runtime/performance/production/agent evaluation.

246. **service-layer-design — validada.** 1.2.2 → 1.2.3.
     Failure translation must preserve rollback policy and observe commit completion at its owner boundary.
     Validação local: passed; integração: passed.
     Limites: No Spring/JDBC or agent evaluation.

247. **session-state-strategies — validada.** 1.1.2 → 1.1.3.
     SaveMode selects attribute writes while FlushMode controls timing; in-place loaded mutation and stale snapshots need explicit persistence/conflict checks.
     Validação local: passed; integração: passed.
     Limites: No SpringSession jars/runtimeRedis/SQL or agent evaluation.

248. **sharding-and-partitioning — validada.** 1.3.2 → 1.3.3.
     Global last-emitted tuple can support distributed keyset pagination; do not discard unread prefetch or assume cursor gives snapshot.
     Validação local: passed; integração: passed.
     Limites: Algorithm inference/model only; no datastore/concurrency/benchmark/agent run.

249. **sidecar-pattern — validada.** 1.3.3 → 1.3.4.
     Avoid circular startup gates, calculate overlapping init requests and distinguish emptyDir lifecycle/memory charges.
     Validação local: passed; integração: passed.
     Limites: No cluster/agent evaluation; sourceKubernetes1.34.

250. **simd-and-vector-api — validada.** 1.2.2 → 1.2.3.
     Permit deployed CPU/JDK fixed-species specialization with measured benefit and validated fallback; keep preferred default.
     Validação local: passed; integração: passed.
     Limites: No compilation, benchmark or independent agent evaluation; JEP web403 bypassed by successful direct HTTP.

251. **slo-and-alerting — validada.** 1.4.2 → 1.4.3.
     PromQL alerts depend on returned series, including zero; filter bool conditions before set operations and keep varying measurements in annotations.
     Validação local: passed; integração: passed.
     Limites: No promtool/PromQL runtime or independent agent evaluation.

252. **sql-query-performance — validada.** 1.2.2 → 1.2.2.
     Revisada sem alterações. Existing query evidence, plan boundaries, bag/null semantics, keyset and compatibility guidance requires no material correction.
     Validação local: passed; integração: passed.
     Limites: No database-engine plan/performance or agent evaluation; SQLite experimental warning; server CLIs unavailable.

253. **sql-server-performance — validada.** 1.0.2 → 1.0.3.
     NOLOCK changes read semantics and retains schema locks; UPDATE STATISTICS commits independently and may recompile, so external rollback is not restoration.
     Validação local: passed; integração: passed.
     Limites: No SQL runtime or independent agent evaluation; hints Learn page unavailable, official MicrosoftDocs source verified.

254. **startup-cds-crac-leyden — validada.** 2.1.2 → 2.1.3.
     Narrowing transformation filters cannot remove early-hook CDS gate; distinguish stricter AOT-linked cache restrictions and conditional late attach.
     Validação local: passed; integração: passed.
     Limites: No native agent runtime/C toolchain or behavioral evaluation; JEP403 leaves historical claims qualified.

255. **stateless-service-design — validada.** 1.2.2 → 1.2.3.
     Actual per-instance refresh and failure/freshness policy replace assumed convergence; shared sessions require conflict protocol.
     Validação local: passed; integração: passed.
     Limites: No distributed delivery/RTO,Redis or agent evaluation.

256. **stream-processing-runtime-performance — validada.** 1.0.2 → 1.0.3.
     Flink2 unaligned needs EXACTLY_ONCE and concurrency1; distinguish effective graph mode; Kafka heap cache differs from RocksDB native shared budgets/lifetime.
     Validação local: passed; integração: passed.
     Limites: No cluster/benchmark/agent evaluation; exact runtime jars absent.

257. **streaming-pipeline-topologies — validada.** 1.3.2 → 1.3.3.
     Window naming is engine-specific: fixed half-open grid versus Kafka event-aligned inclusive; nonintegral size/step membership bound is ceil.
     Validação local: passed; integração: passed.
     Limites: No engine jars/runtime or agent evaluation.

258. **structured-concurrency — validada.** 1.3.2 → 1.3.3.
     Cancelled fork can return without starting callable, requiring resource cleanup ownership; update verified JDK27 GA still-preview status.
     Validação local: passed; integração: passed.
     Limites: No JDK26/27 runtime or agent evaluation; source fetched via directHTTP after browser failures.

259. **structured-logging — validada.** 1.4.2 → 1.4.3.
     Normal synchronous log return does not acknowledge delivery; independent status is necessary and suppressed status counts cannot quantify losses.
     Validação local: passed; integração: passed.
     Limites: No durability/JDK17 runtime or agent evaluation.

260. **tail-latency-analysis — validada.** 1.3.2 → 1.3.3.
     Causal attribution permits evidenced residual backlog after earlier pause; neither nonoverlap nor proximity alone decides cause.
     Validação local: passed; integração: passed.
     Limites: Teaching model cases not heldout; no production/JFR/gRPC runtime or agent evaluation.

261. **task-queues-and-competing-consumers — validada.** 1.3.3 → 1.3.4.
     Processing/renewal deadline does not revoke last granted timeout; account for in-flight/unknown extensions and delay assumptions.
     Validação local: passed; integração: passed.
     Limites: No broker/agent evaluation; walkthroughs only.

262. **tcp-tuning — validada.** 1.2.2 → 1.2.3.
     Linux6.12 tcp_tw_reuse mode2 is loopback-only; distinguish raw kernel doubled buffers from OpenJDK17.0.16 normalized readback.
     Validação local: passed; integração: passed.
     Limites: No Linux runtime,capture,benchmark or agent evaluation.

263. **tdd — validada.** 1.0.3 → 1.0.3.
     Revisada sem alterações. Existing method/oracle/risk, honest red-test history and runtime boundaries are actionable and consistent; no correction needed.
     Validação local: passed; integração: passed.
     Limites: Historical Java transcripts not rerun; no independent behavioral comparison.

264. **technical-debt-decisions — validada.** 1.1.2 → 1.1.3.
     Reassess future differential costs rather than sunk effort or past deadline benefit; include abandonment/migration/parallel operation.
     Validação local: passed; integração: passed.
     Limites: Walkthroughs only; no independent agent evaluation.

265. **thread-sizing-and-virtual-threads — validada.** 1.3.3 → 1.3.4.
     Same-pool parent/child starvation and permit cycles need dependency repair; virtual daemon lifecycle must await required work.
     Validação local: passed; integração: passed.
     Limites: No JDK17/21 runtime,performance or agent evaluation; JEP444 unavailable,APIverified.

266. **timeouts-and-deadlines — validada.** 1.1.2 → 1.1.3.
     JDBC network expiry closes connection/statements; configure before dispatch, distinguish query cancellation, discard/recover appropriately.
     Validação local: passed; integração: passed.
     Limites: No driver/database runtime or agent evaluation.

267. **unified-logging — validada.** 1.2.2 → 1.2.3.
     Existing-output options can be ignored while selectors/decorators apply; unmentioned selectors persist and global disable is not per-output reset.
     Validação local: passed; integração: passed.
     Limites: No otherJDK/vendor,durability/saturation or agent evaluation; blocked composed cleanup resolved exactfile apply_patch.

268. **universal-scalability-law — validada.** 1.2.2 → 1.2.3.
     Negative unconstrained point estimate alone need not reject nonnegative model; assess joint uncertainty,boundary residuals and evidenced invalidity.
     Validação local: passed; integração: passed.
     Limites: Arithmetic is not statistical fit; Python/R unavailable; no agent evaluation.

269. **varhandles-and-memory-ordering — validada.** 1.2.2 → 1.2.3.
     Distinguish factory/mode support from version-specific backing/coordinate validity; preserve ordering rather than plain fallback. Floating compare-exchange witness equality follows raw bits, so signed zero/NaN require factory-specific comparison.
     Validação local: passed; integração: passed.
     Limites: No independent agent,jcstress,Java17runtime or concurrency/performance proof.

270. **view-and-representation-patterns — validada.** 1.3.2 → 1.3.2.
     Revisada sem alterações. Existing Template/Transform/TwoStep, lazy lifecycle, context encoding, contract and streaming failure guidance requires no material correction.
     Validação local: passed; integração: passed.
     Limites: No runtime/browser/security/performance or independent agent evaluation; examples partial and unchanged.

271. **virtual-thread-migration — validada.** 1.3.2 → 1.3.3.
     Rollback considers causal monitor pinning on21–23; SchedulerMXBean requires24+ and -1 means unknown.
     Validação local: passed; integração: passed.
     Limites: No runtime/benchmark/independent agent; JEP403 replaced with Oracle guides.

272. **virtual-threads-internals — validada.** 1.1.2 → 1.1.2.
     Revisada sem alterações. Versioned pinning, native blind spots, scheduler limits and memory contracts already correct; no material defect.
     Validação local: passed; integração: passed.
     Limites: No compilation,benchmark or independent agent evaluation; snippets unchanged.

273. **zgc-and-shenandoah — validada.** 1.3.2 → 1.3.3.
     Softmax can grow toXmx; Xms floors commitment and equal min/max disables uncommit, delay is eligibility not RSSdeadline.
     Validação local: passed; integração: passed.
     Limites: Launch-only checks do not prove memory return/container/performance; no agent evaluation.

274. **zgc-generational-internals — validada.** 1.3.2 → 1.3.3.
     Describe pointer-metadata invariant without universal mask instruction; correct canonicalJDK25source paths and Bash PID placeholders.
     Validação local: passed; integração: passed.
     Limites: No workload/profiler/agent evaluation; JEP403, taggedsourceverified.

275. **skill-engineering — validada.** 1.0.2 → 1.0.2.
     Revisada sem alterações. Existing scope, authorization, conditional resource routing, evidence proportionality and evaluation exposure/causality rules are coherent and actionable; no material correction justified.
     Validação local: passed; integração: passed.
     Limites: No independent behavioral evaluation; no original/revised comparison because no supported content change. Runtime-neutral skill has no Java execution requirement.

## Checkpoints

- **Checkpoint 1: 3 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests/67 suites; zero failures/skips 275 entries; only the three reviewed version/integrity entries changed.
- **Checkpoint 2: 14 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate (261 unchanged), 355 tests/67 suites; zero failures/skips 275 entries; 14 reviewed entries changed latest, version and integrity (42 insertions/42 deletions).
- **Checkpoint 3: 21 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate (254 unchanged), 355 tests/67 suites; zero failures/skips 275 entries; exactly126 changed lines for21 latest/version/integrity updates, no unrelated fields.
- **Checkpoint 4: 35 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate (240 unchanged), 355 tests/67 suites; zero failures/skips 275 entries; exactly210 changed lines for35 latest/version/integrity updates, no unrelated fields.
- **Checkpoint 5: 49 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips 275 entries; exactly147 added/147 removed lines for49 latest/version/integrity updates; no unrelated fields.
- **Checkpoint 6: 69 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips 275 entries; exactly207 added/207 removed lines for69 latest/version/integrity updates; no unrelated fields.
- **Checkpoint 7: 89 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips 275 entries; all 89 changed entries belong to reviewed skills. Version/hash changes and descriptions for false-sharing-and-contended and feature-scope-analysis; 278 additions/277 removals.
- **Checkpoint 8: 109 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips 275 entries; 109 changed entries restricted to reviewed skills, with expected versions/integrities and four description updates; 345 additions/344 removals.
- **Checkpoint 9: 129 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips 275 entries; 129 reviewed and 128 changed (gof-observer required no change); parsed diff whitelist passed, five descriptions changed.
- **Checkpoint 10: 149 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips 275 entries; 149 reviewed, 146 changed, three reviewed without changes; parsed diff whitelist passed.
- **Checkpoint 11: 169 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips Registry rebuilt: 275 entries; 166 changed packages for 169 accepted reviews; three reviews required no edits. Parsed baseline comparison found no unexpected entries.
- **Checkpoint 12: 189 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips 275 entries; exactly the twenty assigned skills changed relative to checkpoint 11; all 593 previously modified files preserved before index regeneration.
- **Checkpoint 13: 209 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips 275 entries; exactly19 revised package records changed; 658 prior skill files preserved.
- **Checkpoint 14: 229 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips 275 entries; exactly18 revised records changed; two reviews retained unchanged versions;715 prior files preserved.
- **Checkpoint 15: 249 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips Registry has 275 entries; exactly20 expected records changed;770 prior files preserved.
- **Checkpoint 16: 269 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips Registry275; exactly18 expected changed records and2 no-change reviews;829 prior files preserved.
- **Checkpoint 17: 274 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips Registry275; exactly3 expected changed records and2 no-change reviews;884 prior files preserved.
- **Checkpoint 18: 275 skills.** passed: build, boundaries, lint, format, registry consistency, immutable-version gate, 355 tests / 67 suites; zero failures/skips Final registry contains275 entries; unchanged byte-for-byte since checkpoint274. All894 prior skill files preserved; full audit264updated/11unchanged.

## Fila completa

| Skill                                      | Responsável                            | Estado    | Versão | Validação                     |
| ------------------------------------------ | -------------------------------------- | --------- | ------ | ----------------------------- |
| `adapter-sidecar-pattern`                  | /root/review_adapter_sidecar_pattern   | validated | 2.3.2  | local: passed; global: passed |
| `allocation-profiling`                     | /root/review_allocation_profiling      | validated | 2.1.3  | local: passed; global: passed |
| `ambassador-pattern`                       | /root/review_ambassador_pattern        | validated | 1.3.3  | local: passed; global: passed |
| `architecture-and-performance`             | /root/review_adapter_sidecar_pattern   | validated | 1.3.2  | local: passed; global: passed |
| `architecture-characteristics`             | /root/review_allocation_profiling      | validated | 1.2.2  | local: passed; global: passed |
| `architecture-coupling-and-quanta`         | /root/review_ambassador_pattern        | validated | 1.1.3  | local: passed; global: passed |
| `architecture-decision-making`             | /root/review_adapter_sidecar_pattern   | validated | 2.1.3  | local: passed; global: passed |
| `architecture-fitness-functions`           | /root/review_allocation_profiling      | validated | 1.3.2  | local: passed; global: passed |
| `architecture-refactoring-paths`           | /root/review_ambassador_pattern        | validated | 1.4.2  | local: passed; global: passed |
| `architecture-testing`                     | /root/review_architecture_testing      | validated | 1.3.3  | local: passed; global: passed |
| `architecture-trade-off-analysis`          | /root/review_architecture_tradeoffs    | validated | 1.2.3  | local: passed; global: passed |
| `async-profiler-advanced`                  | /root/review_async_profiler_advanced   | validated | 1.3.3  | local: passed; global: passed |
| `blocking-and-nonblocking-io`              | /root/review_blocking_io               | validated | 1.3.3  | local: passed; global: passed |
| `c2-sea-of-nodes`                          | /root/review_adapter_sidecar_pattern   | validated | 1.4.4  | local: passed; global: passed |
| `cache-sharding-and-replication`           | /root/review_allocation_profiling      | validated | 1.3.4  | local: passed; global: passed |
| `caching-strategies`                       | /root/review_ambassador_pattern        | validated | 1.2.3  | local: passed; global: passed |
| `cancellation-and-interruption`            | /root/review_architecture_testing      | validated | 1.1.3  | local: passed; global: passed |
| `capacity-planning`                        | /root/review_architecture_tradeoffs    | validated | 1.3.3  | local: passed; global: passed |
| `cascading-failures`                       | /root/review_blocking_io               | validated | 1.3.3  | local: passed; global: passed |
| `circuit-breakers`                         | /root/review_async_profiler_advanced   | validated | 1.3.3  | local: passed; global: passed |
| `clean-delivery-workflow`                  | /root/review_adapter_sidecar_pattern   | validated | 1.1.3  | local: passed; global: passed |
| `code-cache-segments`                      | /root/review_adapter_sidecar_pattern   | validated | 2.1.3  | local: passed; global: passed |
| `code-review`                              | /root/review_architecture_tradeoffs    | validated | 1.0.3  | local: passed; global: passed |
| `coding-agent-discipline`                  | /root/review_blocking_io               | validated | 1.0.3  | local: passed; global: passed |
| `collaborative-feature-definition`         | /root/review_allocation_profiling      | validated | 1.1.3  | local: passed; global: passed |
| `compilation-and-inlining-logs`            | /root/review_architecture_testing      | validated | 2.0.3  | local: passed; global: passed |
| `completablefuture-composition`            | /root/review_async_profiler_advanced   | validated | 1.2.3  | local: passed; global: passed |
| `component-and-release-boundaries`         | /root/review_ambassador_pattern        | validated | 1.2.3  | local: passed; global: passed |
| `concurrency-diagnostics`                  | /root/review_architecture_tradeoffs    | validated | 1.3.3  | local: passed; global: passed |
| `concurrency-limiting-and-bulkheads`       | /root/review_allocation_profiling      | validated | 1.3.4  | local: passed; global: passed |
| `concurrency-testing`                      | /root/review_blocking_io               | validated | 1.1.3  | local: passed; global: passed |
| `concurrent-collections-and-synchronizers` | /root/review_ambassador_pattern        | validated | 1.2.4  | local: passed; global: passed |
| `connection-pool-sizing`                   | /root/review_architecture_testing      | validated | 1.2.3  | local: passed; global: passed |
| `consensus-and-quorums`                    | /root/review_adapter_sidecar_pattern   | validated | 1.2.3  | local: passed; global: passed |
| `consistency-models`                       | /root/review_async_profiler_advanced   | validated | 1.3.4  | local: passed; global: passed |
| `consistent-hashing`                       | /root/review_architecture_tradeoffs    | validated | 1.2.3  | local: passed; global: passed |
| `container-awareness`                      | /root/review_allocation_profiling      | validated | 1.2.3  | local: passed; global: passed |
| `continuous-profiling`                     | /root/review_ambassador_pattern        | validated | 1.3.3  | local: passed; global: passed |
| `coordinated-omission`                     | /root/review_async_profiler_advanced   | validated | 1.3.3  | local: passed; global: passed |
| `cpu-cache-and-numa`                       | /root/review_architecture_testing      | validated | 1.3.3  | local: passed; global: passed |
| `data-source-patterns`                     | /root/review_adapter_sidecar_pattern   | validated | 1.3.3  | local: passed; global: passed |
| `database-bulk-loading`                    | /root/review_blocking_io               | validated | 1.0.3  | local: passed; global: passed |
| `database-engine-selection-and-migration`  | /root/review_architecture_testing      | validated | 1.0.3  | local: passed; global: passed |
| `database-index-design`                    | /root/review_allocation_profiling      | validated | 1.0.3  | local: passed; global: passed |
| `database-performance`                     | /root/review_blocking_io               | validated | 1.0.3  | local: passed; global: passed |
| `debugging`                                | /root/review_debugging                 | validated | 1.1.3  | local: passed; global: passed |
| `delivery-semantics`                       | /root/review_delivery_semantics        | validated | 1.2.3  | local: passed; global: passed |
| `deoptimization`                           | /root/review_deoptimization            | validated | 2.1.3  | local: passed; global: passed |
| `distributed-aggregation-and-barriers`     | /root/review_distributed_aggregation   | validated | 1.3.4  | local: passed; global: passed |
| `distributed-failure-catalogue`            | /root/review_distributed_failure       | validated | 1.3.3  | local: passed; global: passed |
| `distributed-locks-and-leases`             | /root/review_distributed_locks         | validated | 1.3.3  | local: passed; global: passed |
| `distributed-systems`                      | /root/review_distributed_systems       | validated | 1.3.3  | local: passed; global: passed |
| `distributed-systems-testing`              | /root/review_distributed_testing       | validated | 1.1.3  | local: passed; global: passed |
| `distributed-tracing-design`               | /root/review_distributed_tracing       | validated | 1.3.3  | local: passed; global: passed |
| `distributed-transactions-and-sagas`       | /root/review_distributed_sagas         | validated | 1.3.4  | local: passed; global: passed |
| `distribution-boundaries`                  | /root/review_distribution_boundaries   | validated | 1.2.3  | local: passed; global: passed |
| `domain-logic-organization`                | /root/review_domain_logic              | validated | 1.3.4  | local: passed; global: passed |
| `ebpf-for-jvm`                             | /root/review_ebpf                      | validated | 2.1.3  | local: passed; global: passed |
| `engineering-communication`                | /root/review_engineering_communication | validated | 1.1.3  | local: passed; global: passed |
| `enterprise-application-architecture`      | /root/review_enterprise_architecture   | validated | 1.2.5  | local: passed; global: passed |
| `enterprise-architecture-smells`           | /root/review_enterprise_smells         | validated | 1.2.3  | local: passed; global: passed |
| `enterprise-base-patterns`                 | /root/review_enterprise_base           | validated | 1.2.3  | local: passed; global: passed |
| `enterprise-transactions`                  | /root/review_enterprise_transactions   | validated | 1.3.3  | local: passed; global: passed |
| `epsilon-and-shenandoah-internals`         | /root/review_epsilon_shenandoah        | validated | 2.1.3  | local: passed; global: passed |
| `escape-analysis-internals`                | /root/review_escape_analysis           | validated | 2.0.3  | local: passed; global: passed |
| `estimation-under-uncertainty`             | /root/review_debugging                 | validated | 1.1.3  | local: passed; global: passed |
| `event-driven-architecture`                | /root/review_distributed_aggregation   | validated | 1.3.3  | local: passed; global: passed |
| `event-sourcing`                           | /root/review_delivery_semantics        | validated | 1.2.3  | local: passed; global: passed |
| `executors-and-task-lifecycle`             | /root/review_deoptimization            | validated | 1.3.3  | local: passed; global: passed |
| `failure-models`                           | /root/review_distributed_failure       | validated | 1.3.3  | local: passed; global: passed |
| `false-sharing-and-contended`              | /root/review_distributed_systems       | validated | 1.1.3  | local: passed; global: passed |
| `feature-architecture-analysis`            | /root/review_distributed_locks         | validated | 1.1.3  | local: passed; global: passed |
| `feature-context-analysis`                 | /root/review_distribution_boundaries   | validated | 1.1.3  | local: passed; global: passed |
| `feature-contract-definition`              | /root/review_engineering_communication | validated | 1.0.3  | local: passed; global: passed |
| `feature-decision-analysis`                | /root/review_enterprise_smells         | validated | 1.2.3  | local: passed; global: passed |
| `feature-decomposition`                    | /root/review_distributed_testing       | validated | 1.1.3  | local: passed; global: passed |
| `feature-discovery`                        | /root/review_distributed_tracing       | validated | 1.1.3  | local: passed; global: passed |
| `feature-engineering`                      | /root/review_domain_logic              | validated | 1.1.4  | local: passed; global: passed |
| `feature-execution`                        | /root/review_debugging                 | validated | 1.1.3  | local: passed; global: passed |
| `feature-feasibility-experiment`           | /root/review_distributed_aggregation   | validated | 1.0.3  | local: passed; global: passed |
| `feature-implementation-plan`              | /root/review_epsilon_shenandoah        | validated | 1.1.3  | local: passed; global: passed |
| `feature-progress-tracking`                | /root/review_ebpf                      | validated | 1.2.3  | local: passed; global: passed |
| `feature-readiness-review`                 | /root/review_enterprise_architecture   | validated | 1.2.3  | local: passed; global: passed |
| `feature-requirement-clarification`        | /root/review_enterprise_transactions   | validated | 1.1.3  | local: passed; global: passed |
| `feature-risk-analysis`                    | /root/review_distributed_sagas         | validated | 1.2.3  | local: passed; global: passed |
| `feature-scope-analysis`                   | /root/review_deoptimization            | validated | 1.1.3  | local: passed; global: passed |
| `feature-solution-analysis`                | /root/review_delivery_semantics        | validated | 1.1.3  | local: passed; global: passed |
| `flame-graph-analysis`                     | /root/review_enterprise_base           | validated | 1.4.3  | local: passed; global: passed |
| `forkjoinpool-and-work-stealing`           | /root/review_escape_analysis           | validated | 1.1.3  | local: passed; global: passed |
| `framework-coupling-and-independence`      | /root/review_distributed_failure       | validated | 1.2.4  | local: passed; global: passed |
| `g1-concurrent-marking`                    | /root/review_distributed_systems       | validated | 1.3.3  | local: passed; global: passed |
| `g1-internals`                             | /root/review_distributed_locks         | validated | 1.3.3  | local: passed; global: passed |
| `g1-tuning-for-slo`                        | /root/review_distribution_boundaries   | validated | 2.1.3  | local: passed; global: passed |
| `gc-fundamentals`                          | /root/review_engineering_communication | validated | 1.4.3  | local: passed; global: passed |
| `gc-log-analysis`                          | /root/review_enterprise_smells         | validated | 1.4.3  | local: passed; global: passed |
| `gof-abstract-factory`                     | /root/review_distributed_testing       | validated | 1.2.3  | local: passed; global: passed |
| `gof-adapter`                              | /root/review_distributed_tracing       | validated | 1.3.3  | local: passed; global: passed |
| `gof-bridge`                               | /root/review_domain_logic              | validated | 1.2.3  | local: passed; global: passed |
| `gof-builder`                              | /root/review_debugging                 | validated | 1.2.3  | local: passed; global: passed |
| `gof-chain-of-responsibility`              | /root/review_distributed_aggregation   | validated | 1.2.3  | local: passed; global: passed |
| `gof-command`                              | /root/review_epsilon_shenandoah        | validated | 1.2.3  | local: passed; global: passed |
| `gof-composite`                            | /root/review_ebpf                      | validated | 1.2.3  | local: passed; global: passed |
| `gof-decorator`                            | /root/review_enterprise_architecture   | validated | 1.2.3  | local: passed; global: passed |
| `gof-facade`                               | /root/review_distributed_sagas         | validated | 1.2.3  | local: passed; global: passed |
| `gof-factory-method`                       | /root/review_delivery_semantics        | validated | 1.2.3  | local: passed; global: passed |
| `gof-flyweight`                            | /root/review_deoptimization            | validated | 1.2.3  | local: passed; global: passed |
| `gof-interpreter`                          | /root/review_enterprise_transactions   | validated | 1.2.3  | local: passed; global: passed |
| `gof-iterator`                             | /root/review_enterprise_base           | validated | 1.2.3  | local: passed; global: passed |
| `gof-mediator`                             | /root/review_escape_analysis           | validated | 1.2.3  | local: passed; global: passed |
| `gof-memento`                              | /root/review_distributed_failure       | validated | 1.2.3  | local: passed; global: passed |
| `gof-observer`                             | /root/review_enterprise_smells         | validated | 1.2.3  | local: passed; global: passed |
| `gof-pattern-antipatterns`                 | /root/review_distributed_testing       | validated | 1.2.3  | local: passed; global: passed |
| `gof-pattern-confusion`                    | /root/review_distributed_locks         | validated | 1.2.3  | local: passed; global: passed |
| `gof-pattern-selection`                    | /root/review_distributed_systems       | validated | 1.3.3  | local: passed; global: passed |
| `gof-pattern-thinking`                     | /root/review_engineering_communication | validated | 1.3.3  | local: passed; global: passed |
| `gof-patterns-and-distribution`            | /root/review_distribution_boundaries   | validated | 1.3.3  | local: passed; global: passed |
| `gof-patterns-in-modern-java`              | /root/review_deoptimization            | validated | 1.3.3  | local: passed; global: passed |
| `gof-prototype`                            | /root/review_epsilon_shenandoah        | validated | 1.2.3  | local: passed; global: passed |
| `gof-proxy`                                | /root/review_debugging                 | validated | 1.2.3  | local: passed; global: passed |
| `gof-singleton`                            | /root/review_escape_analysis           | validated | 1.2.3  | local: passed; global: passed |
| `gof-state`                                | /root/review_distributed_tracing       | validated | 1.2.3  | local: passed; global: passed |
| `gof-strategy`                             | /root/review_domain_logic              | validated | 1.2.3  | local: passed; global: passed |
| `gof-template-method`                      | /root/review_enterprise_transactions   | validated | 1.2.3  | local: passed; global: passed |
| `gof-visitor`                              | /root/review_enterprise_base           | validated | 1.2.3  | local: passed; global: passed |
| `graalvm-jit`                              | /root/review_ebpf                      | validated | 2.1.3  | local: passed; global: passed |
| `graalvm-native-image`                     | /root/review_distributed_aggregation   | validated | 2.0.3  | local: passed; global: passed |
| `grpc-http2-service-mesh-performance`      | /root/review_distributed_sagas         | validated | 1.0.3  | local: passed; global: passed |
| `heap-dump-analysis`                       | /root/review_enterprise_architecture   | validated | 1.3.4  | local: passed; global: passed |
| `hot-partitions-and-rebalancing`           | /root/review_delivery_semantics        | validated | 1.3.4  | local: passed; global: passed |
| `humble-objects-and-functional-core`       | /root/review_enterprise_smells         | validated | 1.2.3  | local: passed; global: passed |
| `idempotency`                              | /root/review_distributed_failure       | validated | 1.2.3  | local: passed; global: passed |
| `incident-evidence-capture`                | /root/review_engineering_communication | validated | 1.3.3  | local: passed; global: passed |
| `inheritance-mapping-strategies`           | /root/review_distributed_locks         | validated | 1.3.3  | local: passed; global: passed |
| `io-uring-and-zero-copy`                   | /root/review_distributed_systems       | validated | 1.2.3  | local: passed; global: passed |
| `java-annotations`                         | /root/review_distribution_boundaries   | validated | 1.2.3  | local: passed; global: passed |
| `java-api-design`                          | /root/review_escape_analysis           | validated | 1.2.3  | local: passed; global: passed |
| `java-application-security-basics`         | /root/review_distributed_testing       | validated | 1.3.3  | local: passed; global: passed |
| `java-clean-code`                          | /root/review_deoptimization            | validated | 2.2.3  | local: passed; global: passed |
| `java-code-smells`                         | /root/review_distributed_sagas         | validated | 1.4.3  | local: passed; global: passed |
| `java-cohesion-coupling`                   | /root/review_enterprise_base           | validated | 1.2.3  | local: passed; global: passed |
| `java-composition-over-inheritance`        | /root/review_enterprise_transactions   | validated | 1.2.4  | local: passed; global: passed |
| `java-concurrency`                         | /root/review_distributed_tracing       | validated | 1.2.3  | local: passed; global: passed |
| `java-defensive-programming`               | /root/review_domain_logic              | validated | 1.2.3  | local: passed; global: passed |
| `java-dependency-inversion`                | /root/review_ebpf                      | validated | 1.2.3  | local: passed; global: passed |
| `java-design-by-contract`                  | /root/review_distributed_aggregation   | validated | 1.2.3  | local: passed; global: passed |
| `java-dry-kiss-yagni`                      | /root/review_enterprise_architecture   | validated | 1.2.2  | local: passed; global: passed |
| `java-enums`                               | /root/review_delivery_semantics        | validated | 1.2.3  | local: passed; global: passed |
| `java-exception-design`                    | /root/review_epsilon_shenandoah        | validated | 1.3.3  | local: passed; global: passed |
| `java-fluent-apis`                         | /root/review_debugging                 | validated | 1.2.4  | local: passed; global: passed |
| `java-generics`                            | /root/review_enterprise_smells         | validated | 1.2.3  | local: passed; global: passed |
| `java-immutability`                        | /root/review_distributed_failure       | validated | 1.2.4  | local: passed; global: passed |
| `java-lambdas-and-functional-interfaces`   | /root/review_distributed_systems       | validated | 1.3.4  | local: passed; global: passed |
| `java-law-of-demeter`                      | /root/review_engineering_communication | validated | 1.2.3  | local: passed; global: passed |
| `java-legacy-code-testing`                 | /root/review_distributed_locks         | validated | 1.1.3  | local: passed; global: passed |
| `java-memory-model`                        | /root/review_enterprise_base           | validated | 1.3.3  | local: passed; global: passed |
| `java-null-safety`                         | /root/review_distributed_tracing       | validated | 1.2.3  | local: passed; global: passed |
| `java-numeric-types`                       | /root/review_enterprise_architecture   | validated | 1.2.3  | local: passed; global: passed |
| `java-object-construction`                 | /root/review_distributed_testing       | validated | 1.3.3  | local: passed; global: passed |
| `java-object-contracts`                    | /root/review_deoptimization            | validated | 1.2.3  | local: passed; global: passed |
| `java-optional`                            | /root/review_ebpf                      | validated | 1.2.3  | local: passed; global: passed |
| `java-performance`                         | /root/review_distributed_aggregation   | validated | 2.6.3  | local: passed; global: passed |
| `java-refactoring`                         | /root/review_distribution_boundaries   | validated | 1.4.3  | local: passed; global: passed |
| `java-reference-types-and-leaks`           | /root/review_escape_analysis           | validated | 1.3.3  | local: passed; global: passed |
| `java-reflection-and-method-handles`       | /root/review_enterprise_transactions   | validated | 1.4.4  | local: passed; global: passed |
| `java-resource-management`                 | /root/review_distributed_sagas         | validated | 1.2.3  | local: passed; global: passed |
| `java-serialization-hardening`             | /root/review_delivery_semantics        | validated | 1.2.3  | local: passed; global: passed |
| `java-solid`                               | /root/review_domain_logic              | validated | 1.2.3  | local: passed; global: passed |
| `java-streams`                             | /root/review_epsilon_shenandoah        | validated | 1.2.3  | local: passed; global: passed |
| `java-strings-and-text`                    | /root/review_debugging                 | validated | 1.2.3  | local: passed; global: passed |
| `java-tell-dont-ask`                       | /root/review_01                        | validated | 1.2.3  | local: passed; global: passed |
| `java-test-design`                         | /root/review_02                        | validated | 1.0.3  | local: passed; global: passed |
| `java-test-doubles`                        | /root/review_03                        | validated | 1.0.4  | local: passed; global: passed |
| `java-testing-strategy`                    | /root/review_04                        | validated | 1.0.4  | local: passed; global: passed |
| `java-thread-safety-contracts`             | /root/review_05                        | validated | 1.2.3  | local: passed; global: passed |
| `jdk-upgrade-impact`                       | /root/review_06                        | validated | 1.2.3  | local: passed; global: passed |
| `jfr-advanced`                             | /root/review_07                        | validated | 1.3.3  | local: passed; global: passed |
| `jfr-and-async-profiler`                   | /root/review_08                        | validated | 1.4.3  | local: passed; global: passed |
| `jhsdb-and-core-dumps`                     | /root/review_09                        | validated | 1.3.3  | local: passed; global: passed |
| `jit-compilation`                          | /root/review_10                        | validated | 1.3.3  | local: passed; global: passed |
| `jit-inlining-and-escape-analysis`         | /root/review_11                        | validated | 2.1.3  | local: passed; global: passed |
| `jmh-advanced`                             | /root/review_12                        | validated | 1.2.3  | local: passed; global: passed |
| `jmh-microbenchmarks`                      | /root/review_13                        | validated | 1.4.3  | local: passed; global: passed |
| `jni-and-ffm`                              | /root/review_14                        | validated | 1.3.3  | local: passed; global: passed |
| `jvm-bytecode`                             | /root/review_15                        | validated | 2.1.3  | local: passed; global: passed |
| `jvm-class-loading`                        | /root/review_16                        | validated | 1.4.3  | local: passed; global: passed |
| `jvm-gc-tuning`                            | /root/review_17                        | validated | 2.5.3  | local: passed; global: passed |
| `jvm-memory-regions`                       | /root/review_18                        | validated | 1.6.4  | local: passed; global: passed |
| `jvm-ml-inference`                         | /root/review_19                        | validated | 1.0.3  | local: passed; global: passed |
| `jvm-performance-review`                   | /root/review_20                        | validated | 1.3.3  | local: passed; global: passed |
| `kafka-consumers-in-java`                  | /root/review_01                        | validated | 1.3.3  | local: passed; global: passed |
| `kubernetes-service-lifecycle`             | /root/review_02                        | validated | 1.3.3  | local: passed; global: passed |
| `latency-statistics`                       | /root/review_03                        | validated | 1.4.3  | local: passed; global: passed |
| `layering-and-boundaries`                  | /root/review_04                        | validated | 1.2.3  | local: passed; global: passed |
| `leader-election`                          | /root/review_05                        | validated | 1.3.3  | local: passed; global: passed |
| `legacy-enterprise-modernization`          | /root/review_06                        | validated | 1.2.3  | local: passed; global: passed |
| `linux-for-jvm`                            | /root/review_07                        | validated | 1.3.3  | local: passed; global: passed |
| `littles-law-and-queueing`                 | /root/review_08                        | validated | 1.5.3  | local: passed; global: passed |
| `load-balancing-and-routing`               | /root/review_09                        | validated | 1.2.3  | local: passed; global: passed |
| `load-testing`                             | /root/review_10                        | validated | 1.4.3  | local: passed; global: passed |
| `load-testing-advanced`                    | /root/review_11                        | validated | 1.3.2  | local: passed; global: passed |
| `lock-free-patterns`                       | /root/review_12                        | validated | 1.2.3  | local: passed; global: passed |
| `lock-inflation`                           | /root/review_13                        | validated | 1.2.3  | local: passed; global: passed |
| `low-latency-jvm`                          | /root/review_14                        | validated | 1.0.3  | local: passed; global: passed |
| `message-ordering-and-partitioning`        | /root/review_15                        | validated | 1.3.4  | local: passed; global: passed |
| `metadata-mapping`                         | /root/review_16                        | validated | 1.3.3  | local: passed; global: passed |
| `metaspace-internals`                      | /root/review_17                        | validated | 1.3.3  | local: passed; global: passed |
| `metrics-and-cardinality`                  | /root/review_18                        | validated | 1.3.3  | local: passed; global: passed |
| `mvc-and-request-handling`                 | /root/review_19                        | validated | 1.3.3  | local: passed; global: passed |
| `mysql-innodb-performance`                 | /root/review_20                        | validated | 1.0.3  | local: passed; global: passed |
| `numa-and-cpu-affinity`                    | /root/review_01                        | validated | 1.2.3  | local: passed; global: passed |
| `object-layout-and-footprint`              | /root/review_02                        | validated | 1.4.3  | local: passed; global: passed |
| `off-heap-memory`                          | /root/review_03                        | validated | 1.3.2  | local: passed; global: passed |
| `offline-concurrency-control`              | /root/review_04                        | validated | 1.2.3  | local: passed; global: passed |
| `opentelemetry-performance`                | /root/review_05                        | validated | 1.2.3  | local: passed; global: passed |
| `orm-behavioral-patterns`                  | /root/review_06                        | validated | 1.3.3  | local: passed; global: passed |
| `orm-fetch-and-batching-performance`       | /root/review_07                        | validated | 1.2.3  | local: passed; global: passed |
| `orm-structural-mapping`                   | /root/review_08                        | validated | 1.3.3  | local: passed; global: passed |
| `pattern-selection-and-composition`        | /root/review_09                        | validated | 1.3.4  | local: passed; global: passed |
| `patterns-and-modern-frameworks`           | /root/review_10                        | validated | 1.2.3  | local: passed; global: passed |
| `pause-attribution`                        | /root/review_11                        | validated | 1.4.3  | local: passed; global: passed |
| `performance-engineering-program`          | /root/review_12                        | validated | 1.0.2  | local: passed; global: passed |
| `performance-incident-response`            | /root/review_13                        | validated | 1.0.3  | local: passed; global: passed |
| `performance-methodology`                  | /root/review_14                        | validated | 1.4.3  | local: passed; global: passed |
| `performance-regression-ci`                | /root/review_15                        | validated | 1.1.3  | local: passed; global: passed |
| `poison-messages-and-dlq`                  | /root/review_16                        | validated | 1.2.3  | local: passed; global: passed |
| `postgresql-performance`                   | /root/review_17                        | validated | 1.0.3  | local: passed; global: passed |
| `project-valhalla`                         | /root/review_18                        | validated | 1.0.3  | local: passed; global: passed |
| `quality-gates`                            | /root/review_19                        | validated | 1.0.4  | local: passed; global: passed |
| `query-objects-and-specifications`         | /root/review_20                        | validated | 1.3.3  | local: passed; global: passed |
| `queueing-models`                          | /root/review_01                        | validated | 1.3.3  | local: passed; global: passed |
| `rate-limiting-and-load-shedding`          | /root/review_02                        | validated | 1.3.3  | local: passed; global: passed |
| `reactive-and-virtual-thread-selection`    | /root/review_03                        | validated | 1.3.4  | local: passed; global: passed |
| `reactive-backpressure`                    | /root/review_04                        | validated | 1.1.3  | local: passed; global: passed |
| `reading-jit-assembly`                     | /root/review_05                        | validated | 1.2.3  | local: passed; global: passed |
| `refactoring-automation`                   | /root/review_06                        | validated | 1.1.3  | local: passed; global: passed |
| `remote-facade-and-dto`                    | /root/review_07                        | validated | 1.3.3  | local: passed; global: passed |
| `repository-pattern`                       | /root/review_08                        | validated | 1.3.3  | local: passed; global: passed |
| `requirements-and-acceptance`              | /root/review_09                        | validated | 1.1.3  | local: passed; global: passed |
| `retries-and-backoff`                      | /root/review_10                        | validated | 1.1.3  | local: passed; global: passed |
| `rpc-and-api-contracts`                    | /root/review_11                        | validated | 1.1.3  | local: passed; global: passed |
| `safepoints`                               | /root/review_12                        | validated | 1.3.3  | local: passed; global: passed |
| `scatter-gather`                           | /root/review_13                        | validated | 1.3.3  | local: passed; global: passed |
| `schema-evolution-and-compatibility`       | /root/review_14                        | validated | 1.2.4  | local: passed; global: passed |
| `scoped-values`                            | /root/review_15                        | validated | 1.3.3  | local: passed; global: passed |
| `serialization-performance`                | /root/review_16                        | validated | 1.1.3  | local: passed; global: passed |
| `service-layer-design`                     | /root/review_17                        | validated | 1.2.3  | local: passed; global: passed |
| `session-state-strategies`                 | /root/review_18                        | validated | 1.1.3  | local: passed; global: passed |
| `sharding-and-partitioning`                | /root/review_19                        | validated | 1.3.3  | local: passed; global: passed |
| `sidecar-pattern`                          | /root/review_20                        | validated | 1.3.4  | local: passed; global: passed |
| `simd-and-vector-api`                      | /root/review_01                        | validated | 1.2.3  | local: passed; global: passed |
| `slo-and-alerting`                         | /root/review_02                        | validated | 1.4.3  | local: passed; global: passed |
| `sql-query-performance`                    | /root/review_03                        | validated | 1.2.2  | local: passed; global: passed |
| `sql-server-performance`                   | /root/review_04                        | validated | 1.0.3  | local: passed; global: passed |
| `startup-cds-crac-leyden`                  | /root/review_05                        | validated | 2.1.3  | local: passed; global: passed |
| `stateless-service-design`                 | /root/review_06                        | validated | 1.2.3  | local: passed; global: passed |
| `stream-processing-runtime-performance`    | /root/review_07                        | validated | 1.0.3  | local: passed; global: passed |
| `streaming-pipeline-topologies`            | /root/review_08                        | validated | 1.3.3  | local: passed; global: passed |
| `structured-concurrency`                   | /root/review_09                        | validated | 1.3.3  | local: passed; global: passed |
| `structured-logging`                       | /root/review_10                        | validated | 1.4.3  | local: passed; global: passed |
| `tail-latency-analysis`                    | /root/review_11                        | validated | 1.3.3  | local: passed; global: passed |
| `task-queues-and-competing-consumers`      | /root/review_12                        | validated | 1.3.4  | local: passed; global: passed |
| `tcp-tuning`                               | /root/review_13                        | validated | 1.2.3  | local: passed; global: passed |
| `tdd`                                      | /root/review_14                        | validated | 1.0.3  | local: passed; global: passed |
| `technical-debt-decisions`                 | /root/review_15                        | validated | 1.1.3  | local: passed; global: passed |
| `thread-sizing-and-virtual-threads`        | /root/review_16                        | validated | 1.3.4  | local: passed; global: passed |
| `timeouts-and-deadlines`                   | /root/review_17                        | validated | 1.1.3  | local: passed; global: passed |
| `unified-logging`                          | /root/review_18                        | validated | 1.2.3  | local: passed; global: passed |
| `universal-scalability-law`                | /root/review_19                        | validated | 1.2.3  | local: passed; global: passed |
| `varhandles-and-memory-ordering`           | /root/review_20                        | validated | 1.2.3  | local: passed; global: passed |
| `view-and-representation-patterns`         | /root/review_03                        | validated | 1.3.2  | local: passed; global: passed |
| `virtual-thread-migration`                 | /root/review_14                        | validated | 1.3.3  | local: passed; global: passed |
| `virtual-threads-internals`                | /root/review_01                        | validated | 1.1.2  | local: passed; global: passed |
| `zgc-and-shenandoah`                       | /root/review_02                        | validated | 1.3.3  | local: passed; global: passed |
| `zgc-generational-internals`               | /root/review_04                        | validated | 1.3.3  | local: passed; global: passed |
| `skill-engineering`                        | /root/review_05                        | validated | 1.0.2  | local: passed; global: passed |
