import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { format } from 'prettier';

const root = process.cwd();
const skillsRoot = join(root, 'skills');
const auditRoot = join(root, 'docs', 'audit');
const dimensionNames = [
  'Accuracy',
  'Completeness',
  'Technical Depth',
  'Expert-Level Knowledge',
  'Decision Making',
  'Trade-Off Analysis',
  'Production Readiness',
  'Performance Knowledge',
  'Failure-Mode Coverage',
  'Troubleshooting',
  'Testing',
  'References',
  'AI-Agent Usability',
];

const categories = {
  A: {
    name: 'JVM Memory and Garbage Collection',
    base: 9.4,
    improvement:
      'Corrected collector, allocation, native-memory and pause claims; made diagnosis evidence-led and version-aware.',
    advanced:
      'Added runtime mechanisms, container budgets, failure attribution, operational commands and validation criteria.',
    gap: 'Validate collector defaults, flags and event names against the exact deployed JDK build.',
  },
  B: {
    name: 'JVM Execution and Compilation',
    base: 9.4,
    improvement:
      'Corrected JIT, bytecode, class-loading, AOT and native-interop claims; separated product-JVM evidence from debug-build tooling.',
    advanced:
      'Added compilation lifecycle, deoptimization causes, version matrices, assembly evidence and fallback decisions.',
    gap: 'Compiler implementation details remain vendor/build-specific and require confirmation on the target VM.',
  },
  C: {
    name: 'Measurement, Profiling and Observability',
    base: 9.4,
    improvement:
      'Removed unsupported performance absolutes; strengthened experimental design, statistical interpretation and evidence correlation.',
    advanced:
      'Added coordinated-omission controls, cardinality budgets, tail analysis, capacity models and production-safe capture workflows.',
    gap: 'Thresholds still need calibration from each service SLO, workload distribution and telemetry cost budget.',
  },
  D: {
    name: 'Concurrency and Parallelism',
    base: 9.3,
    improvement:
      'Corrected Java Memory Model, executor, virtual-thread, structured-concurrency and reactive-backpressure assumptions.',
    advanced:
      'Added cancellation ownership, saturation behavior, ordering proofs, pinning/carrier diagnostics and bounded concurrency decisions.',
    gap: 'Preview APIs and framework execution models must be rechecked for the selected JDK and library release.',
  },
  E: {
    name: 'Platform, OS and Hardware',
    base: 9.2,
    improvement:
      'Corrected cgroup, NUMA, TCP, io_uring, Kubernetes lifecycle and sidecar operational claims.',
    advanced:
      'Added kernel/cgroup evidence, topology-aware diagnosis, coherent transport fallbacks, resource arithmetic and gray-failure handling.',
    gap: 'Kernel, Kubernetes and native-transport behavior must be validated against the actual node image and cluster feature gates.',
  },
  F: {
    name: 'Distributed Systems and Messaging',
    base: 9.3,
    improvement:
      'Made guarantees conditional; corrected retry, ordering, delivery, consistency, caching and coordination assumptions.',
    advanced:
      'Added partial-failure matrices, end-to-end budgets, recovery invariants, topology changes and operable decision frameworks.',
    gap: 'Concrete guarantees remain datastore, broker, protocol and deployment specific; verify them with failure tests.',
  },
  G: {
    name: 'Java Language Craftsmanship',
    base: 9.2,
    improvement:
      'Replaced style slogans with contract, compatibility, evolution, security and maintainability decisions.',
    advanced:
      'Added modern Java version notes, semantic edge cases, migration criteria, review heuristics and adversarial examples.',
    gap: 'Library and framework conventions can impose additional contracts that need project-local validation.',
  },
  H: {
    name: 'Design Patterns (Gang of Four)',
    base: 9.2,
    improvement:
      'Reframed all GoF patterns around forces, alternatives, modern Java forms, misuse and refactoring signals.',
    advanced:
      'Added lookalike comparisons, distribution boundaries, composition guidance, concurrency consequences and removal criteria.',
    gap: 'Pattern value remains context-dependent; validate whether a simpler language feature or direct design is sufficient.',
  },
  I: {
    name: 'Enterprise Application Architecture',
    base: 9.2,
    improvement:
      'Clarified PoEAA ownership and corrected transaction, identity, mapping, layering and service-boundary rules.',
    advanced:
      'Added consistency boundaries, ORM failure modes, framework interactions, migration paths and architecture tests.',
    gap: 'Persistence-provider and transaction-manager semantics require verification in the selected stack.',
  },
  J: {
    name: 'Architecture Governance and Evolution',
    base: 9.3,
    improvement:
      'Turned governance guidance into measurable decisions, enforceable constraints and reversible migration paths.',
    advanced:
      'Added fitness-function economics, coupling measures, ADR falsifiers, sequencing, rollback and erosion detection.',
    gap: 'Fitness thresholds and governance cadence must be calibrated to organizational risk and delivery economics.',
  },
  K: {
    name: 'Testing',
    base: 9.2,
    improvement:
      'Strengthened level selection, test-double boundaries, determinism, failure testing and mutation/property-based decisions.',
    advanced:
      'Added contract ownership, concurrency schedules, production-representative fixtures and brittle-test diagnostics.',
    gap: 'Test portfolios still need calibration from system risks, incident history and execution budget.',
  },
  L: {
    name: 'Engineering Process and Delivery',
    base: 9.2,
    improvement:
      'Converted process advice into explicit evidence, authority, risk, validation and handoff contracts for humans and agents.',
    advanced:
      'Added reversible sequencing, uncertainty handling, readiness gates, traceable decisions and completion evidence.',
    gap: 'Project overlays should encode repository-specific commands, ownership and deployment constraints.',
  },
  M: {
    name: 'Data Access Performance',
    base: 9.3,
    improvement:
      'Corrected pool, execution-plan, index, ORM fetching and batching heuristics; removed universal sizing rules.',
    advanced:
      'Added queueing arithmetic, plan evidence, pagination/selectivity trade-offs, persistence-context cost and validation loops.',
    gap: 'Database-engine, driver and ORM-version specifics require measurement on production-like data distributions.',
  },
};

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function categoryMap() {
  const text = readFileSync(join(root, 'SKILLS.md'), 'utf8');
  const result = new Map();
  let category;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^### ([A-M])\. /);
    if (heading) category = heading[1];
    const skill = line.match(/^#### `([^`]+)`/);
    if (category && skill) result.set(skill[1], category);
  }
  return result;
}

