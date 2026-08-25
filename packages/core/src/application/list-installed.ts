import { INSTALL_SCOPES, type AgentTarget, type InstallScope } from '../domain/agent.ts';
import type { InstalledSkill } from '../ports/installation.ts';
import { targetsFor } from './agent-selection.ts';
import type { ApplicationContext } from './context.ts';
import { findProjectRoot } from './workspace.ts';

export interface ListOptions {
  readonly agents?: readonly string[];
  /** Omit to list both global and project scopes. */
  readonly scope?: InstallScope;
  readonly projectRoot?: string;
  readonly startDir?: string;
  /** Include directories in the skill root that the tool did not install. */
  readonly includeUnmanaged?: boolean;
}

export interface ListEntry {
  readonly target: AgentTarget;
  readonly skills: readonly InstalledSkill[];
}

export interface ListReport {
  readonly entries: readonly ListEntry[];
  readonly projectRoot?: string;
  readonly total: number;
}

/**
 * Lists what is installed, per agent and scope.
 *
 * Unlike install, this never fails when an agent is undetected: showing an empty Codex
 * section is more useful than an error, because the usual question is "what do I have?"
 * rather than "what can I install into?".
 */
export class ListInstalled {
  private readonly ctx: ApplicationContext;

  constructor(ctx: ApplicationContext) {
    this.ctx = ctx;
  }

  async execute(options: ListOptions = {}): Promise<ListReport> {
    const requested = (options.agents ?? []).filter((value) => value.trim() !== '');
    const adapters =
      requested.length === 0 || requested.includes('all')
        ? this.ctx.agents.all()
        : requested
            .map((value) => this.ctx.agents.find(value))
            .filter((adapter) => adapter !== undefined);

    const projectRoot =
      options.projectRoot ??
      (await findProjectRoot(
        this.ctx.fs,
        options.startDir ?? this.ctx.env.cwd(),
        this.ctx.env.homeDir(),
      ));

    const scopes: readonly InstallScope[] =
      options.scope === undefined ? INSTALL_SCOPES : [options.scope];

    const entries: ListEntry[] = [];
    const seenRoots = new Set<string>();
    let total = 0;

    for (const adapter of adapters) {
      for (const scope of scopes) {
        // A project scope without a project is not an error here, just nothing to show.
        if (scope === 'project' && projectRoot === undefined) continue;

        for (const target of targetsFor(this.ctx, adapter, scope, projectRoot)) {
          // An agent whose global and project roots resolve to the same directory (possible
          // when the config directory has been relocated into a repository) must not have its
          // skills counted twice. The comparison must be on the canonical path: the global
          // root comes from an environment variable and the project root from the cwd, and
          // on macOS those can name the same directory through different symlink forms
          // (/var/... versus /private/var/...).
          const rootKey = await this.canonical(target.root);
          if (seenRoots.has(`${adapter.id}:${rootKey}`)) continue;
          seenRoots.add(`${adapter.id}:${rootKey}`);

          const all = await this.ctx.installer.list(target);
          const skills =
            options.includeUnmanaged === true ? all : all.filter((skill) => !skill.unmanaged);
          total += skills.length;
          entries.push({ target, skills });
        }
      }
    }

    return {
      entries,
      ...(projectRoot === undefined ? {} : { projectRoot }),
      total,
    };
  }

  /**
   * Canonical form of a root for identity comparison. A root that does not exist yet has no
   * canonical form to resolve — the resolved literal path is the best available identity.
   */
  private async canonical(root: string): Promise<string> {
    if (!(await this.ctx.fs.exists(root))) return this.ctx.fs.resolve(root);
    return this.ctx.fs.realpath(root);
  }
}
