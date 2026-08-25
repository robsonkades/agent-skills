import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  AgentSkillsError,
  ErrorCode,
  encodeText,
  type AgentAdapter,
  type AgentLayout,
  type AgentTarget,
  type FileSystem,
  type InstallRequest,
  type SkillPackage,
} from '@jvm-expert/core';
import {
  FixedClock,
  InMemoryFileSystem,
  RecordingLogger,
  buildPackage,
  hasherOver,
} from '@jvm-expert/core/testing';
import { NodeFileSystem, NodeHasher } from '@jvm-expert/node';
import { AtomicInstaller } from '../src/atomic-installer.ts';

/** A minimal pass-through adapter: installer behaviour under test, not projection. */
function adapterOf(id: string, transform?: (pkg: SkillPackage) => AgentLayout): AgentAdapter {
  return {
    id,
    displayName: id,
    aliases: [],
    overrideKeys: [],
    async detect() {
      return { agentId: id, installed: true, strength: 'strong', evidence: [] };
    },
    locationFor() {
      return { root: '/unused', shape: 'directory', extension: '' };
    },
    layoutFor(pkg) {
      return (
        transform?.(pkg) ?? {
          entries: pkg.files.map((file) => ({ path: file.path, copyFrom: file.path })),
          frontmatter: {},
        }
      );
    },
    validate() {
      return [];
    },
  };
}

function requestFor(
  pkg: SkillPackage,
  target: AgentTarget,
  overrides: Partial<InstallRequest> = {},
): InstallRequest {
  return {
    pkg,
    adapter: adapterOf(target.agentId),
    target,
    registry: 'test',
    resolved: `fake://test/${pkg.manifest.name}`,
    integrity: 'sha256-test',
    dependencyOf: [],
    force: false,
    dryRun: false,
    ...overrides,
  };
}

function installerOver(fs: FileSystem) {
  return new AtomicInstaller({
    fs,
    hasher: hasherOver(fs),
    clock: new FixedClock(),
    logger: new RecordingLogger(),
    toolVersion: 'test@1.0.0',
  });
}

const target: AgentTarget = {
  agentId: 'test-agent',
  displayName: 'Test Agent',
  scope: 'global',
  kind: 'skill',
  root: '/home/dev/.test/skills',
  shape: 'directory',
  extension: '',
};

/** A root whose packages are single files, the shape Claude Code commands install in. */
const fileTarget: AgentTarget = {
  agentId: 'test-agent',
  displayName: 'Test Agent',
  scope: 'global',
  kind: 'command',
  root: '/home/dev/.test/commands',
  shape: 'file',
  extension: '.md',
};

