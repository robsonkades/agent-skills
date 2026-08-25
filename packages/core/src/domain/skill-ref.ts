import semver from 'semver';
import { AgentSkillsError, ErrorCode } from './errors.ts';

/**
 * Skill names are directory names on three operating systems and identifiers in YAML,
 * URLs and lockfiles. The grammar is therefore the intersection of what is safe
 * everywhere: lowercase alphanumerics and single inner hyphens.
 *
 * `@` and `/` are deliberately excluded and reserved for a future `@org/skill` scoping
 * scheme, so adding scopes later is not a breaking change (DESIGN.md §11).
 */
const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const REGISTRY_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export const SKILL_NAME_MIN_LENGTH = 2;
export const SKILL_NAME_MAX_LENGTH = 64;

/** Names that would collide with our own on-disk bookkeeping or with OS reserved words. */
const RESERVED_SKILL_NAMES = new Set(['agent-skills', 'con', 'prn', 'aux', 'nul', 'node-modules']);

export function isValidSkillName(name: string): boolean {
  return validateSkillName(name).length === 0;
}

/** Returns human-readable reasons the name is unusable, or an empty list when it is fine. */
export function validateSkillName(name: string): readonly string[] {
  const problems: string[] = [];
  if (name.length < SKILL_NAME_MIN_LENGTH) {
    problems.push(`must be at least ${SKILL_NAME_MIN_LENGTH} characters`);
  }
  if (name.length > SKILL_NAME_MAX_LENGTH) {
    problems.push(`must be at most ${SKILL_NAME_MAX_LENGTH} characters`);
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    problems.push(
      'must be lowercase alphanumerics separated by single hyphens (e.g. "java-performance")',
    );
  }
  if (name.includes('--')) {
    problems.push('must not contain consecutive hyphens');
  }
  if (RESERVED_SKILL_NAMES.has(name)) {
    problems.push(`"${name}" is reserved`);
  }
  return problems;
}

export function assertValidSkillName(name: string): void {
  const problems = validateSkillName(name);
  if (problems.length === 0) return;
  throw new AgentSkillsError(ErrorCode.INVALID_SKILL_NAME, `Invalid skill name "${name}"`, {
    details: problems.map((problem) => `- ${problem}`),
    hints: ['Skill names look like: java-performance, jvm-gc-tuning, react-testing'],
    data: { name, problems },
  });
}

/** `latest` is a resolution instruction, not a version; it is modelled explicitly. */
export const LATEST = 'latest';

export interface SkillRef {
  /** Registry name when the reference was qualified (`company:java-perf`), else undefined. */
  readonly registry?: string;
  readonly name: string;
  /** A semver range, or `latest`. Undefined means "whatever the lockfile or latest says". */
  readonly range?: string;
  /** The original text, preserved for error messages. */
  readonly raw: string;
}

/**
 * Parses `[registry:]name[@range]`.
 *
 * Examples:
 *   java-performance
 *   java-performance@1.2.0
 *   java-performance@^1.2.0
 *   java-performance@latest
 *   company:java-performance@~1.0
 */
export function parseSkillRef(raw: string): SkillRef {
  const text = raw.trim();
  if (text === '') {
    throw new AgentSkillsError(ErrorCode.USAGE, 'Empty skill reference', {
      hints: ['Expected something like: java-performance or java-performance@1.2.0'],
    });
  }

  let rest = text;
  let registry: string | undefined;

  const colon = rest.indexOf(':');
  if (colon !== -1) {
    registry = rest.slice(0, colon);
    rest = rest.slice(colon + 1);
    if (!REGISTRY_NAME_PATTERN.test(registry)) {
      throw new AgentSkillsError(
        ErrorCode.USAGE,
        `Invalid registry qualifier "${registry}" in "${raw}"`,
        {
          hints: ['Registry names are lowercase, e.g. official:java-performance'],
          data: { raw },
        },
      );
    }
  }

  let range: string | undefined;
  const at = rest.lastIndexOf('@');
  if (at > 0) {
    range = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }

  assertValidSkillName(rest);

  if (range !== undefined) {
    if (range === '') {
      throw new AgentSkillsError(ErrorCode.USAGE, `Missing version after "@" in "${raw}"`, {
        hints: [`Use ${rest}@latest, ${rest}@1.2.0 or ${rest}@^1.2.0`],
        data: { raw },
      });
    }
    if (range !== LATEST && semver.validRange(range) === null) {
      throw new AgentSkillsError(ErrorCode.INVALID_VERSION, `Invalid version range "${range}"`, {
        details: [`In reference: ${raw}`],
        hints: ['Valid forms: 1.2.0, ^1.2.0, ~1.2, >=1.0.0 <2.0.0, latest'],
        data: { raw, range },
      });
    }
  }

  const ref: { registry?: string; name: string; range?: string; raw: string } = {
    name: rest,
    raw: text,
  };
  if (registry !== undefined) ref.registry = registry;
  if (range !== undefined) ref.range = range;
  return ref;
}

export function formatSkillRef(ref: SkillRef): string {
  const qualifier = ref.registry === undefined ? '' : `${ref.registry}:`;
  const range = ref.range === undefined ? '' : `@${ref.range}`;
  return `${qualifier}${ref.name}${range}`;
}
