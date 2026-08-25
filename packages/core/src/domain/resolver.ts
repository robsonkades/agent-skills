import { AgentSkillsError, ErrorCode } from './errors.ts';
import type { SkillManifest } from './manifest.ts';
import type { IndexVersionEntry } from './registry-index.ts';
import { LATEST, type SkillRef } from './skill-ref.ts';
import { compareVersions, intersects, maxSatisfying, type SemanticVersion } from './version.ts';

/** What the resolver needs from a registry. Kept separate so the resolver stays testable. */
export interface ResolutionSource {
  /**
   * Versions of `name`. When `registry` is given the lookup is restricted to it; otherwise
   * federation precedence decides which registry owns the name.
   */
  listVersions(
    name: string,
    registry?: string,
  ): Promise<{ readonly registry: string; readonly versions: readonly IndexVersionEntry[] }>;

  loadManifest(name: string, version: SemanticVersion, registry: string): Promise<SkillManifest>;
}

export interface ResolvedSkill {
  readonly name: string;
  readonly version: SemanticVersion;
  readonly registry: string;
  readonly entry: IndexVersionEntry;
  readonly manifest: SkillManifest;
  /** True when the user asked for this skill by name, rather than it being pulled in. */
  readonly direct: boolean;
  /** Names of skills that required this one. Empty for a purely direct install. */
  readonly requiredBy: readonly string[];
}

export interface ResolutionResult {
  /** Dependencies before dependents, so installing in order never leaves a dangling need. */
  readonly order: readonly ResolvedSkill[];
  readonly warnings: readonly string[];
}

interface Constraint {
  readonly range: string;
  /** `<user request>` for direct refs, else `name@version`. */
  readonly requester: string;
  readonly optional: boolean;
}

const DIRECT_REQUESTER = '<requested>';
const MAX_ITERATIONS = 1000;

export interface ResolveOptions {
  /** Pins that must be honoured exactly, from `skills.lock`. */
  readonly pinned?: Readonly<Record<string, SemanticVersion>>;
  /** Skip transitive dependencies entirely. Used by `--no-deps`-style flows and `info`. */
  readonly skipDependencies?: boolean;
}

/**
 * Breadth-first constraint resolution without backtracking (DESIGN.md §7).
 *
 * Adding a constraint can only lower the chosen version, never raise it, so the fixed-point
 * loop terminates; the iteration cap exists to turn a hypothetical resolver bug into a clear
 * error rather than a hang.
 */
export class Resolver {
  private readonly source: ResolutionSource;

  constructor(source: ResolutionSource) {
    this.source = source;
  }

  async resolve(
    refs: readonly SkillRef[],
    options: ResolveOptions = {},
  ): Promise<ResolutionResult> {
    const constraints = new Map<string, Constraint[]>();
    const registryHint = new Map<string, string>();
    const chosen = new Map<string, ResolvedSkill>();
    const directNames = new Set<string>();
    const warnings: string[] = [];
    const pinned = options.pinned ?? {};

    for (const ref of refs) {
      directNames.add(ref.name);
      if (ref.registry !== undefined) registryHint.set(ref.name, ref.registry);
      addConstraint(constraints, ref.name, {
        range: rangeFor(ref, pinned[ref.name]),
        requester: DIRECT_REQUESTER,
        optional: false,
      });
    }

    for (let iteration = 0; iteration <= MAX_ITERATIONS; iteration += 1) {
      const stale = this.findStale(constraints, chosen);
      if (stale === undefined) {
        return { order: topologicalOrder(chosen, directNames), warnings };
      }
      if (iteration === MAX_ITERATIONS) break;

      const skillConstraints = constraints.get(stale)!;
      const resolved = await this.choose(stale, skillConstraints, registryHint.get(stale));

      if (resolved === undefined) {
        // Every constraint on this name came from optional dependencies: drop it.
        constraints.delete(stale);
        chosen.delete(stale);
        continue;
      }

      chosen.set(stale, {
        ...resolved,
        direct: directNames.has(stale),
        requiredBy: skillConstraints
          .filter((constraint) => constraint.requester !== DIRECT_REQUESTER)
          .map((constraint) => constraint.requester),
      });

      if (options.skipDependencies === true) continue;

      const requester = `${resolved.name}@${resolved.version}`;
      for (const dependency of resolved.manifest.dependencies) {
        addConstraint(constraints, dependency.name, {
          range: pinned[dependency.name] ?? dependency.version,
          requester,
          optional: false,
        });
      }
      for (const dependency of resolved.manifest.optionalDependencies) {
        addConstraint(constraints, dependency.name, {
          range: pinned[dependency.name] ?? dependency.version,
          requester,
          optional: true,
        });
      }

      assertNoCycle(chosen, constraints);
    }

    throw new AgentSkillsError(ErrorCode.INTERNAL, 'Dependency resolution did not converge', {
      details: [`Gave up after ${MAX_ITERATIONS} iterations.`],
      hints: ['Please report this with the skills you were installing'],
      data: { names: [...constraints.keys()] },
    });
  }

  /** The first name (alphabetically, for determinism) whose choice does not satisfy its constraints. */
  private findStale(
    constraints: Map<string, Constraint[]>,
    chosen: Map<string, ResolvedSkill>,
  ): string | undefined {
    for (const name of [...constraints.keys()].sort()) {
      const current = chosen.get(name);
      if (current === undefined) return name;
      const ranges = constraints.get(name)!.map((constraint) => constraint.range);
      if (!ranges.every((range) => satisfiesRange(current.version, range))) return name;
    }
    return undefined;
  }

