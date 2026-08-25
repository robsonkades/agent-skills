import {
  AgentSkillsError,
  ErrorCode,
  computePackageIntegrity,
  loadPackageFromDirectory,
  parseRegistryIndex,
  type FetchedPackage,
  type FileSystem,
  type Hasher,
  type IndexVersionEntry,
  type RegistryIndex,
  type RegistryKind,
  type SearchQuery,
  type SemanticVersion,
  type SkillManifest,
  type SkillRegistry,
  type SkillSummary,
} from '@jvm-expert/core';
import { matches, toSummaries } from './search.ts';

export const INDEX_RELATIVE_PATH = 'registry/skills.yaml';

export interface LocalRegistryOptions {
  readonly name: string;
  /** Absolute path of the registry checkout root (the directory holding `registry/`). */
  readonly root: string;
  readonly fs: FileSystem;
  readonly hasher: Hasher;
  readonly trusted?: boolean;
  readonly kind?: RegistryKind;
}

/**
 * A registry backed by a directory on disk.
 *
 * Used directly (`agent-skills registry add local ./my-skills`), as the test double for the
 * whole registry protocol, and as the second half of {@link GitRegistry}, which clones into a
 * cache directory and then reads it exactly like this.
 */
export class LocalRegistry implements SkillRegistry {
  readonly name: string;
  readonly kind: RegistryKind;
  readonly trusted: boolean;

  protected readonly fs: FileSystem;
  protected readonly hasher: Hasher;
  private readonly root: string;
  private index: RegistryIndex | undefined;

  constructor(options: LocalRegistryOptions) {
    this.name = options.name;
    this.kind = options.kind ?? 'local';
    this.trusted = options.trusted ?? true;
    this.fs = options.fs;
    this.hasher = options.hasher;
    this.root = options.root;
  }

  /** Overridden by GitRegistry to refresh the clone before the index is read. */
  protected async ensureAvailable(): Promise<string> {
    return this.root;
  }

  async refresh(): Promise<void> {
    this.index = undefined;
    await this.loadIndex();
  }

  async search(query: SearchQuery): Promise<readonly SkillSummary[]> {
    const index = await this.loadIndex();
    const found = index.skills.filter((skill) => matches(skill, query.text));
    return toSummaries(found, this.name, query.limit);
  }

  async has(name: string): Promise<boolean> {
    const index = await this.loadIndex();
    return index.skills.some((skill) => skill.name === name);
  }

  async versions(name: string): Promise<readonly IndexVersionEntry[]> {
    const index = await this.loadIndex();
    return index.skills.find((skill) => skill.name === name)?.versions ?? [];
  }

  async manifest(name: string, version: SemanticVersion): Promise<SkillManifest> {
    return (await this.loadPackage(name, version)).pkg.manifest;
  }

  async fetch(name: string, version: SemanticVersion): Promise<FetchedPackage> {
    const { pkg, directory } = await this.loadPackage(name, version);
    return {
      pkg,
      registry: this.name,
      resolved: this.resolvedLocation(directory),
      integrity: computePackageIntegrity(pkg, this.hasher),
    };
  }

  protected resolvedLocation(directory: string): string {
    return `file://${directory.replace(/\\/g, '/')}`;
  }

  private async loadPackage(name: string, version: SemanticVersion) {
    const root = await this.ensureAvailable();
    const entry = (await this.versions(name)).find((candidate) => candidate.version === version);

    if (entry === undefined) {
      throw new AgentSkillsError(
        ErrorCode.VERSION_NOT_FOUND,
        `${name}@${version} is not published in "${this.name}"`,
        {
          hints: [`agent-skills info ${name}   to see published versions`],
          data: { name, version, registry: this.name },
        },
      );
    }
    if (entry.path === undefined) {
      throw new AgentSkillsError(
        ErrorCode.REGISTRY_INVALID_INDEX,
        `${name}@${version} in "${this.name}" has no "path"`,
        {
          details: ['A local or git registry serves packages from a directory, not a tarball.'],
          data: { name, version, registry: this.name },
        },
      );
    }

    const directory = this.fs.join(root, ...entry.path.split('/'));
    const loaded = await loadPackageFromDirectory(this.fs, directory);
    return { pkg: loaded.pkg, directory };
  }

  private async loadIndex(): Promise<RegistryIndex> {
    if (this.index !== undefined) return this.index;

    const root = await this.ensureAvailable();
    const path = this.fs.join(root, ...INDEX_RELATIVE_PATH.split('/'));

    if (!(await this.fs.exists(path))) {
      throw new AgentSkillsError(
        ErrorCode.REGISTRY_INVALID_INDEX,
        `Registry "${this.name}" has no ${INDEX_RELATIVE_PATH}`,
        {
          details: [`Looked in: ${root}`],
          hints: ['A registry is a directory containing registry/skills.yaml and skills/'],
          data: { registry: this.name, root },
        },
      );
    }

    this.index = parseRegistryIndex(await this.fs.readTextFile(path), {
      source: path,
      fallbackName: this.name,
    });
    return this.index;
  }
}
