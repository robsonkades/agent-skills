# AGENTS.md

This file provides guidance to OpenAI Codex when working in this repository.

## What this is

A package manager for AI coding-agent skills—npm/Homebrew, but the install target is multiple
heterogeneous coding agents (Claude Code, Codex) rather than one runtime. That single fact drives
the whole architecture.

Deep background lives in [ARCHITECTURE.md](ARCHITECTURE.md) (how the code is shaped and why) and
[DESIGN.md](DESIGN.md) (the artefacts: manifest, registry protocol, adapter contract, CLI UX).
Read both before any structural change.

## Commands

```bash
npm run verify             # everything CI runs; run before claiming completion
npm run build              # tsc --build across all 7 packages (project references)
npm run test:only          # tests without rebuilding
npm test                   # build + tests
npm run lint               # eslint
npm run format             # prettier --write
npm run check:boundaries   # architecture dependency rule
npm run registry:build     # regenerate registry/skills.yaml
```

Run the CLI from source:

```bash
npm run agent-skills -- install java-performance --dry-run
node packages/cli/bin/agent-skills.mjs --help
```

Run a single test file or test:

```bash
node --test packages/core/test/resolver.test.ts
node --test --test-name-pattern="detects a cycle" packages/core/test/resolver.test.ts
```

Tests use `node:test` with no test framework and run TypeScript sources directly via Node's native
type stripping. `test:only` skips the build; cross-package imports (`@jvm-expert/core`) still
resolve to `dist`, so build first after changing another package.

## TypeScript constraints

`erasableSyntaxOnly` is enabled because Node executes the sources directly in tests:

- Do not use `enum`; use a `const` object with `as const` plus a union type. See
  `domain/errors.ts`.
- Do not use parameter properties. Declare the field and assign it in the constructor body.
- Do not use `namespace` or non-declare class-field initialization tricks.
- Relative imports carry the `.ts` extension (`./errors.ts`, not `./errors.js`).
  `rewriteRelativeImportExtensions` emits `.js` at build time.

## Architecture

Seven packages follow one dependency rule:

```text
cli ──────► core ◄────── registry
 │           ▲              ▲
 │        installer      adapter-claude
 │                       adapter-codex
 └──────► node ─────────────┘
```

| Package                            | Owns                                                                 | May import            |
| ---------------------------------- | -------------------------------------------------------------------- | --------------------- |
| `core`                             | Domain model, application services, all port interfaces              | nothing that does I/O |
| `node`                             | The only place `node:fs`, `child_process`, `fetch`, and `tar` appear | core + built-ins      |
| `registry`                         | Local/Git/HTTP drivers + precedence federation                       | core                  |
| `installer`                        | Atomic install, path safety, archive extraction                      | core                  |
| `adapter-claude` / `adapter-codex` | One agent's layout + detection                                       | core (+ `node:path`)  |
| `cli`                              | Commander, rendering, composition root                               | everything            |

`npm run check:boundaries` enforces this in CI. `core` may not import `node:fs` or `node:path`;
the domain carries its own POSIX path helper (`domain/posix-path.ts`) so behavior is identical on
every OS. When adding a package, register it in `scripts/check-boundaries.mjs` or it is silently
unchecked.

### Invariants

1. **Only `AtomicInstaller` writes into an agent's skill directory.** `AgentAdapter` deliberately
   has no `install()` or `uninstall()`. Adapters describe the target (`locationFor`) and project
   the package (`layoutFor`, a pure function returning a plan). Every write goes through one
   hardened commit path so atomicity, rollback, ownership tracking, and path-traversal defense
   exist once.
2. **No agent-specific logic outside `packages/adapter-*`.** If code outside those packages needs
   `if (agent === 'codex')`, reconsider the design. Per-agent presentation metadata belongs in
   manifest `agentOverrides`; each adapter allowlists its keys through `overrideKeys`.
3. **Path safety has exactly one implementation:** `core/domain/path-safety.ts`. Both validation
   and archive extraction wrap it. Do not create a second implementation.

### Where things live

- Ports: `packages/core/src/ports/`. They are intentionally small; adding a method is a design
  decision.
- Application services: `packages/core/src/application/`. They own ordering and policy and do no
  I/O themselves.
- Composition root: `packages/cli/src/container.ts`. This is the only file that constructs
  concrete classes. Register a new adapter with one `.register(...)` call here.
- Test doubles: `@jvm-expert/core/testing` (`InMemoryFileSystem`, `FakeRegistry`, `buildPackage`,
  etc.). They are exported so out-of-tree adapters can use them. Core's tests cannot import
  `@jvm-expert/registry`, so use `core/test/helpers/federation-double.ts` there.

## Protect real agent configuration

Never allow a test or manual installation run to touch the user's real agent configuration.
Point all relevant locations at an isolated temporary directory:

```bash
export AGENT_SKILLS_HOME="$SANDBOX/.agent-skills"
export CLAUDE_CONFIG_DIR="$SANDBOX/.claude"
export CODEX_HOME="$SANDBOX/.codex"
export HOME="$SANDBOX" USERPROFILE="$SANDBOX"
```

On PowerShell, set the equivalent process-scoped environment variables. Use task-specific variable
names rather than overwriting shell variables globally, and restore inherited values after a
manual run if the shell persists.

