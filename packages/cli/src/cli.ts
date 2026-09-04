import { Command, CommanderError } from 'commander';
import { ExitCode, exitCodeFor } from '@jvm-expert/core';
import { createContainer } from './container.ts';
import { configureUi, renderError } from './ui.ts';
import { collect, type GlobalOptions } from './options.ts';
import { runInstall } from './commands/install.ts';
import { runUninstall, runUpdate } from './commands/lifecycle.ts';
import { runInfo, runList, runSearch } from './commands/discovery.ts';
import { runCreate, runPublish, runValidate } from './commands/authoring.ts';
import {
  runAgents,
  runDoctor,
  runRegistryAdd,
  runRegistryList,
  runRegistryRemove,
} from './commands/system.ts';

/** Kept equal to packages/cli/package.json by a test; the two ship as one artefact. */
export const VERSION = '1.4.0';

const DESCRIPTION = `Install, update and publish AI coding-agent skills.

Skills are installed into every detected agent by default. Use --agent to pick one,
--agent all for every known agent, and --project to install into the current repository
instead of your user configuration.`;

const EXAMPLES = `
Examples:
  $ agent-skills install java-performance
  $ agent-skills install java-performance --agent codex
  $ agent-skills install java-performance@1.2.0 --project
  $ agent-skills search jvm
  $ agent-skills info java-performance
  $ agent-skills update
  $ agent-skills doctor

Documentation: https://github.com/robsonkades/agent-skills`;

/**
 * Builds the command tree.
 *
 * Every action does the same three things: read options, call an application service, hand
 * the result to a renderer. Anything more than that in here would be business logic escaping
 * into the presentation layer.
 */
