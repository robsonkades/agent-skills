import type { AgentId, AgentTarget, InstallScope } from '../domain/agent.ts';
import type { InstallReceipt } from '../domain/receipt.ts';
import type { SkillPackage } from '../domain/skill-package.ts';
import type { SemanticVersion } from '../domain/version.ts';
import type { AgentAdapter } from './agent-adapter.ts';

/**
 * Turns an untrusted archive into a validated package.
 *
 * A port rather than a direct dependency so registries — which need it to serve tarballs —
 * depend only on core, and the one hardened implementation stays in `@jvm-expert/installer`.
 */
export interface PackageExtractor {
  extract(data: Uint8Array, source: string): Promise<SkillPackage>;
}

export interface InstallRequest {
  readonly pkg: SkillPackage;
  readonly adapter: AgentAdapter;
  readonly target: AgentTarget;
  readonly registry: string;
  readonly resolved: string;
  readonly integrity: string;
  /** Names of skills that pulled this one in; empty for a direct install. */
  readonly dependencyOf: readonly string[];
  /** Overwrite an existing install whose files were modified by hand. */
  readonly force: boolean;
  /** Compute and report the plan without writing anything outside staging. */
  readonly dryRun: boolean;
}

export type InstallOutcome = 'installed' | 'upgraded' | 'downgraded' | 'reinstalled' | 'unchanged';

export interface InstallResult {
  readonly outcome: InstallOutcome;
  readonly name: string;
  readonly version: SemanticVersion;
  readonly previousVersion?: SemanticVersion;
  readonly agentId: AgentId;
  readonly scope: InstallScope;
  /** Absolute path of the installed skill directory. */
  readonly directory: string;
  /** Relative POSIX paths written, in sorted order. */
  readonly files: readonly string[];
  readonly receipt: InstallReceipt;
}

export interface UninstallRequest {
  readonly name: string;
  readonly adapter: AgentAdapter;
  readonly target: AgentTarget;
  /** Delete files even when their content no longer matches the receipt. */
  readonly force: boolean;
  readonly dryRun: boolean;
}

export interface UninstallResult {
  readonly name: string;
  readonly version?: SemanticVersion;
  readonly agentId: AgentId;
  readonly scope: InstallScope;
  readonly directory: string;
  readonly removed: readonly string[];
  /** Files left behind because they were modified after installation. */
  readonly preserved: readonly string[];
}

export interface InstalledSkill {
  readonly name: string;
  readonly version: SemanticVersion;
  readonly agentId: AgentId;
  readonly scope: InstallScope;
  readonly directory: string;
  readonly registry: string;
  readonly installedAt: string;
  /** True when the tool has no receipt for a directory that exists in the skill root. */
  readonly unmanaged: boolean;
  /** True when on-disk content no longer matches the receipt. */
  readonly modified: boolean;
  readonly dependencyOf: readonly string[];
}

/**
 * The one component allowed to mutate an agent's skill directory. Implemented once, in
 * `@jvm-expert/installer`, so atomicity, rollback and ownership tracking exist in exactly
 * one place regardless of how many agents are supported.
 */
export interface InstallationEngine {
  install(request: InstallRequest): Promise<InstallResult>;
  uninstall(request: UninstallRequest): Promise<UninstallResult>;
  list(target: AgentTarget): Promise<readonly InstalledSkill[]>;
  read(target: AgentTarget, name: string): Promise<InstalledSkill | undefined>;
}
