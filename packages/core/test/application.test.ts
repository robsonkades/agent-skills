import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AgentSkillsError, ErrorCode } from '../src/domain/errors.ts';
import type { ApplicationContext } from '../src/application/context.ts';
import { InstallSkills } from '../src/application/install-skills.ts';
import { ListInstalled } from '../src/application/list-installed.ts';
import { RemoveSkills } from '../src/application/remove-skills.ts';
import { UpdateSkills } from '../src/application/update-skills.ts';
import { DiagnoseSystem } from '../src/application/diagnose.ts';
import { CreateSkill } from '../src/application/create-skill.ts';
import { selectAgents } from '../src/application/agent-selection.ts';
import { validatePackage, pathSafetyIssues } from '../src/application/validate-package.ts';
import { loadPackageFromDirectory } from '../src/application/package-loader.ts';
import { findProjectRoot, readLockfile } from '../src/application/workspace.ts';
import { AgentCatalog, type AgentAdapter } from '../src/ports/agent-adapter.ts';
import type { InstallationEngine, InstalledSkill } from '../src/ports/installation.ts';
import type { FederatedRegistry } from '../src/ports/skill-registry.ts';
import type { SkillPackage } from '../src/domain/skill-package.ts';
import type { SemanticVersion } from '../src/domain/version.ts';
import { RegistryFederationDouble } from './helpers/federation-double.ts';
import {
  FakeCommandRunner,
  FakeEnvironment,
  FakeRegistry,
  FixedClock,
  InMemoryFileSystem,
  RecordingLogger,
  buildPackage,
} from '../src/testing/index.ts';

// --- Test doubles specific to the application layer ---------------------------------------

function adapterOf(
  id: string,
  root: string,
  options: { detected?: boolean; commands?: boolean } = {},
): AgentAdapter {
  return {
    id,
    displayName: id,
    aliases: [id.split('-')[0]!],
    overrideKeys: [],
    async detect() {
      return options.detected === false
        ? { agentId: id, installed: false, strength: 'none', evidence: [] }
        : {
            agentId: id,
            installed: true,
            strength: 'strong',
            evidence: [{ strength: 'strong', kind: 'config-dir', detail: root }],
          };
    },
    locationFor(kind, scope, ctx) {
      if (kind === 'command') {
        return options.commands === false
          ? undefined
          : { root: `${root}/commands`, shape: 'file', extension: '.md' };
      }
      if (kind === 'workflow') {
        return options.commands === false
          ? undefined
          : { root: `${root}/workflows`, shape: 'file', extension: '.js' };
      }
      return {
        root: scope === 'global' ? `${root}/global` : `${ctx.projectRoot}/${id}/skills`,
        shape: 'directory',
        extension: '',
      };
    },
    layoutFor(pkg) {
      return {
        entries: pkg.files.map((file) => ({ path: file.path, copyFrom: file.path })),
        frontmatter: {},
      };
    },
    validate() {
      return [];
    },
  };
}

/** Records installs without touching a filesystem. */
class RecordingInstaller implements InstallationEngine {
  readonly installed = new Map<string, InstalledSkill>();
  readonly calls: string[] = [];

  async install(request: Parameters<InstallationEngine['install']>[0]) {
    const key = keyOf(request.target.agentId, request.target.root, request.pkg.manifest.name);
    this.calls.push(
      `install ${request.target.agentId}:${request.pkg.manifest.name}@${request.pkg.manifest.version}`,
    );

    const previous = this.installed.get(key);
    if (!request.dryRun) {
      this.installed.set(key, {
        name: request.pkg.manifest.name,
        version: request.pkg.manifest.version,
        agentId: request.target.agentId,
        scope: request.target.scope,
        directory: `${request.target.root}/${request.pkg.manifest.name}`,
        registry: request.registry,
        installedAt: '2026-01-01T00:00:00.000Z',
        unmanaged: false,
        modified: false,
        dependencyOf: request.dependencyOf,
      });
    }

    return {
      outcome: previous === undefined ? ('installed' as const) : ('upgraded' as const),
      name: request.pkg.manifest.name,
      version: request.pkg.manifest.version,
      ...(previous === undefined ? {} : { previousVersion: previous.version }),
      agentId: request.target.agentId,
      scope: request.target.scope,
      directory: `${request.target.root}/${request.pkg.manifest.name}`,
      files: request.pkg.files.map((file) => file.path),
      receipt: {
        receiptVersion: 1,
        name: request.pkg.manifest.name,
        version: request.pkg.manifest.version,
        agentId: request.target.agentId,
        scope: request.target.scope,
        registry: request.registry,
        resolved: request.resolved,
        integrity: request.integrity,
        installedAt: '2026-01-01T00:00:00.000Z',
        installedWith: 'test',
        directory: `${request.target.root}/${request.pkg.manifest.name}`,
        files: [],
        dependencyOf: request.dependencyOf,
      },
    };
  }

