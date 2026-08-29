# Skill package format

Version `1` of the package format. The specification is normative; anything not stated here is
unspecified and may change.

## Package layout

```
<name>/
├── SKILL.md          required   agent entrypoint: YAML frontmatter + Markdown body
│                                (COMMAND.md when kind: command,
│                                 WORKFLOW.js when kind: workflow)
├── skill.yaml        required   packaging manifest
├── references/       optional   documentation read on demand
├── examples/         optional   illustrative material
├── scripts/          optional   helper scripts — never executed by the installer
└── assets/           optional   files copied into generated output
```

The directory name **must** equal the manifest `name`.

### Why two files

`SKILL.md` frontmatter is the _agent's_ contract: minimal, and limited to what agents actually
read. `skill.yaml` is the _package manager's_ contract: versions, dependencies, integrity,
licence, compatibility.

Merging them would push distribution metadata at agents that must then ignore it, and would
hold the format hostage to whichever agent is strictest about unknown keys. Keeping them
separate lets `skill.yaml` gain a field without any agent needing to tolerate it.

Consistency is enforced by validation: `name` must match across the manifest, the frontmatter
and the directory; `version` must match if the frontmatter declares one; and `description` **should**
match, because **only the manifest one ships**. Adapters project `manifest.description` into the
installed entrypoint and the registry index carries the same value, so a frontmatter description
that has drifted is text no agent will ever read — including any trigger or boundary clause an
author added there. Edit the description in `skill.yaml` and mirror it, not the other way round.

A mismatch is a **warning** rather than an error: the package installs and works, so refusing it
would be disproportionate. A registry that wants the stronger guarantee enforces it when it builds
its index, where it can see its own packages — this repository does exactly that, and
`npm run registry:build` refuses to write an index containing one.

---

## `SKILL.md`

```markdown
---
name: java-performance
description: >
  Java performance engineering on the JVM: JIT compilation, garbage collection,
  allocation pressure, and profiling methodology. Use when diagnosing a latency
  regression, high CPU with normal GC, or slow startup. Does not cover SQL tuning.
---

# Java Performance Engineering

## Purpose

...

## Workflow

...

## Rules

...
```

### Required frontmatter

| Field         | Type   | Notes                                                 |
| ------------- | ------ | ----------------------------------------------------- |
| `name`        | string | Must equal the manifest `name` and the directory name |
| `description` | string | What the skill covers **and when to use it**          |

These two are the intersection of what Claude Code and Codex both require. The description is
the routing signal: both agents choose a skill from name and description alone, before any of
the body is loaded.

### Optional frontmatter

| Field                      | Consumed by | Notes                                                   |
| -------------------------- | ----------- | ------------------------------------------------------- |
| `version`                  | validation  | If present, must match the manifest                     |
| `allowed-tools`            | Claude Code | String or list of strings; preserved verbatim           |
| `argument-hint`            | Claude Code | Commands only; preserved verbatim                       |
| `model`                    | Claude Code | Commands only; preserved verbatim                       |
| `user-invocable`           | Claude Code | Preserved verbatim                                      |
| `disable-model-invocation` | Claude Code | Preserved verbatim                                      |
| `metadata`                 | Codex       | Merged with the adapter's generated `short-description` |

Adapters **project** the frontmatter: each writes the keys its agent understands and drops the
rest. An author never writes agent-specific frontmatter by hand.

### Body

Markdown, loaded when the skill is selected. Keep it short and route to `references/` for
detail that only some tasks need — every line of the body costs context on every use.

---

## `COMMAND.md` — packages with `kind: command`

A command is a prompt the **user** invokes (`/ship-it`), where a skill is context the
**model** selects. The package format is the same one: `skill.yaml` plus an entrypoint, named
`COMMAND.md` instead of `SKILL.md`.

```markdown
---
name: ship-it
description: Opens a pull request for the current branch.
argument-hint: '[reviewer]'
---

Open a pull request for the current branch and request a review from $ARGUMENTS.
```

The body is the prompt that runs, not documentation for a reader.

Two consequences of how agents store commands:

