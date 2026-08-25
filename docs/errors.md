# Error codes

Every failure carries a stable `ASK_*` code. Codes appear in error output, in `--json` payloads
and in this document, so scripts and bug reports can refer to them precisely.

Codes never change meaning. New ones may be added.

## Exit codes

Distinct exit codes let CI react differently to "your package is wrong" and "the download was
tampered with" — which is the whole reason not to return `1` for everything.

| Exit | Meaning                       | Typical response                      |
| ---- | ----------------------------- | ------------------------------------- |
| `0`  | Success                       | —                                     |
| `1`  | Generic failure               | Read the message                      |
| `2`  | Usage error                   | Fix the command line                  |
| `3`  | Validation failure            | Fix the package                       |
| `4`  | Resolution failure            | Fix versions or registries            |
| `5`  | Integrity or security failure | **Stop.** Investigate before retrying |
| `6`  | No supported agent detected   | Install an agent, or pass `--agent`   |

## Usage

### `ASK_USAGE` · exit 2

The command cannot be interpreted. Includes `--global` together with `--project`, an empty
skill reference, and running a project-scoped command outside a project.

```
agent-skills install java-performance --global   # pick one
agent-skills install java-performance --project
```

## Package format · exit 3

### `ASK_INVALID_MANIFEST`

`skill.yaml` is unparseable or missing a required field (`name`, `version`, `description`).

### `ASK_INVALID_PACKAGE`

The package structure is wrong: no `SKILL.md`, frontmatter missing or unparseable, or the
package failed validation during install.

Run `agent-skills validate <path>` to see every problem at once.

### `ASK_INVALID_SKILL_NAME`

The name violates the grammar: lowercase alphanumerics separated by single hyphens, 2–64
characters, no consecutive hyphens, not a reserved word.

### `ASK_INVALID_VERSION`

A version is not strict semver, or a range is malformed. Ranges belong in dependencies; the
`version` field must be exact.

### `ASK_UNSUPPORTED_SCHEMA`

The package, index or lockfile uses a format version newer than this CLI understands.

```bash
npm install -g @jvm-expert/agent-skills@latest
```

### `ASK_LOCKFILE_INVALID`

`skills.lock` is unparseable or missing required fields. Deleting it and re-running `install`
regenerates it — at the cost of re-resolving versions.

### `ASK_PUBLISH_REJECTED`

`publish` refused: validation failed, the version is already published, or a dependency is not
published in the target registry.

## Resolution · exit 4

### `ASK_SKILL_NOT_FOUND`

No configured registry publishes the name.

```bash
agent-skills search <partial-name>
agent-skills registry list
```

### `ASK_VERSION_NOT_FOUND`

The name exists but the requested version does not. `agent-skills info <name>` lists what is
published.

### `ASK_DEPENDENCY_CONFLICT`

Two requirements cannot both be satisfied. The message shows every constraint and who imposed
it:

```
error  Version conflict for "java-basics"

  java-performance@1.0.0  requires ^1.2.0
  jvm-gc-tuning@2.1.0     requires ~1.1.0

  No published version satisfies all of them.
  Available: 1.3.0, 1.2.1, 1.1.0

  Try:
    agent-skills info java-basics
    Relax a constraint, or install a newer version of the skill that requires the old range
```

### `ASK_DEPENDENCY_CYCLE`

Skills depend on each other in a loop. The message renders the cycle:

```
  a-skill → b-skill → c-skill → a-skill
```

## Registries

### `ASK_REGISTRY_NOT_FOUND` · exit 1

`--registry <name>` or a qualified reference named a registry that is not configured.

### `ASK_REGISTRY_UNAVAILABLE` · exit 1

A registry could not be reached: network failure, missing `git`, authentication, or an HTTP
error. Raised only when _every_ registry fails; a single outage is skipped and reported by
`doctor`.

### `ASK_REGISTRY_INVALID_INDEX` · exit 1

The registry index is malformed. This is a problem with the registry, not your machine —
report it to its maintainers.

### `ASK_REGISTRY_DUPLICATE` · exit 1

`registry add` used a name already configured. Remove it first, or pick another name.

## Security · exit 5

**Treat every code in this section as a stop signal.** Do not retry with `--force`, and do not
work around it, until you know why it happened.

### `ASK_INTEGRITY_MISMATCH`

Downloaded content does not hash to what the registry index declares. Either the registry was
changed in place, or the download was tampered with.

### `ASK_LOCKFILE_MISMATCH`

Content does not match what `skills.lock` recorded. The message shows both hashes.

If the change is expected — someone republished a version in place — `agent-skills update
<name>` re-resolves and re-locks. If it is not expected, investigate before doing that.

### `ASK_UNSAFE_PATH`

A package tried to write to a path that escapes its directory, is absolute, is a UNC path, uses
a Windows reserved name, addresses an NTFS alternate data stream, or contains control
characters. The package is malformed or hostile; do not install it.

### `ASK_UNSAFE_ARCHIVE`

An archive contained a symlink or hardlink, duplicate entries, or exceeded the entry-count,
size or compression-ratio limits.

### `ASK_INSECURE_TRANSPORT`

A registry URL used plaintext `http://` for a non-loopback host. Use `https://`. For a local
development registry, `http://localhost` is permitted.

## Agents · exit 6 or 1

### `ASK_NO_AGENT_DETECTED` · exit 6

No supported agent was found. The message lists supported agents and any weak evidence found.

```bash
agent-skills doctor                              # what detection saw
agent-skills install java-performance --agent claude   # target one explicitly
```

### `ASK_UNKNOWN_AGENT` · exit 1

`--agent` named an agent that has no adapter. The message lists the known ids and aliases.

### `ASK_AGENT_INCOMPATIBLE` · exit 1

The skill declares `compatibility.agents` that excludes the requested agent.

## Installation · exit 1

### `ASK_ALREADY_INSTALLED`

The exact version is already installed. Not an error in normal flows; `install` reports
`unchanged`.

### `ASK_NOT_INSTALLED`

`uninstall` or `update` named a skill that is not installed. The message lists the directories
searched.

### `ASK_MODIFIED_INSTALL`

The target directory contains files this tool did not install, or files that were edited after
installation. Nothing was changed.

- `--force` on `install` replaces them.
- `--force` on `uninstall` deletes them.
- Without `--force`, your edits are preserved — deliberately.

### `ASK_INSTALL_FAILED`

Installation failed after staging. The previous version is intact; nothing partial was left
behind. A cross-filesystem rename (`EXDEV`) surfaces here and indicates a bug worth reporting.

## Filesystem · exit 1

### `ASK_PERMISSION_DENIED`

A directory could not be read or written.

Do not use `sudo` — it will create root-owned files in your home directory that later runs
cannot manage. Fix the permissions, or install with `--project`.

On Windows, a file open in another program produces this too.

### `ASK_IO_ERROR`

Any other filesystem failure: missing file, out of disk, corrupted metadata. Run
`agent-skills doctor`.

## Internal · exit 1

### `ASK_INTERNAL`

A bug in this tool. Please
[open an issue](https://github.com/robsonkades/agent-skills/issues) with the command you ran
and the output of `agent-skills doctor`.
