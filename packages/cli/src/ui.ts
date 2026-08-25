import colors from 'picocolors';
import { isAgentSkillsError, type ValidationIssue } from '@jvm-expert/core';

/**
 * Terminal presentation.
 *
 * Kept apart from the commands so that every command can be read as "call a service, hand the
 * result to a renderer" — and so `--json` is a different renderer rather than a branch
 * threaded through business logic.
 */

let colorEnabled = true;
let quiet = false;

export function configureUi(options: { color?: boolean; quiet?: boolean }): void {
  if (options.color !== undefined) colorEnabled = options.color;
  if (options.quiet !== undefined) quiet = options.quiet;
}

function paint(fn: (value: string) => string, value: string): string {
  return colorEnabled ? fn(value) : value;
}

export const style = {
  bold: (value: string) => paint(colors.bold, value),
  dim: (value: string) => paint(colors.dim, value),
  green: (value: string) => paint(colors.green, value),
  yellow: (value: string) => paint(colors.yellow, value),
  red: (value: string) => paint(colors.red, value),
  cyan: (value: string) => paint(colors.cyan, value),
  magenta: (value: string) => paint(colors.magenta, value),
};

// ASCII fallbacks: Windows consoles in legacy code pages render box-drawing glyphs as noise.
const unicode = process.platform !== 'win32' || process.env['WT_SESSION'] !== undefined;

export const glyph = {
  ok: unicode ? '✓' : '+',
  warn: unicode ? '!' : '!',
  fail: unicode ? '✗' : 'x',
  skip: unicode ? '-' : '-',
  arrow: unicode ? '→' : '->',
  bullet: unicode ? '•' : '*',
};

export function out(line = ''): void {
  if (!quiet) process.stdout.write(`${line}\n`);
}

/** Always printed, even under `--quiet`: this is the answer the user asked for. */
export function result(line = ''): void {
  process.stdout.write(`${line}\n`);
}

export function json(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function heading(text: string): void {
  out();
  out(style.bold(text));
  out();
}

export function success(text: string): void {
  out(`${style.green(glyph.ok)} ${text}`);
}

export function warn(text: string): void {
  out(`${style.yellow(glyph.warn)} ${text}`);
}

export function info(text: string): void {
  out(`${style.dim(glyph.bullet)} ${text}`);
}

/**
 * Renders an error as headline, cause, and next action.
 *
 * Every failure in this tool is supposed to leave the user knowing what to do next, so the
 * `Try:` block is part of the format rather than an optional extra.
 */
export function renderError(error: unknown, verbose: boolean): void {
  const stream = process.stderr;

  if (!isAgentSkillsError(error)) {
    stream.write(
      `${style.red('error')}  ${error instanceof Error ? error.message : String(error)}\n`,
    );
    if (verbose && error instanceof Error && error.stack !== undefined) {
      stream.write(`\n${style.dim(error.stack)}\n`);
    }
    return;
  }

  stream.write(`\n${style.red('error')}  ${style.bold(error.message)}\n`);

  if (error.details.length > 0) {
    stream.write('\n');
    for (const line of error.details) stream.write(`  ${line}\n`);
  }

  if (error.hints.length > 0) {
    stream.write(`\n  ${style.bold('Try:')}\n`);
    for (const hint of error.hints) stream.write(`    ${style.cyan(hint)}\n`);
  }

  stream.write(`\n  ${style.dim(`code: ${error.code}`)}\n\n`);

  if (verbose && error.cause !== undefined) {
    stream.write(`${style.dim('caused by:')}\n`);
    stream.write(
      `${style.dim(String(error.cause instanceof Error ? (error.cause.stack ?? error.cause.message) : error.cause))}\n\n`,
    );
  }
}

export function renderIssues(issues: readonly ValidationIssue[]): void {
  for (const issue of issues) {
    const marker =
      issue.severity === 'error'
        ? style.red(glyph.fail)
        : issue.severity === 'warning'
          ? style.yellow(glyph.warn)
          : style.dim(glyph.bullet);

    out(`  ${marker} ${style.bold(issue.at)}  ${issue.message}`);
    if (issue.hint !== undefined) out(`      ${style.dim(issue.hint)}`);
    out(`      ${style.dim(issue.rule)}`);
  }
}

/** Left-aligned columns. Simpler and more predictable than wrapping in a narrow terminal. */
export function table(rows: readonly (readonly string[])[], indent = '  '): void {
  if (rows.length === 0) return;

  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, stripAnsi(cell).length);
    });
  }

  for (const row of rows) {
    const line = row
      .map((cell, index) =>
        index === row.length - 1
          ? cell
          : cell + ' '.repeat((widths[index] ?? 0) - stripAnsi(cell).length),
      )
      .join('  ');
    out(indent + line.trimEnd());
  }
}

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
