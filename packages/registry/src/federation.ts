import {
  AgentSkillsError,
  ErrorCode,
  type FederatedRegistry,
  type FetchedPackage,
  type IndexVersionEntry,
  type RefreshOptions,
  type RegistryKind,
  type SearchQuery,
  type SemanticVersion,
  type SkillManifest,
  type SkillRegistry,
  type SkillSummary,
} from '@jvm-expert/core';

/**
 * An ordered set of registries presented as one.
 *
 * Precedence is **name-scoped**: the first registry publishing *any* version of a name owns
 * that name outright, and a later registry cannot inject a higher version of it. That is the
 * npm `.npmrc` model rather than "highest version anywhere wins", and the difference is a
 * security property — it is what closes the dependency-confusion hole that has repeatedly
 * been used against npm and PyPI (ARCHITECTURE.md §6).
 *
 * A caller that genuinely wants a specific source qualifies the reference
 * (`company:java-performance`), which bypasses precedence entirely.
 */
export class RegistryFederation implements FederatedRegistry {
  readonly name = '<federation>';
  readonly kind: RegistryKind = 'local';
  readonly trusted: boolean;

  private readonly registries: readonly SkillRegistry[];
  private readonly owners = new Map<string, string | undefined>();

  constructor(registries: readonly SkillRegistry[]) {
    this.registries = registries;
    this.trusted = registries.every((registry) => registry.trusted);
  }

  members(): readonly SkillRegistry[] {
    return this.registries;
  }

  named(name: string): SkillRegistry | undefined {
    return this.registries.find((registry) => registry.name === name);
  }

  async ownerOf(name: string): Promise<string | undefined> {
    if (this.owners.has(name)) return this.owners.get(name);

    for (const registry of this.registries) {
      // One unreachable registry must not hide a name a lower-precedence one can serve, but it
      // also must not silently promote the next registry to owner — so failures are skipped
      // here and surfaced by `doctor`, which is the command whose job that is.
      const has = await registry.has(name).catch(() => false);
      if (has) {
        this.owners.set(name, registry.name);
        return registry.name;
      }
    }

    this.owners.set(name, undefined);
    return undefined;
  }

  async refresh(options?: RefreshOptions): Promise<void> {
    this.owners.clear();
    const failures: AgentSkillsError[] = [];

    for (const registry of this.registries) {
      try {
        await registry.refresh(options);
      } catch (error) {
        failures.push(
          error instanceof AgentSkillsError
            ? error
            : new AgentSkillsError(ErrorCode.REGISTRY_UNAVAILABLE, String(error)),
        );
      }
    }

    // Every registry failed: this is not a partial outage, it is "no registries work".
    if (failures.length > 0 && failures.length === this.registries.length) {
      throw new AgentSkillsError(ErrorCode.REGISTRY_UNAVAILABLE, 'No registry could be reached', {
        details: failures.map((failure) => `  ${failure.message}`),
        hints: ['agent-skills doctor   to diagnose', 'agent-skills registry list'],
      });
    }
  }

  /**
   * Aggregates across every registry, labelling shadowed duplicates rather than dropping them.
   * A user searching for a name their company registry overrides should be able to see that.
   */
  async search(query: SearchQuery): Promise<readonly SkillSummary[]> {
    const seen = new Map<string, string>();
    const results: SkillSummary[] = [];

    for (const registry of this.registries) {
      const found = await registry.search(query).catch(() => []);
      for (const summary of found) {
        const owner = seen.get(summary.name);
        if (owner === undefined) {
          seen.set(summary.name, registry.name);
          results.push(summary);
        } else {
          results.push({ ...summary, shadowedBy: owner });
        }
      }
    }

    return query.limit === undefined ? results : results.slice(0, query.limit);
  }

  async has(name: string): Promise<boolean> {
    return (await this.ownerOf(name)) !== undefined;
  }

  async versions(name: string): Promise<readonly IndexVersionEntry[]> {
    const registry = await this.require(name);
    return registry.versions(name);
  }

  async manifest(name: string, version: SemanticVersion): Promise<SkillManifest> {
    const registry = await this.require(name);
    return registry.manifest(name, version);
  }

  async fetch(name: string, version: SemanticVersion): Promise<FetchedPackage> {
    const registry = await this.require(name);
    return registry.fetch(name, version);
  }

  private async require(name: string): Promise<SkillRegistry> {
    const owner = await this.ownerOf(name);
    const registry = owner === undefined ? undefined : this.named(owner);

    if (registry === undefined) {
      throw new AgentSkillsError(
        ErrorCode.SKILL_NOT_FOUND,
        `Skill "${name}" was not found in any configured registry`,
        {
          details: [
            '',
            'Searched, in precedence order:',
            ...this.registries.map(
              (member, index) => `  ${index + 1}. ${member.name} (${member.kind})`,
            ),
          ],
          hints: [`agent-skills search ${name}`, 'agent-skills registry list'],
          data: { name, registries: this.registries.map((member) => member.name) },
        },
      );
    }

    return registry;
  }
}
