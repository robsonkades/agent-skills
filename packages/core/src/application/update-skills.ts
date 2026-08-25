import type { InstallScope } from '../domain/agent.ts';
import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';
import { classifyChange, type SemanticVersion, type VersionBump } from '../domain/version.ts';
import { selectAgents } from './agent-selection.ts';
import type { ApplicationContext } from './context.ts';
import { InstallSkills, type InstallReport } from './install-skills.ts';

export interface UpdateOptions {
  /** Empty means "everything installed in this scope". */
  readonly names: readonly string[];
  readonly scope: InstallScope;
  readonly agents?: readonly string[];
  readonly projectRoot?: string;
  readonly startDir?: string;
  readonly registry?: string;
  readonly dryRun?: boolean;
  /**
   * Allow a major-version jump. Without it, update stays within the current major, which is
   * the behaviour people expect from `update` as opposed to `install <name>@latest`.
   */
  readonly major?: boolean;
  readonly force?: boolean;
}

export interface UpdateChange {
  readonly name: string;
  readonly from: SemanticVersion;
  readonly to: SemanticVersion;
  readonly bump: VersionBump;
}

export interface UpdateReport {
  readonly changes: readonly UpdateChange[];
  readonly unchanged: readonly string[];
  readonly install: InstallReport;
}

/**
 * Update: detect current → resolve newest compatible → install atomically → report the diff.
 *
 * Implemented on top of {@link InstallSkills} rather than beside it. The install pipeline
 * already does fetch/verify/validate/atomic-commit correctly; duplicating it here would mean
 * two places to keep safe.
 */
export class UpdateSkills {
  private readonly ctx: ApplicationContext;

  constructor(ctx: ApplicationContext) {
    this.ctx = ctx;
  }

  async execute(options: UpdateOptions): Promise<UpdateReport> {
    const selection = await selectAgents(this.ctx, {
      scope: options.scope,
      ...(options.agents === undefined ? {} : { agents: options.agents }),
      ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }),
      ...(options.startDir === undefined ? {} : { startDir: options.startDir }),
    });

    const current = new Map<string, SemanticVersion>();
    for (const target of selection.targets) {
      for (const skill of await this.ctx.installer.list(target)) {
        if (skill.unmanaged) continue;
        const known = current.get(skill.name);
        // When agents disagree, the oldest wins: updating brings every agent forward.
        if (known === undefined || classifyChange(skill.version, known) !== 'downgrade') {
          current.set(skill.name, skill.version);
        }
      }
    }

    const names = options.names.length > 0 ? options.names : [...current.keys()].sort();

    if (names.length === 0) {
      throw new AgentSkillsError(ErrorCode.NOT_INSTALLED, 'Nothing to update', {
        details: [
          '',
          'No agent-skills-managed skills were found in:',
          ...selection.targets.map(
            (target) => `  ${target.displayName} (${target.scope}): ${target.root}`,
          ),
        ],
        hints: ['agent-skills install <skill>   to install one'],
      });
    }

    for (const name of names) {
      if (current.has(name)) continue;
      throw new AgentSkillsError(ErrorCode.NOT_INSTALLED, `"${name}" is not installed`, {
        hints: [`agent-skills install ${name}`, 'agent-skills list'],
        data: { name },
      });
    }

    // `^current` keeps update within the major by default; `--major` opens it up.
    const refs = names.map((name) => {
      const version = current.get(name)!;
      return options.major === true ? `${name}@latest` : `${name}@^${version}`;
    });

    const install = await new InstallSkills(this.ctx).execute({
      refs,
      scope: options.scope,
      ...(options.agents === undefined ? {} : { agents: options.agents }),
      ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }),
      ...(options.startDir === undefined ? {} : { startDir: options.startDir }),
      ...(options.registry === undefined ? {} : { registry: options.registry }),
      ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
      force: options.force === true,
    });

    const changes: UpdateChange[] = [];
    const unchanged: string[] = [];

    for (const skill of install.resolved) {
      const from = current.get(skill.name);
      if (from === undefined) {
        // A newly pulled-in transitive dependency.
        changes.push({ name: skill.name, from: skill.version, to: skill.version, bump: 'same' });
        continue;
      }
      const bump = classifyChange(from, skill.version);
      if (bump === 'same') {
        unchanged.push(skill.name);
      } else {
        changes.push({ name: skill.name, from, to: skill.version, bump });
      }
    }

    return { changes, unchanged, install };
  }
}
