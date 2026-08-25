import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { AgentSkillsError, ErrorCode } from './errors.ts';
import { parseVersion, type SemanticVersion } from './version.ts';
import type { AgentId } from './agent.ts';

/**
 * `skills.lock` makes a project install reproducible. It is written for project scope only:
 * a user's global agent configuration is a mutable environment, not a build artefact
 * (DESIGN.md §6).
 */
export const LOCKFILE_NAME = 'skills.lock';
export const CURRENT_LOCKFILE_VERSION = 1;

export interface LockedSkill {
  readonly version: SemanticVersion;
  /** Configured registry name the version came from. Pinning it defeats registry reordering. */
  readonly registry: string;
  /** Fully qualified location, for auditing and for offline diagnosis. */
  readonly resolved: string;
  readonly integrity: string;
  readonly agents: readonly AgentId[];
  /** Exact versions this skill's dependencies resolved to, for a readable diff. */
  readonly dependencies: Readonly<Record<string, SemanticVersion>>;
}

export interface Lockfile {
  readonly lockfileVersion: number;
  readonly generatedWith?: string;
  /** Sorted by name so diffs stay minimal and merge conflicts stay local. */
  readonly skills: Readonly<Record<string, LockedSkill>>;
}

export function emptyLockfile(generatedWith?: string): Lockfile {
  return {
    lockfileVersion: CURRENT_LOCKFILE_VERSION,
    ...(generatedWith === undefined ? {} : { generatedWith }),
    skills: {},
  };
}

export function parseLockfile(text: string, source = LOCKFILE_NAME): Lockfile {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (cause) {
    throw new AgentSkillsError(ErrorCode.LOCKFILE_INVALID, `Could not parse ${source}`, {
      details: [cause instanceof Error ? cause.message : String(cause)],
      hints: [`Delete ${source} and re-run install to regenerate it`],
      cause,
      data: { source },
    });
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AgentSkillsError(ErrorCode.LOCKFILE_INVALID, `${source} must be a mapping`, {
      hints: [`Delete ${source} and re-run install to regenerate it`],
      data: { source },
    });
  }

  const doc = raw as Record<string, unknown>;
  const lockfileVersion =
    typeof doc['lockfileVersion'] === 'number' ? doc['lockfileVersion'] : CURRENT_LOCKFILE_VERSION;

  if (lockfileVersion > CURRENT_LOCKFILE_VERSION) {
    throw new AgentSkillsError(
      ErrorCode.UNSUPPORTED_SCHEMA,
      `${source} uses lockfile v${lockfileVersion}; this CLI understands up to v${CURRENT_LOCKFILE_VERSION}`,
      {
        hints: ['Upgrade the CLI: npm install -g @jvm-expert/agent-skills@latest'],
        data: { source },
      },
    );
  }

  const rawSkills = doc['skills'];
  if (
    rawSkills !== undefined &&
    (typeof rawSkills !== 'object' || rawSkills === null || Array.isArray(rawSkills))
  ) {
    throw new AgentSkillsError(
      ErrorCode.LOCKFILE_INVALID,
      `${source}: "skills" must be a mapping`,
      {
        data: { source },
      },
    );
  }

  const skills: Record<string, LockedSkill> = {};
  for (const [name, value] of Object.entries((rawSkills ?? {}) as Record<string, unknown>)) {
    skills[name] = parseLockedSkill(name, value, source);
  }

  return {
    lockfileVersion,
    ...(typeof doc['generatedWith'] === 'string' ? { generatedWith: doc['generatedWith'] } : {}),
    skills,
  };
}

function parseLockedSkill(name: string, value: unknown, source: string): LockedSkill {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentSkillsError(
      ErrorCode.LOCKFILE_INVALID,
      `${source}: entry "${name}" must be a mapping`,
      {
        data: { source, name },
      },
    );
  }
  const record = value as Record<string, unknown>;

  const required = (key: string): string => {
    const item = record[key];
    if (typeof item !== 'string' || item === '') {
      throw new AgentSkillsError(
        ErrorCode.LOCKFILE_INVALID,
        `${source}: entry "${name}" is missing "${key}"`,
        { hints: [`Delete ${source} and re-run install to regenerate it`], data: { source, name } },
      );
    }
    return item;
  };

  const dependencies: Record<string, SemanticVersion> = {};
  const rawDeps = record['dependencies'];
  if (
    rawDeps !== undefined &&
    typeof rawDeps === 'object' &&
    rawDeps !== null &&
    !Array.isArray(rawDeps)
  ) {
    for (const [depName, depVersion] of Object.entries(rawDeps as Record<string, unknown>)) {
      if (typeof depVersion !== 'string') continue;
      dependencies[depName] = parseVersion(depVersion, `${source} ${name}.dependencies.${depName}`);
    }
  }

  return {
    version: parseVersion(required('version'), `${source} ${name}`),
    registry: required('registry'),
    resolved: required('resolved'),
    integrity: required('integrity'),
    agents: Array.isArray(record['agents'])
      ? (record['agents'] as unknown[]).filter(
          (agent): agent is string => typeof agent === 'string',
        )
      : [],
    dependencies,
  };
}

export function stringifyLockfile(lock: Lockfile): string {
  const names = Object.keys(lock.skills).sort();
  const skills: Record<string, unknown> = {};
  for (const name of names) {
    const entry = lock.skills[name]!;
    skills[name] = {
      version: entry.version,
      registry: entry.registry,
      resolved: entry.resolved,
      integrity: entry.integrity,
      agents: [...entry.agents].sort(),
      dependencies: Object.fromEntries(
        Object.entries(entry.dependencies).sort(([a], [b]) => a.localeCompare(b)),
      ),
    };
  }

  return stringifyYaml(
    {
      lockfileVersion: lock.lockfileVersion,
      ...(lock.generatedWith === undefined ? {} : { generatedWith: lock.generatedWith }),
      skills,
    },
    { lineWidth: 0, singleQuote: false },
  );
}

export function withSkill(lock: Lockfile, name: string, entry: LockedSkill): Lockfile {
  return { ...lock, skills: { ...lock.skills, [name]: entry } };
}

export function withoutSkill(lock: Lockfile, name: string): Lockfile {
  const skills = { ...lock.skills };
  delete skills[name];
  return { ...lock, skills };
}

/**
 * Guards against a registry serving different bytes for a version we have already pinned.
 * A mismatch is a security event, not a cache-miss: it aborts rather than re-resolving.
 */
export function assertIntegrityMatches(
  name: string,
  expected: string,
  actual: string,
  source = LOCKFILE_NAME,
): void {
  if (expected === actual) return;
  throw new AgentSkillsError(ErrorCode.LOCKFILE_MISMATCH, `Integrity mismatch for "${name}"`, {
    details: [
      `${source} expects: ${expected}`,
      `registry served: ${actual}`,
      '',
      'The package contents differ from what was locked. This can mean the registry was',
      'changed in place, or that the download was tampered with.',
    ],
    hints: [
      `agent-skills update ${name}    if the change is expected`,
      `agent-skills info ${name}      to inspect the published versions`,
    ],
    data: { name, expected, actual },
  });
}
