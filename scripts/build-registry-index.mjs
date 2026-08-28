#!/usr/bin/env node
/**
 * Regenerates `registry/skills.yaml` from the packages under `skills/`.
 *
 * The index is a build artefact, not a hand-maintained file: integrity hashes must match the
 * package contents byte for byte, and keeping them in sync by hand is exactly the kind of job
 * that silently rots. CI runs this with `--check` and fails if the committed index has drifted.
 *
 *   node scripts/build-registry-index.mjs           # rewrite the index
 *   node scripts/build-registry-index.mjs --check   # verify it is up to date
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computePackageIntegrity,
  decodeText,
  loadPackageFromDirectory,
  satisfies,
  stringifyRegistryIndex,
} from '@jvm-expert/core';
import { NodeFileSystem, NodeHasher } from '@jvm-expert/node';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(repoRoot, 'skills');
const indexPath = join(repoRoot, 'registry', 'skills.yaml');

const fs = new NodeFileSystem();
const hasher = new NodeHasher();
const check = process.argv.includes('--check');

/**
 * Every other skill a package names in its own Markdown, split by how it names them.
 *
 * `table` is a routing-table row — "symptom -> owning skill" — which is a promise that the named
 * skill is where to go next. `prose` is the same promise written in a sentence: "`x` owns the
 * mechanism", "see `y` first". Both leave the reader stranded if the target is not installed,
 * but only the first can afford to be a dependency; see the two gates below.
 */
function mentionedNames(pkg) {
  const table = new Set();
  const prose = new Set();
  for (const file of pkg.files) {
    if (!file.path.endsWith('.md')) continue;
    // The depth ladder is laid out as tables too, but it maps a family at three depths rather
    // than sending the reader to one owner. Its rows are pointers, so they belong with prose.
    const isLadder = file.path.endsWith('references/depth-ladder.md');
    for (const line of decodeText(file.bytes).split('\n')) {
      const target = !isLadder && line.trimStart().startsWith('|') ? table : prose;
      for (const match of line.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/g)) target.add(match[1]);
    }
  }
  for (const name of table) prose.delete(name);
  return { table, prose };
}

const entries = await readdir(skillsDir, { withFileTypes: true });
const skills = [];
const dependencyRefs = [];
const descriptionDrift = [];
const routingTargets = [];

for (const entry of entries
  .filter((item) => item.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))) {
  const directory = join(skillsDir, entry.name);
  const { pkg } = await loadPackageFromDirectory(fs, directory, { strict: true });
  const { manifest } = pkg;

  if (manifest.name !== entry.name) {
    console.error(`error: ${directory} declares name "${manifest.name}"`);
    process.exit(1);
  }

  // `validate` only warns about this, because a drifted description still installs and works.
  // For our own packages it is a defect: the manifest description is the one that ships, so a
  // divergent frontmatter one is text no agent reads — including any trigger clause in it.
  const collapse = (value) =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  const frontmatterDescription = pkg.document.frontmatter?.description;
  if (
    frontmatterDescription !== undefined &&
    collapse(frontmatterDescription) !== collapse(manifest.description)
  ) {
    descriptionDrift.push(manifest.name);
  }

  const { table, prose } = mentionedNames(pkg);
  routingTargets.push({
    from: manifest.name,
    table,
    prose,
    installed: new Set(
      [...(manifest.dependencies ?? []), ...(manifest.optionalDependencies ?? [])].map(
        (ref) => ref.name,
      ),
    ),
    suggested: new Set(manifest.suggests ?? []),
  });

  dependencyRefs.push(
    ...[...(manifest.dependencies ?? []), ...(manifest.optionalDependencies ?? [])].map((ref) => ({
      from: manifest.name,
      to: ref.name,
      range: ref.version,
      optional: !(manifest.dependencies ?? []).includes(ref),
    })),
  );

  skills.push({
    name: manifest.name,
    description: manifest.description.replace(/\s+/g, ' ').trim(),
    keywords: manifest.keywords,
    latest: manifest.version,
    versions: [
      {
        version: manifest.version,
        path: `skills/${manifest.name}`,
        integrity: computePackageIntegrity(pkg, hasher),
        deprecated: false,
      },
    ],
  });
}

if (descriptionDrift.length > 0) {
  console.error(
    `error: ${descriptionDrift.length} package(s) whose SKILL.md description differs from the manifest:`,
  );
  for (const name of descriptionDrift) console.error(`  - ${name}`);
  console.error('Only the manifest description ships. Make them identical.');
  process.exit(1);
}

