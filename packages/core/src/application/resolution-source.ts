import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';
import type { IndexVersionEntry } from '../domain/registry-index.ts';
import type { SkillManifest } from '../domain/manifest.ts';
import type { ResolutionSource } from '../domain/resolver.ts';
import type { SemanticVersion } from '../domain/version.ts';
import type { FederatedRegistry, SkillRegistry } from '../ports/skill-registry.ts';

/**
 * Bridges the federated registry to the resolver.
 *
 * The resolver deliberately knows nothing about precedence or registry kinds; it asks for
 * versions and gets back the registry that owned the answer, which is what ends up pinned
 * in `skills.lock`.
 */
export class FederationResolutionSource implements ResolutionSource {
  private readonly federation: FederatedRegistry;
  /** From `--registry`: restricts every lookup to one configured registry. */
  private readonly restrictTo?: string;

  constructor(federation: FederatedRegistry, restrictTo?: string) {
    this.federation = federation;
    this.restrictTo = restrictTo;
  }

  async listVersions(
    name: string,
    registry?: string,
  ): Promise<{ registry: string; versions: readonly IndexVersionEntry[] }> {
    const requested = registry ?? this.restrictTo;

    if (requested !== undefined) {
      const target = this.require(requested);
      const versions = await target.versions(name);
      if (versions.length === 0) throw notFound(name, requested);
      return { registry: requested, versions };
    }

    const owner = await this.federation.ownerOf(name);
    if (owner === undefined) throw notFound(name);
    return { registry: owner, versions: await this.require(owner).versions(name) };
  }

  async loadManifest(
    name: string,
    version: SemanticVersion,
    registry: string,
  ): Promise<SkillManifest> {
    return this.require(registry).manifest(name, version);
  }

  private require(name: string): SkillRegistry {
    const registry = this.federation.named(name);
    if (registry !== undefined) return registry;
    throw new AgentSkillsError(ErrorCode.REGISTRY_NOT_FOUND, `No registry named "${name}"`, {
      details: [
        '',
        'Configured registries:',
        ...this.federation.members().map((member) => `  ${member.name}  (${member.kind})`),
      ],
      hints: ['agent-skills registry list', 'agent-skills registry add <name> <url>'],
      data: { requested: name },
    });
  }
}

function notFound(name: string, registry?: string): AgentSkillsError {
  return new AgentSkillsError(
    ErrorCode.SKILL_NOT_FOUND,
    registry === undefined
      ? `Skill "${name}" was not found in any configured registry`
      : `Skill "${name}" was not found in registry "${registry}"`,
    {
      hints: [
        `agent-skills search ${name}   to look for a similar name`,
        'agent-skills registry list   to see where the CLI is looking',
      ],
      data: { name, ...(registry === undefined ? {} : { registry }) },
    },
  );
}
