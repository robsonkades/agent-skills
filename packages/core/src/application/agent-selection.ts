import type {
  AgentDetection,
  AgentTarget,
  InstallScope,
  LocationContext,
} from '../domain/agent.ts';
import { DEFAULT_PACKAGE_KIND, PACKAGE_KINDS, type PackageKind } from '../domain/manifest.ts';
import { AgentSkillsError, ErrorCode } from '../domain/errors.ts';
import type { AgentAdapter, DetectionContext } from '../ports/agent-adapter.ts';
import type { ApplicationContext } from './context.ts';
import { findProjectRoot, requireProjectRoot } from './workspace.ts';

export const ALL_AGENTS = 'all';

export interface AgentSelectionOptions {
  /** Values from `--agent`. Empty means "auto-detect". `all` selects every known adapter. */
  readonly agents?: readonly string[];
  readonly scope: InstallScope;
  /** Explicit `--project-root`, else discovered. */
  readonly projectRoot?: string;
  /** Start directory for project discovery. Defaults to the process cwd. */
  readonly startDir?: string;
}

export interface AgentSelection {
  /** Every root the selected agents expose, one per agent and package kind. */
  readonly targets: readonly AgentTarget[];
  readonly adapters: readonly AgentAdapter[];
  readonly detections: readonly AgentDetection[];
  readonly scope: InstallScope;
  readonly projectRoot?: string;
}

/** Runs detection for every registered adapter, regardless of selection. Used by `doctor`. */
export function detectionContext(ctx: ApplicationContext): DetectionContext {
  return { env: ctx.env, fs: ctx.fs, commands: ctx.commands };
}

export async function detectAgents(ctx: ApplicationContext): Promise<readonly AgentDetection[]> {
  const detection = detectionContext(ctx);
  return Promise.all(ctx.agents.all().map((adapter) => adapter.detect(detection)));
}

/**
 * Turns `--agent` / `--global` / `--project` into concrete directories.
 *
 * Auto-detection deliberately requires *strong* evidence. A stray `.claude/` directory in a
 * repository is weak evidence: it is reported, but it never silently redirects an install to
 * an agent the user does not actually run.
 */
export async function selectAgents(
  ctx: ApplicationContext,
  options: AgentSelectionOptions,
): Promise<AgentSelection> {
  const requested = (options.agents ?? []).filter((value) => value.trim() !== '');
  const detections = await detectAgents(ctx);

  const adapters =
    requested.length === 0
      ? autoSelect(ctx, detections)
      : requested.includes(ALL_AGENTS)
        ? enabledAdapters(ctx)
        : resolveExplicit(ctx, requested);

  const projectRoot =
    options.scope === 'project'
      ? (options.projectRoot ??
        (await requireProjectRoot(ctx.fs, options.startDir ?? ctx.env.cwd(), ctx.env.homeDir())))
      : (options.projectRoot ??
        (await findProjectRoot(ctx.fs, options.startDir ?? ctx.env.cwd(), ctx.env.homeDir())));

  const targets = adapters.flatMap((adapter) =>
    targetsFor(ctx, adapter, options.scope, projectRoot),
  );

  return {
    targets,
    adapters,
    detections,
    scope: options.scope,
    ...(projectRoot === undefined ? {} : { projectRoot }),
  };
}

/**
 * Every root one agent exposes in a scope: one per package kind it supports.
 *
 * `list`, `uninstall` and `doctor` want all of them — a name the user gives could be a
 * skill or a command. `install` narrows to the kind of the package it is about to write.
 */
export function targetsFor(
  ctx: ApplicationContext,
  adapter: AgentAdapter,
  scope: InstallScope,
  projectRoot: string | undefined,
): readonly AgentTarget[] {
  const targets: AgentTarget[] = [];

  for (const kind of PACKAGE_KINDS) {
    const location = adapter.locationFor(
      kind,
      scope,
      locationContext(ctx, adapter, scope, projectRoot, kind),
    );
    if (location === undefined) continue;
    targets.push({
      agentId: adapter.id,
      displayName: adapter.displayName,
      scope,
      kind,
      ...location,
    });
  }

  return targets;
}

