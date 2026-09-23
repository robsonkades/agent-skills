# Building text: concatenation, regex and injection

## Concatenation, with the cost model

```java
// Single expression: modern javac commonly uses StringConcatFactory (invokedynamic)
String line = name + ": " + value + " (" + unit + ")";

// Loop: repeated prefix copying can make work quadratic as output grows
String csv = "";
for (Row r : rows) csv += r.toCsv() + "\n";              // O(n²) copying

// Loop: preserves the trailing newline of the first loop
var sb = new StringBuilder();                           // bounded capacity hint only if useful
for (Row r : rows) sb.append(r.toCsv()).append('\n');

// Collection: separators only, with no trailing newline
String csv = rows.stream().map(Row::toCsv).collect(joining("\n"));
```

The rule is about **shape, not about `+`**. A single concatenation expression is fine and
readable; `javac` handles it well. The quadratic case is repeated concatenation into the same
variable. Prefer a builder for growing output; retain adequate tiny bounded constructions when
a rewrite adds no useful benefit. These are independent sketches, not byte-equivalent alternatives:
`joining("\n")` omits the loop's final newline for nonempty input. Preserve empty-input, delimiter,
null and `toCsv()` escaping contracts. Avoid unchecked `rows.size() * 64` capacity arithmetic or
unbounded speculative preallocation; a capacity hint is optional, not a size or work limit.

Other composition tools, by purpose:

| Purpose                              | Tool                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Join a collection                    | `String.join(sep, parts)`, `Collectors.joining(sep, pre, post)`              |
| Multi-line literal (SQL, JSON, HTML) | text block `"""…"""`                                                         |
| Machine-readable formatting          | `String.format(Locale.ROOT, "%s=%d", …)`                                     |
| Human-readable message               | `MessageFormat` with the user's locale, or the i18n framework                |
| Log message                          | the logger's placeholders for dynamic fields; retain adequate fixed messages |

`StringBuilder` is not thread-safe and should normally be method-confined. `StringBuffer` offers
per-operation synchronization but cannot make a multi-call construction protocol atomic; use it
only when an API contract genuinely requires that type or that exact synchronization granularity.

## Text blocks

```java
private static final String FIND_ORDERS = """
    SELECT o.id, o.total
      FROM orders o
     WHERE o.tenant_id = ?
       AND o.created_at >= ?
     ORDER BY o.created_at DESC, o.id DESC
    """;
```

Incidental indentation is stripped relative to the least-indented line (including the closing
delimiter, which is why its position matters). `\` at end of line suppresses the newline, `\s`
preserves trailing spaces. Text blocks make embedded SQL and JSON readable — and they change
nothing about safety: parameters still go through placeholders.

Note for planning: string templates (`STR."..."`) were a preview feature and were withdrawn
from the JDK; there is no supported interpolation syntax, and code should not be written in
anticipation of one.

## Regular expressions

**Reuse repeated, stable patterns.**

```java
// Compiles through the convenience API on every call
if (input.matches("^[A-Z]{2}\\d{8}$")) { ... }

