import { MANIFEST_FILENAME, entrypointFor } from '../domain/manifest.ts';
import { inspectPath } from '../domain/path-safety.ts';
import { normalize } from '../domain/posix-path.ts';
import { documentDescription, documentName, documentVersion } from '../domain/skill-document.ts';
import type { SkillPackage } from '../domain/skill-package.ts';
import {
  IssueCollector,
  buildReport,
  type ValidationIssue,
  type ValidationReport,
} from '../domain/validation.ts';
import { isSemanticVersion } from '../domain/version.ts';
import type { AgentAdapter } from '../ports/agent-adapter.ts';
import { loadPackageFromDirectory, type LoadPackageOptions } from './package-loader.ts';
import type { ApplicationContext } from './context.ts';

export interface ValidatePackageOptions extends LoadPackageOptions {
  /** Directory name to compare against the manifest name, when validating from disk. */
  readonly directoryName?: string;
  /** Adapters whose agent-specific rules should also run. */
  readonly adapters?: readonly AgentAdapter[];
}

/**
 * Validates an already-loaded package.
 *
 * Reports every problem it can find rather than throwing on the first: an author fixing a
 * package wants the whole list, and `install` wants to distinguish "unusable" from
 * "imperfect".
 */
export function validatePackage(
  pkg: SkillPackage,
  options: ValidatePackageOptions = {},
): ValidationReport {
  const issues = new IssueCollector();
  const { manifest, document } = pkg;
  const entrypoint = entrypointFor(manifest.kind);
  // A workflow declares its identity in `export const meta`, every other kind in YAML
  // frontmatter. Only the wording differs; the rules are the same.
  const holder = manifest.kind === 'workflow' ? 'meta' : 'frontmatter';

  // --- Identity agreement -------------------------------------------------------------
  const docName = documentName(document);
  if (docName === undefined) {
    issues.error(
      'skill.name.missing',
      entrypoint,
      `${capitalise(holder)} is missing "name"`,
      `Add name: "${manifest.name}" to the ${entrypoint} ${holder}`,
    );
  } else if (docName !== manifest.name) {
    issues.error(
      'skill.name.mismatch',
      entrypoint,
      `${capitalise(holder)} name "${docName}" does not match manifest name "${manifest.name}"`,
      'Both files and the directory name must agree',
    );
  }

  if (options.directoryName !== undefined && options.directoryName !== manifest.name) {
    issues.error(
      'package.directory.mismatch',
      options.directoryName,
      `Directory is named "${options.directoryName}" but the ${manifest.kind} is named "${manifest.name}"`,
      `Rename the directory to "${manifest.name}"`,
    );
  }

  const docVersion = documentVersion(document);
  if (docVersion !== undefined) {
    if (!isSemanticVersion(docVersion)) {
      issues.error(
        'skill.version.invalid',
        entrypoint,
        `${capitalise(holder)} version "${docVersion}" is not valid semver`,
      );
    } else if (docVersion !== manifest.version) {
      issues.error(
        'skill.version.mismatch',
        entrypoint,
        `${capitalise(holder)} version "${docVersion}" does not match manifest version "${manifest.version}"`,
        `Keep them in sync, or drop the version from the ${holder}`,
      );
    }
  }

  const docDescription = documentDescription(document);
  if (docDescription === undefined || docDescription === '') {
    issues.error(
      'skill.description.missing',
      entrypoint,
      `${capitalise(holder)} is missing "description"`,
      manifest.kind === 'workflow'
        ? 'It is what search and info show for the workflow; it is required'
        : 'Both Claude Code and Codex route on the description; it is required',
    );
  } else if (collapse(docDescription) !== collapse(manifest.description)) {
    // Adapters project the *manifest* description into the installed entrypoint, and the
    // registry index carries only the manifest description. A divergent frontmatter one is
    // therefore text no agent ever reads — including any trigger or boundary clause an
    // author added there, which is how routing degrades silently.
    //
    // A warning and not an error: the package installs and works, so refusing it would be
    // disproportionate. A registry that wants the stronger guarantee enforces it at index
    // build time, where it can see its own packages — this repository does exactly that.
    issues.warn(
      'skill.description.mismatch',
      entrypoint,
      `${capitalise(holder)} description does not match the manifest description`,
      `Only the manifest description ships; make them identical, or edit ${MANIFEST_FILENAME} instead`,
    );
  }

  // --- Body ---------------------------------------------------------------------------
  if (document.body.trim().length < 40) {
    issues.warn(
      'skill.body.thin',
      entrypoint,
      manifest.kind === 'workflow'
        ? 'The script body is nearly empty'
        : 'The Markdown body is nearly empty',
      manifest.kind === 'workflow'
        ? 'The body is the script the agent runs; meta alone does nothing'
        : 'The body is what the agent loads once the package is selected',
    );
  }

  // --- Declared files exist ------------------------------------------------------------
  const present = new Set(pkg.files.map((file) => file.path));
  for (const declared of manifest.files) {
    const relative = normalize(declared.replace(/\/+$/, ''));
    const isDirectory = declared.endsWith('/');
    const satisfied = isDirectory
      ? [...present].some((path) => path === relative || path.startsWith(`${relative}/`))
      : present.has(relative);
    if (!satisfied) {
      issues.warn(
        'package.files.missing',
        MANIFEST_FILENAME,
        `"${declared}" is declared in files but is not present`,
        'Remove it from files, or add the file',
      );
    }
  }

  if (!present.has(entrypoint)) {
    issues.error('package.entrypoint.missing', entrypoint, `Package has no ${entrypoint}`);
  }
  if (!present.has(MANIFEST_FILENAME)) {
    issues.error(
      'package.manifest.missing',
      MANIFEST_FILENAME,
      `Package has no ${MANIFEST_FILENAME}`,
    );
  }

  // --- Path safety for every shipped file ----------------------------------------------
  for (const file of pkg.files) {
    issues.absorb(pathSafetyIssues(file.path));
  }

  // --- agentOverrides are allowlisted by the adapter that consumes them ------------------
  const adapters = options.adapters ?? [];
  for (const [agentId, override] of Object.entries(manifest.agentOverrides)) {
    const adapter = adapters.find((candidate) => candidate.id === agentId);
    if (adapters.length > 0 && adapter === undefined) {
      issues.warn(
        'manifest.agentOverrides.unknownAgent',
        `agentOverrides.${agentId}`,
        `No adapter is registered for agent "${agentId}"`,
        'The override will be ignored',
      );
      continue;
    }
    if (adapter === undefined) continue;
    for (const key of Object.keys(override)) {
      if (adapter.overrideKeys.includes(key)) continue;
      issues.error(
        'manifest.agentOverrides.unknownKey',
        `agentOverrides.${agentId}.${key}`,
        `Agent "${agentId}" does not accept the override key "${key}"`,
        `Accepted keys: ${adapter.overrideKeys.join(', ') || '(none)'}`,
      );
    }
  }

  // --- Declared compatibility refers to agents we know ----------------------------------
  if (adapters.length > 0) {
    for (const compatibility of manifest.compatibility) {
      if (adapters.some((adapter) => adapter.id === compatibility.id)) continue;
      issues.warn(
        'manifest.compatibility.unknownAgent',
        `compatibility.agents.${compatibility.id}`,
        `Unknown agent id "${compatibility.id}"`,
        `Known: ${adapters.map((adapter) => adapter.id).join(', ')}`,
      );
    }
  }

  // --- Agent-specific rules -------------------------------------------------------------
  for (const adapter of adapters) {
    if (
      manifest.compatibility.length > 0 &&
      !manifest.compatibility.some((entry) => entry.id === adapter.id)
    ) {
      continue;
    }
    issues.absorb(adapter.validate(pkg));
  }

  return issues.report();
}