  async uninstall(request: Parameters<InstallationEngine['uninstall']>[0]) {
    const key = keyOf(request.target.agentId, request.target.root, request.name);
    const existing = this.installed.get(key);
    if (!request.dryRun) this.installed.delete(key);
    this.calls.push(`uninstall ${request.target.agentId}:${request.name}`);
    return {
      name: request.name,
      ...(existing === undefined ? {} : { version: existing.version }),
      agentId: request.target.agentId,
      scope: request.target.scope,
      directory: `${request.target.root}/${request.name}`,
      removed: ['SKILL.md', 'skill.yaml'],
      preserved: [],
    };
  }

  async list(target: Parameters<InstallationEngine['list']>[0]) {
    return [...this.installed.values()].filter(
      (skill) =>
        skill.agentId === target.agentId &&
        skill.scope === target.scope &&
        rootOf(skill.directory) === target.root,
    );
  }

  async read(target: Parameters<InstallationEngine['read']>[0], name: string) {
    return this.installed.get(keyOf(target.agentId, target.root, name));
  }

  seed(skill: InstalledSkill): void {
    this.installed.set(keyOf(skill.agentId, rootOf(skill.directory), skill.name), skill);
  }
}

/** Installs are identified by where they landed: two kinds of one agent are two roots. */
function keyOf(agentId: string, root: string, name: string): string {
  return `${agentId}:${root}:${name}`;
}

function rootOf(directory: string): string {
  return directory.slice(0, directory.lastIndexOf('/'));
}

interface HarnessOptions {
  readonly packages?: readonly SkillPackage[];
  readonly adapters?: readonly AgentAdapter[];
  readonly cwd?: string;
  readonly files?: Record<string, string>;
  /** Set to false to build a context with no registries at all. */
  readonly withRegistry?: boolean;
}

function harness(options: HarnessOptions = {}) {
  const fs = new InMemoryFileSystem().seed({
    '/work/project/.git/HEAD': 'ref: refs/heads/main',
    ...(options.files ?? {}),
  });
  const installer = new RecordingInstaller();
  const registry = new FakeRegistry({
    name: 'official',
    packages: options.packages ?? [buildPackage({ name: 'a-skill', version: '1.0.0' })],
  });

  const agents = new AgentCatalog();
  for (const adapter of options.adapters ?? [adapterOf('claude-code', '/home/dev/.claude')]) {
    agents.register(adapter);
  }

  const ctx: ApplicationContext = {
    agents,
    registry: new RegistryFederationDouble(
      options.withRegistry === false ? [] : [registry],
    ) as unknown as FederatedRegistry,
    installer,
    fs,
    env: new FakeEnvironment({ cwd: options.cwd ?? '/work/project' }),
    commands: new FakeCommandRunner(),
    clock: new FixedClock(),
    logger: new RecordingLogger(),
    config: { schemaVersion: 1, registries: [], agents: {}, cache: { ttlSeconds: 3600 } },
    toolVersion: 'test@1.0.0',
  };

  return { ctx, fs, installer, registry };
}

// --- Tests --------------------------------------------------------------------------------

