import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';
import {
  DEFAULT_PACKAGE_KIND,
  MANIFEST_FILENAME,
  SKILL_ENTRYPOINT,
  entrypointFor,
  parseManifest,
  type PackageKind,
  type SkillManifest,
} from '../domain/manifest.ts';
import {
  buildSkillPackage,
  encodeText,
  type PackageFile,
  type SkillPackage,
} from '../domain/skill-package.ts';
import { normalize, toPosix } from '../domain/posix-path.ts';
import {
  documentDescription,
  documentName,
  parseSkillDocument,
  stringifySkillDocument,
} from '../domain/skill-document.ts';
import { parseVersion } from '../domain/version.ts';
import type { FileSystem } from '../ports/infrastructure.ts';
import type { ValidationIssue } from '../domain/validation.ts';

export interface LoadPackageOptions {
  /** Unknown manifest fields become errors. Used by `publish` and `validate --strict`. */
  readonly strict?: boolean;
  /** Hard cap on total package size, guarding against a hostile local tree. */
  readonly maxTotalBytes?: number;
  readonly maxFiles?: number;
}

export interface LoadedPackage {
  readonly pkg: SkillPackage;
  readonly directory: string;
  readonly issues: readonly ValidationIssue[];
}

export const DEFAULT_MAX_TOTAL_BYTES = 32 * 1024 * 1024;
export const DEFAULT_MAX_FILES = 2000;

/** Directories never shipped in a package, regardless of what `files` says. */
const ALWAYS_EXCLUDED = new Set(['.git', 'node_modules', '.agent-skills', '.DS_Store']);

/**
 * Reads a skill package from a directory on disk.
 *
 * Shared by `validate`, `publish`, `create --check` and the local/git registries, so the
 * definition of "what is in a package" exists once.
 */
export async function loadPackageFromDirectory(
  fs: FileSystem,
  directory: string,
  options: LoadPackageOptions = {},
): Promise<LoadedPackage> {
  const root = fs.resolve(directory);

  if (!(await fs.exists(root))) {
    throw new AgentSkillsError(ErrorCode.INVALID_PACKAGE, `No such directory: ${directory}`, {
      hints: ['Pass the path to a skill package directory (the one containing SKILL.md)'],
      data: { directory },
    });
  }

  const manifestPath = fs.join(root, MANIFEST_FILENAME);
  if (!(await fs.exists(manifestPath))) {
    throw new AgentSkillsError(
      ErrorCode.INVALID_PACKAGE,
      `${directory} is not a skill package: no ${MANIFEST_FILENAME}`,
      {
        hints: [
          `A package has ${MANIFEST_FILENAME} and its entrypoint (${SKILL_ENTRYPOINT} or ${entrypointFor('command')}) at its root`,
          'agent-skills create <name>   to scaffold one',
        ],
        data: { directory },
      },
    );
  }

  const parsed = parseManifest(await fs.readTextFile(manifestPath), {
    source: manifestPath,
    ...(options.strict === undefined ? {} : { strict: options.strict }),
  });

  const files = await collectFiles(fs, root, parsed.manifest, options);
  return { pkg: buildSkillPackage(parsed.manifest, files), directory: root, issues: parsed.issues };
}

