import { INTEGRITY_PREFIX } from '../domain/integrity.ts';
import {
  MANIFEST_FILENAME,
  entrypointFor,
  parseManifest,
  type PackageKind,
} from '../domain/manifest.ts';
import {
  buildSkillPackage,
  encodeText,
  type PackageFile,
  type SkillPackage,
} from '../domain/skill-package.ts';
import type { IndexVersionEntry } from '../domain/registry-index.ts';
import type { SemanticVersion } from '../domain/version.ts';
import type { SkillManifest } from '../domain/manifest.ts';
import type {
  Clock,
  CommandOptions,
  CommandResult,
  CommandRunner,
  Environment,
  Hasher,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
  Logger,
} from '../ports/infrastructure.ts';
import type { RegistryKind } from '../domain/registry-index.ts';
import type {
  FetchedPackage,
  SearchQuery,
  SkillRegistry,
  SkillSummary,
} from '../ports/skill-registry.ts';
import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';

/** Fixed clock, so anything that records a timestamp is assertable. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(iso = '2026-01-01T00:00:00.000Z') {
    this.current = new Date(iso);
  }

  now(): Date {
    return this.current;
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export interface FakeEnvironmentOptions {
  readonly homeDir?: string;
  readonly cwd?: string;
  readonly tempDir?: string;
  readonly platform?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export class FakeEnvironment implements Environment {
  private readonly options: {
    homeDir: string;
    cwd: string;
    tempDir: string;
    platform: string;
    env: Record<string, string | undefined>;
  };

  constructor(options: FakeEnvironmentOptions = {}) {
    this.options = {
      homeDir: options.homeDir ?? '/home/dev',
      cwd: options.cwd ?? '/work/project',
      tempDir: options.tempDir ?? '/tmp',
      platform: options.platform ?? 'linux',
      env: { ...(options.env ?? {}) },
    };
  }

  homeDir(): string {
    return this.options.homeDir;
  }

  cwd(): string {
    return this.options.cwd;
  }

  tempDir(): string {
    return this.options.tempDir;
  }

  platform(): string {
    return this.options.platform;
  }

  env(): Readonly<Record<string, string | undefined>> {
    return this.options.env;
  }

  setEnv(key: string, value: string | undefined): void {
    this.options.env[key] = value;
  }

  setCwd(cwd: string): void {
    this.options.cwd = cwd;
  }
}

/**
 * Deterministic content hash. Not cryptographic — tests need a hash that changes when content
 * changes and is stable across runs, and a real SHA-256 makes expected values unreadable.
 */
export class FakeHasher implements Hasher {
  private readonly files = new Map<string, Uint8Array>();

  hash(data: Uint8Array): string {
    let value = 2166136261;
    for (const byte of data) {
      value ^= byte;
      value = Math.imul(value, 16777619) >>> 0;
    }
    return `${INTEGRITY_PREFIX}${value.toString(16).padStart(8, '0')}`;
  }

  async hashFile(path: string): Promise<string> {
    const bytes = this.files.get(path);
    if (bytes === undefined)
      throw new AgentSkillsError(ErrorCode.IO_ERROR, `Unknown file: ${path}`);
    return this.hash(bytes);
  }

  register(path: string, bytes: Uint8Array): void {
    this.files.set(path, bytes);
  }
}

/** Hashes through a filesystem, so `hashFile` works against the in-memory double. */
export function hasherOver(fs: { readFile(path: string): Promise<Uint8Array> }): Hasher {
  const base = new FakeHasher();
  return {
    hash: (data) => base.hash(data),
    hashFile: async (path) => base.hash(await fs.readFile(path)),
  };
}

export class RecordingLogger implements Logger {
  readonly lines: { level: string; message: string }[] = [];

  debug(message: string): void {
    this.lines.push({ level: 'debug', message });
  }

  info(message: string): void {
    this.lines.push({ level: 'info', message });
  }

  warn(message: string): void {
    this.lines.push({ level: 'warn', message });
  }

  error(message: string): void {
    this.lines.push({ level: 'error', message });
  }

  messages(level?: string): readonly string[] {
    return this.lines
      .filter((line) => level === undefined || line.level === level)
      .map((line) => line.message);
  }
}

export class FakeCommandRunner implements CommandRunner {
  readonly calls: { command: string; args: readonly string[] }[] = [];