describe('agent selection', () => {
  it('auto-selects every detected agent', async () => {
    const { ctx } = harness({
      adapters: [adapterOf('claude-code', '/c'), adapterOf('codex', '/x')],
    });
    const selection = await selectAgents(ctx, { scope: 'global' });
    assert.deepEqual(
      selection.targets.map((target) => `${target.agentId}:${target.kind}`),
      [
        'claude-code:skill',
        'claude-code:command',
        'claude-code:workflow',
        'codex:skill',
        'codex:command',
        'codex:workflow',
      ],
    );
  });

  it('offers no target for a kind the agent does not support', async () => {
    const { ctx } = harness({
      adapters: [adapterOf('claude-code', '/c'), adapterOf('codex', '/x', { commands: false })],
    });
    const selection = await selectAgents(ctx, { scope: 'global' });
    assert.deepEqual(
      selection.targets
        .filter((target) => target.kind === 'command')
        .map((target) => target.agentId),
      ['claude-code'],
    );
  });

  it('resolves an alias', async () => {
    const { ctx } = harness({
      adapters: [adapterOf('claude-code', '/c'), adapterOf('codex', '/x')],
    });
    const selection = await selectAgents(ctx, { scope: 'global', agents: ['codex'] });
    assert.deepEqual([...new Set(selection.targets.map((target) => target.agentId))], ['codex']);
  });

  it('selects every known agent for "all", even undetected ones', async () => {
    const { ctx } = harness({
      adapters: [adapterOf('claude-code', '/c'), adapterOf('codex', '/x', { detected: false })],
    });
    const selection = await selectAgents(ctx, { scope: 'global', agents: ['all'] });
    assert.equal(new Set(selection.targets.map((target) => target.agentId)).size, 2);
  });

  it('lists the known agents when an unknown one is requested', async () => {
    const { ctx } = harness();
    await assert.rejects(
      () => selectAgents(ctx, { scope: 'global', agents: ['cursor'] }),
      (error: unknown) => {
        assert.ok(error instanceof AgentSkillsError);
        assert.equal(error.code, ErrorCode.UNKNOWN_AGENT);
        assert.match(error.details.join('\n'), /claude-code/);
        return true;
      },
    );
  });

  it('fails helpfully when nothing is detected', async () => {
    const { ctx } = harness({ adapters: [adapterOf('claude-code', '/c', { detected: false })] });
    await assert.rejects(
      () => selectAgents(ctx, { scope: 'global' }),
      (error: unknown) => {
        assert.ok(error instanceof AgentSkillsError);
        assert.equal(error.code, ErrorCode.NO_AGENT_DETECTED);
        assert.match(error.details.join('\n'), /Supported agents/);
        return true;
      },
    );
  });

  it('finds the project root by walking up from the cwd', async () => {
    const { fs } = harness({ cwd: '/work/project/src/deep' });
    await fs.mkdirp('/work/project/src/deep');
    assert.equal(await findProjectRoot(fs, '/work/project/src/deep'), '/work/project');
  });

  it('refuses project scope outside a project', async () => {
    const { ctx } = harness({ cwd: '/elsewhere' });
    await assert.rejects(
      () => selectAgents(ctx, { scope: 'project', startDir: '/elsewhere' }),
      (error: unknown) => error instanceof AgentSkillsError && error.code === ErrorCode.USAGE,
    );
  });
});

