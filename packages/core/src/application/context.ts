import type { AgentSkillsConfig } from '../ports/config-store.ts';
import type { AgentCatalog } from '../ports/agent-adapter.ts';
import type { InstallationEngine } from '../ports/installation.ts';
import type { FederatedRegistry } from '../ports/skill-registry.ts';
import type {
  Clock,
  CommandRunner,
  Environment,
  FileSystem,
  Logger,
} from '../ports/infrastructure.ts';

/**
 * Everything the application services need, assembled once by the CLI's composition root.
 *
 * A context object rather than per-service constructor arguments: eight services each taking
 * the same seven collaborators is noise, and the bundle makes it obvious that no service
 * reaches for anything outside this set.
 */
export interface ApplicationContext {
  readonly agents: AgentCatalog;
  /** Usually a `RegistryFederation` over the configured registries. */
  readonly registry: FederatedRegistry;
  readonly installer: InstallationEngine;
  readonly fs: FileSystem;
  readonly env: Environment;
  /** Used for agent detection probes and by the git registry. */
  readonly commands: CommandRunner;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly config: AgentSkillsConfig;
  /** Version string recorded in lockfiles and receipts, e.g. `@jvm-expert/agent-skills@1.0.0`. */
  readonly toolVersion: string;
}
