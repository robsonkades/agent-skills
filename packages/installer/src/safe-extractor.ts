import {
  AgentSkillsError,
  ErrorCode,
  MANIFEST_FILENAME,
  buildSkillPackage,
  decodeText,
  parseManifest,
  type ArchiveEntry,
  type ArchiveReader,
  type PackageFile,
  type SkillPackage,
} from '@jvm-expert/core';
import { safeRelativePath } from './safe-path.ts';

export interface ExtractionLimits {
  readonly maxFiles: number;
  readonly maxTotalBytes: number;
  /** Reject archives whose uncompressed size exceeds this multiple of the compressed size. */
  readonly maxCompressionRatio: number;
}

export const DEFAULT_EXTRACTION_LIMITS: ExtractionLimits = {
  maxFiles: 2_000,
  maxTotalBytes: 32 * 1024 * 1024,
  maxCompressionRatio: 200,
};

/**
 * Turns an untrusted `.tar.gz` into a validated {@link SkillPackage} in memory.
 *
 * Nothing here writes to disk. Extraction happens entirely in memory, and only a package that
 * survives every check is handed to the installer for staging — so a hostile archive never
 * gets the chance to create a file at all, rather than being cleaned up after the fact.
 *
 * Rejected outright:
 *   - symlinks and hardlinks (any entry type other than file or directory)
 *   - paths that are absolute, traversing, UNC, drive-lettered, or Windows-hostile
 *   - duplicate entries for the same path (last-write-wins is how a check gets bypassed)
 *   - archives over the size, count or compression-ratio limits
 */
export class SafeExtractor {
  private readonly archives: ArchiveReader;
  private readonly limits: ExtractionLimits;

  constructor(archives: ArchiveReader, limits: ExtractionLimits = DEFAULT_EXTRACTION_LIMITS) {
    this.archives = archives;
    this.limits = limits;
  }

  async extract(data: Uint8Array, source: string): Promise<SkillPackage> {
    const entries = await this.archives.read(data);
    return this.fromEntries(entries, source, data.byteLength);
  }

  fromEntries(
    entries: readonly ArchiveEntry[],
    source: string,
    compressedBytes: number,
  ): SkillPackage {
    const files = new Map<string, PackageFile>();
    let totalBytes = 0;
    const prefix = commonLeadingComponent(entries);

    for (const entry of entries) {
      if (entry.type === 'directory') continue;

      if (entry.type !== 'file') {
        throw new AgentSkillsError(
          ErrorCode.UNSAFE_ARCHIVE,
          `Refusing archive: "${entry.path}" is a ${entry.type}`,
          {
            details: [
              entry.linkTarget === undefined ? '' : `-> ${entry.linkTarget}`,
              'Skill packages may contain regular files only.',
            ].filter((line) => line !== ''),
            hints: ['Links can redirect writes outside the install directory'],
            data: { source, path: entry.path, type: entry.type },
          },
        );
      }

      // Archives produced by GitHub and by `npm pack` wrap the package in one directory.
      // Strip it only when *every* entry shares it, so a flat archive is left alone.
      const relative = safeRelativePath(stripPrefix(entry.path, prefix), source);

      if (files.has(relative)) {
        throw new AgentSkillsError(
          ErrorCode.UNSAFE_ARCHIVE,
          `Refusing archive: duplicate entry "${relative}"`,
          {
            details: ['A duplicated path lets a later entry overwrite an already-checked file.'],
            data: { source, path: relative },
          },
        );
      }

      totalBytes += entry.bytes.byteLength;
      if (files.size >= this.limits.maxFiles) {
        throw new AgentSkillsError(
          ErrorCode.UNSAFE_ARCHIVE,
          `Refusing archive: more than ${this.limits.maxFiles} files`,
          { data: { source, maxFiles: this.limits.maxFiles } },
        );
      }
      if (totalBytes > this.limits.maxTotalBytes) {
        throw new AgentSkillsError(
          ErrorCode.UNSAFE_ARCHIVE,
          `Refusing archive: expands to more than ${this.limits.maxTotalBytes} bytes`,
          { data: { source, maxTotalBytes: this.limits.maxTotalBytes } },
        );
      }

      files.set(relative, { path: relative, bytes: entry.bytes });
    }

    if (compressedBytes > 0 && totalBytes / compressedBytes > this.limits.maxCompressionRatio) {
      throw new AgentSkillsError(
        ErrorCode.UNSAFE_ARCHIVE,
        'Refusing archive: compression ratio looks like a decompression bomb',
        {
          details: [
            `compressed:   ${compressedBytes} bytes`,
            `uncompressed: ${totalBytes} bytes`,
            `ratio:        ${Math.round(totalBytes / compressedBytes)}:1 (limit ${this.limits.maxCompressionRatio}:1)`,
          ],
          data: { source, compressedBytes, totalBytes },
        },
      );
    }

    const manifestFile = files.get(MANIFEST_FILENAME);
    if (manifestFile === undefined) {
      throw new AgentSkillsError(
        ErrorCode.INVALID_PACKAGE,
        `Archive from ${source} contains no ${MANIFEST_FILENAME}`,
        { data: { source, entries: [...files.keys()] } },
      );
    }

    const { manifest } = parseManifest(decodeText(manifestFile.bytes), {
      source: `${source}/${MANIFEST_FILENAME}`,
    });

    return buildSkillPackage(manifest, [...files.values()]);
  }
}

function unify(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * The single directory every entry lives under, or undefined when there is not exactly one.
 *
 * A traversal component is never treated as a strippable prefix: `../evil` must reach the
 * safety check intact rather than being quietly turned into `evil`.
 */
function commonLeadingComponent(entries: readonly ArchiveEntry[]): string | undefined {
  const heads = new Set<string>();

  for (const entry of entries) {
    if (entry.type !== 'file') continue;
    const unified = unify(entry.path);
    const slash = unified.indexOf('/');
    if (slash <= 0) return undefined; // a root-level file means there is nothing to strip
    heads.add(unified.slice(0, slash));
    if (heads.size > 1) return undefined;
  }

  const [only] = [...heads];
  if (only === undefined || only === '.' || only === '..') return undefined;
  return only;
}

function stripPrefix(path: string, prefix: string | undefined): string {
  const unified = unify(path);
  if (prefix === undefined) return unified;
  return unified.startsWith(`${prefix}/`) ? unified.slice(prefix.length + 1) : unified;
}