describe('atomic installer (in-memory)', () => {
  it('installs a package and records a receipt', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);
    const pkg = buildPackage({ name: 'a-skill', version: '1.0.0' });

    const result = await installer.install(requestFor(pkg, target));

    assert.equal(result.outcome, 'installed');
    assert.equal(result.directory, '/home/dev/.test/skills/a-skill');
    assert.deepEqual(result.files, ['SKILL.md', 'skill.yaml']);
    assert.ok(await fs.exists('/home/dev/.test/skills/a-skill/SKILL.md'));
    assert.ok(await fs.exists('/home/dev/.test/skills/.agent-skills/receipts/a-skill.json'));
    assert.equal(result.receipt.files.length, 2);
  });

  it('leaves no staging or retired directories behind', async () => {
    const fs = new InMemoryFileSystem();
    await installerOver(fs).install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target),
    );

    const leftovers = fs.snapshot().filter((path) => /staging|retired/.test(path));
    assert.deepEqual(leftovers, []);
  });

  it('reports an upgrade and replaces the previous content', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);

    await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target),
    );
    const result = await installer.install(
      requestFor(
        buildPackage({
          name: 'a-skill',
          version: '2.0.0',
          extraFiles: { 'references/new.md': 'new content' },
        }),
        target,
      ),
    );

    assert.equal(result.outcome, 'upgraded');
    assert.equal(result.previousVersion, '1.0.0');
    assert.ok(await fs.exists('/home/dev/.test/skills/a-skill/references/new.md'));
    assert.match(fs.textAt('/home/dev/.test/skills/a-skill/skill.yaml')!, /version: 2\.0\.0/);
  });

  it('removes files that a newer version no longer ships', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);

    await installer.install(
      requestFor(
        buildPackage({
          name: 'a-skill',
          version: '1.0.0',
          extraFiles: { 'references/old.md': 'old' },
        }),
        target,
      ),
    );
    assert.ok(await fs.exists('/home/dev/.test/skills/a-skill/references/old.md'));

    await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '2.0.0' }), target),
    );
    assert.equal(await fs.exists('/home/dev/.test/skills/a-skill/references/old.md'), false);
  });

  it('detects a downgrade', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);

    await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '2.0.0' }), target),
    );
    const result = await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target),
    );

    assert.equal(result.outcome, 'downgraded');
  });

  it('refuses to overwrite a directory it does not own', async () => {
    const fs = new InMemoryFileSystem().seed({
      '/home/dev/.test/skills/a-skill/SKILL.md': 'hand-written by the user',
    });

    await assert.rejects(
      () =>
        installerOver(fs).install(
          requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target),
        ),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.MODIFIED_INSTALL,
    );
    assert.equal(fs.textAt('/home/dev/.test/skills/a-skill/SKILL.md'), 'hand-written by the user');
  });

  it('overwrites an unowned directory with --force', async () => {
    const fs = new InMemoryFileSystem().seed({
      '/home/dev/.test/skills/a-skill/SKILL.md': 'hand-written',
    });

    const result = await installerOver(fs).install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target, { force: true }),
    );
    assert.equal(result.outcome, 'installed');
    assert.notEqual(fs.textAt('/home/dev/.test/skills/a-skill/SKILL.md'), 'hand-written');
  });

  it('refuses to overwrite an install whose files were edited by hand', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);
    await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target),
    );

    await fs.writeFile('/home/dev/.test/skills/a-skill/SKILL.md', 'locally edited');

    await assert.rejects(
      () =>
        installer.install(requestFor(buildPackage({ name: 'a-skill', version: '2.0.0' }), target)),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.MODIFIED_INSTALL,
    );
  });

  it('writes nothing on a dry run', async () => {
    const fs = new InMemoryFileSystem();
    const before = fs.snapshot();

    const result = await installerOver(fs).install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target, { dryRun: true }),
    );

    assert.equal(result.outcome, 'installed');
    assert.deepEqual(result.files, ['SKILL.md', 'skill.yaml']);
    assert.deepEqual(fs.snapshot(), before);
  });

  it('leaves the previous version intact when staging fails', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);
    await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target),
    );
    const originalText = fs.textAt('/home/dev/.test/skills/a-skill/skill.yaml');

    // An adapter that asks for an impossible path fails after staging has begun.
    const brokenAdapter = adapterOf('test-agent', () => ({
      entries: [
        { path: 'SKILL.md', copyFrom: 'SKILL.md' },
        { path: '../escape.md', content: encodeText('escaped') },
      ],
      frontmatter: {},
    }));

    await assert.rejects(
      () =>
        installer.install(
          requestFor(buildPackage({ name: 'a-skill', version: '2.0.0' }), target, {
            adapter: brokenAdapter,
            force: true,
          }),
        ),
      (error: unknown) => error instanceof AgentSkillsError && error.code === ErrorCode.UNSAFE_PATH,
    );

    assert.equal(fs.textAt('/home/dev/.test/skills/a-skill/skill.yaml'), originalText);
    assert.deepEqual(
      fs.snapshot().filter((path) => /staging|escape/.test(path)),
      [],
    );
  });

  it('refuses an adapter that tries to write into the bookkeeping directory', async () => {
    const fs = new InMemoryFileSystem();
    const sneaky = adapterOf('test-agent', () => ({
      entries: [
        { path: 'SKILL.md', copyFrom: 'SKILL.md' },
        { path: '.agent-skills/receipt.json', content: encodeText('{"forged":true}') },
      ],
      frontmatter: {},
    }));

    await assert.rejects(
      () =>
        installerOver(fs).install(
          requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target, {
            adapter: sneaky,
          }),
        ),
      (error: unknown) => error instanceof AgentSkillsError && error.code === ErrorCode.UNSAFE_PATH,
    );
  });

  it('lists installs and flags unmanaged directories', async () => {
    const fs = new InMemoryFileSystem().seed({
      '/home/dev/.test/skills/hand-made/SKILL.md': 'not ours',
    });
    const installer = installerOver(fs);
    await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target),
    );

    const listed = await installer.list(target);
    assert.deepEqual(
      listed.map((skill) => [skill.name, skill.unmanaged]),
      [
        ['a-skill', false],
        ['hand-made', true],
      ],
    );
  });

  it('flags drift when a managed file is edited', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);
    await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target),
    );

    assert.equal((await installer.read(target, 'a-skill'))!.modified, false);
    await fs.writeFile('/home/dev/.test/skills/a-skill/SKILL.md', 'edited');
    assert.equal((await installer.read(target, 'a-skill'))!.modified, true);
  });
});