export function locationContext(
  ctx: ApplicationContext,
  adapter: AgentAdapter,
  scope: InstallScope,
  projectRoot: string | undefined,
  kind: PackageKind = DEFAULT_PACKAGE_KIND,
): LocationContext {
  const agentConfig = ctx.config.agents[adapter.id];
  // `globalRoot`/`projectRoot` name the *skills* root; other kinds keep the agent's own
  // convention rather than being redirected into a directory meant for skills.
  const overrideRoot =
    kind !== 'skill'
      ? undefined
      : scope === 'global'
        ? agentConfig?.globalRoot
        : agentConfig?.projectRoot;

  return {
    homeDir: ctx.env.homeDir(),
    env: ctx.env.env(),
    ...(projectRoot === undefined ? {} : { projectRoot }),
    ...(overrideRoot === undefined ? {} : { overrideRoot }),
  };
}

function enabledAdapters(ctx: ApplicationContext): readonly AgentAdapter[] {
  const enabled = ctx.agents
    .all()
    .filter((adapter) => ctx.config.agents[adapter.id]?.enabled !== false);
  if (enabled.length > 0) return enabled;
  throw new AgentSkillsError(
    ErrorCode.NO_AGENT_DETECTED,
    'Every known agent is disabled in config',
    {
      hints: ['Enable one in ~/.agent-skills/config.json under "agents"'],
    },
  );
}

function autoSelect(
  ctx: ApplicationContext,
  detections: readonly AgentDetection[],
): readonly AgentAdapter[] {
  const installed = detections.filter((detection) => detection.installed);
  const adapters = installed
    .map((detection) => ctx.agents.find(detection.agentId))
    .filter((adapter): adapter is AgentAdapter => adapter !== undefined)
    .filter((adapter) => ctx.config.agents[adapter.id]?.enabled !== false);

  if (adapters.length > 0) return adapters;

  const weak = detections.filter((detection) => detection.strength === 'weak');
  throw new AgentSkillsError(ErrorCode.NO_AGENT_DETECTED, 'No supported coding agents detected', {
    details: [
      '',
      'Supported agents:',
      ...ctx.agents
        .all()
        .map(
          (adapter) => `  - ${adapter.displayName} (--agent ${adapter.aliases[0] ?? adapter.id})`,
        ),
      ...(weak.length === 0
        ? []
        : [
            '',
            'Found weak evidence for:',
            ...weak.map(
              (detection) =>
                `  - ${detection.agentId}: ${detection.evidence.map((item) => item.detail).join(', ')}`,
            ),
          ]),
    ],
    hints: [
      'Use --agent to select one explicitly, e.g. --agent claude',
      'agent-skills doctor    to see what detection found',
    ],
    data: { detections },
  });
}

function resolveExplicit(
  ctx: ApplicationContext,
  requested: readonly string[],
): readonly AgentAdapter[] {
  const resolved: AgentAdapter[] = [];
  for (const value of requested) {
    const adapter = ctx.agents.find(value);
    if (adapter === undefined) {
      throw new AgentSkillsError(ErrorCode.UNKNOWN_AGENT, `Unknown agent "${value}"`, {
        details: [
          '',
          'Known agents:',
          ...ctx.agents
            .all()
            .map(
              (known) =>
                `  ${known.id}${known.aliases.length > 0 ? ` (${known.aliases.join(', ')})` : ''}`,
            ),
          `  ${ALL_AGENTS} — every known agent`,
        ],
        data: { requested: value, known: ctx.agents.ids() },
      });
    }
    if (!resolved.some((existing) => existing.id === adapter.id)) resolved.push(adapter);
  }
  return resolved;
}
