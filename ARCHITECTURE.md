# Architecture

> Status: accepted for v1 · Last reviewed: 2026-08-23

`agent-skills` is a package manager for AI coding-agent skills. It is to skills what
npm is to JavaScript libraries and Homebrew is to CLI tools: a versioned package
format, a federated registry model, a resolver, and an installer — with the crucial
difference that the _installation target_ is not one runtime but N heterogeneous
coding agents, each with its own on-disk convention.

That single difference drives the whole architecture.

---

## 1. Forces

| Force                                                                                   | Consequence                                                                   |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Agents disagree on where skills live and what frontmatter they accept                   | Agent knowledge must be isolated behind an adapter port                       |
| Agents will be added by third parties, out of tree                                      | Adapters must be plugins resolvable at runtime                                |
| Skills come from GitHub today, an HTTP registry tomorrow, a corporate mirror after that | Registry must be a port with interchangeable implementations                  |
| Downloaded skills are arbitrary attacker-controlled files                               | Extraction, path handling and integrity must be a hard boundary, not a helper |
| A half-written skill directory silently poisons an agent                                | Installation must be atomic and reversible                                    |
| The team is small; the CLI must ship                                                    | No microservices, no marketplace, no daemon in v1                             |

---

## 2. Shape: hexagonal, with a thin waist

```
                            ┌────────────────────────────────┐
                            │        @jvm-expert/agent-skills       │
                            │ commander · rendering · wiring │
                            │       (composition root)       │
                            └───────────────┬────────────────┘
                                            │ calls application services
                            ┌───────────────▼────────────────┐
                            │       @jvm-expert/core       │
                            │                                │
                            │ domain/      SkillRef, Version │
                            │              Manifest, Lock,   │
                            │              Resolution graph  │
                            │ application/ InstallSkill      │
                            │              UpdateSkill       │
                            │              RemoveSkill       │
                            │              SearchSkills      │
                            │              ListInstalled     │
                            │              ValidatePackage   │
                            │              PublishSkill      │
                            │              DiagnoseSystem    │
                            │ ports/       (interfaces only) │
                            └───────────────┬────────────────┘
             ┌──────────────────────────────┼──────────────────────────────┐
             │                              │                              │
    ┌────────▼──────────┐        ┌──────────▼─────────┐        ┌───────────▼───────┐
    │ SkillRegistry     │        │ InstallationEngine │        │ AgentAdapter      │
    │ (port)            │        │ (port)             │        │ (port)            │
    ├───────────────────┤        ├────────────────────┤        ├───────────────────┤
    │ LocalRegistry     │        │ AtomicInstaller    │        │ ClaudeCodeAdapter │
    │ GitRegistry       │        │  · SafeExtractor   │        │ CodexAdapter      │
    │ HttpRegistry      │        │  · IntegrityCheck  │        │ …future adapters  │
    │ RegistryFederation│        │  · staging+rename  │        │                   │
    └────────┬──────────┘        └──────────┬─────────┘        └───────────┬───────┘
             └──────────────────────────────┼──────────────────────────────┘
                                            │ all reach the OS only through
                            ┌───────────────▼────────────────┐
                            │      @jvm-expert/node        │
                            │ NodeFileSystem · NodeHttpClient│
                            │ NodeCommandRunner · NodeHasher │
                            │ NodeArchive · NodeEnvironment  │
                            └────────────────────────────────┘
```

The "thin waist" is the set of ports in `core/src/ports`. Nothing above the waist
knows about `fs`, `https`, `git`, `tar`, `os.homedir()`, Claude, or Codex.

### The Dependency Rule

```
cli ──────► core ◄────── registry
 │           ▲              ▲
 │           │              │
 │        installer      adapter-claude
 │                       adapter-codex
 └──────► node ─────────────┘  (implements core ports; imported only by cli)
```

- `core` depends on **nothing** — not even `node:path`. It carries a small POSIX-style
  path utility for manifest-relative paths so the domain stays runtime-free.
