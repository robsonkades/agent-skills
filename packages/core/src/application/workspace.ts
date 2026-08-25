import {
  LOCKFILE_NAME,
  emptyLockfile,
  parseLockfile,
  stringifyLockfile,
  type Lockfile,
} from '../domain/lockfile.ts';
import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';
import type { SemanticVersion } from '../domain/version.ts';
import type { FileSystem } from '../ports/infrastructure.ts';

/**
 * Markers that make a directory "a project". `.git` is the usual answer; the others let the
 * tool work in a checkout that is not a git repository, or in a subdirectory of one that has
 * its own agent configuration.
 */
const PROJECT_MARKERS: readonly string[] = [LOCKFILE_NAME, '.git', '.claude', '.agents', '.codex'];

/**
 * Walks up from `start` looking for a project marker.
 *
 * Returns `undefined` rather than defaulting to the cwd: silently treating an arbitrary
 * directory as a project is how tools end up scattering `.claude/` folders around a filesystem.
 *
 * The home directory is never a project, and the walk stops there. `~/.claude` and `~/.codex`
 * are an agent's *global* configuration; treating them as project markers would make every
 * command run from anywhere under `$HOME` — a scratch directory, a temp folder — resolve
 * "project scope" to the user's home and install into their global configuration by accident.
 */
export async function findProjectRoot(
  fs: FileSystem,
  start: string,
  homeDir?: string,
): Promise<string | undefined> {
  const home = homeDir === undefined ? undefined : fs.resolve(homeDir);
  let current = fs.resolve(start);

  for (;;) {
    if (current === home) return undefined;
    for (const marker of PROJECT_MARKERS) {
      if (await fs.exists(fs.join(current, marker))) return current;
    }
    const parent = fs.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export async function requireProjectRoot(
  fs: FileSystem,
  start: string,
  homeDir?: string,
): Promise<string> {
  const root = await findProjectRoot(fs, start, homeDir);
  if (root !== undefined) return root;
  throw new AgentSkillsError(ErrorCode.USAGE, 'Not inside a project', {
    details: [`Looked for ${PROJECT_MARKERS.join(', ')} in ${start} and every parent directory.`],
    hints: [
      'Run the command from inside a project,',
      'pass --project-root <path>,',
      'or use --global to install into your user configuration',
    ],
    data: { start },
  });
}

export function lockfilePath(fs: FileSystem, projectRoot: string): string {
  return fs.join(projectRoot, LOCKFILE_NAME);
}

export async function readLockfile(fs: FileSystem, projectRoot: string): Promise<Lockfile> {
  const path = lockfilePath(fs, projectRoot);
  if (!(await fs.exists(path))) return emptyLockfile();
  return parseLockfile(await fs.readTextFile(path), path);
}

export async function writeLockfile(
  fs: FileSystem,
  projectRoot: string,
  lock: Lockfile,
): Promise<void> {
  await fs.writeFile(lockfilePath(fs, projectRoot), stringifyLockfile(lock));
}

/** Version pins from the lockfile, in the shape the resolver expects. */
export function pinsFrom(lock: Lockfile): Record<string, SemanticVersion> {
  return Object.fromEntries(
    Object.entries(lock.skills).map(([name, entry]) => [name, entry.version]),
  );
}
