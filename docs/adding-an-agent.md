# Adding an agent

Supporting a new coding agent means writing one class. No change to `@jvm-expert/core`, to
the installer, or to the CLI's business logic.

This is the architecture's central claim, and `npm run check:boundaries` exists to keep it
true.

---

## The contract

```ts
import type { AgentAdapter } from '@jvm-expert/core';

export interface AgentAdapter {
  readonly id: AgentId; // "cursor" — stable, recorded in receipts and lockfiles
  readonly displayName: string; // "Cursor"
  readonly aliases: readonly string[]; // accepted on --agent
  readonly overrideKeys: readonly string[]; // allowlist for agentOverrides.<id>

  detect(ctx: DetectionContext): Promise<AgentDetection>;
  locationFor(
    kind: PackageKind, // "skill" | "command" | "workflow"
    scope: InstallScope,
    ctx: LocationContext,
  ): AgentLocation | undefined; // undefined = this agent has no such concept
  layoutFor(pkg: SkillPackage): AgentLayout;
  validate(pkg: SkillPackage): readonly ValidationIssue[];
}
```

Four methods. Note what is **not** there: `install` and `uninstall`.

Adapters describe and project; the single hardened `AtomicInstaller` performs every write.
That is deliberate — putting file mutation on every adapter would mean each new agent
re-implements atomicity, rollback, ownership tracking and path-traversal defence, which are
exactly the places where a mistake is catastrophic. As a result an adapter is declarative and
nearly impossible to get dangerously wrong.

---

## Step 1: research the agent's actual conventions

Do not guess, and do not trust documentation over the binary. For this project, Codex's global
skill directory was widely described as `~/.agents/skills`; the Codex binary resolves it to
`$CODEX_HOME/skills`, defaulting to `~/.codex/skills`. Getting that wrong would have installed
every skill into a directory the agent never reads.

Answer these before writing code:

| Question                                                                         | Why                                  |
| -------------------------------------------------------------------------------- | ------------------------------------ |
| Where do global skills live? Is there an environment variable?                   | `locationFor('skill', 'global', …)`  |
| Where do project skills live?                                                    | `locationFor('skill', 'project', …)` |
| Does the agent have user-invoked commands? Where, and as files or directories?   | `locationFor('command', …)`          |
| What is the entrypoint filename?                                                 | Almost always `SKILL.md`             |
| Which frontmatter keys are required? Which are read? Are unknown keys tolerated? | `layoutFor`                          |
| Is there a separate metadata file?                                               | `layoutFor`, `overrideKeys`          |
| How can the agent's presence be detected?                                        | `detect`                             |

## Step 2: create the package

```
packages/adapter-cursor/
├── package.json      depends only on @jvm-expert/core
├── tsconfig.json     references ../core
├── src/index.ts
└── test/adapter.test.ts
```

```json
{
  "name": "@jvm-expert/adapter-cursor",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": { "@jvm-expert/core": "1.0.0" }
}
```

Register it in the root `package.json` workspaces, in `tsconfig.json` references, and in
`scripts/check-boundaries.mjs` (`ALLOWED_PACKAGE_DEPS`, `ALLOWED_BUILTINS`,
`ALLOWED_EXTERNAL`) — the boundary checker only protects packages it knows about.

## Step 3: `detect`

Detection is evidence-based rather than boolean, so `doctor` can explain its conclusion.

```ts
async detect(ctx: DetectionContext): Promise<AgentDetection> {
  const evidence: DetectionEvidence[] = [];

  const configDir = ctx.env.env()['CURSOR_HOME'] ?? join(ctx.env.homeDir(), '.cursor');
  if (await ctx.fs.exists(configDir)) {
    evidence.push({ strength: 'strong', kind: 'config-dir', detail: configDir });
  }

  const executable = await ctx.commands.which('cursor');
  if (executable !== undefined) {
    evidence.push({ strength: 'strong', kind: 'executable', detail: executable });
  }

  // A committed project directory only proves a colleague uses the agent.
  const projectDir = join(ctx.env.cwd(), '.cursor');
  if (await ctx.fs.exists(projectDir)) {
    evidence.push({ strength: 'weak', kind: 'project-dir', detail: projectDir });
  }

  return detectionFrom(this.id, evidence);
}
```

**Use the ports, never `node:fs` directly.** That is what lets a test fabricate "Cursor is
installed" with a fake home directory and a fake `PATH`, and it is enforced by the boundary
checker.

**Strong vs weak matters.** Only strong evidence auto-selects an agent. Weak evidence is
reported but requires an explicit `--agent`, so a stray directory never silently redirects an
install.

## Step 4: `locationFor`

The only place a path convention is written down. It answers per package **kind**, and returns
the root together with the shape one installed package takes there.

