import {
  AgentSkillsError,
  ErrorCode,
  isSemanticVersion,
  parseVersion,
  type CommandRunner,
  type Environment,
  type FileSystem,
  type HttpClient,
  type SemanticVersion,
  type ToolUpdateAction,
  type ToolUpdater,
} from '@jvm-expert/core';

export const TOOL_PACKAGE = '@jvm-expert/agent-skills';
export const TOOL_VERSION_URL = 'https://registry.npmjs.org/@jvm-expert%2fagent-skills/latest';

interface Options {
  readonly fs: FileSystem;
  readonly env: Environment;
  readonly commands: CommandRunner;
  readonly http: HttpClient;
  readonly packageDirectory: string;
  readonly nodeExecutable: string;
}

/** npm metadata is data only. Neither commands nor executable paths come from the response. */
export class NpmToolUpdater implements ToolUpdater {
  private readonly options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  async latestVersion(): Promise<SemanticVersion | undefined> {
    const response = await this.options.http.get(TOOL_VERSION_URL, {
      timeoutMs: 2000,
      maxBytes: 256 * 1024,
    });
    if (response.status !== 200) return undefined;
    const raw: unknown = JSON.parse(new TextDecoder().decode(response.body));
    if (raw === null || typeof raw !== 'object') return undefined;
    const version = (raw as Record<string, unknown>)['version'];
    // Automatic notices target stable releases, even if a publisher mis-tags a prerelease.
    if (
      typeof version !== 'string' ||
      !/^\d+\.\d+\.\d+(?:\+[\w.-]+)?$/.test(version) ||
      !isSemanticVersion(version)
    )
      return undefined;
    return parseVersion(version);
  }

  async action(version: SemanticVersion): Promise<ToolUpdateAction> {
    // Revalidate even cached metadata at the execution boundary.
    if (!/^\d+\.\d+\.\d+(?:\+[\w.-]+)?$/.test(version) || !isSemanticVersion(version)) {
      throw new AgentSkillsError(ErrorCode.INVALID_VERSION, 'Invalid CLI update version');
    }
    const { fs, env, commands, packageDirectory, nodeExecutable } = this.options;
    const directory = await fs.realpath(packageDirectory);
    const normalized = directory.replace(/\\/g, '/');
    if (normalized.includes('/_npx/')) return { label: `npx ${TOOL_PACKAGE}@${version} <command>` };
    const manual = {
      label:
        'Update this installation with its original package manager, then restart agent-skills.',
    };
    if (
      fs.basename(directory) !== 'agent-skills' ||
      fs.basename(fs.dirname(directory)) !== '@jvm-expert'
    )
      return manual;
    const modules = fs.dirname(fs.dirname(directory));
    if (fs.basename(modules) !== 'node_modules' || /\/(?:\.pnpm|\.yarn|\.bun)\//.test(normalized))
      return manual;

    const npm = await commands.which('npm');
    if (npm === undefined) return manual;
    let executable = npm;
    let prefix: string[] = [];
    const realNpm = await fs.realpath(npm);
    const script = /\.(?:cmd|bat)$/i.test(npm)
      ? fs.join(fs.dirname(npm), 'node_modules', 'npm', 'bin', 'npm-cli.js')
      : realNpm;
    if (script.endsWith('.js') && (await fs.exists(script))) {
      executable = nodeExecutable;
      prefix = [script];
    } else if (/\.(?:cmd|bat)$/i.test(npm)) return manual;

    const root = await commands.run(executable, [...prefix, 'root', '--global'], {
      cwd: env.homeDir(),
      timeoutMs: 2000,
    });
    const globalRoot = root.stdout.trim();
    const isGlobal =
      root.code === 0 &&
      fs.isAbsolute(globalRoot) &&
      (await fs.exists(globalRoot)) &&
      (await fs.realpath(globalRoot)) === (await fs.realpath(modules));
    const cwd = isGlobal ? env.homeDir() : fs.dirname(modules);
    let saveFlag: string[] = [];
    if (!isGlobal) {
      // A local update may edit a manifest/lockfile. Require evidence that npm owns it and
      // that the CLI is a direct dependency, rather than converting a transitive install.
      for (const lock of ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']) {
        if (await fs.exists(fs.join(cwd, lock))) return manual;
      }
      if (!(await fs.exists(fs.join(cwd, 'package-lock.json')))) return manual;
      const pkg = JSON.parse(await fs.readTextFile(fs.join(cwd, 'package.json'))) as Record<
        string,
        Record<string, unknown> | undefined
      >;
      if (typeof pkg['devDependencies']?.[TOOL_PACKAGE] === 'string') saveFlag = ['--save-dev'];
      else if (typeof pkg['optionalDependencies']?.[TOOL_PACKAGE] === 'string')
        saveFlag = ['--save-optional'];
      else if (typeof pkg['dependencies']?.[TOOL_PACKAGE] !== 'string') return manual;
    }
    const args = ['install', ...(isGlobal ? ['--global'] : saveFlag), `${TOOL_PACKAGE}@${version}`];
    return {
      label: `npm ${args.join(' ')}${isGlobal ? '' : ` (in ${cwd})`}`,
      run: () => commands.run(executable, [...prefix, ...args], { cwd, timeoutMs: 300_000 }),
    };
  }
}
