import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { after, before, describe, it } from 'node:test';

const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const bin = join(repoRoot, 'packages', 'cli', 'bin', 'agent-skills.mjs');

describe('CLI version', () => {
  it('reports the version its package.json publishes', async () => {
    // The constant is hand-written, so a package-only version bump could leave `--version`
    // announcing an older release. Releases move every package together; this keeps the one
    // number a user actually sees moving with them.
    const pkg = JSON.parse(
      await readFile(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8'),
    ) as { version: string };
    const { stdout } = await run(process.execPath, [bin, '--version']);
    assert.equal(stdout.trim(), pkg.version);
  });
});

interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Drives the real binary in a hermetic environment.
 *
 * `AGENT_SKILLS_HOME`, `CLAUDE_CONFIG_DIR` and `CODEX_HOME` all point into a temp directory,
 * so the test can never read or write the developer's actual agent configuration — which is
 * the failure mode that makes package-manager test suites dangerous to run locally.
 */
async function cli(
  args: readonly string[],
  options: {
    home: string;
    cwd?: string;
    env?: Record<string, string>;
    choices?: readonly number[];
  } = { home: '' },
): Promise<CliResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AGENT_SKILLS_HOME: join(options.home, '.agent-skills'),
    CLAUDE_CONFIG_DIR: join(options.home, '.claude'),
    CODEX_HOME: join(options.home, '.codex'),
    HOME: options.home,
    USERPROFILE: options.home,
    NO_COLOR: '1',
    ...(options.env ?? {}),
  };
  // Keep the absolute Node executable used below, but expose no executable search path to the
  // child. Pointing PATH at dirname(process.execPath) is not hermetic on Windows: npm can install
  // codex.CMD beside node.exe, which made the "no agents" tests detect the developer's real Codex.
  // Remove case variants first because Windows treats Path/PATH as the same environment key.
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === 'PATH') delete env[key];
  }
  env['PATH'] = join(options.home, '.empty-executable-path');

  if (options.choices !== undefined) {
    // Exercise the real startup hook and terminal menu in an isolated child, with pipe
    // streams advertising TTY capabilities. No test-only switch exists in the product.
    const script = `
      for (const stream of [process.stdin, process.stdout, process.stderr]) {
        Object.defineProperty(stream, 'isTTY', { value: true });
      }
      process.stdin.setRawMode = () => process.stdin;
      const { run } = await import(process.argv[1]);
      process.exitCode = await run(process.argv.slice(2));
    `;
    const module = pathToFileURL(join(repoRoot, 'packages/cli/dist/cli.js')).href;
    const choices = [...options.choices];
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--input-type=module', '--eval', script, module, ...args],
        {
          env: {
            ...env,
            CI: options.env?.['CI'] ?? 'false',
            TERM: 'xterm',
            AGENT_SKILLS_NO_UPDATE_NOTIFIER: '0',
          },
          cwd: options.cwd ?? options.home,
          windowsHide: true,
        },
      );
      let stdout = '';
      let stderr = '';
      let pending = '';
      let unexpectedMenu = false;
      let redraws = 0;
      const marker = 'Esc to continue.';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Interactive CLI timed out:\n${stderr}`));
      }, 10_000);
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
        pending += String(chunk);
        let index;
        while ((index = pending.indexOf(marker)) !== -1) {
          pending = pending.slice(index + marker.length);
          if (redraws > 0) {
            redraws--;
            continue;
          }
          const choice = choices.shift();
          if (choice === undefined) {
            unexpectedMenu = true;
            child.stdin.end();
          } else {
            redraws = 1;
            child.stdin.write(`${choice}\r`);
          }
        }
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.stdin.on('error', () => {});
      child.on('close', (code) => {
        clearTimeout(timer);
        if (unexpectedMenu || choices.length > 0)
          reject(new Error(`Unexpected interactive menus:\n${stderr}`));
        else resolve({ code: code ?? 1, stdout, stderr });
      });
    });
  }

  try {
    const { stdout, stderr } = await run(process.execPath, [bin, ...args], {
      env,
      cwd: options.cwd ?? options.home,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

let root: string;
let home: string;
let registry: string;
let project: string;

const SKILL_MD = `---
name: demo-skill
description: A demonstration skill used by the CLI end-to-end tests. Use it when exercising the CLI.
---

# Demo skill

A body long enough to satisfy the minimum-content validation rule.
`;

function manifest(version: string, extra = ''): string {
  return `schemaVersion: 1
name: demo-skill
version: ${version}
description: A demonstration skill used by the CLI end-to-end tests. Use it when exercising the CLI.
license: Apache-2.0
keywords: [demo, testing]
files:
  - SKILL.md
  - skill.yaml
${extra}`;
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'agent-skills-cli-'));
  home = join(root, 'home');
  registry = join(root, 'registry');
  project = join(root, 'project');

  await mkdir(join(home, '.claude'), { recursive: true });
  await mkdir(join(home, '.codex'), { recursive: true });
  await mkdir(join(project, '.git'), { recursive: true });
  await writeFile(join(project, '.git', 'HEAD'), 'ref: refs/heads/main\n');

  // Two published versions, so update has a real decision to make.
  for (const [dir, version] of [
    ['demo-skill', '1.1.0'],
    ['demo-skill-1.0.0', '1.0.0'],
  ] as const) {
    await mkdir(join(registry, 'skills', dir), { recursive: true });
    await writeFile(join(registry, 'skills', dir, 'SKILL.md'), SKILL_MD);
    await writeFile(join(registry, 'skills', dir, 'skill.yaml'), manifest(version));
  }

  await mkdir(join(registry, 'registry'), { recursive: true });
  await writeFile(
    join(registry, 'registry', 'skills.yaml'),
    `schemaVersion: 1
name: test
skills:
  - name: demo-skill
    description: A demonstration skill used by the CLI end-to-end tests.
    keywords: [demo, testing]
    latest: 1.1.0
    versions:
      - version: 1.1.0
        path: skills/demo-skill
      - version: 1.0.0
        path: skills/demo-skill-1.0.0
