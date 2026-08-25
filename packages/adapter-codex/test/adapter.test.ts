import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { decodeText, parseSkillDocument, type DetectionContext } from '@jvm-expert/core';
import {
  FakeCommandRunner,
  FakeEnvironment,
  InMemoryFileSystem,
  buildPackage,
} from '@jvm-expert/core/testing';
import { CodexAdapter } from '../src/index.ts';

function contextOf(options: {
  home?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  files?: Record<string, string>;
  onPath?: readonly string[];
}): DetectionContext {
  return {
    env: new FakeEnvironment({
      homeDir: options.home ?? '/home/dev',
      cwd: options.cwd ?? '/work/project',
      ...(options.env === undefined ? {} : { env: options.env }),
    }),
    fs: new InMemoryFileSystem().seed(options.files ?? {}),
    commands: new FakeCommandRunner({ available: options.onPath ?? [] }),
  };
}

const adapter = new CodexAdapter();

describe('Codex adapter — identity', () => {
  it('exposes a stable id and aliases', () => {
    assert.equal(adapter.id, 'codex');
    assert.ok(adapter.aliases.includes('codex'));
    assert.ok(adapter.aliases.includes('openai-codex'));
  });

  it('accepts only the interface override', () => {
    assert.deepEqual(adapter.overrideKeys, ['interface']);
  });
});

describe('Codex adapter — detection', () => {
  it('finds the default home directory', async () => {
    const detection = await adapter.detect(
      contextOf({ files: { '/home/dev/.codex/config.toml': '' } }),
    );
    assert.equal(detection.installed, true);
    assert.ok(detection.evidence.some((item) => item.detail.includes('.codex')));
  });

  it('honours CODEX_HOME', async () => {
    const detection = await adapter.detect(
      contextOf({ env: { CODEX_HOME: '/opt/codex' }, files: { '/opt/codex/config.toml': '' } }),
    );
    assert.equal(detection.installed, true);
    assert.ok(detection.evidence.some((item) => item.detail === '/opt/codex'));
  });

  it('finds the executable on PATH', async () => {
    const detection = await adapter.detect(contextOf({ onPath: ['codex'] }));
    assert.equal(detection.installed, true);
  });

  it('treats a repository .agents/skills directory as weak evidence', async () => {
    const detection = await adapter.detect(
      contextOf({ files: { '/work/project/.agents/skills/x/SKILL.md': 'x' } }),
    );
    assert.equal(detection.installed, false);
    assert.equal(detection.strength, 'weak');
  });
});

describe('Codex adapter — locations', () => {
  it('uses $CODEX_HOME/skills, not ~/.agents/skills, for the global root', () => {
    // Verified against the Codex binary: global skills resolve to $CODEX_HOME/skills.
    assert.deepEqual(adapter.locationFor('skill', 'global', { homeDir: '/home/dev', env: {} }), {
      root: join('/home/dev', '.codex', 'skills'),
      shape: 'directory',
      extension: '',
    });
    assert.deepEqual(
      adapter.locationFor('skill', 'global', {
        homeDir: '/home/dev',
        env: { CODEX_HOME: '/opt/codex' },
      }),
      { root: join('/opt/codex', 'skills'), shape: 'directory', extension: '' },
    );
  });

  it('uses the vendor-neutral .agents/skills for project scope', () => {
    assert.deepEqual(
      adapter.locationFor('skill', 'project', {
        homeDir: '/home/dev',
        projectRoot: '/work/p',
        env: {},
      }),
      { root: join('/work/p', '.agents', 'skills'), shape: 'directory', extension: '' },
    );
  });

  it('lets configuration override the root, for convention drift', () => {
    assert.deepEqual(
      adapter.locationFor('skill', 'project', {
        homeDir: '/home/dev',
        projectRoot: '/work/p',
        env: {},
        overrideRoot: '/work/p/.codex/skills',
      }),
      { root: '/work/p/.codex/skills', shape: 'directory', extension: '' },
    );
  });

  it('declares no home for commands, because the path is unverified', () => {
    assert.deepEqual(
      adapter.locationFor('command', 'global', { homeDir: '/home/dev', env: {} }),
      undefined,
    );
  });
});

