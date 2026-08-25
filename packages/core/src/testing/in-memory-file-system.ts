import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';
import type { DirEntry, FileStat, FileSystem } from '../ports/infrastructure.ts';

interface Node {
  readonly kind: 'file' | 'dir' | 'link';
  bytes?: Uint8Array;
  target?: string;
  mtimeMs: number;
  mode: number;
}

export interface InMemoryFileSystemOptions {
  /** `/` by default; set to `\\` to reproduce Windows path handling in a test. */
  readonly separator?: string;
  /** Root the filesystem is anchored at, e.g. `/` or `C:\\`. */
  readonly root?: string;
  /** Paths under which writes fail with a permission error. */
  readonly readOnlyPaths?: readonly string[];
}

/**
 * A complete in-memory {@link FileSystem}.
 *
 * Exported from the package (rather than living in a test folder) so adapter authors outside
 * this repository can test their own adapters against the same double the built-in ones use.
 *
 * It models the things that actually cause cross-platform bugs: separator handling, symlinks,
 * and non-writable directories.
 */
export class InMemoryFileSystem implements FileSystem {
  readonly separator: string;

  private readonly nodes = new Map<string, Node>();
  private readonly root: string;
  private readonly readOnlyPaths: readonly string[];
  private tempCounter = 0;
  private clock = 1_000_000;

  constructor(options: InMemoryFileSystemOptions = {}) {
    this.separator = options.separator ?? '/';
    this.root = options.root ?? (this.separator === '\\' ? 'C:\\' : '/');
    this.readOnlyPaths = options.readOnlyPaths ?? [];
    this.nodes.set(this.key(this.root), { kind: 'dir', mtimeMs: this.clock, mode: 0o755 });
  }

  // --- Test helpers ---------------------------------------------------------------------

  /** Seeds files in one call: `{ '/a/b.txt': 'hello' }`. Parent directories are created. */
  seed(files: Readonly<Record<string, string | Uint8Array>>): this {
    for (const [path, content] of Object.entries(files)) {
      const absolute = this.resolve(path);
      this.mkdirpSync(this.dirname(absolute));
      this.nodes.set(this.key(absolute), {
        kind: 'file',
        bytes: typeof content === 'string' ? new TextEncoder().encode(content) : content,
        mtimeMs: (this.clock += 1),
        mode: 0o644,
      });
    }
    return this;
  }

  symlink(from: string, to: string): this {
    const absolute = this.resolve(from);
    this.mkdirpSync(this.dirname(absolute));
    this.nodes.set(this.key(absolute), {
      kind: 'link',
      target: this.resolve(to),
      mtimeMs: (this.clock += 1),
      mode: 0o777,
    });
    return this;
  }

  /** Every path currently present, sorted. Useful for asserting on a whole tree at once. */
  snapshot(): readonly string[] {
    return [...this.nodes.keys()].sort();
  }

  textAt(path: string): string | undefined {
    const node = this.nodes.get(this.key(this.resolve(path)));
    return node?.bytes === undefined ? undefined : new TextDecoder().decode(node.bytes);
  }

  // --- FileSystem -----------------------------------------------------------------------

  async readFile(path: string): Promise<Uint8Array> {
    const node = this.require(path);
    if (node.kind !== 'file' || node.bytes === undefined) {
      throw new AgentSkillsError(ErrorCode.IO_ERROR, `Not a file: ${path}`);
    }
    return node.bytes;
  }

