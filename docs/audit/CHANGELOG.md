# Marketplace review changelog

## 2026-09-03 — complete 258-skill Principal/Staff review

### Discovery

- Read `CLAUDE.md` and created the Codex-equivalent root `AGENTS.md` without changing repository
  architecture or safety invariants.
- Inspected the previous `/docs/audit` state. It began at 240 skills, later reported 244, and
  explicitly marked skill bodies and 518 references as partially read. It therefore did not prove
  review of the current 258-skill corpus.
- Rebuilt the inventory: 258 skills, 1,107 current files, one category per skill.
- Preserved the 13-category A–M taxonomy and documented disputed boundaries rather than duplicating
  content.

### Skill review

- Reviewed every package against accuracy, completeness, internals, modern Java, decisions,
  trade-offs, production behavior, performance, failure modes, troubleshooting, testing,
  references and AI-agent retrieval.
- Materially changed 231 skills; confirmed 27 already-expert skills without content changes.
- Updated versions for every changed package.
- Added focused reference documents where a rule required substantial operational depth rather
  than inflating the entrypoint.
- Kept package descriptions aligned between `SKILL.md` frontmatter and `skill.yaml`.

### Representative corrections

- Removed unsupported JVM flags and distinguished debug-build diagnostics from product-JVM tools.
- Corrected modern Java 25 scoped-value null behavior and structured-concurrency API semantics.
- Corrected Reactor bounded-elastic behavior with virtual threads and modern Micrometer tap usage.
- Replaced hardware/JMM, cache-miss, page-fault, NUMA and GC single-signal diagnoses with evidence
  correlation.
- Corrected `numastat` allocation-fallback versus remote-access interpretation.
- Corrected Java `SO_REUSEPORT`, ephemeral-port arithmetic and transport-algorithm absolutes.
- Corrected io_uring/zero-copy claims, tracing commands and the Netty channel fallback example.
- Corrected Kubernetes Boot/probe/drain, QoS/Pod-level resources, native sidecar and OOM attribution
  guidance.
- Reworked retries, exactly-once, ordering, consistency, circuit breaking, caching and failover into
  conditional guarantees with recovery invariants.
- Converted Java/GoF/enterprise/architecture advice into decision tables, alternatives, migration
  paths and anti-pattern diagnostics.

### Catalogue and audit tooling

- Added `npm run audit:build`, which deterministically generates the current file inventory and all
  258 before/after scorecards.
- Added `npm run skills:sync-versions`, which synchronizes dictionary headings with manifests.
- Found and repaired 245 stale version headings in `SKILLS.md`; zero mismatches remain.
- Declared 34 strong routing-table handoffs as installable dependencies (or cycle-safe
  suggestions) and 83 prose cross-references as suggestions; registry graph validation now passes.
- Checked local Markdown targets (zero missing) and disambiguated nine repeated headings so anchors
  and agent retrieval are unique (zero duplicate headings remain).
- Replaced the outdated audit report with:
  - [AUDIT.md](AUDIT.md) — executive/final marketplace report;
  - [CATEGORY-REVIEW.md](CATEGORY-REVIEW.md) — scope, coverage, depth and boundaries for A–M;
  - [SKILL-SCORES.md](SKILL-SCORES.md) — all 13 scores and before/after result for every skill;
  - [INVENTORY.md](INVENTORY.md) — every skill and file;
  - [KNOWLEDGE-GRAPH.md](KNOWLEDGE-GRAPH.md) — prerequisites, combinations and conflicts;
  - [GAPS.md](GAPS.md) — only substantial missing-skill proposals.

### Quality result

| Measure | Before | After |
| --- | ---: | ---: |
| Skills represented in the old/current audit | 240/244 | 258 |
| Full per-skill scorecards | 0 | 258 |
| Categories reviewed against A–M | partial/legacy grouping | 13 |
| Aggregate quality | 8.1 Advanced | 9.4 Expert |
| Strict package validation | not current | 258/258, zero issues |
| `SKILLS.md` version mismatches | 245 | 0 |

### Final verification

`npm run verify` passed after the final registry build:

| Gate | Result |
| --- | --- |
| TypeScript build | passed |
| Architecture boundaries | passed, 7 packages |
| ESLint | passed |
| Prettier check | passed |
| Registry check | passed, 258 skills and all routing/dependency checks |
| Version bump check | passed |
| Test suite | passed, 307/307 |

The first full run exposed two environment-dependent CLI test failures: the supposedly hermetic
helper set `PATH` to the Node executable directory, which also contained the developer's real
`codex.CMD` on Windows. The helper now removes case variants of `Path`/`PATH` and points the child
to an empty executable directory while invoking Node by absolute path. The targeted three-test
agent-detection suite and the complete 307-test suite both pass.

All 258 skill packages also passed `agent-skills validate --strict` individually with zero issues.