export async function run(argv: readonly string[]): Promise<number> {
  const program = new Command();
  let exitCode: number = ExitCode.OK;

  program
    .name('agent-skills')
    .description(DESCRIPTION)
    .version(VERSION, '-V, --version', 'Print the CLI version')
    .addHelpText('after', EXAMPLES)
    .option('--json', 'Machine-readable output')
    .option('-v, --verbose', 'Verbose logging')
    .option('-q, --quiet', 'Only print results')
    .option('--no-color', 'Disable coloured output')
    .option('--allow-insecure', 'Permit plain-HTTP registries (development only)')
    .showHelpAfterError()
    // Without this, commander exits the process itself and our exit-code mapping never runs.
    .exitOverride()
    .configureOutput({
      outputError: (message, write) => write(message),
    });

  /** Options every install-shaped command shares. */
  const withTargeting = (command: Command): Command =>
    command
      .option('-a, --agent <id...>', 'Target agent: claude, codex, or all', collect)
      .option('-g, --global', "Install into the user's agent configuration")
      .option('-p, --project', 'Install into the current project')
      .option('--project-root <path>', 'Project directory (implies --project)')
      .option('--dry-run', 'Show what would happen without writing anything');

  withTargeting(
    program
      .command('install')
      .alias('i')
      .argument('<skill...>', 'Skills to install, e.g. java-performance or java-performance@1.2.0')
      .description('Install one or more skills')
      .option('-r, --registry <name>', 'Restrict resolution to one configured registry')
      .option('-f, --force', 'Replace an install whose files were modified')
      .option('--no-deps', 'Skip transitive dependencies'),
  ).action(async (refs: string[], options: GlobalOptions & { force?: boolean; deps?: boolean }) => {
    const context = await boot(program, options);
    // Commander maps `--no-deps` to `deps: false`.
    await runInstall(context.ctx, refs, {
      ...merge(program, options),
      ...(options.deps === false ? { noDeps: true } : {}),
    });
  });

  withTargeting(
    program
      .command('uninstall')
      .alias('remove')
      .argument('<skill...>', 'Skills to remove')
      .description('Remove skills that agent-skills installed')
      .option('-f, --force', 'Delete files even if they were modified after installation'),
  ).action(async (names: string[], options: GlobalOptions) => {
    const context = await boot(program, options);
    await runUninstall(context.ctx, names, merge(program, options));
  });

  withTargeting(
    program
      .command('update')
      .argument('[skill...]', 'Skills to update. Omit to update everything installed')
      .description('Update installed skills to the newest compatible version')
      .option('-r, --registry <name>', 'Restrict resolution to one configured registry')
      .option('--major', 'Allow updates that cross a major version')
      .option('-f, --force', 'Replace installs whose files were modified'),
  ).action(async (names: string[], options: GlobalOptions) => {
    const context = await boot(program, options);
    await runUpdate(context.ctx, names, merge(program, options));
  });

  program
    .command('list')
    .alias('ls')
    .description('List installed skills')
    .option('-a, --agent <id...>', 'Only this agent', collect)
    .option('-g, --global', 'Only global installs')
    .option('-p, --project', 'Only project installs')
    .option('--project-root <path>', 'Project directory')
    .action(async (options: GlobalOptions) => {
      const context = await boot(program, options);
      await runList(context.ctx, merge(program, options));
    });

  program
    .command('search')
    .argument('<query>', 'Text to search for')
    .description('Search the configured registries')
    .option('-r, --registry <name>', 'Search only this registry')
    .option('-n, --limit <count>', 'Maximum results', '25')
    .action(async (query: string, options: GlobalOptions & { limit?: string }) => {
      const context = await boot(program, options);
      await runSearch(context.ctx, query, merge(program, options));
    });

  program
    .command('info')
    .alias('show')
    .argument('<skill>', 'Skill name, optionally with @version')
    .description('Show a skill’s metadata, versions and install state')
    .option('-r, --registry <name>', 'Look only in this registry')
    .action(async (ref: string, options: GlobalOptions) => {
      const context = await boot(program, options);
      await runInfo(context.ctx, ref, merge(program, options));
    });

  program
    .command('validate')
    .argument('[path]', 'Skill package directory', '.')
    .description('Validate a skill package')
    .option('--strict', 'Treat unknown manifest fields as errors')
    .action(async (target: string, options: GlobalOptions & { strict?: boolean }) => {
      const context = await boot(program, options);
      exitCode = await runValidate(context.ctx, target, merge(program, options));
    });

  program
    .command('create')
    .alias('new')
    .argument('<name>', 'Package name, e.g. java-performance')
    .description('Scaffold a new skill or command package')
    .option('-k, --kind <kind>', 'Package kind: skill, command or workflow', 'skill')
    .option('-d, --directory <path>', 'Parent directory (default: current directory)')
    .option('--description <text>', 'Initial description')
    .option('--license <spdx>', 'SPDX licence identifier', 'Apache-2.0')
    .option('--author <name>', 'Author name')
    .option('--dry-run', 'Show what would be created')
    .action(async (name: string, options: GlobalOptions) => {
      const context = await boot(program, options);
      await runCreate(context.ctx, name, merge(program, options));
    });

  program
    .command('publish')
    .argument('[path]', 'Skill package directory', '.')
    .description('Validate a package and emit its registry entry')
    .option('-r, --registry <name>', 'Registry the version is destined for')
    .action(async (target: string, options: GlobalOptions) => {
      const context = await boot(program, options);
      await runPublish(context.ctx, context.hasher, target, merge(program, options));
    });

  program
    .command('doctor')
    .description('Diagnose the installation, agents and registries')
    .option('--offline', 'Skip registry connectivity checks')
    .action(async (options: GlobalOptions & { offline?: boolean }) => {
      const context = await boot(program, options);
      exitCode = await runDoctor(context.ctx, merge(program, options));
    });

  program
    .command('agents')
    .description('Show which coding agents were detected')
    .action(async (options: GlobalOptions) => {
      const context = await boot(program, options);
      await runAgents(context.ctx, merge(program, options));
    });

  const registry = program.command('registry').description('Manage skill registries');

  registry
    .command('list')
    .alias('ls')
    .description('List configured registries in precedence order')
    .action(async (options: GlobalOptions) => {
      const context = await boot(program, options);
      await runRegistryList(context.ctx, merge(program, options));
    });

  registry
    .command('add')
    .argument('<name>', 'Short name, e.g. company')
    .argument('<url>', 'Git URL, HTTPS index URL, or local path')
    .description('Add a registry')
    .option('--kind <kind>', 'local, git or http (inferred from the URL by default)')
    .option('--ref <ref>', 'Git branch or tag')
    .option('--first', 'Give it precedence over existing registries')
    .option('--untrusted', 'Mark the registry as untrusted')
    .action(async (name: string, url: string, options: GlobalOptions) => {
      const context = await boot(program, options);
      await runRegistryAdd(context.ctx, context.configStore, name, url, merge(program, options));
    });

  registry
    .command('remove')
    .alias('rm')
    .argument('<name>', 'Registry name')
    .description('Remove a registry')
    .action(async (name: string, options: GlobalOptions) => {
      const context = await boot(program, options);
      await runRegistryRemove(context.configStore, name, merge(program, options));
    });

  try {
    await program.parseAsync([...argv], { from: 'user' });
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      // `--help` and `--version` arrive here as "errors"; they are successful exits.
      return error.exitCode === 0 ? ExitCode.OK : ExitCode.USAGE;
    }
    renderError(error, program.opts()['verbose'] === true);
    return exitCodeFor(error);
  }
}

/** Merges root-level flags into the command's own options, so `--json` works anywhere. */
function merge<T extends object>(program: Command, options: T): T & GlobalOptions {
  const root = program.opts();
  return {
    ...options,
    json: (options as GlobalOptions).json ?? root['json'] === true,
    verbose: (options as GlobalOptions).verbose ?? root['verbose'] === true,
    quiet: (options as GlobalOptions).quiet ?? root['quiet'] === true,
  };
}

async function boot(program: Command, options: GlobalOptions) {
  const root = program.opts();
  const verbose = options.verbose === true || root['verbose'] === true;
  const quiet = options.quiet === true || root['quiet'] === true;
  const wantsJson = options.json === true || root['json'] === true;

  configureUi({
    // NO_COLOR is respected without a flag; --no-color and non-TTY output also disable it.
    color:
      root['color'] !== false &&
      process.env['NO_COLOR'] === undefined &&
      process.stdout.isTTY === true,
    quiet: quiet || wantsJson,
  });

  return createContainer({
    version: VERSION,
    logLevel: verbose ? 'debug' : quiet ? 'error' : 'info',
    allowInsecure: root['allowInsecure'] === true,
  });
}
