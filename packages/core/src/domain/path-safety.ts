import { escapesRoot, normalize, segments } from './posix-path.ts';

/**
 * The single definition of "is this path safe to turn into a filename".
 *
 * It lives in the domain because two very different callers need exactly the same answer:
 * `validate` (is this package well-formed?) and the installer's extractor (is this archive
 * hostile?). Keeping two copies meant they drifted — a path like `a:stream` was reported as
 * "absolute" by one and "alternate data stream" by the other — so there is one copy now and
 * both callers wrap it.
 *
 * Rules are enforced on every platform, not just the one in use: a package that installs
 * cleanly on Linux and corrupts a Windows machine is a supply-chain bug, not a quirk.
 */

const RESERVED_BASENAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

const ILLEGAL_CHARACTERS = ['<', '>', '"', '|', '?', '*'];

export const MAX_PATH_SEGMENTS = 32;
export const MAX_SEGMENT_LENGTH = 255;

export type PathSafetyRule =
  | 'empty'
  | 'controlChars'
  | 'uncPath'
  | 'absolute'
  | 'driveLetter'
  | 'traversal'
  | 'tooDeep'
  | 'segmentTooLong'
  | 'trailingDotOrSpace'
  | 'alternateDataStream'
  | 'illegalCharacter'
  | 'reservedName';

export interface PathSafetyViolation {
  readonly rule: PathSafetyRule;
  readonly message: string;
}

/** Tested by code point rather than with a regex literal holding raw C0 bytes. */
function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Returns the reason `raw` is unsafe, or undefined when it is acceptable.
 *
 * Order matters: UNC is checked before "absolute" because `\\server\share` normalises to
 * `//server/share`, and the drive-letter check runs only after the colon has been ruled out
 * as an alternate-data-stream marker on a non-leading segment.
 */
export function inspectPath(raw: string): PathSafetyViolation | undefined {
  if (raw.trim() === '') {
    return { rule: 'empty', message: 'Path is empty' };
  }
  if (hasControlCharacters(raw)) {
    return { rule: 'controlChars', message: 'Path contains control characters' };
  }

  // Normalise separators before any structural check: an archive can record `..\\..\\x` and
  // rely on a POSIX-only check treating backslashes as ordinary characters.
  const unified = raw.replace(/\\/g, '/');

  if (raw.startsWith('\\\\') || unified.startsWith('//')) {
    return { rule: 'uncPath', message: 'Path is a UNC network path' };
  }
  if (unified.startsWith('/')) {
    return { rule: 'absolute', message: 'Path is absolute' };
  }
  if (/^[a-zA-Z]:[/\\]/.test(raw)) {
    return { rule: 'driveLetter', message: 'Path starts with a drive letter' };
  }
  if (escapesRoot(unified)) {
    return { rule: 'traversal', message: 'Path escapes the destination directory' };
  }

  const parts = segments(unified);
  if (parts.length === 0) {
    return { rule: 'empty', message: 'Path resolves to nothing' };
  }
  if (parts.length > MAX_PATH_SEGMENTS) {
    return { rule: 'tooDeep', message: `Path is more than ${MAX_PATH_SEGMENTS} levels deep` };
  }

  for (const segment of parts) {
    if (segment.length > MAX_SEGMENT_LENGTH) {
      return {
        rule: 'segmentTooLong',
        message: `"${truncate(segment)}" exceeds ${MAX_SEGMENT_LENGTH} characters`,
      };
    }
    if (segment.endsWith('.') || segment.endsWith(' ')) {
      // Windows silently strips these, so `evil.txt.` and `evil.txt` become the same file —
      // a way to reach a path that was already checked under a different name.
      return { rule: 'trailingDotOrSpace', message: `"${segment}" ends with a dot or space` };
    }
    if (segment.includes(':')) {
      return {
        rule: 'alternateDataStream',
        message: `"${segment}" addresses an NTFS alternate data stream`,
      };
    }
    for (const character of ILLEGAL_CHARACTERS) {
      if (segment.includes(character)) {
        return { rule: 'illegalCharacter', message: `"${segment}" contains "${character}"` };
      }
    }
    if (RESERVED_BASENAMES.has(segment.split('.')[0]!.toLowerCase())) {
      return { rule: 'reservedName', message: `"${segment}" is a reserved device name on Windows` };
    }
  }

  return undefined;
}

export function isSafePath(raw: string): boolean {
  return inspectPath(raw) === undefined;
}

/** Normalised POSIX form. Only meaningful for a path {@link inspectPath} accepted. */
export function normalizeSafePath(raw: string): string {
  return normalize(raw.replace(/\\/g, '/'));
}

function truncate(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}
