import {
  AgentSkillsError,
  ErrorCode,
  findProjectRoot,
  type ApplicationContext,
  type InstallScope,
} from '@jvm-expert/core';

export interface GlobalOptions {
  readonly agent?: readonly string[];
  readonly global?: boolean;
  readonly project?: boolean;
  readonly projectRoot?: string;
  readonly registry?: string;
  readonly dryRun?: boolean;
  readonly json?: boolean;
  readonly verbose?: boolean;
  readonly quiet?: boolean;
}

/**
 * Decides between global and project scope.
 *
 * The default is deliberately contextual: inside a directory that already has a `skills.lock`
 * or an agent project directory, `install` almost always means "for this project", and making
 * the user type `--project` every time would be a papercut. Everywhere else the default is
 * global. Passing both flags is a usage error rather than a silent precedence rule.
 */
export async function resolveScope(
  ctx: ApplicationContext,
  options: GlobalOptions,
): Promise<InstallScope> {
  if (options.global === true && options.project === true) {
    throw new AgentSkillsError(ErrorCode.USAGE, 'Cannot use --global and --project together', {
      hints: ['Pick one: --global installs for your user, --project installs into this repository'],
    });
  }
  if (options.global === true) return 'global';
  if (options.project === true || options.projectRoot !== undefined) return 'project';

  const projectRoot = await findProjectRoot(ctx.fs, ctx.env.cwd(), ctx.env.homeDir());
  if (projectRoot === undefined) return 'global';

  for (const marker of ['skills.lock', '.claude/skills', '.agents/skills']) {
    if (await ctx.fs.exists(ctx.fs.join(projectRoot, ...marker.split('/')))) return 'project';
  }

  return 'global';
}

/** Commander collects repeatable options through this. */
export function collect(value: string, previous: readonly string[] = []): readonly string[] {
  return [
    ...previous,
    ...value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ];
}