- `registry`, `installer`, `adapter-*` depend on `core` **only**, and touch the OS
  exclusively through ports handed to their constructors.
- `node` depends on `core` (to implement its port interfaces) and on Node built-ins.
- `cli` depends on everything and is the **only** place where concrete classes are
  constructed. It is wiring plus per-command presentation.

This is enforced mechanically by `scripts/check-boundaries.mjs`, run in CI.

---

## 3. Packages

| Package                   | Published as                 | Responsibility                                                | May import          |
| ------------------------- | ---------------------------- | ------------------------------------------------------------- | ------------------- |
| `packages/core`           | `@jvm-expert/core`           | Domain model, application services, ports                     | —                   |
| `packages/registry`       | `@jvm-expert/registry`       | Local/Git/HTTP registries + federation                        | core                |
| `packages/installer`      | `@jvm-expert/installer`      | Atomic install engine, validation, integrity, safe extraction | core                |
| `packages/adapter-claude` | `@jvm-expert/adapter-claude` | Claude Code layout + detection                                | core                |
| `packages/adapter-codex`  | `@jvm-expert/adapter-codex`  | Codex layout + detection                                      | core                |
| `packages/node`           | `@jvm-expert/node`           | Node implementations of the infrastructure ports              | core, node builtins |
| `packages/cli`            | `@jvm-expert/agent-skills`   | Commander CLI, rendering, composition root                    | all                 |

**Why seven packages and not one?** Because the extensibility requirement is real: a
third party publishing `@acme/agent-skills-adapter-cursor` must be able to depend on a
small, stable `@jvm-expert/core` without pulling in `commander`, `tar`, and every
registry driver. The package boundary is what makes "add an agent without touching
core" a checkable claim rather than a promise.

**Why not more?** Each additional package is a version to bump, a changelog to write,
and a release to coordinate. Seven is the smallest set that keeps the architectural
claims honest.

---

## 4. Ports

Every port is small on purpose. Full definitions live in `packages/core/src/ports/`;
this is the contract summary.

### 4.1 `AgentAdapter` — the extension point

```ts
interface AgentAdapter {
  readonly id: AgentId; // "claude-code", "codex"
  readonly displayName: string; // "Claude Code"
  readonly aliases: readonly string[]; // ["claude"], ["openai-codex"]

  detect(env: Environment): Promise<AgentDetection>;
  locationFor(kind, scope, ctx): AgentLocation | undefined; // root + entry shape, per kind
  layoutFor(pkg: SkillPackage): AgentLayout;
  validate(pkg: SkillPackage): readonly ValidationIssue[];
}
```

Deliberate decisions:

- **`install()` / `uninstall()` are NOT on the adapter.** The brief proposed them, but
  putting file mutation on every adapter means every future agent re-implements
  atomicity, rollback, ownership tracking and path-traversal defence — exactly the
  places where mistakes are catastrophic. Instead the adapter _describes_ the target
  (`locationFor`) and _transforms_ the payload (`layoutFor`), and the single hardened
  `AtomicInstaller` performs every write. Adapters become declarative and nearly
  impossible to get dangerously wrong.
- **`layoutFor` returns a plan, not side effects**: a list of file writes plus frontmatter
  projections. This is what lets Codex get its `agents/openai.yaml` while Claude does not,
  without either agent leaking into core.
- **`locationFor` answers per package kind**, and may answer `undefined`. A skill is a
  directory; a Claude Code command is a single `<name>.md` file. Both entry shapes commit
  through the same rename in `AtomicInstaller` — the shape is data on the target, not a
  second install path per agent.
- **`detect` receives an `Environment` port**, so detection is unit-testable with a
  fake home directory and a fake `PATH`.

### 4.2 `SkillRegistry`

