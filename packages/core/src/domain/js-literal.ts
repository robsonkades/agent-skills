import { AgentSkillsError, ErrorCode } from './errors.ts';

/**
 * A parser for JavaScript *literal* expressions — objects, arrays, strings, numbers,
 * booleans and null. Nothing else: no identifiers, no operators, no function calls.
 *
 * It exists so a workflow's `export const meta = { … }` can be read without executing the
 * script. Claude Code requires that literal to be pure ("no computed values") and parses it
 * the same way; refusing anything computable here is what keeps a package this project
 * accepts from being one the agent then rejects.
 *
 * Deliberately not a JSON parser: the source is JavaScript, so single quotes, unquoted keys,
 * trailing commas and comments all appear in practice and all have to be understood.
 */
export function parseJsLiteral(
  source: string,
  from: number,
  context: string,
): { value: unknown; end: number } {
  const cursor = { index: from };
  const value = readValue(source, cursor, context);
  return { value, end: cursor.index };
}

/**
 * Advances past whitespace and comments, so callers can require a declaration to be the
 * *first statement* without tripping over a licence header.
 */
export function skipTrivia(source: string, from: number): number {
  const cursor = { index: from };
  skipIgnorable(source, cursor);
  return cursor.index;
}

interface Cursor {
  index: number;
}

function fail(source: string, cursor: Cursor, context: string, what: string): never {
  const line = source.slice(0, cursor.index).split('\n').length;
  throw new AgentSkillsError(ErrorCode.INVALID_PACKAGE, `${context}: ${what}`, {
    details: [`At line ${line}.`],
    hints: ['The value must be a literal: no variables, calls, operators or template strings'],
    data: { context, line },
  });
}

function skipIgnorable(source: string, cursor: Cursor): void {
  for (;;) {
    while (cursor.index < source.length && /\s/.test(source[cursor.index]!)) cursor.index += 1;

    if (source.startsWith('//', cursor.index)) {
      const newline = source.indexOf('\n', cursor.index);
      cursor.index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith('/*', cursor.index)) {
      const close = source.indexOf('*/', cursor.index + 2);
      cursor.index = close === -1 ? source.length : close + 2;
      continue;
    }
    return;
  }
}

function readValue(source: string, cursor: Cursor, context: string): unknown {
  skipIgnorable(source, cursor);
  if (cursor.index >= source.length) fail(source, cursor, context, 'unexpected end of input');

  const char = source[cursor.index]!;
  if (char === '{') return readObject(source, cursor, context);
  if (char === '[') return readArray(source, cursor, context);
  if (char === "'" || char === '"') return readString(source, cursor, context);
  if (char === '`') {
    fail(source, cursor, context, 'template strings are not allowed; use a quoted string');
  }

  for (const [word, literal] of [
    ['true', true],
    ['false', false],
    ['null', null],
  ] as const) {
    if (
      source.startsWith(word, cursor.index) &&
      !isIdentifierChar(source[cursor.index + word.length])
    ) {
      cursor.index += word.length;
      return literal;
    }
  }

  return readNumber(source, cursor, context);
}

function readObject(source: string, cursor: Cursor, context: string): Record<string, unknown> {
  cursor.index += 1; // {
  const result: Record<string, unknown> = {};

  for (;;) {
    skipIgnorable(source, cursor);
    if (cursor.index >= source.length) fail(source, cursor, context, 'unterminated object');
    if (source[cursor.index] === '}') {
      cursor.index += 1;
      return result;
    }

    const key = readKey(source, cursor, context);
    skipIgnorable(source, cursor);
    if (source[cursor.index] !== ':') {
      // Shorthand (`{ name }`) reads a variable, which is exactly what "pure literal" forbids.
      fail(source, cursor, context, `property "${key}" has no value`);
    }
    cursor.index += 1;

    result[key] = readValue(source, cursor, context);

    skipIgnorable(source, cursor);
    if (source[cursor.index] === ',') {
      cursor.index += 1;
      continue;
    }
    if (source[cursor.index] === '}') {
      cursor.index += 1;
      return result;
    }
    fail(source, cursor, context, 'expected "," or "}" after a property');
  }
}

