# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

All seven published packages move together in the 1.x line, so a single version identifies a
compatible set.

## [Unreleased]

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

[Unreleased]: https://github.com/robsonkades/agent-skills/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/robsonkades/agent-skills/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/robsonkades/agent-skills/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/robsonkades/agent-skills/releases/tag/v1.0.0