private static final Pattern REFERENCE_CODE = Pattern.compile("^[A-Z]{2}\\d{8}$");
if (REFERENCE_CODE.matcher(input).matches()) { ... }
```

This illustrative code grammar is two ASCII capitals followed by eight ASCII digits under the
default regex flags; it is not bank-account validation. `String.matches` and regex replacement
convenience methods compile per invocation; `split` is
specified in terms of `Pattern.compile`, although a JDK may optimize simple separators. `Pattern`
instances are immutable and thread-safe (a `Matcher` is not), so a `static final` field is a good
home for a bounded set of frequently reused expressions. Keep dynamic expressions local or place
them behind a deliberately bounded cache.

**Catastrophic backtracking is an availability risk.** Java's regex engine is backtracking and
has no timeout. A pattern with nested quantifiers over overlapping alternatives can take
exponential time on a crafted input:

```java
Pattern.compile("^(\\w+\\s?)*$").matcher("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!").matches();
// Potentially costly near miss; duration depends on input and JDK implementation.
```

Mitigations, in order:

1. **Match the tool to the grammar.** Retain a simple bounded regex for a narrow code/lexical
   check; use a parser when the actual URL, email, JSON, date or CSV grammar warrants it.
   Choose a parser matching the actual validation needs; `URI` parsing alone, for
   example, is not URL authorization or SSRF protection. Measure performance separately.
2. **Bound the input** before matching—a cap bounds damage only if it is small enough for the
   pattern's measured worst case. Enforce request deadlines/load shedding outside the matcher too;
   Java's matcher has no reliable per-match timeout.
3. **Remove the nesting.** Avoid `(x+)+`, `(x|y)*z` patterns with overlapping alternatives;
   prefer possessive quantifiers (`\\w++`) or atomic groups (`(?>…)`), which forbid the
   backtracking that causes the blowup. These can change the accepted language and captures:
   `a+a` matches `aa`, but `a++a` does not. Test valid and rejected cases before substitution.
4. **Treat high CPU and a regex stack as a lead.** Correlate the actual pattern, input and
   repeated stacks before attributing cost; a frame alone proves neither an attack nor an
   exponential growth rate. concurrency-diagnostics owns runtime attribution.

`split` interprets its separator as a regex: `split(".")` and `split("|")` do not mean a
literal dot or pipe. For a non-empty literal separator, use `Pattern.quote` or a simple
`indexOf` loop. Quoting does not decide the field contract: the one-argument `split` uses a
zero limit and discards trailing empty fields. Use `input.split(Pattern.quote(separator), -1)`
when those fields must be retained; preserve deliberate trimming in an existing contract.
For example, splitting `"a||"` on a quoted pipe yields `["a"]` with the default limit and
`["a", "", ""]` with `-1`. Verify leading, repeated and trailing separators plus empty input;
splitting empty input with a non-empty literal separator yields one empty field.

For literal replacement text containing `$` or `\`, use `Matcher.quoteReplacement`; quoting
the pattern with `Pattern.quote` solves a different problem. Test hostile near misses at small,
bounded sizes. Run growth probes in an isolated process with a hard external timeout, since
interrupting a future does not reliably stop the matcher. A quick sample does not prove safety.

## Injection: the rule is "never build the other language by concatenation"

| Target        | Never                                     | Instead                                                                                  |
| ------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| SQL           | `"… WHERE id = '" + id + "'"`             | PreparedStatement parameters for data; allowlist structural choices such as column names |
| Shell/process | `Runtime.exec("sh -c " + cmd)`            | `ProcessBuilder` with an argument **list**; no shell                                     |
| Filesystem    | `Path.of(base + "/" + userName)`          | allowlisted names plus traversal anchored at a trusted real base                         |
| HTML          | `"<div>" + text + "</div>"`               | a template engine with contextual escaping                                               |
| LDAP/XPath    | filter built by concatenation             | the API's parameterised form, or escape with the library's encoder                       |
| HTTP header   | header value from user text               | validate against a charset/pattern; reject CR/LF                                         |
| Logs          | `log.info("user " + name + " logged in")` | `log.info("user logged in", kv("user", name))` — structured fields                       |

Two that are less obvious:

- **Argument injection still exists without a shell.** `ProcessBuilder(List<String>)` prevents
  shell metacharacter interpretation, but an attacker-controlled argument such as `--output=...`
  can still change the invoked program's behaviour. Allowlist command shapes and put untrusted
  operands after `--` when the program supports it.
- **Log forging.** A newline in user-controlled text inserted into a log message creates a
  second, fake log line — which then flows into the log index and any alerting built on it.
  Structured fields preserve schema but do not guarantee escaping; configure and test the
  encoder/transport so CR, LF and other controls cannot create records.
- **Path traversal.** `..` segments, absolute paths, symlinks and Windows device names all turn
  "a filename from the user" into an arbitrary path. Lexical normalization catches `..`, not
  symlink traversal or time-of-check/time-of-use races. Prefer strict filename allowlists and a
  trusted `toRealPath()` base; for hostile writable trees use secure directory-relative APIs where
  available and design writes to avoid following links.

Validation belongs at the boundary where the text enters, and encoding at the boundary where it
leaves — see java-defensive-programming. Doing both in the middle is how the same value gets
double-escaped in one path and unescaped in another.

## Interning and memory

`String.intern()` returns a canonical instance through a shared, JVM-wide table. Literals are
already interned. Programmatic interning can help controlled high-duplication/cardinality cases,
but it is the wrong default for arbitrary external data:

- It adds shared-table lookup and changes reachability/GC behaviour in implementation-specific
  ways; cardinality and churn determine whether CPU or memory gets better or worse.
- Attacker-influenced cardinality can turn an intended optimization into CPU and memory pressure.
- On supported G1 runtimes, `-XX:+UseStringDeduplication` can deduplicate eligible backing
  storage without making distinct `String` objects identical. It is not a guarantee that every
  duplicate is removed or that overhead is worthwhile.

When repeated strings genuinely cost memory (parsed columns in a large batch, repeated header
names), compare G1 deduplication with a cache that has an enforced maximum size and eviction—a
plain `Map` is not bounded. Validate heap occupancy, allocation rate, CPU and GC after the change.
See java-reference-types-and-leaks.

## Authoritative references

- [JLS §15.18.1: String Concatenation Operator](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.18.1)
- [Pattern API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/regex/Pattern.html)
- [String.split limits, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/String.html#split(java.lang.String,int)>)
- [OWASP input validation and ReDoS guidance](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [ProcessBuilder API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ProcessBuilder.html)
- [SecureDirectoryStream API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/file/SecureDirectoryStream.html)
