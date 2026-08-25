import {
  AgentSkillsError,
  CreateSkill,
  ErrorCode,
  ExitCode,
  PACKAGE_KINDS,
  PublishSkill,
  stringifyRegistryIndex,
  validateDirectory,
  type ApplicationContext,
  type Hasher,
  type PackageKind,
  type PublishReport,
  type ValidateDirectoryResult,
} from '@jvm-expert/core';
import {
  glyph,
  heading,
  info,
  json,
  out,
  plural,
  renderIssues,
  style,
  success,
  warn,
} from '../ui.ts';
import type { GlobalOptions } from '../options.ts';

export interface CreateCommandOptions extends GlobalOptions {
  readonly kind?: string;
  readonly description?: string;
  readonly license?: string;
  readonly author?: string;
  readonly directory?: string;
}

export async function runCreate(
  ctx: ApplicationContext,
  name: string,
  options: CreateCommandOptions,
): Promise<void> {
  const report = await new CreateSkill(ctx).execute({
    name,
    kind: parseKind(options.kind),
    ...(options.directory === undefined ? {} : { directory: options.directory }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.license === undefined ? {} : { license: options.license }),
    ...(options.author === undefined ? {} : { author: options.author }),
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
  });

  if (options.json === true) {
    json(report);
    return;
  }

  heading(report.dryRun ? `Dry run — would create ${report.name}` : `Created ${report.name}`);
  out(`  ${style.dim(report.directory)}`);
  out();
  for (const file of report.files) out(`  ${style.green(glyph.ok)} ${file}`);
  if (report.kind === 'skill') {
    out(`  ${style.green(glyph.ok)} examples/`);
    out(`  ${style.green(glyph.ok)} scripts/`);
  }
  out();
  out(style.bold('  Next'));
  if (report.kind === 'command') {
    out(
      `    1. Write the prompt in ${style.cyan('COMMAND.md')} — it runs when /${report.name} is typed`,
    );
  } else if (report.kind === 'workflow') {
    out(
      `    1. Write the script in ${style.cyan('WORKFLOW.js')} — phase(), agent(), parallel(), log()`,
    );
  } else {
    out(`    1. Write the skill in ${style.cyan('SKILL.md')} — purpose, workflow, rules`);
  }
  out(
    report.kind === 'workflow'
      ? `    2. Sharpen the ${style.cyan('description')}: it is what search and info show`
      : `    2. Sharpen the ${style.cyan('description')}: agents route on it alone`,
  );
  out(`    3. ${style.cyan(`agent-skills validate ${report.name}`)}`);
  out(
    `    4. ${style.cyan(`agent-skills install ./${report.name} --agent all`)} to try it locally`,
  );
  out();
}

function parseKind(value: string | undefined): PackageKind {
  if (value === undefined) return 'skill';
  if ((PACKAGE_KINDS as readonly string[]).includes(value)) return value as PackageKind;
  throw new AgentSkillsError(ErrorCode.USAGE, `Unknown package kind "${value}"`, {
    hints: [`--kind accepts: ${PACKAGE_KINDS.join(', ')}`],
    data: { kind: value },
  });
}

export interface ValidateCommandOptions extends GlobalOptions {
  readonly strict?: boolean;
}

/** Returns the process exit code, so `validate` can fail CI without throwing. */
export async function runValidate(
  ctx: ApplicationContext,
  target: string,
  options: ValidateCommandOptions,
): Promise<number> {
  const report = await validateDirectory(ctx, target, {
    ...(options.strict === undefined ? {} : { strict: options.strict }),
  });

  if (options.json === true) {
    json({
      ok: report.ok,
      directory: report.directory,
      name: report.pkg.manifest.name,
      version: report.pkg.manifest.version,
      issues: report.issues,
    });
    return report.ok ? ExitCode.OK : ExitCode.VALIDATION;
  }

  render(report);
  return report.ok ? ExitCode.OK : ExitCode.VALIDATION;
}

function render(report: ValidateDirectoryResult): void {
  const { manifest } = report.pkg;
  heading(`${manifest.name}@${manifest.version}`);
  out(`  ${style.dim(report.directory)}`);
  out(`  ${style.dim(plural(report.pkg.files.length, 'file'))}`);
  out();

  if (report.issues.length === 0) {
    success('Valid — no issues found');
    out();
    return;
  }

  renderIssues(report.issues);
  out();

  if (report.ok) {
    success(`Valid, with ${plural(report.warnings.length, 'warning')}`);
  } else {
    out(
      `${style.red(glyph.fail)} ${plural(report.errors.length, 'error')}, ${plural(report.warnings.length, 'warning')}`,
    );
  }
  out();
}

export interface PublishCommandOptions extends GlobalOptions {
  readonly directory?: string;
}

export async function runPublish(
  ctx: ApplicationContext,
  hasher: Hasher,
  target: string | undefined,
  options: PublishCommandOptions,
): Promise<void> {
  const report = await new PublishSkill(ctx, hasher).execute({
    ...(target === undefined ? {} : { directory: target }),
    ...(options.registry === undefined ? {} : { registry: options.registry }),
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
  });

  if (options.json === true) {
    json(report);
    return;
  }

  render_publish(report);
}

function render_publish(report: PublishReport): void {
  heading(`Ready to publish ${report.name}@${report.version}`);
  out(`  ${style.dim(report.directory)}`);
  out(`  ${style.dim(plural(report.files.length, 'file'))}`);
  out(`  ${style.dim(report.integrity)}`);

  if (report.warnings.length > 0) {
    out();
    for (const warning of report.warnings) warn(warning);
  }

  out();
  out(style.bold('  Add this to the registry index (registry/skills.yaml):'));
  out();
  for (const line of stringifyRegistryIndex({
    schemaVersion: 1,
    name: report.registry ?? 'official',
    skills: [report.skillEntry],
  })
    .trimEnd()
    .split('\n')) {
    out(`    ${style.dim(line)}`);
  }

  out();
  out(style.bold('  Then'));
  out(
    `    1. Copy the package to ${style.cyan(`skills/${report.name}/`)} in the registry repository`,
  );
  out(`    2. Merge the entry above into ${style.cyan('registry/skills.yaml')}`);
  out(`    3. Open a pull request`);
  out();
  info('Publishing goes through review because a skill becomes instructions an agent follows.');
  out();
}