  private readonly available: Set<string>;
  private readonly results: Map<string, CommandResult>;

  constructor(
    options: { available?: readonly string[]; results?: Record<string, CommandResult> } = {},
  ) {
    this.available = new Set(options.available ?? []);
    this.results = new Map(Object.entries(options.results ?? {}));
  }

  async run(
    command: string,
    args: readonly string[],
    _options?: CommandOptions,
  ): Promise<CommandResult> {
    this.calls.push({ command, args });
    return this.results.get(`${command} ${args.join(' ')}`) ?? { code: 0, stdout: '', stderr: '' };
  }

  async which(command: string): Promise<string | undefined> {
    return this.available.has(command) ? `/usr/bin/${command}` : undefined;
  }
}

export class FakeHttpClient implements HttpClient {
  readonly requests: string[] = [];

  private readonly responses: Map<string, HttpResponse>;

  constructor(responses: Record<string, HttpResponse | string> = {}) {
    this.responses = new Map(
      Object.entries(responses).map(([url, response]) => [
        url,
        typeof response === 'string'
          ? { status: 200, headers: {}, body: encodeText(response) }
          : response,
      ]),
    );
  }

  async get(url: string, _options?: HttpRequestOptions): Promise<HttpResponse> {
    this.requests.push(url);
    return this.responses.get(url) ?? { status: 404, headers: {}, body: new Uint8Array() };
  }
}

// --- Package and registry builders --------------------------------------------------------

export interface BuildPackageOptions {
  readonly name: string;
  readonly version: string;
  /** Defaults to `skill`. */
  readonly kind?: PackageKind;
  readonly description?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly agents?: readonly string[];
  readonly extraFiles?: Readonly<Record<string, string>>;
  readonly manifestExtras?: string;
  /** Replaces the generated entrypoint body. */
  readonly body?: string;
  /** Extra `meta` keys, for workflow packages. */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** Builds a valid in-memory package. Keeps every test from hand-writing YAML. */
export function buildPackage(options: BuildPackageOptions): SkillPackage {
  const kind = options.kind ?? 'skill';
  const entrypoint = entrypointFor(kind);
  const description =
    options.description ??
    `A test ${kind} named ${options.name}. Use it when testing ${options.name}.`;

  const manifestYaml = [
    'schemaVersion: 1',
    `name: ${options.name}`,
    ...(kind === 'skill' ? [] : [`kind: ${kind}`]),
    `version: ${options.version}`,
    `description: ${JSON.stringify(description)}`,
    'license: Apache-2.0',
    ...(options.agents === undefined
      ? []
      : ['compatibility:', '  agents:', ...options.agents.map((agent) => `    - id: ${agent}`)]),
    'files:',
    `  - ${entrypoint}`,
    '  - skill.yaml',
    ...Object.keys(options.extraFiles ?? {}).map((path) => `  - ${path}`),
    ...(options.dependencies === undefined
      ? []
      : [
          'dependencies:',
          ...Object.entries(options.dependencies).flatMap(([name, range]) => [
            `  - name: ${name}`,
            `    version: "${range}"`,
          ]),
        ]),
    ...(options.optionalDependencies === undefined
      ? []
      : [
          'optionalDependencies:',
          ...Object.entries(options.optionalDependencies).flatMap(([name, range]) => [
            `  - name: ${name}`,
            `    version: "${range}"`,
          ]),
        ]),
    ...(options.manifestExtras === undefined ? [] : [options.manifestExtras]),
    '',
  ].join('\n');

  const skillMd = [
    '---',
    `name: ${options.name}`,
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
    options.body ??
      [
        `# ${options.name}`,
        '',
        'This is a test package body long enough to satisfy the minimum-content check.',
      ].join('\n'),
    '',
  ].join('\n');

  const workflowJs = [
    'export const meta = {',
    `  name: ${JSON.stringify(options.name)},`,
    `  description: ${JSON.stringify(description)},`,
    ...Object.entries(options.meta ?? {}).map(
      ([key, value]) => `  ${key}: ${JSON.stringify(value)},`,
    ),
    '};',
    '',
    options.body ??
      [
        "phase('Only');",
        "log('A test workflow body long enough to satisfy the minimum-content check.');",
      ].join('\n'),
    '',
  ].join('\n');

  const entrypointText = kind === 'workflow' ? workflowJs : skillMd;

  const files: PackageFile[] = [
    { path: entrypoint, bytes: encodeText(entrypointText) },
    { path: MANIFEST_FILENAME, bytes: encodeText(manifestYaml) },
    ...Object.entries(options.extraFiles ?? {}).map(([path, content]) => ({
      path,
      bytes: encodeText(content),
    })),
  ];

  const { manifest } = parseManifest(manifestYaml, { source: `${options.name}/skill.yaml` });
  return buildSkillPackage(manifest, files);
}

export interface FakeRegistryOptions {
  readonly name: string;
  readonly packages: readonly SkillPackage[];
  readonly kind?: RegistryKind;
  readonly trusted?: boolean;
  /** Versions marked deprecated, as `name@version`. */
  readonly deprecated?: readonly string[];
  /** Make every call fail, to test degradation paths. */
  readonly offline?: boolean;
}

/** An in-memory {@link SkillRegistry}, sufficient for every resolver and federation test. */
export class FakeRegistry implements SkillRegistry {
  readonly name: string;
  readonly kind: RegistryKind;
  readonly trusted: boolean;