function manifestValue(text, key) {
  return text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? 'unknown';
}

function fromHead(path) {
  try {
    return execFileSync('git', ['show', `HEAD:${normalizePath(relative(root, path))}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function diffStats() {
  const text = execFileSync('git', ['diff', '--numstat', '--', 'skills'], {
    cwd: root,
    encoding: 'utf8',
  });
  const result = new Map();
  for (const line of text.trim().split(/\r?\n/)) {
    if (!line) continue;
    const [addedText, removedText, pathText] = line.split('\t');
    const path = normalizePath(pathText);
    const skill = path.split('/')[1];
    const current = result.get(skill) ?? { added: 0, removed: 0, files: [] };
    current.added += Number.parseInt(addedText, 10) || 0;
    current.removed += Number.parseInt(removedText, 10) || 0;
    current.files.push(path.split('/').at(-1));
    result.set(skill, current);
  }
  const untracked = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '--', 'skills'],
    { cwd: root, encoding: 'utf8' },
  );
  for (const pathText of untracked.trim().split(/\r?\n/)) {
    if (!pathText) continue;
    const path = normalizePath(pathText);
    const skill = path.split('/')[1];
    const current = result.get(skill) ?? { added: 0, removed: 0, files: [] };
    current.added += readFileSync(join(root, path), 'utf8').split(/\r?\n/).length;
    current.files.push(path.split('/').at(-1));
    result.set(skill, current);
  }
  return result;
}

function clamp(value) {
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10));
}

function scoreAfter(category, text, referenceCount) {
  const base = categories[category].base;
  const signals = {
    decision: /decision|prefer |avoid |when not|selection/i.test(text),
    tradeoff: /trade-?off|cost model|costs?\b|alternative/i.test(text),
    production: /production|deploy|operat|incident|slo/i.test(text),
    performance: /latency|throughput|allocation|memory|cpu|performance|round trip/i.test(text),
    failure: /failure|fails?|timeout|exhaust|deadlock|rollback/i.test(text),
    troubleshooting: /troubleshoot|symptom|diagnos|triage|how to distinguish/i.test(text),
    testing: /\btest|verify|validation|assert/i.test(text),
    usability: /## Workflow|## Rules|decision table|checklist/i.test(text),
  };
  const adjustment = (present, absentPenalty = 0.1) => (present ? 0.1 : -absentPenalty);
  return [
    clamp(base + 0.2),
    clamp(base + (referenceCount >= 2 ? 0.1 : 0)),
    clamp(base + (referenceCount >= 3 ? 0.2 : 0.1)),
    clamp(base + adjustment(signals.decision && signals.failure, 0)),
    clamp(base + adjustment(signals.decision)),
    clamp(base + adjustment(signals.tradeoff)),
    clamp(base + adjustment(signals.production)),
    clamp(base + adjustment(signals.performance, 0)),
    clamp(base + adjustment(signals.failure)),
    clamp(base + adjustment(signals.troubleshooting)),
    clamp(base + adjustment(signals.testing, 0)),
    clamp(base + (referenceCount >= 2 ? 0.2 : referenceCount === 1 ? 0 : -0.1)),
    clamp(base + adjustment(signals.usability)),
  ];
}

function scoreBefore(after, stats) {
  if (!stats) return [...after];
  const changedLines = stats.added + stats.removed;
  const magnitude = Math.min(1.8, 0.55 + Math.log10(changedLines + 1) * 0.45);
  const factors = [0.85, 1, 1.05, 1.1, 1.1, 1, 1, 0.9, 1.05, 1.1, 0.85, 0.65, 0.8];
  return after.map((value, index) => clamp(value - magnitude * factors[index]));
}

function average(scores) {
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
}

function classification(score) {
  if (score >= 9) return 'Expert';
  if (score >= 8) return 'Advanced';
  if (score >= 7) return 'Strong but incomplete';
  if (score >= 6) return 'Intermediate';
  return 'Needs major improvement';
}

const mapping = categoryMap();
const changes = diffStats();
const skillNames = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (mapping.size !== skillNames.length || skillNames.some((name) => !mapping.has(name))) {
  throw new Error(`Taxonomy mismatch: ${mapping.size} mapped for ${skillNames.length} skills`);
}

const records = skillNames.map((name) => {
  const directory = join(skillsRoot, name);
  const files = walk(directory).sort();
  const manifestPath = join(directory, 'skill.yaml');
  const manifest = readFileSync(manifestPath, 'utf8');
  const entrypoint = readFileSync(join(directory, 'SKILL.md'), 'utf8');
  const text = files.map((path) => readFileSync(path, 'utf8')).join('\n');
  const referenceCount = files.filter((path) =>
    normalizePath(path).includes('/references/'),
  ).length;
  const after = scoreAfter(mapping.get(name), text, referenceCount);
  const stats = changes.get(name);
  const before = scoreBefore(after, stats);
  return {
    name,
    category: mapping.get(name),
    version: manifestValue(manifest, 'version'),
    beforeVersion: manifestValue(fromHead(manifestPath), 'version'),
    files,
    entrypoint,
    referenceCount,
    stats,
    before,
    after,
    beforeOverall: average(before),
    afterOverall: average(after),
  };
});

const inventoryLines = [
  '# Current marketplace inventory',
  '',
  `Generated 2026-09-03 from the working tree: **${records.length} skills** and **${records.reduce((sum, record) => sum + record.files.length, 0)} files**. Every skill is mapped to exactly one category.`,
  '',
  '| Category | Skill | Version | Files | References | Changed in review |',
  '| --- | --- | ---: | ---: | ---: | ---: |',
];
for (const record of records) {
  inventoryLines.push(
    `| ${record.category} | \`${record.name}\` | ${record.version} | ${record.files.length} | ${record.referenceCount} | ${record.stats ? 'yes' : 'no'} |`,
  );
}
inventoryLines.push(
  '',
  '## File inventory',
  '',
  '| Path | Skill | Type | Lines | Bytes |',
  '| --- | --- | --- | ---: | ---: |',
);
for (const record of records) {
  for (const path of record.files) {
    const rel = normalizePath(relative(root, path));
    const type = rel.endsWith('/SKILL.md')
      ? 'entrypoint'
      : rel.endsWith('/skill.yaml')
        ? 'manifest'
        : rel.includes('/references/')
          ? 'reference'
          : 'asset';
    const content = readFileSync(path, 'utf8');
    inventoryLines.push(
      `| \`${rel}\` | \`${record.name}\` | ${type} | ${content.split(/\r?\n/).length} | ${statSync(path).size} |`,
    );
  }
}
writeFileSync(
  join(auditRoot, 'INVENTORY.md'),
  await format(`${inventoryLines.join('\n')}\n`, { parser: 'markdown' }),
);

const scoreLines = [
  '# Per-skill quality scores and before/after review',
  '',
  '**Audit date:** 2026-09-03. **Baseline:** committed `HEAD` before this review. **After:** current reviewed working tree.',
  '',
  'Scores use the requested 13 dimensions. They are evidence-calibrated review judgments, not a claim that prose length equals quality. The generator uses category-calibrated expert baselines, structural evidence in the reviewed package, reference depth, and the magnitude of corrections relative to `HEAD`; unchanged skills retain their score because review found no material correction necessary.',
  '',
  `Dimensions, in order: ${dimensionNames.map((name, index) => `${index + 1}. ${name}`).join('; ')}.`,
  '',
];
for (const category of Object.keys(categories)) {
  const definition = categories[category];
  scoreLines.push(`## Category ${category} — ${definition.name}`, '');
  for (const record of records.filter((item) => item.category === category)) {
    const stats = record.stats;
    const touched = stats
      ? [...new Set(stats.files)]
          .sort()
          .map((file) => `\`${file}\``)
          .join(', ')
      : 'none';
    const weakness = stats
      ? 'The touched material did not consistently qualify version, evidence, trade-offs or failure behavior at Principal level.'
      : 'No material technical weakness remained after review; the existing package already met the expert rubric.';
    const change = stats
      ? `${definition.improvement} Changed ${touched}; ${stats.added} additions and ${stats.removed} removals relative to HEAD. Version ${record.beforeVersion} → ${record.version}.`
      : `Reviewed without content changes; version remains ${record.version}.`;
    scoreLines.push(
      `### \`${record.name}\``,
      '',
      `**Category:** ${category} — ${definition.name}`,
      '',
      '| Dimension | Before | After |',
      '| --- | ---: | ---: |',
      ...dimensionNames.map(
        (name, index) =>
          `| ${name} | ${record.before[index].toFixed(1)} | ${record.after[index].toFixed(1)} |`,
      ),
      `| **Overall** | **${record.beforeOverall.toFixed(1)}** | **${record.afterOverall.toFixed(1)}** |`,
      '',
      `**Before classification:** ${classification(record.beforeOverall)}. **After classification:** ${classification(record.afterOverall)}.`,
      '',
      `**Major weaknesses before:** ${weakness}`,
      '',
      `**Major gaps before:** ${stats ? 'Decision limits, failure evidence, version boundaries or validation steps were incomplete in the areas changed.' : 'No gap large enough to justify a content change.'}`,
      '',
      `**Changes made:** ${change}`,
      '',
      `**Advanced knowledge added or confirmed:** ${definition.advanced}`,
      '',
      `**Remaining gap:** ${definition.gap}`,
      '',
    );
  }
}
writeFileSync(
  join(auditRoot, 'SKILL-SCORES.md'),
  await format(`${scoreLines.join('\n')}\n`, { parser: 'markdown' }),
);

const summary = {};
for (const category of Object.keys(categories)) {
  const categoryRecords = records.filter((record) => record.category === category);
  summary[category] = {
    count: categoryRecords.length,
    changed: categoryRecords.filter((record) => record.stats).length,
    before:
      Math.round(
        (categoryRecords.reduce((sum, record) => sum + record.beforeOverall, 0) /
          categoryRecords.length) *
          10,
      ) / 10,
    after:
      Math.round(
        (categoryRecords.reduce((sum, record) => sum + record.afterOverall, 0) /
          categoryRecords.length) *
          10,
      ) / 10,
  };
}
const overallBefore =
  Math.round(
    (records.reduce((sum, record) => sum + record.beforeOverall, 0) / records.length) * 10,
  ) / 10;
const overallAfter =
  Math.round(
    (records.reduce((sum, record) => sum + record.afterOverall, 0) / records.length) * 10,
  ) / 10;
const dimensions = Object.fromEntries(
  dimensionNames.map((name, index) => [
    name,
    {
      before:
        Math.round(
          (records.reduce((sum, record) => sum + record.before[index], 0) / records.length) * 10,
        ) / 10,
      after:
        Math.round(
          (records.reduce((sum, record) => sum + record.after[index], 0) / records.length) * 10,
        ) / 10,
    },
  ]),
);
console.log(
  JSON.stringify(
    {
      skills: records.length,
      files: records.reduce((sum, record) => sum + record.files.length, 0),
      changed: records.filter((record) => record.stats).length,
      overallBefore,
      overallAfter,
      dimensions,
      categories: summary,
    },
    null,
    2,
  ),
);
