import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';
import type { IndexVersionEntry } from '../domain/registry-index.ts';
import type { SkillManifest } from '../domain/manifest.ts';
import { parseSkillRef } from '../domain/skill-ref.ts';
import type { InstalledSkill } from '../ports/installation.ts';
import type { SkillSummary } from '../ports/skill-registry.ts';
import type { ApplicationContext } from './context.ts';
import { ListInstalled } from './list-installed.ts';

export interface SearchOptions {
  readonly query: string;
  readonly registry?: string;
  readonly limit?: number;
}

export class SearchSkills {
  private readonly ctx: ApplicationContext;

  constructor(ctx: ApplicationContext) {
    this.ctx = ctx;
  }

  async execute(options: SearchOptions): Promise<readonly SkillSummary[]> {
    const source =
      options.registry === undefined
        ? this.ctx.registry
        : this.ctx.registry.named(options.registry);

    if (source === undefined) {
      throw new AgentSkillsError(
        ErrorCode.REGISTRY_NOT_FOUND,
        `No registry named "${options.registry}"`,
        {
          details: [
            '',
            'Configured registries:',
            ...this.ctx.registry.members().map((member) => `  ${member.name}  (${member.kind})`),
          ],
          hints: ['agent-skills registry list'],
        },
      );
    }

    return source.search({
      text: options.query,
      ...(options.limit === undefined ? {} : { limit: options.limit }),
    });
  }
}

export interface SkillInfo {
  readonly name: string;
  readonly registry: string;
  readonly manifest: SkillManifest;
  readonly versions: readonly IndexVersionEntry[];
  readonly latest: IndexVersionEntry;
  /** Where this skill is currently installed, across every agent and scope. */
  readonly installed: readonly InstalledSkill[];
}

/**
 * `info` answers "what is this and do I have it?" in one call, which is why it joins registry
 * metadata with local install state rather than making the user run two commands.
 */
export class DescribeSkill {
  private readonly ctx: ApplicationContext;

  constructor(ctx: ApplicationContext) {
    this.ctx = ctx;
  }

  async execute(rawRef: string, options: { readonly registry?: string } = {}): Promise<SkillInfo> {
    const ref = parseSkillRef(rawRef);
    const registryName =
      ref.registry ?? options.registry ?? (await this.ctx.registry.ownerOf(ref.name));

    if (registryName === undefined) {
      throw new AgentSkillsError(
        ErrorCode.SKILL_NOT_FOUND,
        `Skill "${ref.name}" was not found in any configured registry`,
        {
          hints: [`agent-skills search ${ref.name}`, 'agent-skills registry list'],
          data: { name: ref.name },
        },
      );
    }

    const registry = this.ctx.registry.named(registryName);
    if (registry === undefined) {
      throw new AgentSkillsError(
        ErrorCode.REGISTRY_NOT_FOUND,
        `No registry named "${registryName}"`,
      );
    }

    const versions = await registry.versions(ref.name);
    if (versions.length === 0) {
      throw new AgentSkillsError(
        ErrorCode.SKILL_NOT_FOUND,
        `Skill "${ref.name}" was not found in registry "${registryName}"`,
        { hints: [`agent-skills search ${ref.name}`], data: { name: ref.name } },
      );
    }

    const selected =
      ref.range === undefined || ref.range === 'latest'
        ? (versions.find((entry) => !entry.deprecated) ?? versions[0]!)
        : versions.find((entry) => entry.version === ref.range);

    if (selected === undefined) {
      throw new AgentSkillsError(
        ErrorCode.VERSION_NOT_FOUND,
        `${ref.name}@${ref.range} was not found`,
        {
          details: ['', `Published versions: ${versions.map((entry) => entry.version).join(', ')}`],
          data: { name: ref.name, range: ref.range },
        },
      );
    }

    const list = await new ListInstalled(this.ctx).execute({});
    const installed = list.entries
      .flatMap((entry) => entry.skills)
      .filter((skill) => skill.name === ref.name);

    return {
      name: ref.name,
      registry: registryName,
      manifest: await registry.manifest(ref.name, selected.version),
      versions,
      latest: selected,
      installed,
    };
  }
}
