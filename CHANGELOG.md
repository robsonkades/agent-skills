# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

All seven published packages move together in the 1.x line, so a single version identifies a
compatible set.

## [Unreleased]

## [1.11.1] — 2026-09-30

### Fixed

- Compare canonical filesystem destinations in the suggestion-update integration test.
  On macOS, `/var` and `/private/var` can name the same temporary project directory;
  different path spellings no longer fail release verification. Retain checks for an
  absolute destination, package identity, provenance and dependency receipts.
- Exercise the same update through a directory symlink or Windows junction in an
  isolated fixture, preserving cross-platform coverage without changing install paths.

## [1.11.0] — 2026-09-30

### Added

- `--with-suggests` for installation and explicitly named updates: include direct
  suggestions of the requested skills together with their dependencies, without
  recursively following suggestions. Preserve selected root versions and registries,
  project version pins, and the update policy for installed companions.
- Eighteen skills for Java DDD, Spring clean and hexagonal architecture, and
  microservices design and delivery, bringing the catalog to 305 skills. DDD coverage
  includes aggregates, value objects, use cases, domain services, repositories,
  domain events and testing.
- Application and isolated CLI tests for suggestion resolution, provenance, dry-run,
  version conflicts, destination selection, integrity and locally modified files.
  Added review reports and executable Java examples with explicit evidence limits.

### Changed

- Reviewed pending skills and the catalog's dependency and suggestion relationships;
  corrected required specialist links, removed unsupported suggestions, and regenerated
  package versions and integrity hashes.
- Aligned DDD and Spring architecture guidance with the corrected reference project,
  preserving its naming and package conventions while distinguishing historical
  framework choices from the maintained examples.
- Clarified transaction outcomes, persistence contracts, immutable snapshots, resource
  ownership, service identity, query checkpoints and progressive-delivery evidence.

### Fixed

- Report update additions even when the requested version stays the same or an
  existing skill is installed into another agent. Text and additive JSON fields expose
  suggestion origins, actual destinations and skipped packages.
- Reject unnamed updates with `--with-suggests` and the incompatible `--no-deps`
  combination with actionable usage errors. Notification updates retain their
  explicitly approved package set.

## [1.10.0] — 2026-09-29

### Changed

- Reviewed all eight Spring skills around contextual discovery, technical decisions,
  proportionate implementation, consumer and operational documentation, and explicit
  evidence limits. Preserved specialist boundaries and existing project conventions.
- Strengthened maintained-service delivery, effective use-case transactions, database
  invariants, contextual exceptions, typed HTTP responses and managed integrations.
- Made OpenAPI, springdoc, REST Docs and documentation publication choices depend on
  consumer requirements; distinguish gateway quotas from concurrency controls and
  full-context MockMvc tests from real servlet-container behavior.
- Clarified trusted gateway identity, security context across executor tasks, remote
  replay contracts, historical event payloads, recovery and telemetry ownership.

### Fixed

- Reject invalid JSON scalar coercion in the web fixture without truncating fractional
  integers or accepting numbers as textual identifiers; retain valid integral decimals.
- Preserve atomic SKU updates while allowing concurrent reads in the fixture store;
  add contextual persistence failures and transaction-completion rollback checks.
- Distinguish feature activation from malformed-property validation, read-only intent
  from a consistent database snapshot, and tracing from durable business audit records.

### Added

- Review evidence with an eight-pillar matrix per Spring skill, source hashes and nine
  executed agent-response evaluations. The web comparison showed adequate decisions
  in both arms, without establishing a general comparative improvement.
- Explicit verification boundaries: fixture checks and proposed agent solutions do
  not establish real-database, gateway, collector or production recovery guarantees.

## [1.9.0] — 2026-09-28

### Added

- Four Spring Boot specialist skills: `spring-http-clients`, `spring-boot-testing`,
  `spring-transactions-and-events`, and `spring-boot-observability`, bringing the
  catalog to 287 skills.
- Focused decisions for managed HTTP clients, test boundaries, transaction-bound
  events, durable publication and observability, with version-matched official
  Spring Boot, Spring Data JPA and Spring Security references.

### Changed

- Reviewed nine Spring-related packages and simplified their resources around
  native framework facilities and existing application code. Removed artificial
  migration, Outbox, security, client and event scaffolding; retained useful JPA,
  HTTP, testing and trace-propagation examples.
- Preserved conditional guidance for concurrency, response limits, token trust,
  callback phases, recovery and mixed-version database rollouts. Examples now
  state when additional mechanisms and real-engine checks are necessary.
