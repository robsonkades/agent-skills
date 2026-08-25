import {
  AgentSkillsError,
  DiagnoseSystem,
  ErrorCode,
  ExitCode,
  detectAgents,
  type ApplicationContext,
  type CheckStatus,
  type DoctorReport,
  type RegistryConfig,
} from '@jvm-expert/core';
import { inferKind, type FileConfigStore } from '@jvm-expert/node';
import { glyph, heading, info, json, out, plural, style, success, table, warn } from '../ui.ts';
import type { GlobalOptions } from '../options.ts';

export interface DoctorCommandOptions extends GlobalOptions {
  readonly offline?: boolean;
}

export async function runDoctor(
  ctx: ApplicationContext,
  options: DoctorCommandOptions,
): Promise<number> {
  const report = await new DiagnoseSystem(ctx).execute({
    ...(options.offline === undefined ? {} : { offline: options.offline }),
  });

  if (options.json === true) {
    json(report);
    return report.ok ? ExitCode.OK : ExitCode.FAILURE;
  }

  render(report);
  return report.ok ? ExitCode.OK : ExitCode.FAILURE;
}

function render(report: DoctorReport): void {
  out();
  out(style.bold('Agent Skills Doctor'));

  for (const section of report.sections) {
    out();
    out(`${style.bold(section.title)}`);
    for (const check of section.checks) {
      out(
        `  ${marker(check.status)} ${check.title}${check.detail === undefined ? '' : `  ${style.dim(check.detail)}`}`,
      );
      for (const note of check.notes ?? []) out(`      ${style.dim(note)}`);
      if (check.hint !== undefined) out(`      ${style.cyan(check.hint)}`);
    }
  }

  out();
  if (report.ok && report.warnings === 0) {
    success('Everything looks good.');
  } else if (report.ok) {
    warn(`${plural(report.warnings, 'warning')} — nothing is broken.`);
  } else {
    out(`${style.red(glyph.fail)} ${plural(report.failures, 'problem')} found.`);
  }
  out();
}

function marker(status: CheckStatus): string {
  switch (status) {
    case 'ok':
      return style.green(glyph.ok);
    case 'warn':
      return style.yellow(glyph.warn);
    case 'fail':
      return style.red(glyph.fail);
    default:
      return style.dim(glyph.skip);
  }
}

/**
 * `agent-skills agents` — what detection found, without the rest of doctor's output.
 * Answers "does this machine have Codex?" directly, which is the question people actually ask.
 */
export async function runAgents(ctx: ApplicationContext, options: GlobalOptions): Promise<void> {
  const detections = await detectAgents(ctx);

  if (options.json === true) {
    json(detections);
    return;
  }

  heading('Detecting agents...');

  for (const detection of detections) {
    const adapter = ctx.agents.find(detection.agentId);
    const label = adapter?.displayName ?? detection.agentId;

    if (detection.installed) {
      out(`${style.green(glyph.ok)} ${label} detected`);
    } else if (detection.strength === 'weak') {
      out(`${style.yellow(glyph.warn)} ${label} — weak evidence only`);
    } else {
      out(`${style.dim(glyph.skip)} ${style.dim(`${label} not detected`)}`);
    }
    for (const evidence of detection.evidence) {
      out(`    ${style.dim(`${evidence.kind}: ${evidence.detail}`)}`);
    }
  }

  const anyInstalled = detections.some((detection) => detection.installed);
  out();
  if (!anyInstalled) {
    out('No supported coding agents detected.');
    out();
    out('Supported agents:');
    for (const adapter of ctx.agents.all()) out(`- ${adapter.displayName}`);
    out();
    out('Use --agent to explicitly select an agent.');
    out();
  }
}

export interface RegistryCommandOptions extends GlobalOptions {
  readonly kind?: string;
  readonly ref?: string;
  readonly untrusted?: boolean;
  readonly first?: boolean;
}

export async function runRegistryList(
  ctx: ApplicationContext,
  options: GlobalOptions,
): Promise<void> {
  const registries = ctx.config.registries;

  if (options.json === true) {
    json(registries);
    return;
  }

  if (registries.length === 0) {
    heading('No registries configured');
    info('agent-skills registry add official https://github.com/robsonkades/agent-skills.git');
    return;
  }

  heading('Registries');
  out(
    `  ${style.dim('Earlier entries take precedence: the first registry publishing a name owns it.')}`,
  );
  out();
  table(
    registries.map((registry, index) => [
      style.dim(`${index + 1}.`),
      style.bold(registry.name),
      registry.kind,
      registry.url + (registry.ref === undefined ? '' : `#${registry.ref}`),
      registry.trusted ? '' : style.yellow('untrusted'),
    ]),
  );
  out();
}

export async function runRegistryAdd(
  ctx: ApplicationContext,
  store: FileConfigStore,
  name: string,
  url: string,
  options: RegistryCommandOptions,
): Promise<void> {
  const config = await store.load();

  if (config.registries.some((registry) => registry.name === name)) {
    throw new AgentSkillsError(
      ErrorCode.REGISTRY_DUPLICATE,
      `A registry named "${name}" already exists`,
      {
        hints: [`agent-skills registry remove ${name}   then add it again`],
        data: { name },
      },
    );
  }

  const entry: RegistryConfig = {
    name,
    url,
    kind: inferKind(options.kind, url),
    trusted: options.untrusted !== true,
    ...(options.ref === undefined ? {} : { ref: options.ref }),
  };

  // Precedence is list order, so where a registry lands is a real decision, not cosmetics.
  const registries =
    options.first === true ? [entry, ...config.registries] : [...config.registries, entry];
  await store.save({ ...config, registries });

  if (options.json === true) {
    json({ added: entry, registries });
    return;
  }

  success(`Added registry "${name}" (${entry.kind})`);
  out(`  ${style.dim(url)}`);
  out(
    `  ${style.dim(
      options.first === true
        ? 'Placed first: it now takes precedence over every other registry.'
        : 'Placed last: existing registries keep precedence for names they already publish.',
    )}`,
  );
  if (!entry.trusted) out(`  ${style.yellow('Marked untrusted; doctor will flag it.')}`);
  out();
  info(`Config: ${store.location()}`);
  void ctx;
}

export async function runRegistryRemove(
  store: FileConfigStore,
  name: string,
  options: GlobalOptions,
): Promise<void> {
  const config = await store.load();
  const registries = config.registries.filter((registry) => registry.name !== name);

  if (registries.length === config.registries.length) {
    throw new AgentSkillsError(ErrorCode.REGISTRY_NOT_FOUND, `No registry named "${name}"`, {
      details: ['', 'Configured:', ...config.registries.map((registry) => `  ${registry.name}`)],
      hints: ['agent-skills registry list'],
      data: { name },
    });
  }

  await store.save({ ...config, registries });

  if (options.json === true) {
    json({ removed: name, registries });
    return;
  }

  success(`Removed registry "${name}"`);
  if (registries.length === 0) {
    out();
    warn('No registries are configured; install and search will not find anything.');
  }
}
