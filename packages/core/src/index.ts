/**
 * `@jvm-expert/core` — the agent-agnostic heart of agent-skills.
 *
 * Contains the domain model, the application services, and the port interfaces every
 * adapter implements. It has no knowledge of Claude Code, Codex, git, HTTP or the
 * filesystem: those live behind the ports re-exported below.
 */

// --- Domain -----------------------------------------------------------------------------
export {
  AgentSkillsError,
  ErrorCode,
  ExitCode,
  exitCodeFor,
  isAgentSkillsError,
  type AgentSkillsErrorOptions,
} from './domain/errors.ts';

export {
  detectionFrom,
  entryNameFor,
  INSTALL_SCOPES,
  type AgentDetection,
  type AgentId,
  type AgentLayout,
  type AgentLocation,
  type AgentTarget,
  type DetectionEvidence,
  type DetectionStrength,
  type EntryShape,
  type InstallScope,
  type LayoutEntry,
  type LocationContext,
} from './domain/agent.ts';

export {
  computeIntegrity,
  computePackageIntegrity,
  INTEGRITY_PREFIX,
  isIntegrityString,
} from './domain/integrity.ts';

export {
  CURRENT_LOCKFILE_VERSION,
  LOCKFILE_NAME,
  assertIntegrityMatches,
  emptyLockfile,
  parseLockfile,
  stringifyLockfile,
  withSkill,
  withoutSkill,
  type Lockfile,
  type LockedSkill,
} from './domain/lockfile.ts';

export {
  COMMAND_ENTRYPOINT,
  CURRENT_SCHEMA_VERSION,
  WORKFLOW_ENTRYPOINT,
  DEFAULT_PACKAGE_KIND,
  MANIFEST_FILENAME,
  PACKAGE_KINDS,
  SKILL_ENTRYPOINT,
  entrypointFor,
  parseManifest,
  stringifyManifest,
  type AgentCompatibility,
  type PackageKind,
  type ParsedManifest,
  type SkillAuthor,
  type SkillDependency,
  type SkillManifest,
  type SkillRepository,
} from './domain/manifest.ts';

export {
  MAX_PATH_SEGMENTS,
  MAX_SEGMENT_LENGTH,
  inspectPath,
  isSafePath,
  normalizeSafePath,
  type PathSafetyRule,
  type PathSafetyViolation,
} from './domain/path-safety.ts';

export * as posix from './domain/posix-path.ts';

export {
  CURRENT_RECEIPT_VERSION,
  RECEIPT_DIRNAME,
  parseReceipt,
  receiptPath,
  stringifyReceipt,
  type InstallReceipt,
  type ReceiptFile,
} from './domain/receipt.ts';

export {
  CURRENT_INDEX_VERSION,
  findIndexEntry,
  parseRegistryIndex,
  stringifyRegistryIndex,
  type IndexSkillEntry,
  type IndexVersionEntry,
  type RegistryIndex,
  type RegistryKind,
} from './domain/registry-index.ts';

export {
  Resolver,
  type ResolutionResult,
  type ResolutionSource,
  type ResolveOptions,
  type ResolvedSkill,
} from './domain/resolver.ts';

export {
  documentDescription,
  documentName,
  documentVersion,
  parseSkillDocument,
  stringifySkillDocument,
  type SkillDocument,
} from './domain/skill-document.ts';

export { parseWorkflowDocument, stringifyWorkflowDocument } from './domain/workflow-document.ts';

export { parseJsLiteral, skipTrivia } from './domain/js-literal.ts';

export {
  buildSkillPackage,
  decodeText,
  encodeText,
  parseEntrypoint,
  findFile,
  isManifestFile,
  packageSize,
  readTextFile,
  type PackageFile,
  type SkillPackage,
} from './domain/skill-package.ts';