- Recorded 39 passing Java tests, 13 focused security cases and six detected
  mutations. Real PostgreSQL/SQL Server and production recovery remain unexecuted.
- Recorded 22 bounded agent responses without claiming a general comparative
  improvement; an explicit WebFlux handoff remains an observed response omission.
- Excluded Java `target/` output and `.class` files from Git tracking.

## [1.8.0] — 2026-09-27

### Added

- Three specialist skills for Spring Boot 4.x and Java 25: `spring-boot`,
  `spring-boot-web`, and `spring-boot-jpa`, bringing the catalog to 283 skills.
- Context-sensitive bean composition, configuration and lifecycle guidance; complete
  springdoc/OpenAPI contracts with optional fields, collections and shared application
  errors; entity mapping, identity, fetching, transaction and pool decisions.
- Runnable Java 25 fixtures with 34 passing contract tests, plus executed Swagger UI,
  JSON Schema and Unicode boundary checks. Real SQL Server/PostgreSQL probes remain
  explicitly unexecuted.
- Creation and evaluation evidence distinguishing runtime results from six bounded
  agent responses; no comparative behavioral advantage over controls is claimed.

## [1.7.1] — 2026-09-27

### Fixed

- Completed the review of all 280 skills: corrected 263 packages and retained 17
  without changes, preserving useful examples and technology baselines.
- Corrected API, concurrency, resource-lifecycle, persistence and runtime guidance,
  including shared timeout ownership, legacy-locking pinning and message framing.
- Clarified specialist responsibilities, evidence requirements, conditional decisions
  and optional handoffs; regenerated catalog versions and integrity hashes.
- Recorded technical checks, per-skill limitations and 18 bounded agent responses.
  The nine resumed original/revised/no-skill runs showed no comparative advantage
  under their predefined criteria; example tests and walkthroughs remain distinct.

## [1.7.0] — 2026-09-22

### Added

- Five specialist skills: `java-date-and-time`, `online-database-schema-migrations`,
  `spring-security-for-apis`, `change-data-capture-operations`, and
  `java-build-and-dependencies`, bringing the catalog to 280 skills.
- Executable temporal and Spring Security examples, with 18 temporal checks and 27
  security cases, including signed hostile tokens through the real decoder.
- Per-skill review evidence and five independent response evaluations for the additions,
  with explicit limits for unexecuted database, connector and Gradle integration.

### Changed

- Completed a further review of the 275 existing skills: 264 packages updated and 11
  retained, preserving useful guidance and distinguishing example tests from agent evaluations.
- Updated cross-skill handoffs for API security and relational schema rollouts, and
  regenerated catalog versions and integrity hashes.

### Fixed

- Corrected version-sensitive Java/JVM, concurrency, persistence and distributed-system
  guidance, including evidence requirements, failure recovery and compatibility boundaries.

## [1.6.0] — 2026-09-11

### Added

- Interactive CLI and skill update notifications with update, reminder and skip choices,
  registry-aware version selection, and explicit approval for major skill upgrades.
- CLI self-update for identified npm installations, with instructions for other installation
  methods and opt-outs for automated or non-interactive use.
- Permanent registry-builder tests for single-word skill references and documented routing
  exceptions.

### Changed

- Reviewed and revised all 275 skills, with individual version bumps, updated dependencies
  and suggestions, corrected references, and regenerated registry integrity hashes.
- Recorded per-skill evidence and 2,438 graded responses, preserving partial results and
  distinguishing example checks from agent behavior and comparative improvement claims.

### Fixed

- Registry validation now detects undeclared single-word catalog references in routing tables
  and prose, while preserving depth-ladder and reverse-dependency exceptions.
- Corrected version-sensitive API and JVM guidance, concurrency and resource lifecycles,
  diagnostic failure handling, measurement assumptions, and skill evaluation boundaries.

## [1.5.1] — 2026-09-05

### Fixed

- Reviewed the 275-skill catalog and corrected version-sensitive Java/JVM guidance,
  concurrency and resource-lifecycle contracts, database behavior, distributed-system
  failure handling, and performance measurement assumptions.
- Clarified evidence requirements, scope boundaries, reference routing and validation
  limits; distinguish tested examples from unexecuted agent evaluations.
- Updated skill versions, declared missing cross-skill dependencies and suggestions,
  and regenerated registry integrity hashes for the revised packages.

