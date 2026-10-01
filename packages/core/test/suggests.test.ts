import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ApplicationContext } from '../src/application/context.ts';
import { InstallSkills, type InstallReport } from '../src/application/install-skills.ts';
import { UpdateSkills } from '../src/application/update-skills.ts';
import { readLockfile } from '../src/application/workspace.ts';
import { AgentSkillsError, ErrorCode, exitCodeFor } from '../src/domain/errors.ts';
import type { SkillPackage } from '../src/domain/skill-package.ts';
import { AgentCatalog, type AgentAdapter } from '../src/ports/agent-adapter.ts';
import type {
  InstallationEngine,
  InstalledSkill,
  InstallRequest,
  InstallResult,
} from '../src/ports/installation.ts';
import {
  FakeCommandRunner,
  FakeEnvironment,
  FakeRegistry,
  FixedClock,
  InMemoryFileSystem,
  RecordingLogger,
  buildPackage,
  type BuildPackageOptions,
} from '../src/testing/index.ts';
import { RegistryFederationDouble } from './helpers/federation-double.ts';

function pkg(
  name: string,
  options: Omit<BuildPackageOptions, 'name' | 'version'> & {
    readonly version?: string;
    readonly suggests?: readonly string[];
  } = {},
): SkillPackage {
  const { suggests, version = '1.0.0', ...rest } = options;
  return buildPackage({
    name,
    version,
    ...rest,
    ...(suggests === undefined ? {} : { manifestExtras: `suggests: ${JSON.stringify(suggests)}` }),
  });
}

function adapter(id: string): AgentAdapter {
  return {
    id,
    displayName: id,
    aliases: [],
    overrideKeys: [],
    async detect() {
      return { agentId: id, installed: true, strength: 'strong', evidence: [] };
    },
    locationFor(kind, scope, context) {
      if (kind !== 'skill') return undefined;
      return {
        root: scope === 'global' ? `/agents/${id}/skills` : `${context.projectRoot}/${id}/skills`,
        shape: 'directory',
        extension: '',
      };
    },
    layoutFor(value) {
      return {
        entries: value.files.map((file) => ({ path: file.path, copyFrom: file.path })),
        frontmatter: {},
      };
    },
    validate() {
      return [];
    },
  };
}

/** In-memory install state: these application tests never touch agent configuration. */
class RecordingInstaller implements InstallationEngine {
  readonly calls: InstallRequest[] = [];
  readonly installed = new Map<string, InstalledSkill>();

  async install(request: InstallRequest): Promise<InstallResult> {
    this.calls.push(request);
    const name = request.pkg.manifest.name;
    const version = request.pkg.manifest.version;
    const directory = `${request.target.root}/${name}`;
    const previous = this.installed.get(directory);
    if (!request.dryRun) {
      this.installed.set(directory, {
        name,
        version,
        agentId: request.target.agentId,
        scope: request.target.scope,
        directory,
        registry: request.registry,
        installedAt: '2026-01-01T00:00:00.000Z',
        unmanaged: false,
        modified: false,
        dependencyOf: request.dependencyOf,
      });
    }
    return {
      name,
      version,
      agentId: request.target.agentId,
      scope: request.target.scope,
      directory,
      outcome:
        previous === undefined
          ? 'installed'
          : previous.version === version
            ? 'unchanged'
            : 'upgraded',
      ...(previous === undefined ? {} : { previousVersion: previous.version }),
      files: request.pkg.files.map((file) => file.path),
      receipt: {
        receiptVersion: 1,
        name,
        version,
        agentId: request.target.agentId,
        scope: request.target.scope,
        directory,
        registry: request.registry,
        resolved: request.resolved,
        integrity: request.integrity,
        installedAt: '2026-01-01T00:00:00.000Z',
        installedWith: 'test',
        files: [],
        dependencyOf: request.dependencyOf,
      },
    };
  }

  async uninstall(): Promise<never> {
    throw new Error('Suggestion expansion must not uninstall packages');
  }

