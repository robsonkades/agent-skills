import { INSTALL_SCOPES, type AgentDetection } from '../domain/agent.ts';
import { isAgentSkillsError } from '../domain/errors.ts';
import { targetsFor, detectAgents } from './agent-selection.ts';
import type { ApplicationContext } from './context.ts';
import { findProjectRoot } from './workspace.ts';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface DiagnosticCheck {
  readonly status: CheckStatus;
  readonly title: string;
  readonly detail?: string;
  /** Extra lines shown indented under the check. */
  readonly notes?: readonly string[];
  readonly hint?: string;
}

export interface DiagnosticSection {
  readonly title: string;
  readonly checks: readonly DiagnosticCheck[];
}

export interface DoctorReport {
  readonly sections: readonly DiagnosticSection[];
  readonly ok: boolean;
  readonly failures: number;
  readonly warnings: number;
}

export interface DoctorOptions {
  readonly startDir?: string;
  /** Skip network calls, for offline diagnosis. */
  readonly offline?: boolean;
}

/**
 * `doctor` exists to answer "why did that not work?" without the user reading source.
 *
 * Every check reports *what it looked at*, not just a verdict, because the common failures
 * here are environmental — an agent installed somewhere unusual, a read-only directory, a
 * registry behind a proxy — and a bare red cross does not help with any of them.
 */
export class DiagnoseSystem {
  private readonly ctx: ApplicationContext;

  constructor(ctx: ApplicationContext) {
    this.ctx = ctx;
  }

  async execute(options: DoctorOptions = {}): Promise<DoctorReport> {
    const projectRoot = await findProjectRoot(
      this.ctx.fs,
      options.startDir ?? this.ctx.env.cwd(),
      this.ctx.env.homeDir(),
    );
    const detections = await detectAgents(this.ctx);

    const sections: DiagnosticSection[] = [
      this.environmentSection(projectRoot),
      await this.registrySection(options.offline === true),
      ...(await this.agentSections(detections, projectRoot)),
      await this.installationsSection(projectRoot),
    ];

    const checks = sections.flatMap((section) => section.checks);
    const failures = checks.filter((check) => check.status === 'fail').length;
    const warnings = checks.filter((check) => check.status === 'warn').length;

    return { sections, ok: failures === 0, failures, warnings };
  }

  private environmentSection(projectRoot: string | undefined): DiagnosticSection {
    const nodeVersion = typeof process === 'undefined' ? 'unknown' : process.version;
    return {
      title: 'Environment',
      checks: [
        { status: 'ok', title: 'CLI', detail: this.ctx.toolVersion },
        { status: 'ok', title: 'Node', detail: nodeVersion },
        { status: 'ok', title: 'Platform', detail: this.ctx.env.platform() },
        { status: 'ok', title: 'Home', detail: this.ctx.env.homeDir() },
        projectRoot === undefined
          ? {
              status: 'skip',
              title: 'Project',
              detail: 'not inside a project',
              hint: 'Project-scoped commands need a directory with .git, skills.lock or an agent directory',
            }
          : { status: 'ok', title: 'Project', detail: projectRoot },
      ],
    };
  }

  private async registrySection(offline: boolean): Promise<DiagnosticSection> {
    const members = this.ctx.registry.members();

    if (members.length === 0) {
      return {
        title: 'Registries',
        checks: [
          {
            status: 'fail',
            title: 'No registries configured',
            hint: 'agent-skills registry add official <url>',
          },
        ],
      };
    }

    const checks: DiagnosticCheck[] = [];
    for (const [index, registry] of members.entries()) {
      const precedence = `#${index + 1}`;
      if (offline) {
        checks.push({
          status: 'skip',
          title: `${registry.name} ${precedence}`,
          detail: `${registry.kind} (offline, not contacted)`,
        });
        continue;
      }
      try {
        await registry.refresh();
        const results = await registry.search({ text: '', limit: 1000 });
        checks.push({
          status: registry.trusted ? 'ok' : 'warn',
          title: `${registry.name} ${precedence}`,
          detail: `${registry.kind} · ${results.length} skill${results.length === 1 ? '' : 's'}${
            registry.trusted ? '' : ' · marked untrusted'
          }`,
        });
      } catch (error) {
        checks.push({
          status: 'fail',
          title: `${registry.name} ${precedence}`,
          detail: isAgentSkillsError(error) ? error.message : String(error),
          hint: 'Check the URL and your network access, then re-run',
        });
      }
    }

    return { title: 'Registries', checks };
  }

