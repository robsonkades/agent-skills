import type { PackageKind } from './manifest.ts';
import type { SkillPackage } from './skill-package.ts';

/** Stable adapter identifier, e.g. `claude-code`, `codex`. Appears in receipts and lockfiles. */
export type AgentId = string;

/** `global` targets the user's home configuration; `project` targets a repository. */
export type InstallScope = 'global' | 'project';

export const INSTALL_SCOPES: readonly InstallScope[] = ['global', 'project'];

/** Everything an adapter may consult when computing a skill root. */
export interface LocationContext {
  readonly homeDir: string;
  readonly projectRoot?: string;
  /** Raw environment, so an adapter can honour `$CODEX_HOME` or `$CLAUDE_CONFIG_DIR`. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** User override from config, e.g. `agents["codex"].globalRoot`. Wins over defaults. */
  readonly overrideRoot?: string;
}

/**
 * How one installed package appears inside an agent's root: a directory holding the
 * package's files, or a single file named after the package. Claude Code skills are
 * directories; its commands are `<name>.md` files.
 */
export type EntryShape = 'directory' | 'file';

/** Where and how one agent stores packages of one kind. */
export interface AgentLocation {
  /** Absolute path of the directory holding every package of this kind. */
  readonly root: string;
  readonly shape: EntryShape;
  /** Suffix appended to the package name for `file` shape, e.g. `.md`. Empty otherwise. */
  readonly extension: string;
}

export type DetectionStrength = 'strong' | 'weak' | 'none';

export interface DetectionEvidence {
  readonly strength: DetectionStrength;
  /** Short machine-ish label, e.g. `config-dir`, `executable`, `project-dir`. */
  readonly kind: string;
  /** Human-readable location or explanation. */
  readonly detail: string;
}

export interface AgentDetection {
  readonly agentId: AgentId;
  /** True when at least one piece of strong evidence was found. */
  readonly installed: boolean;
  readonly strength: DetectionStrength;
  readonly evidence: readonly DetectionEvidence[];
  /** Populated only when the agent reliably exposes a version. */
  readonly version?: string;
}

export function detectionFrom(
  agentId: AgentId,
  evidence: readonly DetectionEvidence[],
  version?: string,
): AgentDetection {
  const strength: DetectionStrength = evidence.some((item) => item.strength === 'strong')
    ? 'strong'
    : evidence.some((item) => item.strength === 'weak')
      ? 'weak'
      : 'none';
  return {
    agentId,
    installed: strength === 'strong',
    strength,
    evidence,
    ...(version === undefined ? {} : { version }),
  };
}

/**
 * One file the adapter wants written into the installed skill directory.
 * Either inline `content` (adapter-synthesised, e.g. Codex's `agents/openai.yaml`)
 * or `copyFrom` (a path in the neutral package, copied verbatim).
 */
export type LayoutEntry =
  | { readonly path: string; readonly content: Uint8Array; readonly copyFrom?: undefined }
  | { readonly path: string; readonly copyFrom: string; readonly content?: undefined };

/**
 * The projection of a neutral package onto one agent. Pure data: producing it must not
 * touch the filesystem, which is what makes every adapter snapshot-testable
 * (ARCHITECTURE.md §4.1).
 */
export interface AgentLayout {
  /**
   * Files to write. Paths are relative to the installed package directory; for a `file`
   * shaped target there must be exactly one entry, and its path is unused because the
   * installer names the file after the package.
   */
  readonly entries: readonly LayoutEntry[];
  /** Frontmatter the adapter wants in the installed entrypoint document. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

/** Convenience view used by `list`, `doctor` and the installer. */
export interface AgentTarget extends AgentLocation {
  readonly agentId: AgentId;
  readonly displayName: string;
  readonly scope: InstallScope;
  readonly kind: PackageKind;
}

/** Path of one installed package inside its root, for both entry shapes. */
export function entryNameFor(target: AgentLocation, name: string): string {
  return `${name}${target.extension}`;
}

export interface AgentLayoutInput {
  readonly pkg: SkillPackage;
}
