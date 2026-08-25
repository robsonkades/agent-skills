import { AgentSkillsError, ErrorCode } from '../../src/domain/errors.ts';
import type { IndexVersionEntry, RegistryKind } from '../../src/domain/registry-index.ts';
import type { SkillManifest } from '../../src/domain/manifest.ts';
import type { SemanticVersion } from '../../src/domain/version.ts';
import type {
  FederatedRegistry,
  FetchedPackage,
  SearchQuery,
  SkillRegistry,
  SkillSummary,
} from '../../src/ports/skill-registry.ts';

/**
 * A minimal federation for core's own tests.
 *
 * Core cannot import `@jvm-expert/registry` — that would invert the dependency rule the
 * architecture is built on — so the application-layer tests use this stand-in. The real
 * federation, including precedence semantics, is tested in the registry package.
 */
export class RegistryFederationDouble implements FederatedRegistry {
  readonly name = '<federation>';
  readonly kind: RegistryKind = 'local';
  readonly trusted = true;

  private readonly registries: readonly SkillRegistry[];

  constructor(registries: readonly SkillRegistry[]) {
    this.registries = registries;
  }

  members(): readonly SkillRegistry[] {
    return this.registries;
  }

  named(name: string): SkillRegistry | undefined {
    return this.registries.find((registry) => registry.name === name);
  }

  async ownerOf(name: string): Promise<string | undefined> {
    for (const registry of this.registries) {
      if (await registry.has(name).catch(() => false)) return registry.name;
    }
    return undefined;
  }

  async refresh(): Promise<void> {
    for (const registry of this.registries) await registry.refresh();
  }

  async search(query: SearchQuery): Promise<readonly SkillSummary[]> {
    const results: SkillSummary[] = [];
    for (const registry of this.registries) results.push(...(await registry.search(query)));
    return results;
  }

  async has(name: string): Promise<boolean> {
    return (await this.ownerOf(name)) !== undefined;
  }

  async versions(name: string): Promise<readonly IndexVersionEntry[]> {
    return (await this.require(name)).versions(name);
  }

  async manifest(name: string, version: SemanticVersion): Promise<SkillManifest> {
    return (await this.require(name)).manifest(name, version);
  }

  async fetch(name: string, version: SemanticVersion): Promise<FetchedPackage> {
    return (await this.require(name)).fetch(name, version);
  }

  private async require(name: string): Promise<SkillRegistry> {
    const owner = await this.ownerOf(name);
    const registry = owner === undefined ? undefined : this.named(owner);
    if (registry === undefined) {
      throw new AgentSkillsError(ErrorCode.SKILL_NOT_FOUND, `Skill "${name}" was not found`);
    }
    return registry;
  }
}