/**
 * Reports path-safety violations as validation issues.
 *
 * The rules themselves live in `domain/path-safety.ts`, shared with the installer's
 * extractor, so a package that `validate` accepts can never be one the extractor rejects.
 */
function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Normalises whitespace before comparing two descriptions. A folded YAML scalar (`>`) and a
 * quoted one carry the same text with different line breaks, and that difference is not a
 * mismatch anybody needs to hear about.
 */
function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function pathSafetyIssues(path: string): readonly ValidationIssue[] {
  const violation = inspectPath(path);
  if (violation === undefined) return [];

  return [
    {
      severity: 'error',
      rule: `path.${violation.rule}`,
      at: path,
      message: violation.message,
      hint: 'Rename the file so it is safe on every platform',
    },
  ];
}

export interface ValidateDirectoryResult extends ValidationReport {
  readonly pkg: SkillPackage;
  readonly directory: string;
}

/** Loads a package from disk and validates it. The `validate` command in one call. */
export async function validateDirectory(
  ctx: ApplicationContext,
  directory: string,
  options: ValidatePackageOptions = {},
): Promise<ValidateDirectoryResult> {
  const loaded = await loadPackageFromDirectory(ctx.fs, directory, options);
  const report = validatePackage(loaded.pkg, {
    ...options,
    directoryName: options.directoryName ?? ctx.fs.basename(loaded.directory),
    adapters: options.adapters ?? ctx.agents.all(),
  });

  const combined = buildReport([...loaded.issues, ...report.issues]);
  return { ...combined, pkg: loaded.pkg, directory: loaded.directory };
}
