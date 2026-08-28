# Building text: concatenation, regex and injection

## Concatenation, with the cost model

```java
// Single expression: compiled through StringConcatFactory (invokedynamic) into one operation
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
| Machine-readable formatting          | `"%s=%d".formatted(...)` / `String.format(Locale.ROOT, …)`        |
| Human-readable message               | `MessageFormat` with the user's locale, or the i18n framework     |
| Log message                          | the logger's own placeholders (`log.info("x={}", x)`) — never `+` |

`StringBuilder` is not thread-safe; `StringBuffer` is synchronised and essentially never the
right answer, since a builder used across threads is already a design problem.

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

**Compile once.**

```java
// Recompiles the pattern on every call — one of the few genuinely free wins
if (input.matches("^[A-Z]{2}\\d{8}$")) { ... }

private static final Pattern IBAN = Pattern.compile("^[A-Z]{2}\\d{8}$");
if (IBAN.matcher(input).matches()) { ... }
```

`String.matches`, `String.split`, `String.replaceAll` and `Pattern.compile` in a method body all
compile per invocation. `Pattern` instances are immutable and thread-safe (a `Matcher` is not),
so a `static final` field is the correct home.

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
2. **Bound the input** before matching — a length cap turns an exponential into a bounded cost.
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
| Filesystem    | `Path.of(base + "/" + userName)`          | `base.resolve(name).normalize()`, then assert `startsWith(base)`   |
| HTML          | `"<div>" + text + "</div>"`               | a template engine with contextual escaping                         |
| LDAP/XPath    | filter built by concatenation             | the API's parameterised form, or escape with the library's encoder |
| HTTP header   | header value from user text               | validate against a charset/pattern; reject CR/LF                   |
| Logs          | `log.info("user " + name + " logged in")` | `log.info("user logged in", kv("user", name))` — structured fields |

Two that are less obvious:

- **Log forging.** A newline in user-controlled text inserted into a log message creates a
  second, fake log line — which then flows into the log index and any alerting built on it.
  Structured logging with fields (structured-logging) removes the class of bug; if messages
  must be built, strip or escape control characters.
- **Path traversal.** `..` segments, absolute paths, symlinks and Windows device names all turn
  "a filename from the user" into an arbitrary path. Normalise and then verify containment
  explicitly; a check before normalisation proves nothing.

Validation belongs at the boundary where the text enters, and encoding at the boundary where it
leaves — see java-defensive-programming. Doing both in the middle is how the same value gets
double-escaped in one path and unescaped in another.

## Interning and memory

`String.intern()` returns a canonical instance from a shared, JVM-wide table. It is occasionally
useful for a fixed, small set of repeated literals; it is the wrong tool for deduplicating
data from outside the process:

- The table is shared and its size affects lookup cost for everything.
- Interning attacker-influenced strings turns request volume into table growth.
- The JVM already deduplicates identical string contents under G1 with
  `-XX:+UseStringDeduplication`, without any code change, if that is the actual problem.

When repeated strings genuinely cost memory (parsed columns in a large batch, repeated header
names), use a bounded local cache — `Map<String, String>` with a size limit — so the lifetime
and the bound are yours. See java-reference-types-and-leaks.
