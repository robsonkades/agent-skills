import type { AgentTarget } from '../domain/agent.ts';
import {
  compareVersions,
  isPrerelease,
  maxSatisfying,
  parseVersion,
  satisfies,
  type SemanticVersion,
} from '../domain/version.ts';
import {
  emptyUpdateState,
  type ToolUpdater,
  type UpdateState,
  type UpdateStateStore,
} from '../ports/updates.ts';
import type { ApplicationContext } from './context.ts';
import { ListInstalled, type ListOptions } from './list-installed.ts';

export const UPDATE_REMINDER_MS = 24 * 60 * 60 * 1000;

export interface UpdateNotice {
  readonly id: string;
  readonly current: SemanticVersion;
  readonly version: SemanticVersion;
}

export interface SkillUpdateNotice extends UpdateNotice {
  readonly name: string;
  readonly registry: string;
  readonly target: AgentTarget;
  readonly projectRoot?: string;
  readonly modified: boolean;
  /** Also covers breaking 0.x changes, following update's ^current policy. */
  readonly requiresMajor: boolean;
}

export interface UpdateNotices {
  readonly tool?: UpdateNotice;
  readonly skills: readonly SkillUpdateNotice[];
}

/** Metadata-only checks. A failed lookup is advisory and never substitutes another registry. */
export class CheckUpdates {
  private readonly ctx: ApplicationContext;
  private readonly tool: ToolUpdater;
  private readonly store: UpdateStateStore;

  constructor(ctx: ApplicationContext, tool: ToolUpdater, store: UpdateStateStore) {
    this.ctx = ctx;
    this.tool = tool;
    this.store = store;
  }

  async execute(
    options: ListOptions & { skipSkills?: boolean; registry?: string } = {},
  ): Promise<UpdateNotices> {
    const state = await this.load();
    const now = this.ctx.clock.now().getTime();
    const visible = (id: string) =>
      !state.dismissed.includes(id) && (state.deferred[id] ?? 0) <= now;
    const lookup = async (
      key: string,
      ttl: number,
      fetch: () => Promise<readonly SemanticVersion[]>,
    ) => {
      const cached = state.checks[key];
      if (cached !== undefined && now >= cached.checkedAt && now - cached.checkedAt < ttl) {
        return cached.versions;
      }
      try {
        const versions = await fetch();
        state.checks[key] = { checkedAt: now, versions };
        return versions;
      } catch (error) {
        this.ctx.logger.debug('Update check unavailable', error);
        // Do not retry on every invocation or announce stale metadata after a failed refresh.
        state.checks[key] = { checkedAt: now, versions: [] };
        return [];
      }
    };

    const current = parseVersion(
      this.ctx.toolVersion.slice(this.ctx.toolVersion.lastIndexOf('@') + 1),
    );
    const latest = (
      await lookup('tool', UPDATE_REMINDER_MS, async () => {
        const version = await this.tool.latestVersion();
        return version === undefined ? [] : [version];
      })
    )[0];
    const toolId = JSON.stringify(['tool', latest]);
    const tool =
      latest !== undefined && compareVersions(latest, current) > 0 && visible(toolId)
        ? { id: toolId, current, version: latest }
        : undefined;

    const skills: SkillUpdateNotice[] = [];
    if (!options.skipSkills) {
      const installed = await new ListInstalled(this.ctx).execute(options);
      const failedRegistries = new Set<string>();
      for (const { target, skills: entries } of installed.entries) {
        if (this.ctx.config.agents[target.agentId]?.enabled === false) continue;
        for (const entry of entries) {
          if (
            entry.unmanaged ||
            (options.registry !== undefined && entry.registry !== options.registry)
          )
            continue;
          const registry = this.ctx.registry.named(entry.registry);
          if (registry === undefined) continue;
          const config = this.ctx.config.registries.find((item) => item.name === entry.registry);
          const origin = [entry.registry, config?.url, config?.ref, config?.kind];
          const key = JSON.stringify([...origin, entry.name]);
          const versions = await lookup(
            key,
            Math.max(60, this.ctx.config.cache.ttlSeconds) * 1000,
            async () => {
              if (failedRegistries.has(entry.registry)) return [];
              try {
                return (await registry.versions(entry.name))
                  .filter((item) => !item.deprecated && !isPrerelease(item.version))
                  .map((item) => item.version);
              } catch (error) {
                failedRegistries.add(entry.registry);
                throw error;
              }
            },
          );
          const compatible = maxSatisfying(versions, `^${entry.version}`);
          const newest = maxSatisfying(versions, '*');
          for (const version of new Set([compatible, newest])) {
            if (version === undefined || compareVersions(version, entry.version) <= 0) continue;
            const id = JSON.stringify([
              'skill',
              target.agentId,
              target.root,
              ...origin,
              entry.name,
              version,
            ]);
            if (!visible(id)) continue;
            skills.push({
              id,
              name: entry.name,
              current: entry.version,
              version,
              target,
              registry: entry.registry,
              projectRoot: installed.projectRoot,
              modified: entry.modified,
              requiresMajor: !satisfies(version, `^${entry.version}`),
            });
          }
        }
      }
    }
    await this.save(state);
    return { tool, skills };
  }

  async dismiss(notices: readonly UpdateNotice[]): Promise<void> {
    const state = await this.load();
    await this.save({
      ...state,
      dismissed: [...new Set([...state.dismissed, ...notices.map((item) => item.id)])],
    });
  }

  async remindLater(notices: readonly UpdateNotice[]): Promise<void> {
    const state = await this.load();
    for (const notice of notices)
      state.deferred[notice.id] = this.ctx.clock.now().getTime() + UPDATE_REMINDER_MS;
    await this.save(state);
  }

  private async load(): Promise<UpdateState> {
    return this.store.load().catch(() => emptyUpdateState());
  }

  private async save(state: UpdateState): Promise<void> {
    await this.store
      .save(state)
      .catch((error: unknown) => this.ctx.logger.debug('Could not save update reminders', error));
  }
}
