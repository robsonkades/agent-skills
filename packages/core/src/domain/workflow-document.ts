import { AgentSkillsError, ErrorCode } from './errors.ts';
import { parseJsLiteral, skipTrivia } from './js-literal.ts';
import type { SkillDocument } from './skill-document.ts';

/**
 * A workflow's entrypoint is JavaScript, not Markdown, so its identity lives in
 * `export const meta = { … }` rather than in YAML frontmatter.
 *
 * Reading it statically — never executing the script — is what lets `validate`, `search` and
 * `info` describe a workflow the same way they describe a skill. The result is deliberately a
 * {@link SkillDocument}: `meta` becomes the frontmatter and the script becomes the body, so
 * every rule downstream (name agreement, description required, version match) applies to all
 * package kinds without knowing which one it is looking at.
 *
 * The two constraints enforced here are Claude Code's own: the declaration must be the first
 * statement, and it must be a pure literal. A package this parser accepts is one the agent
 * can compile.
 */
export function parseWorkflowDocument(text: string, source = 'WORKFLOW.js'): SkillDocument {
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const start = skipTrivia(normalized, 0);

  const declaration = /^export\s+const\s+meta\s*=\s*/.exec(normalized.slice(start));
  if (declaration === null) {
    throw new AgentSkillsError(
      ErrorCode.INVALID_PACKAGE,
      `${source} does not begin with an "export const meta" declaration`,
      {
        details: ['It must be the first statement, before any other code.'],
        hints: [
          'Example:',
          'export const meta = {',
          "  name: 'ship-review',",
          "  description: 'What the workflow does.',",
          '};',
        ],
        data: { source },
      },
    );
  }

  const { value, end } = parseJsLiteral(
    normalized,
    start + declaration[0].length,
    `${source}: meta must be a pure literal`,
  );

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentSkillsError(ErrorCode.INVALID_PACKAGE, `${source}: meta must be an object`, {
      data: { source },
    });
  }

  return {
    frontmatter: value as Record<string, unknown>,
    body: normalized
      .slice(end)
      .replace(/^[;\s]*\n/, '')
      .trimStart(),
  };
}

/**
 * Renders a workflow document back to a script. Used by the scaffold; installs copy the
 * author's bytes verbatim rather than round-tripping, because reformatting someone's
 * JavaScript is not this tool's business.
 */
export function stringifyWorkflowDocument(doc: SkillDocument): string {
  return `export const meta = ${JSON.stringify(doc.frontmatter, null, 2)};\n\n${doc.body.trimStart()}`;
}
