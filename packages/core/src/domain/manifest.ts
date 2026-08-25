import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { AgentSkillsError, ErrorCode } from './errors.ts';
import { validateSkillName } from './skill-ref.ts';
import { parseRange, parseVersion, type SemanticVersion } from './version.ts';
import { escapesRoot, normalize } from './posix-path.ts';
import { IssueCollector, type ValidationIssue } from './validation.ts';

/**
 * The package format version. Bumped only for genuinely breaking changes; additive fields
 * ship as optional under the current number (ARCHITECTURE.md §8).
 */
export const CURRENT_SCHEMA_VERSION = 1;

export const MANIFEST_FILENAME = 'skill.yaml';
export const SKILL_ENTRYPOINT = 'SKILL.md';
export const COMMAND_ENTRYPOINT = 'COMMAND.md';
export const WORKFLOW_ENTRYPOINT = 'WORKFLOW.js';

/**
 * What the package *is*, which decides where an agent stores it and how it is invoked: a
 * skill is model-selected, a command is user-invoked, a workflow is a script the agent runs
 * by name. Everything else about the format — manifest, integrity, dependencies, receipts —
 * is identical across kinds.
 */
export const PACKAGE_KINDS = ['skill', 'command', 'workflow'] as const;
export type PackageKind = (typeof PACKAGE_KINDS)[number];

/** Packages published before `kind` existed are skills. */
export const DEFAULT_PACKAGE_KIND: PackageKind = 'skill';

/** The agent-facing entrypoint document for a kind. */
export function entrypointFor(kind: PackageKind): string {
  if (kind === 'command') return COMMAND_ENTRYPOINT;
  if (kind === 'workflow') return WORKFLOW_ENTRYPOINT;
  return SKILL_ENTRYPOINT;
}

export interface SkillAuthor {
  readonly name: string;
  readonly email?: string;
  readonly url?: string;
}

export interface SkillRepository {
  readonly type: string;
  readonly url: string;
  /** Sub-directory inside the repository holding the package. */
  readonly directory?: string;
}

export interface AgentCompatibility {
  readonly id: string;
  /** Semver range against the agent's own version, enforced when detection can supply one. */
  readonly minVersion?: string;
}

export interface SkillDependency {
  readonly name: string;
  readonly version: string;
}

export interface SkillManifest {
  readonly schemaVersion: number;
  readonly name: string;
  readonly kind: PackageKind;
  readonly version: SemanticVersion;
  readonly description: string;
  readonly license?: string;
  readonly keywords: readonly string[];
  readonly authors: readonly SkillAuthor[];
  readonly homepage?: string;
  readonly repository?: SkillRepository;
  /** Empty list means "compatible with every agent". */
  readonly compatibility: readonly AgentCompatibility[];
  readonly files: readonly string[];
  readonly dependencies: readonly SkillDependency[];
  readonly optionalDependencies: readonly SkillDependency[];
  readonly capabilities: readonly string[];
  readonly integrity?: string;
  readonly signatures: readonly unknown[];
  /** Presentation-only, per-agent metadata. Adapters allowlist the keys they accept. */
  readonly agentOverrides: Readonly<Record<string, Record<string, unknown>>>;
}

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'name',
  'kind',
  'version',
  'description',
  'license',
  'keywords',
  'authors',
  'homepage',
  'repository',
  'compatibility',
  'files',
  'dependencies',
  'optionalDependencies',
  'capabilities',
  'integrity',
  'signatures',
  'agentOverrides',
]);

function defaultFiles(kind: PackageKind): readonly string[] {
  return [entrypointFor(kind), MANIFEST_FILENAME];
}

export interface ParseManifestOptions {
  /** Path shown in error messages. */
  readonly source?: string;
  /** Unknown keys become errors rather than warnings. Used by `validate --strict` and `publish`. */
  readonly strict?: boolean;
}