describe('uninstall ownership', () => {
  it('removes only the files it installed', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);
    await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target),
    );

    // A file the user added after installation is not ours to delete.
    await fs.writeFile('/home/dev/.test/skills/a-skill/my-notes.md', 'personal');

    const result = await installer.uninstall({
      name: 'a-skill',
      adapter: adapterOf('test-agent'),
      target,
      force: false,
      dryRun: false,
    });

    assert.deepEqual(result.removed, ['SKILL.md', 'skill.yaml']);
    assert.equal(fs.textAt('/home/dev/.test/skills/a-skill/my-notes.md'), 'personal');
  });

  it('preserves a modified file and reports it', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);
    await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target),
    );
    await fs.writeFile('/home/dev/.test/skills/a-skill/SKILL.md', 'edited by hand');

    const result = await installer.uninstall({
      name: 'a-skill',
      adapter: adapterOf('test-agent'),
      target,
      force: false,
      dryRun: false,
    });

    assert.deepEqual(result.preserved, ['SKILL.md']);
    assert.equal(fs.textAt('/home/dev/.test/skills/a-skill/SKILL.md'), 'edited by hand');
  });

  it('deletes a modified file with --force', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);
    await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target),
    );
    await fs.writeFile('/home/dev/.test/skills/a-skill/SKILL.md', 'edited by hand');

    const result = await installer.uninstall({
      name: 'a-skill',
      adapter: adapterOf('test-agent'),
      target,
      force: true,
      dryRun: false,
    });

    assert.deepEqual(result.preserved, []);
    assert.equal(await fs.exists('/home/dev/.test/skills/a-skill/SKILL.md'), false);
  });

  it('refuses to remove a directory it does not own', async () => {
    const fs = new InMemoryFileSystem().seed({ '/home/dev/.test/skills/theirs/SKILL.md': 'x' });
    await assert.rejects(
      () =>
        installerOver(fs).uninstall({
          name: 'theirs',
          adapter: adapterOf('test-agent'),
          target,
          force: false,
          dryRun: false,
        }),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.MODIFIED_INSTALL,
    );
  });

  it('writes nothing on a dry run', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);
    await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), target),
    );
    const before = fs.snapshot();

    const result = await installer.uninstall({
      name: 'a-skill',
      adapter: adapterOf('test-agent'),
      target,
      force: false,
      dryRun: true,
    });

    assert.deepEqual(result.removed, ['SKILL.md', 'skill.yaml']);
    assert.deepEqual(fs.snapshot(), before);
  });
});

/**
 * The in-memory double cannot prove that the commit is a real rename on a real filesystem,
 * so the atomicity guarantee is also exercised against the OS.
 */
describe('atomic installer (real filesystem)', () => {
  let root: string;

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'agent-skills-test-'));
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('installs, upgrades and uninstalls against the OS filesystem', async () => {
    const fs = new NodeFileSystem();
    const installer = new AtomicInstaller({
      fs,
      hasher: new NodeHasher(),
      clock: new FixedClock(),
      logger: new RecordingLogger(),
      toolVersion: 'test@1.0.0',
    });

    const realTarget: AgentTarget = { ...target, root: join(root, 'skills') };

    const installed = await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.0.0' }), realTarget),
    );
    assert.equal(installed.outcome, 'installed');
    assert.match(
      await readFile(join(installed.directory, 'skill.yaml'), 'utf8'),
      /version: 1\.0\.0/,
    );

    const upgraded = await installer.install(
      requestFor(buildPackage({ name: 'a-skill', version: '1.1.0' }), realTarget),
    );
    assert.equal(upgraded.outcome, 'upgraded');
    assert.match(
      await readFile(join(upgraded.directory, 'skill.yaml'), 'utf8'),
      /version: 1\.1\.0/,
    );

    // A file the user added survives uninstall.
    await writeFile(join(upgraded.directory, 'notes.md'), 'mine');

    const removed = await installer.uninstall({
      name: 'a-skill',
      adapter: adapterOf('test-agent'),
      target: realTarget,
      force: false,
      dryRun: false,
    });
    assert.deepEqual(removed.removed, ['SKILL.md', 'skill.yaml']);
    assert.equal(await readFile(join(upgraded.directory, 'notes.md'), 'utf8'), 'mine');
  });
});

