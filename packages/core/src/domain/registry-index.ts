import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { AgentSkillsError, ErrorCode } from './errors.ts';
import { compareVersions, parseVersion, type SemanticVersion } from './version.ts';
import { validateSkillName } from './skill-ref.ts';

/**
 * The registry index is the one document every registry kind must serve. It is
 * denormalised so `search` and `info` work from a single cached fetch (DESIGN.md §4.1).
 */
export const CURRENT_INDEX_VERSION = 1;

export type RegistryKind = 'local' | 'git' | 'http';

export interface IndexVersionEntry {
  readonly version: SemanticVersion;
  /** Package location relative to the registry root. Mutually exclusive with `tarball`. */
  readonly path?: string;
  /** Absolute URL of a `.tar.gz`. Mutually exclusive with `path`. */
  readonly tarball?: string;
  readonly integrity?: string;
  readonly publishedAt?: string;
  readonly deprecated: boolean;
  readonly deprecationReason?: string;
}

export interface IndexSkillEntry {
  readonly name: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly latest: SemanticVersion;
  /** Sorted newest-first. */
  readonly versions: readonly IndexVersionEntry[];
}

export interface RegistryIndex {
  readonly schemaVersion: number;
  readonly name: string;
  readonly updatedAt?: string;
  readonly skills: readonly IndexSkillEntry[];
}

export interface ParseIndexOptions {
  readonly source?: string;
  /** Registry name to assume when the document omits one. */
  readonly fallbackName?: string;
}

export function parseRegistryIndex(text: string, options: ParseIndexOptions = {}): RegistryIndex {
  const source = options.source ?? 'registry index';

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (cause) {
    throw new AgentSkillsError(ErrorCode.REGISTRY_INVALID_INDEX, `Could not parse ${source}`, {
      details: [cause instanceof Error ? cause.message : String(cause)],
      cause,
      data: { source },
    });
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AgentSkillsError(
      ErrorCode.REGISTRY_INVALID_INDEX,
      `${source} must be a mapping with a "skills" list`,
      { data: { source } },
    );
  }

  const doc = raw as Record<string, unknown>;
  const schemaVersion = typeof doc['schemaVersion'] === 'number' ? doc['schemaVersion'] : 1;
  if (schemaVersion > CURRENT_INDEX_VERSION) {
    throw new AgentSkillsError(
      ErrorCode.UNSUPPORTED_SCHEMA,
      `${source} uses index format v${schemaVersion}; this CLI understands up to v${CURRENT_INDEX_VERSION}`,
      {
        hints: ['Upgrade the CLI: npm install -g @jvm-expert/agent-skills@latest'],
        data: { source },
      },
    );
  }

  const name =
    typeof doc['name'] === 'string' && doc['name'].trim() !== ''
      ? doc['name'].trim()
      : (options.fallbackName ?? 'unnamed');

  const rawSkills = doc['skills'];
  if (rawSkills !== undefined && !Array.isArray(rawSkills)) {
    throw new AgentSkillsError(
      ErrorCode.REGISTRY_INVALID_INDEX,
      `${source}: "skills" must be a list`,
      {
        data: { source },
      },
    );
  }

  const skills: IndexSkillEntry[] = [];
  for (const entry of (rawSkills ?? []) as unknown[]) {
    const skill = parseSkillEntry(entry, source);
    if (skill !== undefined) skills.push(skill);
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));

  return {
    schemaVersion,
    name,
    ...(typeof doc['updatedAt'] === 'string' ? { updatedAt: doc['updatedAt'] } : {}),
    skills,
  };
}

