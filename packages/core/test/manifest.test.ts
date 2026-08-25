import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AgentSkillsError, ErrorCode } from '../src/domain/errors.ts';
import { parseManifest, stringifyManifest } from '../src/domain/manifest.ts';
import { parseSkillDocument, stringifySkillDocument } from '../src/domain/skill-document.ts';
import { parseWorkflowDocument } from '../src/domain/workflow-document.ts';
import { parseEntrypoint } from '../src/domain/skill-package.ts';
import {
  emptyLockfile,
  parseLockfile,
  stringifyLockfile,
  assertIntegrityMatches,
  withSkill,
  withoutSkill,
} from '../src/domain/lockfile.ts';
import { parseRegistryIndex, stringifyRegistryIndex } from '../src/domain/registry-index.ts';
import { parseReceipt, stringifyReceipt } from '../src/domain/receipt.ts';
import { parseVersion, type SemanticVersion } from '../src/domain/version.ts';

const v = (value: string): SemanticVersion => parseVersion(value);

const MINIMAL = `
schemaVersion: 1
name: java-performance
version: 1.0.0
description: Java performance engineering, for latency and CPU diagnosis.
license: Apache-2.0
files:
  - SKILL.md
  - skill.yaml
`;

describe('manifest parsing', () => {
  it('parses a minimal manifest and fills defaults', () => {
    const { manifest, issues } = parseManifest(MINIMAL);
    assert.equal(manifest.name, 'java-performance');
    assert.equal(manifest.version, '1.0.0');
    assert.equal(manifest.schemaVersion, 1);
    assert.deepEqual(manifest.dependencies, []);
    assert.deepEqual(manifest.compatibility, []);
    assert.deepEqual(manifest.keywords, []);
    assert.equal(issues.filter((issue) => issue.severity === 'error').length, 0);
  });

  it('requires name, version and description', () => {
    for (const field of ['name', 'version', 'description']) {
      const text = MINIMAL.split('\n')
        .filter((line) => !line.startsWith(`${field}:`))
        .join('\n');
      assert.throws(
        () => parseManifest(text),
        (error: unknown) =>
          error instanceof AgentSkillsError && error.code === ErrorCode.INVALID_MANIFEST,
        `expected a missing "${field}" to fail`,
      );
    }
  });

  it('refuses a package format newer than it understands', () => {
    assert.throws(
      () => parseManifest(MINIMAL.replace('schemaVersion: 1', 'schemaVersion: 99')),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.UNSUPPORTED_SCHEMA,
    );
  });

  it('treats a missing schemaVersion as v1, for forward compatibility', () => {
    const { manifest } = parseManifest(MINIMAL.replace('schemaVersion: 1\n', ''));
    assert.equal(manifest.schemaVersion, 1);
  });

  it('warns about unknown fields, and errors on them in strict mode', () => {
    const text = `${MINIMAL}\nunknownThing: true\n`;
    const lenient = parseManifest(text);
    assert.equal(lenient.issues.filter((issue) => issue.severity === 'warning').length >= 1, true);

    const strict = parseManifest(text, { strict: true });
    assert.equal(
      strict.issues.some(
        (issue) => issue.severity === 'error' && issue.rule === 'manifest.unknownField',
      ),
      true,
    );
  });

  it('rejects a files entry that escapes the package root', () => {
    const { issues } = parseManifest(`${MINIMAL}  - ../../etc/passwd\n`);
    assert.ok(issues.some((issue) => issue.rule === 'manifest.files.traversal'));
  });

  it('rejects an absolute files entry', () => {
    const { issues } = parseManifest(`${MINIMAL}  - /etc/passwd\n`);
    assert.ok(issues.some((issue) => issue.rule === 'manifest.files.absolute'));
  });

  it('requires SKILL.md in the files list', () => {
    const text = MINIMAL.replace('  - SKILL.md\n', '');
    const { issues } = parseManifest(text);
    assert.ok(issues.some((issue) => issue.rule === 'manifest.files.missingEntrypoint'));
  });

  it('rejects a self-dependency', () => {
    const text = `${MINIMAL}
dependencies:
  - name: java-performance
    version: "^1.0.0"
`;
    const { issues } = parseManifest(text);
    assert.ok(issues.some((issue) => issue.rule === 'manifest.dependencies.self'));
  });

  it('rejects duplicate dependencies', () => {
    const text = `${MINIMAL}
dependencies:
  - name: a-skill
    version: "^1.0.0"
  - name: a-skill
    version: "^2.0.0"
`;
    const { issues } = parseManifest(text);
    assert.ok(issues.some((issue) => issue.rule === 'manifest.dependencies.duplicate'));
  });

  it('round-trips through stringifyManifest', () => {
    const text = `${MINIMAL}
keywords: [java, jvm]
dependencies:
  - name: jvm-gc-tuning
    version: "^1.0.0"
compatibility:
  agents:
    - id: claude-code
    - id: codex
      minVersion: ">=1.0.0"
`;
    const first = parseManifest(text).manifest;
    const second = parseManifest(stringifyManifest(first)).manifest;
    assert.deepEqual(second, first);
  });

  it('rejects YAML that is not a mapping', () => {
    assert.throws(() => parseManifest('- just\n- a\n- list\n'), AgentSkillsError);
  });
});