  private async agentSections(
    detections: readonly AgentDetection[],
    projectRoot: string | undefined,
  ): Promise<readonly DiagnosticSection[]> {
    const sections: DiagnosticSection[] = [];

    for (const adapter of this.ctx.agents.all()) {
      const detection = detections.find((item) => item.agentId === adapter.id);
      const enabled = this.ctx.config.agents[adapter.id]?.enabled !== false;
      const checks: DiagnosticCheck[] = [];

      checks.push({
        status:
          detection?.installed === true ? 'ok' : detection?.strength === 'weak' ? 'warn' : 'skip',
        title: 'Detected',
        detail:
          detection === undefined
            ? 'detection failed'
            : detection.installed
              ? `yes${detection.version === undefined ? '' : ` (${detection.version})`}`
              : detection.strength === 'weak'
                ? 'weak evidence only'
                : 'no',
        notes: detection?.evidence.map((item) => `${item.kind}: ${item.detail}`) ?? [],
        ...(detection?.installed === true
          ? {}
          : { hint: `Use --agent ${adapter.aliases[0] ?? adapter.id} to target it anyway` }),
      });

      if (!enabled) {
        checks.push({
          status: 'warn',
          title: 'Enabled',
          detail: 'disabled in config',
          hint: `Set agents.${adapter.id}.enabled to true in ${this.ctx.env.homeDir()}`,
        });
      }

      for (const scope of INSTALL_SCOPES) {
        if (scope === 'project' && projectRoot === undefined) continue;
        for (const target of targetsFor(this.ctx, adapter, scope, projectRoot)) {
          checks.push(await this.directoryCheck(`${scope} ${target.kind} directory`, target.root));
        }
      }

      sections.push({ title: adapter.displayName, checks });
    }

    return sections;
  }

  private async directoryCheck(title: string, path: string): Promise<DiagnosticCheck> {
    try {
      if (!(await this.ctx.fs.exists(path))) {
        return {
          status: 'skip',
          title,
          detail: `${path} (does not exist yet)`,
          hint: 'It is created on first install',
        };
      }
      const stat = await this.ctx.fs.lstat(path);
      if (stat.isSymbolicLink) {
        const target = await this.ctx.fs.readlink(path).catch(() => '(unreadable)');
        const broken = !(await this.ctx.fs.exists(path).catch(() => false));
        return {
          status: broken ? 'fail' : 'warn',
          title,
          detail: `${path} -> ${target}${broken ? ' (broken link)' : ' (symlink)'}`,
          ...(broken ? { hint: 'Repair or remove the link before installing' } : {}),
        };
      }
      if (!stat.isDirectory) {
        return { status: 'fail', title, detail: `${path} exists but is not a directory` };
      }
      if (!(await this.ctx.fs.isWritable(path))) {
        return {
          status: 'fail',
          title,
          detail: `${path} is not writable`,
          hint: 'Fix the permissions, or install into a different scope',
        };
      }
      return { status: 'ok', title, detail: path };
    } catch (error) {
      return {
        status: 'fail',
        title,
        detail: `${path}: ${isAgentSkillsError(error) ? error.message : String(error)}`,
      };
    }
  }

  /** Reads every install receipt and reports drift, corruption and unmanaged directories. */
  private async installationsSection(projectRoot: string | undefined): Promise<DiagnosticSection> {
    const checks: DiagnosticCheck[] = [];
    let managed = 0;
    let modified = 0;
    let unmanaged = 0;

    for (const adapter of this.ctx.agents.all()) {
      for (const scope of INSTALL_SCOPES) {
        if (scope === 'project' && projectRoot === undefined) continue;

        for (const target of targetsFor(this.ctx, adapter, scope, projectRoot)) {
          let skills;
          try {
            skills = await this.ctx.installer.list(target);
          } catch (error) {
            checks.push({
              status: 'fail',
              title: `${adapter.displayName} ${scope} ${target.kind} metadata`,
              detail: isAgentSkillsError(error) ? error.message : String(error),
            });
            continue;
          }

          for (const skill of skills) {
            if (skill.unmanaged) {
              unmanaged += 1;
              continue;
            }
            managed += 1;
            if (skill.modified) {
              modified += 1;
              checks.push({
                status: 'warn',
                title: `${skill.name} (${adapter.id}, ${scope}, ${target.kind})`,
                detail: 'files changed since installation',
                hint: `agent-skills install ${skill.name} --force   to restore, or leave it if the edits are intentional`,
              });
            }
          }
        }
      }
    }

    checks.unshift({
      status: 'ok',
      title: 'Installed package metadata',
      detail: `${managed} managed · ${modified} modified · ${unmanaged} not managed by agent-skills`,
    });

    return { title: 'Installations', checks };
  }
}
