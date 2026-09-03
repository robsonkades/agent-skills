# Final marketplace audit — 258 Java engineering skills

**Date:** 2026-09-03. **Scope:** every skill and every category in the current working tree.
**Baseline:** committed `HEAD` before this review. **Reviewed state:** the current working tree.

## Executive summary

The marketplace began as a strong advanced corpus, but not as a consistently Principal-level
decision system. Its best packages already encoded mechanisms and operational judgment; its weak
spots used absolute rules, mixed API versions, treated correlation as proof, or stopped one layer
above the production failure. The previous material in this directory could not establish full
coverage: it began with 240 skills, later mentioned 244, and explicitly recorded only partial
reading of skill bodies and references. The current corpus has 258 skills.

This review inventoried and assessed all 258 skills across the deliberate A–M taxonomy. It made
material changes in 231 packages and confirmed 27 packages without content changes. The reviewed
corpus contains 1,107 files. The aggregate quality score moved from **8.1/10 (Advanced)** to
**9.4/10 (Expert)**. The largest gains are in decision quality, failure modes, troubleshooting,
production behavior and version-specific accuracy.

The result is now a coherent expert knowledge system rather than a set of good explanations:
recommendations state preconditions and counter-cases; performance guidance follows hypothesis →
measurement → diagnosis → change → validation; distributed guarantees expose assumptions; and
runtime guidance distinguishes API contract, implementation evidence and deployment behavior.

The review also found a catalogue-level drift: 245 of 258 version headings in `SKILLS.md` did not
match their manifests. `npm run skills:sync-versions` now repairs that mapping deterministically.

## What was reviewed

| Layer                              |                Coverage | Result                                                                               |
| ---------------------------------- | ----------------------: | ------------------------------------------------------------------------------------ |
| Skills                             |                 258/258 | all assigned to one category and individually assessed                               |
| Categories                         |                   13/13 | scope, coverage, depth, overlap, boundaries and missing knowledge reviewed           |
| Current package files              | 1,107/1,107 inventoried | entrypoints, manifests, references and assets listed in [INVENTORY.md](INVENTORY.md) |
| Skill bodies and routed references |        258/258 packages | reviewed for correctness, decisions, failure modes and agent usability               |
| Before/after scorecards            |                 258/258 | all 13 requested dimensions in [SKILL-SCORES.md](SKILL-SCORES.md)                    |
| Materially changed skills          |                 231/258 | 861 tracked files changed, plus new expert references                                |
| Reviewed without content change    |                  27/258 | already met the rubric; explicitly recorded in the scorecards                        |
| Strict package validation          |                 258/258 | zero issues                                                                          |

The unchanged packages are not omissions: `architecture-characteristics`,
`architecture-coupling-and-quanta`, `architecture-decision-making`, `code-review`,
`coding-agent-discipline`, `concurrency-testing`, `distributed-systems-testing`,
`distribution-boundaries`, `enterprise-architecture-smells`, `enterprise-base-patterns`, the
feature-engineering workflow packages that required no correction, `java-legacy-code-testing`,
`java-test-design`, `jdk-upgrade-impact`, `layering-and-boundaries`, `refactoring-automation`,
`schema-evolution-and-compatibility`, `session-state-strategies` and `skill-engineering`.

## Marketplace score

| Metric                 |  Before |   After |
| ---------------------- | ------: | ------: |
| Accuracy               |     8.3 |     9.5 |
| Completeness           |     8.0 |     9.4 |
| Technical Depth        |     8.0 |     9.4 |
| Expert-Level Knowledge |     7.9 |     9.4 |
| Decision Making        |     7.9 |     9.4 |
| Trade-Off Analysis     |     8.0 |     9.4 |
| Production Readiness   |     8.0 |     9.4 |
| Performance Knowledge  |     8.2 |     9.4 |
| Failure-Mode Coverage  |     7.9 |     9.4 |
| Troubleshooting        |     7.8 |     9.3 |
| Testing                |     8.2 |     9.4 |
| References             |     8.6 |     9.5 |
| AI-Agent Usability     |     8.3 |     9.4 |
| **Overall**            | **8.1** | **9.4** |

Scores are review judgments calibrated by category relevance, the package's decision and
diagnostic structure, reference depth, and the corrections relative to the committed baseline.
They do not reward length. For dimensions such as performance or testing, a high score can mean
the skill correctly defines the boundary and routes elsewhere rather than forcing irrelevant
material into its body. The scoring method is reproducible through `npm run audit:build`.

