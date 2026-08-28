# GAPS — coverage analysis, agent-skills

**Date:** 2026-08-28. Companion to [AUDIT.md](AUDIT.md). Derived from a full read of all 240
shipped descriptions plus targeted probes of the corpus.

**Status: this is the Phase 2 record as taken, kept for the reasoning. All five gaps it
identified have since been closed — four by new skills and one by a reference — and the
framework question has been decided. Verdicts below are annotated in place; the outcome of each
is in [CHANGELOG.md](CHANGELOG.md).**

---

## 1. What this catalogue actually is

The brief supplies a reference taxonomy for _JVM engineering and performance_. The catalogue has
outgrown that framing, and the gap analysis is only honest if that is said first. Derived from the
240 skills themselves, the real domain taxonomy is:

| Domain                            | Skills | Note                                                        |
| --------------------------------- | -----: | ----------------------------------------------------------- |
| JVM runtime and performance       |    ~62 | GC, JIT, memory, profiling, benchmarking, OS/hardware       |
| Distributed systems and messaging |    ~45 | Delivery, ordering, consensus, sharding, resilience         |
| Java language craftsmanship       |    ~35 | The `java-*` family: types, contracts, API design           |
| Gang-of-Four design patterns      |    ~23 | 17 patterns + 6 meta-skills                                 |
| Enterprise / PoEAA architecture   |    ~22 | Layering, ORM patterns, transactions, service layer         |
| Architecture governance           |     ~8 | Characteristics, ADRs, fitness functions, trade-off method  |
| Platform and Kubernetes           |     ~8 | Probes, sidecars, lifecycle, load balancing                 |
| Testing                           |     ~8 | Strategy, design, doubles, TDD, legacy, concurrency, arch   |
| Engineering process and delivery  |     ~9 | Review, gates, debt, estimation, communication, agent rules |

**Roughly a quarter of the catalogue is JVM performance.** The rest is a general senior-Java
engineering corpus. This matters for two reasons: the coverage map below is scored against the
brief's taxonomy and therefore scores only the JVM quarter; and `SKILLS.md` will need a scope
statement that describes the whole thing, not the quarter.

---

## 2. Coverage map — the brief's reference taxonomy