async function collectFiles(
  fs: FileSystem,
  root: string,
  manifest: SkillManifest,
  options: LoadPackageOptions,
): Promise<readonly PackageFile[]> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;

  const collected = new Map<string, PackageFile>();
  let totalBytes = 0;

  const addFile = async (absolute: string, relative: string): Promise<void> => {
    if (collected.has(relative)) return;

    const stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink) {
      // Rejected rather than followed: a symlink in a package is either an escape attempt or
      // a portability bug, and neither should silently become a real file at install time.
      throw new AgentSkillsError(
        ErrorCode.UNSAFE_PATH,
        `Symbolic links are not allowed in skill packages: ${relative}`,
        {
          details: [`-> ${await fs.readlink(absolute).catch(() => '(unreadable)')}`],
          hints: ['Replace the link with a real file'],
          data: { path: relative },
        },
      );
    }
    if (!stat.isFile) return;

    totalBytes += stat.size;
    if (collected.size >= maxFiles) {
      throw new AgentSkillsError(
        ErrorCode.INVALID_PACKAGE,
        `Package has more than ${maxFiles} files`,
        { hints: ['Trim the "files" list in skill.yaml'], data: { maxFiles } },
      );
    }
    if (totalBytes > maxBytes) {
      throw new AgentSkillsError(
        ErrorCode.INVALID_PACKAGE,
        `Package exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit`,
        { hints: ['Move large assets out of the package'], data: { maxBytes } },
      );
    }

    collected.set(relative, {
      path: relative,
      bytes: await fs.readFile(absolute),
      sourcePath: absolute,
    });
  };

  const addTree = async (absolute: string, relative: string): Promise<void> => {
    const stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink) {
      throw new AgentSkillsError(
        ErrorCode.UNSAFE_PATH,
        `Symbolic links are not allowed in skill packages: ${relative}`,
        { data: { path: relative } },
      );
    }
    if (stat.isFile) {
      await addFile(absolute, relative);
      return;
    }
    if (!stat.isDirectory) return;

    for (const entry of await fs.readDir(absolute)) {
      if (ALWAYS_EXCLUDED.has(entry.name)) continue;
      await addTree(fs.join(absolute, entry.name), normalize(`${relative}/${entry.name}`));
    }
  };

  for (const declared of manifest.files) {
    const relative = normalize(declared.replace(/\/+$/, ''));
    if (relative === '.' || relative === '') continue;
    const absolute = fs.join(root, ...relative.split('/'));
    if (!(await fs.exists(absolute))) {
      // Missing declared paths are a validation finding, not a load failure, so `validate`
      // can list every problem at once.
      continue;
    }
    await addTree(absolute, relative);
  }

  // The manifest always ships, even if the author forgot to list it.
  const manifestRelative = MANIFEST_FILENAME;
  if (!collected.has(manifestRelative)) {
    await addFile(fs.join(root, manifestRelative), manifestRelative);
  }

  return [...collected.values()];
}

/**
 * Builds the initial package contents for `agent-skills create`.
 * Kept here so the scaffold and the validator cannot drift apart.
 */
