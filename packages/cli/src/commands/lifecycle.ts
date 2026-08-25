import {
  RemoveSkills,
  UpdateSkills,
  type ApplicationContext,
  type RemoveReport,
  type UpdateReport,
} from '@jvm-expert/core';
import { glyph, heading, info, json, out, plural, style, warn } from '../ui.ts';
import { resolveScope, type GlobalOptions } from '../options.ts';

export interface UninstallCommandOptions extends GlobalOptions {
  readonly force?: boolean;
}

export async function runUninstall(
  ctx: ApplicationContext,
  names: readonly string[],
  options: UninstallCommandOptions,
): Promise<void> {
  const scope = await resolveScope(ctx, options);

  const report = await new RemoveSkills(ctx).execute({
    names,
    scope,
    ...(options.agent === undefined ? {} : { agents: options.agent }),
    ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }),
    ...(options.force === undefined ? {} : { force: options.force }),
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
  });

  if (options.json === true) {
    json(toRemoveJson(report));
    return;
  }

  renderRemove(report);
}

function renderRemove(report: RemoveReport): void {
  heading(report.dryRun ? 'Dry run — nothing was removed' : 'Removed');

  for (const result of report.results) {
    const version = result.version === undefined ? '' : `@${result.version}`;
    out(
      `${style.green(glyph.ok)} ${style.bold(result.name)}${version}  ${style.cyan(result.agentId)}`,
    );
    out(`    ${style.dim(result.directory)}  ${style.dim(plural(result.removed.length, 'file'))}`);
    if (result.preserved.length > 0) {
      out(
        `    ${style.yellow(`${plural(result.preserved.length, 'file')} kept because they were modified`)}`,
      );
      for (const path of result.preserved) out(`      ${style.dim(path)}`);
    }
  }

  if (report.warnings.length > 0) {
    out();
    for (const warning of report.warnings) warn(warning);
  }

  if (report.lockfileUpdated) {
    out();
    info(`Updated skills.lock in ${report.projectRoot ?? '.'}`);
  }
}

function toRemoveJson(report: RemoveReport): unknown {
  return {
    scope: report.scope,
    projectRoot: report.projectRoot,
    dryRun: report.dryRun,
    lockfileUpdated: report.lockfileUpdated,
    removed: report.results.map((result) => ({
      name: result.name,
      version: result.version,
      agent: result.agentId,
      scope: result.scope,
      directory: result.directory,
      files: result.removed,
      preserved: result.preserved,
    })),
    warnings: report.warnings,
  };
}

export interface UpdateCommandOptions extends GlobalOptions {
  readonly major?: boolean;
  readonly force?: boolean;
}

export async function runUpdate(
  ctx: ApplicationContext,
  names: readonly string[],
  options: UpdateCommandOptions,
): Promise<void> {
  const scope = await resolveScope(ctx, options);

  const report = await new UpdateSkills(ctx).execute({
    names,
    scope,
    ...(options.agent === undefined ? {} : { agents: options.agent }),
    ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }),
    ...(options.registry === undefined ? {} : { registry: options.registry }),
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
    ...(options.major === undefined ? {} : { major: options.major }),
    ...(options.force === undefined ? {} : { force: options.force }),
  });

  if (options.json === true) {
    json(toUpdateJson(report));
    return;
  }

  renderUpdate(report, options.major === true);
}

function renderUpdate(report: UpdateReport, major: boolean): void {
  const real = report.changes.filter((change) => change.bump !== 'same');

  if (real.length === 0) {
    heading('Up to date');
    info(`${plural(report.unchanged.length, 'skill')} already at the newest compatible version`);
    if (!major) {
      out();
      info('Updates that would cross a major version are held back; use --major to take them');
    }
    return;
  }

  heading(report.install.dryRun ? 'Dry run — available updates' : 'Updated');

  for (const change of real) {
    const colour =
      change.bump === 'major'
        ? style.yellow
        : change.bump === 'downgrade'
          ? style.red
          : style.green;
    out(
      `${colour(glyph.ok)} ${style.bold(change.name)}  ${change.from} ${glyph.arrow} ${change.to}  ${style.dim(`(${change.bump})`)}`,
    );
  }

  if (report.unchanged.length > 0) {
    out();
    info(`${plural(report.unchanged.length, 'skill')} already up to date`);
  }

  for (const warning of report.install.warnings) {
    out();
    warn(warning);
  }

  if (report.install.lockfileUpdated) {
    out();
    info('Updated skills.lock');
  }
}

function toUpdateJson(report: UpdateReport): unknown {
  return {
    changes: report.changes,
    unchanged: report.unchanged,
    dryRun: report.install.dryRun,
    lockfileUpdated: report.install.lockfileUpdated,
    warnings: report.install.warnings,
  };
}
