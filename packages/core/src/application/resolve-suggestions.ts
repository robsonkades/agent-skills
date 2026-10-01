import { AgentSkillsError } from '../domain/errors.ts';
import {
  Resolver,
  type ResolvedSkill,
  type ResolutionResult,
  type ResolutionSource,
  type ResolveOptions,
} from '../domain/resolver.ts';
import { parseSkillRef, type SkillRef } from '../domain/skill-ref.ts';

/** Installation provenance, separate from the domain's dependency graph. */
export interface InstallResolvedSkill extends ResolvedSkill {
  /** Explicitly requested skills whose selected manifests suggest this package. */
  readonly suggestedBy?: readonly string[];
}

interface InstallationResolution extends ResolutionResult {
  readonly order: readonly InstallResolvedSkill[];
}

/**
 * Expand only the selected manifests of the original requests. Suggestions become additional
 * resolution roots, never dependency edges; their own suggestions are not traversed.
 */
export async function resolveSuggestions(
  source: ResolutionSource,
  refs: readonly SkillRef[],
  options: ResolveOptions,
  suggestedVersionRanges: Readonly<Record<string, string>> = {},
): Promise<InstallationResolution> {
  const resolver = new Resolver(source);
  const initial = await resolver.resolve(refs, options);
  const directNames = new Set(refs.map((ref) => ref.name));
  const roots = initial.order.filter((skill) => directNames.has(skill.name));
  const suggestedBy = new Map<string, Set<string>>();

  for (const root of roots) {
    for (const name of root.manifest.suggests) {
      const origins = suggestedBy.get(name) ?? new Set<string>();
      origins.add(root.name);
      suggestedBy.set(name, origins);
    }
  }
  if (suggestedBy.size === 0) return initial;

  // Exact qualified roots preserve the manifests from which suggestions were read. A
  // companion constraint may conflict with a root, but must never silently replace it.
  const expanded = roots.map((root) =>
    parseSkillRef(`${root.registry}:${root.name}@${root.version}`),
  );
  const pinned = { ...options.pinned };
  for (const root of roots) delete pinned[root.name];
  for (const name of [...suggestedBy.keys()].sort()) {
    if (directNames.has(name)) continue;
    const range = suggestedVersionRanges[name] ?? pinned[name];
    expanded.push(parseSkillRef(range === undefined ? name : `${name}@${range}`));
    // Its root constraint now enforces the pin/range. Keep manifest dependency ranges
    // intact, particularly when update deliberately moves beyond a previous lock pin.
    delete pinned[name];
  }

  let resolved: ResolutionResult;
  try {
    resolved = await resolver.resolve(expanded, { ...options, pinned });
  } catch (cause) {
    if (!(cause instanceof AgentSkillsError)) throw cause;
    const suggestions = [...suggestedBy].map(([name, origins]) => ({
      name,
      suggestedBy: [...origins].sort(),
    }));
    throw new AgentSkillsError(cause.code, cause.message, {
      cause,
      details: [
        ...cause.details,
        'Requested suggestions:',
        ...suggestions.map(
          ({ name, suggestedBy: origins }) => `  ${name} suggested by ${origins.join(', ')}`,
        ),
      ],
      hints: cause.hints,
      data: { ...cause.data, suggestions },
    });
  }

  return {
    warnings: [...new Set([...initial.warnings, ...resolved.warnings])],
    order: resolved.order.map((skill) => ({
      ...skill,
      direct: directNames.has(skill.name),
      ...(suggestedBy.has(skill.name)
        ? { suggestedBy: [...suggestedBy.get(skill.name)!].sort() }
        : {}),
      // Derive ownership from the complete graph: a later constraint can refer to an
      // already selected version without causing the resolver to choose it again.
      requiredBy: resolved.order
        .filter((owner) =>
          [...owner.manifest.dependencies, ...owner.manifest.optionalDependencies].some(
            (dependency) => dependency.name === skill.name,
          ),
        )
        .map((owner) => `${owner.name}@${owner.version}`)
        .sort(),
    })),
  };
}
