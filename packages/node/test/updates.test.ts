import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PassThrough } from 'node:stream';
import {
  emptyUpdateState,
  parseVersion,
  type CommandOptions,
  type CommandRunner,
  type SemanticVersion,
} from '@jvm-expert/core';
import { FakeEnvironment, FakeHttpClient, InMemoryFileSystem } from '@jvm-expert/core/testing';
import { NpmToolUpdater, TOOL_PACKAGE, TOOL_VERSION_URL } from '../src/tool-updater.ts';
import { FileUpdateStateStore } from '../src/update-state.ts';
import {
  NodeSelectionPrompt,
  type PromptInput,
  type PromptOutput,
} from '../src/selection-prompt.ts';

function updaterHarness(
  options: { local?: boolean; windows?: boolean; temporary?: boolean; metadata?: unknown } = {},
) {
  const modules = options.local ? '/project/node_modules' : '/global/node_modules';
  const packageDirectory = options.temporary
    ? '/cache/_npx/abc/node_modules/@jvm-expert/agent-skills'
    : `${modules}/${TOOL_PACKAGE}`;
  const executable = options.windows ? '/bin/npm.CMD' : '/bin/npm';
  const fs = new InMemoryFileSystem().seed({
    [`${packageDirectory}/package.json`]: '{}',
    '/global/node_modules/.keep': '',
    [executable]: '',
    '/bin/node_modules/npm/bin/npm-cli.js': '',
    '/project/package.json': JSON.stringify({ devDependencies: { [TOOL_PACKAGE]: '^1.0.0' } }),
    '/project/package-lock.json': '{}',
  });
  const calls: { command: string; args: readonly string[]; options?: CommandOptions }[] = [];
  const commands: CommandRunner = {
    async which() {
      return executable;
    },
    async run(command, args, request) {
      calls.push({ command, args, options: request });
      return {
        code: 0,
        stdout: args.includes('root') ? '/global/node_modules\n' : 'updated',
        stderr: '',
      };
    },
  };
  const http = new FakeHttpClient({
    [TOOL_VERSION_URL]: JSON.stringify(options.metadata ?? { version: '1.1.0' }),
  });
  const updater = new NpmToolUpdater({
    fs,
    commands,
    http,
    env: new FakeEnvironment(),
    packageDirectory,
    nodeExecutable: '/bin/node',
  });
  return { updater, fs, calls, http };
}

describe('CLI release metadata and updates', () => {
  it('accepts a stable npm release and never executes a command while checking', async () => {
    const { updater, http, calls } = updaterHarness();
    assert.equal(await updater.latestVersion(), '1.1.0');
    assert.deepEqual(http.requests, [TOOL_VERSION_URL]);
    assert.deepEqual(calls, []);
  });

  it('rejects hostile versions, scripts in metadata, and prerelease latest tags', async () => {
    for (const version of [
      '1.1.0; touch owned',
      '1.1.0\n--prefix=/elsewhere',
      '2.0.0-beta.1',
      '\u001b[2J1.1.0',
    ]) {
      const { updater, calls } = updaterHarness({
        metadata: { version, scripts: { postinstall: 'owned' } },
      });
      assert.equal(await updater.latestVersion(), undefined);
      await assert.rejects(
        updater.action(version as SemanticVersion),
        /Invalid CLI update version/,
      );
      assert.deepEqual(calls, []);
    }
  });

  it('constructs an exact npm global update only after verifying the global root', async () => {
    const { updater, calls } = updaterHarness();
    const action = await updater.action(parseVersion('1.1.0'));
    assert.equal(action.label, `npm install --global ${TOOL_PACKAGE}@1.1.0`);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]!.args, ['root', '--global']);
    await action.run!();
    assert.deepEqual(calls[1]!.args, ['install', '--global', `${TOOL_PACKAGE}@1.1.0`]);
    assert.equal(calls[1]!.options?.cwd, '/home/dev');
  });

  it('runs npm through its JavaScript entrypoint on Windows without invoking a shell', async () => {
    const { updater, calls } = updaterHarness({ windows: true });
    await (
      await updater.action(parseVersion('1.1.0'))
    ).run!();
    assert.equal(calls[1]!.command, '/bin/node');
    assert.deepEqual(calls[1]!.args, [
      '/bin/node_modules/npm/bin/npm-cli.js',
      'install',
      '--global',
      `${TOOL_PACKAGE}@1.1.0`,
    ]);
  });

  it('preserves local dev dependency scope and the owning project directory', async () => {
    const { updater, calls } = updaterHarness({ local: true });
    const action = await updater.action(parseVersion('1.1.0'));
    await action.run!();
    assert.equal(calls[1]!.options?.cwd, '/project');
    assert.deepEqual(calls[1]!.args, ['install', '--save-dev', `${TOOL_PACKAGE}@1.1.0`]);
  });

  it('does not convert another package manager or a transitive installation to npm', async () => {
    const other = updaterHarness({ local: true });
    await other.fs.writeFile('/project/pnpm-lock.yaml', '');
    assert.equal((await other.updater.action(parseVersion('1.1.0'))).run, undefined);
    const transitive = updaterHarness({ local: true });
    await transitive.fs.writeFile('/project/package.json', '{}');
    assert.equal((await transitive.updater.action(parseVersion('1.1.0'))).run, undefined);
    assert.ok([...other.calls, ...transitive.calls].every((call) => call.args.includes('root')));
  });

  it('offers a versioned npx invocation instead of replacing a temporary install', async () => {
    const { updater, calls } = updaterHarness({ temporary: true });
    const action = await updater.action(parseVersion('1.1.0'));
    assert.equal(action.label, `npx ${TOOL_PACKAGE}@1.1.0 <command>`);
    assert.equal(action.run, undefined);
    assert.deepEqual(calls, []);
  });
});