Set `HOME`/`USERPROFILE` in the isolated child process as well as the three overrides: project-root
discovery walks upward from the working directory and must know where "home" is. Otherwise a run
from a temporary directory beneath the real home can resolve project scope to the user's home and
write into actual agent configuration.

`packages/cli/test/cli.test.ts` handles this correctly. Reuse its `cli()` helper; it also clears
`PATH` so a real `claude` or `codex` binary cannot affect detection.

## Agent conventions are verified facts

| Agent       | Kind     | Global                                               | Project                       |
| ----------- | -------- | ---------------------------------------------------- | ----------------------------- |
| Claude Code | skill    | `$CLAUDE_CONFIG_DIR/skills` → `~/.claude/skills`     | `<project>/.claude/skills`    |
| Claude Code | command  | `$CLAUDE_CONFIG_DIR/commands/<name>.md`              | `<project>/.claude/commands`  |
| Claude Code | workflow | `$CLAUDE_CONFIG_DIR/workflows/<name>.js`             | `<project>/.claude/workflows` |
| Codex       | skill    | `$CODEX_HOME/skills` → `~/.codex/skills`             | `<project>/.agents/skills`    |
| Codex       | command  | none; `locationFor` returns `undefined` (unverified) | none                          |
| Codex       | workflow | none; `locationFor` returns `undefined` (unverified) | none                          |

A package declares `kind` in `skill.yaml`: `skill` (default), `command`, or `workflow`. Its
entrypoint is respectively `SKILL.md`, `COMMAND.md`, or `WORKFLOW.js`. A skill installs as a
directory; commands and workflows install as a single file named after the package.
`AgentLocation.shape` carries that distinction, and every shape commits through the same rename in
`AtomicInstaller`.

A workflow's identity comes from `export const meta = { ... }`, read by the literal parser in
`domain/js-literal.ts` and never executed. `parseEntrypoint` normalizes all forms to one
`SkillDocument`; validation, search, and `info` therefore do not branch on kind. Claude Code's
workflow determinism rules (`Date.now()`, `Math.random()`, and `new Date()` are forbidden) belong
in the Claude adapter.

Codex's global path was extracted from the `codex` binary. Documentation that cites
`~/.agents/skills` describes the repository convention, not the user-global location. Do not
"fix" this. Skill roots are configurable per agent through `agents.<id>.globalRoot` and
`projectRoot`; these settings name the skills root itself.

When adding an agent, verify behavior against the real binary and follow
[docs/adding-an-agent.md](docs/adding-an-agent.md).

## Generated files and versions

`registry/skills.yaml` is generated by `scripts/build-registry-index.mjs` and intentionally listed
in `.prettierignore`; its formatting belongs to the repository's YAML serializer.

Package integrity hashes file contents, so every edit under `skills/` changes integrity, including
format-only changes. After touching `skills/`:

```bash
npm run registry:build
```

Also bump the skill's `version` whenever its contents change. Published versions are immutable:
without a bump, lockfiles pinned to the old hash fail verification and existing installations do
not receive the update. `npm run check:versions`, included in `verify`, enforces this against the
last committed `registry/skills.yaml`.

`registry:build` also checks cross-package constraints: dependency ranges must resolve against
published index versions, and the `SKILL.md` description must equal the manifest description.
Only the manifest description ships.

## Public contracts

Treat these as breaking-change boundaries:

- `ASK_*` error codes in `core/src/domain/errors.ts` appear in JSON output and
  [docs/errors.md](docs/errors.md). Never change an existing code's meaning; new codes may be
  added.
- Exit codes distinguish usage (2), validation (3), resolution (4), security (5), and no-agent
  (6). Do not collapse them to 1.
- `schemaVersion` applies to manifests, indexes, and lockfiles. Additive fields remain optional
  under the current version; bump it only for a genuinely breaking change.

## Repository conventions

- Errors: throw `AgentSkillsError` with a code, `details`, and concrete command `hints`.
  Translate infrastructure errors at the port boundary; higher layers must not interpret
  `ENOENT`.
- Validation: return every discoverable problem through `IssueCollector`; throw only when the
  input cannot be loaded at all.
- Commits: use Conventional Commits, for example `feat(installer): ...`. See
  [CONTRIBUTING.md](CONTRIBUTING.md).
- Security-relevant changes require an adversarial test (a hostile fixture), not only a happy-path
  test. Follow `packages/installer/test/security.test.ts`.

## Codex working rules

- Inspect the relevant implementation, tests, and package-level documentation before editing.
- Keep changes scoped to the user's request. Preserve unrelated user changes and avoid broad
  formatting or cleanup.
- Use `rg`/`rg --files` for repository searches and `apply_patch` for hand edits.
- Do not edit generated `registry/skills.yaml` by hand.
- Run the narrowest useful checks while developing and `npm run verify` before claiming the work
  is complete. If a check cannot run, report that explicitly rather than implying it passed.
- Read command output, not only exit status: a successful test command can still execute zero
  tests or skip relevant work.
- Never weaken or remove a test merely to make a build pass.
- Do not commit, publish, install globally, or modify real agent configuration unless the user
  explicitly requests it.
