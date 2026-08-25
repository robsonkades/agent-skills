import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  AgentSkillsError,
  ErrorCode,
  type DirEntry,
  type FileStat,
  type FileSystem,
} from '@jvm-expert/core';

/**
 * The real filesystem.
 *
 * Every `node:fs` call in the entire project lives in this class. Errors are translated into
 * {@link AgentSkillsError} here so no higher layer ever has to interpret an `EACCES`.
 */
export class NodeFileSystem implements FileSystem {
  readonly separator = path.sep;

  async readFile(target: string): Promise<Uint8Array> {
    return this.guard(target, 'read', async () => new Uint8Array(await fs.readFile(target)));
  }

  async readTextFile(target: string): Promise<string> {
    return this.guard(target, 'read', () => fs.readFile(target, 'utf8'));
  }

  async writeFile(target: string, data: Uint8Array | string): Promise<void> {
    return this.guard(target, 'write', async () => {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data);
    });
  }

  async exists(target: string): Promise<boolean> {
    try {
      await fs.access(target, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async lstat(target: string): Promise<FileStat> {
    return this.guard(target, 'stat', async () => toStat(await fs.lstat(target)));
  }

  async stat(target: string): Promise<FileStat> {
    return this.guard(target, 'stat', async () => toStat(await fs.stat(target)));
  }

  async readDir(target: string): Promise<readonly DirEntry[]> {
    return this.guard(target, 'read', async () => {
      const entries = await fs.readdir(target, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
        isSymbolicLink: entry.isSymbolicLink(),
      }));
    });
  }

  async mkdirp(target: string): Promise<void> {
    return this.guard(target, 'create', async () => {
      await fs.mkdir(target, { recursive: true });
    });
  }

  async remove(target: string): Promise<void> {
    return this.guard(target, 'remove', async () => {
      await fs.rm(target, { recursive: true, force: true });
    });
  }

  async rename(from: string, to: string): Promise<void> {
    return this.guard(to, 'rename', async () => {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.rename(from, to);
    });
  }

  async copyFile(from: string, to: string): Promise<void> {
    return this.guard(to, 'copy', async () => {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
    });
  }

  async realpath(target: string): Promise<string> {
    return this.guard(target, 'resolve', () => fs.realpath(target));
  }

  async readlink(target: string): Promise<string> {
    return this.guard(target, 'read', () => fs.readlink(target));
  }

  async makeTempDir(parent: string, prefix: string): Promise<string> {
    return this.guard(parent, 'create', async () => {
      await fs.mkdir(parent, { recursive: true });
      return fs.mkdtemp(path.join(parent, prefix));
    });
  }

  /**
   * Probes writability without writing.
   *
   * `fs.access(W_OK)` is unreliable on Windows for directories, so a failed probe there falls
   * back to a create-and-delete on a uniquely named entry rather than reporting a false
   * negative that would block a perfectly good install.
   */
  async isWritable(target: string): Promise<boolean> {
    try {
      await fs.access(target, constants.W_OK);
      return true;
    } catch {
      if (process.platform !== 'win32') return false;
    }
    const probe = path.join(target, `.agent-skills-write-probe-${process.pid}-${Date.now()}`);
    try {
      await fs.writeFile(probe, '');
      await fs.rm(probe, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  join(...parts: readonly string[]): string {
    return path.join(...parts);
  }

  resolve(...parts: readonly string[]): string {
    return path.resolve(...parts);
  }

  dirname(target: string): string {
    return path.dirname(target);
  }

  basename(target: string): string {
    return path.basename(target);
  }

  relative(from: string, to: string): string {
    return path.relative(from, to);
  }

  isAbsolute(target: string): boolean {
    return path.isAbsolute(target);
  }

  private async guard<T>(target: string, action: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (cause) {
      throw translate(cause, target, action);
    }
  }
}

function toStat(stats: Stats): FileStat {
  return {
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    isSymbolicLink: stats.isSymbolicLink(),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    mode: stats.mode,
  };
}

function translate(cause: unknown, target: string, action: string): AgentSkillsError {
  const code = (cause as NodeJS.ErrnoException | undefined)?.code;

  if (code === 'EACCES' || code === 'EPERM') {
    return new AgentSkillsError(
      ErrorCode.PERMISSION_DENIED,
      `Permission denied: cannot ${action} ${target}`,
      {
        hints: [
          'Check the directory permissions',
          process.platform === 'win32'
            ? 'On Windows, a file open in another program can also cause this'
            : 'Avoid sudo; install into a directory you own, or use --project',
        ],
        cause,
        data: { path: target, action, errno: code },
      },
    );
  }

  if (code === 'ENOENT') {
    return new AgentSkillsError(ErrorCode.IO_ERROR, `No such file or directory: ${target}`, {
      cause,
      data: { path: target, action, errno: code },
    });
  }

  if (code === 'ENOSPC') {
    return new AgentSkillsError(
      ErrorCode.IO_ERROR,
      `No space left on device while trying to ${action} ${target}`,
      {
        cause,
        data: { path: target, action, errno: code },
      },
    );
  }

  if (code === 'EXDEV') {
    // The installer stages beside the target precisely to avoid this; seeing it means an
    // assumption broke, so say so rather than silently degrading to a copy.
    return new AgentSkillsError(
      ErrorCode.INSTALL_FAILED,
      `Cannot ${action} ${target}: source and destination are on different filesystems`,
      {
        hints: ['Report this: staging is meant to happen on the destination filesystem'],
        cause,
        data: { path: target, action, errno: code },
      },
    );
  }

  return new AgentSkillsError(ErrorCode.IO_ERROR, `Failed to ${action} ${target}`, {
    details: [cause instanceof Error ? cause.message : String(cause)],
    cause,
    data: { path: target, action, ...(code === undefined ? {} : { errno: code }) },
  });
}
