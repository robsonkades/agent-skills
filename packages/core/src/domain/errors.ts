/**
 * Every user-facing failure in the system is an {@link AgentSkillsError} carrying a stable
 * code. Codes are part of the public contract: they appear in `--json` output, in error
 * messages, and in `docs/errors.md`, so scripts and bug reports can refer to them.
 */
export const ErrorCode = {
  /** The CLI was invoked in a way that cannot be interpreted. */
  USAGE: 'ASK_USAGE',
  /** A manifest, SKILL.md, or package layout violated the format. */
  INVALID_MANIFEST: 'ASK_INVALID_MANIFEST',
  INVALID_PACKAGE: 'ASK_INVALID_PACKAGE',
  INVALID_SKILL_NAME: 'ASK_INVALID_SKILL_NAME',
  INVALID_VERSION: 'ASK_INVALID_VERSION',
  /** The package format is newer than this CLI understands. */
  UNSUPPORTED_SCHEMA: 'ASK_UNSUPPORTED_SCHEMA',
  /** Resolution failures. */
  SKILL_NOT_FOUND: 'ASK_SKILL_NOT_FOUND',
  VERSION_NOT_FOUND: 'ASK_VERSION_NOT_FOUND',
  DEPENDENCY_CONFLICT: 'ASK_DEPENDENCY_CONFLICT',
  DEPENDENCY_CYCLE: 'ASK_DEPENDENCY_CYCLE',
  /** Registry failures. */
  REGISTRY_NOT_FOUND: 'ASK_REGISTRY_NOT_FOUND',
  REGISTRY_UNAVAILABLE: 'ASK_REGISTRY_UNAVAILABLE',
  REGISTRY_INVALID_INDEX: 'ASK_REGISTRY_INVALID_INDEX',
  REGISTRY_DUPLICATE: 'ASK_REGISTRY_DUPLICATE',
  /** Security and integrity failures. */
  INTEGRITY_MISMATCH: 'ASK_INTEGRITY_MISMATCH',
  UNSAFE_PATH: 'ASK_UNSAFE_PATH',
  UNSAFE_ARCHIVE: 'ASK_UNSAFE_ARCHIVE',
  INSECURE_TRANSPORT: 'ASK_INSECURE_TRANSPORT',
  /** Agent selection and detection. */
  NO_AGENT_DETECTED: 'ASK_NO_AGENT_DETECTED',
  UNKNOWN_AGENT: 'ASK_UNKNOWN_AGENT',
  AGENT_INCOMPATIBLE: 'ASK_AGENT_INCOMPATIBLE',
  /** Installation lifecycle. */
  ALREADY_INSTALLED: 'ASK_ALREADY_INSTALLED',
  NOT_INSTALLED: 'ASK_NOT_INSTALLED',
  INSTALL_FAILED: 'ASK_INSTALL_FAILED',
  MODIFIED_INSTALL: 'ASK_MODIFIED_INSTALL',
  /** Lockfile. */
  LOCKFILE_INVALID: 'ASK_LOCKFILE_INVALID',
  LOCKFILE_MISMATCH: 'ASK_LOCKFILE_MISMATCH',
  /** Filesystem and environment. */
  IO_ERROR: 'ASK_IO_ERROR',
  PERMISSION_DENIED: 'ASK_PERMISSION_DENIED',
  /** Publishing. */
  PUBLISH_REJECTED: 'ASK_PUBLISH_REJECTED',
  /** Anything genuinely unexpected. */
  INTERNAL: 'ASK_INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AgentSkillsErrorOptions {
  /** Extra lines rendered under the headline, in order. */
  readonly details?: readonly string[];
  /** Concrete next actions, rendered under a `Try:` heading. */
  readonly hints?: readonly string[];
  /** Underlying cause, preserved for `--verbose` stack output. */
  readonly cause?: unknown;
  /** Structured payload surfaced in `--json` mode. */
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * The single error type crossing the application boundary. Infrastructure errors are
 * wrapped rather than rethrown so the CLI never has to interpret an `ENOENT`.
 */
export class AgentSkillsError extends Error {
  readonly code: ErrorCode;
  readonly details: readonly string[];
  readonly hints: readonly string[];
  readonly data: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, options: AgentSkillsErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AgentSkillsError';
    this.code = code;
    this.details = options.details ?? [];
    this.hints = options.hints ?? [];
    this.data = options.data ?? {};
  }

  toJSON(): Record<string, unknown> {
    return {
      error: true,
      code: this.code,
      message: this.message,
      details: this.details,
      hints: this.hints,
      ...this.data,
    };
  }
}

export function isAgentSkillsError(value: unknown): value is AgentSkillsError {
  return value instanceof AgentSkillsError;
}

/**
 * Process exit codes. Distinct codes for validation, resolution and security let CI
 * scripts react differently to "your package is wrong" and "the download was tampered
 * with", which is the whole point of not returning 1 for everything.
 */
export const ExitCode = {
  OK: 0,
  FAILURE: 1,
  USAGE: 2,
  VALIDATION: 3,
  RESOLUTION: 4,
  SECURITY: 5,
  NO_AGENT: 6,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

const EXIT_BY_CODE: Partial<Record<ErrorCode, ExitCode>> = {
  [ErrorCode.USAGE]: ExitCode.USAGE,
  [ErrorCode.INVALID_MANIFEST]: ExitCode.VALIDATION,
  [ErrorCode.INVALID_PACKAGE]: ExitCode.VALIDATION,
  [ErrorCode.INVALID_SKILL_NAME]: ExitCode.VALIDATION,
  [ErrorCode.INVALID_VERSION]: ExitCode.VALIDATION,
  [ErrorCode.UNSUPPORTED_SCHEMA]: ExitCode.VALIDATION,
  [ErrorCode.LOCKFILE_INVALID]: ExitCode.VALIDATION,
  [ErrorCode.PUBLISH_REJECTED]: ExitCode.VALIDATION,
  [ErrorCode.SKILL_NOT_FOUND]: ExitCode.RESOLUTION,
  [ErrorCode.VERSION_NOT_FOUND]: ExitCode.RESOLUTION,
  [ErrorCode.DEPENDENCY_CONFLICT]: ExitCode.RESOLUTION,
  [ErrorCode.DEPENDENCY_CYCLE]: ExitCode.RESOLUTION,
  [ErrorCode.INTEGRITY_MISMATCH]: ExitCode.SECURITY,
  [ErrorCode.UNSAFE_PATH]: ExitCode.SECURITY,
  [ErrorCode.UNSAFE_ARCHIVE]: ExitCode.SECURITY,
  [ErrorCode.INSECURE_TRANSPORT]: ExitCode.SECURITY,
  [ErrorCode.LOCKFILE_MISMATCH]: ExitCode.SECURITY,
  [ErrorCode.NO_AGENT_DETECTED]: ExitCode.NO_AGENT,
};

export function exitCodeFor(error: unknown): ExitCode {
  if (!isAgentSkillsError(error)) return ExitCode.FAILURE;
  return EXIT_BY_CODE[error.code] ?? ExitCode.FAILURE;
}