## Category scores

| Category                                     | Skills | Changed | Before | After | State                                   |
| -------------------------------------------- | -----: | ------: | -----: | ----: | --------------------------------------- |
| A — JVM Memory and Garbage Collection        |     19 |      19 |    8.0 |   9.5 | Expert                                  |
| B — JVM Execution and Compilation            |     17 |      16 |    8.0 |   9.5 | Expert                                  |
| C — Measurement, Profiling and Observability |     29 |      29 |    7.8 |   9.5 | Expert                                  |
| D — Concurrency and Parallelism              |     23 |      22 |    7.9 |   9.4 | Expert                                  |
| E — Platform, OS and Hardware                |     11 |      11 |    7.9 |   9.3 | Expert; storage is the main breadth gap |
| F — Distributed Systems and Messaging        |     37 |      33 |    8.0 |   9.4 | Expert                                  |
| G — Java Language Craftsmanship              |     31 |      30 |    7.9 |   9.3 | Expert                                  |
| H — Design Patterns (GoF)                    |     28 |      28 |    8.0 |   9.3 | Expert; all 23 patterns covered         |
| I — Enterprise Application Architecture      |     21 |      18 |    8.3 |   9.3 | Expert                                  |
| J — Architecture Governance and Evolution    |     11 |       8 |    8.4 |   9.4 | Expert                                  |
| K — Testing                                  |      6 |       4 |    8.6 |   9.3 | Expert depth; narrow breadth            |
| L — Engineering Process and Delivery         |     22 |      10 |    8.8 |   9.3 | Expert                                  |
| M — Data Access Performance                  |      3 |       3 |    8.1 |   9.4 | Expert depth; narrow breadth            |

The detailed scope, coverage, duplication and boundary assessment for each category is in
[CATEGORY-REVIEW.md](CATEGORY-REVIEW.md).

## Principal-level improvements

### Runtime and modern Java

- Replaced API folklore with exact Java 17/21/25 and preview/final status where it affects a
  decision. Structured concurrency, scoped values, virtual threads, FFM, Vector API, Native Image
  and modern language features now expose their version and deployment constraints.
- Corrected claims that only hold on debug JVMs, removed nonexistent or retired flags, and routed
  product-JVM diagnosis to evidence that can actually be collected.
- Separated JIT optimization hypotheses from proof: compilation logs, deoptimization events,
  allocation profiles and assembly answer different questions.
- Corrected `ScopedValue` null semantics in Java 25 and clarified binding capture across structured
  child tasks.

### Performance and observability

- Removed universal thresholds and “always faster” claims. Recommendations now state workload,
  hardware, warmup, saturation, confidence and validation conditions.
- Distinguished mechanism evidence from outcome evidence. For example, `io_uring_enter` proves
  ring activity but not zero-copy or efficient batching; page faults and LLC misses do not prove a
  payload copy was removed.
- Added tail-latency decomposition, coordinated-omission controls, cardinality budgets, queueing
  models, resource-envelope arithmetic and production-safe evidence capture.
- Made OpenTelemetry, JFR, async-profiler, eBPF and logging guidance explicit about blind spots and
  observer cost.

### Concurrency

- Grounded visibility and ordering advice in the Java Memory Model rather than CPU folklore.
- Separated concurrency, parallelism and asynchronous I/O; added cancellation ownership,
  executor saturation, virtual-thread pinning/carrier behavior and reactive demand boundaries.
- Corrected the claim that virtual-thread-backed Reactor bounded elastic pools become unbounded;
  the implementation remains bounded even when tasks run on virtual threads.
- Added schedule-oriented tests and diagnostic evidence for races, deadlocks, liveness and CAS
  contention.

### Distributed systems

- Challenged exactly-once, guaranteed delivery, automatic failover, strong consistency and
  zero-downtime claims by making assumptions and recovery invariants explicit.
- Reframed retries as an end-to-end attempt/deadline budget, with idempotency, duplication,
  backpressure and load-shedding consequences.
- Added topology-change behavior for caches, shards, leaders, consumers and streaming state, plus
  operational recovery and reconciliation paths.
- Corrected per-pod ambassador scope: it does not see fleet-wide traffic and therefore cannot be
  treated as a global circuit breaker.

### Platform, containers and networking

- Corrected `numastat` interpretation: system `numa_miss` is an allocation fallback, not a direct
  remote-access counter; per-process output reports page residence, not access locality.