  private async choose(
    name: string,
    constraints: readonly Constraint[],
    registry: string | undefined,
  ): Promise<Omit<ResolvedSkill, 'direct' | 'requiredBy'> | undefined> {
    const allOptional = constraints.every((constraint) => constraint.optional);

    let listed: { registry: string; versions: readonly IndexVersionEntry[] };
    try {
      listed = await this.source.listVersions(name, registry);
    } catch (cause) {
      if (allOptional) return undefined;
      throw cause;
    }

    const ranges = constraints.map((constraint) => constraint.range);
    if (!intersects(ranges)) {
      if (allOptional) return undefined;
      throw conflictError(name, constraints, listed.versions);
    }

    // Deprecated versions stay resolvable only when a constraint names one exactly, so an
    // existing lockfile keeps working while `latest` moves on.
    const candidates = listed.versions
      .filter((entry) => !entry.deprecated || ranges.some((range) => range === entry.version))
      .map((entry) => entry.version);

    // Filter by the whole constraint set at once, so the pick is order-independent.
    const best = candidates
      .filter((version) => ranges.every((range) => satisfiesRange(version, range)))
      .sort((a, b) => compareVersions(b, a))[0];

    if (best === undefined) {
      if (allOptional) return undefined;
      throw conflictError(name, constraints, listed.versions);
    }

    const entry = listed.versions.find((candidate) => candidate.version === best)!;
    const manifest = await this.source.loadManifest(name, best, listed.registry);

    return { name, version: best, registry: listed.registry, entry, manifest };
  }
}

function rangeFor(ref: SkillRef, pinnedVersion: SemanticVersion | undefined): string {
  if (ref.range !== undefined && ref.range !== LATEST) return ref.range;
  // An explicit `@latest` deliberately ignores the lockfile pin; a bare name honours it.
  if (ref.range === LATEST) return '*';
  return pinnedVersion ?? '*';
}

function addConstraint(
  constraints: Map<string, Constraint[]>,
  name: string,
  constraint: Constraint,
): void {
  const existing = constraints.get(name);
  if (existing === undefined) {
    constraints.set(name, [constraint]);
    return;
  }
  const duplicate = existing.some(
    (item) => item.range === constraint.range && item.requester === constraint.requester,
  );
  if (!duplicate) existing.push(constraint);
}

function satisfiesRange(version: SemanticVersion, range: string): boolean {
  return maxSatisfying([version], range) !== undefined;
}

function conflictError(
  name: string,
  constraints: readonly Constraint[],
  available: readonly IndexVersionEntry[],
): AgentSkillsError {
  const width = Math.max(...constraints.map((constraint) => constraint.requester.length));
  const lines = constraints.map(
    (constraint) => `  ${constraint.requester.padEnd(width)}  requires ${constraint.range}`,
  );
  const versions = available.map((entry) => entry.version).join(', ');

  return new AgentSkillsError(ErrorCode.DEPENDENCY_CONFLICT, `Version conflict for "${name}"`, {
    details: [
      ...lines,
      '',
      `  No published version satisfies all of them.`,
      `  Available: ${versions === '' ? '(none)' : versions}`,
    ],
    hints: [
      `agent-skills info ${name}   to see every published version`,
      'Relax a constraint, or install a newer version of the skill that requires the old range',
    ],
    data: {
      name,
      constraints: constraints.map((constraint) => ({
        requester: constraint.requester,
        range: constraint.range,
      })),
      available: available.map((entry) => entry.version),
    },
  });
}

/** Depth-first cycle detection over the graph implied by the manifests chosen so far. */
function assertNoCycle(
  chosen: Map<string, ResolvedSkill>,
  constraints: Map<string, Constraint[]>,
): void {
  const edges = new Map<string, string[]>();
  for (const [name, skill] of chosen) {
    edges.set(
      name,
      [...skill.manifest.dependencies, ...skill.manifest.optionalDependencies]
        .map((dependency) => dependency.name)
        .filter((dependency) => constraints.has(dependency)),
    );
  }

  const visiting = new Set<string>();
  const done = new Set<string>();
  const path: string[] = [];

  const visit = (name: string): void => {
    if (done.has(name)) return;
    if (visiting.has(name)) {
      const start = path.indexOf(name);
      const cycle = [...path.slice(start), name].join(' → ');
      throw new AgentSkillsError(ErrorCode.DEPENDENCY_CYCLE, 'Circular dependency detected', {
        details: [`  ${cycle}`],
        hints: ['Break the cycle by removing one of these dependencies'],
        data: { cycle: [...path.slice(start), name] },
      });
    }
    visiting.add(name);
    path.push(name);
    for (const next of edges.get(name) ?? []) visit(next);
    path.pop();
    visiting.delete(name);
    done.add(name);
  };

  for (const name of [...edges.keys()].sort()) visit(name);
}

/** Dependencies first. Cycles are already rejected, so a stable topological order exists. */
function topologicalOrder(
  chosen: Map<string, ResolvedSkill>,
  directNames: ReadonlySet<string>,
): readonly ResolvedSkill[] {
  const ordered: ResolvedSkill[] = [];
  const emitted = new Set<string>();

  const emit = (name: string): void => {
    if (emitted.has(name)) return;
    const skill = chosen.get(name);
    if (skill === undefined) return;
    emitted.add(name);
    for (const dependency of [
      ...skill.manifest.dependencies,
      ...skill.manifest.optionalDependencies,
    ]
      .map((dep) => dep.name)
      .sort()) {
      emit(dependency);
    }
    ordered.push(skill);
  };

  // Seed with direct requests first so the order is stable regardless of map insertion order.
  for (const name of [...directNames].sort()) emit(name);
  for (const name of [...chosen.keys()].sort()) emit(name);

  return ordered;
}
