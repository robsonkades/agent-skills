import type {
  AgentDetection,
  AgentId,
  AgentLayout,
  AgentLocation,
  InstallScope,
  LocationContext,
} from '../domain/agent.ts';
import type { PackageKind } from '../domain/manifest.ts';
import type { SkillPackage } from '../domain/skill-package.ts';
import type { ValidationIssue } from '../domain/validation.ts';
import type { CommandRunner, Environment, FileSystem } from './infrastructure.ts';

/**
 * What an adapter may consult while detecting its agent.
 *
 * Detection is the one adapter method that must look at the real world, so it gets ports
 * rather than reaching for `node:fs` — which is what makes "Codex is installed" a fact a
 * unit test can fabricate with a fake home directory and a fake PATH.
 */
export interface DetectionContext {
  readonly env: Environment;
  readonly fs: FileSystem;
  readonly commands: CommandRunner;
}

/**
 * The extension point of the whole system. Supporting a new coding agent means shipping one
 * implementation of this interface — no change to core, to the installer, or to the CLI.
 *
 * Note what is *absent*: `install` and `uninstall`. Adapters describe and project; the single
 * hardened installer performs every write. See ARCHITECTURE.md §4.1 for why.
 */
export interface AgentAdapter {
  /** Stable identifier, recorded in receipts and lockfiles. Never localised. */
  readonly id: AgentId;
  readonly displayName: string;
  /** Accepted on `--agent`, e.g. `claude` for `claude-code`. */
  readonly aliases: readonly string[];
  /**
   * Keys this adapter accepts under `agentOverrides.<id>`. Anything else is a validation
   * error, which keeps the escape hatch narrow (DESIGN.md §3.4).
   */
  readonly overrideKeys: readonly string[];

  /** Evidence-based detection, so `doctor` can explain its conclusion. */
  detect(ctx: DetectionContext): Promise<AgentDetection>;

  /**
   * Where this agent keeps packages of one kind, and whether one package is a directory or
   * a single file there. The only place a path convention is written down.
   *
   * Returns `undefined` when the agent has no concept of that kind — installs targeting it
   * are then reported as skipped rather than written somewhere invented.
   */
  locationFor(
    kind: PackageKind,
    scope: InstallScope,
    ctx: LocationContext,
  ): AgentLocation | undefined;

  /** Pure projection of a neutral package onto this agent's on-disk shape. */
  layoutFor(pkg: SkillPackage): AgentLayout;

  /** Agent-specific package checks, e.g. frontmatter this agent cannot accept. */
  validate(pkg: SkillPackage): readonly ValidationIssue[];
}

/**
 * Registry of known adapters. Built-in adapters are registered by the CLI's composition
 * root; a third-party adapter package is registered the same way, which is what keeps
 * "add an agent without touching core" true.
 */
export class AgentCatalog {
  private readonly adapters = new Map<AgentId, AgentAdapter>();

  register(adapter: AgentAdapter): this {
    this.adapters.set(adapter.id, adapter);
    return this;
  }

  all(): readonly AgentAdapter[] {
    return [...this.adapters.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  ids(): readonly AgentId[] {
    return this.all().map((adapter) => adapter.id);
  }

  /** Resolves an id or an alias, case-insensitively. */
  find(idOrAlias: string): AgentAdapter | undefined {
    const needle = idOrAlias.trim().toLowerCase();
    return this.all().find(
      (adapter) =>
        adapter.id.toLowerCase() === needle ||
        adapter.aliases.some((alias) => alias.toLowerCase() === needle),
    );
  }

  has(id: AgentId): boolean {
    return this.adapters.has(id);
  }
}
