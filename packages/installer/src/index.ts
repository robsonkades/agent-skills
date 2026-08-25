/**
 * `@jvm-expert/installer` — the single write path into an agent's skill directory.
 *
 * Everything security-critical about turning an untrusted package into files on disk lives
 * in this package: path safety, archive extraction limits, and the atomic commit.
 */
export { AtomicInstaller, type AtomicInstallerOptions } from './atomic-installer.ts';

export {
  DEFAULT_EXTRACTION_LIMITS,
  SafeExtractor,
  type ExtractionLimits,
} from './safe-extractor.ts';

export {
  MAX_PATH_SEGMENTS,
  MAX_SEGMENT_LENGTH,
  assertContained,
  inspectPath,
  isSafePath,
  safeRelativePath,
  type UnsafePathReason,
} from './safe-path.ts';
