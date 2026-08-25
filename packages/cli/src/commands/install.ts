import {
  InstallSkills,
  type InstallReport,
  type InstallScope,
  type ApplicationContext,
} from '@jvm-expert/core';
import { glyph, heading, info, json, out, plural, style, table, warn } from '../ui.ts';
import type { GlobalOptions } from '../options.ts';
import { resolveScope } from '../options.ts';

export interface InstallCommandOptions extends GlobalOptions {
  readonly force?: boolean;
  readonly noDeps?: boolean;
}

export async function runInstall(
  ctx: ApplicationContext,
  refs: readonly string[],
  options: InstallCommandOptions,
): Promise<void> {
  const scope = await resolveScope(ctx, options);

  const report = await new InstallSkills(ctx).execute({
    refs,
    scope,
    ...(options.agent === undefined ? {} : { agents: options.agent }),
    ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }),
    ...(options.registry === undefined ? {} : { registry: options.registry }),
    ...(options.force === undefined ? {} : { force: options.force }),
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
    ...(options.noDeps === undefined ? {} : { skipDependencies: options.noDeps }),
  });

  if (options.json === true) {
    json(toJson(report));
    return;
  }

  render(report, scope);
}

function render(report: InstallReport, scope: InstallScope): void {
  if (report.results.length === 0) {
    warn('Nothing was installed.');
    for (const warning of report.warnings) info(warning);
    return;
  }

  heading(report.dryRun ? 'Dry run — nothing was written' : 'Installed');

  // Group by skill so a multi-agent install reads as one entry with two destinations rather
  // than as two unrelated lines.
  const byName = new Map<string, typeof report.results>();
  for (const result of report.results) {
    byName.set(result.name, [...(byName.get(result.name) ?? []), result]);
  }

  for (const [name, results] of byName) {
    const first = results[0]!;
    const resolved = report.resolved.find((skill) => skill.name === name);
    const label = `${style.bold(name)}@${first.version}`;
    const origin = resolved === undefined ? '' : style.dim(`  from ${resolved.registry}`);
    const transitive = resolved?.direct === false ? style.dim('  (dependency)') : '';

    out(`${style.green(glyph.ok)} ${label}${origin}${transitive}`);

    for (const result of results) {
      const change =
        result.outcome === 'upgraded' && result.previousVersion !== undefined
          ? style.dim(` (${result.previousVersion} ${glyph.arrow} ${result.version})`)
          : result.outcome === 'unchanged'
            ? style.dim(' (already up to date)')
            : '';
      out(`    ${style.cyan(result.agentId)}${change}`);
      out(
        `      ${style.dim(result.directory)}  ${style.dim(plural(result.files.length, 'file'))}`,
      );
    }
  }

  if (report.warnings.length > 0) {
    out();
    for (const warning of report.warnings) warn(warning);
  }

  out();
  if (report.lockfileUpdated) {
    info(`Updated skills.lock in ${report.projectRoot ?? '.'}`);
  } else if (scope === 'project' && !report.dryRun) {
    info('No lockfile changes');
  }
}

function toJson(report: InstallReport): unknown {
  return {
    scope: report.scope,
    projectRoot: report.projectRoot,
    dryRun: report.dryRun,
    lockfileUpdated: report.lockfileUpdated,
    resolved: report.resolved.map((skill) => ({
      name: skill.name,
      version: skill.version,
      registry: skill.registry,
      direct: skill.direct,
      requiredBy: skill.requiredBy,
    })),
    installed: report.results.map((result) => ({
      name: result.name,
      version: result.version,
      previousVersion: result.previousVersion,
      outcome: result.outcome,
      agent: result.agentId,
      scope: result.scope,
      directory: result.directory,
      files: result.files,
    })),
    warnings: report.warnings,
  };
}

export { table };