| #   | Area                                                         | Verdict                                 | Owners                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Memory management and garbage collection                     | **COVERED**                             | `gc-fundamentals`, `gc-log-analysis`, `jvm-gc-tuning`, `g1-internals`, `g1-concurrent-marking`, `g1-tuning-for-slo`, `zgc-and-shenandoah`, `zgc-generational-internals`, `epsilon-and-shenandoah-internals`, `pause-attribution`, `safepoints`                                                                                                                |
| 2   | Heap sizing, tuning, container/cgroup awareness              | **COVERED**                             | `jvm-memory-regions`, `container-awareness`, `linux-for-jvm`, `metaspace-internals`, `off-heap-memory`, `object-layout-and-footprint`                                                                                                                                                                                                                         |
| 3   | JIT compilation and code optimization                        | **COVERED**                             | `jit-compilation`, `jit-inlining-and-escape-analysis`, `c2-sea-of-nodes`, `escape-analysis-internals`, `deoptimization`, `compilation-and-inlining-logs`, `code-cache-segments`, `reading-jit-assembly`, `graalvm-jit`, `jvm-bytecode`, `simd-and-vector-api`                                                                                                 |
| 4   | Concurrency, JMM, locks, lock-free                           | **COVERED**                             | `java-memory-model`, `java-thread-safety-contracts`, `lock-inflation`, `lock-free-patterns`, `varhandles-and-memory-ordering`, `false-sharing-and-contended`, `concurrent-collections-and-synchronizers`, `executors-and-task-lifecycle`, `forkjoinpool-and-work-stealing`, `cancellation-and-interruption`, `concurrency-diagnostics`, `concurrency-testing` |
| 5   | Virtual threads and structured concurrency                   | **COVERED**                             | `thread-sizing-and-virtual-threads`, `virtual-threads-internals`, `virtual-thread-migration`, `structured-concurrency`, `scoped-values`, `blocking-and-nonblocking-io`, `reactive-and-virtual-thread-selection`                                                                                                                                               |
| 6   | Profiling and continuous profiling                           | **COVERED**                             | `jfr-and-async-profiler`, `jfr-advanced`, `async-profiler-advanced`, `flame-graph-analysis`, `continuous-profiling`, `allocation-profiling`, `ebpf-for-jvm`                                                                                                                                                                                                   |
| 7   | Observability: JFR, metrics, tracing, logging overhead       | **COVERED**                             | `unified-logging`, `structured-logging`, `metrics-and-cardinality`, `distributed-tracing-design`, `opentelemetry-performance`, `slo-and-alerting`                                                                                                                                                                                                             |
| 8   | Benchmarking and measurement methodology                     | **COVERED**                             | `jmh-microbenchmarks`, `jmh-advanced`, `performance-methodology`, `performance-regression-ci`                                                                                                                                                                                                                                                                 |
| 9   | Latency analysis, percentiles, coordinated omission          | **COVERED**                             | `latency-statistics`, `coordinated-omission`, `tail-latency-analysis`                                                                                                                                                                                                                                                                                         |
| 10  | Throughput and capacity/load testing                         | **COVERED**                             | `load-testing`, `load-testing-advanced`, `capacity-planning`, `littles-law-and-queueing`, `queueing-models`, `universal-scalability-law`                                                                                                                                                                                                                      |
| 11  | Startup, warmup, AOT/CDS, native image                       | **COVERED**                             | `startup-cds-crac-leyden`, `graalvm-native-image`, `jvm-class-loading`, `jit-compilation`                                                                                                                                                                                                                                                                     |
| 12  | I/O, networking, serialization, connection pooling           | **COVERED**                             | `blocking-and-nonblocking-io`, `io-uring-and-zero-copy`, `tcp-tuning`, `serialization-performance`, `connection-pool-sizing`, `jni-and-ffm`                                                                                                                                                                                                                   |
| 13  | **Data access: JDBC, ORM, query and pooling performance**    | ~~PARTIAL~~ → **COVERED**               | pooling only — `connection-pool-sizing`. See G-01.                                                                                                                                                                                                                                                                                                            |
| 14  | **Framework-layer performance (Spring/Quarkus)**             | ~~PARTIAL~~ → **OUT OF SCOPE, decided** | scattered — `reactive-and-virtual-thread-selection`, `patterns-and-modern-frameworks`, `actuator`-adjacent material absent. See G-04.                                                                                                                                                                                                                         |
| 15  | Production diagnostics: heap dumps, thread dumps, OOM, leaks | **COVERED**                             | `heap-dump-analysis`, `jhsdb-and-core-dumps`, `java-reference-types-and-leaks`, `jvm-memory-regions`, `concurrency-diagnostics`, `metaspace-internals`                                                                                                                                                                                                        |
| 16  | **Incident response and regression triage**                  | ~~PARTIAL~~ → **COVERED**               | CI-side covered by `performance-regression-ci`; pattern recognition by `distributed-failure-catalogue`; live evidence capture has no owner. See G-03.                                                                                                                                                                                                         |
| 17  | Performance code review and PR gating                        | **COVERED**                             | `jvm-performance-review`, `code-review`, `performance-regression-ci`, `quality-gates`, `architecture-fitness-functions`                                                                                                                                                                                                                                       |
| 18  | **JDK migration and version-upgrade impact**                 | ~~PARTIAL~~ → **COVERED**               | flags only, inside `jvm-performance-review`. See G-02.                                                                                                                                                                                                                                                                                                        |
| 19  | **Documenting and communicating performance findings**       | ~~PARTIAL~~ → **COVERED**               | `engineering-communication` is general-purpose. See G-05.                                                                                                                                                                                                                                                                                                     |

**As assessed: 14 COVERED / 5 PARTIAL / 0 MISSING. As it stands now: 18 COVERED, 1 decided out of scope.** For a catalogue of this size that is a strong
result — and the five partials are not evenly important.

---

## 3. The gaps, classified

### G-01 — Query and ORM performance _(highest priority)_

**What is missing.** Nothing owns: reading an execution plan, choosing an index, why a query does
a full scan, JPA/Hibernate fetch strategy, N+1 as a thing to _fix_ rather than to _notice_, batch
sizing, the second-level cache, projection versus entity loading, pagination cost.

