# Contributing

Thanks for helping. There are three common kinds of contribution, and they need different
things from you.

- **A new skill** — see [Contributing a skill](#contributing-a-skill).
- **A new agent adapter** — see [docs/adding-an-agent.md](docs/adding-an-agent.md).
- **A change to the tool itself** — read on.

---

## Getting set up

```bash
git clone https://github.com/robsonkades/agent-skills.git
cd agent-skills
npm install
npm run verify
```

`npm run verify` is the same set of checks CI runs:

| Step       | Command                    | What it catches                                                                                                       |
| ---------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Build      | `npm run build`            | Type errors across all seven packages                                                                                 |
| Boundaries | `npm run check:boundaries` | An import that violates the dependency rule                                                                           |
| Lint       | `npm run lint`             | Style and correctness rules                                                                                           |
| Format     | `npm run format:check`     | Formatting drift                                                                                                      |
| Registry   | `npm run registry:check`   | `registry/skills.yaml` out of date, an unsatisfiable dependency range, a description that disagrees with its manifest |
| Versions   | `npm run check:versions`   | A skill whose contents changed without its `version` moving                                                           |
| Tests      | `npm run test:only`        | Everything else                                                                                                       |

Requires Node 22.18 or newer. Tests run TypeScript sources directly via Node's native type
stripping, so there is no separate test build step.

## Repository layout

```
packages/
  core/            domain model, application services, ports — no I/O, no agents
  node/            Node implementations of the infrastructure ports
  registry/        local, git and http registries + precedence-aware federation
  installer/       atomic installation, path safety, archive extraction
  adapter-claude/  Claude Code adapter
  adapter-codex/   Codex adapter
  cli/             commander CLI and the composition root
skills/            the skills this repository publishes
registry/          the generated registry index
docs/              format, protocol and adapter documentation
```

Read [ARCHITECTURE.md](ARCHITECTURE.md) before a structural change. The short version:

- **`core` depends on nothing** that does I/O. It may not import `node:fs`, `node:path`, or
  any agent. `npm run check:boundaries` enforces this.
- **Agent-specific behaviour belongs in an adapter.** If you find yourself adding
  `if (agent === 'codex')` anywhere outside `packages/adapter-codex`, the design is telling
  you something.
- **Only `AtomicInstaller` writes into an agent's skill directory.** Adapters describe a
  layout; they never perform file operations. This is what keeps atomicity and path safety in
  one reviewed place.

## Making a change

1. **Open an issue first** for anything beyond a bug fix, so the design discussion happens
   before the code.
2. **Write the test first** when fixing a bug. A bug fix without a test that fails before it
   is a bug waiting to come back.
3. **Keep the diff focused.** One logical change per pull request.
4. **Run `npm run verify`** before pushing.

### Tests

- Domain and application logic is tested with fakes for every port —
  `@jvm-expert/core/testing` provides an `InMemoryFileSystem` and doubles for the rest. These
  tests need no disk and no network.
- Filesystem behaviour that a fake cannot prove — atomic rename, permissions — is tested
  against a real temp directory created with `fs.mkdtemp`, and always cleaned up.
- Security rules are tested with hostile fixtures, not happy paths. If you add a rule, add the
  input that would have exploited its absence.
- CLI tests spawn the real binary with `AGENT_SKILLS_HOME`, `CLAUDE_CONFIG_DIR` and
  `CODEX_HOME` pointed at a temp directory, so they can never touch your own agent config.

Tests must pass on Linux, macOS and Windows. Be careful with path separators, and never assume
a case-sensitive filesystem.

### Commits

[Conventional Commits](https://www.conventionalcommits.org):

```
feat(installer): reject hardlinks during extraction
fix(resolver): honour lockfile pins for transitive dependencies
docs(readme): explain registry precedence
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`.
A `!` after the type, or a `BREAKING CHANGE:` footer, marks a breaking change.

Commit messages should explain _why_. The diff already shows _what_.

## Contributing a skill

Skills live in `skills/<name>/` and are published through the registry index.

```bash
npm run agent-skills -- create my-skill --directory skills
# write SKILL.md
npm run agent-skills -- validate skills/my-skill --strict
npm run registry:build
```

What makes a skill worth merging:

- **The description is the routing signal.** Agents choose a skill from its name and
  description alone. Say what it covers _and when to use it_ — and, when it is easily confused
  with a neighbour, what it does not cover.
- **It changes what the agent does.** Generic advice the model already follows is noise that
  costs context. Include what is non-obvious, specific, or easy to get wrong.
- **Detail lives in `references/`.** `SKILL.md` is loaded whenever the skill is selected;
  references are read on demand. Keep the entrypoint short and route to the rest.
- **It is agent-neutral.** Do not write "when using Claude Code…". If an agent genuinely needs
  presentation metadata, that belongs in `agentOverrides`, which adapters allowlist.
- **`scripts/` is never executed by this tool.** It ships as data for the agent to run
  deliberately.

**Bump the version in `skill.yaml` for any change to a published skill**, following semver:
a reworded rule is a patch, new coverage is a minor, removing or inverting guidance is a major.

This is not a nicety. A published version is immutable, because integrity is a hash over the
package contents: editing a skill without bumping it breaks lockfile verification for anyone
pinned to the old hash, and hides the change from anyone who already installed that version.
`npm run check:versions` — part of `verify` — compares every package against the last committed
`registry/skills.yaml` and fails the build if one changed without moving.

## Releasing

Maintainers only.

1. Update [CHANGELOG.md](CHANGELOG.md).
2. Bump versions across the workspace (all packages move together in v1).
3. Tag `v<version>`; the release workflow publishes to npm with provenance.

## Code of conduct

Be decent. Assume good faith, critique the work rather than the person, and remember that the
person on the other end of a pull request is doing this voluntarily.

## Licence

By contributing you agree that your contribution is licensed under
[Apache-2.0](LICENSE).