  async readTextFile(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readFile(path));
  }

  async writeFile(path: string, data: Uint8Array | string): Promise<void> {
    const absolute = this.resolve(path);
    this.assertWritable(absolute);
    this.mkdirpSync(this.dirname(absolute));
    this.nodes.set(this.key(absolute), {
      kind: 'file',
      bytes: typeof data === 'string' ? new TextEncoder().encode(data) : data,
      mtimeMs: (this.clock += 1),
      mode: 0o644,
    });
  }

  async exists(path: string): Promise<boolean> {
    return this.nodes.has(this.key(this.resolve(path)));
  }

  async lstat(path: string): Promise<FileStat> {
    const node = this.require(path);
    return {
      isFile: node.kind === 'file',
      isDirectory: node.kind === 'dir',
      isSymbolicLink: node.kind === 'link',
      size: node.bytes?.byteLength ?? 0,
      mtimeMs: node.mtimeMs,
      mode: node.mode,
    };
  }

  async stat(path: string): Promise<FileStat> {
    return this.lstat(await this.realpath(path));
  }

  async readDir(path: string): Promise<readonly DirEntry[]> {
    const absolute = this.resolve(path);
    const prefix = this.key(absolute) + this.separator;
    const names = new Set<string>();

    for (const key of this.nodes.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const name = rest.split(this.separator)[0];
      if (name !== undefined && name !== '') names.add(name);
    }

    return [...names].sort().map((name) => {
      const node = this.nodes.get(this.key(this.join(absolute, name)))!;
      return {
        name,
        isFile: node?.kind === 'file',
        isDirectory: node?.kind === 'dir',
        isSymbolicLink: node?.kind === 'link',
      };
    });
  }

  async mkdirp(path: string): Promise<void> {
    const absolute = this.resolve(path);
    this.assertWritable(absolute);
    this.mkdirpSync(absolute);
  }

  async remove(path: string): Promise<void> {
    const absolute = this.resolve(path);
    this.assertWritable(absolute);
    const key = this.key(absolute);
    const prefix = key + this.separator;
    for (const candidate of [...this.nodes.keys()]) {
      if (candidate === key || candidate.startsWith(prefix)) this.nodes.delete(candidate);
    }
  }

  async rename(from: string, to: string): Promise<void> {
    const source = this.resolve(from);
    const destination = this.resolve(to);
    this.assertWritable(destination);

    if (!this.nodes.has(this.key(source))) {
      throw new AgentSkillsError(ErrorCode.IO_ERROR, `No such file or directory: ${from}`);
    }
    if (this.nodes.has(this.key(destination))) {
      throw new AgentSkillsError(ErrorCode.IO_ERROR, `Destination exists: ${to}`);
    }

    this.mkdirpSync(this.dirname(destination));
    const sourceKey = this.key(source);
    const prefix = sourceKey + this.separator;

    for (const [key, node] of [...this.nodes.entries()]) {
      if (key !== sourceKey && !key.startsWith(prefix)) continue;
      const suffix = key.slice(sourceKey.length);
      this.nodes.delete(key);
      this.nodes.set(this.key(destination) + suffix, node);
    }
  }

  async copyFile(from: string, to: string): Promise<void> {
    await this.writeFile(to, await this.readFile(from));
  }

  async realpath(path: string): Promise<string> {
    let current = this.resolve(path);
    for (let hops = 0; hops < 16; hops += 1) {
      const node = this.nodes.get(this.key(current));
      if (node?.kind !== 'link' || node.target === undefined) return current;
      current = this.resolve(node.target);
    }
    throw new AgentSkillsError(ErrorCode.IO_ERROR, `Too many symbolic links: ${path}`);
  }

  async readlink(path: string): Promise<string> {
    const node = this.require(path);
    if (node.kind !== 'link' || node.target === undefined) {
      throw new AgentSkillsError(ErrorCode.IO_ERROR, `Not a symlink: ${path}`);
    }
    return node.target;
  }

  async makeTempDir(parent: string, prefix: string): Promise<string> {
    this.tempCounter += 1;
    const path = this.join(this.resolve(parent), `${prefix}${this.tempCounter}`);
    await this.mkdirp(path);
    return path;
  }

  async isWritable(path: string): Promise<boolean> {
    return !this.readOnlyPaths.some((readOnly) =>
      this.resolve(path).startsWith(this.resolve(readOnly)),
    );
  }

  join(...parts: readonly string[]): string {
    const filtered = parts.filter((part) => part !== '');
    if (filtered.length === 0) return '.';
    const joined = filtered.join(this.separator);
    return this.normalize(joined);
  }

  resolve(...parts: readonly string[]): string {
    let current = this.root;
    for (const part of parts) {
      if (part === '') continue;
      current = this.isAbsolute(part) ? part : `${current}${this.separator}${part}`;
    }
    return this.normalize(current);
  }

  dirname(path: string): string {
    const normalized = this.normalize(path);
    const index = normalized.lastIndexOf(this.separator);
    if (index <= 0) return this.root;
    const parent = normalized.slice(0, index);
    return parent === '' || (this.separator === '\\' && /^[a-zA-Z]:$/.test(parent))
      ? this.root
      : parent;
  }

  basename(path: string): string {
    const normalized = this.normalize(path);
    const index = normalized.lastIndexOf(this.separator);
    return index === -1 ? normalized : normalized.slice(index + 1);
  }

  relative(from: string, to: string): string {
    const fromParts = this.parts(this.resolve(from));
    const toParts = this.parts(this.resolve(to));
    let shared = 0;
    while (
      shared < fromParts.length &&
      shared < toParts.length &&
      fromParts[shared] === toParts[shared]
    ) {
      shared += 1;
    }
    return [...Array(fromParts.length - shared).fill('..'), ...toParts.slice(shared)].join(
      this.separator,
    );
  }

  isAbsolute(path: string): boolean {
    return this.separator === '\\' ? /^[a-zA-Z]:[\\/]/.test(path) : path.startsWith('/');
  }

  // --- Internals ------------------------------------------------------------------------

  private normalize(path: string): string {
    const unified = path.replace(/[\\/]+/g, this.separator === '\\' ? '\\' : '/');
    const absolute = this.isAbsolute(unified);
    const prefix = absolute ? (this.separator === '\\' ? `${unified.slice(0, 2)}\\` : '/') : '';
    const body = absolute ? unified.slice(prefix.length) : unified;

    const segments: string[] = [];
    for (const segment of body.split(this.separator)) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') {
        if (segments.length > 0) segments.pop();
        else if (!absolute) segments.push('..');
        continue;
      }
      segments.push(segment);
    }

    const joined = segments.join(this.separator);
    if (absolute) return joined === '' ? prefix : prefix + joined;
    return joined === '' ? '.' : joined;
  }

  private parts(path: string): readonly string[] {
    return this.normalize(path)
      .split(this.separator)
      .filter((part) => part !== '' && !/^[a-zA-Z]:$/.test(part));
  }

  private key(path: string): string {
    return this.normalize(path);
  }

  private require(path: string): Node {
    const node = this.nodes.get(this.key(this.resolve(path)));
    if (node === undefined) {
      throw new AgentSkillsError(ErrorCode.IO_ERROR, `No such file or directory: ${path}`);
    }
    return node;
  }

  private assertWritable(path: string): void {
    for (const readOnly of this.readOnlyPaths) {
      if (this.normalize(path).startsWith(this.normalize(this.resolve(readOnly)))) {
        throw new AgentSkillsError(ErrorCode.PERMISSION_DENIED, `Permission denied: ${path}`);
      }
    }
  }

  private mkdirpSync(path: string): void {
    const absolute = this.normalize(path);
    const segments = this.parts(absolute);
    let current = this.isAbsolute(absolute)
      ? this.separator === '\\'
        ? `${absolute.slice(0, 2)}\\`
        : '/'
      : '';

    this.nodes.set(this.key(current === '' ? this.root : current), {
      kind: 'dir',
      mtimeMs: this.clock,
      mode: 0o755,
    });

    for (const segment of segments) {
      current = current === '' ? segment : this.join(current, segment);
      const key = this.key(current);
      if (!this.nodes.has(key)) {
        this.nodes.set(key, { kind: 'dir', mtimeMs: (this.clock += 1), mode: 0o755 });
      }
    }
  }
}