- **A command installs as a single file** (`<name>.md`), because the file name is the command
  name. Nothing else in the package is installed — `validate` warns when a command package
  ships extra files, rather than letting an install drop them silently. Material a command
  needs on disk belongs in a skill.
- **Only agents that have commands receive them.** Claude Code does; the Codex adapter
  declares no location for the kind, so an install there is reported as skipped. Declaring
  `compatibility.agents: [claude-code]` makes that explicit in the package.

The frontmatter `name` is still required and still must match the manifest — validation is
uniform across kinds — but the Claude Code adapter drops it on projection, since the file name
already carries it.

---

## `WORKFLOW.js` — packages with `kind: workflow`

A workflow is a deterministic script Claude Code compiles and runs by name, orchestrating
sub-agents. Its entrypoint is JavaScript, so its identity lives in `meta` rather than in YAML
frontmatter:

```js
export const meta = {
  name: 'ship-review',
  description: 'Reviews the current branch before a pull request.',
  phases: [{ title: 'Read', detail: 'Collect the diff' }, { title: 'Report' }],
};

phase('Read');
await agent({
  description: 'Read the diff',
  prompt: 'Summarise what changed on this branch.',
});

phase('Report');
log('done');
```

The declaration **must be the first statement** and **must be a pure literal** — no variables,
calls, concatenation or template strings. Both rules are Claude Code’s; this format enforces
them so that `meta` can be read without ever executing the script. `name` and `description`
then behave exactly like frontmatter: they must agree with the manifest, and they are what
`search` and `info` show.

Three further rules come from the agent and are checked at validate time:

- **Determinism.** `Date.now()`, `Math.random()` and `new Date()` are unavailable, because a
  run must be resumable. Stamp results after the run instead.
- **No control characters** beyond tab, newline and carriage return.
- **`meta.phases`**, when present, is a list of `{ title, detail? }`. Titles are matched
  against `phase()` calls exactly.

Like a command, a workflow installs as a single file (`<name>.js`) and its bytes are copied
verbatim — nothing is projected or reformatted, because the agent compiles what ships. Any
other file in the package is not installed, and `validate` says so.

---

## `skill.yaml`

```yaml
schemaVersion: 1

name: java-performance
version: 1.0.0
description: Java performance engineering on the JVM.
license: Apache-2.0
keywords: [java, jvm, performance, profiling]

authors:
  - name: Jane Doe
    email: jane@example.com
    url: https://example.com

homepage: https://example.com/java-performance
repository:
  type: git
  url: https://github.com/org/agent-skills
  directory: skills/java-performance

compatibility:
  agents:
    - id: claude-code
      minVersion: '>=2.0.0'
    - id: codex

files:
  - SKILL.md
  - skill.yaml
  - references/
  - examples/

dependencies:
  - name: jvm-gc-tuning
    version: ^1.0.0

optionalDependencies:
  - name: java-basics
    version: ^1.2.0

suggests:
  - retries-and-backoff
  - flame-graph-analysis

capabilities:
  - reads-source

integrity: sha256-Y4Is8pJpAyfkZYvFW9b5ItWwMD4FoxgADnY5XLR38O8=
signatures: []

agentOverrides:
  codex:
    interface:
      display_name: Java Performance
      short_description: JVM, JIT, GC and allocation diagnostics
```

### Field reference

