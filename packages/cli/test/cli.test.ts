import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  options: { home: string; cwd?: string; env?: Record<string, string> } = { home: '' },
): Promise<CliResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AGENT_SKILLS_HOME: join(options.home, '.agent-skills'),
    CLAUDE_CONFIG_DIR: join(options.home, '.claude'),
    CODEX_HOME: join(options.home, '.codex'),
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
    const parsed = JSON.parse(result.stdout) as { changes: { from: string; to: string }[] };
    assert.deepEqual(parsed.changes, [
      { name: 'demo-skill', from: '1.0.0', to: '1.1.0', bump: 'minor' },
    ] as unknown);
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
