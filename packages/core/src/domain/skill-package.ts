import {
  MANIFEST_FILENAME,
  entrypointFor,
  type PackageKind,
  type SkillManifest,
} from './manifest.ts';
import { parseSkillDocument, type SkillDocument } from './skill-document.ts';
import { parseWorkflowDocument } from './workflow-document.ts';
import { AgentSkillsError, ErrorCode } from './errors.ts';
import { normalize } from './posix-path.ts';

/**
 * One file inside a package. Paths are always POSIX and relative to the package root;
 * content is bytes so that `assets/` can hold images without a lossy round-trip.
 */
export interface PackageFile {
  readonly path: string;
  readonly bytes: Uint8Array;
  /** Present for files that came from a real filesystem; used for streaming copies. */
  readonly sourcePath?: string;
}

/**
 * A validated, in-memory skill package: the neutral artefact that registries produce and
 * adapters project onto agent-specific layouts. Nothing here is agent-aware.
 */
export interface SkillPackage {
  readonly manifest: SkillManifest;
  readonly document: SkillDocument;
  readonly files: readonly PackageFile[];
}

/**
 * Reads a kind's entrypoint into the one neutral shape the rest of the system understands.
 *
 * Markdown kinds carry their identity in YAML frontmatter; a workflow carries it in
 * `export const meta`. Normalising here — rather than teaching every caller about both — is
 * what keeps validation, search and `info` identical across kinds.
 */
export function parseEntrypoint(kind: PackageKind, text: string, source: string): SkillDocument {
  return kind === 'workflow'
    ? parseWorkflowDocument(text, source)
    : parseSkillDocument(text, source);
}

const decoder = new TextDecoder('utf-8', { fatal: false });

export function decodeText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function findFile(pkg: SkillPackage, path: string): PackageFile | undefined {
  const target = normalize(path);
  return pkg.files.find((file) => file.path === target);
}

export function readTextFile(pkg: SkillPackage, path: string): string | undefined {
  const file = findFile(pkg, path);
  return file === undefined ? undefined : decodeText(file.bytes);
}

/**
 * Assembles a package from raw files, parsing the entrypoint. Structural validation beyond
 * "can this be loaded at all" belongs to `ValidatePackage`, which reports every problem
 * rather than failing on the first.
 */
export function buildSkillPackage(
  manifest: SkillManifest,
  files: readonly PackageFile[],
): SkillPackage {
  const normalizedFiles = files
    .map((file) => ({ ...file, path: normalize(file.path) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const entrypoint = entrypointFor(manifest.kind);
  const entry = normalizedFiles.find((file) => file.path === entrypoint);
  if (entry === undefined) {
    throw new AgentSkillsError(
      ErrorCode.INVALID_PACKAGE,
      `Package "${manifest.name}" is missing ${entrypoint}`,
      {
        hints: [`Every ${manifest.kind} package must contain a ${entrypoint} at its root`],
        data: { name: manifest.name, kind: manifest.kind },
      },
    );
  }

  return {
    manifest,
    document: parseEntrypoint(
      manifest.kind,
      decodeText(entry.bytes),
      `${manifest.name}/${entrypoint}`,
    ),
    files: normalizedFiles,
  };
}

/** Total uncompressed size, used for reporting and for archive-bomb limits. */
export function packageSize(pkg: SkillPackage): number {
  return pkg.files.reduce((total, file) => total + file.bytes.byteLength, 0);
}

export function isManifestFile(path: string): boolean {
  return normalize(path) === MANIFEST_FILENAME;
}
