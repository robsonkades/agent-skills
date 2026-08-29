import {
  DescribeSkill,
  ListInstalled,
  SearchSkills,
  type ApplicationContext,
  type ListReport,
  type SkillInfo,
  type SkillSummary,
} from '@jvm-expert/core';
import { glyph, heading, info, json, out, plural, style, table, warn } from '../ui.ts';
import type { GlobalOptions } from '../options.ts';

export async function runList(
  ctx: ApplicationContext,
  options: GlobalOptions & { all?: boolean },
): Promise<void> {
  const scope =
    options.global === true ? 'global' : options.project === true ? 'project' : undefined;

  const report = await new ListInstalled(ctx).execute({
    ...(options.agent === undefined ? {} : { agents: options.agent }),
    ...(scope === undefined ? {} : { scope }),
    ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }),
    includeUnmanaged: true,
  });

  if (options.json === true) {
    json({
      projectRoot: report.projectRoot,
      total: report.total,
      entries: report.entries.map((entry) => ({
        agent: entry.target.agentId,
        scope: entry.target.scope,
        kind: entry.target.kind,
        root: entry.target.root,
        skills: entry.skills,
      })),
    });
    return;
  }

  renderList(report);
}

function renderList(report: ListReport): void {
  const populated = report.entries.filter((entry) => entry.skills.length > 0);

  if (populated.length === 0) {
    heading('Nothing installed');
    info('agent-skills install <skill>   to install one');
    info('agent-skills search <query>    to find one');
    return;
  }

  for (const entry of populated) {
    // Both the kind and the scope are needed: one agent can have four populated roots.
    heading(
      `${entry.target.displayName}  ${style.dim(`(${entry.target.scope} ${entry.target.kind}s)`)}`,
    );
    out(`  ${style.dim(entry.target.root)}`);
    out();

    table(
      entry.skills.map((skill) => [
        skill.unmanaged ? style.dim(skill.name) : style.bold(skill.name),
        skill.unmanaged ? style.dim('—') : skill.version,
        skill.unmanaged
          ? style.dim('not managed by agent-skills')
          : skill.modified
            ? style.yellow('modified locally')
            : style.dim(skill.registry),
        skill.dependencyOf.length > 0
          ? style.dim(`dependency of ${skill.dependencyOf.join(', ')}`)
          : '',
      ]),
    );
  }

  out();
  info(
    plural(
      report.entries.reduce(
        (sum, entry) => sum + entry.skills.filter((s) => !s.unmanaged).length,
        0,
      ),
      'managed package',
    ),
  );
}

export async function runSearch(
  ctx: ApplicationContext,
  query: string,
  options: GlobalOptions & { limit?: string },
): Promise<void> {
  const limit = options.limit === undefined ? undefined : Number.parseInt(options.limit, 10);

  const results = await new SearchSkills(ctx).execute({
    query,
    ...(options.registry === undefined ? {} : { registry: options.registry }),
    ...(limit === undefined || Number.isNaN(limit) ? {} : { limit }),
  });

  if (options.json === true) {
    json(results);
    return;
  }

  renderSearch(results, query);
}

function renderSearch(results: readonly SkillSummary[], query: string): void {
  if (results.length === 0) {
    heading('No matches');
    info(`Nothing matched "${query}" in the configured registries`);
    info('agent-skills registry list   to see where the CLI is looking');
    return;
  }

  heading(`${plural(results.length, 'result')} for "${query}"`);

  for (const summary of results) {
    const shadow =
      summary.shadowedBy === undefined ? '' : style.yellow(`  shadowed by ${summary.shadowedBy}`);
    out(`${style.bold(summary.name)}@${summary.latest}  ${style.dim(summary.registry)}${shadow}`);
    if (summary.description !== '') out(`  ${truncate(summary.description, 100)}`);
    if (summary.keywords.length > 0) out(`  ${style.dim(summary.keywords.join(' · '))}`);
    out();
  }

  info('agent-skills info <skill>   for details');
}

