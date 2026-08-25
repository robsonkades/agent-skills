import type { AgentId } from '../domain/agent.ts';
import type { RegistryConfig } from './skill-registry.ts';

export interface AgentConfig {
  readonly enabled: boolean;
  /** Overrides the adapter's default global skill root. Escape hatch for convention drift. */
  readonly globalRoot?: string;
  /** Overrides the adapter's default project-relative skill directory. */
  readonly projectRoot?: string;
}

export interface CacheConfig {
  readonly ttlSeconds: number;
}

export interface AgentSkillsConfig {
  readonly schemaVersion: number;
  /** Ordered: earlier registries take precedence (ARCHITECTURE.md §6). */
  readonly registries: readonly RegistryConfig[];
  readonly agents: Readonly<Record<AgentId, AgentConfig>>;
  readonly cache: CacheConfig;
}

/** Persisted user configuration. A port so tests never touch a real home directory. */
export interface ConfigStore {
  load(): Promise<AgentSkillsConfig>;
  save(config: AgentSkillsConfig): Promise<void>;
  /** Absolute path of the config file, for `doctor` and error messages. */
  location(): string;
}
