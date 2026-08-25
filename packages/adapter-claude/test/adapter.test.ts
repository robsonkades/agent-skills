import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';

import { decodeText, parseSkillDocument, type DetectionContext } from '@jvm-expert/core';
import {
  FakeCommandRunner,
  FakeEnvironment,
  InMemoryFileSystem,
  buildPackage,
} from '@jvm-expert/core/testing';
import { ClaudeCodeAdapter } from '../src/index.ts';

function contextOf(options: {
  home?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  files?: Record<string, string>;
  onPath?: readonly string[];
}): DetectionContext {
  const home = options.home ?? '/home/dev';
  return {
    env: new FakeEnvironment({
      homeDir: home,
      cwd: options.cwd ?? '/work/project',
      ...(options.env === undefined ? {} : { env: options.env }),
    }),
    fs: new InMemoryFileSystem().seed(options.files ?? {}),
    commands: new FakeCommandRunner({ available: options.onPath ?? [] }),
  };
}

const adapter = new ClaudeCodeAdapter();

describe('Claude Code adapter — identity', () => {
  it('exposes a stable id and the aliases the CLI accepts', () => {
    assert.equal(adapter.id, 'claude-code');
    assert.ok(adapter.aliases.includes('claude'));
  });

  it('accepts no agentOverrides, because Claude has no vendor metadata file', () => {
    assert.deepEqual(adapter.overrideKeys, []);
  });
});

describe('Claude Code adapter — detection', () => {
  it('reports strong evidence for the config directory', async () => {
    const detection = await adapter.detect(
      contextOf({ files: { '/home/dev/.claude/settings.json': '{}' } }),
    );
    assert.equal(detection.installed, true);
    assert.equal(detection.strength, 'strong');
    assert.ok(detection.evidence.some((item) => item.kind === 'config-dir'));
  });

  it('reports strong evidence for the executable', async () => {
    const detection = await adapter.detect(contextOf({ onPath: ['claude'] }));
    assert.equal(detection.installed, true);
    assert.ok(detection.evidence.some((item) => item.kind === 'executable'));
  });

  it('honours CLAUDE_CONFIG_DIR', async () => {
    const detection = await adapter.detect(
      contextOf({
        env: { CLAUDE_CONFIG_DIR: '/opt/claude' },
        files: { '/opt/claude/settings.json': '{}' },
      }),
    );
    assert.equal(detection.installed, true);
    assert.ok(detection.evidence.some((item) => item.detail === '/opt/claude'));
  });

  it('treats a project directory as weak evidence only', async () => {
    const detection = await adapter.detect(
      contextOf({
        cwd: '/work/project',
        files: { '/work/project/.claude/skills/x/SKILL.md': 'x' },
      }),
    );
    assert.equal(detection.installed, false);
    assert.equal(detection.strength, 'weak');
  });

  it('reports nothing when the agent is absent', async () => {
    const detection = await adapter.detect(contextOf({}));
    assert.equal(detection.installed, false);
    assert.equal(detection.strength, 'none');
    assert.deepEqual(detection.evidence, []);
  });
});

