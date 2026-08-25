import {
  IssueCollector,
  MANIFEST_FILENAME,
  detectionFrom,
  readTextFile,
  encodeText,
  entrypointFor,
  stringifySkillDocument,
  type AgentAdapter,
  type AgentDetection,
  type AgentLayout,
  type AgentLocation,
  type DetectionContext,
  type DetectionEvidence,
  type InstallScope,
  type LayoutEntry,
  type LocationContext,
  type PackageKind,
  type SkillPackage,
  type ValidationIssue,
} from '@jvm-expert/core';
import { join } from 'node:path';

export const CLAUDE_CODE_AGENT_ID = 'claude-code';

/** Claude Code reads this itself; honouring it is how a relocated config keeps working. */
const CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR';
const DEFAULT_CONFIG_DIRNAME = '.claude';
const SKILLS_DIRNAME = 'skills';
const COMMANDS_DIRNAME = 'commands';
const WORKFLOWS_DIRNAME = 'workflows';

/**
 * Claude Code compiles a workflow script and refuses these outright: they break run resume,
 * which is the whole point of the deterministic script model. Catching them at validate time
 * turns a runtime compile failure into a publish-time error.
 */
const NONDETERMINISTIC = /\b(?:Date\.now\s*\(|Math\.random\s*\(|new\s+Date\s*\()/;

// eslint-disable-next-line no-control-regex
const DISALLOWED_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

/**
 * Frontmatter keys Claude Code reads on a slash command. `name` is not among them: the file
 * name is the command name, which is why a command installs as `<name>.md` rather than as a
 * directory.
 */
const COMMAND_KEYS = ['argument-hint', 'allowed-tools', 'model', 'disable-model-invocation'];

/** Behavioural keys a skill author set are Claude's own, and are preserved verbatim. */
const SKILL_KEYS = ['allowed-tools', 'user-invocable', 'disable-model-invocation'];

const SHAPES: Readonly<Record<PackageKind, Pick<AgentLocation, 'shape' | 'extension'>>> = {
  skill: { shape: 'directory', extension: '' },
  command: { shape: 'file', extension: '.md' },
  workflow: { shape: 'file', extension: '.js' },
};

const DIRNAMES: Readonly<Record<PackageKind, string>> = {
  skill: SKILLS_DIRNAME,
  command: COMMANDS_DIRNAME,
  workflow: WORKFLOWS_DIRNAME,
};

/**
 * Claude Code.
 *
 * Layout:
 *   global   $CLAUDE_CONFIG_DIR/skills/<name>/     (default ~/.claude/skills/<name>/)
 *   project  <project>/.claude/skills/<name>/
 *   global   $CLAUDE_CONFIG_DIR/commands/<name>.md
 *   project  <project>/.claude/commands/<name>.md
 *
 * Claude Code reads `SKILL.md` frontmatter and ignores unknown keys, so the projection is
 * close to a pass-through. The adapter's real job is deciding *which* frontmatter keys to
 * forward — distribution metadata stays in `skill.yaml`, where the agent never looks.
 *
 * `node:path` is used for OS path algebra, which is pure computation. All I/O goes through
 * the ports in {@link DetectionContext}.
 */
export class ClaudeCodeAdapter implements AgentAdapter {
  readonly id = CLAUDE_CODE_AGENT_ID;
  readonly displayName = 'Claude Code';
  readonly aliases = ['claude', 'claude-code'];

  /**
   * Claude has no vendor metadata file, so it accepts no overrides. Declaring an empty list
   * rather than omitting the concept makes `agentOverrides.claude-code` a validation error
   * instead of a silently ignored key.
   */
  readonly overrideKeys: readonly string[] = [];

  async detect(ctx: DetectionContext): Promise<AgentDetection> {
    const environment = ctx.env.env();
    const evidence: DetectionEvidence[] = [];

    const configDir =
      environment[CONFIG_DIR_ENV] ?? join(ctx.env.homeDir(), DEFAULT_CONFIG_DIRNAME);
    if (await ctx.fs.exists(configDir)) {
      evidence.push({ strength: 'strong', kind: 'config-dir', detail: configDir });
    }

    const executable = await ctx.commands.which('claude');
    if (executable !== undefined) {
      evidence.push({ strength: 'strong', kind: 'executable', detail: executable });
    }

    // A `.claude/` directory in a repository is weak evidence: it may have been committed by
    // a colleague who uses Claude Code even though this machine does not have it.
    const projectDir = join(ctx.env.cwd(), DEFAULT_CONFIG_DIRNAME);
    if (await ctx.fs.exists(projectDir)) {
      evidence.push({ strength: 'weak', kind: 'project-dir', detail: projectDir });
    }

    return detectionFrom(this.id, evidence);
  }

  locationFor(kind: PackageKind, scope: InstallScope, ctx: LocationContext): AgentLocation {
    // A skill is a directory Claude Code loads on demand. A command and a workflow are each a
    // single file whose name is how they are invoked, so neither can sit in a directory of
    // its own.
    const shape = SHAPES[kind];

    if (ctx.overrideRoot !== undefined) return { root: ctx.overrideRoot, ...shape };

    const dirname = DIRNAMES[kind];

    if (scope === 'project') {
      if (ctx.projectRoot === undefined) {
        throw new Error('Claude Code project scope requires a project root');
      }
      return { root: join(ctx.projectRoot, DEFAULT_CONFIG_DIRNAME, dirname), ...shape };
    }

    const configDir = ctx.env[CONFIG_DIR_ENV] ?? join(ctx.homeDir, DEFAULT_CONFIG_DIRNAME);
    return { root: join(configDir, dirname), ...shape };
  }

  layoutFor(pkg: SkillPackage): AgentLayout {
    const { manifest, document } = pkg;
    const entrypoint = entrypointFor(manifest.kind);

    // A workflow ships as source Claude Code compiles: `meta` must stay the first statement
    // and the bytes must stay the bytes, so this is a copy, not a projection.
    if (manifest.kind === 'workflow') {
      return {
        entries: [{ path: entrypoint, copyFrom: entrypoint }],
        frontmatter: document.frontmatter,
      };
    }

    const frontmatter: Record<string, unknown> = { description: manifest.description };
    if (manifest.kind === 'skill') {
      frontmatter['name'] = manifest.name;
      if (manifest.license !== undefined) frontmatter['license'] = manifest.license;
    }

    for (const key of manifest.kind === 'command' ? COMMAND_KEYS : SKILL_KEYS) {
      if (document.frontmatter[key] !== undefined) frontmatter[key] = document.frontmatter[key];
    }

    const entries: LayoutEntry[] = [
      {
        path: entrypoint,
        content: encodeText(stringifySkillDocument({ frontmatter, body: document.body })),
      },
    ];

    // A command is a single file: the rest of the package has nowhere to go, which
    // `validate` warns about before an install can drop it silently.
    if (SHAPES[manifest.kind].shape === 'directory') {
      for (const file of pkg.files) {
        if (file.path === entrypoint) continue;
        entries.push({ path: file.path, copyFrom: file.path });
      }
    }

    return { entries, frontmatter };
  }

  validate(pkg: SkillPackage): readonly ValidationIssue[] {
    const issues = new IssueCollector();
    const entrypoint = entrypointFor(pkg.manifest.kind);

    if (pkg.manifest.kind === 'workflow') {
      issues.absorb(this.workflowIssues(pkg, entrypoint));
    }

    if (SHAPES[pkg.manifest.kind].shape === 'file') {
      const extra = pkg.files.filter(
        (file) => file.path !== entrypoint && file.path !== MANIFEST_FILENAME,
      );
      if (extra.length > 0) {
        issues.warn(
          'claude.command.extraFiles',
          entrypoint,
          `A Claude Code ${pkg.manifest.kind} installs as a single ${entrypoint} file; ${extra.length} other file(s) will not be installed`,
          `Move the material into the ${entrypoint} body, or publish it as a skill instead`,
        );
      }
    }

    // Claude Code shows the description during skill selection; an overlong one is truncated
    // there, which quietly degrades routing rather than failing loudly.
    if (pkg.manifest.kind === 'skill' && pkg.manifest.description.length > 1024) {
      issues.warn(
        'claude.description.long',
        'description',
        `Description is ${pkg.manifest.description.length} characters; Claude Code shows roughly the first 1024`,
        'Move the detail into the SKILL.md body',
      );
    }

    const allowedTools =
      pkg.manifest.kind === 'workflow' ? undefined : pkg.document.frontmatter['allowed-tools'];
    if (
      allowedTools !== undefined &&
      !Array.isArray(allowedTools) &&
      typeof allowedTools !== 'string'
    ) {
      issues.error(
        'claude.allowedTools.type',
        `${entrypoint}.allowed-tools`,
        '"allowed-tools" must be a string or a list of strings',
      );
    }

    return issues.all();
  }

  /**
   * Rules Claude Code enforces when it compiles a workflow. Reporting them here turns a
   * failure the author would only see at run time into one `publish` refuses to ship.
   */
  private workflowIssues(pkg: SkillPackage, entrypoint: string): readonly ValidationIssue[] {
    const issues = new IssueCollector();
    const script = readTextFile(pkg, entrypoint) ?? '';

    const nondeterministic = NONDETERMINISTIC.exec(pkg.document.body);
    if (nondeterministic !== null) {
      issues.error(
        'claude.workflow.nondeterministic',
        entrypoint,
        `Workflow scripts must be deterministic; "${nondeterministic[0].trim()}" is unavailable`,
        'Claude Code needs determinism to resume a run — stamp results after the run instead',
      );
    }

    if (DISALLOWED_CONTROL.test(script)) {
      issues.error(
        'claude.workflow.controlCharacters',
        entrypoint,
        'The script contains control characters Claude Code refuses to compile',
      );
    }

    const phases = pkg.document.frontmatter['phases'];
    if (phases !== undefined) {
      const shaped =
        Array.isArray(phases) &&
        phases.every(
          (phase) =>
            phase !== null &&
            typeof phase === 'object' &&
            !Array.isArray(phase) &&
            typeof (phase as Record<string, unknown>)['title'] === 'string',
        );
      if (!shaped) {
        issues.error(
          'claude.workflow.phases',
          `${entrypoint}.meta.phases`,
          'meta.phases must be a list of { title, detail? } entries',
          'Use the same titles here as in the phase() calls; they are matched exactly',
        );
      }
    }

    return issues.all();
  }
}
