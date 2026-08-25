/**
 * Infrastructure ports.
 *
 * Every interaction with the outside world goes through one of these. They are small on
 * purpose: a small port is easy to fake in a test and easy to reimplement for a new
 * runtime, and it keeps the domain honest about what it actually needs.
 */

export interface FileStat {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly isSymbolicLink: boolean;
  readonly size: number;
  readonly mtimeMs: number;
  /** POSIX mode bits. Zero on filesystems that do not report them. */
  readonly mode: number;
}

export interface DirEntry {
  readonly name: string;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly isSymbolicLink: boolean;
}

/**
 * The only port permitted to mutate the disk. Concentrating writes here is what lets the
 * security model make categorical claims (ARCHITECTURE.md §7).
 *
 * Paths are OS-native absolute paths. Package-relative POSIX paths never reach this port.
 */
export interface FileSystem {
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;

  exists(path: string): Promise<boolean>;
  /** Never follows the final symlink, so link-planting is detectable. */
  lstat(path: string): Promise<FileStat>;
  stat(path: string): Promise<FileStat>;
  readDir(path: string): Promise<readonly DirEntry[]>;

  mkdirp(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Atomic within a filesystem; the installer guarantees same-filesystem staging. */
  rename(from: string, to: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;

  /** Fully resolved real path, with symlinks followed. Used to prove containment. */
  realpath(path: string): Promise<string>;
  readlink(path: string): Promise<string>;

  /** Creates a uniquely-named directory under `parent`. */
  makeTempDir(parent: string, prefix: string): Promise<string>;

  /** Reports whether the process can write into `path` without actually writing. */
  isWritable(path: string): Promise<boolean>;

  // Path algebra. On the port rather than imported from `node:path` so the domain and the
  // in-memory test double agree on separator handling.
  join(...parts: readonly string[]): string;
  resolve(...parts: readonly string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  relative(from: string, to: string): string;
  isAbsolute(path: string): boolean;
  readonly separator: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

export interface HttpRequestOptions {
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  /** Hard cap on the response body; exceeding it aborts rather than buffering. */
  readonly maxBytes?: number;
}

export interface HttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** Used only for `git` in the git registry, and for agent version probes during detection. */
export interface CommandRunner {
  run(command: string, args: readonly string[], options?: CommandOptions): Promise<CommandResult>;
  /** Absolute path of an executable on PATH, or undefined. */
  which(command: string): Promise<string | undefined>;
}

export interface Hasher {
  /** Returns an SRI-style string, e.g. `sha256-<base64>`. */
  hash(data: Uint8Array): string;
  hashFile(path: string): Promise<string>;
}

export interface ArchiveEntry {
  /** Path as recorded in the archive, before any normalisation. Untrusted. */
  readonly path: string;
  readonly type: 'file' | 'directory' | 'symlink' | 'other';
  readonly size: number;
  readonly mode: number;
  readonly linkTarget?: string;
  readonly bytes: Uint8Array;
}

/** Reads `.tar.gz` payloads. Extraction *safety* is the installer's job, not this port's. */
export interface ArchiveReader {
  read(data: Uint8Array): Promise<readonly ArchiveEntry[]>;
}

export interface Environment {
  homeDir(): string;
  cwd(): string;
  tempDir(): string;
  platform(): 'win32' | 'darwin' | 'linux' | string;
  env(): Readonly<Record<string, string | undefined>>;
}

export interface Clock {
  now(): Date;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, ...args: readonly unknown[]): void;
  info(message: string, ...args: readonly unknown[]): void;
  warn(message: string, ...args: readonly unknown[]): void;
  error(message: string, ...args: readonly unknown[]): void;
}
