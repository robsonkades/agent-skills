#!/usr/bin/env node
/**
 * Refuses a skill whose contents changed without its `version` moving.
 *
 * Nothing else catches this. `validate` sees one package and no history; `registry:build`
 * recomputes the integrity hash happily whatever the version says. So a correction can ship
 * under a version that is already published, and that breaks in two silent ways: a consumer
 * holding a lockfile pinned to the old hash fails integrity verification, and a consumer who
 * already installed that version never receives the change at all.
 *
 * The baseline is the last committed `registry/skills.yaml` — the published record. Commit the
 * index and the baseline advances with it.
 *
 *   node scripts/check-version-bumps.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computePackageIntegrity,
  loadPackageFromDirectory,
  parseRegistryIndex,
} from '@jvm-expert/core';
import { NodeFileSystem, NodeHasher } from '@jvm-expert/node';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(repoRoot, 'skills');

const fs = new NodeFileSystem();
const hasher = new NodeHasher();

/** The committed index, or undefined when there is no history to compare against. */
function committedIndex() {
  try {
    const yaml = execFileSync('git', ['show', 'HEAD:registry/skills.yaml'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseRegistryIndex(yaml, 'HEAD:registry/skills.yaml');
  } catch {
    return undefined;
  }
}

const baseline = committedIndex();
if (baseline === undefined) {
  console.log('version bumps: no committed registry index to compare against — skipped');
  process.exit(0);
}

const published = new Map();
for (const skill of baseline.skills) {
  for (const version of skill.versions) {
    published.set(`${skill.name}@${version.version}`, version.integrity);
  }
}

const entries = await readdir(skillsDir, { withFileTypes: true });
const stale = [];
let compared = 0;

for (const entry of entries.filter((item) => item.isDirectory()).sort()) {
  const { pkg } = await loadPackageFromDirectory(fs, join(skillsDir, entry.name), { strict: true });
  const { name, version } = pkg.manifest;

  const was = published.get(`${name}@${version}`);
  if (was === undefined) continue; // new package, or the version already moved
  compared++;

  const now = computePackageIntegrity(pkg, hasher);
  if (was !== now) stale.push({ name, version, was, now });
}

if (stale.length > 0) {
  console.error(`error: ${stale.length} skill(s) changed without a version bump:`);
  for (const s of stale) {
    console.error(`  - ${s.name}@${s.version}`);
    console.error(`      published ${s.was}`);
    console.error(`      current   ${s.now}`);
  }
  console.error('');
  console.error('A published version is immutable. Bump the version in skill.yaml, then run:');
  console.error('  npm run registry:build');
  process.exit(1);
}

console.log(`version bumps: OK — ${compared} skill version(s) checked against the committed index`);
