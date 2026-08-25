import {
  AgentSkillsError,
  ErrorCode,
  type Clock,
  type CommandRunner,
  type FileSystem,
  type Hasher,
  type HttpClient,
  type Logger,
  type PackageExtractor,
  type RegistryConfig,
  type RegistryFactory,
  type SkillRegistry,
} from '@jvm-expert/core';
import { GitRegistry } from './git-registry.ts';
import { HttpRegistry } from './http-registry.ts';
import { LocalRegistry } from './local-registry.ts';

export interface DefaultRegistryFactoryOptions {
  readonly fs: FileSystem;
  readonly hasher: Hasher;
  readonly http: HttpClient;
  readonly commands: CommandRunner;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly extractor: PackageExtractor;
  readonly cacheDir: string;
  readonly ttlSeconds?: number;
}

/**
 * Builds a driver for a configured registry.
 *
 * Exists so the CLI's composition root can stay free of registry-kind imports and so adding a
 * fourth kind is a change here rather than a change in every command.
 */
export class DefaultRegistryFactory implements RegistryFactory {
  private readonly options: DefaultRegistryFactoryOptions;

  constructor(options: DefaultRegistryFactoryOptions) {
    this.options = options;
  }

  create(config: RegistryConfig): SkillRegistry {
    const { fs, hasher, http, commands, clock, logger, extractor, cacheDir } = this.options;
    const ttlSeconds = this.options.ttlSeconds ?? 3600;

    switch (config.kind) {
      case 'local':
        return new LocalRegistry({
          name: config.name,
          root: toLocalPath(fs, config.url),
          fs,
          hasher,
          trusted: config.trusted,
        });

      case 'git':
        return new GitRegistry({
          name: config.name,
          url: config.url,
          ...(config.ref === undefined ? {} : { ref: config.ref }),
          cacheDir,
          fs,
          hasher,
          commands,
          clock,
          logger,
          trusted: config.trusted,
          ttlSeconds,
        });

      case 'http':
        return new HttpRegistry({
          name: config.name,
          url: config.url,
          http,
          fs,
          hasher,
          clock,
          extractor,
          cacheDir,
          trusted: config.trusted,
          ttlSeconds,
        });

      default:
        throw new AgentSkillsError(
          ErrorCode.USAGE,
          `Unknown registry kind "${String(config.kind)}" for "${config.name}"`,
          { hints: ['Supported kinds: local, git, http'], data: { config } },
        );
    }
  }
}

function toLocalPath(fs: FileSystem, url: string): string {
  if (!url.startsWith('file://')) return fs.resolve(url);

  // `file:///C:/x` and `file:///home/x` both need the leading slash handling that
  // `new URL().pathname` gets wrong on Windows.
  const parsed = new URL(url);
  const decoded = decodeURIComponent(parsed.pathname);
  return fs.resolve(/^\/[a-zA-Z]:/.test(decoded) ? decoded.slice(1) : decoded);
}