`,
  );

  const added = await cli(['registry', 'add', 'test', registry, '--kind', 'local'], { home });
  assert.equal(added.code, 0, added.stderr);
  const removed = await cli(['registry', 'remove', 'official'], { home });
  assert.equal(removed.code, 0, removed.stderr);
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('cli basics', () => {
  it('prints help and exits 0', async () => {
    const result = await cli(['--help'], { home });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /agent-skills install/);
  });

  it('prints its version', async () => {
    const result = await cli(['--version'], { home });
    assert.equal(result.code, 0);
    assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
  });

  it('exits 2 on a usage error', async () => {
    const result = await cli(['install'], { home });
    assert.equal(result.code, 2);
  });

  it('reports an unknown skill with a resolution exit code', async () => {
    const result = await cli(['install', 'nothing-here', '--global'], { home });
    assert.equal(result.code, 4);
    assert.match(result.stderr, /ASK_SKILL_NOT_FOUND/);
  });

  it('rejects --global together with --project', async () => {
    const result = await cli(['install', 'demo-skill', '--global', '--project'], { home });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /ASK_USAGE/);
  });
});

describe('interactive update notifications', () => {
  async function installedHome() {
    const isolated = await mkdtemp(join(root, 'notifications-'));
    await mkdir(join(isolated, '.claude'), { recursive: true });
    await mkdir(join(isolated, '.agent-skills'), { recursive: true });
    await writeFile(
      join(isolated, '.agent-skills/config.json'),
      JSON.stringify({
        schemaVersion: 1,
        registries: [{ name: 'test', kind: 'local', url: registry, trusted: true }],
      }),
    );
    const installed = await cli(['install', 'demo-skill@1.0.0', '--global', '--json'], {
      home: isolated,
    });
    assert.equal(installed.code, 0, installed.stderr);
    const pkg = JSON.parse(await readFile(join(repoRoot, 'packages/cli/package.json'), 'utf8')) as {
      version: string;
    };
    const statePath = join(isolated, '.agent-skills/updates.json');
    const state = JSON.stringify({
      schemaVersion: 1,
      checks: { tool: { checkedAt: Date.now(), versions: [pkg.version] } },
      dismissed: [],
      deferred: {},
    });
    await writeFile(statePath, state);
    return { isolated, statePath, state };
  }

  it('offers a startup menu, persists later, and continues the original command', async () => {
    const { isolated, statePath } = await installedHome();
    const first = await cli(['list', '--global'], { home: isolated, choices: [3] });
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stderr, /Skill updates available/);
    assert.match(first.stdout, /demo-skill/);
    const state = JSON.parse(await readFile(statePath, 'utf8')) as {
      deferred: Record<string, number>;
    };
    assert.equal(Object.keys(state.deferred).length, 1);
    assert.ok(Object.values(state.deferred)[0]! > Date.now());
    const second = await cli(['list', '--global'], { home: isolated, choices: [] });
    assert.equal(second.code, 0, second.stderr);
    assert.doesNotMatch(second.stderr, /Skill updates available/);
  });

  it('updates through the real installer after selection and then lists the new version', async () => {
    const { isolated } = await installedHome();
    const result = await cli(['list', '--global'], { home: isolated, choices: [1] });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /upgraded: demo-skill@1.1.0/);
    assert.match(result.stdout, /1.1.0/);
    const installed = await readFile(
      join(isolated, '.claude/skills/demo-skill/skill.yaml'),
      'utf8',
    );
    assert.match(installed, /version: 1.1.0/);
  });

  it('preserves locally modified files when Update now is selected', async () => {
    const { isolated } = await installedHome();
    const skillPath = join(isolated, '.claude/skills/demo-skill/SKILL.md');
    const modified = `${await readFile(skillPath, 'utf8')}\nMy local instructions\n`;
    await writeFile(skillPath, modified);
    const result = await cli(['list', '--global'], { home: isolated, choices: [1] });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /modified/i);
    assert.equal(await readFile(skillPath, 'utf8'), modified);
    assert.match(
      await readFile(join(isolated, '.claude/skills/demo-skill/skill.yaml'), 'utf8'),
      /version: 1.0.0/,
    );
  });

  it('updates only the requested project and records its lockfile', async () => {
    const { isolated } = await installedHome();
    const projectRoot = join(isolated, 'project');
    await mkdir(join(projectRoot, '.git'), { recursive: true });
    const installed = await cli(
      ['install', 'demo-skill@1.0.0', '--project-root', projectRoot, '--json'],
      { home: isolated },
    );
    assert.equal(installed.code, 0, installed.stderr);
    const updated = await cli(['list', '--project-root', projectRoot, '--agent', 'claude'], {
      home: isolated,
      choices: [1],
    });
    assert.equal(updated.code, 0, updated.stderr);
    assert.match(await readFile(join(projectRoot, 'skills.lock'), 'utf8'), /version: 1.1.0/);
    assert.match(
      await readFile(join(projectRoot, '.claude/skills/demo-skill/skill.yaml'), 'utf8'),
      /version: 1.1.0/,
    );
    assert.match(
      await readFile(join(isolated, '.claude/skills/demo-skill/skill.yaml'), 'utf8'),
      /version: 1.0.0/,
    );
  });

  it('offers the CLI release before skills and persists its dismissal', async () => {
    const { isolated, statePath } = await installedHome();
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.checks.tool.versions = ['999.0.0'];
    await writeFile(statePath, JSON.stringify(state));
    // This executable runs from source, so the tool update is manual (later/skip).
    const result = await cli(['list', '--global'], { home: isolated, choices: [2, 3] });
    assert.equal(result.code, 0, result.stderr);
    assert.ok(
      result.stderr.indexOf('Update available for agent-skills!') <
        result.stderr.indexOf('Skill updates available'),
    );
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as { dismissed: string[] };
    assert.ok(saved.dismissed.includes(JSON.stringify(['tool', '999.0.0'])));
  });

  it('skips a version across invocations and leaves JSON and opt-out runs without checks', async () => {
    const { isolated, statePath, state } = await installedHome();
    for (const args of [
      ['list', '--json'],
      ['list', '--no-update-check'],
      ['list', '--quiet'],
    ]) {
      const result = await cli(args, { home: isolated, choices: [] });
      assert.equal(result.code, 0, result.stderr);
      assert.equal(await readFile(statePath, 'utf8'), state);
      if (args.includes('--json')) assert.ok(JSON.parse(result.stdout));
    }
    const skipped = await cli(['list', '--global'], { home: isolated, choices: [4] });
    assert.equal(skipped.code, 0, skipped.stderr);
    const persisted = JSON.parse(await readFile(statePath, 'utf8')) as { dismissed: string[] };
    assert.equal(persisted.dismissed.length, 1);
    const next = await cli(['list', '--global'], { home: isolated, choices: [] });
    assert.equal(next.code, 0, next.stderr);
  });
});

describe('agent detection', () => {
  it('detects the agents whose config directories exist', async () => {
    const result = await cli(['agents'], { home });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Claude Code detected/);
    assert.match(result.stdout, /Codex detected/);
  });

  it('reports no agents, and how to proceed, when none are present', async () => {
    const empty = join(root, 'empty-home');
    await mkdir(empty, { recursive: true });
    const result = await cli(['agents'], { home: empty });
    assert.match(result.stdout, /No supported coding agents detected/);
    assert.match(result.stdout, /Use --agent to explicitly select an agent/);
  });

  it('exits 6 when installing with no agent detected', async () => {
    const empty = join(root, 'empty-home-2');
    await mkdir(empty, { recursive: true });
    await cli(['registry', 'add', 'test', registry, '--kind', 'local'], { home: empty });
    const result = await cli(['install', 'demo-skill', '--global'], { home: empty });
    assert.equal(result.code, 6);
    assert.match(result.stderr, /ASK_NO_AGENT_DETECTED/);
  });
});

describe('registry management', () => {
  it('lists registries in precedence order', async () => {
    const result = await cli(['registry', 'list', '--json'], { home });
    const parsed = JSON.parse(result.stdout) as { name: string }[];
    assert.deepEqual(
      parsed.map((entry) => entry.name),
      ['test'],
    );
  });

  it('refuses a duplicate registry name', async () => {
    const result = await cli(['registry', 'add', 'test', registry], { home });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /ASK_REGISTRY_DUPLICATE/);
  });

  it('refuses to remove a registry that does not exist', async () => {
    const result = await cli(['registry', 'remove', 'nope'], { home });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /ASK_REGISTRY_NOT_FOUND/);
  });
});

describe('search, info and the global lifecycle', () => {
  it('searches', async () => {
    const result = await cli(['search', 'demo', '--json'], { home });
    const parsed = JSON.parse(result.stdout) as { name: string; latest: string }[];
    assert.equal(parsed[0]!.name, 'demo-skill');
    assert.equal(parsed[0]!.latest, '1.1.0');
  });

  it('installs into both agents by default', async () => {
    const result = await cli(['install', 'demo-skill@1.0.0', '--global', '--json'], { home });
    assert.equal(result.code, 0, result.stderr);

    const parsed = JSON.parse(result.stdout) as {
      installed: { agent: string; directory: string }[];
    };
    assert.deepEqual(parsed.installed.map((entry) => entry.agent).sort(), ['claude-code', 'codex']);

    // Claude gets no vendor metadata file; Codex does.
    await readFile(join(home, '.claude', 'skills', 'demo-skill', 'SKILL.md'), 'utf8');
    await readFile(join(home, '.codex', 'skills', 'demo-skill', 'agents', 'openai.yaml'), 'utf8');
    await assert.rejects(() =>
      readFile(join(home, '.claude', 'skills', 'demo-skill', 'agents', 'openai.yaml'), 'utf8'),
    );
  });

  it('lists what it installed', async () => {
    const result = await cli(['list', '--json'], { home });
    const parsed = JSON.parse(result.stdout) as {
      entries: { agent: string; scope: string; skills: { name: string; version: string }[] }[];
    };
    const claude = parsed.entries.find(
      (entry) => entry.agent === 'claude-code' && entry.scope === 'global',
    );
    assert.deepEqual(
      claude!.skills.map((skill) => skill.name),
      ['demo-skill'],
    );
    assert.equal(claude!.skills[0]!.version, '1.0.0');
  });

  it('shows metadata and install state', async () => {
    const result = await cli(['info', 'demo-skill', '--json'], { home });
    const parsed = JSON.parse(result.stdout) as {
      versions: { version: string }[];
      installed: { agentId: string }[];
    };
    assert.deepEqual(
      parsed.versions.map((entry) => entry.version),
      ['1.1.0', '1.0.0'],
    );
    assert.equal(parsed.installed.length, 2);
  });

  it('updates to the newest compatible version', async () => {
    const result = await cli(['update', 'demo-skill', '--global', '--json'], { home });
    assert.equal(result.code, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as {
      changes: { name: string; from: string; to: string; bump: string; skipped: boolean }[];
    };
    assert.deepEqual(
      parsed.changes.map(({ name, from, to, bump, skipped }) => ({
        name,
        from,
        to,
        bump,
        skipped,
      })),
      [{ name: 'demo-skill', from: '1.0.0', to: '1.1.0', bump: 'minor', skipped: false }],
    );
  });

  it('reports a healthy system', async () => {
    const result = await cli(['doctor', '--json'], { home });
    const parsed = JSON.parse(result.stdout) as { ok: boolean; failures: number };
    assert.equal(parsed.ok, true);
    assert.equal(parsed.failures, 0);
  });

  it('uninstalls from both agents', async () => {
    const result = await cli(['uninstall', 'demo-skill', '--global', '--json'], { home });
    assert.equal(result.code, 0, result.stderr);

    await assert.rejects(() =>
      readFile(join(home, '.claude', 'skills', 'demo-skill', 'SKILL.md'), 'utf8'),
    );
    await assert.rejects(() =>
      readFile(join(home, '.codex', 'skills', 'demo-skill', 'SKILL.md'), 'utf8'),
    );
  });

  it('fails when uninstalling something that is not installed', async () => {
    const result = await cli(['uninstall', 'demo-skill', '--global'], { home });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /ASK_NOT_INSTALLED/);
  });
});

describe('per-agent installs', () => {
  it('installs only into Claude Code', async () => {
    const result = await cli(['install', 'demo-skill', '--agent', 'claude', '--global', '--json'], {
      home,
    });
    const parsed = JSON.parse(result.stdout) as { installed: { agent: string }[] };
    assert.deepEqual(
      parsed.installed.map((entry) => entry.agent),
      ['claude-code'],
    );
    await readFile(join(home, '.claude', 'skills', 'demo-skill', 'SKILL.md'), 'utf8');
  });

  it('installs only into Codex', async () => {
    const result = await cli(['install', 'demo-skill', '--agent', 'codex', '--global', '--json'], {
      home,
    });
    const parsed = JSON.parse(result.stdout) as { installed: { agent: string }[] };
    assert.deepEqual(
      parsed.installed.map((entry) => entry.agent),
      ['codex'],
    );
  });

  it('rejects an unknown agent and lists the known ones', async () => {
    const result = await cli(['install', 'demo-skill', '--agent', 'cursor', '--global'], { home });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /ASK_UNKNOWN_AGENT/);
    assert.match(result.stderr, /claude-code/);
  });
});

describe('project scope', () => {
  it('installs into the project and writes a lockfile', async () => {
    const result = await cli(['install', 'demo-skill', '--project', '--agent', 'all', '--json'], {
      home,
      cwd: project,
    });
    assert.equal(result.code, 0, result.stderr);

    await readFile(join(project, '.claude', 'skills', 'demo-skill', 'SKILL.md'), 'utf8');
    await readFile(join(project, '.agents', 'skills', 'demo-skill', 'SKILL.md'), 'utf8');

    const lock = await readFile(join(project, 'skills.lock'), 'utf8');
    assert.match(lock, /lockfileVersion: 1/);
    assert.match(lock, /demo-skill:/);
    assert.match(lock, /integrity: sha256-/);
  });

  it('reinstalls the locked version even though a newer one exists', async () => {
    // Downgrade the lock, then a bare install must honour it rather than resolving to latest.
    const lockPath = join(project, 'skills.lock');
    const lock = await readFile(lockPath, 'utf8');
    await writeFile(lockPath, lock.replace('version: 1.1.0', 'version: 1.0.0'));

    const result = await cli(['install', 'demo-skill', '--project', '--agent', 'all', '--json'], {
      home,
      cwd: project,
    });
    // The integrity in the lockfile no longer matches 1.0.0's content, which is exactly the
    // tamper signal the lockfile exists to raise.
    assert.equal(result.code, 5);
    assert.match(result.stderr, /ASK_LOCKFILE_MISMATCH/);
  });

  it('removes project installs and prunes the lockfile', async () => {
    await rm(join(project, 'skills.lock'), { force: true });
    await cli(['install', 'demo-skill', '--project', '--agent', 'all'], { home, cwd: project });

    const result = await cli(['uninstall', 'demo-skill', '--project', '--agent', 'all', '--json'], {
      home,
      cwd: project,
    });
    assert.equal(result.code, 0, result.stderr);

    const lock = await readFile(join(project, 'skills.lock'), 'utf8');
    assert.doesNotMatch(lock, /demo-skill:/);
  });
});

describe('authoring workflow', () => {
  it('creates, validates and publishes a skill', async () => {
    const workspace = join(root, 'author');
    await mkdir(workspace, { recursive: true });

    const created = await cli(['create', 'my-new-skill', '--json'], { home, cwd: workspace });
    assert.equal(created.code, 0, created.stderr);

    const validated = await cli(['validate', 'my-new-skill', '--json'], { home, cwd: workspace });
    assert.equal(validated.code, 0, validated.stdout);
    const report = JSON.parse(validated.stdout) as { ok: boolean; name: string };
    assert.equal(report.ok, true);
    assert.equal(report.name, 'my-new-skill');

    const published = await cli(['publish', 'my-new-skill', '--json'], { home, cwd: workspace });
    assert.equal(published.code, 0, published.stderr);
    const publishReport = JSON.parse(published.stdout) as { integrity: string; version: string };
    assert.match(publishReport.integrity, /^sha256-/);
    assert.equal(publishReport.version, '0.1.0');
  });

  it('exits 3 for an invalid package', async () => {
    const broken = join(root, 'broken', 'bad-skill');
    await mkdir(broken, { recursive: true });
    await writeFile(
      join(broken, 'SKILL.md'),
      '---\nname: other-name\ndescription: x\n---\n\nBody\n',
    );
    await writeFile(
      join(broken, 'skill.yaml'),
      manifest('1.0.0').replace('demo-skill', 'bad-skill'),
    );

    const result = await cli(['validate', broken, '--json'], { home });
    assert.equal(result.code, 3);
    const report = JSON.parse(result.stdout) as { ok: boolean; issues: { rule: string }[] };
    assert.equal(report.ok, false);
    assert.ok(report.issues.some((issue) => issue.rule === 'skill.name.mismatch'));
  });

  it('refuses to create over an existing directory', async () => {
    const workspace = join(root, 'author');
    const result = await cli(['create', 'my-new-skill'], { home, cwd: workspace });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /ASK_USAGE/);
  });
});

describe('dry run', () => {
  it('writes nothing', async () => {
    const clean = join(root, 'dry-home');
    await mkdir(join(clean, '.claude'), { recursive: true });
    await cli(['registry', 'add', 'test', registry, '--kind', 'local'], { home: clean });

    const result = await cli(['install', 'demo-skill', '--global', '--dry-run', '--json'], {
      home: clean,
    });
    assert.equal(result.code, 0, result.stderr);

    const parsed = JSON.parse(result.stdout) as { dryRun: boolean };
    assert.equal(parsed.dryRun, true);
    await assert.rejects(() =>
      readFile(join(clean, '.claude', 'skills', 'demo-skill', 'SKILL.md'), 'utf8'),
    );
  });
});

describe('direct suggestions', () => {
  interface FixtureSkill {
    readonly name: string;
    readonly version?: string;
    readonly suggests?: readonly string[];
    readonly dependencies?: readonly string[];
    readonly kind?: 'command';
    readonly agents?: readonly string[];
    readonly integrity?: string;
  }

  interface Addition {
    name: string;
    version: string;
    registry: string;
    suggestedBy: string[];
    skipped: boolean;
    results: { agent: string; scope: string; directory: string; outcome: string }[];
  }

  const skills: readonly FixtureSkill[] = [
    { name: 'suggest-root', suggests: ['companion'], dependencies: ['root-dependency'] },
    { name: 'root-dependency', suggests: ['dependency-suggestion'] },
    { name: 'companion', suggests: ['nested-suggestion'], dependencies: ['prerequisite'] },
    { name: 'prerequisite' },
    { name: 'dependency-suggestion' },
    { name: 'nested-suggestion' },
  ];

  async function fixture(packages: readonly FixtureSkill[] = skills) {
    const isolated = await mkdtemp(join(root, 'suggestions-'));
    const fixtureHome = join(isolated, 'home');
    const fixtureRegistry = join(isolated, 'registry');
    const fixtureProject = join(isolated, 'project');
    await mkdir(join(fixtureHome, '.claude'), { recursive: true });
    await mkdir(join(fixtureHome, '.codex'), { recursive: true });
    await mkdir(join(fixtureHome, '.agent-skills'), { recursive: true });
    await mkdir(join(fixtureProject, '.git'), { recursive: true });
    await writeFile(join(fixtureProject, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await writeFile(
      join(fixtureHome, '.agent-skills', 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        registries: [{ name: 'suggestions', kind: 'local', url: fixtureRegistry, trusted: true }],
      }),
    );
    for (const skill of packages) {
      const version = skill.version ?? '1.0.0';
      const directory = join(fixtureRegistry, 'skills', `${skill.name}-${version}`);
      const entrypoint = skill.kind === 'command' ? 'COMMAND.md' : 'SKILL.md';
      const metadata = [
        ...(skill.kind === undefined ? [] : [`kind: ${skill.kind}`]),
        `suggests: ${JSON.stringify(skill.suggests ?? [])}`,
        `dependencies: ${JSON.stringify(
          (skill.dependencies ?? []).map((name) => ({ name, version: '^1.0.0' })),
        )}`,
        ...(skill.agents === undefined
          ? []
          : [`compatibility: ${JSON.stringify({ agents: skill.agents.map((id) => ({ id })) })}`]),
      ].join('\n');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, entrypoint), SKILL_MD.replaceAll('demo-skill', skill.name));
      await writeFile(
        join(directory, 'skill.yaml'),
        manifest(version, `${metadata}\n`)
          .replaceAll('demo-skill', skill.name)
          .replace('SKILL.md', entrypoint),
      );
    }
    await mkdir(join(fixtureRegistry, 'registry'), { recursive: true });
    await writeFile(
      join(fixtureRegistry, 'registry', 'skills.yaml'),
      JSON.stringify({
        schemaVersion: 1,
        name: 'suggestions',
        skills: [...new Set(packages.map((skill) => skill.name))].map((name) => {
          const versions = packages.filter((skill) => skill.name === name);
          return {
            name,
            description: 'Fixture for direct suggestions.',
            latest: versions.at(-1)!.version ?? '1.0.0',
            versions: versions.map((skill) => ({
              version: skill.version ?? '1.0.0',
              path: `skills/${skill.name}-${skill.version ?? '1.0.0'}`,
              ...(skill.integrity === undefined ? {} : { integrity: skill.integrity }),
            })),
          };
        }),
      }),
    );
    return { home: fixtureHome, cwd: fixtureProject };
  }

  it('keeps suggestions opt-in, then installs only direct suggestions and real prerequisites', async () => {
    const environment = await fixture();
    const initial = await cli(
      ['install', 'suggest-root', '--project', '--agent', 'claude', '--json'],
      environment,
    );
    assert.equal(initial.code, 0, initial.stderr);
    const initialReport = JSON.parse(initial.stdout) as { resolved: { name: string }[] };
    assert.deepEqual(initialReport.resolved.map((skill) => skill.name).sort(), [
      'root-dependency',
      'suggest-root',
    ]);

    const expanded = await cli(
      ['install', 'suggest-root', '--with-suggests', '--project', '--agent', 'claude', '--json'],
      environment,
    );
    assert.equal(expanded.code, 0, expanded.stderr);
    const report = JSON.parse(expanded.stdout) as {
      resolved: { name: string; direct: boolean; suggestedBy: string[]; requiredBy: string[] }[];
      installed: { name: string; agent: string }[];
    };
    assert.deepEqual(report.resolved.map((skill) => skill.name).sort(), [
      'companion',
      'prerequisite',
      'root-dependency',
      'suggest-root',
    ]);
    assert.equal(report.resolved.find((skill) => skill.name === 'suggest-root')!.direct, true);
    const companion = report.resolved.find((skill) => skill.name === 'companion')!;
    assert.equal(companion.direct, false);
    assert.deepEqual(companion.suggestedBy, ['suggest-root']);
    assert.deepEqual(companion.requiredBy, []);
    const prerequisite = report.resolved.find((skill) => skill.name === 'prerequisite')!;
    assert.deepEqual(prerequisite.suggestedBy, []);
    assert.deepEqual(prerequisite.requiredBy, ['companion@1.0.0']);
    assert.ok(report.installed.every((skill) => skill.agent === 'claude-code'));
    await assert.rejects(() =>
      readFile(join(environment.cwd, '.agents', 'skills', 'companion', 'SKILL.md')),
    );
  });

  it('deduplicates suggestions from explicit roots and presents their provenance', async () => {
    const environment = await fixture([
      ...skills,
      { name: 'second-root', suggests: ['companion'] },
    ]);
    const result = await cli(
      [
        'install',
        'suggest-root',
        'second-root',
        '--with-suggests',
        '--global',
        '--agent',
        'claude',
        '--json',
      ],
      environment,
    );
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      resolved: { name: string; suggestedBy: string[] }[];
      installed: { name: string }[];
    };
    assert.deepEqual(
      report.resolved.find((skill) => skill.name === 'companion')!.suggestedBy.toSorted(),
      ['second-root', 'suggest-root'],
    );
    assert.equal(report.installed.filter((skill) => skill.name === 'companion').length, 1);
    const text = await cli(
      ['install', 'suggest-root', '--with-suggests', '--global', '--agent', 'claude', '--dry-run'],
      environment,
    );
    assert.equal(text.code, 0, text.stderr);
    assert.match(text.stdout, /companion[^\n]*suggested by suggest-root/);
    assert.match(text.stdout, /prerequisite[^\n]*dependency/);
  });

  it('reports additions for a same-version update without inventing dependency edges', async () => {
    const environment = await fixture();
    const installed = await cli(
      ['install', 'suggest-root', '--project', '--agent', 'claude'],
      environment,
    );
    assert.equal(installed.code, 0, installed.stderr);
    const updated = await cli(
      ['update', 'suggest-root', '--with-suggests', '--project', '--agent', 'claude', '--json'],
      environment,
    );
    assert.equal(updated.code, 0, updated.stderr);
    const report = JSON.parse(updated.stdout) as { additions: Addition[] };
    assert.deepEqual(report.additions.map((skill) => skill.name).sort(), [
      'companion',
      'prerequisite',
    ]);
    const companion = report.additions.find((skill) => skill.name === 'companion')!;
    assert.equal(companion.version, '1.0.0');
    assert.equal(companion.registry, 'suggestions');
    assert.deepEqual(companion.suggestedBy, ['suggest-root']);
    assert.equal(companion.skipped, false);
    assert.equal(companion.results.length, 1);
    assert.equal(companion.results[0]!.agent, 'claude-code');
    assert.equal(companion.results[0]!.scope, 'project');
    assert.equal(companion.results[0]!.outcome, 'installed');
    assert.equal(
      companion.results[0]!.directory,
      join(environment.cwd, '.claude', 'skills', 'companion'),
    );
    for (const [name, dependencyOf] of [
      ['companion', []],
      ['prerequisite', ['companion@1.0.0']],
    ] as const) {
      const receipt = JSON.parse(
        await readFile(
          join(environment.cwd, '.claude', 'skills', '.agent-skills', 'receipts', `${name}.json`),
          'utf8',
        ),
      ) as { dependencyOf: string[] };
      assert.deepEqual(receipt.dependencyOf, dependencyOf);
    }

    const ordinaryUpdate = await cli(
      ['update', '--project', '--agent', 'claude', '--json'],
      environment,
    );
    assert.equal(ordinaryUpdate.code, 0, ordinaryUpdate.stderr);
    await assert.rejects(() =>
      readFile(join(environment.cwd, '.claude', 'skills', 'nested-suggestion', 'SKILL.md')),
    );
  });

  it('shows additions-only update plans without changing the project lock or receipts', async () => {
    const environment = await fixture();
    const installed = await cli(
      ['install', 'suggest-root', '--project', '--agent', 'claude'],
      environment,
    );
    assert.equal(installed.code, 0, installed.stderr);
    const lockPath = join(environment.cwd, 'skills.lock');
    const receiptPath = join(
      environment.cwd,
      '.claude',
      'skills',
      '.agent-skills',
      'receipts',
      'suggest-root.json',
    );
    const lockBefore = await readFile(lockPath, 'utf8');
    const receiptBefore = await readFile(receiptPath, 'utf8');
    const args = ['update', 'suggest-root', '--with-suggests', '--project', '--agent', 'claude'];
    const planned = await cli([...args, '--dry-run'], environment);
    assert.equal(planned.code, 0, planned.stderr);
    assert.match(planned.stdout, /Dry run.*update plan/);
    assert.match(planned.stdout, /companion[^\n]*would add; suggested by suggest-root/);
    assert.doesNotMatch(planned.stdout, /Up to date/);
    const jsonPlan = await cli([...args, '--dry-run', '--json'], environment);
    assert.equal(jsonPlan.code, 0, jsonPlan.stderr);
    const report = JSON.parse(jsonPlan.stdout) as { dryRun: boolean; additions: Addition[] };
    assert.equal(report.dryRun, true);
    assert.deepEqual(report.additions.map((skill) => skill.name).sort(), [
      'companion',
      'prerequisite',
    ]);
    assert.equal(await readFile(lockPath, 'utf8'), lockBefore);
    assert.equal(await readFile(receiptPath, 'utf8'), receiptBefore);
    for (const name of ['companion', 'prerequisite']) {
      await assert.rejects(() =>
        readFile(join(environment.cwd, '.claude', 'skills', name, 'SKILL.md')),
      );
      await assert.rejects(() =>
        readFile(
          join(environment.cwd, '.claude', 'skills', '.agent-skills', 'receipts', `${name}.json`),
        ),
      );
    }
    const executed = await cli(args, environment);
    assert.equal(executed.code, 0, executed.stderr);
    assert.match(executed.stdout, /Additional skills/);
    assert.match(executed.stdout, /companion[^\n]*added; suggested by suggest-root/);
    assert.match(executed.stdout, /prerequisite[^\n]*added; dependency/);
    assert.doesNotMatch(executed.stdout, /Up to date/);
  });

  it('rejects incompatible flags and unnamed updates with actionable usage errors', async () => {
    const environment = await fixture();
    const noDependencies = await cli(
      ['install', 'suggest-root', '--with-suggests', '--no-deps', '--global'],
      environment,
    );
    assert.equal(noDependencies.code, 2, noDependencies.stderr);
    assert.match(noDependencies.stderr, /ASK_USAGE/);
    assert.match(noDependencies.stderr, /--no-deps/);
    const unnamed = await cli(['update', '--with-suggests', '--global'], environment);
    assert.equal(unnamed.code, 2, unnamed.stderr);
    assert.match(unnamed.stderr, /ASK_USAGE/);
    assert.match(unnamed.stderr, /update <skill> --with-suggests/);
  });

  it('reports unsupported and incompatible suggested packages as skipped additions', async () => {
    const environment = await fixture([
      { name: 'suggest-root', suggests: ['claude-command', 'claude-skill'] },
      { name: 'claude-command', kind: 'command', agents: ['claude-code'] },
      { name: 'claude-skill', agents: ['claude-code'] },
    ]);
    const installed = await cli(
      ['install', 'suggest-root', '--project', '--agent', 'codex'],
      environment,
    );
    assert.equal(installed.code, 0, installed.stderr);
    const args = ['update', 'suggest-root', '--with-suggests', '--project', '--agent', 'codex'];
    const result = await cli([...args, '--json'], environment);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout) as { additions: Addition[] };
    assert.deepEqual(report.additions.map((skill) => skill.name).sort(), [
      'claude-command',
      'claude-skill',
    ]);
    for (const skill of report.additions) {
      assert.equal(skill.skipped, true);
      assert.deepEqual(skill.results, []);
      assert.deepEqual(skill.suggestedBy, ['suggest-root']);
    }
    const text = await cli([...args, '--dry-run'], environment);
    assert.equal(text.code, 0, text.stderr);
    assert.match(text.stdout, /claude-command[^\n]*skipped; suggested by suggest-root/);
    assert.match(text.stdout, /claude-skill[^\n]*skipped; suggested by suggest-root/);
    assert.doesNotMatch(text.stdout, /\(added;|\(would add;/);
    await assert.rejects(() =>
      readFile(join(environment.cwd, '.agents', 'skills', 'claude-skill', 'SKILL.md')),
    );
    await assert.rejects(() =>
      readFile(join(environment.cwd, '.claude', 'commands', 'claude-command.md')),
    );
  });

  it('does not claim an update when an existing companion becomes incompatible', async () => {
    const environment = await fixture([
      { name: 'suggest-root', suggests: ['companion'] },
      { name: 'companion', version: '1.0.0', agents: ['claude-code'] },
      { name: 'companion', version: '1.1.0', agents: ['codex'] },
    ]);
    const installed = await cli(
      ['install', 'suggest-root', 'companion@1.0.0', '--global', '--agent', 'claude'],
      environment,
    );
    assert.equal(installed.code, 0, installed.stderr);
    const args = ['update', 'suggest-root', '--with-suggests', '--global', '--agent', 'claude'];
    const text = await cli(args, environment);
    assert.equal(text.code, 0, text.stderr);
    assert.match(text.stdout, /companion[^\n]*skipped; minor; suggested by suggest-root/);
    assert.doesNotMatch(text.stdout, /Updated/);
    const result = await cli([...args, '--json'], environment);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      changes: {
        name: string;
        from: string;
        to: string;
        bump: string;
        registry: string;
        suggestedBy: string[];
        skipped: boolean;
        results: unknown[];
      }[];
    };
    const companion = report.changes.find((change) => change.name === 'companion')!;
    assert.equal(companion.from, '1.0.0');
    assert.equal(companion.to, '1.1.0');
    assert.equal(companion.bump, 'minor');
    assert.equal(companion.registry, 'suggestions');
    assert.deepEqual(companion.suggestedBy, ['suggest-root']);
    assert.equal(companion.skipped, true);
    assert.deepEqual(companion.results, []);
    assert.match(
      await readFile(
        join(environment.home, '.claude', 'skills', 'companion', 'skill.yaml'),
        'utf8',
      ),
      /version: 1.0.0/,
    );
  });

  it('reports a companion added to another agent even when its version is unchanged', async () => {
    const environment = await fixture([
      { name: 'suggest-root', suggests: ['companion'] },
      { name: 'companion' },
    ]);
    const installed = await cli(
      ['install', 'suggest-root', '--with-suggests', '--global', '--agent', 'claude'],
      environment,
    );
    assert.equal(installed.code, 0, installed.stderr);
    const args = ['update', 'suggest-root', '--with-suggests', '--global', '--agent', 'all'];
    const planned = await cli([...args, '--dry-run'], environment);
    assert.equal(planned.code, 0, planned.stderr);
    assert.match(planned.stdout, /companion[^\n]*would add; suggested by suggest-root/);
    assert.doesNotMatch(planned.stdout, /Up to date/);
    const updated = await cli([...args, '--json'], environment);
    assert.equal(updated.code, 0, updated.stderr);
    const report = JSON.parse(updated.stdout) as { additions: Addition[] };
    const companion = report.additions.find((addition) => addition.name === 'companion')!;
    assert.equal(companion.version, '1.0.0');
    assert.equal(companion.skipped, false);
    assert.deepEqual(
      companion.results.map((result) => result.agent),
      ['codex'],
    );
    assert.equal(companion.results[0]!.outcome, 'installed');
    assert.equal(
      companion.results[0]!.directory,
      join(environment.home, '.codex', 'skills', 'companion'),
    );
    await readFile(join(environment.home, '.codex', 'skills', 'companion', 'SKILL.md'), 'utf8');
  });

  it('rejects a suggested payload whose integrity differs from the registry index', async () => {
    const environment = await fixture([
      { name: 'suggest-root', suggests: ['tampered-companion'] },
      {
        name: 'tampered-companion',
        integrity: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      },
    ]);
    const result = await cli(
      ['install', 'suggest-root', '--with-suggests', '--global', '--agent', 'claude'],
      environment,
    );
    assert.equal(result.code, 5, result.stderr);
    assert.match(result.stderr, /ASK_INTEGRITY_MISMATCH/);
    await assert.rejects(() =>
      readFile(join(environment.home, '.claude', 'skills', 'tampered-companion', 'SKILL.md')),
    );
    await assert.rejects(() =>
      readFile(
        join(
          environment.home,
          '.claude',
          'skills',
          '.agent-skills',
          'receipts',
          'tampered-companion.json',
        ),
      ),
    );
  });

  it('preserves local edits in a suggested skill when an update attempts to include it', async () => {
    const environment = await fixture();
    const installed = await cli(
      ['install', 'suggest-root', '--with-suggests', '--project', '--agent', 'claude'],
      environment,
    );
    assert.equal(installed.code, 0, installed.stderr);
    const file = join(environment.cwd, '.claude', 'skills', 'companion', 'SKILL.md');
    const modified = `${await readFile(file, 'utf8')}\nKeep my local instructions.\n`;
    await writeFile(file, modified);
    const result = await cli(
      ['update', 'suggest-root', '--with-suggests', '--project', '--agent', 'claude'],
      environment,
    );
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stderr, /ASK_MODIFIED_INSTALL/);
    assert.equal(await readFile(file, 'utf8'), modified);
  });
});

describe('commands', () => {
  const COMMAND_MD = `---