```ts
interface SkillRegistry {
  readonly name: string; // "official", "company"
  readonly kind: RegistryKind; // "local" | "git" | "http"
  readonly trusted: boolean;

  refresh(opts?: RefreshOptions): Promise<void>;
  search(query: SearchQuery): Promise<readonly SkillSummary[]>;
  versions(name: string): Promise<readonly SemanticVersion[]>;
  manifest(name: string, version: SemanticVersion): Promise<SkillManifest>;
  fetch(name: string, version: SemanticVersion): Promise<FetchedPackage>;
}
```

`RegistryFederation` implements the same interface over an ordered list of registries,
which is how multi-registry precedence stays invisible to the application services (§6).

### 4.3 Infrastructure ports

`FileSystem`, `HttpClient`, `CommandRunner`, `Hasher`, `ArchiveReader`, `Environment`,
`Clock`, `Logger`. All tiny, all faked in tests. `FileSystem` is the only one allowed to
mutate the disk, which is why the security model can make categorical statements about
writes (§7).

---

## 5. Installation lifecycle

A single pipeline, shared by `install` and `update`, executed per (skill × agent × scope):

```
 resolve ──► fetch ──► verify ──► stage ──► validate ──► project ──► commit ──► record
    │          │         │         │          │            │           │          │
 registry   registry   sha-256   temp dir   package     adapter     atomic    receipt
 federation  driver    integrity  beside     rules      layoutFor   rename   + lockfile
 + semver              + limits   target                                       update
 resolver
                                       └──── any failure ────► discard staging,
                                                               existing install untouched
```

Key properties:

- **Staging lives on the same filesystem as the target**
  (`<target>/../.agent-skills-staging-<rand>`), so commit is a `rename()` — atomic on
  POSIX and on NTFS.
- **Commit is stage → swap-aside → rename-in → delete-aside**, never delete-then-write.
  A crash at any point leaves either the old version or the new version, never neither.
- **Every install writes a receipt** (`.agent-skills/receipts/<agent>/<skill>.json`)
  listing exactly the relative paths the tool created, with their hashes. Uninstall
  removes only what a receipt claims, and refuses to delete files whose hash changed
  unless `--force`.
- **Project scope additionally maintains `skills.lock`** at the project root.

`--dry-run` executes the pipeline up to `project` and prints the plan, writing nothing
outside the staging directory, which is then discarded.

---

## 6. Multi-registry precedence

Registries form an **ordered list**; earlier wins. This is npm's `.npmrc` model, not
Maven's "first repo that answers", and the difference matters:

1. **Resolution is name-scoped, not version-scoped.** The first registry that contains
   _any_ version of a name owns that name. A later registry cannot inject a higher
   version of a name an earlier registry provides. This prevents the
   dependency-confusion class of attack that has repeatedly hit npm and PyPI.
2. **Explicit qualification always wins**: `agent-skills install company:java-perf`
   bypasses precedence entirely.
3. **Conflicts are reported, not silently merged.** `search` aggregates across all
   registries and labels each result with its registry; a shadowed duplicate is shown
   dimmed with a `shadowed by <registry>` note.
4. **Lockfiles pin the registry name and the resolved URL**, so a reproducible install
   cannot be redirected by reordering the user's registry list.

---

## 7. Security model

Threat model: _a skill package is attacker-controlled data, and a registry may be
hostile or compromised._ Defences are layered and each is unit-tested with a hostile
fixture.

