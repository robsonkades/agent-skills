# Design

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md). Architecture says _how the code is
shaped_; this document says _what the artefacts are_ — the manifest schema, the registry
protocol, the adapter contract, the CLI surface, and the reasoning behind each.

---

## 1. Research: what the target agents actually do

Everything below was verified against installed agents rather than taken from the brief.

### Claude Code

| Aspect            | Finding                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| Global skills     | `~/.claude/skills/<name>/SKILL.md` (`$CLAUDE_CONFIG_DIR` overrides `~/.claude`)      |
| Project skills    | `<project>/.claude/skills/<name>/SKILL.md`                                           |
| Entrypoint        | `SKILL.md` with YAML frontmatter, required `name` + `description`                    |
| Extra frontmatter | `allowed-tools`, `license`, `metadata`, `user-invocable`, `disable-model-invocation` |
| Supporting files  | Free-form; `references/`, `scripts/`, `assets/` are conventions, not requirements    |
| Discovery         | Directory scan; the folder name is the skill identity                                |

### OpenAI Codex

| Aspect            | Finding                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Global skills     | `$CODEX_HOME/skills/<name>/`, defaulting to `~/.codex/skills`                                                                               |
| Project skills    | `<project>/.agents/skills/<name>/` (the vendor-neutral repo convention Codex plugin tooling emits)                                          |
| Entrypoint        | `SKILL.md` with YAML frontmatter, required `name` + `description`                                                                           |
| Extra frontmatter | `metadata.short-description`                                                                                                                |
| UI metadata       | Optional `agents/openai.yaml` with an `interface` block (`display_name`, `short_description`, `default_prompt`, `icon_small`, `icon_large`) |
| Supporting files  | `scripts/`, `references/`, `assets/`, `agents/`                                                                                             |

> **Correction to the brief.** The brief specifies `~/.agents/skills/<skill>` as Codex's
> global location. The Codex binary resolves global skills to `$CODEX_HOME/skills`
> (default `~/.codex/skills`); `.agents/skills/` is what Codex uses for _repository_
> layouts. This implementation follows the verified behaviour and keeps both paths
> overridable — see `AGENT_SKILLS_CODEX_HOME` and `codex.globalRoot` in config — so a
> future convention change is a config edit, not a release.

**The convergence is the product opportunity:** both agents already agree on
`SKILL.md` + frontmatter + a directory of supporting files. A cross-agent package format
is therefore mostly a _superset with a projection step_, not a translation layer.

---

## 2. Technology decision

| Criterion                        | Node/TypeScript                         | Go            | Rust          |
| -------------------------------- | --------------------------------------- | ------------- | ------------- |
| `npx <pkg>` with zero install    | **yes**                                 | no            | no            |
| Cold start                       | ~60–90 ms                               | ~5 ms         | ~3 ms         |
| Cross-compile to signed binaries | via SEA, awkward                        | **excellent** | **excellent** |
| Homebrew distribution            | possible                                | **trivial**   | **trivial**   |
| Audience already has the runtime | **yes** — both agents ship as Node CLIs | no            | no            |
| Contributor pool for this niche  | **largest**                             | medium        | smaller       |
| YAML/semver/tar ecosystem        | **mature**                              | mature        | mature        |

**Decision: TypeScript on Node ≥ 22.18, ESM, published to npm.**

The deciding factor is the second-to-last row. The users of this tool are people who
already installed Claude Code or Codex — both Node CLIs — so Node is already present.
`npx @jvm-expert/agent-skills install java-performance` works with nothing else installed, which
is precisely the product vision. A 70 ms startup is invisible for a command that then
does network I/O.

Go would win if the tool were a long-running daemon or shipped primarily through
Homebrew. It isn't. If binary distribution later matters, Node's single-executable
applications or a Go rewrite of the CLI shell over the same registry protocol are both
open — the protocol, not the implementation language, is the durable asset.

**Runtime dependencies are deliberately few** (`commander`, `yaml`, `semver`, `tar`,
`picocolors`). Each is a correctness-critical, widely-audited primitive that would be a
mistake to reimplement — especially `semver` and `tar`. Everything else is ours.

---

## 3. Skill package format

### 3.1 Layout

```
java-performance/
├── SKILL.md          required — agent entrypoint, YAML frontmatter + Markdown body
├── skill.yaml        required — machine-readable manifest (the packaging contract)
├── references/       optional — docs loaded on demand
├── examples/         optional — illustrative material
├── scripts/          optional — helper scripts (never executed by the installer)
└── assets/           optional — files copied into generated output
```