describe('install', () => {
  it('installs into every selected agent', async () => {
    const { ctx, installer } = harness({
      adapters: [adapterOf('claude-code', '/c'), adapterOf('codex', '/x')],
    });
    const report = await new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'global' });

    assert.equal(report.results.length, 2);
    assert.deepEqual(installer.calls.sort(), [
      'install claude-code:a-skill@1.0.0',
      'install codex:a-skill@1.0.0',
    ]);
  });

  it('installs dependencies before dependants', async () => {
    const { ctx, installer } = harness({
      packages: [
        buildPackage({
          name: 'top-skill',
          version: '1.0.0',
          dependencies: { 'base-skill': '^1.0.0' },
        }),
        buildPackage({ name: 'base-skill', version: '1.0.0' }),
      ],
    });
    await new InstallSkills(ctx).execute({ refs: ['top-skill'], scope: 'global' });
    assert.deepEqual(installer.calls, [
      'install claude-code:base-skill@1.0.0',
      'install claude-code:top-skill@1.0.0',
    ]);
  });

  it('skips an agent the skill declares no compatibility with', async () => {
    const { ctx, installer } = harness({
      adapters: [adapterOf('claude-code', '/c'), adapterOf('codex', '/x')],
      packages: [buildPackage({ name: 'a-skill', version: '1.0.0', agents: ['claude-code'] })],
    });

    const report = await new InstallSkills(ctx).execute({
      refs: ['a-skill'],
      scope: 'global',
      agents: ['all'],
    });

    assert.deepEqual(installer.calls, ['install claude-code:a-skill@1.0.0']);
    assert.ok(report.warnings.some((warning) => warning.includes('codex')));
  });

  it('writes a lockfile for project scope', async () => {
    const { ctx, fs } = harness();
    await new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'project' });

    const lock = await readLockfile(fs, '/work/project');
    assert.equal(lock.skills['a-skill']!.version, '1.0.0');
    assert.equal(lock.skills['a-skill']!.registry, 'official');
    assert.deepEqual(lock.skills['a-skill']!.agents, ['claude-code']);
  });

  it('writes no lockfile for global scope', async () => {
    const { ctx, fs } = harness();
    await new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'global' });
    assert.equal(await fs.exists('/work/project/skills.lock'), false);
  });

  it('honours a lockfile pin on a bare name', async () => {
    const { ctx } = harness({
      packages: [
        buildPackage({ name: 'a-skill', version: '1.0.0' }),
        buildPackage({ name: 'a-skill', version: '2.0.0' }),
      ],
      files: {
        '/work/project/skills.lock': [
          'lockfileVersion: 1',
          'skills:',
          '  a-skill:',
          '    version: 1.0.0',
          '    registry: official',
          '    resolved: fake://official/a-skill@1.0.0',
          '    integrity: sha256-a-skill-1.0.0',
          '    agents: [claude-code]',
          '    dependencies: {}',
          '',
        ].join('\n'),
      },
    });

    const report = await new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'project' });
    assert.equal(report.resolved[0]!.version, '1.0.0');
  });

  it('aborts when the payload does not match the locked integrity', async () => {
    const { ctx } = harness({
      files: {
        '/work/project/skills.lock': [
          'lockfileVersion: 1',
          'skills:',
          '  a-skill:',
          '    version: 1.0.0',
          '    registry: official',
          '    resolved: fake://official/a-skill@1.0.0',
          '    integrity: sha256-something-else',
          '    agents: [claude-code]',
          '    dependencies: {}',
          '',
        ].join('\n'),
      },
    });

    await assert.rejects(
      () => new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'project' }),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.LOCKFILE_MISMATCH,
    );
  });

  it('writes nothing on a dry run', async () => {
    const { ctx, fs, installer } = harness();
    const report = await new InstallSkills(ctx).execute({
      refs: ['a-skill'],
      scope: 'project',
      dryRun: true,
    });

    assert.equal(report.dryRun, true);
    assert.equal(report.lockfileUpdated, false);
    assert.equal(installer.installed.size, 0);
    assert.equal(await fs.exists('/work/project/skills.lock'), false);
  });

  it('rejects an empty request', async () => {
    const { ctx } = harness();
    await assert.rejects(
      () => new InstallSkills(ctx).execute({ refs: [], scope: 'global' }),
      (error: unknown) => error instanceof AgentSkillsError && error.code === ErrorCode.USAGE,
    );
  });
});

describe('list', () => {
  it('groups by agent and scope', async () => {
    const { ctx, installer } = harness({
      adapters: [adapterOf('claude-code', '/c'), adapterOf('codex', '/x')],
    });
    installer.seed({
      name: 'a-skill',
      version: '1.0.0' as SemanticVersion,
      agentId: 'claude-code',
      scope: 'global',
      directory: '/c/global/a-skill',
      registry: 'official',
      installedAt: '',
      unmanaged: false,
      modified: false,
      dependencyOf: [],
    });

    const report = await new ListInstalled(ctx).execute({});
    const claudeGlobal = report.entries.find(
      (entry) => entry.target.agentId === 'claude-code' && entry.target.scope === 'global',
    );
    assert.equal(claudeGlobal!.skills.length, 1);
    assert.equal(report.total, 1);
  });

  it('does not fail when an agent is undetected', async () => {
    const { ctx } = harness({ adapters: [adapterOf('claude-code', '/c', { detected: false })] });
    const report = await new ListInstalled(ctx).execute({});
    assert.equal(report.total, 0);
  });
});