export function scaffoldPackage(
  name: string,
  options: {
    readonly kind?: PackageKind;
    readonly description?: string;
    readonly license?: string;
    readonly author?: string;
  } = {},
): readonly PackageFile[] {
  const kind = options.kind ?? DEFAULT_PACKAGE_KIND;
  const license = options.license ?? 'Apache-2.0';
  const title = name
    .split('-')
    .map((part) => (part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join(' ');

  if (kind === 'command') {
    return scaffoldCommand(name, title, license, options);
  }
  if (kind === 'workflow') {
    return scaffoldWorkflow(name, title, license, options);
  }

  const description =
    options.description ??
    `What ${name} covers, and when an agent should use it. Replace this with a description that names the situations this skill applies to.`;

  const manifest = [
    'schemaVersion: 1',
    '',
    `name: ${name}`,
    'version: 0.1.0',
    `description: ${JSON.stringify(description)}`,
    `license: ${license}`,
    ...(options.author === undefined ? [] : ['', 'authors:', `  - name: ${options.author}`]),
    '',
    'keywords: []',
    '',
    '# Omit `compatibility` to declare the skill works with every agent.',
    '# compatibility:',
    '#   agents:',
    '#     - id: claude-code',
    '#     - id: codex',
    '',
    'files:',
    '  - SKILL.md',
    '  - skill.yaml',
    '  - references/',
    '',
    'dependencies: []',
    '',
  ].join('\n');

  const skillDoc = stringifySkillDocument({
    frontmatter: { name, description },
    body: [
      `# ${title}`,
      '',
      '## Purpose',
      '',
      'One paragraph on what this skill makes the agent better at, and what it deliberately',
      'does not cover.',
      '',
      '## Workflow',
      '',
      '1. First step the agent should take.',
      '2. Second step.',
      '3. How to know the work is done.',
      '',
      '## Rules',
      '',
      '- A concrete rule that changes what the agent does.',
      '- Another rule. Prefer specifics over generic advice.',
      '',
      '## References',
      '',
      '- [Detailed notes](references/notes.md) — read when the task needs the full detail.',
      '',
    ].join('\n'),
  });

  const notes = [
    `# ${title} — reference notes`,
    '',
    'Put material here that is only needed for some tasks. `SKILL.md` stays short; this file',
    'is read on demand.',
    '',
  ].join('\n');

  return [
    { path: SKILL_ENTRYPOINT, bytes: encodeText(skillDoc) },
    { path: MANIFEST_FILENAME, bytes: encodeText(manifest) },
    { path: 'references/notes.md', bytes: encodeText(notes) },
  ];
}

/**
 * A command is one file, so its scaffold is one file plus the manifest: no `references/`,
 * because nothing but the entrypoint would be installed (DESIGN.md §3.6).
 */
function scaffoldCommand(
  name: string,
  title: string,
  license: string,
  options: { readonly description?: string; readonly author?: string },
): readonly PackageFile[] {
  const entrypoint = entrypointFor('command');
  const description =
    options.description ??
    `What /${name} does. One line: this is what the user sees in the command list.`;

  const manifest = [
    'schemaVersion: 1',
    '',
    `name: ${name}`,
    'kind: command',
    'version: 0.1.0',
    `description: ${JSON.stringify(description)}`,
    `license: ${license}`,
    ...(options.author === undefined ? [] : ['', 'authors:', `  - name: ${options.author}`]),
    '',
    'keywords: []',
    '',
    '# Codex has no user-invoked commands; declaring compatibility keeps installs honest.',
    'compatibility:',
    '  agents:',
    '    - id: claude-code',
    '',
    'files:',
    `  - ${entrypoint}`,
    '  - skill.yaml',
    '',
    'dependencies: []',
    '',
  ].join('\n');

  const commandDoc = stringifySkillDocument({
    frontmatter: { name, description, 'argument-hint': '[what the command takes]' },
    body: [
      `# ${title}`,
      '',
      'The body is the prompt the agent runs when the user types the command.',
      'Write it as instructions to the agent, not as documentation for a reader.',
      '',
      '## Task',
      '',
      'What to do with $ARGUMENTS.',
      '',
      '## Steps',
      '',
      '1. First step.',
      '2. Second step.',
      '3. How to know the work is done.',
      '',
    ].join('\n'),
  });

  return [
    { path: entrypoint, bytes: encodeText(commandDoc) },
    { path: MANIFEST_FILENAME, bytes: encodeText(manifest) },
  ];
}

/**
 * A workflow is a script Claude Code compiles, so the scaffold is a runnable skeleton
 * rather than prose: `meta` first (it must be the first statement), then phases that match
 * the titles declared in it.
 */
function scaffoldWorkflow(
  name: string,
  title: string,
  license: string,
  options: { readonly description?: string; readonly author?: string },
): readonly PackageFile[] {
  const entrypoint = entrypointFor('workflow');
  const description =
    options.description ?? `What ${name} orchestrates, in one line. Shown by search and info.`;

  const manifest = [
    'schemaVersion: 1',
    '',
    `name: ${name}`,
    'kind: workflow',
    'version: 0.1.0',
    `description: ${JSON.stringify(description)}`,
    `license: ${license}`,
    ...(options.author === undefined ? [] : ['', 'authors:', `  - name: ${options.author}`]),
    '',
    'keywords: []',
    '',
    '# Only Claude Code runs workflows; declaring it keeps installs honest.',
    'compatibility:',
    '  agents:',
    '    - id: claude-code',
    '',
    'files:',
    `  - ${entrypoint}`,
    '  - skill.yaml',
    '',
    'dependencies: []',
    '',
  ].join('\n');

  const script = [
    'export const meta = {',
    `  name: ${JSON.stringify(name)},`,
    `  description: ${JSON.stringify(description)},`,
    '  phases: [',
    `    { title: "Investigate", detail: ${JSON.stringify(`What ${title} gathers first.`)} },`,
    '    { title: "Report" },',
    '  ],',
    '};',
    '',
    '// Phase titles are matched against meta.phases exactly.',
    'phase("Investigate");',
    'await agent({',
    `  description: ${JSON.stringify(`${title}: investigate`)},`,
    '  prompt: "What the sub-agent should do. $ARGUMENTS is available here.",',
    '});',
    '',
    'phase("Report");',
    'log("What the run produced.");',
    '',
  ].join('\n');

  return [
    { path: entrypoint, bytes: encodeText(script) },
    { path: MANIFEST_FILENAME, bytes: encodeText(manifest) },
  ];
}
/** Reads name/description/version out of a `SKILL.md` on disk without loading the package. */
export async function peekSkillDocument(
  fs: FileSystem,
  skillMdPath: string,
): Promise<{ name?: string; description?: string; version?: string }> {
  const doc = parseSkillDocument(await fs.readTextFile(skillMdPath), toPosix(skillMdPath));
  const rawVersion = doc.frontmatter['version'];
  return {
    ...(documentName(doc) === undefined ? {} : { name: documentName(doc) }),
    ...(documentDescription(doc) === undefined ? {} : { description: documentDescription(doc) }),
    ...(typeof rawVersion === 'string' ? { version: parseVersion(rawVersion, skillMdPath) } : {}),
  };
}
