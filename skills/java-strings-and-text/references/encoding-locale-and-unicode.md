# Encoding, locale and Unicode

Examples are partial snippets; supply `java.nio`, `java.nio.charset`, `java.text` and
`java.util` imports as needed. State whether limits count bytes, code units, code points or
graphemes before adapting them.

## Three different "lengths"

```java
String s = "a👍é";                       // 'a', thumbs-up emoji, e-acute (composed)

s.length();                              // 4  — UTF-16 code units (the emoji takes two)
s.codePointCount(0, s.length());         // 3  — Unicode code points
// grapheme clusters (what a user calls "characters"): 3 here, but an emoji with a
// skin-tone modifier is 2+ code points and 1 grapheme
```

Consequences:

- `substring(0, n)`, `charAt`, and manual code-unit truncation can split a surrogate pair and
  produce an unpaired code unit. A standard encoder then rejects or replaces it according to
  that API's error policy; do not assume a lossless round trip.
  Truncate on code-point or grapheme boundaries:

  ```java
  static String truncate(String s, int maxCodePoints) {
      if (maxCodePoints < 0) throw new IllegalArgumentException("negative limit");
      if (s.codePointCount(0, s.length()) <= maxCodePoints) return s;
      return s.substring(0, s.offsetByCodePoints(0, maxCodePoints));
  }
  ```

  This requires non-null, well-formed UTF-16 input; code-point traversal does not repair lone
  surrogates. Decide whether malformed text must be rejected at ingress.

  For user-facing truncation ("…" after N characters), use
  `BreakIterator.getCharacterInstance(locale)`. The default Java 25 implementation follows
  Unicode extended grapheme-cluster boundaries; test on the exact supported JDK because Unicode
  data and locale behaviour can change across releases.

- Reversing a string by code units corrupts anything outside the BMP, and so does most
  character-by-character processing written with `charAt`.
- `String` uses UTF-16 indexing in its API. HotSpot compact strings (enabled by default since
  JDK 9) can store Latin-1 contents in one byte per code unit; the flag/implementation and object
  overhead matter for footprint. This representation is not a Java language/API guarantee.

## Normalisation

The same visible text has multiple valid encodings:

```java
String composed   = "é";              // é as one code point
String decomposed = "é";             // e + combining acute
composed.equals(decomposed);               // false
Normalizer.normalize(decomposed, Form.NFC).equals(composed);   // true
```

Filesystems, clients and copy/paste can produce different normalization forms, while database
uniqueness depends on the selected collation rather than universally comparing bytes. Follow the
identifier's actual policy: normalize a separate comparison/search representation where required,
or preserve exact bytes/code units where that is the contract. If canonical storage is required,
enforce compatible database/index equality and assess collisions before migrating existing keys.
Keep the original when signatures, round-trip or display spelling require it.

`NFKC` additionally folds compatibility variants (full-width characters, ligatures); useful for
search keys, wrong for anything that must round-trip exactly.

For identity checks, be aware of confusables: Cyrillic `а` and Latin `a` are different code
points that render identically. Normalisation does not merge them; if that matters (usernames,
domains), use a confusable-detection library or restrict the allowed script.

## Charsets

Every conversion between `String` and bytes uses a charset, but an omitted charset has an
API-specific contract. For APIs that use `Charset.defaultCharset()`, that default:

- was the OS/locale default before Java 18 and is UTF-8 from Java 18 onwards (JEP 400);
- may select the native encoding with `-Dfile.encoding=COMPAT` on Java 18+; other override values
  have unspecified behaviour;
- can differ across versions/configuration; do not infer boundary encoding from the host.

Some APIs instead specify a fixed default: `Files.readString(path)` and
`Files.newBufferedReader(path)` use UTF-8; `Properties.load(InputStream)` uses ISO-8859-1.
Standard console streams have their own encoding rules. A valid fixed default already satisfies
that encoding contract; an explicit argument can clarify it but is not a semantic repair.

The failure it produces is characteristic: text is fine in tests and shows `Ã©` or `?` in
production, or a hash/signature computed over bytes differs between two services.

```java
byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
String back  = new String(bytes, StandardCharsets.UTF_8);
String file  = Files.readString(path, StandardCharsets.UTF_8);
try (var reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) { ... }
```

Other places to inspect for a default or explicit contract: `PrintWriter`/`PrintStream` constructors,
`InputStreamReader`/`OutputStreamWriter`, `Scanner`, `URLEncoder`/`URLDecoder`, `Properties`
loaded from a byte stream (ISO-8859-1 unless you use the `Reader` overload), and any HTTP
client or server that guesses from a missing `charset` parameter.

Error policy depends on the API: `new String(bytes, charset)` replaces malformed input,
whereas a new `CharsetDecoder` defaults to `REPORT`. For an explicit strict boundary, configure
both malformed and unmappable actions to `CodingErrorAction.REPORT`; do not assume all reader
convenience APIs replace errors. Encoding an unpaired surrogate with `getBytes(charset)` also
uses replacement; use a reporting `CharsetEncoder` when signatures or identifiers require
rejection instead of lossy conversion.

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
header.equalsIgnoreCase("Content-Type")   // locale-independent; not ASCII grammar validation
```

**Number and date formatting.** `String.format("%.2f", 1234.5)` yields `1234,50` in `pt-BR`
and `1234.50` in `en-US`. Unspecified locale can corrupt a JSON number or canonical signature;
an explicitly localized CSV import/export can validly require comma decimals. Select the
contract's format/locale and separators, not merely whether a machine consumes the output.

The rule: **follow the protocol's specified casing/format for machine text and the user's locale
for human text; do not accidentally inherit the process default.** `Locale.ROOT` is usually the
right locale-neutral mapping but does not replace a protocol-specific ASCII rule or Unicode
canonicalization profile. `Locale.setDefault` at startup is not a local fix—it mutates global
behaviour and can invalidate already-created locale-sensitive objects.

## Comparison and collation

- `equals` compares code units exactly and locale-independently. Use it when that matches
  identity; normalization or case-insensitive equivalence is a separate contract.
- `compareTo` orders by code unit: for example `Z` before `a` and composed `é` after `z`.
  For human collation, select `Collator` locale/strength and verify representative language data;
  default tailoring is not every user's expected ordering (java-object-contracts owns the contract).
- `equalsIgnoreCase` is locale-independent and does not perform normalization or full
  language-sensitive collation. Case-insensitive comparison in Java and in the database may
  disagree: a `CI` collation, a
  `citext` column, or an index on `lower(x)` each define their own rules. When uniqueness is
  enforced by the database, align any Java precheck with that rule while keeping the database
  constraint authoritative; a precheck does not reserve a value against concurrent inserts.

## Length limits

`VARCHAR(50)` means 50 characters in some engines and 50 bytes in others; one Unicode scalar
value takes one to four UTF-8 bytes, while a grapheme may contain several. `value.length() <= 50` can pass
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

- [CharsetDecoder error policy, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/charset/CharsetDecoder.html)
- [String API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/String.html)
- [BreakIterator API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/text/BreakIterator.html)
- [JEP 400: UTF-8 by Default](https://openjdk.org/jeps/400)
- [Files fixed UTF-8 convenience methods, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/file/Files.html)
- [Properties byte-stream encoding, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Properties.html)
- [Unicode Standard Annex #15: Normalization Forms](https://www.unicode.org/reports/tr15/)
- [Unicode Standard Annex #29: Text Segmentation](https://www.unicode.org/reports/tr29/)
- [Unicode Technical Standard #39: Security Mechanisms](https://www.unicode.org/reports/tr39/)
