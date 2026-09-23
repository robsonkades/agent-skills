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

Inspect compiler release/toolchains, runtime JDK, locale/provider and boundary encoding before
changing behavior. Java 25 is the authoring baseline; preserve the project's actual target.
Text blocks and `formatted` need Java 15+, records Java 16+, and default charset behavior
changes in Java 18. Unicode segmentation depends on the runtime version. Use supported
alternatives without upgrades or preview; missing protocol/column constraints remain unverified.
Reuse established boundary contracts and adequate implementations. Ask only for missing input,
consumer or runtime facts that would change the recommendation.

1. **Check the consumer contract before introducing a type.** An id, status, currency code,
   compound key or phone number may benefit from a validated type when invariants or mix-ups
   justify it. Retain adequate validated strings and published wire/API encodings.
2. **Pin the encoding at every boundary.** Use the charset required by the protocol or storage
   contract—often UTF-8—on byte/string conversions, readers, writers and HTTP bodies.
3. **Follow the required casing and format.** `Locale.ROOT` suits locale-neutral protocols;
   an explicitly localized import/export or human message may require another locale. Neither
   substitutes for a protocol's ASCII grammar or canonicalization policy.
4. **Choose the composition mechanism by shape**: a single expression → `+`; a loop →
   `StringBuilder`; a collection → `String.join`/`Collectors.joining`; multi-line literal →
   a text block; user-facing formatting → `String.format(locale, …)` or `MessageFormat`
   with the user's locale. `formatted` has no locale overload and uses the process default.
5. **Reuse stable, repeated `Pattern`s**, and check what happens when input is hostile—length
   bound, nesting, backtracking. Dynamic or one-shot expressions do not belong in global state.
6. **Check every place text is embedded into another language.** Bind data values where
   supported; use allowlisted structural choices or context-specific encoding when binding is
   unavailable. Verify the actual downstream grammar, not just the Java string expression.

## Rules

- Consider enums for closed sets (java-enums), validated ids/codes, `java.time` timestamps,
  numeric amount types and `URI`/`Path` when their contracts fit. A type alone does not validate
  meaning or authorize a location. Weigh consumer compatibility and useful invariants against
  wrapper/conversion cost; do not create types merely because text is present.
- Check compound-key ambiguity: `tenant + "#" + id` collides if unconstrained components can
  contain `#`. A record can simplify an internal key; an established separator restriction,
  escaping or length-prefix encoding can be sound. Preserve public encoded keys and verify
  equality/round-trip behavior before changing representation.
- `length()` counts UTF-16 **code units**, not characters. Characters outside the Basic
  Multilingual Plane — emoji, many CJK extensions, some scripts — take two units, so
  `substring(0, 100)` can split a surrogate pair and produce invalid text. Use
  `codePointCount`/`offsetByCodePoints` when the unit is a code point, and `BreakIterator` when
  the unit is what a user perceives as a character (an emoji with a skin-tone modifier is
  several code points and one grapheme).
- Pass or verify the contract's charset. `String.getBytes()` and `new String(byte[])` use
  the default charset; reader/writer overloads may use that default or a specified fixed/inherited
  encoding. Since Java 18 the default charset is UTF-8. The supported startup values of
  `file.encoding` are `UTF-8` and `COMPAT` (which selects the native encoding); other values have
  unspecified behaviour. Explicit UTF-8 is portable only
  when UTF-8 is actually the boundary contract—legacy files and protocols may require another
  explicit charset.
- Select casing and formatting from the consuming contract. `"TITLE".toLowerCase()` is
  `"tıtle"` in a Turkish locale — the dotless ı — so a
  case-insensitive comparison of a header, a code or an enum name fails on a machine whose
  locale differs from the developer's. Use `Locale.ROOT` when the protocol requires that mapping;
  validate an ASCII-only grammar separately when required.
  `equalsIgnoreCase` is locale-independent simple Unicode comparison, not
  human-language collation or a universal identifier canonicalizer. The same applies to
  `String.format("%.2f", …)`, which emits a comma decimal separator in many locales;
  `String.formatted` also uses the default formatting locale.
