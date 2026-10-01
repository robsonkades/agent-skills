import {
  RemoveSkills,
  UpdateSkills,
  type ApplicationContext,
  type InstallResult,
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
  readonly withSuggests?: boolean;
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
    ...(options.withSuggests === undefined ? {} : { withSuggests: options.withSuggests }),
  });

  if (options.json === true) {
    json(toUpdateJson(report));
    return;
  }

  renderUpdate(report, options.major === true);
}

function renderUpdate(report: UpdateReport, major: boolean): void {
  const real = report.changes.filter((change) => change.bump !== 'same');

  if (real.length === 0 && report.additions.length === 0) {
    heading('Up to date');
    info(`${plural(report.unchanged.length, 'skill')} already at the newest compatible version`);
    if (!major) {
      out();
      info('Updates that would cross a major version are held back; use --major to take them');
    }
    for (const warning of report.install.warnings) warn(warning);
    return;
  }

  heading(
    report.install.dryRun
      ? 'Dry run — update plan'
      : real.length === 0
        ? 'Additional skills'
        : real.some((change) =>
              report.install.results.some((result) => result.name === change.name),
            )
          ? 'Updated'
          : 'Update results',
  );

  for (const change of real) {
    const results = report.install.results.filter((result) => result.name === change.name);
    const skipped = results.length === 0;
    const resolved = report.install.resolved.find((skill) => skill.name === change.name);
    const origin = resolved === undefined ? '' : style.dim(`  from ${resolved.registry}`);
    const suggestion =
      resolved?.direct === false && resolved.suggestedBy?.length
        ? `; suggested by ${resolved.suggestedBy.join(', ')}`
        : '';
    const colour =
      skipped || change.bump === 'major'
        ? style.yellow
        : change.bump === 'downgrade'
          ? style.red
          : style.green;
    out(
      `${colour(skipped ? glyph.skip : glyph.ok)} ${style.bold(change.name)}  ${change.from} ${glyph.arrow} ${change.to}${origin}  ${style.dim(`(${skipped ? 'skipped; ' : ''}${change.bump}${suggestion})`)}`,
    );
    renderUpdateDestinations(results, report.install.dryRun);
  }

  for (const addition of report.additions) {
    const skipped = addition.results.length === 0;
    const outcome = skipped ? 'skipped' : report.install.dryRun ? 'would add' : 'added';
    const resolved = report.install.resolved.find((skill) => skill.name === addition.name);
    const origin = resolved === undefined ? '' : style.dim(`  from ${resolved.registry}`);
    const reason =
      resolved?.direct === true
        ? 'requested'
        : addition.suggestedBy.length > 0
          ? `suggested by ${addition.suggestedBy.join(', ')}`
          : 'dependency';
    const marker = skipped ? style.yellow(glyph.skip) : style.green(glyph.ok);
    out(
      `${marker} ${style.bold(addition.name)}@${addition.version}${origin}  ${style.dim(`(${outcome}; ${reason})`)}`,
    );
    renderUpdateDestinations(addition.results, report.install.dryRun);
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

function renderUpdateDestinations(results: readonly InstallResult[], dryRun: boolean): void {
  for (const result of results) {
    out(`    ${style.cyan(result.agentId)}  ${style.dim(dryRun ? 'planned' : result.outcome)}`);
    out(`      ${style.dim(result.directory)}  ${style.dim(plural(result.files.length, 'file'))}`);
  }
}

function toUpdateResultJson(result: InstallResult): unknown {
  return {
    agent: result.agentId,
    scope: result.scope,
    directory: result.directory,
    files: result.files,
    outcome: result.outcome,
  };
}

function toUpdateJson(report: UpdateReport): unknown {
  return {
    changes: report.changes.map((change) => {
      const results = report.install.results.filter((result) => result.name === change.name);
      const resolved = report.install.resolved.find((skill) => skill.name === change.name);
      return {
        ...change,
        registry: resolved?.registry,
        direct: resolved?.direct,
        suggestedBy: resolved?.suggestedBy ?? [],
        skipped: results.length === 0,
        results: results.map(toUpdateResultJson),
      };
    }),
    additions: report.additions.map((addition) => {
      const resolved = report.install.resolved.find((skill) => skill.name === addition.name);
      return {
        name: addition.name,
        version: addition.version,
        registry: resolved?.registry,
        direct: resolved?.direct,
        suggestedBy: addition.suggestedBy,
        skipped: addition.results.length === 0,
        results: addition.results.map(toUpdateResultJson),
      };
    }),
    unchanged: report.unchanged,
    dryRun: report.install.dryRun,
    lockfileUpdated: report.install.lockfileUpdated,
    warnings: report.install.warnings,
  };
}
