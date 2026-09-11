import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseVersion, type SkillUpdateNotice, type UpdateNotices } from '@jvm-expert/core';
import { RecordingLogger } from '@jvm-expert/core/testing';
import {
  shouldCheckUpdates,
  showUpdateNotifications,
  type NotificationServices,
} from '../src/update-notifications.ts';

const terminal = { stdin: true, stdout: true, stderr: true };
const tool = { id: 'tool', current: parseVersion('1.0.0'), version: parseVersion('1.1.0') };
const skill: SkillUpdateNotice = {
  id: 'skill',
  current: parseVersion('1.0.0'),
  version: parseVersion('1.1.0'),
  name: 'demo-skill',
  registry: 'official',
  modified: false,
  requiresMajor: false,
  target: {
    agentId: 'test',
    displayName: 'Test Agent',
    scope: 'global',
    kind: 'skill',
    root: '/skills',
    shape: 'directory',
    extension: '',
  },
};

function harness(notices: UpdateNotices, choices: (number | undefined)[]) {
  const dismissed: string[] = [];
  const deferred: string[] = [];
  const applied: SkillUpdateNotice[][] = [];
  const menus: { title: string; choices: readonly string[] }[] = [];
  const output: string[] = [];
  let toolRuns = 0;
  const services: NotificationServices = {
    check: {
      async execute() {
        return notices;
      },
      async dismiss(items) {
        dismissed.push(...items.map((item) => item.id));
      },
      async remindLater(items) {
        deferred.push(...items.map((item) => item.id));
      },
    },
    apply: {
      async execute(items) {
        applied.push([...items]);
        return [];
      },
    },
    tool: {
      async latestVersion() {
        return tool.version;
      },
      async action() {
        return {
          label: 'npm install --global @jvm-expert/agent-skills@1.1.0',
          async run() {
            toolRuns++;
            return { code: 0, stdout: '', stderr: '' };
          },
        };
      },
    },
    prompt: {
      async choose(title, options) {
        menus.push({ title, choices: options });
        assert.ok(choices.length > 0, 'unexpected extra menu');
        return choices.shift();
      },
    },
    logger: new RecordingLogger(),
  };
  return {
    services,
    output,
    dismissed,
    deferred,
    applied,
    menus,
    toolRuns: () => toolRuns,
    run: () => showUpdateNotifications(services, 'list', {}, (line) => output.push(line)),
  };
}

describe('notification activation', () => {
  it('runs only for eligible commands in interactive terminals', () => {
    assert.equal(shouldCheckUpdates('list', {}, terminal, {}), true);
    for (const command of ['validate', 'create', 'publish', 'uninstall', 'help'])
      assert.equal(shouldCheckUpdates(command, {}, terminal, {}), false);
    for (const stream of ['stdin', 'stdout', 'stderr'])
      assert.equal(shouldCheckUpdates('list', {}, { ...terminal, [stream]: false }, {}), false);
  });

  it('honours JSON, quiet, dry runs, offline, CI and both opt-outs', () => {
    for (const options of [
      { json: true },
      { quiet: true },
      { dryRun: true },
      { offline: true },
      { updateCheck: false },
      { global: true, project: true },
    ]) {
      assert.equal(shouldCheckUpdates('list', options, terminal, {}), false);
    }
    for (const env of [
      { CI: 'true' },
      { CI: '1' },
      { TERM: 'dumb' },
      { AGENT_SKILLS_NO_UPDATE_NOTIFIER: '1' },
    ]) {
      assert.equal(shouldCheckUpdates('list', {}, terminal, env), false);
    }
    assert.equal(shouldCheckUpdates('list', {}, terminal, { CI: 'false' }), true);
  });
});

describe('interactive update flow', () => {
  it('stops the old CLI after an explicitly selected self-update', async () => {
    const test = harness({ tool, skills: [skill] }, [0]);
    assert.equal(await test.run(), true);
    assert.equal(test.toolRuns(), 1);
    assert.deepEqual(test.applied, []);
    assert.match(test.output.join('\n'), /Run your command again/);
  });

  it('persists later/skip choices without applying any update', async () => {
    const test = harness({ tool, skills: [skill] }, [1, 3]);
    assert.equal(await test.run(), false);
    assert.deepEqual(test.deferred, ['tool']);
    assert.deepEqual(test.dismissed, ['skill']);
    assert.equal(test.toolRuns(), 0);
    assert.deepEqual(test.applied, []);
  });

  it('defaults interrupted prompts to later', async () => {
    const test = harness({ tool, skills: [skill] }, [undefined, undefined]);
    await test.run();
    assert.deepEqual(test.deferred, ['tool', 'skill']);
    assert.deepEqual(test.applied, []);
  });

  it('applies only compatible candidates unless major versions are explicitly approved', async () => {
    const major = { ...skill, id: 'major', version: parseVersion('2.0.0'), requiresMajor: true };
    const compatible = harness({ skills: [skill, major] }, [0]);
    await compatible.run();
    assert.deepEqual(compatible.applied, [[skill]]);
    const approved = harness({ skills: [skill, major] }, [2, 1]);
    await approved.run();
    assert.deepEqual(approved.applied, [[major]]);
    assert.match(approved.menus[1]!.title, /--major/);
    const declined = harness({ skills: [skill, major] }, [2, 0, 3]);
    await declined.run();
    assert.deepEqual(declined.applied, []);
  });

  it('shows details and escapes hostile terminal controls in metadata', async () => {
    const test = harness(
      {
        skills: [
          {
            ...skill,
            registry: 'evil\u001b[2J',
            target: { ...skill.target, root: '/skills\nFAKE COMMAND' },
          },
        ],
      },
      [1, 2],
    );
    await test.run();
    assert.match(test.output.join('\n'), /Registry:/);
    assert.equal(test.output.join('\n').includes('\u001b'), false);
    assert.ok(test.output[0]!.includes('/skills FAKE COMMAND'));
    assert.deepEqual(test.applied, []);
  });

  it('does not offer automatic mutation for unrecognized or temporary installs', async () => {
    const test = harness({ tool, skills: [] }, [1]);
    test.services.tool.action = async () => ({
      label: 'npx @jvm-expert/agent-skills@1.1.0 <command>',
    });
    await test.run();
    assert.deepEqual(test.dismissed, ['tool']);
    assert.equal(test.toolRuns(), 0);
    assert.equal(test.menus[0]!.choices.length, 2);
  });

  it('tolerates failed advisory checks but reports failed user-selected updates', async () => {
    const failedCheck = harness({ skills: [] }, []);
    failedCheck.services.check.execute = async () => {
      throw new Error('offline');
    };
    assert.equal(await failedCheck.run(), false);
    const failedUpdate = harness({ tool, skills: [] }, [0]);
    failedUpdate.services.tool.action = async () => ({
      label: 'npm install',
      async run() {
        return { code: 1, stdout: '', stderr: 'permission denied' };
      },
    });
    await assert.rejects(failedUpdate.run(), /Could not update/);
    assert.deepEqual(failedUpdate.deferred, []);
  });
});
