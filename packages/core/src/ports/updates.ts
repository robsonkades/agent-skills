import type { SemanticVersion } from '../domain/version.ts';
import type { CommandResult } from './infrastructure.ts';

export interface UpdateState {
  readonly checks: Record<string, { checkedAt: number; versions: readonly SemanticVersion[] }>;
  readonly dismissed: readonly string[];
  readonly deferred: Record<string, number>;
}

export function emptyUpdateState(): UpdateState {
  return { checks: {}, dismissed: [], deferred: {} };
}

/** Advisory state, separate from configuration, receipts and lockfiles. */
export interface UpdateStateStore {
  load(): Promise<UpdateState>;
  save(state: UpdateState): Promise<void>;
}

export interface ToolUpdateAction {
  /** Human-readable command, constructed locally, never supplied by a registry. */
  readonly label: string;
  /** Absent for temporary installs and installation methods we cannot identify. */
  readonly run?: () => Promise<CommandResult>;
}

export interface ToolUpdater {
  latestVersion(): Promise<SemanticVersion | undefined>;
  action(version: SemanticVersion): Promise<ToolUpdateAction>;
}

export interface SelectionPrompt {
  /** Zero-based choice; undefined means Escape, EOF or interruption. */
  choose(message: string, choices: readonly string[]): Promise<number | undefined>;
}