export interface ParsedManifest {
  readonly manifest: SkillManifest;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Parses and normalises a `skill.yaml`.
 *
 * Throws {@link AgentSkillsError} for anything that makes the document unusable, and
 * returns non-fatal findings as issues so `validate` can show several problems at once
 * instead of one per run.
 */
export function parseManifest(text: string, options: ParseManifestOptions = {}): ParsedManifest {
  const source = options.source ?? MANIFEST_FILENAME;
  const issues = new IssueCollector();

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (cause) {
    throw new AgentSkillsError(ErrorCode.INVALID_MANIFEST, `Could not parse ${source}`, {
      details: [cause instanceof Error ? cause.message : String(cause)],
      hints: ['skill.yaml must be valid YAML'],
      cause,
      data: { source },
    });
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AgentSkillsError(ErrorCode.INVALID_MANIFEST, `${source} must be a YAML mapping`, {
      hints: ['Run `agent-skills create <name>` to generate a valid starting point'],
      data: { source },
    });
  }

  const doc = raw as Record<string, unknown>;

  const schemaVersion = readSchemaVersion(doc, source);
  const kind = readKind(doc, issues);
  const name = readRequiredString(doc, 'name', source);
  const nameProblems = validateSkillName(name);
  for (const problem of nameProblems) {
    issues.error('manifest.name.invalid', 'name', `Invalid name "${name}": ${problem}`);
  }

  const version = parseVersion(readRequiredString(doc, 'version', source), source);
  const description = readRequiredString(doc, 'description', source).trim();
  if (description.length < 10) {
    issues.warn(
      'manifest.description.short',
      'description',
      'Description is very short; agents route on it, so say what the skill covers and when to use it',
    );
  }

  const files = readFiles(doc, kind, issues);
  const dependencies = readDependencies(doc, 'dependencies', name, source, issues);
  const optionalDependencies = readDependencies(doc, 'optionalDependencies', name, source, issues);

  for (const key of Object.keys(doc)) {
    if (KNOWN_TOP_LEVEL_KEYS.has(key)) continue;
    const message = `Unknown field "${key}"`;
    const hint = 'Remove it, or upgrade the CLI if it belongs to a newer package format';
    if (options.strict) {
      issues.error('manifest.unknownField', key, message, hint);
    } else {
      issues.warn('manifest.unknownField', key, message, hint);
    }
  }

  const manifest: SkillManifest = {
    schemaVersion,
    name,
    kind,
    version,
    description,
    ...optionalString(doc, 'license'),
    keywords: readStringArray(doc, 'keywords', issues),
    authors: readAuthors(doc, issues),
    ...optionalString(doc, 'homepage'),
    ...readRepository(doc, issues),
    compatibility: readCompatibility(doc, source, issues),
    files,
    dependencies,
    optionalDependencies,
    capabilities: readStringArray(doc, 'capabilities', issues),
    ...optionalString(doc, 'integrity'),
    signatures: Array.isArray(doc['signatures']) ? (doc['signatures'] as unknown[]) : [],
    agentOverrides: readAgentOverrides(doc, issues),
  };

  if (manifest.license === undefined) {
    issues.warn(
      'manifest.license.missing',
      'license',
      'No license declared',
      'Add an SPDX identifier, e.g. license: Apache-2.0',
    );
  }

  return { manifest, issues: issues.all() };
}

function readSchemaVersion(doc: Record<string, unknown>, source: string): number {
  const value = doc['schemaVersion'];
  if (value === undefined) return CURRENT_SCHEMA_VERSION;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new AgentSkillsError(
      ErrorCode.INVALID_MANIFEST,
      `${source}: schemaVersion must be a positive integer`,
      { data: { source, schemaVersion: value } },
    );
  }
  if (value > CURRENT_SCHEMA_VERSION) {
    throw new AgentSkillsError(
      ErrorCode.UNSUPPORTED_SCHEMA,
      `This package uses skill format v${value}, but this CLI understands up to v${CURRENT_SCHEMA_VERSION}`,
      {
        hints: ['Upgrade the CLI: npm install -g @jvm-expert/agent-skills@latest'],
        data: { source, schemaVersion: value, supported: CURRENT_SCHEMA_VERSION },
      },
    );
  }
  return value;
}

/**
 * An unknown kind is reported rather than thrown, so `validate` lists it alongside the
 * package's other problems; treating it as a skill keeps the rest of the checks meaningful.
 */
function readKind(doc: Record<string, unknown>, issues: IssueCollector): PackageKind {
  const value = doc['kind'];
  if (value === undefined) return DEFAULT_PACKAGE_KIND;
  if (typeof value === 'string' && (PACKAGE_KINDS as readonly string[]).includes(value)) {
    return value as PackageKind;
  }
  issues.error(
    'manifest.kind.invalid',
    'kind',
    `Unknown kind "${String(value)}"`,
    `Accepted kinds: ${PACKAGE_KINDS.join(', ')}`,
  );
  return DEFAULT_PACKAGE_KIND;
}

function readRequiredString(doc: Record<string, unknown>, key: string, source: string): string {
  const value = doc[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AgentSkillsError(
      ErrorCode.INVALID_MANIFEST,
      `${source}: missing required field "${key}"`,
      {
        hints: [`Add a non-empty ${key}: to ${source}`],
        data: { source, field: key },
      },
    );
  }
  return value.trim();
}

