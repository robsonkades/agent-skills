import {
  AgentSkillsError,
  ErrorCode,
  type Clock,
  type CommandRunner,
  type FileSystem,
  type Hasher,
  type Logger,
  type RegistryKind,
} from '@jvm-expert/core';
import { LocalRegistry } from './local-registry.ts';

export interface GitRegistryOptions {
  readonly name: string;
  /** Clone URL, optionally with a `#ref` suffix. */
  readonly url: string;
  readonly ref?: string;
  readonly cacheDir: string;
  readonly fs: FileSystem;
  readonly hasher: Hasher;
  readonly commands: CommandRunner;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly trusted?: boolean;
  readonly ttlSeconds?: number;
}

const CACHE_MARKER = '.agent-skills-fetched-at';

/**
 * A registry backed by a git repository.
 *
 * This is the v1 default because it requires no infrastructure: a public repository with
 * `registry/skills.yaml` and a `skills/` directory *is* a registry, and its write path is a
 * pull request — which is a better review surface for content that becomes agent instructions
 * than an upload API would be.
 *
 * The clone is shallow (`--depth 1`), stored under the CLI cache, and refreshed on a TTL.
 * Once it is on disk the behaviour is exactly {@link LocalRegistry}'s, which is why this class
 * only has to deal with fetching.
 */
export class GitRegistry extends LocalRegistry {
  override readonly kind: RegistryKind = 'git';

  private readonly url: string;
  private readonly ref: string | undefined;
  private readonly cloneDir: string;
  private readonly commands: CommandRunner;
  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly ttlSeconds: number;
  private refreshed = false;

  constructor(options: GitRegistryOptions) {
    const { url, ref } = splitRef(options.url, options.ref);
    const cloneDir = options.fs.join(options.cacheDir, 'git', cacheKey(url, ref));

    super({
      name: options.name,
      root: cloneDir,
      fs: options.fs,
      hasher: options.hasher,
      trusted: options.trusted ?? true,
      kind: 'git',
    });

    this.url = url;
    this.ref = ref;
    this.cloneDir = cloneDir;
    this.commands = options.commands;
    this.clock = options.clock;
    this.logger = options.logger;
    this.ttlSeconds = options.ttlSeconds ?? 3600;
  }

  override async refresh(): Promise<void> {
    this.refreshed = false;
    await this.sync(true);
    await super.refresh();
  }

  protected override async ensureAvailable(): Promise<string> {
    await this.sync(false);
    return this.cloneDir;
  }

  protected override resolvedLocation(directory: string): string {
    const relative = this.fs.relative(this.cloneDir, directory).replace(/\\/g, '/');
    return `${this.url}${this.ref === undefined ? '' : `#${this.ref}`}:${relative}`;
  }

  private async sync(force: boolean): Promise<void> {
    if (this.refreshed && !force) return;

    const cloned = await this.fs.exists(this.fs.join(this.cloneDir, '.git'));

    if (cloned && !force && !(await this.isStale())) {
      this.refreshed = true;
      return;
    }

    await this.assertGitAvailable();

    if (!cloned) {
      // A stale partial clone from an interrupted run would make `git fetch` fail confusingly.
      await this.fs.remove(this.cloneDir).catch(() => undefined);
      await this.fs.mkdirp(this.fs.dirname(this.cloneDir));
      this.logger.debug(`Cloning registry "${this.name}" from ${this.url}`);
      await this.git(
        [
          'clone',
          '--depth',
          '1',
          ...(this.ref === undefined ? [] : ['--branch', this.ref]),
          '--',
          this.url,
          this.cloneDir,
        ],
        this.fs.dirname(this.cloneDir),
      );
    } else {
      this.logger.debug(`Refreshing registry "${this.name}"`);
      await this.git(
        ['fetch', '--depth', '1', 'origin', ...(this.ref === undefined ? [] : [this.ref])],
        this.cloneDir,
      );
      await this.git(
        ['reset', '--hard', this.ref === undefined ? 'FETCH_HEAD' : `origin/${this.ref}`],
        this.cloneDir,
      );
    }

    await this.fs.writeFile(
      this.fs.join(this.cloneDir, CACHE_MARKER),
      this.clock.now().toISOString(),
    );
    this.refreshed = true;
  }

  private async isStale(): Promise<boolean> {
    const marker = this.fs.join(this.cloneDir, CACHE_MARKER);
    if (!(await this.fs.exists(marker))) return true;
    try {
      const fetchedAt = Date.parse(await this.fs.readTextFile(marker));
      if (Number.isNaN(fetchedAt)) return true;
      return this.clock.now().getTime() - fetchedAt > this.ttlSeconds * 1000;
    } catch {
      return true;
    }
  }

  private async assertGitAvailable(): Promise<void> {
    if ((await this.commands.which('git')) !== undefined) return;
    throw new AgentSkillsError(
      ErrorCode.REGISTRY_UNAVAILABLE,
      `Registry "${this.name}" needs git`,
      {
        details: [`git was not found on PATH, and "${this.name}" is a git registry.`],
        hints: [
          'Install git: https://git-scm.com/downloads',
          'Or configure an http registry instead: agent-skills registry add <name> <https url>',
        ],
        data: { registry: this.name, url: this.url },
      },
    );
  }

  private async git(args: readonly string[], cwd: string): Promise<void> {
    const result = await this.commands.run('git', args, { cwd, timeoutMs: 120_000 });
    if (result.code === 0) return;

    throw new AgentSkillsError(
      ErrorCode.REGISTRY_UNAVAILABLE,
      `Could not reach registry "${this.name}"`,
      {
        details: [`git ${args.join(' ')}`, '', result.stderr.trim() || result.stdout.trim()],
        hints: [
          'Check the URL and your network access',
          'For a private repository, make sure your git credentials are configured',
        ],
        data: { registry: this.name, url: this.url, exitCode: result.code },
      },
    );
  }
}

/** `https://host/repo.git#main` → `{ url, ref }`. An explicit `ref` option wins. */
export function splitRef(url: string, ref?: string): { url: string; ref: string | undefined } {
  const hash = url.lastIndexOf('#');
  if (hash === -1) return { url, ref };
  const fromUrl = url.slice(hash + 1);
  return { url: url.slice(0, hash), ref: ref ?? (fromUrl === '' ? undefined : fromUrl) };
}

/**
 * Cache directory name for a clone. Readable prefix plus a hash, so a user can tell which
 * cache belongs to which registry without the path depending on unsanitised URL characters.
 */
export function cacheKey(url: string, ref: string | undefined): string {
  const slug = url
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

  let hash = 5381;
  for (const character of `${url}#${ref ?? ''}`) {
    hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
  }

  return `${slug}-${hash.toString(36)}`;
}
