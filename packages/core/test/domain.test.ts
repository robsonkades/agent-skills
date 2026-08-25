import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AgentSkillsError, ErrorCode, ExitCode, exitCodeFor } from '../src/domain/errors.ts';
import { escapesRoot, isInside, join, normalize, segments } from '../src/domain/posix-path.ts';
import { formatSkillRef, parseSkillRef, validateSkillName } from '../src/domain/skill-ref.ts';
import {
  classifyChange,
  intersects,
  maxSatisfying,
  parseVersion,
  type SemanticVersion,
} from '../src/domain/version.ts';
import { computeIntegrity } from '../src/domain/integrity.ts';
import { encodeText } from '../src/domain/skill-package.ts';
import { FakeHasher } from '../src/testing/doubles.ts';

const v = (value: string): SemanticVersion => parseVersion(value);

describe('posix-path', () => {
  it('normalises separators and traversal', () => {
    assert.equal(normalize('a//b/./c'), 'a/b/c');
    assert.equal(normalize('a/b/../c'), 'a/c');
    assert.equal(normalize('a\\b\\c'), 'a/b/c');
    assert.equal(normalize('./'), '.');
    assert.equal(normalize('/a/../..'), '/');
  });

  it('detects paths that escape their root', () => {
    assert.equal(escapesRoot('../evil'), true);
    assert.equal(escapesRoot('a/../../evil'), true);
    assert.equal(escapesRoot('a/../b'), false);
    assert.equal(escapesRoot('references/notes.md'), false);
  });

  it('joins and splits consistently', () => {
    assert.equal(join('a', 'b', 'c.md'), 'a/b/c.md');
    assert.deepEqual(segments('a/b/c'), ['a', 'b', 'c']);
    assert.deepEqual(segments('.'), []);
    assert.equal(isInside('a/b', 'a/b/c'), true);
    assert.equal(isInside('a/b', 'a/c'), false);
  });
});

describe('skill names', () => {
  it('accepts conventional names', () => {
    for (const name of ['java-performance', 'jvm-gc-tuning', 'ab', 'x9']) {
      assert.deepEqual(validateSkillName(name), [], name);
    }
  });

  it('rejects names that would be unsafe or ambiguous', () => {
    for (const name of [
      'A',
      'Java-Performance',
      'java_perf',
      'a',
      '-lead',
      'trail-',
      'a--b',
      'con',
    ]) {
      assert.ok(validateSkillName(name).length > 0, `expected "${name}" to be rejected`);
    }
  });

  it('reserves @ and / for a future scoping scheme', () => {
    assert.ok(validateSkillName('@org/skill').length > 0);
  });
});

describe('skill references', () => {
  it('parses every documented form', () => {
    assert.deepEqual(parseSkillRef('java-performance'), {
      name: 'java-performance',
      raw: 'java-performance',
    });
    assert.equal(parseSkillRef('java-performance@1.2.0').range, '1.2.0');
    assert.equal(parseSkillRef('java-performance@^1.2.0').range, '^1.2.0');
    assert.equal(parseSkillRef('java-performance@latest').range, 'latest');
    assert.equal(parseSkillRef('company:java-performance@~1.0').registry, 'company');
  });

  it('round-trips through formatSkillRef', () => {
    for (const raw of [
      'java-performance',
      'java-performance@1.2.0',
      'company:java-performance@^1.0.0',
    ]) {
      assert.equal(formatSkillRef(parseSkillRef(raw)), raw);
    }
  });

  it('rejects a malformed range with a usable message', () => {
    assert.throws(
      () => parseSkillRef('java-performance@not-a-version'),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.INVALID_VERSION,
    );
  });

  it('rejects a trailing @ rather than silently ignoring it', () => {
    assert.throws(() => parseSkillRef('java-performance@'), AgentSkillsError);
  });
});