```ts
locationFor(kind: PackageKind, scope: InstallScope, ctx: LocationContext): AgentLocation | undefined {
  // Cursor has no user-invoked commands. Say so, rather than inventing a directory:
  // the install is then reported as skipped for this agent.
  if (kind !== 'skill') return undefined;

  const shape = { shape: 'directory', extension: '' } as const;
  if (ctx.overrideRoot !== undefined) return { root: ctx.overrideRoot, ...shape }; // user config wins

  if (scope === 'project') {
    if (ctx.projectRoot === undefined) throw new Error('Cursor project scope requires a project root');
    return { root: join(ctx.projectRoot, '.cursor', 'skills'), ...shape };
  }

  const home = ctx.env['CURSOR_HOME'] ?? join(ctx.homeDir, '.cursor');
  return { root: join(home, 'skills'), ...shape };
}
```

Use `shape: 'file'` with an `extension` when the agent stores one package as one file, the way
Claude Code stores commands as `<name>.md`. The installer names the file after the package and
commits it with the same rename it uses for a directory; a `file`-shaped layout must project
exactly one entry.

Always honour `ctx.overrideRoot` first. It is how a user copes with the agent changing its
convention before a new adapter ships — a config edit instead of waiting for a release. It
carries the _skills_ root only (`agents.<id>.globalRoot` / `projectRoot`); other kinds keep
the agent's own convention.

`node:path` is allowed here: path algebra is pure computation, and adapters produce OS-native
paths by nature. All _I/O_ still goes through ports.

## Step 5: `layoutFor`

A **pure** function: package in, plan out. No filesystem, no side effects — which is what makes
every projection snapshot-testable.

```ts
layoutFor(pkg: SkillPackage): AgentLayout {
  const frontmatter: Record<string, unknown> = {
    name: pkg.manifest.name,
    description: pkg.manifest.description,
  };

  const entries: LayoutEntry[] = [
    {
      path: 'SKILL.md',
      content: encodeText(stringifySkillDocument({ frontmatter, body: pkg.document.body })),
    },
  ];

  for (const file of pkg.files) {
    if (file.path === 'SKILL.md') continue;
    entries.push({ path: file.path, copyFrom: file.path }); // verbatim
  }

  return { directoryName: pkg.manifest.name, entries, frontmatter };
}
```

An entry either carries inline `content` (something the adapter synthesised) or `copyFrom` (a
path in the neutral package, copied unchanged).

Project **only the keys the agent acts on**. Distribution metadata belongs in `skill.yaml`,
which travels with the package but means nothing to the agent.

If the agent needs a vendor metadata file, synthesise it from neutral manifest fields — and
regenerate it rather than copying whatever the package happened to contain, so a stale file
cannot survive an update. Codex's `agents/openai.yaml` is the worked example.

## Step 6: `validate` and `overrideKeys`

`overrideKeys` is the allowlist for `agentOverrides.<your-id>`. Declaring an empty list — as
the Claude adapter does — makes any override a validation error rather than a silently ignored
key.

Use `validate` for rules only your agent knows:

```ts
validate(pkg: SkillPackage): readonly ValidationIssue[] {
  const issues = new IssueCollector();
  if (pkg.manifest.description.length > 512) {
    issues.warn('cursor.description.long', 'description',
      'Cursor truncates descriptions beyond 512 characters',
      'Move the detail into the SKILL.md body');
  }
  return issues.all();
}
```

Prefer warnings. An error blocks installation entirely, which is right for "this cannot work"
and wrong for "this is not ideal".

## Step 7: register it

In `packages/cli/src/container.ts`:

```ts
const agents = new AgentCatalog()
  .register(new ClaudeCodeAdapter())
  .register(new CodexAdapter())
  .register(new CursorAdapter());
```

That is the whole integration. `install`, `update`, `uninstall`, `list`, `doctor`, lockfiles,
integrity checking and atomicity all work for the new agent immediately.

## Step 8: test it

Use `@jvm-expert/core/testing`, the same doubles the built-in adapters use — they are
exported from the package precisely so an out-of-tree adapter can rely on them.

```ts
import {
  FakeCommandRunner,
  FakeEnvironment,
  InMemoryFileSystem,
  buildPackage,
} from '@jvm-expert/core/testing';

const detection = await adapter.detect({
  env: new FakeEnvironment({ homeDir: '/home/dev' }),
  fs: new InMemoryFileSystem().seed({ '/home/dev/.cursor/config.json': '{}' }),
  commands: new FakeCommandRunner({ available: [] }),
});
assert.equal(detection.installed, true);
```

Cover: detection (each evidence kind, and absence), `locationFor` for every kind and scope
plus the override, the layout projection, and purity — `layoutFor` called twice must be
deep-equal.

---

## Checklist

- [ ] Conventions verified against the real agent, not documentation alone
- [ ] Package depends on `@jvm-expert/core` only
- [ ] Registered in workspaces, `tsconfig.json`, and `scripts/check-boundaries.mjs`
- [ ] `detect` uses ports, and distinguishes strong from weak evidence
- [ ] `locationFor` honours `overrideRoot` first, and returns `undefined` for kinds the agent
      does not have
- [ ] `layoutFor` is pure and projects only keys the agent reads
- [ ] `overrideKeys` declared (empty list if the agent takes no overrides)
- [ ] Registered in the CLI container
- [ ] Tests cover detection, locations, projection and purity
- [ ] `npm run verify` passes