  async list(target: Parameters<InstallationEngine['list']>[0]) {
    return [...this.installed.values()].filter(
      (skill) =>
        skill.agentId === target.agentId &&
        skill.scope === target.scope &&
        skill.directory === `${target.root}/${skill.name}`,
    );
  }

  async read(target: Parameters<InstallationEngine['read']>[0], name: string) {
    return this.installed.get(`${target.root}/${name}`);
  }
}

function harness(packages: readonly SkillPackage[], extraRegistries: readonly FakeRegistry[] = []) {
  const registry = new FakeRegistry({ name: 'official', packages });
  const federation = new RegistryFederationDouble([registry, ...extraRegistries]);
  const fs = new InMemoryFileSystem().seed({ '/work/project/.git/HEAD': 'ref: refs/heads/main' });
  const installer = new RecordingInstaller();
  const agents = new AgentCatalog().register(adapter('test-agent'));
  const ctx: ApplicationContext = {
    agents,
    registry: federation,
    fs,
    installer,
    env: new FakeEnvironment({ cwd: '/work/project' }),
    commands: new FakeCommandRunner(),
    clock: new FixedClock(),
    logger: new RecordingLogger(),
    config: { schemaVersion: 1, registries: [], agents: {}, cache: { ttlSeconds: 3600 } },
    toolVersion: 'test',
  };
  return { ctx, fs, installer, registry, federation };
}

function versions(report: InstallReport): Record<string, string> {
  return Object.fromEntries(report.resolved.map((skill) => [skill.name, skill.version]));
}

function hasCode(code: string) {
  return (error: unknown): boolean => error instanceof AgentSkillsError && error.code === code;
}