describe('versions', () => {
  it('prefers stable releases over prereleases when both satisfy', () => {
    const versions = [v('1.0.0'), v('1.1.0-rc.1')];
    assert.equal(maxSatisfying(versions, '^1.0.0'), '1.0.0');
  });

  it('still resolves a prerelease when nothing stable matches', () => {
    assert.equal(maxSatisfying([v('2.0.0-rc.1')], '^2.0.0-rc.1'), '2.0.0-rc.1');
  });

  it('detects whether a set of ranges can be satisfied together', () => {
    assert.equal(intersects(['^1.2.0', '~1.3.0']), true);
    assert.equal(intersects(['^1.0.0', '^2.0.0']), false);
    assert.equal(intersects(['*']), true);
  });

  it('classifies a change so update can describe itself', () => {
    assert.equal(classifyChange(v('1.0.0'), v('2.0.0')), 'major');
    assert.equal(classifyChange(v('1.0.0'), v('1.1.0')), 'minor');
    assert.equal(classifyChange(v('1.0.0'), v('1.0.1')), 'patch');
    assert.equal(classifyChange(v('1.0.0'), v('1.0.0')), 'same');
    assert.equal(classifyChange(v('2.0.0'), v('1.0.0')), 'downgrade');
  });

  it('refuses a range where a strict version is required', () => {
    assert.throws(() => parseVersion('^1.0.0'), AgentSkillsError);
  });
});

describe('integrity', () => {
  const hasher = new FakeHasher();

  it('is stable regardless of file order', () => {
    const a = computeIntegrity(
      [
        { path: 'SKILL.md', bytes: encodeText('one') },
        { path: 'references/x.md', bytes: encodeText('two') },
      ],
      hasher,
    );
    const b = computeIntegrity(
      [
        { path: 'references/x.md', bytes: encodeText('two') },
        { path: 'SKILL.md', bytes: encodeText('one') },
      ],
      hasher,
    );
    assert.equal(a, b);
  });

  it('changes when any content changes', () => {
    const before = computeIntegrity([{ path: 'SKILL.md', bytes: encodeText('one') }], hasher);
    const after = computeIntegrity([{ path: 'SKILL.md', bytes: encodeText('two') }], hasher);
    assert.notEqual(before, after);
  });

  it('changes when a file is renamed but its content is not', () => {
    const before = computeIntegrity([{ path: 'a.md', bytes: encodeText('same') }], hasher);
    const after = computeIntegrity([{ path: 'b.md', bytes: encodeText('same') }], hasher);
    assert.notEqual(before, after);
  });

  it('ignores the manifest integrity line, so a manifest can carry its own hash', () => {
    const without = computeIntegrity(
      [{ path: 'skill.yaml', bytes: encodeText('name: x\nversion: 1.0.0\n') }],
      hasher,
    );
    const with_ = computeIntegrity(
      [
        {
          path: 'skill.yaml',
          bytes: encodeText('name: x\nversion: 1.0.0\nintegrity: sha256-abc\n'),
        },
      ],
      hasher,
    );
    assert.equal(without, with_);
  });
});

describe('error codes', () => {
  it('maps failure classes to distinct exit codes', () => {
    const cases: [ErrorCode, ExitCode][] = [
      [ErrorCode.USAGE, ExitCode.USAGE],
      [ErrorCode.INVALID_MANIFEST, ExitCode.VALIDATION],
      [ErrorCode.DEPENDENCY_CONFLICT, ExitCode.RESOLUTION],
      [ErrorCode.UNSAFE_PATH, ExitCode.SECURITY],
      [ErrorCode.INTEGRITY_MISMATCH, ExitCode.SECURITY],
      [ErrorCode.NO_AGENT_DETECTED, ExitCode.NO_AGENT],
      [ErrorCode.IO_ERROR, ExitCode.FAILURE],
    ];
    for (const [code, expected] of cases) {
      assert.equal(exitCodeFor(new AgentSkillsError(code, 'x')), expected, code);
    }
  });

  it('treats an unknown throwable as a generic failure', () => {
    assert.equal(exitCodeFor(new Error('boom')), ExitCode.FAILURE);
  });
});
