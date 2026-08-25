import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AgentSkillsError, ErrorCode } from '../src/domain/errors.ts';
import { Resolver, type ResolutionSource } from '../src/domain/resolver.ts';
import { parseSkillRef } from '../src/domain/skill-ref.ts';
import { parseVersion, type SemanticVersion } from '../src/domain/version.ts';
import { buildPackage } from '../src/testing/doubles.ts';
import type { SkillPackage } from '../src/domain/skill-package.ts';

const v = (value: string): SemanticVersion => parseVersion(value);

/** A resolution source over a plain list of packages, with optional deprecations. */
function sourceOf(
  packages: readonly SkillPackage[],
  options: { deprecated?: readonly string[]; missing?: readonly string[] } = {},
): ResolutionSource & { manifestLoads: string[] } {
  const deprecated = new Set(options.deprecated ?? []);
  const missing = new Set(options.missing ?? []);
  const manifestLoads: string[] = [];

  return {
    manifestLoads,
    async listVersions(name) {
      if (missing.has(name)) {
        throw new AgentSkillsError(ErrorCode.SKILL_NOT_FOUND, `"${name}" not found`);
      }
      const versions = packages
        .filter((pkg) => pkg.manifest.name === name)
        .map((pkg) => ({
          version: pkg.manifest.version,
          deprecated: deprecated.has(`${name}@${pkg.manifest.version}`),
        }));
      if (versions.length === 0) {
        throw new AgentSkillsError(ErrorCode.SKILL_NOT_FOUND, `"${name}" not found`);
      }
      return { registry: 'test', versions };
    },
    async loadManifest(name, version) {
      manifestLoads.push(`${name}@${version}`);
      const found = packages.find(
        (pkg) => pkg.manifest.name === name && pkg.manifest.version === version,
      );
      if (found === undefined) throw new Error(`missing ${name}@${version}`);
      return found.manifest;
    },
  };
}

const refs = (...values: string[]) => values.map((value) => parseSkillRef(value));

