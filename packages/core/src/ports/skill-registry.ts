import type { IndexVersionEntry, RegistryKind } from '../domain/registry-index.ts';
import type { SkillManifest } from '../domain/manifest.ts';
import type { SkillPackage } from '../domain/skill-package.ts';
import type { SemanticVersion } from '../domain/version.ts';

export interface SkillSummary {
  readonly name: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly latest: SemanticVersion;
  readonly registry: string;
  /** Set when another, higher-precedence registry also publishes this name. */
  readonly shadowedBy?: string;
}

export interface SearchQuery {
  readonly text: string;
  readonly limit?: number;
}

export interface RefreshOptions {
  /** Ignore the cache TTL and re-fetch. */
  readonly force?: boolean;
}

export interface FetchedPackage {
  readonly pkg: SkillPackage;
  readonly registry: string;
  /** Fully qualified source location, recorded in the lockfile and receipts. */
  readonly resolved: string;
  /** Integrity computed over the fetched bytes, not copied from the manifest. */
  readonly integrity: string;
}

/**
 * A registry answers four questions: what exists, what versions, what manifest, give me the
 * bytes. Local, Git and HTTP implementations differ only in how they answer them, which is
 * what lets the CLI stay ignorant of where skills come from.
 */
export interface SkillRegistry {
  readonly name: string;
  readonly kind: RegistryKind;
  /** Configured trust flag. Untrusted registries are reported in `doctor` and `info`. */
  readonly trusted: boolean;

  refresh(options?: RefreshOptions): Promise<void>;
  search(query: SearchQuery): Promise<readonly SkillSummary[]>;
  has(name: string): Promise<boolean>;
  versions(name: string): Promise<readonly IndexVersionEntry[]>;
  manifest(name: string, version: SemanticVersion): Promise<SkillManifest>;
  fetch(name: string, version: SemanticVersion): Promise<FetchedPackage>;
}

/**
 * Precedence-aware routing over several registries.
 *
 * Kept separate from {@link SkillRegistry} so a single-registry setup needs only the four
 * questions, while the application can still ask *which* registry owns a name — the answer
 * that ends up pinned in the lockfile and in receipts.
 */
export interface RegistryRouter {
  /** Configured name of the first registry publishing `name`, or undefined. */
  ownerOf(name: string): Promise<string | undefined>;
  named(name: string): SkillRegistry | undefined;
  members(): readonly SkillRegistry[];
}

export interface FederatedRegistry extends SkillRegistry, RegistryRouter {}

export interface RegistryConfig {
  readonly name: string;
  readonly url: string;
  readonly kind: RegistryKind;
  readonly trusted: boolean;
  /** Git ref for git registries. Defaults to the remote's default branch. */
  readonly ref?: string;
}

/** Builds a driver for a configured registry. Lets the CLI stay free of driver imports. */
export interface RegistryFactory {
  create(config: RegistryConfig): SkillRegistry;
}