| Field                  | Required | Type                 | Rules                                                                                                                                                                                                    |
| ---------------------- | -------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`        | no       | integer              | Defaults to `1`. A higher value than the CLI understands is a hard error with an upgrade message.                                                                                                        |
| `kind`                 | no       | string               | `skill` (default), `command` or `workflow`. Decides the entrypoint filename and where the package installs. An unknown value is an error.                                                                |
| `name`                 | **yes**  | string               | `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, 2–64 characters, no consecutive hyphens. `@` and `/` are reserved for future scoping.                                                                                 |
| `version`              | **yes**  | string               | Strict semver. Ranges are rejected here.                                                                                                                                                                 |
| `description`          | **yes**  | string               | Warned if under 10 characters.                                                                                                                                                                           |
| `license`              | no       | string               | SPDX identifier. Warned if absent.                                                                                                                                                                       |
| `keywords`             | no       | string[]             | Used by `search`.                                                                                                                                                                                        |
| `authors`              | no       | string[] or object[] | Objects take `name` (required), `email`, `url`.                                                                                                                                                          |
| `homepage`             | no       | string               |                                                                                                                                                                                                          |
| `repository`           | no       | string or object     | Object takes `url` (required), `type`, `directory`.                                                                                                                                                      |
| `compatibility.agents` | no       | (string \| object)[] | Agent ids, optionally with `minVersion`. **Omit the whole block to mean "every agent".** A non-empty list is an allowlist.                                                                               |
| `files`                | no       | string[]             | Defaults to the kind's entrypoint plus `skill.yaml`, and must include that entrypoint. Directory entries end with `/` and are included recursively. Absolute and traversing paths are errors.            |
| `dependencies`         | no       | object[]             | `{ name, version }` where `version` is a semver range. A self-dependency or a duplicate is an error. See **What a dependency means** below.                                                              |
| `optionalDependencies` | no       | object[]             | Same shape. Failure to resolve one is a warning, not an error.                                                                                                                                           |
| `suggests`             | no       | string[]             | Bare skill names, **no version range**. Skills this one points the reader at without pulling them into the install. A self-suggestion or a duplicate is an error. See **What a dependency means** below. |
| `capabilities`         | no       | string[]             | Informational tags. **Grants nothing.**                                                                                                                                                                  |
| `integrity`            | no       | string               | Written by `publish`. Verified by `install`.                                                                                                                                                             |
| `signatures`           | no       | array                | Reserved. Accepted and ignored in v1.                                                                                                                                                                    |
| `agentOverrides`       | no       | object               | Per-agent presentation metadata. Keys are allowlisted by the adapter.                                                                                                                                    |

Unknown top-level fields are a **warning** during `install` — so an older CLI can still install
a package that only added optional fields — and an **error** under `validate --strict` and
during `publish`.

### What a dependency means

A dependency is **"install this alongside, because this skill assumes it"** — a conceptual
prerequisite or a routing target, not a code-level import.

That definition has three consequences worth stating, because the alternative reading —
"this skill cannot function without" — leads people to declare too few, and to be surprised by
the ones that are declared:

- **A dependency need not appear in the prose.** A skill may declare the reasoning discipline it
  assumes without ever naming it, and a reader who has one without the other is missing something
  the author relied on.
- **But every routing target must be declared.** A row in a routing table — `| symptom | \`owning-skill\` |`— promises that the named skill is the one to go to. Nothing resolves a name found in prose, so
the promise is only kept if the target installs alongside.`npm run registry:build` fails on a
  table row whose target the package does not declare. This is the direction that matters: the
  two older gates both ask whether a _declared_ dependency is real, and a hub once shipped a
  29-row table with three dependencies declared — every other row a dead end.
- **Routing runs both ways; `dependencies` cannot.** A hub routes to its specialists and they
  route back, but the resolver refuses a cycle. Only one direction survives, and it is the hub's:
  `gof-pattern-thinking` declares the twenty-odd `gof-*` skills its table routes to, and they no
  longer declare it. A hub without its targets is broken; a specialist reached directly does not
  need the overview it was chosen out of.
- **A skill still works without its dependencies installed.** Nothing loads them at run time.
  They are a packaging statement about what belongs together, which is why an unresolvable one
  is an install-time error and never a run-time one.
- **The range is a real constraint and is checked.** `npm run registry:build` resolves every
  declared range against the versions the index publishes and refuses to write an index in which
  one cannot be satisfied. `validate` cannot do this — it sees one package at a time — so a
  dependency pinned to a major that no longer exists will pass `validate` and fail at install
  unless the index build catches it first.

Declare one when a reader arriving at this skill without the other would be misled, and leave it
out when the other is merely adjacent. `optionalDependencies` is for the case where the pairing
is useful but its absence is not a defect.

### `suggests`, and why it is not a dependency

A skill names other skills far more often than it can depend on them. "`retries-and-backoff` owns
the mechanism", "see `io-uring-and-zero-copy` first", a depth ladder listing a family at three
levels — each is a promise that the named skill is where to go next, and each strands the reader
if that skill is absent.

