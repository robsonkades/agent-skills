# Worked example: a report-export family selected per request

The invariant: a report's renderer, paginator and stylesheet come from the same format family.
Mixing them produces output that is silently wrong — the PDF paginator emits page-break markers
that the HTML renderer writes out as visible text.

The format arrives on the request, so the container cannot decide it.

## Before — mixing is possible

```java
@Service
public class ReportService {
    private final PdfRenderer pdfRenderer;
    private final HtmlRenderer htmlRenderer;
    private final Paginator paginator;          // which family is this?
    private final StyleSheet styles;

    public byte[] export(Report report, Format format) {
        var pages = paginator.paginate(report);
        return switch (format) {
            case PDF -> pdfRenderer.render(pages, styles);
            case HTML -> htmlRenderer.render(pages, styles);
        };
    }
}
```

Two defects. The paginator and stylesheet are singletons shared across formats, so one family's
components are used with the other's. And every new format edits this class plus its constructor.

## After — classical Abstract Factory

```java
public interface ReportFamily {
    Renderer renderer();
    Paginator paginator();
    StyleSheet styleSheet();
}

final class PdfFamily implements ReportFamily { /* three matched products */ }
final class HtmlFamily implements ReportFamily { /* three matched products */ }
```

This is correct and, for three stateless products, more machinery than the guarantee needs:
three interfaces, two implementations each, plus the family interface and its two
implementations.

## After — the family as a value

```java
public record ReportFamily(Renderer renderer, Paginator paginator, StyleSheet styleSheet) {

    public static ReportFamily pdf(StyleRepository styles) {
        return new ReportFamily(new PdfRenderer(), new PdfPaginator(), styles.pdf());
    }

    public static ReportFamily html(StyleRepository styles) {
        return new ReportFamily(new HtmlRenderer(), new HtmlPaginator(), styles.html());
    }
}

@Configuration
class ReportFamilies {
    @Bean
    Map<Format, ReportFamily> families(StyleRepository styles) {
        return Map.of(Format.PDF, ReportFamily.pdf(styles),
                      Format.HTML, ReportFamily.html(styles));
    }
}
```

The family is now one immutable object. Its constructor cannot expose a partially populated
record, and final-field initialization safety protects the components after construction. The
containing map still must be safely published (for example by container initialization) and the
components themselves must obey their own thread-safety contracts.

The service holds no format knowledge:

```java
@Service
public class ReportService {
    private final Map<Format, ReportFamily> families;

    public byte[] export(Report report, Format format) {
        var family = families.get(format);
        if (family == null) {
            throw new UnsupportedFormatException(format, families.keySet());
        }
        return family.renderer().render(family.paginator().paginate(report), family.styleSheet());
    }
}
```

### The failure path matters

`families.get(format)` returning `null` and falling through to a default family is how a request
for an unsupported format silently returns a PDF. Fail with the requested value and the
supported set, so the caller can act. Where `Format` is an enum parsed from the request, parse it
at the boundary and reject an unknown string there — a factory keyed by unvalidated external
input is a type-selection hazard, not merely a bug.

## The tenant-scoped variant

When the family also depends on tenant configuration, the key becomes a pair and the map is
built per tenant rather than per format:

```java
record FamilyKey(TenantId tenant, Format format) {}
```

Two things to watch:

- **Unbounded key space.** A map keyed by tenant grows with tenants; if families are expensive,
  bound the cache and give it an eviction policy — at which point you are also doing Flyweight
  and should say so (`gof-flyweight`).
- **Per-tenant stylesheets are data.** If the only per-tenant difference is a stylesheet, the
  family does not vary by tenant — the stylesheet is a parameter. Do not multiply families for
  values.

## What each version costs

| Version                    | Types | Mixing possible | New format touches | Family is a value |
| -------------------------- | ----- | --------------- | ------------------ | ----------------- |
| Before                     | 1     | Yes             | Service + wiring   | —                 |
| Classical Abstract Factory | 9     | No              | 1 new class + map  | No                |
| Family as a record         | 4     | No              | 1 static factory   | Yes               |

The record version is preferred while you own every family. Switch to the interface when a
third party must supply one, or when a family needs behaviour beyond construction — a
`supports(Report)` predicate, or resources to close.

## Testing

An in-memory family is the pattern's real testing dividend:

```java
static ReportFamily capturing(List<Page> sink) {
    return new ReportFamily(
        (pages, styles) -> { sink.addAll(pages); return new byte[0]; },
        report -> List.of(new Page(report.title())),
        StyleSheet.EMPTY);
}
```

One value, no mocking framework, and the test exercises the real composition rather than three
independently stubbed collaborators. If a test needs to substitute exactly one product, that is
a signal the products are not really a family — see the family-invariant test in
[decision-and-alternatives.md](decision-and-alternatives.md).
