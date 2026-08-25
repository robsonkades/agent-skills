import {
  AgentSkillsError,
  ErrorCode,
  type AgentSkillsConfig,
  type ConfigStore,
  type Environment,
  type FileSystem,
  type RegistryConfig,
  type RegistryKind,
} from '@jvm-expert/core';

export const CONFIG_SCHEMA_VERSION = 1;
export const CONFIG_DIRNAME = '.agent-skills';
export const CONFIG_FILENAME = 'config.json';

/** Overrides the whole `~/.agent-skills` directory. Primarily how the tests stay hermetic. */
export const HOME_ENV_VAR = 'AGENT_SKILLS_HOME';

export const OFFICIAL_REGISTRY: RegistryConfig = {
  name: 'official',
  url: 'https://github.com/robsonkades/agent-skills.git',
  kind: 'git',
  trusted: true,
};

export function defaultConfig(): AgentSkillsConfig {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    registries: [OFFICIAL_REGISTRY],
    agents: {},
    cache: { ttlSeconds: 3600 },
  };
}

/**
 * JSON configuration in `~/.agent-skills/config.json`.
 *
 * Written atomically: a half-flushed config would be worse than none, since the registry list
 * is what determines where the tool downloads executable-adjacent content from.
 */
export class FileConfigStore implements ConfigStore {
  private readonly fs: FileSystem;
  private readonly env: Environment;

  constructor(fs: FileSystem, env: Environment) {
    this.fs = fs;
    this.env = env;
  }

  location(): string {
    return this.fs.join(configHome(this.fs, this.env), CONFIG_FILENAME);
  }

  async load(): Promise<AgentSkillsConfig> {
    const path = this.location();
    if (!(await this.fs.exists(path))) return defaultConfig();

    let raw: unknown;
    try {
      raw = JSON.parse(await this.fs.readTextFile(path));
    } catch (cause) {
      throw new AgentSkillsError(ErrorCode.USAGE, `Could not parse ${path}`, {
        details: [cause instanceof Error ? cause.message : String(cause)],
        hints: [`Fix the JSON, or delete ${path} to fall back to defaults`],
        cause,
        data: { path },
      });
    }

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new AgentSkillsError(ErrorCode.USAGE, `${path} must be a JSON object`, {
        data: { path },
      });
    }

    const doc = raw as Record<string, unknown>;
    const registries = readRegistries(doc['registries'], path);

    return {
      schemaVersion:
        typeof doc['schemaVersion'] === 'number' ? doc['schemaVersion'] : CONFIG_SCHEMA_VERSION,
      // An empty list is a deliberate choice (offline / local-only), not a reason to
      // silently reinstate the official registry.
      registries,
      agents: readAgents(doc['agents']),
      cache: {
        ttlSeconds:
          typeof (doc['cache'] as Record<string, unknown> | undefined)?.['ttlSeconds'] === 'number'
            ? ((doc['cache'] as Record<string, unknown>)['ttlSeconds'] as number)
            : 3600,
      },
    };
  }

  async save(config: AgentSkillsConfig): Promise<void> {
    const path = this.location();
    const staging = `${path}.tmp-${process.pid}`;
    await this.fs.mkdirp(this.fs.dirname(path));
    await this.fs.writeFile(staging, `${JSON.stringify(config, null, 2)}\n`);
    await this.fs.rename(staging, path);
  }
}

export function configHome(fs: FileSystem, env: Environment): string {
  const override = env.env()[HOME_ENV_VAR];
  if (override !== undefined && override.trim() !== '') return fs.resolve(override);
  return fs.join(env.homeDir(), CONFIG_DIRNAME);
}

export function cacheHome(fs: FileSystem, env: Environment): string {
  return fs.join(configHome(fs, env), 'cache');
}

function readRegistries(value: unknown, path: string): readonly RegistryConfig[] {
  if (value === undefined) return defaultConfig().registries;
  if (!Array.isArray(value)) {
    throw new AgentSkillsError(ErrorCode.USAGE, `${path}: "registries" must be an array`, {
      data: { path },
    });
  }

  const seen = new Set<string>();
  const registries: RegistryConfig[] = [];

  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const name = record['name'];
    const url = record['url'];
    if (typeof name !== 'string' || typeof url !== 'string') continue;

    if (seen.has(name)) {
      throw new AgentSkillsError(
        ErrorCode.REGISTRY_DUPLICATE,
        `${path}: duplicate registry "${name}"`,
        {
          hints: ['Registry names must be unique; precedence is decided by list order'],
          data: { path, name },
        },
      );
    }
    seen.add(name);

    registries.push({
      name,
      url,
      kind: inferKind(record['kind'], url),
      trusted: record['trusted'] !== false,
      ...(typeof record['ref'] === 'string' ? { ref: record['ref'] } : {}),
    });
  }

  return registries;
}

/** Kind can be declared, but is inferred from the URL when omitted — the common case. */
export function inferKind(declared: unknown, url: string): RegistryKind {
  if (declared === 'git' || declared === 'http' || declared === 'local') return declared;
  if (
    url.startsWith('file://') ||
    /^[a-zA-Z]:[\\/]/.test(url) ||
    url.startsWith('/') ||
    url.startsWith('.')
  ) {
    return 'local';
  }
  if (url.endsWith('.git') || url.includes('github.com') || url.includes('gitlab.')) return 'git';
  return 'http';
}

function readAgents(
  value: unknown,
): Record<string, { enabled: boolean; globalRoot?: string; projectRoot?: string }> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const agents: Record<string, { enabled: boolean; globalRoot?: string; projectRoot?: string }> =
    {};

  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === null || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    agents[id] = {
      enabled: record['enabled'] !== false,
      ...(typeof record['globalRoot'] === 'string' ? { globalRoot: record['globalRoot'] } : {}),
      ...(typeof record['projectRoot'] === 'string' ? { projectRoot: record['projectRoot'] } : {}),
    };
  }

  return agents;
}