function optionalString(doc: Record<string, unknown>, key: string): Record<string, string> {
  const value = doc[key];
  return typeof value === 'string' && value.trim() !== '' ? { [key]: value.trim() } : {};
}

function readStringArray(
  doc: Record<string, unknown>,
  key: string,
  issues: IssueCollector,
): readonly string[] {
  const value = doc[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.error(`manifest.${key}.type`, key, `"${key}" must be a list of strings`);
    return [];
  }
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      issues.error(`manifest.${key}.type`, key, `"${key}" entries must be strings`);
      continue;
    }
    result.push(entry.trim());
  }
  return result;
}

function readFiles(
  doc: Record<string, unknown>,
  kind: PackageKind,
  issues: IssueCollector,
): readonly string[] {
  const declared = readStringArray(doc, 'files', issues);
  const files = declared.length > 0 ? declared : defaultFiles(kind);
  const safe: string[] = [];

  for (const entry of files) {
    // Path safety is checked at authoring time, not only at extraction time: a manifest
    // must never be able to *describe* a path that escapes the package.
    if (entry.startsWith('/') || /^[a-zA-Z]:/.test(entry) || entry.startsWith('\\\\')) {
      issues.error(
        'manifest.files.absolute',
        'files',
        `"${entry}" is an absolute path; files entries must be relative to the package root`,
      );
      continue;
    }
    if (escapesRoot(entry)) {
      issues.error(
        'manifest.files.traversal',
        'files',
        `"${entry}" escapes the package root`,
        'Remove the ".." segments',
      );
      continue;
    }
    safe.push(normalize(entry.replace(/\/+$/, '')) + (entry.endsWith('/') ? '/' : ''));
  }

  const entrypoint = entrypointFor(kind);
  if (!safe.some((entry) => entry === entrypoint)) {
    issues.error(
      'manifest.files.missingEntrypoint',
      'files',
      `"files" must include ${entrypoint}`,
      `Add ${entrypoint} to the files list`,
    );
  }

  return safe;
}

function readDependencies(
  doc: Record<string, unknown>,
  key: string,
  selfName: string,
  source: string,
  issues: IssueCollector,
): readonly SkillDependency[] {
  const value = doc[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.error(`manifest.${key}.type`, key, `"${key}" must be a list`);
    return [];
  }

  const seen = new Set<string>();
  const result: SkillDependency[] = [];

  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.error(
        `manifest.${key}.type`,
        key,
        `"${key}" entries must be mappings with name and version`,
      );
      continue;
    }
    const record = entry as Record<string, unknown>;
    const name = record['name'];
    const version = record['version'];
    if (typeof name !== 'string') {
      issues.error(`manifest.${key}.name`, key, `A ${key} entry is missing "name"`);
      continue;
    }
    for (const problem of validateSkillName(name)) {
      issues.error(`manifest.${key}.name`, `${key}.${name}`, `Invalid dependency name: ${problem}`);
    }
    if (name === selfName) {
      issues.error(`manifest.${key}.self`, `${key}.${name}`, 'A skill cannot depend on itself');
      continue;
    }
    if (seen.has(name)) {
      issues.error(`manifest.${key}.duplicate`, `${key}.${name}`, `Duplicate dependency "${name}"`);
      continue;
    }
    seen.add(name);

    const rangeText = typeof version === 'string' && version.trim() !== '' ? version.trim() : '*';
    result.push({ name, version: parseRange(rangeText, `${source} ${key}.${name}`) });
  }

  return result;
}

function readAuthors(doc: Record<string, unknown>, issues: IssueCollector): readonly SkillAuthor[] {
  const value = doc['authors'];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.error('manifest.authors.type', 'authors', '"authors" must be a list');
    return [];
  }
  const authors: SkillAuthor[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      authors.push({ name: entry });
      continue;
    }
    if (entry === null || typeof entry !== 'object') {
      issues.error(
        'manifest.authors.type',
        'authors',
        'Author entries must be strings or mappings',
      );
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record['name'] !== 'string') {
      issues.error('manifest.authors.name', 'authors', 'Author entries need a "name"');
      continue;
    }
    authors.push({
      name: record['name'],
      ...optionalString(record, 'email'),
      ...optionalString(record, 'url'),
    });
  }
  return authors;
}

