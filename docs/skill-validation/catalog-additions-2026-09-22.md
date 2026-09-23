# Catalog additions — 2026-09-22

Created all five requested skills with one author subagent per package. Each starts at
version **1.0.0**. The catalog now contains **280 skills**, up from 275.

| Skill                                                                                        | Operational scope                                                               | Files |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----- |
| [java-date-and-time](../../skills/java-date-and-time/SKILL.md)                               | Temporal meaning, DST, clocks, parsing and persistence precision                | 5     |
| [online-database-schema-migrations](../../skills/online-database-schema-migrations/SKILL.md) | DDL, coexistence, backfill, cutover and recovery                                | 4     |
| [spring-security-for-apis](../../skills/spring-security-for-apis/SKILL.md)                   | Servlet chains, access tokens, method security, CSRF/CORS and adversarial tests | 6     |
| [change-data-capture-operations](../../skills/change-data-capture-operations/SKILL.md)       | Connector snapshots, retention, failover and resynchronization                  | 5     |
| [java-build-and-dependencies](../../skills/java-build-and-dependencies/SKILL.md)             | Maven/Gradle resolution, toolchains and reproducibility                         | 5     |

The packages contain matching manifests and descriptions, conditionally routed references,
version-specific primary sources and optional handoffs. Spring security includes an executable
fixture with ephemeral keys. Its prior local counterpart informed the scope; prose and code
were newly authored, without copying material whose redistribution license was unestablished.

## Integration and preservation

Two existing handoffs required correction:

- `java-application-security-basics` **1.3.3 → 1.3.4** now points to the Spring skill in this
  catalog and declares the suggestion.
- `database-performance` **1.0.3 → 1.0.4** now points schema rollouts to their new owner.

These edits affect exactly four existing files. The coordinator compared them with their
assignment-time content and checked the other **1,234** captured skill/report files byte for
byte. Previous review work was preserved. Index comparison found exactly five additions and
the two intended version/integrity updates; the other 273 existing entries were unchanged.

## Executed validation

- Strict package validation with the Claude and Codex adapters: **five packages, zero issues**.
  All 25 new files were inspected; metadata, local resources, handoffs and formatting passed.
- Java temporal example: **18 checks**, compiled with `javac --release 17` and run on
  Temurin 25.0.3 under the default and Honolulu time zones.
- Spring fixture: **27 cases** passed with real signed tokens and decoder/filter chains,
  plus explicitly labeled mock-only, method, CSRF and CORS cases. Compiled with
  `--release 17`, run on Temurin 25.0.3 with Security 7.1.0 and Framework 7.0.8.
- Migration protocol model: checked row-lock orderings, uncertain commits and counterexamples
  for stale copies, skipped cursor gaps and separately committed checkpoints.
- CDC examples: checked JSON signal shape, selector positive/negative cases and stale-key
  reconciliation behavior.
- Build examples: isolated offline Maven 3.9.15 reactor checked management versus dependency
  edges. A JDK 25 compiler probe checked `--release 17` against source/target-only behavior.
- **Five independent agent response cases passed** their predefined criteria: one per skill.
  Exact inputs, expected criteria, resources read and observed decisions are in the
  [machine-readable report](catalog-additions-2026-09-22.json).
- `npm run registry:build`: passed, **280 skills**.
- `npm run verify`: passed, **355 tests in 67 suites; zero failures or skipped tests**.
  Build, architecture boundaries, lint, formatting, registry and version checks also passed.

## Limits

The response cases explicitly loaded each skill; they do not test automatic selection or
establish improvement over a no-skill baseline. Fresh actor conversations excluded evaluator
criteria, but resource separation was procedural in a shared filesystem, not sandbox-enforced.

No live database, migration runner or CDC recovery was exercised. Gradle was unavailable.
Java 17 source/API compatibility was checked with a newer compiler; a Java 17 runtime was not
executed. The Spring fixture does not cover remote key rotation/introspection, real browsers
or production ingress. Python's quick validator was unavailable; the strict repository
validator and focused metadata/link checks were used instead.