function parseSkillEntry(entry: unknown, source: string): IndexSkillEntry | undefined {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new AgentSkillsError(
      ErrorCode.REGISTRY_INVALID_INDEX,
      `${source}: each skill entry must be a mapping`,
      { data: { source } },
    );
  }
  const record = entry as Record<string, unknown>;
  const name = record['name'];
  if (typeof name !== 'string') {
    throw new AgentSkillsError(
      ErrorCode.REGISTRY_INVALID_INDEX,
      `${source}: a skill entry has no name`,
      {
        data: { source },
      },
    );
  }
  const nameProblems = validateSkillName(name);
  if (nameProblems.length > 0) {
    throw new AgentSkillsError(
      ErrorCode.REGISTRY_INVALID_INDEX,
      `${source}: invalid skill name "${name}"`,
      { details: nameProblems.map((problem) => `- ${problem}`), data: { source, name } },
    );
  }

  const rawVersions = record['versions'];
  if (!Array.isArray(rawVersions) || rawVersions.length === 0) {
    throw new AgentSkillsError(
      ErrorCode.REGISTRY_INVALID_INDEX,
      `${source}: skill "${name}" has no versions`,
      { data: { source, name } },
    );
  }

  const versions = rawVersions.map((version) => parseVersionEntry(version, name, source));
  // Newest first, so `latest` and `info` never have to re-sort.
  const ordered = [...versions].sort((a, b) => compareVersions(b.version, a.version));

  const declaredLatest = record['latest'];
  const latest =
    typeof declaredLatest === 'string'
      ? parseVersion(declaredLatest, `${source} ${name}.latest`)
      : // Fall back to the newest non-deprecated version, or the newest overall.
        (ordered.find((version) => !version.deprecated)?.version ?? ordered[0]!.version);

  return {
    name,
    description: typeof record['description'] === 'string' ? record['description'] : '',
    keywords: Array.isArray(record['keywords'])
      ? (record['keywords'] as unknown[]).filter((k): k is string => typeof k === 'string')
      : [],
    latest,
    versions: ordered,
  };
}

function parseVersionEntry(entry: unknown, skillName: string, source: string): IndexVersionEntry {
  if (typeof entry === 'string') {
    return { version: parseVersion(entry, `${source} ${skillName}`), deprecated: false };
  }
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new AgentSkillsError(
      ErrorCode.REGISTRY_INVALID_INDEX,
      `${source}: version entries for "${skillName}" must be mappings`,
      { data: { source, name: skillName } },
    );
  }
  const record = entry as Record<string, unknown>;
  const version = record['version'];
  if (typeof version !== 'string') {
    throw new AgentSkillsError(
      ErrorCode.REGISTRY_INVALID_INDEX,
      `${source}: a version entry for "${skillName}" has no "version"`,
      { data: { source, name: skillName } },
    );
  }

  const path = record['path'];
  const tarball = record['tarball'];
  if (typeof path === 'string' && typeof tarball === 'string') {
    throw new AgentSkillsError(
      ErrorCode.REGISTRY_INVALID_INDEX,
      `${source}: "${skillName}@${version}" declares both "path" and "tarball"`,
      { hints: ['Use "path" for git/local registries and "tarball" for http registries'] },
    );
  }

  return {
    version: parseVersion(version, `${source} ${skillName}`),
    ...(typeof path === 'string' ? { path } : {}),
    ...(typeof tarball === 'string' ? { tarball } : {}),
    ...(typeof record['integrity'] === 'string' ? { integrity: record['integrity'] } : {}),
    ...(typeof record['publishedAt'] === 'string' ? { publishedAt: record['publishedAt'] } : {}),
    deprecated: record['deprecated'] === true,
    ...(typeof record['deprecationReason'] === 'string'
      ? { deprecationReason: record['deprecationReason'] }
      : {}),
  };
}

export function stringifyRegistryIndex(index: RegistryIndex): string {
  return stringifyYaml(
    {
      schemaVersion: index.schemaVersion,
      name: index.name,
      ...(index.updatedAt === undefined ? {} : { updatedAt: index.updatedAt }),
      skills: index.skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        ...(skill.keywords.length > 0 ? { keywords: [...skill.keywords] } : {}),
        latest: skill.latest,
        versions: skill.versions.map((version) => ({
          version: version.version,
          ...(version.path === undefined ? {} : { path: version.path }),
          ...(version.tarball === undefined ? {} : { tarball: version.tarball }),
          ...(version.integrity === undefined ? {} : { integrity: version.integrity }),
          ...(version.publishedAt === undefined ? {} : { publishedAt: version.publishedAt }),
          ...(version.deprecated ? { deprecated: true } : {}),
          ...(version.deprecationReason === undefined
            ? {}
            : { deprecationReason: version.deprecationReason }),
        })),
      })),
    },
    { lineWidth: 120, singleQuote: false },
  );
}

export function findIndexEntry(index: RegistryIndex, name: string): IndexSkillEntry | undefined {
  return index.skills.find((skill) => skill.name === name);
}