describe('SKILL.md', () => {
  it('parses frontmatter and body', () => {
    const doc = parseSkillDocument(
      '---\nname: x-skill\ndescription: Does a thing.\n---\n\n# Title\n\nBody.\n',
    );
    assert.equal(doc.frontmatter['name'], 'x-skill');
    assert.match(doc.body, /# Title/);
  });

  it('tolerates CRLF line endings', () => {
    const doc = parseSkillDocument(
      '---\r\nname: x-skill\r\ndescription: Does a thing.\r\n---\r\n\r\n# Title\r\n',
    );
    assert.equal(doc.frontmatter['name'], 'x-skill');
  });

  it('tolerates a UTF-8 BOM', () => {
    const doc = parseSkillDocument('﻿---\nname: x-skill\ndescription: d\n---\n\nBody\n');
    assert.equal(doc.frontmatter['name'], 'x-skill');
  });

  it('fails clearly when frontmatter is missing', () => {
    assert.throws(
      () => parseSkillDocument('# Just markdown\n'),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.INVALID_PACKAGE,
    );
  });

  it('round-trips', () => {
    const original = {
      frontmatter: { name: 'x-skill', description: 'A thing.' },
      body: '# Title\n\nBody.\n',
    };
    const parsed = parseSkillDocument(stringifySkillDocument(original));
    assert.deepEqual(parsed.frontmatter, original.frontmatter);
    assert.match(parsed.body, /# Title/);
  });
});

describe('registry index', () => {
  const INDEX = `
schemaVersion: 1
name: official
skills:
  - name: java-performance
    description: Perf.
    latest: 1.1.0
    versions:
      - version: 1.0.0
        path: skills/java-performance
      - version: 1.1.0
        path: skills/java-performance
        integrity: sha256-abc
`;

  it('parses and sorts versions newest-first', () => {
    const index = parseRegistryIndex(INDEX);
    const skill = index.skills[0]!;
    assert.deepEqual(
      skill.versions.map((entry) => entry.version),
      ['1.1.0', '1.0.0'],
    );
    assert.equal(skill.latest, '1.1.0');
  });

  it('derives latest from the newest non-deprecated version when omitted', () => {
    const index = parseRegistryIndex(`
schemaVersion: 1
name: official
skills:
  - name: a-skill
    versions:
      - version: 2.0.0
        deprecated: true
      - version: 1.0.0
`);
    assert.equal(index.skills[0]!.latest, '1.0.0');
  });

  it('rejects an entry declaring both path and tarball', () => {
    assert.throws(
      () =>
        parseRegistryIndex(`
schemaVersion: 1
skills:
  - name: a-skill
    versions:
      - version: 1.0.0
        path: skills/a
        tarball: https://example.com/a.tgz
`),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.REGISTRY_INVALID_INDEX,
    );
  });

  it('rejects a skill with no versions', () => {
    assert.throws(
      () => parseRegistryIndex('schemaVersion: 1\nskills:\n  - name: a-skill\n'),
      AgentSkillsError,
    );
  });

  it('round-trips', () => {
    const parsed = parseRegistryIndex(INDEX);
    assert.deepEqual(parseRegistryIndex(stringifyRegistryIndex(parsed)), parsed);
  });
});

describe('lockfile', () => {
  const entry = {
    version: v('1.0.0'),
    registry: 'official',
    resolved: 'https://example.com/repo.git#main:skills/a-skill',
    integrity: 'sha256-abc',
    agents: ['claude-code', 'codex'],
    dependencies: { 'b-skill': v('2.0.0') },
  };

  it('round-trips', () => {
    const lock = withSkill(emptyLockfile('cli@1.0.0'), 'a-skill', entry);
    assert.deepEqual(parseLockfile(stringifyLockfile(lock)), lock);
  });

  it('serialises skills sorted by name, so diffs stay minimal', () => {
    let lock = emptyLockfile();
    lock = withSkill(lock, 'z-skill', entry);
    lock = withSkill(lock, 'a-skill', entry);
    const text = stringifyLockfile(lock);
    assert.ok(text.indexOf('a-skill') < text.indexOf('z-skill'));
  });

  it('removes a skill', () => {
    const lock = withoutSkill(withSkill(emptyLockfile(), 'a-skill', entry), 'a-skill');
    assert.deepEqual(Object.keys(lock.skills), []);
  });

  it('treats an integrity mismatch as a security failure, not a cache miss', () => {
    assert.throws(
      () => assertIntegrityMatches('a-skill', 'sha256-expected', 'sha256-actual'),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.LOCKFILE_MISMATCH,
    );
  });

  it('rejects a lockfile from a newer CLI', () => {
    assert.throws(
      () => parseLockfile('lockfileVersion: 99\nskills: {}\n'),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.UNSUPPORTED_SCHEMA,
    );
  });

  it('reports a corrupt lockfile with a recovery hint', () => {
    assert.throws(
      () => parseLockfile('skills:\n  a-skill:\n    registry: official\n'),
      (error: unknown) =>
        error instanceof AgentSkillsError &&
        error.code === ErrorCode.LOCKFILE_INVALID &&
        error.hints.some((hint) => hint.includes('re-run install')),
    );
  });
});

describe('install receipts', () => {
  it('round-trips and sorts files for a stable diff', () => {
    const receipt = {
      receiptVersion: 1,
      name: 'a-skill',
      version: v('1.0.0'),
      agentId: 'claude-code',
      scope: 'global' as const,
      registry: 'official',
      resolved: 'fake://official/a-skill@1.0.0',
      integrity: 'sha256-abc',
      installedAt: '2026-01-01T00:00:00.000Z',
      installedWith: 'cli@1.0.0',
      directory: '/home/dev/.claude/skills/a-skill',
      files: [
        { path: 'skill.yaml', integrity: 'sha256-2', size: 20 },
        { path: 'SKILL.md', integrity: 'sha256-1', size: 10 },
      ],
      dependencyOf: [],
    };

    const text = stringifyReceipt(receipt);
    assert.ok(text.indexOf('SKILL.md') < text.indexOf('skill.yaml'));
    assert.equal(parseReceipt(text, 'r.json').files.length, 2);
  });

  it('reports a corrupted receipt rather than crashing', () => {
    assert.throws(() => parseReceipt('{not json', 'r.json'), AgentSkillsError);
  });
});

describe('package kinds', () => {
  const COMMAND = MINIMAL.replace('name:', 'kind: command\nname:').replace(
    '  - SKILL.md',
    '  - COMMAND.md',
  );

  it('defaults to skill and reads an explicit command', () => {
    assert.equal(parseManifest(MINIMAL).manifest.kind, 'skill');

    const { manifest, issues } = parseManifest(COMMAND);
    assert.equal(manifest.kind, 'command');
    assert.equal(issues.filter((issue) => issue.severity === 'error').length, 0);
  });

  it('requires the entrypoint that matches the kind', () => {
    const { issues } = parseManifest(MINIMAL.replace('name:', 'kind: command\nname:'));
    assert.ok(
      issues.some(
        (issue) =>
          issue.rule === 'manifest.files.missingEntrypoint' && issue.message.includes('COMMAND.md'),
      ),
    );
  });

  it('defaults the files list to the entrypoint of the kind', () => {
    const withoutFiles = COMMAND.split('\n')
      .filter((line) => line !== 'files:' && !line.startsWith('  - '))
      .join('\n');
    assert.deepEqual(parseManifest(withoutFiles).manifest.files, ['COMMAND.md', 'skill.yaml']);
  });

  it('reports an unknown kind rather than throwing', () => {
    const { manifest, issues } = parseManifest(MINIMAL.replace('name:', 'kind: hook\nname:'));
    assert.equal(manifest.kind, 'skill');
    assert.ok(issues.some((issue) => issue.rule === 'manifest.kind.invalid'));
  });

  it('round-trips through stringifyManifest', () => {
    const first = parseManifest(COMMAND).manifest;
    assert.deepEqual(parseManifest(stringifyManifest(first)).manifest, first);
  });
});

describe('workflow entrypoint', () => {
  const SCRIPT = `export const meta = {
  name: 'ship-review',
  description: 'Reviews the current branch.',
  phases: [{ title: 'Read', detail: 'Collect the diff' }, { title: 'Report' }],
};

phase('Read');
log('done');
`;

  it('reads meta statically as if it were frontmatter', () => {
    const doc = parseWorkflowDocument(SCRIPT);
    assert.equal(doc.frontmatter['name'], 'ship-review');
    assert.equal(doc.frontmatter['description'], 'Reviews the current branch.');
    assert.deepEqual(doc.frontmatter['phases'], [
      { title: 'Read', detail: 'Collect the diff' },
      { title: 'Report' },
    ]);
    assert.match(doc.body, /^phase\('Read'\);/);
  });

  it('accepts comments before and inside the declaration', () => {
    const doc = parseWorkflowDocument(
      [
        '// what this does',
        '/* still a header */',
        'export const meta = {',
        '  // the name',
        "  name: 'x', // trailing",
        '};',
        '',
        "log('hi');",
        '',
      ].join('\n'),
    );
    assert.equal(doc.frontmatter['name'], 'x');
    assert.equal(doc.body.trim(), "log('hi');");
  });

  it('requires meta to come first, the way Claude Code does', () => {
    assert.throws(
      () => parseWorkflowDocument("log('early');\nexport const meta = { name: 'x' };\n"),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.INVALID_PACKAGE,
    );
  });

  it('refuses anything that is not a pure literal', () => {
    for (const meta of [
      'export const meta = { name: NAME };',
      'export const meta = { name: "a" + "b" };',
      'export const meta = { name: getName() };',
      'export const meta = { name: `x` };',
      'export const meta = { name };',
    ]) {
      assert.throws(
        () => parseWorkflowDocument(`${meta}\nlog('x');\n`),
        AgentSkillsError,
        `expected "${meta}" to be refused`,
      );
    }
  });

  it('parses the literal forms JavaScript actually uses', () => {
    const doc = parseWorkflowDocument(
      [
        'export const meta = {',
        '  name: "quoted",',
        "  'escaped': 'a\\nb\\u0041',",
        '  nested: { list: [1, -2.5, 1e3, true, false, null] },',
        '  trailing: [1, 2,],',
        '};',
        '',
        "log('x');",
        '',
      ].join('\n'),
    );
    assert.equal(doc.frontmatter['name'], 'quoted');
    assert.equal(doc.frontmatter['escaped'], 'a\nbA');
    assert.deepEqual(doc.frontmatter['nested'], { list: [1, -2.5, 1000, true, false, null] });
    assert.deepEqual(doc.frontmatter['trailing'], [1, 2]);
  });

  it('is the entrypoint parser for the workflow kind', () => {
    const doc = parseEntrypoint('workflow', SCRIPT, 'WORKFLOW.js');
    assert.equal(doc.frontmatter['name'], 'ship-review');
    assert.match(parseEntrypoint('skill', '---\nname: s\n---\n\nBody\n', 'SKILL.md').body, /Body/);
  });
});
