import { AgentSkillsError, ErrorCode } from './errors.ts';
import { parseVersion, type SemanticVersion } from './version.ts';
import type { AgentId, InstallScope } from './agent.ts';

/**
 * An install receipt is how the tool knows what it owns.
 *
 * The brief's rule — "do not delete files that were not installed by the tool" — is only
 * enforceable with a record of exactly which relative paths were written and what they
 * hashed to. Uninstall consults this; a file whose hash has drifted is treated as
 * user-modified and preserved unless `--force`.
 */
export const RECEIPT_DIRNAME = '.agent-skills';
export const CURRENT_RECEIPT_VERSION = 1;

export interface ReceiptFile {
  /** POSIX path relative to the installed skill directory. */
  readonly path: string;
  readonly integrity: string;
  readonly size: number;
}

export interface InstallReceipt {
  readonly receiptVersion: number;
  readonly name: string;
  readonly version: SemanticVersion;
  readonly agentId: AgentId;
  readonly scope: InstallScope;
  readonly registry: string;
  readonly resolved: string;
  /** Integrity of the neutral package, matching the lockfile and registry index. */
  readonly integrity: string;
  readonly installedAt: string;
  readonly installedWith: string;
  /** Absolute path of the installed directory at install time, for diagnostics. */
  readonly directory: string;
  readonly files: readonly ReceiptFile[];
  /** Skills installed only because this one required them. */
  readonly dependencyOf: readonly string[];
}

export function parseReceipt(text: string, source: string): InstallReceipt {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new AgentSkillsError(ErrorCode.IO_ERROR, `Corrupted install receipt: ${source}`, {
      hints: ['Run `agent-skills doctor` to list corrupted metadata'],
      cause,
      data: { source },
    });
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AgentSkillsError(ErrorCode.IO_ERROR, `Corrupted install receipt: ${source}`, {
      data: { source },
    });
  }

  const doc = raw as Record<string, unknown>;
  const required = (key: string): string => {
    const value = doc[key];
    if (typeof value !== 'string' || value === '') {
      throw new AgentSkillsError(
        ErrorCode.IO_ERROR,
        `Install receipt ${source} is missing "${key}"`,
        { data: { source, field: key } },
      );
    }
    return value;
  };

  const files: ReceiptFile[] = [];
  if (Array.isArray(doc['files'])) {
    for (const entry of doc['files'] as unknown[]) {
      if (entry === null || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      if (typeof record['path'] !== 'string' || typeof record['integrity'] !== 'string') continue;
      files.push({
        path: record['path'],
        integrity: record['integrity'],
        size: typeof record['size'] === 'number' ? record['size'] : 0,
      });
    }
  }

  const scope = doc['scope'];
  return {
    receiptVersion: typeof doc['receiptVersion'] === 'number' ? doc['receiptVersion'] : 1,
    name: required('name'),
    version: parseVersion(required('version'), source),
    agentId: required('agentId'),
    scope: scope === 'project' ? 'project' : 'global',
    registry: typeof doc['registry'] === 'string' ? doc['registry'] : 'unknown',
    resolved: typeof doc['resolved'] === 'string' ? doc['resolved'] : '',
    integrity: typeof doc['integrity'] === 'string' ? doc['integrity'] : '',
    installedAt: typeof doc['installedAt'] === 'string' ? doc['installedAt'] : '',
    installedWith: typeof doc['installedWith'] === 'string' ? doc['installedWith'] : '',
    directory: typeof doc['directory'] === 'string' ? doc['directory'] : '',
    files,
    dependencyOf: Array.isArray(doc['dependencyOf'])
      ? (doc['dependencyOf'] as unknown[]).filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
  };
}

export function stringifyReceipt(receipt: InstallReceipt): string {
  return `${JSON.stringify(
    {
      receiptVersion: receipt.receiptVersion,
      name: receipt.name,
      version: receipt.version,
      agentId: receipt.agentId,
      scope: receipt.scope,
      registry: receipt.registry,
      resolved: receipt.resolved,
      integrity: receipt.integrity,
      installedAt: receipt.installedAt,
      installedWith: receipt.installedWith,
      directory: receipt.directory,
      dependencyOf: [...receipt.dependencyOf].sort(),
      files: [...receipt.files].sort((a, b) => a.path.localeCompare(b.path)),
    },
    null,
    2,
  )}\n`;
}

/** Where a receipt lives, relative to the agent's skill root. */
export function receiptPath(skillName: string): string {
  return `${RECEIPT_DIRNAME}/receipts/${skillName}.json`;
}