describe('notification state', () => {
  it('uses AGENT_SKILLS_HOME and survives a new store instance', async () => {
    const fs = new InMemoryFileSystem();
    const env = new FakeEnvironment({ env: { AGENT_SKILLS_HOME: '/isolated/manager' } });
    const state = {
      checks: { tool: { checkedAt: 123, versions: [parseVersion('1.1.0')] } },
      dismissed: ['one'],
      deferred: { two: 456 },
    };
    await new FileUpdateStateStore(fs, env).save(state);
    assert.deepEqual(await new FileUpdateStateStore(fs, env).load(), state);
    assert.equal(await fs.exists('/isolated/manager/updates.json'), true);
    assert.deepEqual(
      (await fs.readDir('/isolated/manager')).map((entry) => entry.name),
      ['updates.json'],
    );
    assert.equal(await fs.exists('/home/dev/.agent-skills'), false);
  });

  it('discards corrupt state and invalid cached versions', async () => {
    const fs = new InMemoryFileSystem().seed({ '/state/updates.json': '{broken' });
    const env = new FakeEnvironment({ env: { AGENT_SKILLS_HOME: '/state' } });
    const store = new FileUpdateStateStore(fs, env);
    assert.deepEqual(await store.load(), emptyUpdateState());
    await fs.writeFile(
      '/state/updates.json',
      JSON.stringify({
        schemaVersion: 1,
        checks: { tool: { checkedAt: 1, versions: ['1.0.0;owned'] } },
      }),
    );
    assert.deepEqual(await store.load(), emptyUpdateState());
    await fs.writeFile('/state/updates.json', JSON.stringify({ schemaVersion: 99 }));
    assert.deepEqual(await store.load(), emptyUpdateState());
  });
});

function terminalHarness() {
  const input = new PassThrough() as PromptInput;
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (mode) => {
    input.isRaw = mode;
  };
  const output = new PassThrough() as PromptOutput;
  output.isTTY = true;
  let text = '';
  output.on('data', (chunk) => {
    text += String(chunk);
  });
  return { input, output, prompt: new NodeSelectionPrompt(input, output), text: () => text };
}

describe('terminal selection', () => {
  it('supports arrow navigation and restores raw mode/listeners after selection', async () => {
    const { input, prompt, text } = terminalHarness();
    const result = prompt.choose('Update available!', ['Update now', 'Later', 'Skip']);
    input.write('\u001b[B\r');
    assert.equal(await result, 1);
    assert.equal(input.isRaw, false);
    assert.equal(input.isPaused(), true);
    assert.equal(input.listenerCount('keypress'), 0);
    assert.match(text(), /Update available!/);
  });

  it('supports numbered choices, and interruption declines without choosing update', async () => {
    const { input, prompt } = terminalHarness();
    let result = prompt.choose('Update?', ['Update', 'Later', 'Skip']);
    input.write('3\r');
    assert.equal(await result, 2);
    result = prompt.choose('Update?', ['Update', 'Later']);
    input.write('\u0003');
    assert.equal(await result, undefined);
    assert.equal(input.isRaw, false);
  });

  it('handles EOF and non-interactive input without hanging', async () => {
    const { input, output, prompt } = terminalHarness();
    const result = prompt.choose('Update?', ['Update']);
    input.end();
    assert.equal(await result, undefined);
    output.isTTY = false;
    assert.equal(await prompt.choose('Update?', ['Update']), undefined);
  });
});
