# Building text: concatenation, regex and injection

## Concatenation, with the cost model

```java
// Single expression: modern javac commonly uses StringConcatFactory (invokedynamic)
String line = name + ": " + value + " (" + unit + ")";

// Loop: quadratic — each += copies the whole accumulated string
String csv = "";
for (Row r : rows) csv += r.toCsv() + "\n";              // O(n²) copying

// Loop, correct
var sb = new StringBuilder(rows.size() * 64);            // pre-size when you can estimate
for (Row r : rows) sb.append(r.toCsv()).append('\n');

// Collection: clearest of all
String csv = rows.stream().map(Row::toCsv).collect(joining("\n"));
```

The rule is about **shape, not about `+`**. A single concatenation expression is fine and
readable; `javac` handles it well. The quadratic case is repeated concatenation into the same
variable, and it is worth fixing on sight because the cost grows with data size, not with call
frequency.

Other composition tools, by purpose:

| Purpose                              | Tool                                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| Join a collection                    | `String.join(sep, parts)`, `Collectors.joining(sep, pre, post)`   |
| Multi-line literal (SQL, JSON, HTML) | text block `"""…"""`                                              |
| Machine-readable formatting          | `String.format(Locale.ROOT, "%s=%d", …)`                          |
| Human-readable message               | `MessageFormat` with the user's locale, or the i18n framework     |
| Log message                          | the logger's own placeholders (`log.info("x={}", x)`) — never `+` |

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

private static final Pattern IBAN = Pattern.compile("^[A-Z]{2}\\d{8}$");
if (IBAN.matcher(input).matches()) { ... }
```

`String.matches` and regex replacement convenience methods compile per invocation; `split` is
specified in terms of `Pattern.compile`, although a JDK may optimize simple separators. `Pattern`
instances are immutable and thread-safe (a `Matcher` is not), so a `static final` field is a good
home for a bounded set of frequently reused expressions. Keep dynamic expressions local or place
them behind a deliberately bounded cache.

**Catastrophic backtracking is an availability risk.** Java's regex engine is backtracking and
has no timeout. A pattern with nested quantifiers over overlapping alternatives can take
exponential time on a crafted input:

```java
Pattern.compile("^(\\w+\\s?)*$").matcher("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!").matches();
// pins a CPU core; the request never returns
```

Mitigations, in order:

1. **Do not regex structured input.** Use a real parser for URLs, emails, JSON, dates, CSV.
   `URI`, `InternetAddress`, `DateTimeFormatter` and a CSV library are all more correct and
   faster than the regex that tries to replace them.
2. **Bound the input** before matching—a cap bounds damage only if it is small enough for the
   pattern's measured worst case. Enforce request deadlines/load shedding outside the matcher too;
   Java's matcher has no reliable per-match timeout.
3. **Remove the nesting.** Avoid `(x+)+`, `(x|y)*z` patterns with overlapping alternatives;
   prefer possessive quantifiers (`\\w++`) or atomic groups (`(?>…)`), which forbid the
   backtracking that causes the blowup.
4. **Treat a hung request with high CPU and a regex in the stack as ReDoS**, not as a slow
   dependency — a thread dump names the `Matcher` frame directly (concurrency-diagnostics).

`split` has its own trap: it takes a regex, so `split(".")` splits on every character and
`split("|")` on nothing useful. For a literal separator, use `Pattern.quote`, or
`StringTokenizer`-free alternatives such as `String.split(Pattern.quote("."))` or a simple
`indexOf` loop.

## Injection: the rule is "never build the other language by concatenation"

| Target        | Never                                     | Instead                                                            |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| SQL           | `"… WHERE id = '" + id + "'"`             | `PreparedStatement` with `?`, or the framework's named parameters  |
| Shell/process | `Runtime.exec("sh -c " + cmd)`            | `ProcessBuilder` with an argument **list**; no shell               |
| Filesystem    | `Path.of(base + "/" + userName)`          | allowlisted names plus traversal anchored at a trusted real base   |
| HTML          | `"<div>" + text + "</div>"`               | a template engine with contextual escaping                         |
| LDAP/XPath    | filter built by concatenation             | the API's parameterised form, or escape with the library's encoder |
| HTTP header   | header value from user text               | validate against a charset/pattern; reject CR/LF                   |
| Logs          | `log.info("user " + name + " logged in")` | `log.info("user logged in", kv("user", name))` — structured fields |

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
- The JVM already deduplicates identical string contents under G1 with
  `-XX:+UseStringDeduplication`, without any code change, if that is the actual problem.

When repeated strings genuinely cost memory (parsed columns in a large batch, repeated header
names), compare G1 deduplication with a cache that has an enforced maximum size and eviction—a
plain `Map` is not bounded. Validate heap occupancy, allocation rate, CPU and GC after the change.
See java-reference-types-and-leaks.

## Authoritative references

- [JLS §15.18.1: String Concatenation Operator](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.18.1)
- [Pattern API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/regex/Pattern.html)
- [OWASP ReDoS guidance](https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS)
- [ProcessBuilder API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ProcessBuilder.html)
- [SecureDirectoryStream API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/file/SecureDirectoryStream.html)
