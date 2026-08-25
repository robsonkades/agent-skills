import {
  AgentSkillsError,
  ErrorCode,
  computePackageIntegrity,
  parseRegistryIndex,
  type Clock,
  type FetchedPackage,
  type FileSystem,
  type Hasher,
  type HttpClient,
  type IndexVersionEntry,
  type PackageExtractor,
  type RegistryIndex,
  type RegistryKind,
  type SearchQuery,
  type SemanticVersion,
  type SkillManifest,
  type SkillRegistry,
  type SkillSummary,
} from '@jvm-expert/core';
import { matches, toSummaries } from './search.ts';

export interface HttpRegistryOptions {
  readonly name: string;
  /** URL of the index document, e.g. `https://skills.example.com/index.json`. */
  readonly url: string;
  readonly http: HttpClient;
  readonly fs: FileSystem;
  readonly hasher: Hasher;
  readonly clock: Clock;
  readonly extractor: PackageExtractor;
  readonly cacheDir: string;
  readonly trusted?: boolean;
  readonly ttlSeconds?: number;
}

/**
 * A registry served over HTTPS: an index document plus `.tar.gz` payloads.
 *
 * Exists so a static bucket — or a future hosted service — can speak the identical protocol
 * with no client change. Transport security is enforced by the HTTP client (plaintext is
 * refused outside loopback), and payload safety by the shared {@link SafeExtractor}, so this
 * class is only responsible for caching and for turning HTTP status codes into good errors.
 */
export class HttpRegistry implements SkillRegistry {
  readonly name: string;
  readonly kind: RegistryKind = 'http';
  readonly trusted: boolean;

  private readonly url: string;
  private readonly http: HttpClient;
  private readonly fs: FileSystem;
  private readonly hasher: Hasher;
  private readonly clock: Clock;
  private readonly extractor: PackageExtractor;
  private readonly cacheDir: string;
  private readonly ttlSeconds: number;
  private index: RegistryIndex | undefined;
  private fetchedAt = 0;

  constructor(options: HttpRegistryOptions) {
    this.name = options.name;
    this.url = options.url;
    this.http = options.http;
    this.fs = options.fs;
    this.hasher = options.hasher;
    this.clock = options.clock;
    this.extractor = options.extractor;
    this.cacheDir = options.cacheDir;
    this.trusted = options.trusted ?? true;
    this.ttlSeconds = options.ttlSeconds ?? 3600;
  }

  async refresh(): Promise<void> {
    this.index = undefined;
    this.fetchedAt = 0;
    await this.loadIndex();
  }

  async search(query: SearchQuery): Promise<readonly SkillSummary[]> {
    const index = await this.loadIndex();
    return toSummaries(
      index.skills.filter((skill) => matches(skill, query.text)),
      this.name,
      query.limit,
      query.text,
    );
  }

  async has(name: string): Promise<boolean> {
    return (await this.loadIndex()).skills.some((skill) => skill.name === name);
  }

  async versions(name: string): Promise<readonly IndexVersionEntry[]> {
    const index = await this.loadIndex();
    return index.skills.find((skill) => skill.name === name)?.versions ?? [];
  }

  async manifest(name: string, version: SemanticVersion): Promise<SkillManifest> {
    return (await this.fetch(name, version)).pkg.manifest;
  }

  async fetch(name: string, version: SemanticVersion): Promise<FetchedPackage> {
    const entry = (await this.versions(name)).find((candidate) => candidate.version === version);

    if (entry === undefined) {
      throw new AgentSkillsError(
        ErrorCode.VERSION_NOT_FOUND,
        `${name}@${version} is not published in "${this.name}"`,
        { data: { name, version, registry: this.name } },
      );
    }
    if (entry.tarball === undefined) {
      throw new AgentSkillsError(
        ErrorCode.REGISTRY_INVALID_INDEX,
        `${name}@${version} in "${this.name}" has no "tarball"`,
        {
          details: ['An http registry must serve packages as .tar.gz URLs.'],
          data: { name, version, registry: this.name },
        },
      );
    }

    const tarballUrl = new URL(entry.tarball, this.url).toString();
    const bytes = await this.download(tarballUrl, `${name}@${version}`);
    const pkg = await this.extractor.extract(bytes, tarballUrl);

    if (pkg.manifest.name !== name || pkg.manifest.version !== version) {
      // The index said one thing and the payload another. Treat it as an attack, not a typo.
      throw new AgentSkillsError(
        ErrorCode.INTEGRITY_MISMATCH,
        `Registry "${this.name}" served ${pkg.manifest.name}@${pkg.manifest.version} for ${name}@${version}`,
        {
          hints: ['Do not install this. Report it to the registry maintainers.'],
          data: { registry: this.name, requested: `${name}@${version}` },
        },
      );
    }

    return {
      pkg,
      registry: this.name,
      resolved: tarballUrl,
      integrity: computePackageIntegrity(pkg, this.hasher),
    };
  }

  private async download(url: string, label: string): Promise<Uint8Array> {
    const response = await this.http.get(url, { timeoutMs: 60_000 });

    if (response.status === 404) {
      throw new AgentSkillsError(ErrorCode.SKILL_NOT_FOUND, `${label} was not found at ${url}`, {
        hints: ['The registry index may be out of date; try `agent-skills doctor`'],
        data: { url, registry: this.name },
      });
    }
    if (response.status >= 400) {
      throw new AgentSkillsError(
        ErrorCode.REGISTRY_UNAVAILABLE,
        `Registry "${this.name}" returned HTTP ${response.status} for ${label}`,
        { data: { url, status: response.status, registry: this.name } },
      );
    }

    return response.body;
  }

  private async loadIndex(): Promise<RegistryIndex> {
    const now = this.clock.now().getTime();
    if (this.index !== undefined && now - this.fetchedAt < this.ttlSeconds * 1000)
      return this.index;

    let text: string;
    try {
      const response = await this.http.get(this.url, { timeoutMs: 30_000 });
      if (response.status >= 400) {
        throw new AgentSkillsError(
          ErrorCode.REGISTRY_UNAVAILABLE,
          `Registry "${this.name}" returned HTTP ${response.status}`,
          { details: [this.url], data: { url: this.url, status: response.status } },
        );
      }
      text = new TextDecoder().decode(response.body);
      // Cache on disk so `search` and `info` keep working when the network is unavailable.
      await this.writeCache(text).catch(() => undefined);
    } catch (error) {
      const cached = await this.readCache();
      if (cached === undefined) throw error;
      text = cached;
    }

    this.index = parseRegistryIndex(text, { source: this.url, fallbackName: this.name });
    this.fetchedAt = now;
    return this.index;
  }

  private cachePath(): string {
    return this.fs.join(this.cacheDir, 'http', `${sanitise(this.name)}.index`);
  }

  private async writeCache(text: string): Promise<void> {
    await this.fs.writeFile(this.cachePath(), text);
  }

  private async readCache(): Promise<string | undefined> {
    const path = this.cachePath();
    if (!(await this.fs.exists(path))) return undefined;
    return this.fs.readTextFile(path);
  }
}

function sanitise(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-');
}