describe('update', () => {
  function installedHarness() {
    const built = harness({
      packages: [
        buildPackage({ name: 'a-skill', version: '1.0.0' }),
        buildPackage({ name: 'a-skill', version: '1.5.0' }),
        buildPackage({ name: 'a-skill', version: '2.0.0' }),
      ],
    });
    built.installer.seed({
      name: 'a-skill',
      version: '1.0.0' as SemanticVersion,
      agentId: 'claude-code',
      scope: 'global',
      directory: '/home/dev/.claude/global/a-skill',
      registry: 'official',
      installedAt: '',
      unmanaged: false,
      modified: false,
      dependencyOf: [],
    });
    return built;
  }

  it('stays within the current major by default', async () => {
    const { ctx } = installedHarness();
    const report = await new UpdateSkills(ctx).execute({ names: [], scope: 'global' });
    assert.deepEqual(report.changes, [
      { name: 'a-skill', from: '1.0.0', to: '1.5.0', bump: 'minor' },
    ]);
  });

  it('crosses a major only with --major', async () => {
    const { ctx } = installedHarness();
    const report = await new UpdateSkills(ctx).execute({ names: [], scope: 'global', major: true });
    assert.equal(report.changes[0]!.to, '2.0.0');
    assert.equal(report.changes[0]!.bump, 'major');
  });

  it('refuses to update a skill that is not installed', async () => {
    const { ctx } = installedHarness();
    await assert.rejects(
      () => new UpdateSkills(ctx).execute({ names: ['other-skill'], scope: 'global' }),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.NOT_INSTALLED,
    );
  });

  it('says so clearly when nothing is installed', async () => {
    const { ctx } = harness();
    await assert.rejects(
      () => new UpdateSkills(ctx).execute({ names: [], scope: 'global' }),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.NOT_INSTALLED,
    );
  });
});

describe('remove', () => {
  it('removes from every selected agent and updates the lockfile', async () => {
    const { ctx, installer, fs } = harness();
    await new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'project' });
    assert.equal((await readLockfile(fs, '/work/project')).skills['a-skill']?.version, '1.0.0');

    const report = await new RemoveSkills(ctx).execute({ names: ['a-skill'], scope: 'project' });

    assert.equal(report.results.length, 1);
    assert.equal(report.lockfileUpdated, true);
    assert.equal(installer.installed.size, 0);
    assert.equal((await readLockfile(fs, '/work/project')).skills['a-skill'], undefined);
  });

  it('fails when the skill is not installed, listing where it looked', async () => {
    const { ctx } = harness();
    await assert.rejects(
      () => new RemoveSkills(ctx).execute({ names: ['a-skill'], scope: 'global' }),
      (error: unknown) => {
        assert.ok(error instanceof AgentSkillsError);
        assert.equal(error.code, ErrorCode.NOT_INSTALLED);
        assert.match(error.details.join('\n'), /Looked in/);
        return true;
      },
    );
  });
});