**Why both `SKILL.md` and `skill.yaml`?** They serve different readers and have different
change cadences. `SKILL.md` frontmatter is the _agent's_ contract: minimal, and whatever
the agent supports. `skill.yaml` is the _package manager's_ contract: versions,
dependencies, integrity, licence, compatibility. Cramming distribution metadata into
`SKILL.md` frontmatter would push fields at agents that must ignore them, and would make
the format hostage to whichever agent is strictest. Keeping them separate means
`skill.yaml` can gain a field without any agent needing to tolerate it.

The two are kept consistent by validation: `name` must match, `version` must match if
`SKILL.md` declares one, and the directory name must equal `name`.

### 3.2 `SKILL.md`

```markdown
---
name: java-performance
version: 1.0.0
description: >
  Java performance engineering focused on JVM, JIT compilation, GC,
  allocation and profiling. Use when diagnosing latency regressions,
  high CPU with normal GC, or allocation pressure.
---

# Java Performance Engineering

## Purpose

...

## Workflow

...

## Rules

...
```

Only `name` and `description` are required — the intersection of what both agents accept.
`description` carries the routing signal: _what it covers and when to use it_, since both
agents select skills on name + description alone.

### 3.3 `skill.yaml` — the manifest

```yaml
schemaVersion: 1 # package format version (integer)

name: java-performance # ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$, 2..64 chars
kind: skill # skill (default) | command | workflow — decides where it installs
version: 1.0.0 # strict semver
description: Java performance engineering skill.
license: Apache-2.0 # SPDX identifier
keywords: [java, jvm, performance, profiling, jit, gc]

authors:
  - name: Jane Doe
    email: jane@example.com
    url: https://example.com

homepage: https://example.com/java-performance
repository:
  type: git
  url: https://github.com/org/agent-skills
  directory: skills/java-performance

# Agent compatibility. Omit to mean "every agent".
compatibility:
  agents:
    - id: claude-code
      minVersion: '>=2.0.0' # optional agent version constraint
    - id: codex

# What ships in the package. Directories are included recursively.
files:
  - SKILL.md
  - skill.yaml
  - references/
  - examples/

dependencies:
  - name: java-basics
    version: '^1.2.0'
optionalDependencies:
  - name: jvm-gc-tuning
    version: '^2.0.0'

# Declarative, informational capability tags. Consumed by `info` and by policy
# tooling; never grants anything.
capabilities:
  - reads-source
  - runs-scripts

# Populated by `publish`; verified by `install`.
integrity: sha256-9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08

# Reserved for signing (roadmap). Ignored by v1 but accepted.
signatures: []

# Optional per-agent overrides. Escape hatch of last resort — see §3.4.
agentOverrides:
  codex:
    interface:
      display_name: Java Performance
      short_description: JVM, JIT, GC and allocation diagnostics
```

Validation rules worth calling out:

- `kind` decides the entrypoint filename: `SKILL.md` for a skill, `COMMAND.md` for a
  command, `WORKFLOW.js` for a workflow. Everything else about the format is identical, and
  an unknown kind is a validation error rather than a parse failure.
- A workflow's identity lives in `export const meta = { name, description }` instead of YAML
  frontmatter. It is read **statically** — the script is never executed — which is why Claude
  Code's "pure literal, no computed values" rule is enforced here too.
- `name` must equal the directory name and the entrypoint frontmatter `name`.
- `version` must be strict semver; ranges are rejected here (they belong in dependencies).
- `files` entries are validated for path safety at _pack_ time, not just install time —
  a malicious manifest cannot describe an escaping path.
- Unknown top-level keys are an **error** in strict mode (`validate --strict`, and always
  during `publish`) and a **warning** during `install`, so an older CLI can still install
  a newer package that only added optional fields.
- `dependencies` and `optionalDependencies` may not name the skill itself.

### 3.4 On `agentOverrides`

