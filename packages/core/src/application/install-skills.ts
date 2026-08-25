import type { AgentTarget, InstallScope } from '../domain/agent.ts';
import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';
import { assertIntegrityMatches, withSkill, type Lockfile } from '../domain/lockfile.ts';
import { Resolver, type ResolvedSkill } from '../domain/resolver.ts';
import { parseSkillRef, type SkillRef } from '../domain/skill-ref.ts';
import type { SemanticVersion } from '../domain/version.ts';
import type { InstallResult } from '../ports/installation.ts';
import type { FetchedPackage } from '../ports/skill-registry.ts';
import type { ValidationIssue } from '../domain/validation.ts';
import { selectAgents, type AgentSelection } from './agent-selection.ts';
import type { ApplicationContext } from './context.ts';
import { FederationResolutionSource } from './resolution-source.ts';
import { validatePackage } from './validate-package.ts';
import { pinsFrom, readLockfile, writeLockfile } from './workspace.ts';

export interface InstallOptions {
  /** Raw `[registry:]name[@range]` strings from the command line. */
  readonly refs: readonly string[];
  readonly scope: InstallScope;
  readonly agents?: readonly string[];
  readonly projectRoot?: string;
  readonly startDir?: string;
  readonly registry?: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  /** Install exactly what was asked for, ignoring the dependency graph. */
  readonly skipDependencies?: boolean;
}

export interface InstallReport {
  readonly scope: InstallScope;
  readonly projectRoot?: string;
  /** The roots actually written to: one per agent and package kind installed. */
  readonly targets: readonly AgentTarget[];
  readonly resolved: readonly ResolvedSkill[];
  readonly results: readonly InstallResult[];
  /** Non-fatal findings from package validation and optional-dependency skips. */
  readonly warnings: readonly string[];
  readonly dryRun: boolean;
  readonly lockfileUpdated: boolean;
}

/**
 * The install use case: resolve → fetch → verify → validate → install per agent → record.
 *
 * The service owns *ordering and policy*; it performs no filesystem mutation itself. Every
 * write goes through the `InstallationEngine`, which is what keeps atomicity in one place
 * (ARCHITECTURE.md §5).
 */
export class InstallSkills {
  private readonly ctx: ApplicationContext;

  constructor(ctx: ApplicationContext) {
    this.ctx = ctx;
  }

