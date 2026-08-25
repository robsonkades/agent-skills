#!/usr/bin/env node
/**
 * Enforces the dependency rule from ARCHITECTURE.md §2.
 *
 * The architecture's central claim — "adding an agent needs no change to core" — is only
 * worth anything if it is checked. Without this script the boundaries erode one convenient
 * import at a time, and nobody notices until the day someone tries to write an adapter.
 *
 *   node scripts/check-boundaries.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Which workspace packages each package may import. */
const ALLOWED_PACKAGE_DEPS = {
  core: [],
  node: ['core'],
  registry: ['core'],
  installer: ['core'],
  'adapter-claude': ['core'],
  'adapter-codex': ['core'],
  cli: ['core', 'node', 'registry', 'installer', 'adapter-claude', 'adapter-codex'],
};

/**
 * Which Node built-ins each package may import.
 *
 * `core` gets none: the domain must stay runtime-free, which is what lets it be tested
 * without a filesystem and reused from a non-Node runtime.
 *
 * Adapters get `node:path` only. Path algebra is pure computation, and adapters produce
 * OS-native paths by nature; all *I/O* still goes through the ports handed to `detect`.
 */
const ALLOWED_BUILTINS = {
  core: [],
  node: null, // infrastructure: anything goes, that is its job
  registry: [],
  installer: [],
  'adapter-claude': ['node:path'],
  'adapter-codex': ['node:path'],
  cli: ['node:path', 'node:url', 'node:process'],
};

/** Third-party packages allowed outside the infrastructure layer, with the reason. */
const ALLOWED_EXTERNAL = {
  core: ['semver', 'yaml'], // pure computation, no I/O
  registry: [],
  installer: [],
  'adapter-claude': [],
  'adapter-codex': ['yaml'],
  node: null,
  cli: null,
};

const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_PATTERN = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

const violations = [];

for (const pkg of Object.keys(ALLOWED_PACKAGE_DEPS)) {
  const srcDir = join(repoRoot, 'packages', pkg, 'src');
  for (const file of walk(srcDir)) {
    const source = readFileSync(file, 'utf8');
    for (const specifier of specifiersIn(source)) {
      check(pkg, file, specifier);
    }
  }
}

if (violations.length > 0) {
  console.error('Architecture boundary violations:\n');
  for (const violation of violations) {
    console.error(`  ${relative(repoRoot, violation.file).split(sep).join('/')}`);
    console.error(`    imports ${violation.specifier}`);
    console.error(`    ${violation.reason}\n`);
  }
  console.error(`${violations.length} violation(s). See ARCHITECTURE.md §2.`);
  process.exit(1);
}

console.log(
  `Architecture boundaries OK (${Object.keys(ALLOWED_PACKAGE_DEPS).length} packages checked)`,
);

function check(pkg, file, specifier) {
  if (specifier.startsWith('.')) return; // intra-package

  if (specifier.startsWith('node:')) {
    const allowed = ALLOWED_BUILTINS[pkg];
    if (allowed === null) return;
    // `node:path` inside core would give the domain OS-specific separator semantics.
    if (!allowed.includes(specifier)) {
      violations.push({
        file,
        specifier,
        reason:
          allowed.length === 0
            ? `"${pkg}" must not import Node built-ins; use a port from @jvm-expert/core`
            : `"${pkg}" may only import ${allowed.join(', ')}`,
      });
    }
    return;
  }

  if (specifier.startsWith('@jvm-expert/')) {
    const target = specifier.slice('@jvm-expert/'.length).split('/')[0];
    if (!ALLOWED_PACKAGE_DEPS[pkg].includes(target)) {
      violations.push({
        file,
        specifier,
        reason: `"${pkg}" may not depend on "${target}" (allowed: ${
          ALLOWED_PACKAGE_DEPS[pkg].join(', ') || 'nothing'
        })`,
      });
    }
    return;
  }

  const allowed = ALLOWED_EXTERNAL[pkg];
  if (allowed === null) return;
  const name = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];

  if (!allowed.includes(name)) {
    violations.push({
      file,
      specifier,
      reason:
        allowed.length === 0
          ? `"${pkg}" must not take third-party dependencies`
          : `"${pkg}" may only depend on ${allowed.join(', ')}`,
    });
  }
}

function specifiersIn(source) {
  const found = new Set();
  for (const pattern of [IMPORT_PATTERN, DYNAMIC_IMPORT_PATTERN]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) found.add(match[1]);
  }
  return found;
}

function* walk(directory) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith('.ts')) yield full;
  }
}
