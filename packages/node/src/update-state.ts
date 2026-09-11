import {
  emptyUpdateState,
  isSemanticVersion,
  type Environment,
  type FileSystem,
  type SemanticVersion,
  type UpdateState,
  type UpdateStateStore,
} from '@jvm-expert/core';
import { configHome } from './config-store.ts';

/** Corrupt or newer advisory state is discarded; it must never break a CLI command. */
export class FileUpdateStateStore implements UpdateStateStore {
  private readonly fs: FileSystem;
  private readonly path: string;

  constructor(fs: FileSystem, env: Environment) {
    this.fs = fs;
    this.path = fs.join(configHome(fs, env), 'updates.json');
  }

  async load(): Promise<UpdateState> {
    try {
      if ((await this.fs.lstat(this.path)).size > 1024 * 1024) return emptyUpdateState();
      const raw: unknown = JSON.parse(await this.fs.readTextFile(this.path));
      if (!record(raw) || raw['schemaVersion'] !== 1) return emptyUpdateState();
      const checks: UpdateState['checks'] = {};
      if (record(raw['checks'])) {
        for (const [key, value] of Object.entries(raw['checks']).slice(-1000)) {
          if (!record(value) || !timestamp(value['checkedAt']) || !Array.isArray(value['versions']))
            continue;
          const versions = value['versions'];
          if (!versions.every((v: unknown) => typeof v === 'string' && isSemanticVersion(v)))
            continue;
          Object.defineProperty(checks, key, {
            value: { checkedAt: value['checkedAt'], versions: versions as SemanticVersion[] },
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
      }
      const dismissed = Array.isArray(raw['dismissed'])
        ? raw['dismissed']
            .filter((id: unknown): id is string => typeof id === 'string')
            .slice(-1000)
        : [];
      const deferred = record(raw['deferred'])
        ? Object.fromEntries(
            Object.entries(raw['deferred'])
              .filter((entry): entry is [string, number] => timestamp(entry[1]))
              .slice(-1000),
          )
        : {};
      return { checks, dismissed, deferred };
    } catch {
      return emptyUpdateState();
    }
  }

  async save(state: UpdateState): Promise<void> {
    const parent = this.fs.dirname(this.path);
    await this.fs.mkdirp(parent);
    const staging = await this.fs.makeTempDir(parent, '.updates-');
    try {
      const file = this.fs.join(staging, 'updates.json');
      await this.fs.writeFile(file, `${JSON.stringify({ schemaVersion: 1, ...state })}\n`);
      await this.fs.rename(file, this.path);
    } finally {
      await this.fs.remove(staging);
    }
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