describe('validate', () => {
  it('accepts a well-formed package', () => {
    const report = validatePackage(buildPackage({ name: 'a-skill', version: '1.0.0' }));
    assert.equal(report.ok, true);
  });

  it('catches a name that disagrees with the directory', () => {
    const report = validatePackage(buildPackage({ name: 'a-skill', version: '1.0.0' }), {
      directoryName: 'different-name',
    });
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((issue) => issue.rule === 'package.directory.mismatch'));
  });

  it('catches frontmatter that disagrees with the manifest', () => {
    const pkg = buildPackage({ name: 'a-skill', version: '1.0.0' });
    const report = validatePackage({
      ...pkg,
      document: {
        ...pkg.document,
        frontmatter: { ...pkg.document.frontmatter, name: 'other-skill' },
      },
    });
    assert.ok(report.errors.some((issue) => issue.rule === 'skill.name.mismatch'));
  });

  it('catches a version in SKILL.md that disagrees with the manifest', () => {
    const pkg = buildPackage({ name: 'a-skill', version: '1.0.0' });
    const report = validatePackage({
      ...pkg,
      document: { ...pkg.document, frontmatter: { ...pkg.document.frontmatter, version: '2.0.0' } },
    });
    assert.ok(report.errors.some((issue) => issue.rule === 'skill.version.mismatch'));
  });

  it('requires a description, which both agents route on', () => {
    const pkg = buildPackage({ name: 'a-skill', version: '1.0.0' });
    const report = validatePackage({
      ...pkg,
      document: { ...pkg.document, frontmatter: { name: 'a-skill' } },
    });
    assert.ok(report.errors.some((issue) => issue.rule === 'skill.description.missing'));
  });

  it('warns on a description that disagrees with the manifest, because only the manifest ships', () => {
    const pkg = buildPackage({ name: 'a-skill', version: '1.0.0' });
    const report = validatePackage({
      ...pkg,
      document: {
        ...pkg.document,
        frontmatter: {
          ...pkg.document.frontmatter,
          description: 'A different description that no agent will ever read.',
        },
      },
    });
    assert.ok(report.warnings.some((issue) => issue.rule === 'skill.description.mismatch'));
    assert.ok(!report.errors.some((issue) => issue.rule === 'skill.description.mismatch'));
  });

  it('does not report a description mismatch for whitespace alone', () => {
    const pkg = buildPackage({ name: 'a-skill', version: '1.0.0' });
    const folded = `\n  ${pkg.manifest.description.replace(/\s+/g, '\n  ')}\n`;
    const report = validatePackage({
      ...pkg,
      document: {
        ...pkg.document,
        frontmatter: { ...pkg.document.frontmatter, description: folded },
      },
    });
    assert.ok(!report.warnings.some((issue) => issue.rule === 'skill.description.mismatch'));
  });

  it('rejects an override key the adapter does not accept', () => {
    const pkg = buildPackage({
      name: 'a-skill',
      version: '1.0.0',
      manifestExtras: ['agentOverrides:', '  claude-code:', '    interface:', '      x: y'].join(
        '\n',
      ),
    });
    const report = validatePackage(pkg, { adapters: [adapterOf('claude-code', '/c')] });
    assert.ok(report.errors.some((issue) => issue.rule === 'manifest.agentOverrides.unknownKey'));
  });

  it('flags Windows-hostile filenames on every platform', () => {
    assert.ok(pathSafetyIssues('CON.md').some((issue) => issue.rule === 'path.reservedName'));
    assert.ok(
      pathSafetyIssues('a/b.md ').some((issue) => issue.rule === 'path.trailingDotOrSpace'),
    );
    assert.ok(
      pathSafetyIssues('a:stream').some((issue) => issue.rule === 'path.alternateDataStream'),
    );
    assert.ok(pathSafetyIssues('../escape').some((issue) => issue.rule === 'path.traversal'));
    assert.deepEqual(pathSafetyIssues('references/notes.md'), []);
  });
});

describe('create', () => {
  it('scaffolds a package that validates', async () => {
    const { ctx, fs } = harness();
    const report = await new CreateSkill(ctx).execute({ name: 'new-skill', directory: '/work' });

    assert.deepEqual(report.files, ['SKILL.md', 'skill.yaml', 'references/notes.md']);
    const loaded = await loadPackageFromDirectory(fs, '/work/new-skill');
    const validation = validatePackage(loaded.pkg, { directoryName: 'new-skill' });
    assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  });

  it('refuses to overwrite an existing directory', async () => {
    const { ctx, fs } = harness();
    await fs.mkdirp('/work/new-skill');
    await assert.rejects(
      () => new CreateSkill(ctx).execute({ name: 'new-skill', directory: '/work' }),
      (error: unknown) => error instanceof AgentSkillsError && error.code === ErrorCode.USAGE,
    );
  });

  it('rejects an invalid name before touching the disk', async () => {
    const { ctx, fs } = harness();
    await assert.rejects(
      () => new CreateSkill(ctx).execute({ name: 'Invalid Name', directory: '/work' }),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.INVALID_SKILL_NAME,
    );
    assert.equal(await fs.exists('/work/Invalid Name'), false);
  });
});

describe('doctor', () => {
  it('reports agents, directories and installations', async () => {
    const { ctx } = harness({
      adapters: [adapterOf('claude-code', '/c'), adapterOf('codex', '/x')],
    });
    const report = await new DiagnoseSystem(ctx).execute({ offline: true });

    const titles = report.sections.map((section) => section.title);
    assert.ok(titles.includes('Environment'));
    assert.ok(titles.includes('claude-code'));
    assert.ok(titles.includes('codex'));
    assert.ok(titles.includes('Installations'));
  });

  it('fails when no registries are configured', async () => {
    const { ctx } = harness({ withRegistry: false });
    const report = await new DiagnoseSystem(ctx).execute({ offline: true });
    const registries = report.sections.find((section) => section.title === 'Registries')!;
    assert.equal(registries.checks[0]!.status, 'fail');
    assert.equal(report.ok, false);
  });
});

