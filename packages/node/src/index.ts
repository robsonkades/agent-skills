/**
 * `@jvm-expert/node` — Node.js implementations of the infrastructure ports.
 *
 * This is the only package that imports `node:fs`, `node:child_process`, `fetch` or `tar`.
 * Swapping it out is how the rest of the system would run on a different runtime.
 */
export { NodeFileSystem } from './file-system.ts';
export {
  ConsoleLogger,
  NodeCommandRunner,
  NodeEnvironment,
  NodeHasher,
  NodeHttpClient,
  SystemClock,
} from './runtime.ts';
export { DEFAULT_ARCHIVE_LIMITS, NodeArchiveReader, type ArchiveLimits } from './archive.ts';
export {
  CONFIG_DIRNAME,
  CONFIG_FILENAME,
  CONFIG_SCHEMA_VERSION,
  FileConfigStore,
  HOME_ENV_VAR,
  OFFICIAL_REGISTRY,
  cacheHome,
  configHome,
  defaultConfig,
  inferKind,
} from './config-store.ts';