- Concatenation in a single expression is fine. Modern `javac` commonly uses
  `StringConcatFactory`; the language specification intentionally leaves the implementation to
  the compiler. Repeated `result += fragment` in a loop can copy an ever-growing prefix and
  become quadratic. Use a locally owned `StringBuilder` in loops, `String.join` or
  `Collectors.joining` for collections.
- Do not micro-optimise concatenation outside loops, and do not replace readable expressions
  with `StringBuilder` chains on a hunch. If string building appears in a profile, that is
  evidence; otherwise it is noise (performance-methodology).
- Reuse a `private static final Pattern` when the same non-trivial expression is matched
  repeatedly. `matches` and regex replacement convenience methods compile their expressions;
  `split` is specified in terms of pattern compilation although implementations may optimize
  simple delimiters. Do not retain data-dependent patterns forever, and measure before building
  a pattern cache—unbounded cardinality merely changes an allocation cost into a leak.
- Review the work bound of a regex applied to untrusted input. Ambiguous nested quantifiers
  (`(a+)+`, `(\w+\s?)*`) can cause excessive backtracking or stack exhaustion; the actual growth
  depends on the pattern, input and implementation. Java's matcher has no per-match timeout.
  Bound the input length, avoid harmful nested
  quantifiers, consider possessive quantifiers or atomic groups only after checking accepted
  inputs and captures remain correct, and prefer a real parser for
  structured input. Where a regex must run on user input, run it with a bounded input size and
  treat a hang as a possible ReDoS requiring pattern/input evidence.
- Never interpolate untrusted text as executable syntax. Use prepared statements for SQL data
  values and allowlist structural choices such as identifiers. Use `ProcessBuilder` with an argument list,
  and a templating engine with contextual escaping. For paths, lexical `normalize`/`startsWith`
  checks do not defeat symlinks or races: resolve against a trusted real base, constrain allowed
  names, and use filesystem-specific secure traversal where the threat model requires it.
  Structured logging preserves field boundaries, but the encoder/sink must still escape control
  characters to prevent log forging (structured-logging).
- Use text blocks when they clarify multi-line literals — SQL, JSON, HTML. Check resulting
  indentation, newlines and escapes against required bytes; they do not make
  embedded user input safe, so parameters still go through the mechanism above. String
  templates were previewed and then withdrawn from the JDK; do not design around them.
- Do not use `String.intern()` as an unmeasured deduplication strategy for unbounded external
  data. It adds shared-table lookup/coordination and couples retention/GC behaviour to the JVM
  implementation. First prove duplicate strings dominate the heap; then compare G1 string
  deduplication, bounded caches with real eviction, or representation changes
  (java-reference-types-and-leaks).
- Define and version a Unicode canonicalization policy before comparing or storing identifiers
  that people type. The same visible
  text can be several code-point sequences (`é` composed or decomposed);
  `Normalizer.normalize(s, NFC)` is a common preservation-oriented policy, but protocols,
  search and security-sensitive identifiers may require case folding, NFKC, script restrictions
  or no normalization. Java and the database must enforce the same rule.
- Byte length and character length are different limits. A `VARCHAR(50)` may mean 50 bytes or
  50 characters depending on the database and collation, so validation written in Java
  characters can pass while the insert fails. Validate against the real constraint, using the
  boundary's encoding error policy as well as its charset; counting replacement bytes does not
  prove that the original text is valid.

## References

Deliver the boundary contract (encoding, malformed-input policy, locale and length unit),
the smallest justified change, and checks run on the target. Include malformed bytes,
supplementary/combining text, locale differences and rejected inputs when relevant. Separate
semantic correctness from measured regex/performance claims; report unavailable evidence.

- [Encoding, locale and Unicode](references/encoding-locale-and-unicode.md) — read when text
  crosses a file, socket, database or process boundary, when it is truncated or compared
  case-insensitively, or when a bug appears only for some users' data or on some machines.
- [Building text: concatenation, regex and injection](references/building-text-safely.md) —
  read when composing strings in a loop or a hot path, when writing or reviewing a regex over
  untrusted input, or when text is embedded into SQL, a command, a path, a template or a log.
