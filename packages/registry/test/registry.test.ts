import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AgentSkillsError, ErrorCode, type SemanticVersion } from '@jvm-expert/core';
import {
  FakeHasher,
  FakeRegistry,
  InMemoryFileSystem,
  buildPackage,
} from '@jvm-expert/core/testing';
import { LocalRegistry } from '../src/local-registry.ts';
import { RegistryFederation } from '../src/federation.ts';
import { cacheKey, splitRef } from '../src/git-registry.ts';
import { matches, score } from '../src/search.ts';

const v = (value: string) => value as SemanticVersion;

const SKILL_MD = `---
name: a-skill
description: A skill used in registry tests. Use it when testing the registry.
---

# A skill

A body long enough to satisfy the content check during validation.
`;

const MANIFEST = `schemaVersion: 1
name: a-skill
version: 1.0.0
description: A skill used in registry tests. Use it when testing the registry.
license: Apache-2.0
files:
  - SKILL.md
  - skill.yaml
`;

const INDEX = `schemaVersion: 1
name: official
skills:
  - name: a-skill
    description: A skill used in registry tests.
    keywords: [testing, registry]
    latest: 1.0.0
    versions:
      - version: 1.0.0
        path: skills/a-skill
`;

function localRegistry() {
  const fs = new InMemoryFileSystem().seed({
    '/reg/registry/skills.yaml': INDEX,
    '/reg/skills/a-skill/SKILL.md': SKILL_MD,
    '/reg/skills/a-skill/skill.yaml': MANIFEST,
  });
  return new LocalRegistry({ name: 'official', root: '/reg', fs, hasher: new FakeHasher() });
}