Making them all dependencies is not the fix. Measured across this catalogue, it puts 209 of 244
skills in the transitive closure of a typical entry point: installing anything installs
everything. So the pointer gets a weaker field.

`suggests` is a list of **names**, deliberately without ranges. Nothing resolves it, nothing
installs from it, and no range is checked — a range here would be a constraint no gate enforces,
and this format does not carry claims it cannot back. What it buys is that the pointer is
declared: `agent-skills info` lists it, so a reader who lacks the target is told what to install
instead of hitting a name that goes nowhere.

The split is enforced, not conventional. `npm run registry:build` fails when a package names
another published skill in its Markdown and declares it in neither list:

- a **routing-table row** must be a dependency, because the table promises an owner;
- **anything else** must be at least a suggestion.

The one exception the build works out for itself: a routing row whose target already reaches back
through declared dependencies cannot become one without closing a cycle, and `suggests` is then
the honest record of it.

### `agentOverrides`

The one deliberate exception to "skills are agent-neutral". It carries only presentation
metadata that an agent needs and the neutral format has no place for. It cannot alter files,
paths, dependencies or execution.

Each adapter declares which keys it accepts; anything else is a validation error.

| Agent         | Accepted keys                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `claude-code` | none — Claude has no vendor metadata file                                                       |
| `codex`       | `interface` → `display_name`, `short_description`, `default_prompt`, `icon_small`, `icon_large` |

---

## Integrity

Integrity is a sha-256 over a **canonical digest tree**, not over a tarball:

```
for each file, sorted by path:
    "<path> <sha256(content)>"
join with newline, append newline, sha-256 the result
```

Hashing an archive would make the value depend on tar padding, mtimes and gzip settings — so
the same package fetched from a git registry and from an HTTP registry would hash differently.
Hashing content means one package has one integrity value regardless of how it travelled, which
is what lets a lockfile written against a git registry keep verifying after a move to HTTP.

The manifest's own `integrity:` line is excluded from its input, since it cannot be known
before it is computed.

---

## Validation rules

`agent-skills validate <path>` reports every problem it finds, each with a stable rule id.

**Errors** (installation refused):

| Rule                                        | Meaning                                          |
| ------------------------------------------- | ------------------------------------------------ |
| `manifest.name.invalid`                     | Name violates the grammar                        |
| `manifest.files.traversal` / `.absolute`    | A `files` entry escapes the package              |
| `manifest.files.missingEntrypoint`          | `SKILL.md` not in `files`                        |
| `manifest.dependencies.self` / `.duplicate` | Self-dependency or duplicate                     |
| `skill.name.mismatch`                       | Frontmatter name disagrees with the manifest     |
| `skill.version.mismatch`                    | Frontmatter version disagrees with the manifest  |
| `skill.description.missing`                 | No description — agents cannot route without one |
| `package.directory.mismatch`                | Directory name disagrees with the skill name     |
| `package.entrypoint.missing`                | No `SKILL.md`                                    |
| `path.*`                                    | A shipped path is unsafe on some platform        |
| `manifest.agentOverrides.unknownKey`        | An override key the adapter does not accept      |

**Warnings** (installation proceeds):

| Rule                          | Meaning                                             |
| ----------------------------- | --------------------------------------------------- |
| `manifest.license.missing`    | No licence declared                                 |
| `manifest.description.short`  | Description too short to route on                   |
| `manifest.unknownField`       | Unknown manifest field (an error under `--strict`)  |
| `package.files.missing`       | A declared path is not present                      |
| `skill.body.thin`             | The Markdown body is nearly empty                   |
| `skill.description.mismatch`  | Frontmatter description disagrees with the manifest |
| `claude.description.long`     | Longer than Claude Code's picker shows              |
| `codex.interface.missingIcon` | A referenced icon is not shipped                    |

---

## Compatibility across format versions

- Additive fields ship as **optional under `schemaVersion: 1`**. An older CLI warns about them
  and installs anyway.
- `schemaVersion` is bumped only for a genuinely breaking change. A CLI that meets a higher
  number refuses the package and tells the user to upgrade, rather than guessing.