## [1.5.0] — 2026-09-04

### Added

- Seven Level-4 performance-engineering skills covering gRPC/HTTP2/service-mesh paths, JVM ML
  inference, Kafka Streams and Flink runtime operation, low-jitter JVM systems, performance
  engineering programs, incident response, and evidence-safe Project Valhalla evaluation.
- Cloud instance-selection and Kubernetes scaling-control guidance for capacity plans, including
  sustained-versus-burst limits, interruptible capacity, HPA/VPA/in-place resize boundaries and
  JVM startup ergonomics.

### Changed

- Capacity planning now routes platform-specific provisioning decisions through dedicated
  references and distinguishes calculating required capacity from choosing the control that
  applies it.
- The registry now publishes 275 skills.

## [1.4.0] — 2026-09-03

### Added

- **Seven database-engineering skills** for evidence-first database performance routing, index
  design, bulk loading, engine selection and migration, plus dedicated PostgreSQL, MySQL/InnoDB
  and SQL Server diagnostics.
- **Collaborative Product Feature and Tech Feature definition**, with adaptive questioning,
  explicit Product Definition and Engineering Analysis stages, accountable decision roles and
  revision-aware handoffs into the feature-engineering lifecycle.
- `feature-contract-definition` for owned API, event, data, security and operational contracts,
  including compatibility and evolution rules.
- `feature-feasibility-experiment` for bounded PoCs and experiments with hypotheses, thresholds,
  evidence and explicit supported, refuted or inconclusive outcomes.

### Changed

- The feature-engineering suite now uses shared traceable artefact identifiers, adaptive depth and
  persistence, focused feedback loops, accepted-gap governance and normalized readiness outcomes.
- Feature decomposition now distinguishes independently valuable Product or Tech Features from
  supporting implementation resources; planning references accepted business and technical
  criteria instead of silently authoring them.
- Java performance triage now routes database symptoms through the database-performance hub and
  its engine-specific specialists.

### Fixed

- Shortened Codex display titles that exceeded the interface limit while preserving the full skill
  names and routing semantics.

## [1.3.0] — 2026-09-03

### Added

- **Fourteen feature-engineering skills** covering discovery, requirements, context, scope,
  architecture impact, solution and decision analysis, risk, decomposition, implementation
  planning, execution, progress tracking and readiness review. The `feature-engineering` skill
  routes the complete workflow while each specialist owns one mutually exclusive decision surface.
- **A complete marketplace audit system** under `docs/audit/`, including the 258-skill inventory,
  per-skill before/after scorecards, all thirteen category reviews, a cross-skill knowledge graph,
  remaining-gap analysis and an evidence-oriented final report.
- `npm run audit:build` to regenerate inventory and scorecard reports, plus
  `npm run skills:sync-versions` to detect and repair version drift in `SKILLS.md`.
- `AGENTS.md` with repository-specific guidance for Codex contributors.

### Changed

- **All 258 skills were reviewed against a Staff/Principal engineering rubric.** 231 packages
  received material improvements to decision criteria, internals, trade-offs, failure modes,
  production diagnostics, modern Java version boundaries, validation and authoritative references;
  the remaining 27 were explicitly reviewed and retained.
- Registry relationships now represent every strong routing-table target and relevant prose
  cross-reference found by the audit. Registry diagnostics report the complete missing-reference
  set instead of truncating it.
- `SKILLS.md` version headings are synchronized with the package manifests.

### Fixed

- CLI agent-detection tests now isolate `PATH` completely on Windows, preventing an installed
  `codex.CMD` or `claude.CMD` from leaking into supposedly hermetic test cases.
- Duplicate headings and broken or missing Markdown cross-references found during the audit were
  corrected across the marketplace.

## [1.2.0] — 2026-08-28

### Added

- **`suggests` in `skill.yaml`** — a list of bare skill names, deliberately without version
  ranges. A skill names other skills constantly ("`retries-and-backoff` owns the mechanism", a
  depth ladder, a "see this first"), and none of it was declared anywhere, so a reader arriving
  without those skills hit names that went nowhere. Nothing resolves a suggestion and nothing
  installs from it; a range would be a constraint no gate checks, and this format does not carry
  claims it cannot back. Additive under `schemaVersion: 1`.
- **`agent-skills info` lists suggestions**, under `Suggests`, marked as not installed with the
  skill — which is what makes the pointer actionable rather than a dead end.