describe('Claude Code adapter — locations', () => {
  it('resolves the global root under the home directory', () => {
    const location = adapter.locationFor('skill', 'global', { homeDir: '/home/dev', env: {} });
    assert.deepEqual(location, {
      root: join('/home/dev', '.claude', 'skills'),
      shape: 'directory',
      extension: '',
    });
  });

  it('honours CLAUDE_CONFIG_DIR for the global root', () => {
    const location = adapter.locationFor('skill', 'global', {
      homeDir: '/home/dev',
      env: { CLAUDE_CONFIG_DIR: '/opt/claude' },
    });
    assert.equal(location?.root, join('/opt/claude', 'skills'));
  });

  it('resolves the project root under .claude', () => {
    const location = adapter.locationFor('skill', 'project', {
      homeDir: '/home/dev',
      projectRoot: '/work/project',
      env: {},
    });
    assert.equal(location?.root, join('/work/project', '.claude', 'skills'));
  });

  it('puts commands in commands/, as single .md files', () => {
    assert.deepEqual(adapter.locationFor('command', 'global', { homeDir: '/home/dev', env: {} }), {
      root: join('/home/dev', '.claude', 'commands'),
      shape: 'file',
      extension: '.md',
    });
    assert.equal(
      adapter.locationFor('command', 'project', {
        homeDir: '/home/dev',
        projectRoot: '/work/project',
        env: {},
      })?.root,
      join('/work/project', '.claude', 'commands'),
    );
  });

  it('lets configuration override the root entirely', () => {
    const location = adapter.locationFor('skill', 'global', {
      homeDir: '/home/dev',
      env: {},
      overrideRoot: '/custom/place',
    });
    assert.equal(location?.root, '/custom/place');
  });

  it('fails clearly when project scope has no project', () => {
    assert.throws(
      () => adapter.locationFor('skill', 'project', { homeDir: '/home/dev', env: {} }),
      /project root/,
    );
  });
});

