import {
  IssueCollector,
  SKILL_ENTRYPOINT,
  detectionFrom,
  encodeText,
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
import { stringify as stringifyYaml } from 'yaml';
import { join } from 'node:path';

export const CODEX_AGENT_ID = 'codex';

/** Codex resolves its home from this variable, falling back to `~/.codex`. */
const CODEX_HOME_ENV = 'CODEX_HOME';
const DEFAULT_HOME_DIRNAME = '.codex';
const SKILLS_DIRNAME = 'skills';

/**
 * Project-scope location.
 *
 * `.agents/skills/` is the vendor-neutral repository convention Codex's own plugin tooling
 * emits, as opposed to `$CODEX_HOME/skills` which is strictly the user-global location. It is
 * the least firmly established of the four paths this project hardcodes, which is exactly why
 * it is overridable through `agents.codex.projectRoot` in config (DESIGN.md §11).
 */
const PROJECT_DIRNAME = '.agents';

/** UI metadata Codex reads from `agents/openai.yaml`. */
const INTERFACE_KEY = 'interface';
const OPENAI_METADATA_PATH = 'agents/openai.yaml';

const KNOWN_INTERFACE_KEYS = new Set([
  'display_name',
  'short_description',
  'default_prompt',
  'icon_small',
  'icon_large',
]);

/**
 * OpenAI Codex.
 *
 * Layout:
 *   global   $CODEX_HOME/skills/<name>/   (default ~/.codex/skills/<name>/)
 *   project  <project>/.agents/skills/<name>/
 *
 * Codex agrees with Claude on `SKILL.md` + frontmatter, and adds two things this adapter
 * synthesises: `metadata.short-description`, and an optional `agents/openai.yaml` describing
 * how the skill appears in the Codex UI. Both are derived from neutral manifest fields, so a
 * skill author never has to know Codex exists.
 */
export class CodexAdapter implements AgentAdapter {
  readonly id = CODEX_AGENT_ID;
  readonly displayName = 'Codex';
  readonly aliases = ['codex', 'openai-codex'];

  /** The single presentation-only escape hatch this adapter honours (DESIGN.md §3.4). */
  readonly overrideKeys: readonly string[] = [INTERFACE_KEY];

  async detect(ctx: DetectionContext): Promise<AgentDetection> {
    const environment = ctx.env.env();
    const evidence: DetectionEvidence[] = [];

    const home = environment[CODEX_HOME_ENV] ?? join(ctx.env.homeDir(), DEFAULT_HOME_DIRNAME);
    if (await ctx.fs.exists(home)) {
      evidence.push({ strength: 'strong', kind: 'config-dir', detail: home });
    }

    const executable = await ctx.commands.which('codex');
    if (executable !== undefined) {
      evidence.push({ strength: 'strong', kind: 'executable', detail: executable });
    }

    const projectDir = join(ctx.env.cwd(), PROJECT_DIRNAME, SKILLS_DIRNAME);
    if (await ctx.fs.exists(projectDir)) {
      evidence.push({ strength: 'weak', kind: 'project-dir', detail: projectDir });
    }

    return detectionFrom(this.id, evidence);
  }

  locationFor(
    kind: PackageKind,
    scope: InstallScope,
    ctx: LocationContext,
  ): AgentLocation | undefined {
    // Codex's custom-prompt directory has not been verified against the binary the way the
    // skills path was, so this adapter declares no home for commands rather than guessing one
    // and writing where Codex may never look (docs/adding-an-agent.md).
    if (kind !== 'skill') return undefined;

    const shape = { shape: 'directory', extension: '' } as const;
    if (ctx.overrideRoot !== undefined) return { root: ctx.overrideRoot, ...shape };

    if (scope === 'project') {
      if (ctx.projectRoot === undefined) {
        throw new Error('Codex project scope requires a project root');
      }
      return { root: join(ctx.projectRoot, PROJECT_DIRNAME, SKILLS_DIRNAME), ...shape };
    }

    const home = ctx.env[CODEX_HOME_ENV] ?? join(ctx.homeDir, DEFAULT_HOME_DIRNAME);
    return { root: join(home, SKILLS_DIRNAME), ...shape };
  }

  layoutFor(pkg: SkillPackage): AgentLayout {
    const { manifest, document } = pkg;

    const frontmatter: Record<string, unknown> = {
      name: manifest.name,
      description: manifest.description,
    };

    // Codex uses `metadata.short-description` in compact listings. Preserve an author-written
    // one; otherwise derive a first-sentence summary rather than repeating the full text.
    const existingMetadata = document.frontmatter['metadata'];
    const metadata: Record<string, unknown> =
      existingMetadata !== null &&
      typeof existingMetadata === 'object' &&
      !Array.isArray(existingMetadata)
        ? { ...(existingMetadata as Record<string, unknown>) }
        : {};
    if (metadata['short-description'] === undefined) {
      metadata['short-description'] = shortDescription(manifest.description);
    }
    frontmatter['metadata'] = metadata;

    const entries: LayoutEntry[] = [
      {
        path: SKILL_ENTRYPOINT,
        content: encodeText(stringifySkillDocument({ frontmatter, body: document.body })),
      },
    ];

    for (const file of pkg.files) {
      if (file.path === SKILL_ENTRYPOINT) continue;
      if (file.path === OPENAI_METADATA_PATH) continue; // regenerated below
      entries.push({ path: file.path, copyFrom: file.path });
    }

    entries.push({
      path: OPENAI_METADATA_PATH,
      content: encodeText(this.interfaceDocument(pkg)),
    });

    return { entries, frontmatter };
  }

  validate(pkg: SkillPackage): readonly ValidationIssue[] {
    const issues = new IssueCollector();
    const override = pkg.manifest.agentOverrides[this.id]?.[INTERFACE_KEY];

    if (override !== undefined) {
      if (override === null || typeof override !== 'object' || Array.isArray(override)) {
        issues.error(
          'codex.interface.type',
          `agentOverrides.codex.${INTERFACE_KEY}`,
          'The Codex "interface" override must be a mapping',
        );
      } else {
        for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
          if (!KNOWN_INTERFACE_KEYS.has(key)) {
            issues.error(
              'codex.interface.unknownKey',
              `agentOverrides.codex.${INTERFACE_KEY}.${key}`,
              `Codex does not recognise the interface key "${key}"`,
              `Accepted: ${[...KNOWN_INTERFACE_KEYS].join(', ')}`,
            );
            continue;
          }
          if (typeof value !== 'string') {
            issues.error(
              'codex.interface.valueType',
              `agentOverrides.codex.${INTERFACE_KEY}.${key}`,
              `"${key}" must be a string`,
            );
          }
        }
      }
    }

    // The icon keys reference files that must actually ship, or the Codex UI shows a gap.
    const iconKeys = ['icon_small', 'icon_large'];
    const declared = (override ?? {}) as Record<string, unknown>;
    for (const key of iconKeys) {
      const value = declared[key];
      if (typeof value !== 'string') continue;
      const relative = value.replace(/^\.\//, '');
      if (!pkg.files.some((file) => file.path === relative)) {
        issues.warn(
          'codex.interface.missingIcon',
          `agentOverrides.codex.${INTERFACE_KEY}.${key}`,
          `"${value}" is not shipped in this package`,
          'Add the file, or add its directory to the "files" list in skill.yaml',
        );
      }
    }

    return issues.all();
  }

  private interfaceDocument(pkg: SkillPackage): string {
    const { manifest } = pkg;
    const override = (manifest.agentOverrides[this.id]?.[INTERFACE_KEY] ?? {}) as Record<
      string,
      unknown
    >;

    const iface: Record<string, unknown> = {
      display_name: override['display_name'] ?? titleCase(manifest.name),
      short_description: override['short_description'] ?? shortDescription(manifest.description),
    };
    for (const key of ['default_prompt', 'icon_small', 'icon_large']) {
      if (typeof override[key] === 'string') iface[key] = override[key];
    }

    return stringifyYaml({ [INTERFACE_KEY]: iface }, { lineWidth: 100 });
  }
}

const SHORT_DESCRIPTION_LIMIT = 160;

/** First sentence, capped at a word boundary so compact listings stay readable. */
function shortDescription(description: string): string {
  const collapsed = description.replace(/\s+/g, ' ').trim();
  const firstSentence = /^(.+?[.!?])(\s|$)/.exec(collapsed)?.[1] ?? collapsed;
  if (firstSentence.length <= SHORT_DESCRIPTION_LIMIT) return firstSentence;

  const clipped = firstSentence.slice(0, SHORT_DESCRIPTION_LIMIT - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  // Cutting mid-word reads as corruption rather than as an abbreviation.
  return `${(lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).replace(/[,;:]$/, '')}…`;
}

function titleCase(name: string): string {
  return name
    .split('-')
    .map((part) => (part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join(' ');
}
