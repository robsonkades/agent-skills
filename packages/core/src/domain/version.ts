import semver from 'semver';
import { AgentSkillsError, ErrorCode } from './errors.ts';

/**
 * A validated, strict semantic version string. Nominal typing keeps unvalidated strings
 * from reaching the resolver: the only way to obtain one is through {@link parseVersion}.
 */
export type SemanticVersion = string & { readonly __brand: 'SemanticVersion' };

export function isSemanticVersion(value: string): boolean {
  return semver.valid(value, { loose: false }) !== null;
}

export function parseVersion(value: string, context?: string): SemanticVersion {
  if (!isSemanticVersion(value)) {
    throw new AgentSkillsError(ErrorCode.INVALID_VERSION, `Invalid version "${value}"`, {
      details: context === undefined ? [] : [`In: ${context}`],
      hints: [
        'Versions must be strict semver: MAJOR.MINOR.PATCH (e.g. 1.0.0, 2.3.1-rc.1)',
        'Ranges such as ^1.0.0 belong in dependencies, not in the version field',
      ],
      data: { value, context },
    });
  }
  return value as SemanticVersion;
}

export function parseRange(value: string, context?: string): string {
  if (semver.validRange(value) === null) {
    throw new AgentSkillsError(ErrorCode.INVALID_VERSION, `Invalid version range "${value}"`, {
      details: context === undefined ? [] : [`In: ${context}`],
      hints: ['Valid forms: 1.2.0, ^1.2.0, ~1.2, >=1.0.0 <2.0.0, *'],
      data: { value, context },
    });
  }
  return value;
}

export function satisfies(version: SemanticVersion, range: string): boolean {
  // includePrerelease keeps `1.0.0-rc.1` resolvable when a user asks for it explicitly,
  // while `maxSatisfying` below still prefers stable releases because they sort higher.
  return semver.satisfies(version, range, { includePrerelease: true });
}

export function compareVersions(a: SemanticVersion, b: SemanticVersion): number {
  return semver.compare(a, b);
}

export function sortVersionsDescending(
  versions: readonly SemanticVersion[],
): readonly SemanticVersion[] {
  return [...versions].sort((a, b) => semver.rcompare(a, b));
}

/** Highest version satisfying `range`, or undefined. Stable releases win ties by sorting. */
export function maxSatisfying(
  versions: readonly SemanticVersion[],
  range: string,
): SemanticVersion | undefined {
  const stable = versions.filter((version) => semver.prerelease(version) === null);
  const pool = stable.length > 0 ? stable : versions;
  const best = semver.maxSatisfying([...pool], range, { includePrerelease: true });
  if (best !== null) return best as SemanticVersion;
  // Fall back to the full set so an explicit prerelease range still resolves.
  const fallback = semver.maxSatisfying([...versions], range, { includePrerelease: true });
  return fallback === null ? undefined : (fallback as SemanticVersion);
}

/** True when every listed range can be satisfied by at least one of the versions. */
export function intersects(ranges: readonly string[]): boolean {
  return ranges.every((a, index) =>
    ranges.slice(index + 1).every((b) => semver.intersects(a, b, { includePrerelease: true })),
  );
}

export type VersionBump = 'major' | 'minor' | 'patch' | 'prerelease' | 'same' | 'downgrade';

/** Classifies a version change, used by `update` to describe what it did. */
export function classifyChange(from: SemanticVersion, to: SemanticVersion): VersionBump {
  const comparison = semver.compare(from, to);
  if (comparison === 0) return 'same';
  if (comparison > 0) return 'downgrade';
  const diff = semver.diff(from, to);
  if (diff === 'major' || diff === 'premajor') return 'major';
  if (diff === 'minor' || diff === 'preminor') return 'minor';
  if (diff === 'patch' || diff === 'prepatch') return 'patch';
  return 'prerelease';
}

export function increment(
  version: SemanticVersion,
  release: 'major' | 'minor' | 'patch',
): SemanticVersion {
  const next = semver.inc(version, release);
  if (next === null) {
    throw new AgentSkillsError(ErrorCode.INVALID_VERSION, `Cannot increment "${version}"`);
  }
  return next as SemanticVersion;
}
