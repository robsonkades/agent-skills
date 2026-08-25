import type { InstallScope } from '../domain/agent.ts';
import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';
import { withoutSkill } from '../domain/lockfile.ts';
import { parseSkillRef } from '../domain/skill-ref.ts';
import type { UninstallResult } from '../ports/installation.ts';
import { selectAgents } from './agent-selection.ts';
import type { ApplicationContext } from './context.ts';
import { readLockfile, writeLockfile } from './workspace.ts';

export interface RemoveOptions {
  readonly names: readonly string[];
  readonly scope: InstallScope;
  readonly agents?: readonly string[];
  readonly projectRoot?: string;
  readonly startDir?: string;
  /** Delete files whose content no longer matches the receipt. */
  readonly force?: boolean;
  readonly dryRun?: boolean;
}

export interface RemoveReport {
  readonly results: readonly UninstallResult[];
  readonly warnings: readonly string[];
  readonly scope: InstallScope;
  readonly projectRoot?: string;
  readonly dryRun: boolean;
  readonly lockfileUpdated: boolean;
}

/**
 * Uninstall.
 *
 * The rule that shapes this service: never delete a file the tool did not install. The
 * installer enforces it from the receipt; this service's job is to fail loudly when a name
 * is not installed anywhere, rather than reporting a cheerful no-op.
 */
export class RemoveSkills {
  private readonly ctx: ApplicationContext;

  constructor(ctx: ApplicationContext) {
    this.ctx = ctx;
  }

  async execute(options: RemoveOptions): Promise<RemoveReport> {
    if (options.names.length === 0) {
      throw new AgentSkillsError(ErrorCode.USAGE, 'No skills given', {
        hints: ['agent-skills uninstall java-performance'],
      });
    }

    const names = options.names.map((raw) => parseSkillRef(raw).name);
    const selection = await selectAgents(this.ctx, {
      scope: options.scope,
      ...(options.agents === undefined ? {} : { agents: options.agents }),
      ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }),
      ...(options.startDir === undefined ? {} : { startDir: options.startDir }),
    });

    const results: UninstallResult[] = [];
    const warnings: string[] = [];

    for (const name of names) {
      let removedSomewhere = false;

      for (const target of selection.targets) {
        const installed = await this.ctx.installer.read(target, name);
        if (installed === undefined) continue;
        if (installed.unmanaged) {
          warnings.push(
            `${name} exists in ${target.root} but was not installed by agent-skills; left untouched`,
          );
          continue;
        }

        const adapter = this.ctx.agents.find(target.agentId)!;
        const result = await this.ctx.installer.uninstall({
          name,
          adapter,
          target,
          force: options.force === true,
          dryRun: options.dryRun === true,
        });
        results.push(result);
        removedSomewhere = true;

        for (const preserved of result.preserved) {
          warnings.push(`${name}: kept modified file ${preserved} (use --force to delete it)`);
        }
      }

      if (!removedSomewhere) {
        throw new AgentSkillsError(ErrorCode.NOT_INSTALLED, `"${name}" is not installed`, {
          details: [
            '',
            'Looked in:',
            ...selection.targets.map(
              (target) => `  ${target.displayName} (${target.scope}): ${target.root}`,
            ),
          ],
          hints: ['agent-skills list   to see what is installed'],
          data: { name },
        });
      }
    }

    let lockfileUpdated = false;
    if (
      options.scope === 'project' &&
      selection.projectRoot !== undefined &&
      options.dryRun !== true
    ) {
      let lock = await readLockfile(this.ctx.fs, selection.projectRoot);
      const before = Object.keys(lock.skills).length;
      for (const name of names) lock = withoutSkill(lock, name);
      if (Object.keys(lock.skills).length !== before) {
        await writeLockfile(this.ctx.fs, selection.projectRoot, {
          ...lock,
          generatedWith: this.ctx.toolVersion,
        });
        lockfileUpdated = true;
      }
    }

    return {
      results,
      warnings,
      scope: options.scope,
      ...(selection.projectRoot === undefined ? {} : { projectRoot: selection.projectRoot }),
      dryRun: options.dryRun === true,
      lockfileUpdated,
    };
  }
}