**Evidence it is genuinely absent.** A grep for `execution plan|query plan|EXPLAIN ANALYZE|covering
index|index scan` across all 758 Markdown files returns three hits, all descriptive rather than
prescriptive: `architecture-and-performance/SKILL.md` and its
`references/request-path-budget.md`, plus one unrelated mention in
`skill-engineering/references/evaluation.md`. `N+1` appears in ten files, and every one of them
either _detects_ it (`architecture-testing`, `connection-pool-sizing/references/incident-triage.md`)
or _budgets_ for it (`architecture-and-performance/references/persistence-cost-model.md`). No skill
tells you what to do about it.

**Why it matters for this audience.** For most JVM services in production, the database is the
dominant latency term. A catalogue that can decompose a p99 across safepoints, TTSP, code cache
segments and NUMA nodes — and then hands the reader nothing when the answer is a missing index —
has its depth in the wrong place relative to base rates.

**Frequency:** **High.** Plausibly the most common real cause a JVM performance engineer meets.

**Form:** a new skill, or two. The catalogue's own granularity convention argues for two:

- **`sql-query-performance`** — reading an execution plan, index selection and selectivity, the
  scan-versus-seek decision, pagination cost, statistics staleness, parameter sniffing.
- **`orm-fetch-and-batching-performance`** — fetch strategy and join fetch, N+1 remediation,
  `@BatchSize`, projections over entity graphs, the persistence-context cost model, bulk writes.

Draft description for the second, written to the catalogue's own convention:

> Making JPA and Hibernate stop issuing the queries you did not ask for: fetch strategy and join
> fetch, N+1 remediation and why `EAGER` is not the fix, `@BatchSize` and batch inserts, DTO
> projections instead of entity graphs, and the cost of a growing persistence context. Use when the
> query count scales with rows rendered, when a page issues hundreds of selects, when `LAZY` was
> changed to `EAGER` to make an exception go away, when a bulk write is one `INSERT` per row, or
> when a read path loads whole aggregates to display three fields. Does not cover the index and the
> execution plan beneath the query (`sql-query-performance`), pool sizing (`connection-pool-sizing`),
> the runtime patterns themselves (`orm-behavioral-patterns`), or where the mapping lives
> (`metadata-mapping`).

**Boundary note.** `orm-behavioral-patterns`, `orm-structural-mapping`, `data-source-patterns` and
`repository-pattern` already exist — but they are _PoEAA design_ skills, not performance skills.
The new pair must state that boundary explicitly in both directions, and those four should gain a
return pointer.

### G-02 — JDK upgrade impact _(high priority)_

**What is missing.** "We are moving from JDK 17 to 25 — what breaks and what gets faster?" There is
no owner. `jvm-performance-review/references/flag-lifecycle.md` is excellent and covers **flags
only**. Nothing owns: strong encapsulation and `--add-opens` (JEP 403), `sun.misc.Unsafe`
deprecation (JEP 498), Security Manager removal (JEP 486), removed and changed APIs, default
behaviour changes across releases, or the "what should get faster and how do I prove it" side of an
upgrade.

**Evidence.** `JDK upgrade|migrating from JDK|version upgrade` hits eight files, each in passing
and each owning a different fragment (`jni-and-ffm` for restricted methods,
`structured-concurrency` for preview churn, `refactoring-automation` for OpenRewrite recipes).

**Frequency:** **High** — an LTS-to-LTS move is a scheduled event every team faces, and this
repository has an unusual amount of the raw material already scattered through it.

**Form:** one new skill, `jdk-upgrade-impact`. Much of its content already exists and would be
routed to rather than duplicated; the skill's value is the _checklist and the ordering_.

### G-03 — Live incident evidence capture _(medium-high priority)_

**What is missing.** "It is degrading right now, I have five minutes before someone restarts it —
what do I capture, in what order, and what does restarting destroy?"

Every individual tool has an owner: `heap-dump-analysis` covers capture without making the incident
worse, `jhsdb-and-core-dumps` covers a wedged process, `concurrency-diagnostics` covers thread
dumps, `jfr-and-async-profiler` covers profiles. What has no owner is the **ordering under time
pressure and the irreversibility** — which evidence a restart destroys, which is cheap enough to
take first, and when to stop collecting and restore service.

