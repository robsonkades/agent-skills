# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A package manager for AI coding-agent skills — npm/Homebrew, but the install target is N
heterogeneous coding agents (Claude Code, Codex) rather than one runtime. That single fact
drives the whole architecture.

Deep background lives in [ARCHITECTURE.md](ARCHITECTURE.md) (how the code is shaped and why)
and [DESIGN.md](DESIGN.md) (the artefacts: manifest, registry protocol, adapter contract, CLI
UX). Read those before any structural change.

## Commands

```bash
npm run verify        # everything CI runs — do this before saying you are done
npm run build         # tsc --build across all 7 packages (project references)
npm run test:only     # tests without rebuilding
npm test              # build + tests
npm run lint          # eslint
npm run format        # prettier --write
npm run check:boundaries   # architecture dependency rule (see below)
npm run registry:build     # regenerate registry/skills.yaml
```

Run the CLI from source:

```bash
npm run agent-skills -- install java-performance --dry-run
node packages/cli/bin/agent-skills.mjs --help
```

Single test file, or a single test:

```bash
node --test packages/core/test/resolver.test.ts
node --test --test-name-pattern="detects a cycle" packages/core/test/resolver.test.ts
```

Tests use `node:test` with **no test framework** and run the TypeScript sources directly via
Node's native type stripping. `test:only` skips the build; cross-package imports
(`@jvm-expert/core`) still resolve to `dist`, so **build first if you changed another
package**.

## Two TypeScript constraints that will bite you immediately

`erasableSyntaxOnly` is on, because Node executes these sources directly in tests:

- **No `enum`** — use `const X = {...} as const` plus a union type. See `domain/errors.ts`.
- **No parameter properties** — `constructor(private readonly fs: FileSystem)` does not
  compile. Declare the field, then assign in the constructor body.
- No `namespace`, no non-declare class field initialisation tricks.

**Relative imports carry the `.ts` extension** (`./errors.ts`, not `./errors.js`).
`rewriteRelativeImportExtensions` emits `.js` at build time. Getting this wrong breaks either
the build or the test run, depending on which way you get it wrong.

## Architecture: the parts that need multiple files to understand

Seven packages, one dependency rule:

```
cli ──────► core ◄────── registry
 │           ▲              ▲
 │        installer      adapter-claude
 │                       adapter-codex
 └──────► node ─────────────┘
```

| Package                            | Owns                                                             | May import            |
| ---------------------------------- | ---------------------------------------------------------------- | --------------------- |
| `core`                             | Domain model, application services, **all port interfaces**      | nothing that does I/O |
| `node`                             | The only place `node:fs`, `child_process`, `fetch`, `tar` appear | core + built-ins      |
| `registry`                         | Local/Git/HTTP drivers + precedence federation                   | core                  |
| `installer`                        | Atomic install, path safety, archive extraction                  | core                  |
| `adapter-claude` / `adapter-codex` | One agent's layout + detection                                   | core (+ `node:path`)  |
| `cli`                              | Commander, rendering, **composition root**                       | everything            |

`npm run check:boundaries` enforces this and runs in CI. `core` may not import `node:fs` **or
`node:path`** — the domain carries its own POSIX path helper (`domain/posix-path.ts`) so it
behaves identically on every OS. If you add a package, register it in
`scripts/check-boundaries.mjs` or it is silently unchecked.

### Three invariants that are easy to violate

**1. Only `AtomicInstaller` writes into an agent's skill directory.**
`AgentAdapter` deliberately has **no `install()` / `uninstall()`**. Adapters _describe_ the
target (`locationFor`) and _project_ the package (`layoutFor`, a pure function returning a plan).
Every write goes through one hardened commit path, so atomicity, rollback, ownership tracking
and path-traversal defence exist once rather than once per agent.

**2. No agent-specific logic outside `packages/adapter-*`.**
If you are writing `if (agent === 'codex')` anywhere else, the design is telling you something.
The escape hatch for per-agent _presentation_ metadata is `agentOverrides` in the manifest,
whose keys each adapter allowlists via `overrideKeys`.

**3. Path safety has exactly one implementation:** `core/domain/path-safety.ts`.
Both `validate` (is this package well-formed?) and the extractor (is this archive hostile?)
wrap it. These were once separate and had already drifted — a package `validate` accepted could
be one the extractor rejected. Do not add a second copy.

### Where things live

- **Ports** — `core/src/ports/`. Small on purpose. Adding a method is a real design decision.
- **Application services** — `core/src/application/`. Own ordering and policy; perform no I/O
  themselves.
- **Composition root** — `packages/cli/src/container.ts`. The only file that constructs
  concrete classes. Registering a new adapter is one `.register(...)` call here.
- **Test doubles** — `@jvm-expert/core/testing` (`InMemoryFileSystem`, `FakeRegistry`,
  `buildPackage`, …). Exported from the package, not hidden in a test folder, so out-of-tree
  adapters can use them too. `core`'s own tests cannot import `@jvm-expert/registry` (that
  would invert the dependency rule), hence `core/test/helpers/federation-double.ts`.

## Never let a test or a manual run touch the real agent config

Anything that installs must be pointed at a temp directory first:

```bash
export AGENT_SKILLS_HOME="$SANDBOX/.agent-skills"
export CLAUDE_CONFIG_DIR="$SANDBOX/.claude"
export CODEX_HOME="$SANDBOX/.codex"
export HOME="$SANDBOX" USERPROFILE="$SANDBOX"   # project discovery reads the home dir
```

Set `HOME`/`USERPROFILE` too, not just the three overrides: project-root discovery walks up
from the cwd and needs to know where "home" is. Without it, a run from a temp directory under
the real `$HOME` can resolve project scope to the user's home and write into their actual agent
configuration. This has happened.

`packages/cli/test/cli.test.ts` does this correctly — copy its `cli()` helper rather than
reinventing it. It also clears `PATH` so a real `claude`/`codex` binary cannot influence
detection.

## Agent conventions are verified facts, not guesses

| Agent       | Kind     | Global                                                | Project                       |
| ----------- | -------- | ----------------------------------------------------- | ----------------------------- |
| Claude Code | skill    | `$CLAUDE_CONFIG_DIR/skills` → `~/.claude/skills`      | `<project>/.claude/skills`    |
| Claude Code | command  | `$CLAUDE_CONFIG_DIR/commands/<name>.md`               | `<project>/.claude/commands`  |
| Claude Code | workflow | `$CLAUDE_CONFIG_DIR/workflows/<name>.js`              | `<project>/.claude/workflows` |
| Codex       | skill    | `$CODEX_HOME/skills` → **`~/.codex/skills`**          | `<project>/.agents/skills`    |
| Codex       | command  | none — `locationFor` returns `undefined` (unverified) | none                          |
| Codex       | workflow | none — `locationFor` returns `undefined` (unverified) | none                          |

A package declares which it is with `kind` in `skill.yaml` — `skill` (default), `command` or
`workflow` — and the entrypoint follows: `SKILL.md`, `COMMAND.md` or `WORKFLOW.js`. A skill
installs as a directory; a command and a workflow each install as a single file named after the
package. `AgentLocation.shape` carries that, and every shape commits through the same rename in
`AtomicInstaller`.

A workflow is JavaScript, so its identity comes from `export const meta = { … }`, read by the
literal parser in `domain/js-literal.ts` — **never executed**. `parseEntrypoint` normalises both
forms into one `SkillDocument`, which is why validation, search and `info` never branch on kind.
The determinism rules (no `Date.now()`/`Math.random()`/`new Date()`) are Claude Code's own and
live in the Claude adapter.

Codex's global path was extracted from the `codex` binary itself. Widely repeated
documentation says `~/.agents/skills`; that is the _repository_ convention, not the user-global
one. **Do not "fix" this.** The skill roots are config-overridable per agent
(`agents.<id>.globalRoot` / `projectRoot`); those keys name the skills root only.

When adding an agent, verify against the real binary — see
[docs/adding-an-agent.md](docs/adding-an-agent.md).

## Generated files and their trap

`registry/skills.yaml` is generated by `scripts/build-registry-index.mjs` and is in
`.prettierignore` (its formatting comes from our own YAML serialiser, and prettier would fight
`registry:check` on every commit).

Package integrity is a hash over file **contents**, so **any edit under `skills/` changes the
integrity — including a prettier reformat of a `skill.yaml`**. After touching `skills/`:

```bash
npm run registry:build
```

`npm run verify` fails if you forget.

**And bump the skill's `version` whenever you change its contents.** A published version is
immutable: leaving it alone means anyone holding a lockfile pinned to the old integrity hash fails
verification, and anyone who already installed it never receives the change. `npm run
check:versions` (part of `verify`) compares each package against the last committed
`registry/skills.yaml` and refuses a changed package whose version stood still.

Two further gates live in `registry:build`, because they need to see every package at once and
`validate` only ever sees one: **dependency ranges must resolve** against the versions the index
publishes, and **`SKILL.md`'s description must equal the manifest's** — only the manifest one
ships, so a drifted frontmatter description is text no agent reads.

## Public contracts — changing these is a breaking change

- **`ASK_*` error codes** (`core/src/domain/errors.ts`) appear in `--json` output and in
  [docs/errors.md](docs/errors.md). They never change meaning; new ones may be added.
- **Exit codes** distinguish usage (2) / validation (3) / resolution (4) / security (5) /
  no-agent (6). Do not collapse them to 1.
- **`schemaVersion`** on manifests, indexes and lockfiles. Additive fields ship as _optional
  under the current number_; bump only for a genuinely breaking change.

## Conventions

- **Errors**: throw `AgentSkillsError` with a code, `details`, and `hints` (concrete next
  commands). Infrastructure errors are translated at the port boundary — no layer above should
  ever interpret an `ENOENT`.
- **Validation** returns every problem it can find (`IssueCollector`) rather than throwing on
  the first; only "this cannot be loaded at all" throws.
- **Commits**: Conventional Commits (`feat(installer): …`). See
  [CONTRIBUTING.md](CONTRIBUTING.md).
- Security-relevant changes want an adversarial test (hostile fixture), not a happy-path one.
  `packages/installer/test/security.test.ts` is the pattern.

## Note

An OpenAI Codex config exists at `~/.codex/config.toml`. If you want its user-level items (MCP
servers, slash commands, subagents, skills, instructions) available in Claude Code, reply
`/import` to scan and list what is importable, then `/import --yes=<digest>` to apply it. If
`/import` is unavailable on this surface, run `claude import` from a terminal instead.
