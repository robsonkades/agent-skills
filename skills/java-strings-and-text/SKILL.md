---
name: java-strings-and-text
description: >
  Text in Java as encoded data rather than a universal type: UTF-16 code units versus code
  points versus graphemes, charsets and why the platform default is not a policy,
  locale-sensitive case and formatting including the Turkish-I bug, concatenation cost in
  loops versus single expressions, text blocks, regex compilation and catastrophic
  backtracking on untrusted input, interning, and injection through SQL, shells, paths and
  logs. Use when a String stands in for a type or compound key, when text is truncated by
  length(), when toLowerCase() or String.format() omits a Locale, when getBytes() omits a
  charset, when a Pattern is compiled in a loop or applied to user input, or when user text
  reaches SQL, a command or a log line. Numeric formatting is java-numeric-types, String
  standing in for a domain type as a smell is java-code-smells, and wire-format throughput
  is serialization-performance.
---

# Java Strings and Text

## Purpose

Treat text as encoded, locale-sensitive, attacker-influenced data with a cost model — because
every one of those four properties has a failure mode that looks like a `String` working
fine. The two most expensive: text that is correct in the developer's locale and encoding and
wrong in production, and text concatenated into something that interprets it (SQL, a shell, a
log line, a path).

## Workflow

1. **Ask whether it should be a `String` at all.** An id, a status, a currency code, a
   compound key or a phone number wants a type with validation; a `String` there means every
   consumer re-validates or none does.
2. **Pin the encoding at every boundary.** `getBytes(UTF_8)`, `new String(bytes, UTF_8)`,
   `Files.readString(path, UTF_8)`, explicit charset on readers, writers and HTTP bodies.
3. **Pin the locale wherever text is transformed for a machine.** `toLowerCase(Locale.ROOT)`,
   `String.format(Locale.ROOT, …)` for protocol text; the user's locale only for what a human
   reads.
4. **Choose the composition mechanism by shape**: a single expression → `+`; a loop →
   `StringBuilder`; a collection → `String.join`/`Collectors.joining`; multi-line literal →
   a text block; user-facing formatting → `formatted`/`MessageFormat` with a locale.
5. **Hoist every `Pattern`** to a `static final`, and check what happens when the input is
   hostile — length bound, nesting, backtracking.
6. **Check every place text is embedded into another language** and replace concatenation with
   the parameterised mechanism that language provides.

## Rules

- Do not use `String` where a type exists or can be made. Enums for closed sets (java-enums),
  a record or value object for ids and codes, `java.time` for timestamps, `BigDecimal`/`long`
  for amounts, `URI`/`Path` for locations. A `String` parameter accepts every wrong value in
  the universe and documents none of them.
- Never build a compound key by concatenation (`tenant + "#" + id`). It breaks the moment a
  component contains the separator, it cannot be parsed back safely, and it makes every
  consumer a parser. Use a record as the key — it gets `equals`/`hashCode` for free.
- `length()` counts UTF-16 **code units**, not characters. Characters outside the Basic
  Multilingual Plane — emoji, many CJK extensions, some scripts — take two units, so
  `substring(0, 100)` can split a surrogate pair and produce invalid text. Use
  `codePointCount`/`offsetByCodePoints` when the unit is a character, and `BreakIterator` when
  the unit is what a user perceives as a character (an emoji with a skin-tone modifier is
  several code points and one grapheme).
- Always pass the charset. `String.getBytes()`, `new String(byte[])`, `FileReader`,
  `InputStreamReader` and `PrintWriter` without one use a default that has changed across
  versions (UTF-8 since Java 18, JEP 400) and can still be overridden by `file.encoding` or the
  environment. Explicit `StandardCharsets.UTF_8` everywhere is the only portable answer, and it
  is a one-word change.
- Pass a `Locale` to every case conversion and format call whose result is consumed by a
  machine. `"TITLE".toLowerCase()` is `"tıtle"` in a Turkish locale — the dotless ı — so a
  case-insensitive comparison of a header, a code or an enum name fails on a machine whose
  locale differs from the developer's. Use `Locale.ROOT` for protocol text, or better,
  `equalsIgnoreCase` for comparison. The same applies to `String.format("%.2f", …)`, which
  emits a comma decimal separator in many locales.
- Concatenation in a single expression is fine — javac compiles `a + b + c` through
  `StringConcatFactory` into an efficient single operation. Concatenation **in a loop** is
  quadratic: each `+=` copies the whole accumulated string. Use `StringBuilder` in loops,
  `String.join` or `Collectors.joining` for collections.
- Do not micro-optimise concatenation outside loops, and do not replace readable expressions
  with `StringBuilder` chains on a hunch. If string building appears in a profile, that is
  evidence; otherwise it is noise (performance-methodology).
- Compile a `Pattern` once, as a `private static final`. `String.matches`, `split`, `replaceAll`
  and `Pattern.compile` inside a method recompile the pattern on every call — the standard
  example of the "unnecessary object" cost being real and easy to remove.
- A regex applied to untrusted input is an availability risk. Nested quantifiers over
  alternation (`(a+)+`, `(\w+\s?)*`) can backtrack exponentially, and Java's engine has no
  timeout: one request pins a CPU core until it finishes. Bound the input length, avoid nested
  quantifiers, prefer possessive quantifiers or atomic groups, and prefer a real parser for
  structured input. Where a regex must run on user input, run it with a bounded input size and
  treat a hang as a possible ReDoS, not a slow query.
- Never build SQL, shell commands, HTML, LDAP filters, paths or log lines by concatenating
  user text. Use prepared statements with parameters, `ProcessBuilder` with an argument list,
  a templating engine that escapes, `Path.resolve` with normalisation and containment checks,
  and structured logging with fields rather than interpolated messages — a newline in a
  concatenated log message forges a log entry (structured-logging).
- Use text blocks for multi-line literals — SQL, JSON, HTML — instead of escaped concatenation.
  They preserve readable indentation and remove the escaping mistakes; they do not make
  embedded user input safe, so parameters still go through the mechanism above. String
  templates were previewed and then withdrawn from the JDK; do not design around them.
- Do not call `String.intern()` on data from outside the process. Interning is a shared table:
  it makes lookups slower as it grows and turns attacker-controlled input into a memory
  concern. A bounded cache is the tool when repeated strings genuinely cost memory
  (java-reference-types-and-leaks).
- Normalise Unicode before comparing or storing identifiers that people type. The same visible
  text can be several code-point sequences (`é` composed or decomposed);
  `Normalizer.normalize(s, NFC)` at the boundary keeps equality, uniqueness constraints and
  cross-system comparisons consistent.
- Byte length and character length are different limits. A `VARCHAR(50)` may mean 50 bytes or
  50 characters depending on the database and collation, so validation written in Java
  characters can pass while the insert fails. Validate against the real constraint.

## References

- [Encoding, locale and Unicode](references/encoding-locale-and-unicode.md) — read when text
  crosses a file, socket, database or process boundary, when it is truncated or compared
  case-insensitively, or when a bug appears only for some users' data or on some machines.
- [Building text: concatenation, regex and injection](references/building-text-safely.md) —
  read when composing strings in a loop or a hot path, when writing or reviewing a regex over
  untrusted input, or when text is embedded into SQL, a command, a path, a template or a log.