  async execute(options: InstallOptions): Promise<InstallReport> {
    if (options.refs.length === 0) {
      throw new AgentSkillsError(ErrorCode.USAGE, 'No skills given', {
        hints: ['agent-skills install java-performance'],
      });
    }

    const refs = options.refs.map((raw) => parseSkillRef(raw));
    const selection = await selectAgents(this.ctx, {
      scope: options.scope,
      ...(options.agents === undefined ? {} : { agents: options.agents }),
      ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }),
      ...(options.startDir === undefined ? {} : { startDir: options.startDir }),
    });

    const lock =
      options.scope === 'project' && selection.projectRoot !== undefined
        ? await readLockfile(this.ctx.fs, selection.projectRoot)
        : undefined;

    const resolution = await this.resolve(refs, options, lock);
    const warnings = [...resolution.warnings];
    const results: InstallResult[] = [];
    const used = new Map<string, AgentTarget>();
    let nextLock = lock;

    for (const skill of resolution.order) {
      const fetched = await this.fetchAndVerify(skill, lock, warnings);
      const kind = fetched.pkg.manifest.kind;

      // A package goes only into the root its kind belongs in, and only for agents that have
      // such a root at all: Codex has no user-invoked commands, so a command install there is
      // reported as skipped rather than written into a directory it never reads.
      const targets = selection.targets.filter((target) => target.kind === kind);
      for (const adapter of selection.adapters) {
        if (targets.some((target) => target.agentId === adapter.id)) continue;
        warnings.push(
          `${adapter.displayName} has no ${kind} directory; ${skill.name}@${skill.version} was skipped for it`,
        );
      }

      const installedInto: AgentTarget[] = [];

      for (const target of targets) {
        if (!this.isCompatible(skill, target)) {
          warnings.push(
            `${skill.name}@${skill.version} does not declare compatibility with ${target.agentId}; skipped`,
          );
          continue;
        }

        const adapter = this.ctx.agents.find(target.agentId)!;
        results.push(
          await this.ctx.installer.install({
            pkg: fetched.pkg,
            adapter,
            target,
            registry: fetched.registry,
            resolved: fetched.resolved,
            integrity: fetched.integrity,
            dependencyOf: skill.requiredBy,
            force: options.force === true,
            dryRun: options.dryRun === true,
          }),
        );
        installedInto.push(target);
        used.set(`${target.agentId}:${target.scope}:${target.kind}`, target);
      }

      if (nextLock !== undefined) {
        nextLock = withSkill(nextLock, skill.name, {
          version: skill.version,
          registry: fetched.registry,
          resolved: fetched.resolved,
          integrity: fetched.integrity,
          agents: [...new Set(installedInto.map((target) => target.agentId))],
          dependencies: dependencyVersions(skill, resolution.order),
        });
      }
    }

    const lockfileUpdated =
      nextLock !== undefined &&
      selection.projectRoot !== undefined &&
      options.dryRun !== true &&
      results.length > 0;

    if (lockfileUpdated) {
      await writeLockfile(this.ctx.fs, selection.projectRoot!, {
        ...nextLock!,
        generatedWith: this.ctx.toolVersion,
      });
    }

    return {
      scope: options.scope,
      ...(selection.projectRoot === undefined ? {} : { projectRoot: selection.projectRoot }),
      targets: [...used.values()],
      resolved: resolution.order,
      results,
      warnings,
      dryRun: options.dryRun === true,
      lockfileUpdated,
    };
  }

  private async resolve(
    refs: readonly SkillRef[],
    options: InstallOptions,
    lock: Lockfile | undefined,
  ) {
    const source = new FederationResolutionSource(this.ctx.registry, options.registry);
    return new Resolver(source).resolve(refs, {
      // A bare `name` honours the lockfile pin; `name@latest` deliberately does not.
      ...(lock === undefined ? {} : { pinned: pinsFrom(lock) }),
      ...(options.skipDependencies === undefined
        ? {}
        : { skipDependencies: options.skipDependencies }),
    });
  }

  /**
   * Fetches the payload, checks it against the lockfile pin, and validates it before any
   * agent-specific work happens. Validation errors abort: installing a package we know is
   * malformed just moves the failure into the agent.
   */
  private async fetchAndVerify(
    skill: ResolvedSkill,
    lock: Lockfile | undefined,
    warnings: string[],
  ): Promise<FetchedPackage> {
    const registry = this.ctx.registry.named(skill.registry);
    if (registry === undefined) {
      throw new AgentSkillsError(
        ErrorCode.REGISTRY_NOT_FOUND,
        `No registry named "${skill.registry}"`,
      );
    }

    const fetched = await registry.fetch(skill.name, skill.version);

    const locked = lock?.skills[skill.name];
    if (locked !== undefined && locked.version === skill.version) {
      assertIntegrityMatches(skill.name, locked.integrity, fetched.integrity);
    }
    if (skill.entry.integrity !== undefined && skill.entry.integrity !== fetched.integrity) {
      throw new AgentSkillsError(
        ErrorCode.INTEGRITY_MISMATCH,
        `Integrity mismatch for ${skill.name}@${skill.version}`,
        {
          details: [
            `registry index declares: ${skill.entry.integrity}`,
            `downloaded content is:   ${fetched.integrity}`,
            '',
            'The payload does not match what the registry index says it should be.',
          ],
          hints: ['Report this to the registry maintainers before installing'],
          data: { name: skill.name, version: skill.version },
        },
      );
    }

    const report = validatePackage(fetched.pkg, { adapters: this.ctx.agents.all() });
    if (!report.ok) {
      throw new AgentSkillsError(
        ErrorCode.INVALID_PACKAGE,
        `Package ${skill.name}@${skill.version} failed validation`,
        {
          details: report.errors.map(formatIssue),
          hints: ['This is a problem with the published package, not with your machine'],
          data: { name: skill.name, version: skill.version, issues: report.errors },
        },
      );
    }
    for (const warning of report.warnings) {
      warnings.push(`${skill.name}@${skill.version}: ${warning.message}`);
    }
    if (skill.entry.deprecated) {
      warnings.push(
        `${skill.name}@${skill.version} is deprecated${
          skill.entry.deprecationReason === undefined ? '' : `: ${skill.entry.deprecationReason}`
        }`,
      );
    }

    return fetched;
  }

  /** Empty `compatibility` means "every agent"; a non-empty list is an allowlist. */
  private isCompatible(skill: ResolvedSkill, target: AgentTarget): boolean {
    const declared = skill.manifest.compatibility;
    return declared.length === 0 || declared.some((entry) => entry.id === target.agentId);
  }
}

function dependencyVersions(
  skill: ResolvedSkill,
  order: readonly ResolvedSkill[],
): Record<string, SemanticVersion> {
  const versions: Record<string, SemanticVersion> = {};
  for (const dependency of [
    ...skill.manifest.dependencies,
    ...skill.manifest.optionalDependencies,
  ]) {
    const resolved = order.find((candidate) => candidate.name === dependency.name);
    if (resolved !== undefined) versions[dependency.name] = resolved.version;
  }
  return versions;
}

export function formatIssue(issue: ValidationIssue): string {
  return `  ${issue.at}: ${issue.message}${issue.hint === undefined ? '' : ` (${issue.hint})`}`;
}

export type { AgentSelection };