- **Two gates in `npm run registry:build`**, covering the direction the existing ones do not.
  Those all ask whether a *declared* dependency is real; these ask whether a *named* skill is
  declared. A routing-table row must be a dependency, because the table promises an owner;
  anything else must be at least a suggestion. The exception is computed rather than waived: a
  routing row whose target already reaches back through declared dependencies cannot become one
  without closing a cycle, and `suggests` is then the honest record.

### Changed

- **A hub now declares the specialists its routing table names, and they no longer declare it.**
  Both directions cannot hold, because `dependencies` must stay acyclic. The hub's direction
  wins: a hub without its targets is broken, while a specialist reached directly does not need
  the overview it was chosen out of. This drops 28 back-edges — chiefly every `gof-*` skill's
  declaration of `gof-pattern-thinking`. Installing a specialist alone no longer brings its hub.
- **234 routing targets became dependencies and 908 references became suggestions**, across 132
  of the 244 published skills, each with its version moved. `java-performance` declared three
  dependencies while its routing table named twenty-nine; installing it now brings 62 skills
  rather than 8, and no row in its table points at something that will be absent.

### Notes

- A CLI from the 1.0.x line reports `suggests` as an unknown field: a warning on `install`, an
  error under `validate --strict` and `publish`. That is the forward-compatibility path this
  format documents and the package still installs, but 130 published skills now carry the field,
  so the warning is new and common. Upgrading the CLI removes it.

## [1.1.0] — 2026-08-28

Bumped in `package.json` at the time but never tagged, so it reaches npm as part of 1.2.0.

### Added

- **The 244-skill catalogue**, replacing the three skills the first release published.
- **A warning when a `SKILL.md` description disagrees with its manifest.** Only the manifest
  description ships — adapters project it into the installed entrypoint and the registry index
  carries the same value — so a drifted frontmatter description is text no agent will ever read.
  A warning rather than an error, so no previously valid package becomes uninstallable.
- **Three gates in `npm run registry:build`**, the only place that sees every package at once:
  declared dependency ranges must resolve against the versions the index publishes, `SKILL.md`
  descriptions must equal their manifest's, and a package whose contents changed while its
  version stood still is refused. `validate` sees one package at a time and cannot do any of it;
  four skills had been uninstallable without a check going red.
- `npm run check:versions`, wired into `npm run verify` between `registry:check` and the tests.
- Audit documentation under `docs/audit/`, and `SKILLS.md` as the catalogue index.

## [1.0.0] — 2026-08-23
First release.

### Added

**Skill package format (`schemaVersion: 1`)**

- `SKILL.md` with YAML frontmatter as the agent-facing entrypoint, plus `skill.yaml` as the
  machine-readable packaging manifest.
- Semantic versioning, dependencies and optional dependencies, agent compatibility
  declarations, SPDX licence, authors, repository, homepage, keywords, capability tags and
  content integrity.
- `agentOverrides`, a narrow escape hatch for presentation-only per-agent metadata, with keys
  allowlisted by the consuming adapter.

**Agents**

- Claude Code adapter — `$CLAUDE_CONFIG_DIR/skills` globally, `.claude/skills` per project.
- Codex adapter — `$CODEX_HOME/skills` globally, `.agents/skills` per project, with a
  synthesised `agents/openai.yaml` and `metadata.short-description`.
- Evidence-based detection that distinguishes strong signals (config directory, executable on
  `PATH`) from weak ones (a project directory alone).

**Registries**

- Local, git and HTTPS registry drivers behind one interface.
- Precedence-aware federation: the first registry publishing a name owns it, which closes the
  dependency-confusion class of attack.
- `agent-skills registry add|remove|list`, with `--first` to control precedence.

**Installation**

- Atomic install: stage, validate, commit by rename, roll back on failure.
- Install receipts recording every file written and its hash, so uninstall never deletes a
  file the tool did not install or one you edited.
- Project-scope `skills.lock` for reproducible installs, with integrity verification.
- Dependency resolution with semver constraints, conflict detection, cycle detection and
  deterministic output.

**Security**

- Path-safety rules shared by validation and extraction: traversal, absolute paths, UNC paths,
  drive letters, alternate data streams, Windows reserved names, trailing dot/space filenames
  and control characters, all rejected on every platform.
- Symlinks and hardlinks refused in packages.
- Archive limits on entry count, entry size, total size and compression ratio.
- HTTPS enforced for remote registries outside loopback.
- `scripts/` shipped as data and never executed.

**CLI**