function readRepository(
  doc: Record<string, unknown>,
  issues: IssueCollector,
): { repository?: SkillRepository } {
  const value = doc['repository'];
  if (value === undefined) return {};
  if (typeof value === 'string') return { repository: { type: 'git', url: value } };
  if (typeof value !== 'object' || Array.isArray(value)) {
    issues.error(
      'manifest.repository.type',
      'repository',
      '"repository" must be a mapping or a URL',
    );
    return {};
  }
  const record = value as Record<string, unknown>;
  const url = record['url'];
  if (typeof url !== 'string') {
    issues.error('manifest.repository.url', 'repository', '"repository" needs a "url"');
    return {};
  }
  return {
    repository: {
      type: typeof record['type'] === 'string' ? (record['type'] as string) : 'git',
      url,
      ...optionalString(record, 'directory'),
    },
  };
}

function readCompatibility(
  doc: Record<string, unknown>,
  source: string,
  issues: IssueCollector,
): readonly AgentCompatibility[] {
  const value = doc['compatibility'];
  if (value === undefined) return [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    issues.error(
      'manifest.compatibility.type',
      'compatibility',
      '"compatibility" must be a mapping',
    );
    return [];
  }
  const agents = (value as Record<string, unknown>)['agents'];
  if (agents === undefined) return [];
  if (!Array.isArray(agents)) {
    issues.error(
      'manifest.compatibility.agents',
      'compatibility.agents',
      '"compatibility.agents" must be a list',
    );
    return [];
  }

  const result: AgentCompatibility[] = [];
  for (const entry of agents) {
    if (typeof entry === 'string') {
      result.push({ id: entry });
      continue;
    }
    if (entry === null || typeof entry !== 'object') {
      issues.error(
        'manifest.compatibility.agents',
        'compatibility.agents',
        'Agent entries must be an id string or a mapping with "id"',
      );
      continue;
    }
    const record = entry as Record<string, unknown>;
    const id = record['id'];
    if (typeof id !== 'string') {
      issues.error(
        'manifest.compatibility.agents',
        'compatibility.agents',
        'Agent entries need an "id"',
      );
      continue;
    }
    const minVersion = record['minVersion'];
    result.push({
      id,
      ...(typeof minVersion === 'string'
        ? { minVersion: parseRange(minVersion, `${source} compatibility.agents.${id}`) }
        : {}),
    });
  }
  return result;
}

function readAgentOverrides(
  doc: Record<string, unknown>,
  issues: IssueCollector,
): Readonly<Record<string, Record<string, unknown>>> {
  const value = doc['agentOverrides'];
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    issues.error(
      'manifest.agentOverrides.type',
      'agentOverrides',
      '"agentOverrides" must be a mapping',
    );
    return {};
  }
  const result: Record<string, Record<string, unknown>> = {};
  for (const [agentId, override] of Object.entries(value as Record<string, unknown>)) {
    if (typeof override !== 'object' || override === null || Array.isArray(override)) {
      issues.error(
        'manifest.agentOverrides.type',
        `agentOverrides.${agentId}`,
        'Each agent override must be a mapping',
      );
      continue;
    }
    result[agentId] = override as Record<string, unknown>;
  }
  return result;
}

/** Serialises a manifest back to YAML, omitting empty optional fields to keep files tidy. */
export function stringifyManifest(manifest: SkillManifest): string {
  const doc: Record<string, unknown> = {
    schemaVersion: manifest.schemaVersion,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
  };
  if (manifest.kind !== DEFAULT_PACKAGE_KIND) doc['kind'] = manifest.kind;
  if (manifest.license !== undefined) doc['license'] = manifest.license;
  if (manifest.keywords.length > 0) doc['keywords'] = [...manifest.keywords];
  if (manifest.authors.length > 0)
    doc['authors'] = manifest.authors.map((author) => ({ ...author }));
  if (manifest.homepage !== undefined) doc['homepage'] = manifest.homepage;
  if (manifest.repository !== undefined) doc['repository'] = { ...manifest.repository };
  if (manifest.compatibility.length > 0) {
    doc['compatibility'] = { agents: manifest.compatibility.map((agent) => ({ ...agent })) };
  }
  doc['files'] = [...manifest.files];
  if (manifest.dependencies.length > 0) {
    doc['dependencies'] = manifest.dependencies.map((dep) => ({ ...dep }));
  }
  if (manifest.optionalDependencies.length > 0) {
    doc['optionalDependencies'] = manifest.optionalDependencies.map((dep) => ({ ...dep }));
  }
  if (manifest.capabilities.length > 0) doc['capabilities'] = [...manifest.capabilities];
  if (manifest.integrity !== undefined) doc['integrity'] = manifest.integrity;
  if (Object.keys(manifest.agentOverrides).length > 0)
    doc['agentOverrides'] = manifest.agentOverrides;

  return stringifyYaml(doc, { lineWidth: 100, singleQuote: false });
}