export {
  LATEST,
  SKILL_NAME_MAX_LENGTH,
  SKILL_NAME_MIN_LENGTH,
  assertValidSkillName,
  formatSkillRef,
  isValidSkillName,
  parseSkillRef,
  validateSkillName,
  type SkillRef,
} from './domain/skill-ref.ts';

export {
  buildReport,
  IssueCollector,
  type IssueSeverity,
  type ValidationIssue,
  type ValidationReport,
} from './domain/validation.ts';

export {
  classifyChange,
  compareVersions,
  increment,
  intersects,
  isSemanticVersion,
  maxSatisfying,
  parseRange,
  parseVersion,
  satisfies,
  sortVersionsDescending,
  type SemanticVersion,
  type VersionBump,
} from './domain/version.ts';

// --- Ports ------------------------------------------------------------------------------
export { AgentCatalog, type AgentAdapter, type DetectionContext } from './ports/agent-adapter.ts';

export type {
  AgentConfig,
  AgentSkillsConfig,
  CacheConfig,
  ConfigStore,
} from './ports/config-store.ts';

export type {
  ArchiveEntry,
  ArchiveReader,
  Clock,
  CommandOptions,
  CommandResult,
  CommandRunner,
  DirEntry,
  Environment,
  FileStat,
  FileSystem,
  Hasher,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
  LogLevel,
  Logger,
} from './ports/infrastructure.ts';

export type {
  InstallationEngine,
  PackageExtractor,
  InstallOutcome,
  InstallRequest,
  InstallResult,
  InstalledSkill,
  UninstallRequest,
  UninstallResult,
} from './ports/installation.ts';

export type {
  FederatedRegistry,
  FetchedPackage,
  RefreshOptions,
  RegistryConfig,
  RegistryFactory,
  RegistryRouter,
  SearchQuery,
  SkillRegistry,
  SkillSummary,
} from './ports/skill-registry.ts';

// --- Application ------------------------------------------------------------------------
export {
  ALL_AGENTS,
  detectAgents,
  detectionContext,
  locationContext,
  selectAgents,
  targetsFor,
  type AgentSelection,
  type AgentSelectionOptions,
} from './application/agent-selection.ts';

export type { ApplicationContext } from './application/context.ts';

export { CreateSkill, type CreateOptions, type CreateReport } from './application/create-skill.ts';

export {
  DiagnoseSystem,
  type CheckStatus,
  type DiagnosticCheck,
  type DiagnosticSection,
  type DoctorOptions,
  type DoctorReport,
} from './application/diagnose.ts';

export {
  InstallSkills,
  formatIssue,
  type InstallOptions,
  type InstallReport,
} from './application/install-skills.ts';

export {
  ListInstalled,
  type ListEntry,
  type ListOptions,
  type ListReport,
} from './application/list-installed.ts';

export {
  DEFAULT_MAX_FILES,
  DEFAULT_MAX_TOTAL_BYTES,
  loadPackageFromDirectory,
  peekSkillDocument,
  scaffoldPackage,
  type LoadPackageOptions,
  type LoadedPackage,
} from './application/package-loader.ts';

export {
  PublishSkill,
  type PublishOptions,
  type PublishReport,
} from './application/publish-skill.ts';

export {
  RemoveSkills,
  type RemoveOptions,
  type RemoveReport,
} from './application/remove-skills.ts';

export { FederationResolutionSource } from './application/resolution-source.ts';

export {
  DescribeSkill,
  SearchSkills,
  type SearchOptions,
  type SkillInfo,
} from './application/search-skills.ts';

export {
  UpdateSkills,
  type UpdateChange,
  type UpdateOptions,
  type UpdateReport,
} from './application/update-skills.ts';

export {
  pathSafetyIssues,
  validateDirectory,
  validatePackage,
  type ValidateDirectoryResult,
  type ValidatePackageOptions,
} from './application/validate-package.ts';

export {
  findProjectRoot,
  lockfilePath,
  pinsFrom,
  readLockfile,
  requireProjectRoot,
  writeLockfile,
} from './application/workspace.ts';