| Threat                                        | Defence                                                                                                                | Where                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Path traversal (`../../.ssh/authorized_keys`) | Every entry path normalised and re-anchored; reject entries escaping root, absolute paths, drive letters, UNC prefixes | `installer/safe-path.ts`        |
| Windows reserved / hostile filenames          | Reject `CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`, trailing dot/space, NTFS ADS (`file:stream`), control chars     | `installer/safe-path.ts`        |
| Symlink escape / symlink planting             | Symlinks and hardlinks in packages are **rejected outright** in v1                                                     | `installer/safe-extractor.ts`   |
| Zip-slip / archive bombs                      | Per-entry size cap, total uncompressed cap, entry-count cap, compression-ratio cap                                     | `installer/safe-extractor.ts`   |
| Tampered payload                              | sha-256 over a canonical digest tree, compared against manifest/lockfile integrity                                     | `installer/integrity.ts`        |
| Hostile registry index                        | Manifests schema-validated _before_ any filesystem work; unknown fields rejected in strict mode                        | `core/domain/manifest.ts`       |
| Downgrade / substitution                      | Lockfile pins name+version+registry+integrity; mismatch aborts with a diff                                             | `core/domain/lockfile.ts`       |
| Plaintext transport                           | HTTP registries must be `https:` unless loopback and `--allow-insecure`                                                | `registry/http-registry.ts`     |
| Executable content                            | `scripts/` is copied without the executable bit and is **never** run by the installer                                  | `installer/atomic-installer.ts` |
| Partial install                               | Staging + atomic rename + rollback                                                                                     | §5                              |

Explicit non-goal for v1: **package signing**. Integrity proves the bytes match what the
registry served; it does not prove who authored them. Sigstore-based signing is on the
roadmap and the manifest schema already reserves a `signatures` field, so adding it is
not a breaking change.

---

## 8. Package format versioning

Every manifest carries `schemaVersion` (currently `1`). The parser:

- **accepts** `schemaVersion: 1`,
- **rejects with a clear upgrade message** anything greater than it understands,
- **treats a missing field as `1`** for the transition period.

This lets the format evolve without a flag day: v2 fields can be added as optional under
`schemaVersion: 1`, and only genuinely breaking changes bump the number.

---

## 9. Testing strategy

- **Domain and application services** are tested with fakes for every port — no disk, no
  network, no clock. They run in milliseconds and are the bulk of the suite.
- **`InMemoryFileSystem`** implements the `FileSystem` port exactly, so path bugs surface
  identically on every OS.
- **Real-filesystem tests** use `fs.mkdtemp()` under the OS temp dir and always clean up,
  covering atomic-rename and permission paths an in-memory fake cannot.
- **Security tests are adversarial fixtures**, not happy paths: entries with `../`, with
  absolute paths, with symlinks, with a 1000:1 compression ratio, named `CON.md`.
- **CLI tests** run the built binary against a temp `HOME` / `CODEX_HOME`, asserting exit
  codes and the exact tree produced.
- CI matrix: Linux · macOS · Windows × Node 22, 24.

---

## 10. What is deliberately not built in v1

| Not built                                        | Why                                                                            | Reserved for                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Package signing                                  | Needs key distribution and a trust root; integrity covers the immediate threat | `signatures` field in manifest                               |
| A hosted registry service                        | GitHub is a sufficient v1 registry; a service is an operational commitment     | `HttpRegistry` already speaks the protocol                   |
| A SAT-style version solver                       | Real skill graphs are shallow; backtracking is unwarranted                     | `Resolver` is an isolated, replaceable class                 |
| Cursor / Copilot / Gemini / Aider adapters       | Each needs its own convention research                                         | An adapter package, no core change                           |
| A dynamic plugin loader for out-of-tree adapters | Needs a security story of its own                                              | `AgentCatalog.register()` already accepts any `AgentAdapter` |

---

## 11. Consequences

**Good:** adding an agent is one package implementing four methods, with zero core
changes and zero new security surface. Adding a registry backend is one class. The
security-critical code is small, centralised, and adversarially tested.

**Costly:** seven packages mean seven releases; port indirection turns a trivial
`fs.readFile` into a two-file change; and `core` re-implements a POSIX path helper
rather than importing `node:path`, a small duplication accepted to keep the domain
runtime-free.

**Reversible:** the package split is the only hard-to-undo decision. Merging packages
later is mechanical; splitting a monolith later is not — which is why the split happens
now.