describe('install with direct suggestions', () => {
  it('leaves suggestions uninstalled unless explicitly enabled', async () => {
    const { ctx } = harness([
      pkg('a-skill', { suggests: ['b-skill'], dependencies: { 'd-skill': '*' } }),
      pkg('b-skill'),
      pkg('d-skill'),
    ]);
    const report = await new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'global' });
    assert.deepEqual(versions(report), { 'd-skill': '1.0.0', 'a-skill': '1.0.0' });
  });

  it('includes direct suggestions and their dependency closure, without following more suggestions', async () => {
    const { ctx, installer } = harness([
      pkg('a-skill', { suggests: ['b-skill'], dependencies: { 'd-skill': '*' } }),
      pkg('b-skill', {
        suggests: ['c-skill'],
        dependencies: { 'e-skill': '*' },
        optionalDependencies: { 'f-skill': '*', 'missing-optional': '*' },
      }),
      pkg('c-skill'),
      pkg('d-skill', { suggests: ['g-skill'] }),
      pkg('e-skill', { dependencies: { 'h-skill': '*' } }),
      pkg('f-skill'),
      pkg('g-skill'),
      pkg('h-skill'),
    ]);
    const report = await new InstallSkills(ctx).execute({
      refs: ['a-skill'],
      scope: 'global',
      withSuggests: true,
    });
    assert.deepEqual(Object.keys(versions(report)).sort(), [
      'a-skill',
      'b-skill',
      'd-skill',
      'e-skill',
      'f-skill',
      'h-skill',
    ]);
    const suggested = report.resolved.find((skill) => skill.name === 'b-skill')!;
    assert.equal(suggested.direct, false);
    assert.deepEqual(suggested.suggestedBy, ['a-skill']);
    assert.deepEqual(suggested.requiredBy, []);
    const order = installer.calls.map((call) => call.pkg.manifest.name);
    assert.ok(order.indexOf('h-skill') < order.indexOf('e-skill'));
    assert.ok(order.indexOf('e-skill') < order.indexOf('b-skill'));
    assert.ok(order.indexOf('f-skill') < order.indexOf('b-skill'));
  });

  it('deduplicates companions and keeps explicitly requested skills direct', async () => {
    const { ctx, installer } = harness([
      pkg('a-skill', { suggests: ['b-skill', 'c-skill'] }),
      pkg('b-skill', { suggests: ['c-skill', 'd-skill'] }),
      pkg('c-skill'),
      pkg('d-skill'),
    ]);
    const report = await new InstallSkills(ctx).execute({
      refs: ['a-skill', 'b-skill', 'a-skill'],
      scope: 'global',
      withSuggests: true,
    });
    assert.equal(installer.calls.length, 4);
    assert.equal(report.resolved.find((skill) => skill.name === 'b-skill')!.direct, true);
    assert.deepEqual(report.resolved.find((skill) => skill.name === 'c-skill')!.suggestedBy, [
      'a-skill',
      'b-skill',
    ]);
    assert.deepEqual(
      report.resolved
        .filter((skill) => skill.direct)
        .map((skill) => skill.name)
        .sort(),
      ['a-skill', 'b-skill'],
    );
  });

  it('permits reciprocal suggestions and a companion dependency back to the requested root', async () => {
    const { ctx } = harness([
      pkg('a-skill', { suggests: ['b-skill'] }),
      pkg('b-skill', { suggests: ['a-skill'], dependencies: { 'a-skill': '^1.0.0' } }),
    ]);
    const report = await new InstallSkills(ctx).execute({
      refs: ['a-skill'],
      scope: 'global',
      withSuggests: true,
    });
    assert.deepEqual(versions(report), { 'a-skill': '1.0.0', 'b-skill': '1.0.0' });
    assert.deepEqual(report.resolved.find((skill) => skill.name === 'a-skill')!.requiredBy, [
      'b-skill@1.0.0',
    ]);
    assert.deepEqual(
      report.results.find((result) => result.name === 'a-skill')!.receipt.dependencyOf,
      ['b-skill@1.0.0'],
    );
  });

  it('rejects a real dependency cycle introduced by a suggested package before writes', async () => {
    const { ctx, installer, registry } = harness([
      pkg('a-skill', { suggests: ['b-skill'] }),
      pkg('b-skill', { dependencies: { 'c-skill': '*' } }),
      pkg('c-skill', { dependencies: { 'b-skill': '*' } }),
    ]);
    await assert.rejects(
      new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'global', withSuggests: true }),
      hasCode(ErrorCode.DEPENDENCY_CYCLE),
    );
    assert.deepEqual(installer.calls, []);
    assert.deepEqual(registry.fetches, []);
  });

  it('reads suggestions from the version selected by the explicit range', async () => {
    const { ctx } = harness([
      pkg('a-skill', { version: '1.0.0', suggests: ['b-skill'] }),
      pkg('a-skill', { version: '1.1.0', suggests: ['c-skill'] }),
      pkg('a-skill', { version: '2.0.0', suggests: ['d-skill'] }),
      pkg('b-skill'),
      pkg('c-skill'),
      pkg('d-skill'),
    ]);
    const report = await new InstallSkills(ctx).execute({
      refs: ['a-skill@^1.0.0'],
      scope: 'global',
      withSuggests: true,
    });
    assert.deepEqual(versions(report), { 'a-skill': '1.1.0', 'c-skill': '1.0.0' });
  });

  it('fails rather than changing the selected root to satisfy its companion', async () => {
    const { ctx, installer, registry } = harness([
      pkg('a-skill', { version: '1.0.0', suggests: ['c-skill'] }),
      pkg('a-skill', { version: '2.0.0', suggests: ['b-skill'] }),
      pkg('b-skill', { dependencies: { 'a-skill': '^1.0.0' } }),
      pkg('c-skill'),
    ]);
    await assert.rejects(
      new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'global', withSuggests: true }),
      (error: unknown) => {
        assert.ok(error instanceof AgentSkillsError);
        assert.equal(error.code, ErrorCode.DEPENDENCY_CONFLICT);
        assert.match(error.details.join('\n'), /a-skill/);
        assert.match(error.details.join('\n'), /b-skill/);
        return true;
      },
    );
    assert.deepEqual(installer.calls, []);
    assert.deepEqual(registry.fetches, []);
  });

  it('reports the referring root when a requested suggestion is missing, before writes', async () => {
    const { ctx, installer, registry, fs } = harness([
      pkg('a-skill', { suggests: ['missing-skill'] }),
    ]);
    await assert.rejects(
      new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'project', withSuggests: true }),
      (error: unknown) => {
        assert.ok(error instanceof AgentSkillsError);
        assert.equal(error.code, ErrorCode.SKILL_NOT_FOUND);
        assert.match(error.message, /missing-skill/);
        assert.match(error.details.join('\n'), /a-skill/);
        return true;
      },
    );
    assert.deepEqual(installer.calls, []);
    assert.deepEqual(registry.fetches, []);
    assert.equal(await fs.exists('/work/project/skills.lock'), false);
  });

  it('preserves qualified roots without imposing their registry on unqualified companions', async () => {
    const company = new FakeRegistry({
      name: 'company',
      packages: [pkg('a-skill', { suggests: ['b-skill'] }), pkg('b-skill', { version: '2.0.0' })],
    });
    const { ctx } = harness([pkg('a-skill'), pkg('b-skill')], [company]);
    const report = await new InstallSkills(ctx).execute({
      refs: ['company:a-skill'],
      scope: 'global',
      withSuggests: true,
    });
    assert.deepEqual(
      report.resolved.map((skill) => [skill.name, skill.registry, skill.version]),
      [
        ['a-skill', 'company', '1.0.0'],
        ['b-skill', 'official', '1.0.0'],
      ],
    );
  });

  it('retains the registry selected for an unqualified root during expansion', async () => {
    const company = new FakeRegistry({
      name: 'company',
      packages: [pkg('a-skill', { suggests: ['b-skill'] })],
    });
    const { ctx, federation } = harness([pkg('a-skill'), pkg('b-skill')], [company]);
    let rootLookups = 0;
    federation.ownerOf = async (name) => {
      if (name === 'a-skill') return rootLookups++ === 0 ? 'company' : 'official';
      return name === 'b-skill' ? 'official' : undefined;
    };
    const report = await new InstallSkills(ctx).execute({
      refs: ['a-skill'],
      scope: 'global',
      withSuggests: true,
    });
    assert.equal(report.resolved.find((skill) => skill.name === 'a-skill')!.registry, 'company');
    assert.deepEqual(Object.keys(versions(report)).sort(), ['a-skill', 'b-skill']);
  });

  it('applies the global registry restriction to companions', async () => {
    const company = new FakeRegistry({
      name: 'company',
      packages: [pkg('a-skill', { suggests: ['b-skill'] }), pkg('b-skill', { version: '2.0.0' })],
    });
    const { ctx } = harness([pkg('a-skill'), pkg('b-skill')], [company]);
    const report = await new InstallSkills(ctx).execute({
      refs: ['a-skill'],
      registry: 'company',
      scope: 'global',
      withSuggests: true,
    });
    assert.deepEqual(versions(report), { 'a-skill': '1.0.0', 'b-skill': '2.0.0' });
    assert.ok(report.resolved.every((skill) => skill.registry === 'company'));
  });

  it('honors project version pins and records only real dependency edges', async () => {
    const { ctx, fs } = harness([
      pkg('a-skill', { suggests: ['b-skill'], dependencies: { 'd-skill': '*' } }),
      pkg('a-skill', { version: '2.0.0', suggests: ['c-skill'] }),
      pkg('b-skill'),
      pkg('b-skill', { version: '2.0.0' }),
      pkg('c-skill'),
      pkg('d-skill'),
    ]);
    await new InstallSkills(ctx).execute({
      refs: ['a-skill@1.0.0', 'b-skill@1.0.0'],
      scope: 'project',
    });
    const report = await new InstallSkills(ctx).execute({
      refs: ['a-skill'],
      scope: 'project',
      withSuggests: true,
    });
    assert.deepEqual(versions(report), {
      'd-skill': '1.0.0',
      'a-skill': '1.0.0',
      'b-skill': '1.0.0',
    });
    const lock = await readLockfile(fs, '/work/project');
    assert.deepEqual(lock.skills['a-skill']!.dependencies, { 'd-skill': '1.0.0' });
    assert.deepEqual(lock.skills['b-skill']!.dependencies, {});
    assert.deepEqual(
      report.results.find((result) => result.name === 'b-skill')!.receipt.dependencyOf,
      [],
    );
  });

  it('keeps dry-run plans identical while leaving installations and lockfiles unchanged', async () => {
    const { ctx, fs, installer } = harness([
      pkg('a-skill', { suggests: ['b-skill'] }),
      pkg('b-skill', { dependencies: { 'c-skill': '*' } }),
      pkg('c-skill'),
    ]);
    const options = { refs: ['a-skill'], scope: 'project' as const, withSuggests: true };
    const dry = await new InstallSkills(ctx).execute({ ...options, dryRun: true });
    assert.equal(installer.installed.size, 0);
    assert.equal(await fs.exists('/work/project/skills.lock'), false);
    assert.equal(dry.lockfileUpdated, false);
    const actual = await new InstallSkills(ctx).execute(options);
    assert.deepEqual(dry.resolved, actual.resolved);
    assert.deepEqual(
      dry.results.map((result) => result.directory),
      actual.results.map((result) => result.directory),
    );
  });

  it('preserves an explicit companion version even when a project pin names its older release', async () => {
    const { ctx } = harness([
      pkg('a-skill', { suggests: ['b-skill'] }),
      pkg('b-skill'),
      pkg('b-skill', { version: '2.0.0' }),
    ]);
    await new InstallSkills(ctx).execute({ refs: ['b-skill@1.0.0'], scope: 'project' });
    const report = await new InstallSkills(ctx).execute({
      refs: ['a-skill', 'b-skill@2.0.0'],
      scope: 'project',
      withSuggests: true,
    });
    const companion = report.resolved.find((skill) => skill.name === 'b-skill')!;
    assert.equal(companion.version, '2.0.0');
    assert.equal(companion.direct, true);
  });

  it('rejects incompatible no-dependencies mode as a usage error with a hint', async () => {
    const { ctx, installer, registry } = harness([pkg('a-skill')]);
    await assert.rejects(
      new InstallSkills(ctx).execute({
        refs: ['a-skill'],
        scope: 'global',
        withSuggests: true,
        skipDependencies: true,
      }),
      (error: unknown) => {
        assert.ok(error instanceof AgentSkillsError);
        assert.equal(error.code, ErrorCode.USAGE);
        assert.equal(exitCodeFor(error), 2);
        assert.ok(error.hints.length > 0);
        return true;
      },
    );
    assert.deepEqual(installer.calls, []);
    assert.deepEqual(registry.fetches, []);
  });

  it('still validates hostile suggested payloads before passing them to the installer', async () => {
    const valid = pkg('b-skill');
    const hostile = {
      ...valid,
      files: [...valid.files, { path: '../escape.md', bytes: new TextEncoder().encode('hostile') }],
    };
    const { ctx, installer } = harness([pkg('a-skill', { suggests: ['b-skill'] }), hostile]);
    await assert.rejects(
      new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'global', withSuggests: true }),
      hasCode(ErrorCode.INVALID_PACKAGE),
    );
    assert.ok(installer.calls.every((request) => request.pkg.manifest.name !== 'b-skill'));
  });
});