export async function runInfo(
  ctx: ApplicationContext,
  ref: string,
  options: GlobalOptions,
): Promise<void> {
  const skill = await new DescribeSkill(ctx).execute(ref, {
    ...(options.registry === undefined ? {} : { registry: options.registry }),
  });

  if (options.json === true) {
    json({
      name: skill.name,
      registry: skill.registry,
      manifest: skill.manifest,
      versions: skill.versions,
      installed: skill.installed,
    });
    return;
  }

  renderInfo(skill);
}

function renderInfo(skill: SkillInfo): void {
  const { manifest } = skill;

  heading(`${manifest.name}@${manifest.version}`);
  out(`  ${manifest.description}`);
  out();

  const rows: string[][] = [
    ['registry', skill.registry],
    ['license', manifest.license ?? style.dim('not declared')],
  ];
  if (manifest.homepage !== undefined) rows.push(['homepage', manifest.homepage]);
  if (manifest.repository !== undefined) rows.push(['repository', manifest.repository.url]);
  if (manifest.authors.length > 0) {
    rows.push(['authors', manifest.authors.map((author) => author.name).join(', ')]);
  }
  if (manifest.keywords.length > 0) rows.push(['keywords', manifest.keywords.join(', ')]);
  rows.push([
    'agents',
    manifest.compatibility.length === 0
      ? style.dim('every agent')
      : manifest.compatibility
          .map(
            (entry) => `${entry.id}${entry.minVersion === undefined ? '' : ` ${entry.minVersion}`}`,
          )
          .join(', '),
  ]);
  if (manifest.capabilities.length > 0)
    rows.push(['capabilities', manifest.capabilities.join(', ')]);
  if (skill.latest.integrity !== undefined)
    rows.push(['integrity', style.dim(skill.latest.integrity)]);

  table(rows.map(([key, value]) => [style.dim(key!), value!]));

  if (manifest.dependencies.length > 0 || manifest.optionalDependencies.length > 0) {
    out();
    out(style.bold('  Dependencies'));
    table(
      [
        ...manifest.dependencies.map((dep) => [dep.name, dep.version, '']),
        ...manifest.optionalDependencies.map((dep) => [
          dep.name,
          dep.version,
          style.dim('optional'),
        ]),
      ],
      '    ',
    );
  }

  if (manifest.suggests.length > 0) {
    out();
    out(style.bold('  Suggests'));
    out(`    ${style.dim('named in this skill; not installed with it')}`);
    table(
      manifest.suggests.map((name) => [name]),
      '    ',
    );
  }

  out();
  out(style.bold('  Versions'));
  const shown = skill.versions.slice(0, 10);
  table(
    shown.map((entry) => [
      entry.version === manifest.version ? style.green(entry.version) : entry.version,
      entry.publishedAt === undefined ? '' : style.dim(entry.publishedAt.slice(0, 10)),
      entry.deprecated
        ? style.yellow(
            `deprecated${entry.deprecationReason === undefined ? '' : `: ${entry.deprecationReason}`}`,
          )
        : '',
    ]),
    '    ',
  );
  if (skill.versions.length > shown.length) {
    out(`    ${style.dim(`… and ${skill.versions.length - shown.length} more`)}`);
  }

  out();
  if (skill.installed.length === 0) {
    out(style.bold('  Not installed'));
    out(`    ${style.cyan(`agent-skills install ${manifest.name}`)}`);
  } else {
    out(style.bold('  Installed'));
    table(
      skill.installed.map((installed) => [
        `${installed.agentId} ${style.dim(`(${installed.scope})`)}`,
        installed.version === manifest.version
          ? style.green(installed.version)
          : style.yellow(`${installed.version} ${glyph.arrow} ${manifest.version} available`),
        style.dim(installed.directory),
      ]),
      '    ',
    );
  }
  out();
}

function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

export { warn };
