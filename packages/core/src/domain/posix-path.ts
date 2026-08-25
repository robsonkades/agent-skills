/**
 * A minimal POSIX-style path helper.
 *
 * The domain keeps its own copy rather than importing `node:path` so that `@jvm-expert/core`
 * stays runtime-free: package-relative paths are always POSIX regardless of the host OS, and
 * a domain that imported `node:path` would silently behave differently on Windows.
 *
 * Filesystem-absolute paths are the concern of the `FileSystem` port, not of this module.
 */

/** Normalise separators and collapse `.` / `..` segments without touching the filesystem. */
export function normalize(input: string): string {
  const isAbsolute = input.startsWith('/');
  const segments: string[] = [];

  for (const segment of input.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      const last = segments[segments.length - 1];
      if (segments.length > 0 && last !== '..') {
        segments.pop();
      } else if (!isAbsolute) {
        segments.push('..');
      }
      continue;
    }
    segments.push(segment);
  }

  const joined = segments.join('/');
  if (isAbsolute) return `/${joined}`;
  return joined === '' ? '.' : joined;
}

export function join(...parts: readonly string[]): string {
  return normalize(parts.filter((part) => part !== '').join('/'));
}

export function dirname(input: string): string {
  const normalized = normalize(input);
  const index = normalized.lastIndexOf('/');
  if (index === -1) return '.';
  if (index === 0) return '/';
  return normalized.slice(0, index);
}

export function basename(input: string): string {
  const normalized = normalize(input);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function extname(input: string): string {
  const base = basename(input);
  const index = base.lastIndexOf('.');
  return index <= 0 ? '' : base.slice(index);
}

/** Split into non-empty segments. `''` and `'.'` yield an empty list. */
export function segments(input: string): readonly string[] {
  const normalized = normalize(input);
  if (normalized === '.' || normalized === '') return [];
  return normalized.replace(/^\//, '').split('/').filter(Boolean);
}

/**
 * True when `candidate` stays inside `root`. Both are treated as POSIX-relative paths;
 * this is a *lexical* check and is intentionally conservative — the filesystem-level
 * check (symlinks, real paths) lives in the installer.
 */
export function isInside(root: string, candidate: string): boolean {
  const rootSegments = segments(root);
  const candidateSegments = segments(candidate);
  if (candidateSegments.length < rootSegments.length) return false;
  return rootSegments.every((segment, index) => candidateSegments[index] === segment);
}

/** True when the path escapes its own root, i.e. normalising leaves a leading `..`. */
export function escapesRoot(input: string): boolean {
  const normalized = normalize(input);
  return normalized === '..' || normalized.startsWith('../');
}

/** Convert an OS-native path to the POSIX form used inside packages. */
export function toPosix(input: string): string {
  return input.replace(/\\/g, '/');
}
