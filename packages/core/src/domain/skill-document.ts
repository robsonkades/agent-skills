import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { AgentSkillsError, ErrorCode } from './errors.ts';

/**
 * `SKILL.md` is the agent-facing entrypoint: YAML frontmatter plus a Markdown body.
 * Both Claude Code and Codex require `name` and `description` and ignore the rest, which
 * is why the neutral format keeps distribution metadata in `skill.yaml` instead
 * (DESIGN.md §3.1).
 */
export interface SkillDocument {
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly body: string;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseSkillDocument(text: string, source = 'SKILL.md'): SkillDocument {
  // A BOM before `---` would otherwise defeat the delimiter match.
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const match = FRONTMATTER_PATTERN.exec(normalized);

  if (match === null) {
    throw new AgentSkillsError(ErrorCode.INVALID_PACKAGE, `${source} has no YAML frontmatter`, {
      details: ['The file must start with a --- delimited YAML block.'],
      hints: [
        'Example:',
        '---',
        'name: my-skill',
        'description: What it does and when to use it.',
        '---',
      ],
      data: { source },
    });
  }

  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(match[1] ?? '');
  } catch (cause) {
    throw new AgentSkillsError(
      ErrorCode.INVALID_PACKAGE,
      `${source} has invalid frontmatter YAML`,
      {
        details: [cause instanceof Error ? cause.message : String(cause)],
        cause,
        data: { source },
      },
    );
  }

  if (frontmatter === null || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new AgentSkillsError(
      ErrorCode.INVALID_PACKAGE,
      `${source} frontmatter must be a mapping`,
      {
        data: { source },
      },
    );
  }

  return {
    frontmatter: frontmatter as Record<string, unknown>,
    body: normalized.slice(match[0].length),
  };
}

export function stringifySkillDocument(doc: SkillDocument): string {
  const yaml = stringifyYaml(doc.frontmatter, { lineWidth: 100, singleQuote: false }).trimEnd();
  const body = doc.body.startsWith('\n') ? doc.body.slice(1) : doc.body;
  return `---\n${yaml}\n---\n\n${body.trimStart()}`;
}

/** Reads the frontmatter `name`, which must agree with the manifest and directory name. */
export function documentName(doc: SkillDocument): string | undefined {
  const name = doc.frontmatter['name'];
  return typeof name === 'string' ? name.trim() : undefined;
}

export function documentDescription(doc: SkillDocument): string | undefined {
  const description = doc.frontmatter['description'];
  return typeof description === 'string' ? description.trim() : undefined;
}

export function documentVersion(doc: SkillDocument): string | undefined {
  const version = doc.frontmatter['version'];
  return typeof version === 'string' ? version.trim() : undefined;
}
