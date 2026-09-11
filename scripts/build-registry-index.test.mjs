import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPackage } from '@jvm-expert/core/testing';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const builder = readFileSync(join(repoRoot, 'scripts', 'build-registry-index.mjs'), 'utf8');
const table = (owner) => `| Question | Owner |\n| --- | --- |\n| Example | \`${owner}\` |`;

// Execute the real builder against small catalogs. Only package import locations change;
// the copied script still discovers its catalog relative to its own file.
let isolatedBuilder = builder;
for (const name of ['core', 'node']) {
  const specifier = `from '@jvm-expert/${name}'`;
  assert.equal(isolatedBuilder.split(specifier).length, 2, `Expected one ${name} import`);
  isolatedBuilder = isolatedBuilder.replace(
    specifier,
    `from '${pathToFileURL(join(repoRoot, 'packages', name, 'dist', 'index.js')).href}'`,
  );
}

const cases = [
  {
    name: 'rejects undeclared single-word routing targets',
    target: 'debugging',
    body: table('debugging'),
    error: 'routes to "debugging" without declaring it',
  },
  {
    name: 'accepts a single-word routing dependency',
    target: 'debugging',
    body: table('debugging'),
    dependencies: { debugging: '^1.0.0' },
  },
  {
    name: 'rejects an undeclared single-word prose handoff',
    target: 'idempotency',
    body: 'Use `idempotency` for safe replay.',
    error: 'points at "idempotency" without declaring or suggesting it',
  },
  {
    name: 'accepts a suggested single-word prose handoff',
    target: 'idempotency',
    body: 'Use `idempotency` for safe replay.',
    suggests: 'idempotency',
  },
  {
    name: 'does not excuse a routing suggestion without a reverse dependency path',
    target: 'safepoints',
    body: table('safepoints'),
    suggests: 'safepoints',
    error: 'routes to "safepoints" without declaring it',
  },
  {
    name: 'accepts a routing suggestion when a dependency would close a cycle',
    target: 'safepoints',
    body: table('safepoints'),
    suggests: 'safepoints',
    reverseDependency: true,
  },
  {
    name: 'still requires a suggestion when the reverse dependency exists',
    target: 'safepoints',
    body: table('safepoints'),
    reverseDependency: true,
    error: 'cannot be a dependency without a cycle — list it under suggests',
  },
  {
    name: 'accepts a depth-ladder suggestion without forcing a dependency',
    target: 'tdd',
    body: 'See [the depth ladder](references/depth-ladder.md).',
    suggests: 'tdd',
    extraFiles: { 'references/depth-ladder.md': table('tdd') },
  },
  {
    name: 'continues rejecting undeclared hyphenated routing targets',
    target: 'test-design',
    body: table('test-design'),
    error: 'routes to "test-design" without declaring it',
  },
  {
    name: 'ignores self references and names outside the catalog',
    target: 'debugging',
    body: 'The `fixture-owner` example uses `imaginary` and `not-a-published-skill` labels.',
  },
];

for (const scenario of cases) {
  test(scenario.name, (t) => {
    const tempRoot = resolve(tmpdir());
    const workspace = mkdtempSync(join(tempRoot, 'agent-skills-index-test-'));
    t.after(() => {
      const withinTemp = relative(tempRoot, resolve(workspace));
      assert.ok(withinTemp && !withinTemp.startsWith('..') && !isAbsolute(withinTemp));
      assert.ok(withinTemp.startsWith('agent-skills-index-test-'));
      rmSync(workspace, { recursive: true, force: true });
    });
    mkdirSync(join(workspace, 'scripts'));
    mkdirSync(join(workspace, 'registry'));
    const script = join(workspace, 'scripts', 'build-registry-index.mjs');
    writeFileSync(script, isolatedBuilder);
    for (const spec of [
      {
        name: 'fixture-owner',
        version: '1.0.0',
        body: scenario.body,
        dependencies: scenario.dependencies,
        manifestExtras: scenario.suggests ? `suggests:\n  - ${scenario.suggests}` : undefined,
        extraFiles: scenario.extraFiles,
      },
      {
        name: scenario.target,
        version: '1.0.0',
        dependencies: scenario.reverseDependency ? { 'fixture-owner': '^1.0.0' } : undefined,
      },
    ]) {
      for (const file of buildPackage(spec).files) {
        const target = join(workspace, 'skills', spec.name, file.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.bytes);
      }
    }
    const result = spawnSync(process.execPath, [script], {
      cwd: workspace,
      encoding: 'utf8',
      timeout: 15_000,
      windowsHide: true,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, scenario.error ? 1 : 0, result.stdout + result.stderr);
    if (scenario.error) {
      assert.ok(result.stderr.includes(scenario.error), result.stderr);
    } else {
      assert.match(result.stdout, /Wrote registry\/skills\.yaml with 2 skills/);
      assert.match(
        readFileSync(join(workspace, 'registry', 'skills.yaml'), 'utf8'),
        /fixture-owner/,
      );
    }
  });
}