function readArray(source: string, cursor: Cursor, context: string): unknown[] {
  cursor.index += 1; // [
  const result: unknown[] = [];

  for (;;) {
    skipIgnorable(source, cursor);
    if (cursor.index >= source.length) fail(source, cursor, context, 'unterminated array');
    if (source[cursor.index] === ']') {
      cursor.index += 1;
      return result;
    }

    result.push(readValue(source, cursor, context));

    skipIgnorable(source, cursor);
    if (source[cursor.index] === ',') {
      cursor.index += 1;
      continue;
    }
    if (source[cursor.index] === ']') {
      cursor.index += 1;
      return result;
    }
    fail(source, cursor, context, 'expected "," or "]" after an element');
  }
}

function readKey(source: string, cursor: Cursor, context: string): string {
  const char = source[cursor.index];
  if (char === "'" || char === '"') return readString(source, cursor, context);

  const start = cursor.index;
  while (cursor.index < source.length && isIdentifierChar(source[cursor.index])) cursor.index += 1;
  if (cursor.index === start) fail(source, cursor, context, 'expected a property name');
  return source.slice(start, cursor.index);
}

function readString(source: string, cursor: Cursor, context: string): string {
  const quote = source[cursor.index]!;
  cursor.index += 1;
  let out = '';

  while (cursor.index < source.length) {
    const char = source[cursor.index]!;

    if (char === '\\') {
      const escaped = source[cursor.index + 1];
      if (escaped === undefined) break;
      cursor.index += 2;
      out += unescape(escaped, source, cursor, context);
      continue;
    }
    if (char === quote) {
      cursor.index += 1;
      return out;
    }
    if (char === '\n') fail(source, cursor, context, 'a string may not span lines');

    out += char;
    cursor.index += 1;
  }

  return fail(source, cursor, context, 'unterminated string');
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
};

function unescape(escaped: string, source: string, cursor: Cursor, context: string): string {
  if (escaped === 'u') {
    // Both \uXXXX and \u{XXXX}; the code point is validated rather than trusted.
    if (source[cursor.index] === '{') {
      const close = source.indexOf('}', cursor.index);
      if (close === -1) fail(source, cursor, context, 'unterminated unicode escape');
      const code = Number.parseInt(source.slice(cursor.index + 1, close), 16);
      if (!Number.isFinite(code) || code > 0x10ffff) {
        fail(source, cursor, context, 'invalid unicode escape');
      }
      cursor.index = close + 1;
      return String.fromCodePoint(code);
    }
    const digits = source.slice(cursor.index, cursor.index + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(digits)) fail(source, cursor, context, 'invalid unicode escape');
    cursor.index += 4;
    return String.fromCharCode(Number.parseInt(digits, 16));
  }

  if (escaped === 'x') {
    const digits = source.slice(cursor.index, cursor.index + 2);
    if (!/^[0-9a-fA-F]{2}$/.test(digits)) fail(source, cursor, context, 'invalid hex escape');
    cursor.index += 2;
    return String.fromCharCode(Number.parseInt(digits, 16));
  }

  return SIMPLE_ESCAPES[escaped] ?? escaped;
}

function readNumber(source: string, cursor: Cursor, context: string): number {
  const match =
    /^-?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(
      source.slice(cursor.index),
    );
  if (match === null) {
    const preview = source.slice(cursor.index, cursor.index + 20).split('\n')[0] ?? '';
    fail(source, cursor, context, `expected a literal value, found "${preview}"`);
  }
  cursor.index += match[0].length;
  return Number(match[0]);
}

function isIdentifierChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_$]/.test(char);
}