describe('local registry', () => {
  it('lists versions from the index', async () => {
    assert.deepEqual(
      (await localRegistry().versions('a-skill')).map((entry) => entry.version),
      ['1.0.0'],
    );
  });

  it('reports an unknown skill as absent rather than throwing', async () => {
    assert.equal(await localRegistry().has('nope-skill'), false);
    assert.deepEqual(await localRegistry().versions('nope-skill'), []);
  });

  it('fetches a package and computes its integrity from content', async () => {
    const fetched = await localRegistry().fetch('a-skill', v('1.0.0'));
    assert.equal(fetched.pkg.manifest.name, 'a-skill');
    assert.equal(fetched.registry, 'official');
    assert.match(fetched.integrity, /^sha256-/);
    assert.match(fetched.resolved, /^file:\/\//);
  });

  it('fails clearly for a version that is not published', async () => {
    await assert.rejects(
      () => localRegistry().fetch('a-skill', v('9.9.9')),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.VERSION_NOT_FOUND,
    );
  });

  it('explains what is missing when the directory is not a registry', async () => {
    const registry = new LocalRegistry({
      name: 'broken',
      root: '/nothing',
      fs: new InMemoryFileSystem(),
      hasher: new FakeHasher(),
    });
    await assert.rejects(
      () => registry.versions('a-skill'),
      (error: unknown) => {
        assert.ok(error instanceof AgentSkillsError);
        assert.equal(error.code, ErrorCode.REGISTRY_INVALID_INDEX);
        assert.match(error.message, /registry\/skills\.yaml/);
        return true;
      },
    );
  });

  it('searches by name, keyword and description', async () => {
    const registry = localRegistry();
    assert.equal((await registry.search({ text: 'a-skill' })).length, 1);
    assert.equal((await registry.search({ text: 'registry' })).length, 1);
    assert.equal((await registry.search({ text: 'unrelated' })).length, 0);
    assert.equal((await registry.search({ text: '' })).length, 1);
  });
});

describe('search ranking', () => {
  const entry = {
    name: 'java-performance',
    description: 'Performance work on the JVM.',
    keywords: ['jvm', 'profiling'],
    latest: v('1.0.0'),
    versions: [],
  };

  it('matches on every field', () => {
    assert.equal(matches(entry, 'java'), true);
    assert.equal(matches(entry, 'jvm'), true);
    assert.equal(matches(entry, 'performance work'), true);
    assert.equal(matches(entry, 'rust'), false);
  });

  it('ranks an exact name above a keyword above a description hit', () => {
    assert.ok(score(entry, 'java-performance') > score(entry, 'jvm'));
    assert.ok(score(entry, 'jvm') > score(entry, 'work'));
  });
});

describe('registry federation', () => {
  const official = new FakeRegistry({
    name: 'official',
    packages: [
      buildPackage({ name: 'shared-skill', version: '1.0.0' }),
      buildPackage({ name: 'public-skill', version: '1.0.0' }),
    ],
  });
  const company = new FakeRegistry({
    name: 'company',
    packages: [
      buildPackage({ name: 'shared-skill', version: '9.9.9' }),
      buildPackage({ name: 'internal-skill', version: '1.0.0' }),
    ],
  });

  it('gives the first registry ownership of a name', async () => {
    const federation = new RegistryFederation([company, official]);
    assert.equal(await federation.ownerOf('shared-skill'), 'company');
  });

  it('does not let a later registry inject a higher version of an owned name', async () => {
    // The dependency-confusion property: precedence is by name, not by version.
    const federation = new RegistryFederation([official, company]);
    assert.equal(await federation.ownerOf('shared-skill'), 'official');
    assert.deepEqual(
      (await federation.versions('shared-skill')).map((entry) => entry.version),
      ['1.0.0'],
    );
  });

  it('falls through to a later registry for names the first does not publish', async () => {
    const federation = new RegistryFederation([official, company]);
    assert.equal(await federation.ownerOf('internal-skill'), 'company');
  });

  it('labels shadowed duplicates in search instead of hiding them', async () => {
    const federation = new RegistryFederation([official, company]);
    const results = await federation.search({ text: 'shared' });
    assert.equal(results.length, 2);
    assert.equal(results[0]!.shadowedBy, undefined);
    assert.equal(results[1]!.shadowedBy, 'official');
  });

  it('reports a name no registry publishes, listing where it looked', async () => {
    const federation = new RegistryFederation([official, company]);
    await assert.rejects(
      () => federation.versions('nowhere-skill'),
      (error: unknown) => {
        assert.ok(error instanceof AgentSkillsError);
        assert.equal(error.code, ErrorCode.SKILL_NOT_FOUND);
        assert.match(error.details.join('\n'), /official/);
        assert.match(error.details.join('\n'), /company/);
        return true;
      },
    );
  });

  it('keeps working when one registry is unreachable', async () => {
    const broken = new FakeRegistry({ name: 'broken', packages: [], offline: true });
    const federation = new RegistryFederation([broken, official]);

    assert.equal(await federation.ownerOf('public-skill'), 'official');
    await assert.doesNotReject(() => federation.refresh());
  });

  it('fails when every registry is unreachable', async () => {
    const federation = new RegistryFederation([
      new FakeRegistry({ name: 'a', packages: [], offline: true }),
      new FakeRegistry({ name: 'b', packages: [], offline: true }),
    ]);
    await assert.rejects(
      () => federation.refresh(),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.REGISTRY_UNAVAILABLE,
    );
  });

  it('is untrusted as a whole when any member is untrusted', () => {
    const untrusted = new FakeRegistry({ name: 'x', packages: [], trusted: false });
    assert.equal(new RegistryFederation([official, untrusted]).trusted, false);
    assert.equal(new RegistryFederation([official]).trusted, true);
  });
});

describe('git registry helpers', () => {
  it('splits a ref out of the URL', () => {
    assert.deepEqual(splitRef('https://host/repo.git#main'), {
      url: 'https://host/repo.git',
      ref: 'main',
    });
    assert.deepEqual(splitRef('https://host/repo.git'), {
      url: 'https://host/repo.git',
      ref: undefined,
    });
  });

  it('lets an explicit ref win over the URL fragment', () => {
    assert.equal(splitRef('https://host/repo.git#main', 'v2').ref, 'v2');
  });

  it('produces a readable, collision-resistant cache key', () => {
    const a = cacheKey('https://github.com/org/registry.git', 'main');
    const b = cacheKey('https://github.com/org/registry.git', 'next');
    const c = cacheKey('https://github.com/other/registry.git', 'main');

    assert.match(a, /^github-com-org-registry-/);
    assert.notEqual(a, b);
    assert.notEqual(a, c);
    // Safe as a directory name on every platform.
    assert.match(a, /^[a-z0-9-]+$/i);
  });
});