describe('project discovery does not escape into the home directory', () => {
  it('never treats the home directory itself as a project', async () => {
    // Regression: `~/.claude` is an agent's *global* configuration. Treating it as a project
    // marker made every command run from a scratch directory under $HOME resolve "project
    // scope" to the home directory, and install into the user's global configuration.
    const fs = new InMemoryFileSystem().seed({
      '/home/dev/.claude/settings.json': '{}',
      '/home/dev/scratch/notes.txt': 'x',
    });

    assert.equal(await findProjectRoot(fs, '/home/dev/scratch', '/home/dev'), undefined);
    assert.equal(await findProjectRoot(fs, '/home/dev', '/home/dev'), undefined);
  });

  it('still finds a real project nested under the home directory', async () => {
    const fs = new InMemoryFileSystem().seed({
      '/home/dev/.claude/settings.json': '{}',
      '/home/dev/code/app/.git/HEAD': 'ref: refs/heads/main',
      '/home/dev/code/app/src/main.ts': 'x',
    });

    assert.equal(
      await findProjectRoot(fs, '/home/dev/code/app/src', '/home/dev'),
      '/home/dev/code/app',
    );
  });

  it('refuses project scope in a scratch directory under the home directory', async () => {
    const { ctx } = harness({ cwd: '/home/dev/scratch' });
    await assert.rejects(
      () => selectAgents(ctx, { scope: 'project', startDir: '/home/dev/scratch' }),
      (error: unknown) => error instanceof AgentSkillsError && error.code === ErrorCode.USAGE,
    );
  });
});

describe('installing a command', () => {
  it('writes into the command root, not the skill root', async () => {
    const { ctx } = harness({
      adapters: [adapterOf('claude-code', '/c')],
      packages: [buildPackage({ name: 'ship-it', version: '1.0.0', kind: 'command' })],
    });

    const report = await new InstallSkills(ctx).execute({ refs: ['ship-it'], scope: 'global' });

    assert.deepEqual(
      report.results.map((result) => result.directory),
      ['/c/commands/ship-it'],
    );
    assert.deepEqual(
      report.targets.map((target) => target.kind),
      ['command'],
    );
  });

  it('skips an agent that has no command directory, and says so', async () => {
    const { ctx } = harness({
      adapters: [adapterOf('claude-code', '/c'), adapterOf('codex', '/x', { commands: false })],
      packages: [buildPackage({ name: 'ship-it', version: '1.0.0', kind: 'command' })],
    });

    const report = await new InstallSkills(ctx).execute({ refs: ['ship-it'], scope: 'global' });

    assert.deepEqual(
      report.results.map((result) => result.agentId),
      ['claude-code'],
    );
    assert.ok(
      report.warnings.some(
        (warning) => warning.includes('codex') && warning.includes('no command directory'),
      ),
      report.warnings.join(' | '),
    );
  });

  it('leaves skills in the skill root', async () => {
    const { ctx } = harness({ adapters: [adapterOf('claude-code', '/c')] });

    const report = await new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'global' });

    assert.deepEqual(
      report.results.map((result) => result.directory),
      ['/c/global/a-skill'],
    );
  });
});

describe('installing a workflow', () => {
  it('writes into the workflow root', async () => {
    const { ctx } = harness({
      adapters: [adapterOf('claude-code', '/c')],
      packages: [buildPackage({ name: 'ship-review', version: '1.0.0', kind: 'workflow' })],
    });

    const report = await new InstallSkills(ctx).execute({ refs: ['ship-review'], scope: 'global' });

    assert.deepEqual(
      report.results.map((result) => result.directory),
      ['/c/workflows/ship-review'],
    );
    assert.deepEqual(
      report.targets.map((target) => target.kind),
      ['workflow'],
    );
  });

  it('validates the script the same way it validates a SKILL.md', async () => {
    const mismatched = buildPackage({
      name: 'ship-review',
      version: '1.0.0',
      kind: 'workflow',
      meta: { name: 'something-else' },
    });
    const report = validatePackage(mismatched);

    assert.equal(report.ok, false);
    assert.ok(report.errors.some((issue) => issue.rule === 'skill.name.mismatch'));
    assert.ok(
      report.errors.some((issue) => issue.message.includes('Meta name')),
      report.errors.map((issue) => issue.message).join(' | '),
    );
  });
});