name: ship-it
description: Opens a pull request for the current branch. Use it to hand work over for review.
argument-hint: "[reviewer]"
---

# Ship it

Open a pull request for the current branch and request a review from $ARGUMENTS.
`;

  let extras: string;

  before(async () => {
    extras = join(root, 'extras-registry');
    await mkdir(join(extras, 'commands', 'ship-it'), { recursive: true });
    await writeFile(join(extras, 'commands', 'ship-it', 'COMMAND.md'), COMMAND_MD);
    await writeFile(
      join(extras, 'commands', 'ship-it', 'skill.yaml'),
      `schemaVersion: 1
name: ship-it
kind: command
version: 1.0.0
description: Opens a pull request for the current branch. Use it to hand work over for review.
license: Apache-2.0
compatibility:
  agents:
    - id: claude-code
files:
  - COMMAND.md
  - skill.yaml
`,
    );

    await mkdir(join(extras, 'registry'), { recursive: true });
    await writeFile(
      join(extras, 'registry', 'skills.yaml'),
      `schemaVersion: 1
name: extras
skills:
  - name: ship-it
    description: Opens a pull request for the current branch.
    latest: 1.0.0
    versions:
      - version: 1.0.0
        path: commands/ship-it
`,
    );

    const added = await cli(['registry', 'add', 'extras', extras, '--kind', 'local'], { home });
    assert.equal(added.code, 0, added.stderr);
  });

  it('installs a command as a single file under .claude/commands', async () => {
    const result = await cli(['install', 'ship-it', '--agent', 'claude', '--global', '--json'], {
      home,
    });
    assert.equal(result.code, 0, result.stderr);

    const report = JSON.parse(result.stdout) as {
      installed: { agent: string; directory: string; files: string[] }[];
    };
    assert.equal(report.installed.length, 1);
    assert.equal(report.installed[0]!.directory, join(home, '.claude', 'commands', 'ship-it.md'));
    assert.deepEqual(report.installed[0]!.files, ['ship-it.md']);

    const installed = await readFile(join(home, '.claude', 'commands', 'ship-it.md'), 'utf8');
    assert.match(installed, /argument-hint/);
    assert.match(installed, /# Ship it/);
  });

  it('lists the command alongside skills', async () => {
    const result = await cli(['list', '--json'], { home });
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      entries: { root: string; skills: { name: string }[] }[];
    };
    const commandRoot = report.entries.find((entry) =>
      entry.root.endsWith(join('.claude', 'commands')),
    );
    assert.deepEqual(
      commandRoot?.skills.map((skill) => skill.name),
      ['ship-it'],
    );
  });

  it('installs nothing for an agent with no command directory', async () => {
    const result = await cli(['install', 'ship-it', '--agent', 'codex', '--global', '--json'], {
      home,
    });
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout) as { installed: unknown[]; warnings: string[] };
    assert.deepEqual(report.installed, []);
    assert.ok(
      report.warnings.some((warning) => warning.includes('command')),
      report.warnings.join(' | '),
    );
  });

  it('uninstalls the file it installed', async () => {
    const result = await cli(['uninstall', 'ship-it', '--global', '--json'], { home });
    assert.equal(result.code, 0, result.stderr);
    await assert.rejects(() => readFile(join(home, '.claude', 'commands', 'ship-it.md'), 'utf8'));
  });

  it('scaffolds a command package', async () => {
    const workspace = join(root, 'author-command');
    await mkdir(workspace, { recursive: true });

    const created = await cli(['create', 'my-command', '--kind', 'command', '--json'], {
      home,
      cwd: workspace,
    });
    assert.equal(created.code, 0, created.stderr);
    const report = JSON.parse(created.stdout) as { kind: string; files: string[] };
    assert.equal(report.kind, 'command');
    assert.deepEqual(report.files, ['COMMAND.md', 'skill.yaml']);

    const validated = await cli(['validate', 'my-command', '--json'], { home, cwd: workspace });
    assert.equal(validated.code, 0, validated.stdout);
  });

  it('rejects an unknown kind', async () => {
    const result = await cli(['create', 'nope', '--kind', 'hook'], { home, cwd: root });
    assert.equal(result.code, 2, result.stdout);
  });
});

describe('workflows', () => {
  const WORKFLOW_JS = `export const meta = {
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
`;

  let extras: string;

  before(async () => {
    extras = join(root, 'workflow-registry');
    await mkdir(join(extras, 'workflows', 'ship-review'), { recursive: true });
    await writeFile(join(extras, 'workflows', 'ship-review', 'WORKFLOW.js'), WORKFLOW_JS);
    await writeFile(
      join(extras, 'workflows', 'ship-review', 'skill.yaml'),
      `schemaVersion: 1
name: ship-review
kind: workflow
version: 1.0.0
description: Reviews the current branch before a pull request.
license: Apache-2.0
compatibility:
  agents:
    - id: claude-code
files:
  - WORKFLOW.js
  - skill.yaml
`,
    );

    await mkdir(join(extras, 'registry'), { recursive: true });
    await writeFile(
      join(extras, 'registry', 'skills.yaml'),
      `schemaVersion: 1
name: flows
skills:
  - name: ship-review
    description: Reviews the current branch before a pull request.
    latest: 1.0.0
    versions:
      - version: 1.0.0
        path: workflows/ship-review
`,
    );

    const added = await cli(['registry', 'add', 'flows', extras, '--kind', 'local'], { home });
    assert.equal(added.code, 0, added.stderr);
  });

  it('installs the script verbatim into .claude/workflows', async () => {
    const result = await cli(
      ['install', 'ship-review', '--agent', 'claude', '--global', '--json'],
      {
        home,
      },
    );
    assert.equal(result.code, 0, result.stderr);

    const report = JSON.parse(result.stdout) as {
      installed: { directory: string; files: string[] }[];
    };
    assert.equal(
      report.installed[0]!.directory,
      join(home, '.claude', 'workflows', 'ship-review.js'),
    );
    assert.deepEqual(report.installed[0]!.files, ['ship-review.js']);

    // Byte-for-byte: Claude Code compiles this, and `meta` must stay the first statement.
    const installed = await readFile(join(home, '.claude', 'workflows', 'ship-review.js'), 'utf8');
    assert.equal(installed, WORKFLOW_JS);
  });

  it('shows the workflow in its own root', async () => {
    const result = await cli(['list', '--json'], { home });
    const report = JSON.parse(result.stdout) as {
      entries: { root: string; kind: string; skills: { name: string }[] }[];
    };
    const workflows = report.entries.find((entry) => entry.kind === 'workflow');
    assert.deepEqual(
      workflows?.skills.map((skill) => skill.name),
      ['ship-review'],
    );
  });

  it('refuses a script Claude Code could not compile', async () => {
    const broken = join(root, 'broken-workflow', 'bad-flow');
    await mkdir(broken, { recursive: true });
    await writeFile(
      join(broken, 'WORKFLOW.js'),
      `export const meta = { name: 'bad-flow', description: 'Uses a forbidden call.' };\n\nlog(Date.now());\n`,
    );
    await writeFile(
      join(broken, 'skill.yaml'),
      `schemaVersion: 1
name: bad-flow
kind: workflow
version: 1.0.0
description: Uses a forbidden call and must not publish.
license: Apache-2.0
files:
  - WORKFLOW.js
  - skill.yaml
`,
    );

    const result = await cli(['validate', 'bad-flow'], { home, cwd: dirname(broken) });
    assert.equal(result.code, 3, result.stdout);
    assert.match(result.stdout + result.stderr, /deterministic/);
  });

  it('scaffolds a workflow that validates', async () => {
    const workspace = join(root, 'author-workflow');
    await mkdir(workspace, { recursive: true });

    const created = await cli(['create', 'my-flow', '--kind', 'workflow', '--json'], {
      home,
      cwd: workspace,
    });
    assert.equal(created.code, 0, created.stderr);
    const report = JSON.parse(created.stdout) as { kind: string; files: string[] };
    assert.equal(report.kind, 'workflow');
    assert.deepEqual(report.files, ['WORKFLOW.js', 'skill.yaml']);

    const validated = await cli(['validate', 'my-flow', '--json'], { home, cwd: workspace });
    assert.equal(validated.code, 0, validated.stdout);
  });

  it('uninstalls the script', async () => {
    const result = await cli(['uninstall', 'ship-review', '--global', '--json'], { home });
    assert.equal(result.code, 0, result.stderr);
    await assert.rejects(() =>
      readFile(join(home, '.claude', 'workflows', 'ship-review.js'), 'utf8'),
    );
  });
});