describe('Claude Code adapter — layout projection', () => {
  const pkg = buildPackage({
    name: 'a-skill',
    version: '1.0.0',
    extraFiles: { 'references/notes.md': '# Notes' },
  });

  it('projects only the frontmatter keys Claude acts on', () => {
    const layout = adapter.layoutFor(pkg);
    assert.deepEqual(Object.keys(layout.frontmatter).sort(), ['description', 'license', 'name']);
  });

  it('writes a SKILL.md whose frontmatter matches the manifest', () => {
    const layout = adapter.layoutFor(pkg);
    const entry = layout.entries.find((item) => item.path === 'SKILL.md')!;
    const doc = parseSkillDocument(decodeText(entry.content!));
    assert.equal(doc.frontmatter['name'], 'a-skill');
    assert.equal(doc.frontmatter['description'], pkg.manifest.description);
    assert.match(doc.body, /# a-skill/);
  });

  it('does not synthesise any Codex-specific file', () => {
    const paths = adapter.layoutFor(pkg).entries.map((entry) => entry.path);
    assert.equal(paths.includes('agents/openai.yaml'), false);
    assert.equal(paths.includes('SKILL.md'), true);
    assert.equal(paths.includes('skill.yaml'), true);
    assert.equal(paths.includes('references/notes.md'), true);
  });

  it('preserves author-set behavioural frontmatter', () => {
    const withTools = buildPackage({ name: 'b-skill', version: '1.0.0' });
    const doc = {
      ...withTools.document,
      frontmatter: { ...withTools.document.frontmatter, 'allowed-tools': ['Read', 'Grep'] },
    };
    const layout = adapter.layoutFor({ ...withTools, document: doc });
    assert.deepEqual(layout.frontmatter['allowed-tools'], ['Read', 'Grep']);
  });

  it('is pure: two calls produce the same plan', () => {
    assert.deepEqual(adapter.layoutFor(pkg), adapter.layoutFor(pkg));
  });
});

describe('Claude Code adapter — validation', () => {
  it('accepts a normal package', () => {
    assert.deepEqual(adapter.validate(buildPackage({ name: 'a-skill', version: '1.0.0' })), []);
  });

  it('warns when the description exceeds what the picker shows', () => {
    const pkg = buildPackage({
      name: 'a-skill',
      version: '1.0.0',
      description: `${'Very long description. '.repeat(60)}`,
    });
    const issues = adapter.validate(pkg);
    assert.ok(issues.some((issue) => issue.rule === 'claude.description.long'));
  });

  it('rejects a malformed allowed-tools value', () => {
    const pkg = buildPackage({ name: 'a-skill', version: '1.0.0' });
    const issues = adapter.validate({
      ...pkg,
      document: {
        ...pkg.document,
        frontmatter: { ...pkg.document.frontmatter, 'allowed-tools': 42 },
      },
    });
    assert.ok(
      issues.some(
        (issue) => issue.rule === 'claude.allowedTools.type' && issue.severity === 'error',
      ),
    );
  });
});

describe('Claude Code adapter — command projection', () => {
  const command = buildPackage({ name: 'ship-it', version: '1.0.0', kind: 'command' });

  it('projects one COMMAND.md and nothing else', () => {
    const layout = adapter.layoutFor(command);
    assert.deepEqual(
      layout.entries.map((entry) => entry.path),
      ['COMMAND.md'],
    );
  });

  it('drops the name: the file name is the command name', () => {
    const layout = adapter.layoutFor(command);
    assert.deepEqual(Object.keys(layout.frontmatter), ['description']);
  });

  it('preserves the command frontmatter Claude acts on', () => {
    const withHint = {
      ...command,
      document: {
        ...command.document,
        frontmatter: {
          ...command.document.frontmatter,
          'argument-hint': '[pr number]',
          'user-invocable': true,
        },
      },
    };
    const layout = adapter.layoutFor(withHint);
    assert.equal(layout.frontmatter['argument-hint'], '[pr number]');
    // `user-invocable` is a skill key: a command is user-invoked by definition.
    assert.equal(layout.frontmatter['user-invocable'], undefined);
  });

  it('warns that files beyond the entrypoint are not installed', () => {
    const withExtras = buildPackage({
      name: 'ship-it',
      version: '1.0.0',
      kind: 'command',
      extraFiles: { 'references/notes.md': '# Notes' },
    });
    assert.ok(
      adapter.validate(withExtras).some((issue) => issue.rule === 'claude.command.extraFiles'),
    );
    assert.deepEqual(adapter.validate(command), []);
  });
});

describe('Claude Code adapter — workflows', () => {
  const workflow = buildPackage({ name: 'ship-review', version: '1.0.0', kind: 'workflow' });

  it('installs into workflows/ as a .js file', () => {
    assert.deepEqual(adapter.locationFor('workflow', 'global', { homeDir: '/home/dev', env: {} }), {
      root: join('/home/dev', '.claude', 'workflows'),
      shape: 'file',
      extension: '.js',
    });
    assert.equal(
      adapter.locationFor('workflow', 'project', {
        homeDir: '/home/dev',
        projectRoot: '/work/project',
        env: {},
      })?.root,
      join('/work/project', '.claude', 'workflows'),
    );
  });

  it('copies the script verbatim instead of projecting it', () => {
    const layout = adapter.layoutFor(workflow);
    assert.deepEqual(layout.entries, [{ path: 'WORKFLOW.js', copyFrom: 'WORKFLOW.js' }]);
  });

  it('accepts a well-formed workflow', () => {
    assert.deepEqual(adapter.validate(workflow), []);
  });

  it('rejects the nondeterminism Claude Code refuses to compile', () => {
    for (const call of ['Date.now()', 'Math.random()', 'new Date()']) {
      const pkg = buildPackage({
        name: 'ship-review',
        version: '1.0.0',
        kind: 'workflow',
        body: `log(${call});`,
      });
      assert.ok(
        adapter.validate(pkg).some((issue) => issue.rule === 'claude.workflow.nondeterministic'),
        `expected ${call} to be reported`,
      );
    }
  });

  it('rejects a malformed meta.phases', () => {
    const pkg = buildPackage({
      name: 'ship-review',
      version: '1.0.0',
      kind: 'workflow',
      meta: { phases: ['Read'] },
    });
    assert.ok(adapter.validate(pkg).some((issue) => issue.rule === 'claude.workflow.phases'));
  });

  it('warns that extra files are not installed', () => {
    const pkg = buildPackage({
      name: 'ship-review',
      version: '1.0.0',
      kind: 'workflow',
      extraFiles: { 'references/notes.md': '# Notes' },
    });
    assert.ok(adapter.validate(pkg).some((issue) => issue.rule === 'claude.command.extraFiles'));
  });
});