- `install`, `uninstall`, `update`, `list`, `search`, `info`, `validate`, `create`, `publish`,
  `doctor`, `agents`, `registry`.
- `--agent` (repeatable, or `all`), `--global` / `--project`, `--registry`, `--dry-run`,
  `--force`, `--json`, `--verbose`, `--quiet`, `--no-color`.
- Stable `ASK_*` error codes and distinct exit codes for usage, validation, resolution and
  security failures.

**Skills published in this repository**

- `java-performance@1.0.0`
- `java-clean-code@1.1.0`
- `jvm-gc-tuning@1.0.0`

### Notes

- Codex's global skill location is `$CODEX_HOME/skills` (default `~/.codex/skills`), verified
  against the Codex binary rather than assumed. It is overridable in config.
- Package signing is not implemented. Integrity proves a payload matches what the registry
  served, not who authored it.

### Also shipped in 1.0.0, documented late

These entries sat under `[Unreleased]` until the 1.2.0 release, but the code at tag `v1.0.0`
already carried every one of them.

### Added

- **`kind` in `skill.yaml`** — `skill` (the default, and what every existing package is) or
  `command`. A command package uses `COMMAND.md` as its entrypoint; everything else about the
  format is unchanged. Additive under `schemaVersion: 1`.
- **Claude Code commands** install to `$CLAUDE_CONFIG_DIR/commands/<name>.md` globally and
  `<project>/.claude/commands/<name>.md` per project. The adapter projects `description` plus
  `argument-hint`, `allowed-tools` and `model`; the file name is the command name, so `name`
  is dropped on projection.
- **Single-file installs** in `AtomicInstaller`: a package can now be one file instead of a
  directory, committed by the same staging-and-rename path, with the same receipt, drift
  detection and refusal to overwrite what the tool does not own.
- `agent-skills create <name> --kind command` scaffolds a command package.
- **Workflow packages** (`kind: workflow`), installed to `$CLAUDE_CONFIG_DIR/workflows/<name>.js`
  and `<project>/.claude/workflows/<name>.js`. The script is copied verbatim: Claude Code
  compiles it, so nothing is projected or reformatted.
- **`export const meta` is read statically** for workflow packages, by a literal parser
  (`core/domain/js-literal.ts`) that never executes the script. `parseEntrypoint` normalises it
  into the same `SkillDocument` a Markdown entrypoint produces, so identity, validation, search
  and `info` treat every kind alike. Claude Code's own rules — `meta` first, pure literal — are
  enforced here so a package that validates is one the agent can compile.
- **Workflow validation** in the Claude Code adapter: the determinism rules
  (`Date.now()`/`Math.random()`/`new Date()` are unavailable), disallowed control characters, and
  the shape of `meta.phases`. What used to fail at run time now fails at `publish`.
- `agent-skills create <name> --kind workflow` scaffolds a runnable skeleton.

### Changed

- **`AgentAdapter.skillRoot(scope, ctx)` is now `locationFor(kind, scope, ctx)`**, returning
  `{ root, shape, extension }` or `undefined` when the agent has no such kind. Out-of-tree
  adapters must be updated; see [docs/adding-an-agent.md](docs/adding-an-agent.md).
- **`AgentLayout` no longer carries `directoryName`.** The installer names the installed
  package after the manifest, for both entry shapes.
- `AgentTarget` gained `kind`, `shape` and `extension`. `list`, `uninstall` and `doctor`
  now visit every kind an agent supports; `install` writes only into the kind of the package.
- `agents.<id>.globalRoot` / `projectRoot` in config name the **skills** root; other kinds
  keep the agent's own convention rather than being redirected into it.

### Notes

- Codex declares no location for commands. Its custom-prompt directory has not been verified
  against the binary the way `$CODEX_HOME/skills` was, and installing a command there is
  reported as skipped rather than written to a guessed path.

[Unreleased]: https://github.com/robsonkades/agent-skills/compare/v1.11.1...HEAD
[1.11.1]: https://github.com/robsonkades/agent-skills/compare/v1.11.0...v1.11.1
[1.11.0]: https://github.com/robsonkades/agent-skills/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/robsonkades/agent-skills/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/robsonkades/agent-skills/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/robsonkades/agent-skills/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/robsonkades/agent-skills/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/robsonkades/agent-skills/compare/v1.6.0...v1.7.0
[1.2.0]: https://github.com/robsonkades/agent-skills/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/robsonkades/agent-skills/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/robsonkades/agent-skills/releases/tag/v1.0.0
