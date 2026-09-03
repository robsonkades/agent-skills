# Encoding, locale and Unicode

## Three different "lengths"

```java
String s = "a👍é";                       // 'a', thumbs-up emoji, e-acute (composed)

s.length();                              // 4  — UTF-16 code units (the emoji takes two)
s.codePointCount(0, s.length());         // 3  — Unicode code points
// grapheme clusters (what a user calls "characters"): 3 here, but an emoji with a
// skin-tone modifier is 2+ code points and 1 grapheme
```

Consequences:

- `substring(0, n)`, `charAt`, and any manual truncation can split a surrogate pair and produce
  an unpaired code unit, which serialises as `?` or as invalid UTF-8 depending on the writer.
  Truncate on code-point or grapheme boundaries:

  ```java
  static String truncate(String s, int maxCodePoints) {
      if (s.codePointCount(0, s.length()) <= maxCodePoints) return s;
      return s.substring(0, s.offsetByCodePoints(0, maxCodePoints));
  }
  ```

  For user-facing truncation ("…" after N characters), use
  `BreakIterator.getCharacterInstance(locale)`. The default Java 25 implementation follows
  Unicode extended grapheme-cluster boundaries; test on the exact supported JDK because Unicode
  data and locale behaviour can change across releases.

- Reversing a string by code units corrupts anything outside the BMP, and so does most
  character-by-character processing written with `charAt`.
- `String` is UTF-16 in its API. Internally, since JDK 9 (compact strings) a Latin-1-only
  string is stored one byte per character; this is invisible to the API and only matters when
  reasoning about memory.

## Normalisation

The same visible text has multiple valid encodings:

```java
String composed   = "é";              // é as one code point
String decomposed = "é";             // e + combining acute
composed.equals(decomposed);               // false
Normalizer.normalize(decomposed, Form.NFC).equals(composed);   // true
```

Filesystems, clients and copy/paste can produce different normalization forms, while database
uniqueness depends on the selected collation rather than universally comparing bytes. Choose a
canonical form for a specific identifier, normalize once at ingress, store the canonical value,
and configure the database/index to enforce compatible equality. Keep the original separately
when exact round-trip or display spelling matters.

`NFKC` additionally folds compatibility variants (full-width characters, ligatures); useful for
search keys, wrong for anything that must round-trip exactly.

For identity checks, be aware of confusables: Cyrillic `а` and Latin `a` are different code
points that render identically. Normalisation does not merge them; if that matters (usernames,
domains), use a confusable-detection library or restrict the allowed script.

## Charsets

Every conversion between `String` and bytes uses a charset. Omitting it means "whatever the
platform default is", which:

- was the OS/locale default before Java 18 and is UTF-8 from Java 18 onwards (JEP 400);
- may select the native encoding with `-Dfile.encoding=COMPAT` on Java 18+; other override values
  have unspecified behaviour;
- differs between a developer's machine, a CI container and a production image.

The failure it produces is characteristic: text is fine in tests and shows `Ã©` or `?` in
production, or a hash/signature computed over bytes differs between two services.

```java
byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
String back  = new String(bytes, StandardCharsets.UTF_8);
String file  = Files.readString(path, StandardCharsets.UTF_8);
try (var reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) { ... }
```

Other places the charset is implicit and must not be: `PrintWriter`/`PrintStream` constructors,
`InputStreamReader`/`OutputStreamWriter`, `Scanner`, `URLEncoder`/`URLDecoder`, `Properties`
loaded from a byte stream (ISO-8859-1 unless you use the `Reader` overload), and any HTTP
client or server that guesses from a missing `charset` parameter.

Decoding invalid bytes silently substitutes U+FFFD by default. When corrupt input must be
rejected rather than mangled, use a `CharsetDecoder` with `CodingErrorAction.REPORT`.

## Locale

Locale-sensitive operations produce different output on different machines. The two that cause
production incidents:

**Case conversion.** In Turkish (`tr`), `"I".toLowerCase()` is `"ı"` (dotless) and
`"i".toUpperCase()` is `"İ"`. Code that lower-cases a header name, an enum name, a file
extension or a protocol token for comparison therefore fails on a JVM whose default locale is
Turkish or Azeri:

```java
header.toLowerCase()                  // locale-dependent — a bug in protocol code
header.toLowerCase(Locale.ROOT)       // deterministic
header.equalsIgnoreCase("Content-Type")   // allocation-free, locale-independent comparison
```

**Number and date formatting.** `String.format("%.2f", 1234.5)` yields `1234,50` in `pt-BR`
and `1234.50` in `en-US`. In a JSON body, a CSV export, a filename or a signature, that is a
corrupt value; use `Locale.ROOT` for machine-readable output and the user's locale only for
display.

The rule: **follow the protocol's specified casing/format for machine text and the user's locale
for human text; do not accidentally inherit the process default.** `Locale.ROOT` is usually the
right locale-neutral mapping but does not replace a protocol-specific ASCII rule or Unicode
canonicalization profile. `Locale.setDefault` at startup is not a local fix—it mutates global
behaviour and can invalidate already-created locale-sensitive objects.

## Comparison and collation

- `equals` compares code units — exact, fast, locale-independent, and the right choice for ids
  and protocol tokens (after normalisation).
- `compareTo` orders by code unit: `Z` before `a`, accents after `z`. Correct as a total order,
  wrong as alphabetical order for humans — `Collator.getInstance(locale)` is the one that
  sorts as a reader expects (java-object-contracts covers the ordering contract).
- `equalsIgnoreCase` is locale-independent and does not perform normalization or full
  language-sensitive collation. Case-insensitive comparison in Java and in the database may
  disagree: a `CI` collation, a
  `citext` column, or an index on `lower(x)` each define their own rules. When uniqueness is
  enforced by the database, do the normalisation the database expects before checking in Java,
  or the check passes and the insert fails.

## Length limits

`VARCHAR(50)` means 50 characters in some engines and 50 bytes in others; in UTF-8, one
character is one to four bytes. Validation written as `value.length() <= 50` can therefore pass
for text that the database rejects, and the failure appears as a truncation error or a silently
truncated value depending on the engine's mode.

Validate against the real constraint — bytes in the target encoding when the column is
byte-limited:

```java
value.getBytes(StandardCharsets.UTF_8).length <= 50
```

The same distinction applies to message-size limits, header limits, and anything else specified
in bytes.

## Authoritative references

- [String API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/String.html)
- [BreakIterator API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/text/BreakIterator.html)
- [JEP 400: UTF-8 by Default](https://openjdk.org/jeps/400)
- [Unicode Standard Annex #15: Normalization Forms](https://www.unicode.org/reports/tr15/)
- [Unicode Standard Annex #29: Text Segmentation](https://www.unicode.org/reports/tr29/)
- [Unicode Technical Standard #39: Security Mechanisms](https://www.unicode.org/reports/tr39/)