// `validate` checks a package in isolation and never resolves a semver range, so a dependency
// pinned to a major that no longer exists reports "Valid" and only fails at install time. This
// index is the one place that sees every published version at once, so the range check lives
// here. It is how four skills stayed uninstallable without any check going red.
const published = new Map(skills.map((skill) => [skill.name, skill.latest]));
const unresolvable = [];
for (const ref of dependencyRefs) {
  const version = published.get(ref.to);
  if (version === undefined) {
    if (!ref.optional)
      unresolvable.push(`${ref.from} depends on "${ref.to}", which is not published`);
    continue;
  }
  if (!satisfies(version, ref.range)) {
    unresolvable.push(
      `${ref.from} requires ${ref.to}@${ref.range}, but the only published version is ${version}`,
    );
  }
}
if (unresolvable.length > 0) {
  console.error(`error: ${unresolvable.length} dependency range(s) cannot be satisfied:`);
  for (const line of unresolvable) console.error(`  - ${line}`);
  console.error('Widen the range in the dependent manifest, or publish a matching version.');
  process.exit(1);
}

// A routing table row is a promise: "this symptom is owned by that skill". The promise is only
// kept if the target is installed alongside, and `dependencies` is the only thing that makes
// that happen — nothing resolves a name found in a document. Both gates above look the other way
// round (is a declared dependency real?), which is how a hub shipped a 29-row routing table with
// three dependencies declared: every other row a dead end for anyone who installed it.
//
// The exception is a row the graph cannot express. Routing is mutual — a hub routes to its
// specialists and they route back — while `dependencies` must stay acyclic, so one direction of
// every cycle has to give way. Rather than keep a hand-written waiver list, this works out which
// edges those are: if the target already reaches back to this package through declared
// dependencies, declaring the row too would close a cycle, and `suggests` is the honest record.
const installEdges = new Map(routingTargets.map((entry) => [entry.from, entry.installed]));
const reaches = (from, to) => {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === to) return true;
    for (const next of installEdges.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
};

const undeclaredRouting = [];
const unsuggestedProse = [];
for (const { from, table, prose, installed, suggested } of routingTargets) {
  for (const target of table) {
    if (target === from || !published.has(target) || installed.has(target)) continue;
    if (reaches(target, from)) {
      // Declaring it would close a cycle. It still has to be written down somewhere.
      if (!suggested.has(target))
        undeclaredRouting.push(
          `${from} routes to "${target}", which cannot be a dependency without a cycle — list it under suggests`,
        );
      continue;
    }
    undeclaredRouting.push(`${from} routes to "${target}" without declaring it`);
  }
  // A hand-off in prose gets the weaker guarantee on purpose. Making these dependencies would
  // pull most of the catalogue into every install; `suggests` records the pointer without
  // resolving it, so a reader who lacks the target is told what to install rather than nothing.
  for (const target of prose) {
    if (target === from || !published.has(target)) continue;
    if (installed.has(target) || suggested.has(target)) continue;
    unsuggestedProse.push(`${from} points at "${target}" without declaring or suggesting it`);
  }
}
if (undeclaredRouting.length > 0) {
  console.error(`error: ${undeclaredRouting.length} routing target(s) are not declared:`);
  for (const line of undeclaredRouting) console.error(`  - ${line}`);
  console.error('Add each to `dependencies` in the routing package, or stop routing to it.');
  process.exit(1);
}
if (unsuggestedProse.length > 0) {
  console.error(`error: ${unsuggestedProse.length} document reference(s) are not declared:`);
  for (const line of unsuggestedProse.slice(0, 40)) console.error(`  - ${line}`);
  if (unsuggestedProse.length > 40) console.error(`  … and ${unsuggestedProse.length - 40} more`);
  console.error('Add each to `suggests`, or stop naming it.');
  process.exit(1);
}

const rendered = stringifyRegistryIndex({
  schemaVersion: 1,
  name: 'official',
  skills,
});

const header = [
  '# Generated by scripts/build-registry-index.mjs — do not edit by hand.',
  '# Run `npm run registry:build` after changing anything under skills/.',
  '',
].join('\n');

const document = header + rendered;

if (check) {
  const current = await readFile(indexPath, 'utf8').catch(() => '');
  if (current !== document) {
    console.error('error: registry/skills.yaml is out of date. Run: npm run registry:build');
    process.exit(1);
  }
  console.log(`registry/skills.yaml is up to date (${skills.length} skills)`);
} else {
  await writeFile(indexPath, document);
  console.log(`Wrote registry/skills.yaml with ${skills.length} skills`);
}
