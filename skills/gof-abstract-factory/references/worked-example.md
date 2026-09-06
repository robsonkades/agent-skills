# Worked example: a report-export family selected per request

The invariant: a report's renderer, paginator and stylesheet come from the same format family.
Mixing them produces output that is silently wrong — the PDF paginator emits page-break markers
that the HTML renderer writes out as visible text.

The format arrives on the request; the container can wire a registry while the service selects
from it per call. These are partial Java 17 sketches with domain types/imports omitted and Spring
annotations requiring the project's existing Spring dependencies; they are not standalone files.

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

    public ReportFamily {
        java.util.Objects.requireNonNull(renderer, "renderer");
        java.util.Objects.requireNonNull(paginator, "paginator");
        java.util.Objects.requireNonNull(styleSheet, "styleSheet");
    }

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

The record has final component references and rejects nulls. Its public constructor still accepts
a PDF renderer with an HTML paginator: these factories rely on trusted assembly and contract tests,
not a type-level compatibility guarantee. If hostile or accidental mixed assembly must be rejected,
use validated product family identities or encapsulate construction and usage behind a stronger API.
Safely publish the map and honor each component's own thread-safety and lifecycle contract.

The service holds no format knowledge:

```java
@Service
public class ReportService {
    private final Map<Format, ReportFamily> families;

    public ReportService(Map<Format, ReportFamily> families) {
        this.families = Map.copyOf(families);
    }

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
  bound the cache and define eviction, tenant authorization, configuration invalidation and who
  closes resources. Caching alone does not make this Flyweight.
- **Per-tenant stylesheets are data.** If the only per-tenant difference is a stylesheet, the
  family does not vary by tenant — the stylesheet is a parameter. Do not multiply families for
  values.

## What each version costs

| Version                    | Compatibility boundary                   | New format touches                          |
| -------------------------- | ---------------------------------------- | ------------------------------------------- |
| Before                     | Independently wired products             | Service, products and wiring                |
| Classical Abstract Factory | Provider implementation and caller usage | Provider, products and registry             |
| Family as a record         | Trusted assembly and contract tests      | Assembly method, products, key and registry |

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

This test family checks orchestration, not the real PDF/HTML compatibility contract. Use a fresh
sink per test; the captured mutable list is not safe for concurrent exports. A contract-preserving
single-product test double does not disprove the family invariant. Test each real family end to
end, null rejection, unknown keys and deliberately mixed products at the chosen enforcement
boundary. This public record does not reject mismatched non-null products; do not claim otherwise.

See [Java record constructors](https://docs.oracle.com/en/java/javase/17/language/records.html)
for validation and shallow final fields, and [Spring profiles](https://docs.spring.io/spring-framework/reference/core/beans/environment.html)
for conditional registration rather than automatic family compatibility.
