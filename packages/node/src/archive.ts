import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import * as tar from 'tar';
import {
  AgentSkillsError,
  ErrorCode,
  type ArchiveEntry,
  type ArchiveReader,
} from '@jvm-expert/core';

/**
 * Reads `.tar.gz` payloads into memory.
 *
 * This class only *parses*; it deliberately makes no safety decisions. Entry paths, link
 * types and sizes are handed to the installer exactly as the archive recorded them, so every
 * rejection rule lives in one reviewed place (`SafeExtractor`) instead of being split across
 * a parser and a consumer.
 *
 * The one thing enforced here is resource exhaustion: decompression stops as soon as the
 * output exceeds the configured budget, which is what makes a gzip bomb a fast error rather
 * than an out-of-memory kill.
 */
export interface ArchiveLimits {
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxTotalBytes: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: 5_000,
  maxEntryBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
};

export class NodeArchiveReader implements ArchiveReader {
  private readonly limits: ArchiveLimits;

  constructor(limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS) {
    this.limits = limits;
  }

  async read(data: Uint8Array): Promise<readonly ArchiveEntry[]> {
    const entries: ArchiveEntry[] = [];
    let totalBytes = 0;

    const parser = new tar.Parser({
      // Never let the parser itself resolve or strip anything; we want the raw recorded path.
      strict: false,
    });

    const finished = new Promise<void>((resolve, reject) => {
      parser.on('entry', (entry) => {
        if (entries.length >= this.limits.maxEntries) {
          reject(
            new AgentSkillsError(
              ErrorCode.UNSAFE_ARCHIVE,
              `Archive contains more than ${this.limits.maxEntries} entries`,
              { data: { maxEntries: this.limits.maxEntries } },
            ),
          );
          entry.resume();
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;

        entry.on('data', (chunk: Buffer) => {
          size += chunk.length;
          totalBytes += chunk.length;
          if (size > this.limits.maxEntryBytes) {
            reject(
              new AgentSkillsError(
                ErrorCode.UNSAFE_ARCHIVE,
                `Archive entry "${entry.path}" exceeds ${this.limits.maxEntryBytes} bytes`,
                { data: { path: entry.path, maxEntryBytes: this.limits.maxEntryBytes } },
              ),
            );
            return;
          }
          if (totalBytes > this.limits.maxTotalBytes) {
            reject(
              new AgentSkillsError(
                ErrorCode.UNSAFE_ARCHIVE,
                `Archive expands to more than ${this.limits.maxTotalBytes} bytes`,
                {
                  details: ['This is the signature of a decompression bomb.'],
                  data: { maxTotalBytes: this.limits.maxTotalBytes },
                },
              ),
            );
            return;
          }
          chunks.push(chunk);
        });

        entry.on('end', () => {
          entries.push({
            path: String(entry.path),
            type: toEntryType(entry.type),
            size,
            mode: entry.mode ?? 0,
            ...(entry.linkpath == null ? {} : { linkTarget: String(entry.linkpath) }),
            bytes: new Uint8Array(Buffer.concat(chunks)),
          });
        });
      });

      parser.on('error', (cause: Error) =>
        reject(
          new AgentSkillsError(ErrorCode.UNSAFE_ARCHIVE, 'Could not read archive', {
            details: [cause.message],
            hints: ['The download may be truncated or is not a valid .tar.gz'],
            cause,
          }),
        ),
      );
      parser.on('end', () => resolve());
    });

    const gunzip = createGunzip();
    gunzip.on('error', () => {
      /* surfaced through the pipeline promise below */
    });

    await Promise.all([
      finished,
      new Promise<void>((resolve, reject) => {
        Readable.from([Buffer.from(data)])
          .pipe(gunzip)
          .on('error', (cause: Error) =>
            reject(
              new AgentSkillsError(ErrorCode.UNSAFE_ARCHIVE, 'Could not decompress archive', {
                details: [cause.message],
                cause,
              }),
            ),
          )
          .pipe(parser)
          .on('finish', () => resolve())
          .on('error', reject);
      }),
    ]);

    return entries;
  }
}

function toEntryType(type: string | undefined): ArchiveEntry['type'] {
  switch (type) {
    case 'File':
    case 'OldFile':
    case 'ContiguousFile':
      return 'file';
    case 'Directory':
      return 'directory';
    case 'SymbolicLink':
    case 'Link':
      return 'symlink';
    default:
      return 'other';
  }
}