describe('atomic installer — single-file targets', () => {
  /** Claude Code commands are one `.md` file, so the layout projects exactly one entry. */
  const commandAdapter = adapterOf('test-agent', () => ({
    entries: [{ path: 'COMMAND.md', copyFrom: 'COMMAND.md' }],
    frontmatter: {},
  }));

  function commandRequest(version: string, overrides: Partial<InstallRequest> = {}) {
    return requestFor(buildPackage({ name: 'a-command', version, kind: 'command' }), fileTarget, {
      adapter: commandAdapter,
      ...overrides,
    });
  }

  it('installs the package as one file named after it', async () => {
    const fs = new InMemoryFileSystem();
    const result = await installerOver(fs).install(commandRequest('1.0.0'));

    assert.equal(result.directory, '/home/dev/.test/commands/a-command.md');
    assert.deepEqual(result.files, ['a-command.md']);
    assert.ok(await fs.exists('/home/dev/.test/commands/a-command.md'));
    assert.ok(
      await fs.exists('/home/dev/.test/commands/.agent-skills/receipts/a-command.json'),
      'the root receipt is the only bookkeeping a file install can carry',
    );
    assert.deepEqual(
      fs.snapshot().filter((path) => /staging|retired/.test(path)),
      [],
    );
  });

  it('replaces the file on upgrade', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);
    await installer.install(commandRequest('1.0.0'));
    const result = await installer.install(commandRequest('2.0.0'));

    assert.equal(result.outcome, 'upgraded');
    assert.equal(result.previousVersion, '1.0.0');
    assert.deepEqual(
      fs.snapshot().filter((path) => /staging|retired/.test(path)),
      [],
    );
  });

  it('lists and reads file installs, ignoring anything else in the root', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);
    await installer.install(commandRequest('1.0.0'));
    fs.seed({
      '/home/dev/.test/commands/notes.txt': 'not a command',
      '/home/dev/.test/commands/theirs.md': '# hand-written',
    });

    const listed = await installer.list(fileTarget);
    assert.deepEqual(
      listed.map((entry) => `${entry.name}:${entry.unmanaged}`),
      ['a-command:false', 'theirs:true'],
    );
    assert.equal((await installer.read(fileTarget, 'a-command'))?.version, '1.0.0');
  });

  it('refuses to overwrite a file it does not own', async () => {
    const fs = new InMemoryFileSystem().seed({
      '/home/dev/.test/commands/a-command.md': '# mine',
    });

    await assert.rejects(
      () => installerOver(fs).install(commandRequest('1.0.0')),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.MODIFIED_INSTALL,
    );
    assert.equal(fs.textAt('/home/dev/.test/commands/a-command.md'), '# mine');
  });

  it('removes the file and its receipt on uninstall', async () => {
    const fs = new InMemoryFileSystem();
    const installer = installerOver(fs);
    await installer.install(commandRequest('1.0.0'));

    const removed = await installer.uninstall({
      name: 'a-command',
      adapter: commandAdapter,
      target: fileTarget,
      force: false,
      dryRun: false,
    });

    assert.deepEqual(removed.removed, ['a-command.md']);
    assert.equal(await fs.exists('/home/dev/.test/commands/a-command.md'), false);
    assert.equal(
      await fs.exists('/home/dev/.test/commands/.agent-skills/receipts/a-command.json'),
      false,
    );
  });

  it('rejects an adapter that projects more than one file onto it', async () => {
    const fs = new InMemoryFileSystem();
    const greedy = adapterOf('test-agent', (pkg) => ({
      entries: pkg.files.map((file) => ({ path: file.path, copyFrom: file.path })),
      frontmatter: {},
    }));

    await assert.rejects(
      () => installerOver(fs).install(commandRequest('1.0.0', { adapter: greedy })),
      (error: unknown) => error instanceof AgentSkillsError && error.code === ErrorCode.INTERNAL,
    );
  });
});