- Corrected `SO_REUSEPORT` to the standard Java socket option and removed single-signal diagnoses
  for ephemeral-port exhaustion, TCP algorithm choice and buffer sizing.
- Corrected Kubernetes QoS guidance for Pod-level resources (beta from 1.34), native sidecar
  lifecycle support, probe timing and exit-137/OOM attribution.
- Fixed the io_uring example whose fallback selected epoll/NIO but still instantiated an io_uring
  channel; tracing now asks for `io_uring_enter` explicitly rather than using `trace=network`.

### Architecture, design, testing and delivery

- Converted principles and GoF patterns from definitions into force/constraint/alternative tables,
  refactoring signals, misuse detection and deletion criteria.
- Preserved the PoEAA versus data-access-performance boundary: I owns conceptual patterns; M owns
  statement, ORM and pool cost.
- Added governance economics, ADR falsifiers, fitness-function failure behavior, migration
  sequencing and rollback.
- Made testing guidance answer what belongs at each level, what not to mock, how failure and
  concurrency are tested, and how brittleness/determinism are diagnosed.
- Made AI-agent workflows explicit about authority, evidence, reversibility, validation and
  handoff, with repository-specific details delegated to project overlays.

## Skill results

[SKILL-SCORES.md](SKILL-SCORES.md) contains every skill with:

- all 13 before and after scores;
- before and after classification;
- major baseline weaknesses and gaps;
- files and version changed, including line-change evidence;
- advanced knowledge added or confirmed;
- the remaining deployment-specific limitation.

This separation keeps the executive report navigable without omitting any skill.

## Taxonomy findings

The 13-category architecture remains coherent and every skill has exactly one owner. No package
was moved merely because it interacts with another category. The important ownership rules are:

- A owns memory/GC mechanisms and their diagnostics; B owns execution/compilation mechanisms; C
  owns the measurement method and trustworthy interpretation.
- D owns in-JVM execution and coordination. F owns failures and guarantees across process
  boundaries. Domain-specific test skills remain beside the mechanism when they require that
  mechanism's semantics; K owns general Java test strategy and test-design choices.
- E owns kernel, hardware, containers and byte movement. `blocking-and-nonblocking-io` remains in
  D because its primary decision is the in-JVM execution model; syscall and transport internals
  route to E.
- G owns general Java design principles; H owns only the classical GoF vocabulary and its modern
  interpretation.
- H owns object-level GoF patterns; I owns enterprise application patterns. I owns the structure
  of data access; M owns its cost.
- I owns application architecture. J owns deciding, enforcing and evolving architectural intent.
- K owns what/how to test. L owns how engineering work is planned, reviewed and delivered.

Cross-links are preferable to duplicated explanations. The principal dependency paths and overlap
risks are documented in [KNOWLEDGE-GRAPH.md](KNOWLEDGE-GRAPH.md).

## Remaining expert gaps

The corpus is expert-ready, but not complete in every possible Java domain. Three additions are
justified and deliberately not fabricated during this audit: Linux storage/page-cache behavior,
service contract testing, and database contention/transaction performance. A lower-priority
collector gap exists for dedicated Serial/Parallel GC operation. Detailed proposals and reasons
not to create several tempting duplicates are in [GAPS.md](GAPS.md).

These gaps affect breadth, not the technical quality of the skills that exist. Framework-specific
performance remains intentionally outside the marketplace identity unless maintainers choose to
own a vendor release train.

## Validation and definition of done

- [x] Every skill reviewed and scored.
- [x] Every category reviewed and scored.
- [x] Incorrect and obsolete claims corrected.
- [x] Modern Java behavior and version boundaries considered.
- [x] Decision frameworks, trade-offs, failure modes and production behavior strengthened.
- [x] Performance recommendations use measurement and validation.
- [x] Testing and security considerations added where relevant.
- [x] References and cross-skill ownership reviewed.
- [x] Duplicate ownership and contradictions reviewed.
- [x] Local Markdown links checked: zero missing targets.
- [x] Duplicate Markdown headings checked and disambiguated: zero remain.
- [x] Current file inventory generated.
- [x] All 258 packages pass strict validation.
- [x] `SKILLS.md` manifest versions synchronized.
- [x] Registry regenerated for all 258 skills.
- [x] Full `npm run verify` passed: build, architecture boundaries, lint, formatting, registry,
      version checks and 307/307 tests.

The final validation result and the hermetic-test correction required to obtain it are recorded in
[CHANGELOG.md](CHANGELOG.md).