The brief says agent-specific behaviour must not leak into skills. That is right as a
default, and `agentOverrides` is the deliberate, bounded exception: it carries only
_presentation_ metadata that an agent needs and the neutral format has no place for
(Codex's `interface` block being the concrete case). It cannot alter files, paths,
dependencies, or execution. Validation rejects any key outside a per-agent allowlist that
the adapter itself declares — so the escape hatch stays narrow and adapters, not skill
authors, decide how wide it is.

---

## 4. Registry protocol

A registry is anything that can answer four questions: _what skills exist_, _what
versions exist for a name_, _what is the manifest of a version_, and _give me the bytes_.

### 4.1 Index document

Every registry kind ultimately exposes the same index. For Git and Local registries it is
a file at the registry root; for HTTP it is a URL.

`registry/skills.yaml` (or `index.json` over HTTP):

```yaml
schemaVersion: 1
name: official
updatedAt: 2026-08-23T00:00:00Z

skills:
  - name: java-performance
    description: Java performance engineering skill.
    keywords: [java, jvm, performance]
    latest: 1.0.0
    versions:
      - version: 1.0.0
        # Where the payload lives, relative to the registry root (git/local)
        # or absolute (http). Exactly one of `path` or `tarball`.
        path: skills/java-performance
        integrity: sha256-9f86d0...
        publishedAt: 2026-08-23T00:00:00Z
        deprecated: false
```

Design notes:

- **The index is denormalised on purpose.** `search` and `info` must be fast and must work
  offline against a cached index; forcing a per-skill manifest fetch to render a search
  result would make the common path N round-trips.
- **`integrity` is in the index, not only in the manifest.** The index is the document a
  registry operator signs (roadmap); putting the hash there means a compromised payload
  is caught even if the manifest inside it was rewritten to match.
- **Versions are an explicit list, never a directory listing.** Directory listings are not
  available over plain HTTPS static hosting and differ per Git host; an explicit list
  makes all three registry kinds behave identically.
- **`deprecated`** lets a version stay resolvable for lockfiles while being excluded from
  `latest` resolution.

### 4.2 Registry kinds

| Kind    | URL form                              | Payload transport                             | Cache                               |
| ------- | ------------------------------------- | --------------------------------------------- | ----------------------------------- |
| `local` | `file:///abs/path` or a plain path    | Directory copy                                | none (read-through)                 |
| `git`   | `https://github.com/org/repo.git#ref` | Shallow clone into cache, then directory copy | `~/.agent-skills/cache/git/<hash>`  |
| `http`  | `https://host/path/index.json`        | `.tar.gz` fetched over HTTPS                  | `~/.agent-skills/cache/http/<hash>` |

`git` is the v1 default because it needs no infrastructure: a public GitHub repo with a
`registry/skills.yaml` and a `skills/` directory _is_ a registry. `http` exists so that a
static bucket, or a future hosted service, can serve the identical protocol without any
client change.

### 4.3 Precedence

Ordered list, first match owns the _name_ (rationale and threat model in
ARCHITECTURE.md §6). Configured in `~/.agent-skills/config.json`:

```json
{
  "registries": [
    {
      "name": "company",
      "url": "https://git.acme.internal/skills.git",
      "kind": "git",
      "trusted": true
    },
    {
      "name": "official",
      "url": "https://github.com/robsonkades/agent-skills.git",
      "kind": "git",
      "trusted": true
    }
  ]
}
```

Qualified references (`company:java-performance`) bypass precedence.

---

## 5. Agent adapter contract

```ts
export interface AgentAdapter {
  readonly id: AgentId;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly overrideKeys: readonly string[]; // allowlist for agentOverrides

  detect(env: Environment): Promise<AgentDetection>;
  locationFor(
    kind: PackageKind,
    scope: InstallScope,
    ctx: LocationContext,
  ): AgentLocation | undefined;
  layoutFor(pkg: SkillPackage): AgentLayout;
  validate(pkg: SkillPackage): readonly ValidationIssue[];
}
```

### `detect`

Returns `{ installed, confidence, evidence[], version? }`. Detection is evidence-based
rather than boolean so `doctor` can explain itself:

- **strong** — the agent's config directory exists (`~/.claude`, `$CODEX_HOME`)
- **strong** — the executable is on `PATH`
- **weak** — only the project marker exists (`.claude/`, `.agents/`)

An agent with any strong evidence is auto-selected. Weak-only evidence is reported but
requires `--agent` to act on, so a stray directory never silently redirects an install.

### `locationFor`

The only place a path convention is written down. It answers per **package kind**, because
an agent keeps skills and commands in different places and in different shapes:

```ts
interface AgentLocation {
  root: string; // directory holding every package of this kind
  shape: 'directory' | 'file'; // one package is a directory, or one file
  extension: string; // appended to the name for `file` shape, e.g. ".md"
}
```

| Adapter       | Kind      | Global                                               | Project                   | Shape       |
| ------------- | --------- | ---------------------------------------------------- | ------------------------- | ----------- |
| `claude-code` | `skill`   | `$CLAUDE_CONFIG_DIR/skills` → `~/.claude/skills`     | `<root>/.claude/skills`   | `<name>/`   |
| `claude-code` | `command` | `$CLAUDE_CONFIG_DIR/commands` → `~/.claude/commands` | `<root>/.claude/commands` | `<name>.md` |
| `codex`       | `skill`   | `$CODEX_HOME/skills` → `~/.codex/skills`             | `<root>/.agents/skills`   | `<name>/`   |
| `codex`       | `command` | — (returns `undefined`)                              | —                         | —           |

Returning `undefined` is how an adapter says "this agent has no such concept": the install
is reported as skipped for that agent instead of being written somewhere invented. Codex does
have custom prompts, but their directory has not been verified against the binary the way
`$CODEX_HOME/skills` was, and this project does not hardcode unverified paths.

The skill roots are overridable per-agent in config (`agents.<id>.globalRoot` /
`projectRoot`); those keys name the _skills_ root, so other kinds keep the agent's own
convention. Nothing else in the codebase knows these strings.

### `layoutFor`

Returns the _projection_ of a neutral package onto the agent:

```ts
interface AgentLayout {
  entries: readonly LayoutEntry[]; // { path, content | copyFrom }
  frontmatter: Readonly<Record<string, unknown>>; // projected entrypoint frontmatter
}
```

The installed package is named after the manifest, so the layout carries no name of its own.
A `file`-shaped target takes exactly one entry; more than one is an adapter bug, and the
installer says so rather than dropping files silently.

- **Claude** projects `name`, `description`, and `license` for a skill; for a command it
  projects only `description` plus command frontmatter (`argument-hint`, `allowed-tools`,
  `model`), because the file name _is_ the command name.
- **Codex** projects `name`, `description`, and `metadata.short-description`; additionally
  synthesises `agents/openai.yaml` from `agentOverrides.codex.interface`, falling back to
  the manifest's description and a title-cased name.

Because `layoutFor` is pure — package in, plan out — every adapter's projection is
snapshot-testable with no filesystem at all.

---

## 6. Lock file

`skills.lock` is written for **project** installs only. Global installs are a user's
mutable environment, not a reproducible artefact; forcing a lockfile there would be noise.

```yaml
lockfileVersion: 1
generatedWith: '@jvm-expert/agent-skills@1.0.0'

skills:
  java-performance:
    version: 1.0.0
    registry: official
    resolved: https://github.com/robsonkades/agent-skills.git#main:skills/java-performance
    integrity: sha256-9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
    agents: [claude-code, codex]
    dependencies:
      java-basics: 1.2.3
  java-basics:
    version: 1.2.3
    registry: official
    resolved: https://github.com/robsonkades/agent-skills.git#main:skills/java-basics
    integrity: sha256-...
    agents: [claude-code, codex]
    dependencies: {}
```

`install` with an existing lockfile and no explicit version **uses the locked version**;
`update` is what changes it. Integrity mismatch against a lockfile aborts and prints the
expected/actual pair — never a silent re-resolve.

Skills are stored as a **sorted map**, not a list, so lockfile diffs are minimal and
merge conflicts are localised to the changed skill.

---

## 7. Dependency resolution

The v1 resolver is deliberately simple, and simple is defensible here: skill graphs are
shallow (a skill depends on one or two foundational skills, not on a transitive tree of
hundreds).

**Algorithm** — breadth-first over the dependency graph, collecting constraints per name:

1. Seed the queue with the requested refs.
2. For each name, intersect all accumulated semver ranges.
3. Pick the **highest published version satisfying the intersection**, excluding
   deprecated versions unless explicitly requested.
4. If the intersection is empty, fail with the full constraint chain that produced it.
5. Track the visit path; a repeated name on the current path is a **cycle** and fails with
   the cycle rendered as `a → b → c → a`.
6. Deterministic ordering: names sorted, so the same input always yields the same plan.

**No backtracking.** If a chosen version's own dependencies conflict, v1 reports the
conflict rather than searching for an alternative assignment. This is the honest tradeoff:
backtracking is where package managers get slow and surprising, and skill graphs do not
yet justify it. `Resolver` is a single class behind a single call, so replacing it with a
PubGrub-style solver later touches nothing else.

Optional dependencies that fail to resolve are **skipped with a warning**, never fatal.

---

## 8. CLI UX

### Commands

```
agent-skills install <skill...>        install one or more skills
agent-skills uninstall <skill...>      remove skills the tool installed
agent-skills update [skill...]         update all, or the named skills
agent-skills list                      installed skills, per agent and scope
agent-skills search <query>            search across configured registries
agent-skills info <skill>              manifest, versions, dependencies, install state
agent-skills validate [path]           validate a skill package directory
agent-skills create <name>             scaffold a new skill package
agent-skills publish [path]            validate and emit publishable artefacts
agent-skills doctor                    diagnose the installation
agent-skills registry list|add|remove  manage registries
```

### Flags

| Flag                     | Applies to                           | Meaning                                                                                                                      |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `--agent <id>`           | install, uninstall, update, list     | `claude`, `codex`, or `all`; repeatable. Default: every detected agent                                                       |
| `--global` / `--project` | install, uninstall, update, list     | Scope. Default: `--global`, unless a `skills.lock` or an agent project directory exists, which makes `--project` the default |
| `--project-root <path>`  | project-scoped commands              | Defaults to the nearest ancestor with `.git`, `skills.lock`, or an agent project directory                                   |
| `--registry <name>`      | install, search, info                | Restrict to one configured registry                                                                                          |
| `--dry-run`              | install, uninstall, update           | Print the plan; write nothing                                                                                                |
| `--force`                | install, uninstall                   | Overwrite a modified install / delete modified files                                                                         |
| `--json`                 | list, search, info, doctor, validate | Machine-readable output                                                                                                      |
| `--verbose`, `--quiet`   | all                                  | Log level                                                                                                                    |
| `--no-color`             | all                                  | Also honours `NO_COLOR`                                                                                                      |
| `--version`, `--help`    | all                                  | Standard                                                                                                                     |

The flag set is intentionally short. Notably absent: `--save`/`--save-dev` (scope already
says this), `--registry-url` (registries are named and configured, so a lockfile can refer
to them), and `--yes` (nothing prompts destructively without `--force`).

### Error message standard

Every user-facing failure carries a code, a cause, and a next action:

```
error  Version conflict for "java-basics"

  java-performance@1.0.0 requires ^1.2.0
  jvm-gc-tuning@2.1.0    requires ~1.1.0

  No published version satisfies both.

  Try:  agent-skills info java-basics       to see available versions
        agent-skills install jvm-gc-tuning@^2.2.0
                                            newer versions may relax this

  code: ASK_DEPENDENCY_CONFLICT
```

Error codes are stable identifiers (`ASK_*`), documented in `docs/errors.md`, so scripts
and issue reports can refer to them.

### Exit codes

`0` success · `1` generic failure · `2` usage error · `3` validation failure ·
`4` resolution failure · `5` integrity/security failure · `6` no agent detected.

---

## 9. Publishing

`agent-skills publish` in v1 is **prepare-and-emit**, not upload — because the v1
registry is a Git repository and its write path is a pull request, which is a better
review surface than an API token anyway.

It performs, in order:

1. Full strict validation of the package (manifest, `SKILL.md`, structure, path safety).
2. Semver sanity: version not already present in the target registry index; version
   greater than the current `latest`.
3. Dependency resolvability against the target registry.
4. Compatibility check: every declared agent id is known.
5. Computes `integrity` over the canonical digest tree.
6. Emits the registry index entry to stdout (or patches `registry/skills.yaml` with
   `--write`), plus a `.tar.gz` when `--pack` is given.

`PublishTarget` is a port. `GitPublishTarget` is v1; an `HttpPublishTarget` posting to a
hosted registry is a class, not a redesign.

---

## 10. Configuration

`~/.agent-skills/config.json` (override the whole directory with `AGENT_SKILLS_HOME`):

```json
{
  "schemaVersion": 1,
  "registries": [
    {
      "name": "official",
      "url": "https://github.com/robsonkades/agent-skills.git",
      "kind": "git",
      "trusted": true
    }
  ],
  "agents": {
    "claude-code": { "enabled": true },
    "codex": { "enabled": true }
  },
  "cache": { "ttlSeconds": 3600 }
}
```

Per-agent `globalRoot` / `projectRoot` overrides are accepted here and are how a user
copes with an agent changing its convention before we ship an adapter update.

---

## 11. Open questions

1. **Skill namespacing.** v1 uses flat names and registry precedence. If the ecosystem
   grows, `@org/skill` scoping is the natural next step; the name validator already
   reserves `@` and `/` so adding it is not breaking.
2. **Agent version constraints.** `compatibility.agents[].minVersion` is parsed and
   surfaced but only enforced when detection can determine a version, which not every
   agent exposes reliably. Enforcement tightens as detection improves.
3. **Project-scope Codex path.** `.agents/skills/` is the repo convention Codex tooling
   emits, but it is less firmly established than the other three paths. It is config-
   overridable for exactly this reason.