describe('update with direct suggestions', () => {
  it('requires explicit names, including before reporting that nothing is installed', async () => {
    const { ctx, installer } = harness([pkg('a-skill')]);
    await assert.rejects(
      new UpdateSkills(ctx).execute({ names: [], scope: 'global', withSuggests: true }),
      (error: unknown) => {
        assert.ok(error instanceof AgentSkillsError);
        assert.equal(error.code, ErrorCode.USAGE);
        assert.equal(exitCodeFor(error), 2);
        assert.ok(
          error.hints.some((hint) => hint.includes('update') && hint.includes('--with-suggests')),
        );
        return true;
      },
    );
    assert.deepEqual(installer.calls, []);
  });

  it('uses the updated root manifest, not the installed version suggestions', async () => {
    const { ctx } = harness([
      pkg('a-skill', { suggests: ['b-skill'] }),
      pkg('a-skill', { version: '1.1.0', suggests: ['c-skill'] }),
      pkg('b-skill'),
      pkg('c-skill'),
    ]);
    await new InstallSkills(ctx).execute({ refs: ['a-skill@1.0.0'], scope: 'global' });
    const report = await new UpdateSkills(ctx).execute({
      names: ['a-skill'],
      scope: 'global',
      withSuggests: true,
    });
    assert.deepEqual(versions(report.install), { 'a-skill': '1.1.0', 'c-skill': '1.0.0' });
    assert.deepEqual(
      report.additions.map((addition) => addition.name),
      ['c-skill'],
    );
  });

  it('reports new companions and their new dependencies when the root version is unchanged', async () => {
    const { ctx } = harness([
      pkg('a-skill', { suggests: ['b-skill'] }),
      pkg('b-skill', { dependencies: { 'c-skill': '*' } }),
      pkg('c-skill'),
    ]);
    await new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'global' });
    const report = await new UpdateSkills(ctx).execute({
      names: ['a-skill'],
      scope: 'global',
      withSuggests: true,
    });
    assert.deepEqual(report.unchanged, ['a-skill']);
    assert.deepEqual(report.additions.map((addition) => addition.name).sort(), [
      'b-skill',
      'c-skill',
    ]);
    const addition = report.additions.find((candidate) => candidate.name === 'b-skill')!;
    assert.equal(addition.version, '1.0.0');
    assert.deepEqual(addition.suggestedBy, ['a-skill']);
    assert.equal(addition.results[0]!.outcome, 'installed');
    assert.equal(addition.results[0]!.directory, '/agents/test-agent/skills/b-skill');
  });

  for (const scope of ['global', 'project'] as const) {
    it(`keeps installed companions within the current major in ${scope} scope`, async () => {
      const { ctx } = harness([
        pkg('a-skill', { suggests: ['b-skill'] }),
        pkg('b-skill'),
        pkg('b-skill', { version: '1.1.0' }),
        pkg('b-skill', { version: '2.0.0' }),
      ]);
      await new InstallSkills(ctx).execute({ refs: ['a-skill', 'b-skill@1.0.0'], scope });
      const report = await new UpdateSkills(ctx).execute({
        names: ['a-skill'],
        scope,
        withSuggests: true,
      });
      assert.equal(versions(report.install)['b-skill'], '1.1.0');
      assert.deepEqual(report.additions, []);
      const major = await new UpdateSkills(ctx).execute({
        names: ['a-skill'],
        scope,
        withSuggests: true,
        major: true,
      });
      assert.equal(versions(major.install)['b-skill'], '2.0.0');
    });
  }

  it('fails when a newly suggested companion conflicts with another selected companion range', async () => {
    const { ctx, installer } = harness([
      pkg('a-skill', { suggests: ['b-skill', 'c-skill'] }),
      pkg('b-skill'),
      pkg('b-skill', { version: '2.0.0' }),
      pkg('c-skill', { dependencies: { 'b-skill': '^2.0.0' } }),
    ]);
    await new InstallSkills(ctx).execute({ refs: ['a-skill', 'b-skill@1.0.0'], scope: 'global' });
    installer.calls.length = 0;
    await assert.rejects(
      new UpdateSkills(ctx).execute({ names: ['a-skill'], scope: 'global', withSuggests: true }),
      hasCode(ErrorCode.DEPENDENCY_CONFLICT),
    );
    assert.deepEqual(installer.calls, []);
  });

  it('uses the oldest installed companion version across selected agents', async () => {
    const { ctx } = harness([
      pkg('a-skill', { suggests: ['b-skill'] }),
      pkg('b-skill'),
      pkg('b-skill', { version: '1.1.0' }),
      pkg('b-skill', { version: '2.0.0' }),
    ]);
    ctx.agents.register(adapter('other-agent'));
    await new InstallSkills(ctx).execute({
      refs: ['a-skill', 'b-skill@1.0.0'],
      agents: ['test-agent'],
      scope: 'global',
    });
    await new InstallSkills(ctx).execute({
      refs: ['a-skill', 'b-skill@2.0.0'],
      agents: ['other-agent'],
      scope: 'global',
    });
    const report = await new UpdateSkills(ctx).execute({
      names: ['a-skill'],
      scope: 'global',
      withSuggests: true,
    });
    assert.equal(versions(report.install)['b-skill'], '1.1.0');
  });

  it('reports skipped additions with no successful destinations', async () => {
    const { ctx, installer } = harness([
      pkg('a-skill', { suggests: ['b-skill', 'c-skill'] }),
      pkg('b-skill', { agents: ['different-agent'] }),
      pkg('c-skill', { kind: 'command' }),
    ]);
    await new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'global' });
    const report = await new UpdateSkills(ctx).execute({
      names: ['a-skill'],
      scope: 'global',
      withSuggests: true,
    });
    assert.deepEqual(report.additions.map((addition) => addition.name).sort(), [
      'b-skill',
      'c-skill',
    ]);
    assert.ok(report.additions.every((addition) => addition.results.length === 0));
    assert.equal(installer.installed.size, 1);
    assert.ok(report.install.warnings.some((warning) => /b-skill.*skipped/.test(warning)));
    assert.ok(report.install.warnings.some((warning) => /c-skill.*skipped/.test(warning)));
  });

  it('reports newly installed destinations for packages already managed by another selected agent', async () => {
    const { ctx } = harness([pkg('a-skill', { suggests: ['b-skill'] }), pkg('b-skill')]);
    ctx.agents.register(adapter('other-agent'));
    await new InstallSkills(ctx).execute({
      refs: ['a-skill', 'b-skill'],
      agents: ['test-agent'],
      scope: 'global',
    });
    const report = await new UpdateSkills(ctx).execute({
      names: ['a-skill'],
      agents: ['all'],
      scope: 'global',
      withSuggests: true,
    });
    assert.deepEqual(report.additions.map((addition) => addition.name).sort(), [
      'a-skill',
      'b-skill',
    ]);
    for (const addition of report.additions) {
      assert.equal(addition.results.length, 1);
      assert.equal(addition.results[0]!.agentId, 'other-agent');
      assert.equal(addition.results[0]!.outcome, 'installed');
    }
  });

  it('reports additions during dry-run without changing installed state or an existing lockfile', async () => {
    const { ctx, fs, installer } = harness([
      pkg('a-skill', { suggests: ['b-skill'] }),
      pkg('b-skill'),
    ]);
    await new InstallSkills(ctx).execute({ refs: ['a-skill'], scope: 'project' });
    const before = await fs.readTextFile('/work/project/skills.lock');
    const report = await new UpdateSkills(ctx).execute({
      names: ['a-skill'],
      scope: 'project',
      withSuggests: true,
      dryRun: true,
    });
    assert.deepEqual(
      report.additions.map((addition) => addition.name),
      ['b-skill'],
    );
    assert.equal(report.install.dryRun, true);
    assert.equal(installer.installed.size, 1);
    assert.equal(await fs.readTextFile('/work/project/skills.lock'), before);
  });

  it('does not persist expansion into subsequent named or unnamed updates', async () => {
    const { ctx } = harness([
      pkg('a-skill', { suggests: ['b-skill'] }),
      pkg('a-skill', { version: '1.1.0', suggests: ['c-skill'] }),
      pkg('b-skill', { suggests: ['d-skill'] }),
      pkg('b-skill', { version: '1.1.0', suggests: ['d-skill'] }),
      pkg('c-skill'),
      pkg('d-skill'),
    ]);
    await new InstallSkills(ctx).execute({
      refs: ['a-skill@1.0.0', 'b-skill@1.0.0'],
      scope: 'global',
    });
    await new UpdateSkills(ctx).execute({
      names: ['a-skill'],
      scope: 'global',
      withSuggests: true,
    });
    const named = await new UpdateSkills(ctx).execute({ names: ['a-skill'], scope: 'global' });
    assert.deepEqual(Object.keys(versions(named.install)), ['a-skill']);
    const all = await new UpdateSkills(ctx).execute({ names: [], scope: 'global' });
    assert.deepEqual(Object.keys(versions(all.install)).sort(), ['a-skill', 'b-skill', 'c-skill']);
    assert.equal(versions(all.install)['b-skill'], '1.1.0');
    assert.equal(versions(all.install)['d-skill'], undefined);
  });
});
