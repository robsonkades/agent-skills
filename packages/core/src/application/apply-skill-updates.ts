import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';
import { compareVersions, satisfies } from '../domain/version.ts';
import type { SkillUpdateNotice } from './check-updates.ts';
import type { ApplicationContext } from './context.ts';
import { InstallSkills, type InstallOptions, type InstallReport } from './install-skills.ts';

/** Apply exactly the releases and destinations reviewed in the notification. */
export class ApplySkillUpdates {
  private readonly ctx: ApplicationContext;

  constructor(ctx: ApplicationContext) {
    this.ctx = ctx;
  }

  async execute(notices: readonly SkillUpdateNotice[]): Promise<readonly InstallReport[]> {
    for (const notice of notices) {
      const current = await this.ctx.installer.read(notice.target, notice.name);
      if (
        current === undefined ||
        current.unmanaged ||
        current.version !== notice.current ||
        current.registry !== notice.registry
      ) {
        throw new AgentSkillsError(
          ErrorCode.USAGE,
          `Installation changed since checking ${notice.name}`,
          {
            hints: ['Run agent-skills list and check for updates again'],
          },
        );
      }
    }

    // Group only identical releases/destinations. Never install a listed skill into an agent
    // that did not have it, or merge two registries that happen to publish the same name.
    const groups = new Map<string, SkillUpdateNotice[]>();
    for (const notice of notices) {
      const key = JSON.stringify([
        notice.name,
        notice.version,
        notice.registry,
        notice.target.scope,
        notice.projectRoot,
      ]);
      groups.set(key, [...(groups.get(key) ?? []), notice]);
    }
    const plans: InstallOptions[] = [];
    for (const group of groups.values()) {
      const first = group[0]!;
      plans.push({
        refs: [`${first.name}@${first.version}`],
        registry: first.registry,
        agents: group.map((item) => item.target.agentId),
        scope: first.target.scope,
        projectRoot: first.projectRoot,
        force: false,
      });
    }
    // Preview all groups before the first write. A compatible direct update must not sneak
    // in a breaking upgrade (or downgrade) of an already installed dependency.
    for (const plan of plans) {
      const preview = await new InstallSkills(this.ctx).execute({ ...plan, dryRun: true });
      for (const result of preview.results) {
        const from = result.previousVersion;
        if (from === undefined || compareVersions(from, result.version) === 0) continue;
        const approved = notices.some(
          (item) =>
            item.name === result.name &&
            item.version === result.version &&
            item.target.agentId === result.agentId &&
            item.target.scope === result.scope,
        );
        if (
          compareVersions(from, result.version) > 0 ||
          (!satisfies(result.version, `^${from}`) && !approved)
        ) {
          throw new AgentSkillsError(
            ErrorCode.USAGE,
            `Dependency ${result.name} would change from ${from} to ${result.version}`,
            {
              hints: [
                'Review the full plan with agent-skills update --major --dry-run before updating',
              ],
            },
          );
        }
      }
    }
    const reports: InstallReport[] = [];
    for (const plan of plans) reports.push(await new InstallSkills(this.ctx).execute(plan));
    return reports;
  }
}
