# agent-skills

**A package manager for AI coding-agent skills.**

Install a skill once; it lands in every coding agent you use, in the layout that agent
expects.

```bash
npx @jvm-expert/agent-skills install java-performance
```

```
Installed

✓ jvm-gc-tuning@1.0.0  from official  (dependency)
    claude-code
      ~/.claude/skills/jvm-gc-tuning            2 files
    codex
      ~/.codex/skills/jvm-gc-tuning             3 files
✓ java-performance@1.0.0  from official
    claude-code
      ~/.claude/skills/java-performance         5 files
    codex
      ~/.codex/skills/java-performance          6 files
```

---

## Contents

1. [What this is](#what-this-is)
2. [Why it exists](#why-it-exists)
3. [Supported agents](#supported-agents)
4. [Installing the CLI](#installing-the-cli)
5. [Installing a skill](#installing-a-skill)
6. [Global and project scope](#global-and-project-scope)
7. [Versioning and the lockfile](#versioning-and-the-lockfile)
8. [Creating a skill](#creating-a-skill)
9. [Publishing](#publishing)
10. [Registries](#registries)
11. [Command reference](#command-reference)
12. [Security](#security)
13. [Contributing](#contributing)

---

## What this is

A skill is a folder containing a `SKILL.md` file: instructions a coding agent loads when a
task matches its description. Claude Code and Codex both read this format, and both look for
it in a different directory, with slightly different frontmatter.

`agent-skills` is the package manager for those folders. It gives skills versions,
dependencies, checksums, a registry, and a `SKILL.md` format that is agent-neutral — then
projects each package onto whatever layout the target agent actually wants.

npm for JavaScript, Homebrew for CLI tools, `agent-skills` for the instructions your coding
agents run on.

## Why it exists

Skills spread today by copy-paste. That means:

- **No versions.** You have "the one Ana sent in March". Nobody knows what changed.
- **No dependencies.** A performance skill that assumes a JVM-basics skill has no way to say so.
- **No integrity.** A skill is instructions your agent follows. Pasting one from a gist is
  running unreviewed code with extra steps.
- **No portability.** The same skill has to be maintained twice, once per agent, because the
  directory layout and the frontmatter differ.
- **No updates.** When a skill improves, everyone who copied it keeps the old one forever.

Those are the problems package managers solved for source code twenty years ago. This applies
the same solution to agent skills, with the extra wrinkle that there is more than one runtime
to install into.

## Supported agents

| Agent            | Global location                                    | Project location            |
| ---------------- | -------------------------------------------------- | --------------------------- |
| **Claude Code**  | `$CLAUDE_CONFIG_DIR/skills/` → `~/.claude/skills/` | `<project>/.claude/skills/` |
| **OpenAI Codex** | `$CODEX_HOME/skills/` → `~/.codex/skills/`         | `<project>/.agents/skills/` |

Both paths are overridable in config. Agents are detected automatically:

```bash
$ agent-skills agents

Detecting agents...

✓ Claude Code detected
    config-dir: /home/dev/.claude
    executable: /usr/local/bin/claude
✓ Codex detected
    config-dir: /home/dev/.codex
```

Support for another agent is one adapter package implementing four methods — no change to the
core. See [docs/adding-an-agent.md](docs/adding-an-agent.md).

## Installing the CLI

No installation needed:

```bash
npx @jvm-expert/agent-skills install java-performance
```

Or install it globally for a shorter command:

```bash
npm install -g @jvm-expert/agent-skills
agent-skills install java-performance
```

Requires Node 22.18 or newer — which you already have if you run Claude Code or Codex, since
both ship as Node CLIs.

## Installing a skill

```bash
# Every detected agent
agent-skills install java-performance

# One agent
agent-skills install java-performance --agent claude
agent-skills install java-performance --agent codex

# Every known agent, detected or not
agent-skills install java-performance --agent all

# A specific version
agent-skills install java-performance@1.2.0
agent-skills install java-performance@^1.2.0
agent-skills install java-performance@latest

# Several at once
agent-skills install java-performance java-clean-code

# See the plan without writing anything
agent-skills install java-performance --dry-run
```

Dependencies are resolved and installed first. Installation is atomic: if anything fails, the
version you already had is untouched.

## Global and project scope

**Global** installs into your user configuration — available in every repository:

```bash
agent-skills install java-performance --global
```

**Project** installs into the repository, so the skill is versioned with the code and every
teammate gets the same one:

```bash
agent-skills install java-performance --project
```

```
project/
├── .claude/skills/java-performance/     # for Claude Code
├── .agents/skills/java-performance/     # for Codex
└── skills.lock                          # exact versions and checksums
```

Commit `.claude/`, `.agents/` and `skills.lock` together, or add the skill directories to
`.gitignore` and commit only `skills.lock` — then `agent-skills install` restores them
exactly, the way `npm ci` does.

Scope defaults to `--global`, except inside a directory that already has a `skills.lock` or an
agent skills directory, where it defaults to `--project`.

## Versioning and the lockfile

Skills use [semantic versioning](https://semver.org). `skills.lock` pins the exact version,
registry, and content hash of everything installed into a project:

```yaml
lockfileVersion: 1
generatedWith: '@jvm-expert/agent-skills@1.0.0'
skills:
  java-performance:
    version: 1.0.0
    registry: official
    resolved: https://github.com/robsonkades/agent-skills.git#main:skills/java-performance
    integrity: sha256-Y4Is8pJpAyfkZYvFW9b5ItWwMD4FoxgADnY5XLR38O8=
    agents: [claude-code, codex]
    dependencies:
      jvm-gc-tuning: 1.0.0
```

- `install <name>` honours the locked version.
- `install <name>@latest` deliberately overrides it.
- `update` is what changes the lock.

If the registry ever serves content that does not match the recorded hash, the install aborts
and tells you exactly what differed. That is not a cache miss — it means what you are being
served changed.

```bash
agent-skills update                    # everything, within the current major
agent-skills update java-performance   # one skill
agent-skills update --major            # allow major-version jumps
```

## Creating a skill

```bash
agent-skills create java-performance
```

```
java-performance/
├── SKILL.md              # the agent-facing instructions
├── skill.yaml            # the packaging manifest
├── references/
│   └── notes.md
├── examples/
└── scripts/
```

`SKILL.md` is what the agent reads:

```markdown
---
name: java-performance
description: >
  Java performance engineering on the JVM: JIT compilation, garbage collection,
  allocation pressure, and profiling. Use when diagnosing a latency regression,
  high CPU with normal GC, or slow startup.
---

# Java Performance Engineering

## Purpose

...

## Workflow

...

## Rules

...
```

`skill.yaml` is what the package manager reads — versions, dependencies, licence, integrity.
They are separate on purpose: `SKILL.md` stays minimal and agent-compatible, while
distribution metadata can grow without pushing unknown fields at agents.

Validate before you share it:

```bash
agent-skills validate java-performance
agent-skills validate java-performance --strict   # what publishing will enforce
```

Test it locally by installing from the directory, then iterating.

Full format reference: [docs/skill-format.md](docs/skill-format.md).

## Publishing

```bash
agent-skills publish java-performance
```

This validates everything a registry would, computes the content hash, and prints the registry
index entry to commit. Publishing goes through a pull request rather than an upload API,
because a skill becomes instructions an agent follows — that deserves review.

```
Ready to publish java-performance@1.0.0

  Add this to the registry index (registry/skills.yaml):

    - name: java-performance
      description: Java performance engineering on the JVM...
      latest: 1.0.0
      versions:
        - version: 1.0.0
          path: skills/java-performance
          integrity: sha256-Y4Is8pJpAyfkZYvFW9b5ItWwMD4FoxgADnY5XLR38O8=
```

## Registries

A registry is a git repository, an HTTPS endpoint, or a local directory containing a
`registry/skills.yaml` index and a `skills/` directory.

```bash
agent-skills registry list
agent-skills registry add company https://git.acme.internal/skills.git --first
agent-skills registry add local ./my-skills --kind local
agent-skills registry remove company
```

Registries are an **ordered list, and earlier wins by name**. The first registry that publishes
a name owns it — a later one cannot inject a higher version of a name your company registry
already provides. That is deliberate: it is the property that prevents dependency-confusion
attacks. To reach a specific registry regardless of order, qualify the reference:

```bash
agent-skills install company:java-performance
```

Protocol details: [docs/registry-protocol.md](docs/registry-protocol.md).

## Command reference

| Command                      | Purpose                                               |
| ---------------------------- | ----------------------------------------------------- |
| `install <skill...>`         | Install skills                                        |
| `uninstall <skill...>`       | Remove skills this tool installed                     |
| `update [skill...]`          | Update to the newest compatible version               |
| `list`                       | Show what is installed, per agent and scope           |
| `search <query>`             | Search the configured registries                      |
| `info <skill>`               | Metadata, versions, dependencies and install state    |
| `validate [path]`            | Validate a skill package                              |
| `create <name>`              | Scaffold a new skill                                  |
| `publish [path]`             | Validate and emit a registry entry                    |
| `doctor`                     | Diagnose agents, directories, registries and installs |
| `agents`                     | Show which agents were detected                       |
| `registry list\|add\|remove` | Manage registries                                     |

Common flags: `--agent <id>` (repeatable, or `all`), `--global` / `--project`,
`--registry <name>`, `--dry-run`, `--force`, `--json`, `--verbose`, `--quiet`, `--no-color`.

Every failure carries a stable error code, documented in [docs/errors.md](docs/errors.md), and
exits with a code that distinguishes a validation failure from a resolution failure from a
security failure.

```bash
agent-skills doctor
```

```
Agent Skills Doctor

Environment
  ✓ CLI  @jvm-expert/agent-skills@1.0.0
  ✓ Node  v22.18.0
  ✓ Platform  linux
Registries
  ✓ official #1  git · 3 skills
Claude Code
  ✓ Detected  yes
  ✓ global skill directory  /home/dev/.claude/skills
Codex
  ✓ Detected  yes
  ✓ global skill directory  /home/dev/.codex/skills
Installations
  ✓ Installed skill metadata  4 managed · 0 modified · 0 not managed by agent-skills

✓ Everything looks good.
```

## Security

Skill packages are treated as untrusted content, because they are: a skill is instructions
your agent will follow.

- **Integrity** — every package is hashed over a canonical digest of its contents and checked
  against the registry index and the lockfile before anything is written.
- **Path safety** — traversal, absolute paths, UNC paths, drive letters, NTFS alternate data
  streams, Windows reserved names and trailing-dot filenames are rejected on every platform.
- **No links** — symlinks and hardlinks in packages are refused outright.
- **Archive limits** — entry count, per-entry size, total size and compression ratio are
  capped, so a decompression bomb fails fast.
- **Atomic installs** — a package is staged and validated in full, then committed with a
  single rename. A failure leaves your existing version untouched.
- **Ownership** — the installer records exactly which files it wrote. `uninstall` removes only
  those, and never deletes a file you edited unless you pass `--force`.
- **HTTPS only** — plaintext registries are refused outside loopback.
- **Nothing is executed** — `scripts/` in a package is copied as data. This tool never runs it.

Not yet: package signing. Integrity proves the bytes match what the registry served, not who
wrote them. See [SECURITY.md](SECURITY.md) for the threat model and how to report a
vulnerability.

## Contributing

Contributions welcome — new skills, new agent adapters, and fixes alike.

```bash
git clone https://github.com/robsonkades/agent-skills.git
cd agent-skills
npm install
npm run verify     # build, boundaries, lint, format, registry index, tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md), and [ARCHITECTURE.md](ARCHITECTURE.md) /
[DESIGN.md](DESIGN.md) for how the system is put together and why.

## Licence

[Apache-2.0](LICENSE)
