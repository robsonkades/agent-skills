import {
  AgentSkillsError,
  ErrorCode,
  inspectPath,
  isSafePath,
  normalizeSafePath,
  MAX_PATH_SEGMENTS,
  MAX_SEGMENT_LENGTH,
  type PathSafetyViolation,
} from '@jvm-expert/core';

/**
 * Path safety at the extraction boundary.
 *
 * The rules themselves live in `@jvm-expert/core` so that `validate` and the extractor
 * cannot disagree about what is safe. This module adds what only the installer needs: turning
 * a violation into a thrown security error, and proving containment against a real directory.
 */
export { MAX_PATH_SEGMENTS, MAX_SEGMENT_LENGTH, inspectPath, isSafePath };
export type UnsafePathReason = PathSafetyViolation;

/**
 * Validates and normalises an untrusted path to a POSIX relative path.
 * Throws rather than sanitising: silently rewriting a hostile path hides the attack.
 */
export function safeRelativePath(raw: string, context?: string): string {
  const reason = inspectPath(raw);
  if (reason !== undefined) {
    throw new AgentSkillsError(ErrorCode.UNSAFE_PATH, `Refusing unsafe path: ${truncate(raw)}`, {
      details: [reason.message, ...(context === undefined ? [] : [`In: ${context}`])],
      hints: ['This package is malformed or hostile; do not install it'],
      data: { path: raw, rule: reason.rule, ...(context === undefined ? {} : { context }) },
    });
  }
  return normalizeSafePath(raw);
}

/**
 * Second line of defence: proves the *resolved* destination is still inside the root.
 *
 * The lexical rules cannot see through a symlinked parent directory, so the installer also
 * compares resolved paths before writing. Belt and braces, because the cost of being wrong
 * here is arbitrary file overwrite.
 */
export function assertContained(root: string, candidate: string, separator: string): void {
  const normalizedRoot = stripTrailing(root, separator);
  const normalizedCandidate = stripTrailing(candidate, separator);

  if (normalizedCandidate === normalizedRoot) return;
  if (normalizedCandidate.startsWith(normalizedRoot + separator)) return;

  throw new AgentSkillsError(
    ErrorCode.UNSAFE_PATH,
    'Refusing to write outside the destination directory',
    {
      details: [`destination: ${normalizedRoot}`, `resolved to:  ${normalizedCandidate}`],
      hints: ['A symlink in the target path may be redirecting the install'],
      data: { root: normalizedRoot, candidate: normalizedCandidate },
    },
  );
}

function stripTrailing(value: string, separator: string): string {
  return value.endsWith(separator) ? value.slice(0, -separator.length) : value;
}

function truncate(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}