`debugging` is adjacent (_"choosing which evidence to collect from a running production system
before it is destroyed"_) but is a general fault-finding skill and explicitly cedes JVM performance
triage to `java-performance`.

**Frequency:** **Medium-High.**

**Form:** a new skill, `incident-evidence-capture`, or a reference file plus a routing table added
to `java-performance`. Given `java-performance` is already a pure router with a routing table, a
new skill is cleaner.

### G-04 — Framework-layer performance _(medium priority, and partly a scope question)_

**What is missing.** Spring Boot request-path cost, auto-configuration and startup weight, Actuator
and probe overhead, Jackson configuration cost, filter and interceptor chains, WebMVC versus WebFlux
at the framework layer rather than the model layer.

**The scope question is yours.** The catalogue is deliberately framework-neutral almost
everywhere — `patterns-and-modern-frameworks` and `framework-coupling-and-independence` treat
frameworks as a _coupling_ subject, not a _performance_ subject. Adding Spring-specific performance
skills would be a genuine change of policy, not a gap fill. I flag it as PARTIAL against the brief's
taxonomy and leave the decision open.

**Frequency:** **Medium.** **Form:** decide the policy before designing the skill.

### G-05 — Communicating a performance finding _(low priority)_

`engineering-communication` covers the general shape (_what is true, what follows, what is
uncertain, options, recommendation_). What is absent is the performance-specific artefact: the
before/after with its measurement method, the confidence interval, the falsification that was
attempted, the mechanism that explains the change.

**Frequency:** **Low-Medium.** **Form:** a reference file inside `performance-methodology`, not a
new skill. `jvm-performance-review` already produces a findings format that could be generalised.

---

## 4. Gap summary

| ID   | Gap                            | Frequency   | Form                                   | Priority |
| ---- | ------------------------------ | ----------- | -------------------------------------- | -------- |
| G-01 | Query + ORM performance        | High        | 2 new skills                           | 1        |
| G-02 | JDK upgrade impact             | High        | 1 new skill                            | 2        |
| G-03 | Live incident evidence capture | Medium-High | 1 new skill                            | 3        |
| G-04 | Framework-layer performance    | Medium      | policy decision first                  | 4        |
| G-05 | Performance write-up           | Low-Medium  | reference in `performance-methodology` | 5        |

---

## 5. Reverse test — 30 realistic requests

`—` in _Second candidate_ means a single unambiguous owner. The **Verdict** column carries the
assessment as taken; where a gap has since been closed, the row says so.

| #   | Request                                                              | Should trigger                       | Second candidate                                                             | Verdict                                                                  |
| --- | -------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | "p99 tripled after yesterday's deploy, no code change we can see."   | `java-performance`                   | `performance-methodology`                                                    | OK — router by design                                                    |
| 2   | "Here is our JVM_OPTS, 38 inherited flags. Are they sane?"           | `jvm-performance-review`             | —                                                                            | OK                                                                       |
| 3   | "GC log attached — are the pauses our problem?"                      | `gc-log-analysis`                    | `jvm-gc-tuning`                                                              | OK — boundaries explicit both ways                                       |
| 4   | "Pod OOMKilled, heap sitting at 40%."                                | `jvm-memory-regions`                 | `container-awareness`, `linux-for-jvm`                                       | OK — the three-way split is stated in all three                          |
| 5   | "Should we move from G1 to ZGC?"                                     | `jvm-gc-tuning`                      | `zgc-and-shenandoah`                                                         | OK                                                                       |
| 6   | "What does `To-space exhausted` mean?"                               | `g1-internals`                       | —                                                                            | OK                                                                       |
| 7   | "p99.9 is ten times p99."                                            | `tail-latency-analysis`              | `latency-statistics`                                                         | OK                                                                       |
| 8   | "Load test says p99 8 ms, production says 300 ms."                   | `coordinated-omission`               | `load-testing`                                                               | OK                                                                       |
| 9   | "Write a JMH benchmark comparing these two implementations."         | `jmh-microbenchmarks`                | —                                                                            | OK                                                                       |
| 10  | "My JMH `Error` is 40% of `Score`."                                  | `jmh-advanced`                       | —                                                                            | OK                                                                       |
| 11  | "Flame graph shows 60% under `main`."                                | `flame-graph-analysis`               | —                                                                            | OK                                                                       |
| 12  | "Which profiler should I run in production?"                         | `jfr-and-async-profiler`             | —                                                                            | OK                                                                       |
| 13  | "async-profiler returns an empty graph inside our container."        | `async-profiler-advanced`            | —                                                                            | OK                                                                       |
| 14  | "Should we enable virtual threads service-wide?"                     | `virtual-thread-migration`           | `thread-sizing-and-virtual-threads`, `reactive-and-virtual-thread-selection` | OK — three distinct questions, stated                                    |
| 15  | "Thread dump is full of BLOCKED on a `synchronized` block."          | `lock-inflation`                     | `concurrency-diagnostics`                                                    | OK                                                                       |
| 16  | "Is this class thread-safe?"                                         | `java-thread-safety-contracts`       | `java-memory-model`                                                          | OK — contract vs happens-before                                          |
| 17  | "Deadlock suspected, no detector reports one."                       | `concurrency-diagnostics`            | —                                                                            | OK                                                                       |
| 18  | "Cold start is 45 s and we are on Lambda."                           | `startup-cds-crac-leyden`            | `graalvm-native-image`                                                       | OK                                                                       |
| 19  | "Metaspace grows after every redeploy."                              | `jvm-class-loading`                  | `metaspace-internals`                                                        | OK — retainer hunt vs internals                                          |
| 20  | "How many pods for 5k rps at p99 < 200 ms?"                          | `capacity-planning`                  | —                                                                            | OK                                                                       |
| 21  | "Adding pods stopped increasing throughput."                         | `universal-scalability-law`          | `littles-law-and-queueing`                                                   | OK                                                                       |
| 22  | "`-Xlog:gc` is set but the file is empty."                           | `unified-logging`                    | —                                                                            | OK — a well-carved boundary                                              |
| 23  | "Latency spikes with no GC event behind them."                       | `safepoints`                         | `pause-attribution`                                                          | OK                                                                       |
| 24  | **"Which design pattern fits this problem?"**                        | `gof-pattern-selection`              | `gof-pattern-thinking`, `pattern-selection-and-composition`                  | **OVERLAP** → resolved: sole owner, and both siblings restated as stages |
| 25  | "Is this class a Decorator or a Proxy?"                              | `gof-pattern-confusion`              | —                                                                            | OK                                                                       |
| 26  | **"Our codebase is full of factories that do nothing."**             | `gof-pattern-antipatterns`           | `enterprise-architecture-smells`, `java-code-smells`                         | **OVERLAP** — three lenses on one symptom; left as is                    |
| 27  | "The page issues 400 selects; the ORM is killing us."                | `orm-fetch-and-batching-performance` | `architecture-and-performance` budgets it                                    | ~~GAP G-01~~ → **built**                                                 |
| 28  | "This query does a full table scan. What index do we need?"          | `sql-query-performance`              | —                                                                            | ~~GAP G-01~~ → **built**                                                 |
| 29  | "We are upgrading JDK 17 → 25. What breaks?"                         | `jdk-upgrade-impact`                 | `jvm-performance-review` (flags)                                             | ~~GAP G-02~~ → **built**                                                 |
| 30  | "It is degrading now. What do I capture before someone restarts it?" | `incident-evidence-capture`          | —                                                                            | ~~GAP G-03~~ → **built**                                                 |

**Result as assessed: 24 clean / 2 overlaps / 4 unowned. As it stands now: 28 clean / 2 overlaps /
0 unowned.** Twenty-four unambiguous owners out of thirty, in a 240-skill catalogue, was already a
strong routing result and reflects how carefully the boundary clauses were written — _provided_
the boundary clauses actually ship, which at the time of the assessment, for 77 skills, they did
not (AUDIT M-02). They do now.

## 6. The two overlaps

**Rows 24 and 26 — the pattern meta-layer.** Eight skills sit above the pattern catalogues:
`gof-pattern-thinking` (reasoning discipline), `gof-pattern-selection` (problem → shortlist),
`gof-pattern-confusion` (telling lookalikes apart), `gof-pattern-antipatterns` (misuse catalogue),
`gof-patterns-in-modern-java` (what the language/framework already provides),
`gof-patterns-and-distribution` (what changes across a process boundary), plus
`pattern-selection-and-composition` and `patterns-and-modern-frameworks` for the enterprise set.

Their descriptions do disambiguate — each names the other seven. But "which pattern fits here?" is
the _literal_ trigger phrasing in three of them at once:

- `gof-pattern-thinking`: _"…when someone asks which pattern fits here…"_
- `gof-pattern-selection`: _"Use when someone asks which pattern fits…"_
- `pattern-selection-and-composition`: _"…when someone asks which patterns a new module should use…"_

That is not a boundary problem that better prose fixes; the same sentence is claimed by three
skills. **Recommendation:** either merge `gof-pattern-thinking` into `gof-pattern-selection` (the
"walk the alternatives ladder, price the indirection" content is a section of a selection skill,
not a sibling of one), or make `gof-pattern-selection` the sole named owner of that phrase and have
the other two remove it. The second is cheaper and reversible. I would not touch the other six —
`confusion`, `antipatterns`, `modern-java` and `distribution` are cleanly separated by their
triggers.

Row 26 is milder: `java-code-smells` (code-level detection), `enterprise-architecture-smells`
(structural) and `gof-pattern-antipatterns` (pattern misuse) are genuinely three different lenses,
and each names the other two. "Factories that do nothing" simply sits at the intersection. Worth one
cross-reference sentence, not a restructure.

---

## 7. Proposed new skills — outcome

| Name                                 | Priority | Outcome                                                                                            |
| ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------- |
| `sql-query-performance`              | 1        | **Built v1.0.0.** Execution plans, selectivity, composite order, covering, non-sargable shapes     |
| `orm-fetch-and-batching-performance` | 1        | **Built v1.0.0.** Statement count, the four N+1 mechanisms, write batching and id generation       |
| `jdk-upgrade-impact`                 | 2        | **Built v1.0.0.** The five breakage classes, the compatibility pass, staged rollout                |
| `incident-evidence-capture`          | 3        | **Built v1.0.0.** Capture order by cost, the survival matrix, the budget conversation              |
| _(framework performance)_            | 4        | **Not built — decided out of scope.** The scope line is now written into `SKILLS.md` §1            |
| _(performance write-up, G-05)_       | 5        | **Built as a reference**, not a skill: `performance-methodology/references/reporting-a-finding.md` |

A new category, **M. Data Access Performance**, carries the first two plus `connection-pool-sizing`,
which had been sitting in _Platform, OS and Hardware_ for want of anywhere better.

Return pointers were added where they were needed rather than everywhere they were listed:
`java-performance` gained four routing-table rows and named the database in its own description.
The rest reach the new skills through that router.

---

## 8. Open questions — all answered

| Question                                                                        | Answer                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Is the database in scope at all?**                                            | **Yes.** It was already in scope at the design level — `connection-pool-sizing`, the ORM pattern skills, the persistence cost model in `architecture-and-performance`. What was missing was the performance layer, and that is what the two new skills supply.                                                                                                                                                        |
| **Is framework-specific performance in scope?**                                 | **No**, and the line is now explicit rather than implicit: library-specific where the library is effectively universal (JPA/Hibernate, Kafka, JFR, JMH), application-framework-neutral otherwise. The previous unqualified claim of "framework-neutral" was already contradicted by those very skills.                                                                                                                |
| **Merge or trim the pattern meta-layer?**                                       | **Trim, and the merge was examined and rejected.** `gof-pattern-selection`'s own Purpose states that it assumes `gof-pattern-thinking` has run — they are two stages of one process. Merging would produce a ~300-line body against a median of 98 and delete a package 28 others declare. The defect was the shared trigger; two shared triggers were found and split, and both descriptions now state the sequence. |
| **Score the coverage map against the brief's taxonomy or the catalogue's own?** | **The catalogue's own.** `SKILLS.md` §2 uses thirteen categories derived from the skills themselves; this document keeps the brief's taxonomy because that is what it was asked to assess against, and the two are reconciled in §1 above.                                                                                                                                                                            |

Nothing in this document is still awaiting a decision. The outcome of each item, with its
verification, is in [CHANGELOG.md](CHANGELOG.md).