describe('Codex adapter — layout projection', () => {
  const pkg = buildPackage({
    name: 'java-performance',
    version: '1.0.0',
    description: 'Java performance engineering on the JVM. Use for latency and CPU work.',
  });

  it('adds metadata.short-description derived from the first sentence', () => {
    const layout = adapter.layoutFor(pkg);
    const metadata = layout.frontmatter['metadata'] as Record<string, unknown>;
    assert.equal(metadata['short-description'], 'Java performance engineering on the JVM.');
  });

  it('synthesises agents/openai.yaml', () => {
    const entry = adapter.layoutFor(pkg).entries.find((item) => item.path === 'agents/openai.yaml');
    assert.ok(entry !== undefined);
    const doc = parseYaml(decodeText(entry.content!)) as { interface: Record<string, string> };
    assert.equal(doc.interface['display_name'], 'Java Performance');
    assert.equal(doc.interface['short_description'], 'Java performance engineering on the JVM.');
  });

  it('uses the agentOverrides.codex.interface block when present', () => {
    const overridden = buildPackage({
      name: 'java-performance',
      version: '1.0.0',
      manifestExtras: [
        'agentOverrides:',
        '  codex:',
        '    interface:',
        '      display_name: JVM Perf',
        '      short_description: Fast JVMs',
        '      default_prompt: Use JVM Perf for this.',
      ].join('\n'),
    });

    const entry = adapter
      .layoutFor(overridden)
      .entries.find((item) => item.path === 'agents/openai.yaml')!;
    const doc = parseYaml(decodeText(entry.content!)) as { interface: Record<string, string> };

    assert.equal(doc.interface['display_name'], 'JVM Perf');
    assert.equal(doc.interface['short_description'], 'Fast JVMs');
    assert.equal(doc.interface['default_prompt'], 'Use JVM Perf for this.');
  });

  it('never emits a license key, which Codex does not read', () => {
    assert.equal(adapter.layoutFor(pkg).frontmatter['license'], undefined);
  });

  it('writes a SKILL.md the agent can parse', () => {
    const entry = adapter.layoutFor(pkg).entries.find((item) => item.path === 'SKILL.md')!;
    const doc = parseSkillDocument(decodeText(entry.content!));
    assert.equal(doc.frontmatter['name'], 'java-performance');
  });

  it('regenerates agents/openai.yaml rather than copying a stale one', () => {
    const withStale = buildPackage({
      name: 'a-skill',
      version: '1.0.0',
      extraFiles: { 'agents/openai.yaml': 'interface:\n  display_name: Stale\n' },
    });
    const entries = adapter
      .layoutFor(withStale)
      .entries.filter((e) => e.path === 'agents/openai.yaml');
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.copyFrom, undefined);
    assert.match(decodeText(entries[0]!.content!), /display_name: A Skill/);
  });

  it('is pure', () => {
    assert.deepEqual(adapter.layoutFor(pkg), adapter.layoutFor(pkg));
  });
});

describe('Codex adapter — validation', () => {
  it('rejects an unknown interface key', () => {
    const pkg = buildPackage({
      name: 'a-skill',
      version: '1.0.0',
      manifestExtras: ['agentOverrides:', '  codex:', '    interface:', '      colour: blue'].join(
        '\n',
      ),
    });
    const issues = adapter.validate(pkg);
    assert.ok(
      issues.some(
        (issue) => issue.rule === 'codex.interface.unknownKey' && issue.severity === 'error',
      ),
    );
  });

  it('rejects a non-string interface value', () => {
    const pkg = buildPackage({
      name: 'a-skill',
      version: '1.0.0',
      manifestExtras: [
        'agentOverrides:',
        '  codex:',
        '    interface:',
        '      display_name: 42',
      ].join('\n'),
    });
    assert.ok(adapter.validate(pkg).some((issue) => issue.rule === 'codex.interface.valueType'));
  });

  it('warns when an icon is referenced but not shipped', () => {
    const pkg = buildPackage({
      name: 'a-skill',
      version: '1.0.0',
      manifestExtras: [
        'agentOverrides:',
        '  codex:',
        '    interface:',
        '      icon_small: ./assets/icon.svg',
      ].join('\n'),
    });
    assert.ok(adapter.validate(pkg).some((issue) => issue.rule === 'codex.interface.missingIcon'));
  });

  it('accepts an icon that is shipped', () => {
    const pkg = buildPackage({
      name: 'a-skill',
      version: '1.0.0',
      extraFiles: { 'assets/icon.svg': '<svg/>' },
      manifestExtras: [
        'agentOverrides:',
        '  codex:',
        '    interface:',
        '      icon_small: ./assets/icon.svg',
      ].join('\n'),
    });
    assert.equal(adapter.validate(pkg).length, 0);
  });
});