describe('resolver', () => {
  it('resolves a single skill to its newest version', async () => {
    const source = sourceOf([
      buildPackage({ name: 'a-skill', version: '1.0.0' }),
      buildPackage({ name: 'a-skill', version: '1.2.0' }),
      buildPackage({ name: 'a-skill', version: '2.0.0' }),
    ]);

    const { order } = await new Resolver(source).resolve(refs('a-skill'));
    assert.equal(order.length, 1);
    assert.equal(order[0]!.version, '2.0.0');
    assert.equal(order[0]!.direct, true);
  });

  it('honours an explicit version', async () => {
    const source = sourceOf([
      buildPackage({ name: 'a-skill', version: '1.0.0' }),
      buildPackage({ name: 'a-skill', version: '2.0.0' }),
    ]);
    const { order } = await new Resolver(source).resolve(refs('a-skill@1.0.0'));
    assert.equal(order[0]!.version, '1.0.0');
  });

  it('honours a range', async () => {
    const source = sourceOf([
      buildPackage({ name: 'a-skill', version: '1.0.0' }),
      buildPackage({ name: 'a-skill', version: '1.9.0' }),
      buildPackage({ name: 'a-skill', version: '2.0.0' }),
    ]);
    const { order } = await new Resolver(source).resolve(refs('a-skill@^1.0.0'));
    assert.equal(order[0]!.version, '1.9.0');
  });

  it('installs dependencies before the skills that need them', async () => {
    const source = sourceOf([
      buildPackage({
        name: 'top-skill',
        version: '1.0.0',
        dependencies: { 'mid-skill': '^1.0.0' },
      }),
      buildPackage({
        name: 'mid-skill',
        version: '1.0.0',
        dependencies: { 'base-skill': '^1.0.0' },
      }),
      buildPackage({ name: 'base-skill', version: '1.0.0' }),
    ]);

    const { order } = await new Resolver(source).resolve(refs('top-skill'));
    assert.deepEqual(
      order.map((skill) => skill.name),
      ['base-skill', 'mid-skill', 'top-skill'],
    );
    assert.deepEqual(
      order.map((skill) => skill.direct),
      [false, false, true],
    );
  });

  it('records who required a transitive dependency', async () => {
    const source = sourceOf([
      buildPackage({
        name: 'top-skill',
        version: '1.0.0',
        dependencies: { 'base-skill': '^1.0.0' },
      }),
      buildPackage({ name: 'base-skill', version: '1.0.0' }),
    ]);
    const { order } = await new Resolver(source).resolve(refs('top-skill'));
    assert.deepEqual(order[0]!.requiredBy, ['top-skill@1.0.0']);
  });

  it('narrows to a version satisfying every accumulated constraint', async () => {
    const source = sourceOf([
      buildPackage({
        name: 'x-skill',
        version: '1.0.0',
        dependencies: { 'shared-skill': '^1.0.0' },
      }),
      buildPackage({
        name: 'y-skill',
        version: '1.0.0',
        dependencies: { 'shared-skill': '~1.2.0' },
      }),
      buildPackage({ name: 'shared-skill', version: '1.1.0' }),
      buildPackage({ name: 'shared-skill', version: '1.2.3' }),
      buildPackage({ name: 'shared-skill', version: '1.3.0' }),
    ]);

    const { order } = await new Resolver(source).resolve(refs('x-skill', 'y-skill'));
    const shared = order.find((skill) => skill.name === 'shared-skill')!;
    assert.equal(shared.version, '1.2.3');
  });

  it('reports a conflict with every constraint that produced it', async () => {
    const source = sourceOf([
      buildPackage({
        name: 'x-skill',
        version: '1.0.0',
        dependencies: { 'shared-skill': '^1.0.0' },
      }),
      buildPackage({
        name: 'y-skill',
        version: '1.0.0',
        dependencies: { 'shared-skill': '^2.0.0' },
      }),
      buildPackage({ name: 'shared-skill', version: '1.0.0' }),
      buildPackage({ name: 'shared-skill', version: '2.0.0' }),
    ]);

    await assert.rejects(
      () => new Resolver(source).resolve(refs('x-skill', 'y-skill')),
      (error: unknown) => {
        assert.ok(error instanceof AgentSkillsError);
        assert.equal(error.code, ErrorCode.DEPENDENCY_CONFLICT);
        const rendered = error.details.join('\n');
        assert.match(rendered, /x-skill@1\.0\.0/);
        assert.match(rendered, /y-skill@1\.0\.0/);
        assert.match(rendered, /\^1\.0\.0/);
        assert.match(rendered, /\^2\.0\.0/);
        return true;
      },
    );
  });

  it('detects a cycle and renders the path', async () => {
    const source = sourceOf([
      buildPackage({ name: 'a-skill', version: '1.0.0', dependencies: { 'b-skill': '^1.0.0' } }),
      buildPackage({ name: 'b-skill', version: '1.0.0', dependencies: { 'c-skill': '^1.0.0' } }),
      buildPackage({ name: 'c-skill', version: '1.0.0', dependencies: { 'a-skill': '^1.0.0' } }),
    ]);

    await assert.rejects(
      () => new Resolver(source).resolve(refs('a-skill')),
      (error: unknown) => {
        assert.ok(error instanceof AgentSkillsError);
        assert.equal(error.code, ErrorCode.DEPENDENCY_CYCLE);
        assert.match(error.details.join('\n'), /a-skill → b-skill → c-skill → a-skill/);
        return true;
      },
    );
  });

  it('detects a direct self-cycle through two packages', async () => {
    const source = sourceOf([
      buildPackage({ name: 'a-skill', version: '1.0.0', dependencies: { 'b-skill': '^1.0.0' } }),
      buildPackage({ name: 'b-skill', version: '1.0.0', dependencies: { 'a-skill': '^1.0.0' } }),
    ]);
    await assert.rejects(
      () => new Resolver(source).resolve(refs('a-skill')),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.DEPENDENCY_CYCLE,
    );
  });

  it('skips an optional dependency that cannot be resolved', async () => {
    const source = sourceOf([
      buildPackage({
        name: 'a-skill',
        version: '1.0.0',
        optionalDependencies: { 'nowhere-skill': '^1.0.0' },
      }),
    ]);

    const { order } = await new Resolver(source).resolve(refs('a-skill'));
    assert.deepEqual(
      order.map((skill) => skill.name),
      ['a-skill'],
    );
  });

  it('still fails when a required dependency is missing', async () => {
    const source = sourceOf([
      buildPackage({
        name: 'a-skill',
        version: '1.0.0',
        dependencies: { 'nowhere-skill': '^1.0.0' },
      }),
    ]);
    await assert.rejects(
      () => new Resolver(source).resolve(refs('a-skill')),
      (error: unknown) =>
        error instanceof AgentSkillsError && error.code === ErrorCode.SKILL_NOT_FOUND,
    );
  });

  it('excludes deprecated versions from a range, but keeps an exact pin resolvable', async () => {
    const packages = [
      buildPackage({ name: 'a-skill', version: '1.0.0' }),
      buildPackage({ name: 'a-skill', version: '1.1.0' }),
    ];

    const source = sourceOf(packages, { deprecated: ['a-skill@1.1.0'] });
    const ranged = await new Resolver(source).resolve(refs('a-skill'));
    assert.equal(ranged.order[0]!.version, '1.0.0');

    const pinned = await new Resolver(source).resolve(refs('a-skill@1.1.0'));
    assert.equal(pinned.order[0]!.version, '1.1.0');
  });

  it('honours lockfile pins for a bare name', async () => {
    const source = sourceOf([
      buildPackage({ name: 'a-skill', version: '1.0.0' }),
      buildPackage({ name: 'a-skill', version: '2.0.0' }),
    ]);

    const { order } = await new Resolver(source).resolve(refs('a-skill'), {
      pinned: { 'a-skill': v('1.0.0') },
    });
    assert.equal(order[0]!.version, '1.0.0');
  });

  it('lets an explicit @latest override a lockfile pin', async () => {
    const source = sourceOf([
      buildPackage({ name: 'a-skill', version: '1.0.0' }),
      buildPackage({ name: 'a-skill', version: '2.0.0' }),
    ]);

    const { order } = await new Resolver(source).resolve(refs('a-skill@latest'), {
      pinned: { 'a-skill': v('1.0.0') },
    });
    assert.equal(order[0]!.version, '2.0.0');
  });

  it('skips the dependency graph when asked', async () => {
    const source = sourceOf([
      buildPackage({ name: 'a-skill', version: '1.0.0', dependencies: { 'b-skill': '^1.0.0' } }),
      buildPackage({ name: 'b-skill', version: '1.0.0' }),
    ]);

    const { order } = await new Resolver(source).resolve(refs('a-skill'), {
      skipDependencies: true,
    });
    assert.deepEqual(
      order.map((skill) => skill.name),
      ['a-skill'],
    );
  });

  it('is deterministic regardless of the order the refs are given in', async () => {
    const packages = [
      buildPackage({
        name: 'x-skill',
        version: '1.0.0',
        dependencies: { 'shared-skill': '^1.0.0' },
      }),
      buildPackage({
        name: 'y-skill',
        version: '1.0.0',
        dependencies: { 'shared-skill': '^1.1.0' },
      }),
      buildPackage({ name: 'shared-skill', version: '1.1.0' }),
      buildPackage({ name: 'shared-skill', version: '1.2.0' }),
    ];

    const forward = await new Resolver(sourceOf(packages)).resolve(refs('x-skill', 'y-skill'));
    const backward = await new Resolver(sourceOf(packages)).resolve(refs('y-skill', 'x-skill'));

    assert.deepEqual(
      forward.order.map((skill) => `${skill.name}@${skill.version}`).sort(),
      backward.order.map((skill) => `${skill.name}@${skill.version}`).sort(),
    );
  });

  it('never installs the same skill twice from a diamond', async () => {
    const source = sourceOf([
      buildPackage({
        name: 'top-skill',
        version: '1.0.0',
        dependencies: { 'left-skill': '^1.0.0', 'right-skill': '^1.0.0' },
      }),
      buildPackage({
        name: 'left-skill',
        version: '1.0.0',
        dependencies: { 'base-skill': '^1.0.0' },
      }),
      buildPackage({
        name: 'right-skill',
        version: '1.0.0',
        dependencies: { 'base-skill': '^1.0.0' },
      }),
      buildPackage({ name: 'base-skill', version: '1.0.0' }),
    ]);

    const { order } = await new Resolver(source).resolve(refs('top-skill'));
    const names = order.map((skill) => skill.name);
    assert.equal(new Set(names).size, names.length);
    assert.ok(names.indexOf('base-skill') < names.indexOf('left-skill'));
  });
});