  readonly fetches: string[] = [];
  private readonly packages: readonly SkillPackage[];
  private readonly deprecated: ReadonlySet<string>;
  private readonly offline: boolean;

  constructor(options: FakeRegistryOptions) {
    this.name = options.name;
    this.kind = options.kind ?? 'local';
    this.trusted = options.trusted ?? true;
    this.packages = options.packages;
    this.deprecated = new Set(options.deprecated ?? []);
    this.offline = options.offline ?? false;
  }

  async refresh(): Promise<void> {
    this.assertOnline();
  }

  async search(query: SearchQuery): Promise<readonly SkillSummary[]> {
    this.assertOnline();
    const text = query.text.toLowerCase();
    const names = [...new Set(this.packages.map((pkg) => pkg.manifest.name))].sort();

    return names
      .filter((name) => text === '' || name.toLowerCase().includes(text))
      .map((name) => {
        const newest = this.newest(name)!;
        return {
          name,
          description: newest.manifest.description,
          keywords: newest.manifest.keywords,
          latest: newest.manifest.version,
          registry: this.name,
        };
      });
  }

  async has(name: string): Promise<boolean> {
    this.assertOnline();
    return this.packages.some((pkg) => pkg.manifest.name === name);
  }

  async versions(name: string): Promise<readonly IndexVersionEntry[]> {
    this.assertOnline();
    return this.packages
      .filter((pkg) => pkg.manifest.name === name)
      .map((pkg) => ({
        version: pkg.manifest.version,
        path: `skills/${name}`,
        deprecated: this.deprecated.has(`${name}@${pkg.manifest.version}`),
      }))
      .sort((a, b) => (a.version < b.version ? 1 : -1));
  }

  async manifest(name: string, version: SemanticVersion): Promise<SkillManifest> {
    return this.require(name, version).manifest;
  }

  async fetch(name: string, version: SemanticVersion): Promise<FetchedPackage> {
    this.fetches.push(`${name}@${version}`);
    const pkg = this.require(name, version);
    return {
      pkg,
      registry: this.name,
      resolved: `fake://${this.name}/${name}@${version}`,
      integrity: `${INTEGRITY_PREFIX}${name}-${version}`,
    };
  }

  private newest(name: string): SkillPackage | undefined {
    return this.packages
      .filter((pkg) => pkg.manifest.name === name)
      .sort((a, b) => (a.manifest.version < b.manifest.version ? 1 : -1))[0];
  }

  private require(name: string, version: SemanticVersion): SkillPackage {
    const found = this.packages.find(
      (pkg) => pkg.manifest.name === name && pkg.manifest.version === version,
    );
    if (found === undefined) {
      throw new AgentSkillsError(
        ErrorCode.VERSION_NOT_FOUND,
        `${name}@${version} not in ${this.name}`,
      );
    }
    return found;
  }

  private assertOnline(): void {
    if (this.offline) {
      throw new AgentSkillsError(
        ErrorCode.REGISTRY_UNAVAILABLE,
        `Registry "${this.name}" is offline`,
      );
    }
  }
}
