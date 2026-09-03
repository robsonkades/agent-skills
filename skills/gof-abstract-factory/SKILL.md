---
name: gof-abstract-factory
description: >
  Abstract Factory in modern Java: the pattern exists to keep a _family_ of related objects
  mutually consistent when the family varies, not to centralise construction. Covers the family
  invariant that justifies it, why dependency injection already resolves the deployment-time
  case, when per-request or per-tenant selection makes the factory unavoidable, and how to
  express it as a record of suppliers or a sealed provider rather than a four-level interface
  hierarchy. Use when a factory interface is proposed, when profile-specific object graphs are
  being built by hand, when a family of parser/renderer/validator types must never be mixed
  across formats, when a plugin SPI must supply several related types at once, or when reviewing
  a factory whose products have nothing to do with each other. Does not cover single-product
  creation (gof-factory-method), assembling one complex object (gof-builder), copying an
  existing instance (gof-prototype), or wiring policy in general (java-dependency-inversion).
---

# Abstract Factory

## Purpose

Guarantee that objects used together come from the same family. The pattern's product is not
construction — it is the **impossibility of mixing**: no code path can obtain a Postgres
repository beside an in-memory unit of work, or a PDF renderer beside an HTML paginator,
because only the factory hands them out and it only hands out matched sets.

If there is no invariant binding the products to each other, this is not Abstract Factory. It
is a bag of factory methods, and it should be several separate providers or none at all.

## When it is the answer

```text
There are 2+ product types that must agree with each other
        AND the agreement is not checkable by the type system
        AND the family is selected at runtime from data
                → Abstract Factory

The family is selected once per deployment (profile, environment)
                → dependency injection: one @Configuration per family.
                  The container makes mixing impossible already.

The family is selected per request / tenant / document / region
                → Abstract Factory, keyed by that value. The container
                  cannot decide what varies per call.

Third-party code must contribute a whole family
                → Abstract Factory as the SPI shape (ServiceLoader
                  provider returning the family, not N providers).
```

## When it is not

- **One product type.** That is Factory Method or a `Supplier`; the "abstract" in the name is
  precisely the multi-product part.
- **The products are unrelated** — `createRepository`, `createHttpClient`, `createClock`. This
  is a service locator with a factory's name, and it re-couples every caller to one type that
  knows everything (`gof-pattern-antipatterns`).
- **The family differs only in constants.** Rates, endpoints, limits and timeouts are data. A
  class per value is the commonest false Abstract Factory; use configuration instead.
- **Only one family exists, and the second is speculative.** This weakens the case, but does not
  decide it: an interface can still be justified as a module or plugin boundary, an ownership
  seam, or a stable port. Record that reason; otherwise defer the abstraction until a second
  family reveals the real common contract.
- **Testing was the only motivation.** First prefer substituting collaborators at an existing
  boundary (`@MockitoBean` in Spring Framework 6.2+, or a test `@Configuration`). A production
  family abstraction can still be warranted when the coherent in-memory family is itself a
  useful contract, not merely a test hook.

## Modern Java expression

Prefer a record of factory functions over an interface hierarchy when each product is a single
constructor call. It carries the same guarantee — one object, one family — with none of the
class explosion, and the family is a value that can be put in a `Map`:

```text
Classical                          Modern
─────────────────────────────────  ────────────────────────────────────
interface ReportFactory            record ReportFamily(
  Renderer newRenderer()             Supplier<Renderer> renderer,
  Paginator newPaginator()           Supplier<Paginator> paginator,
  StyleSheet newStyleSheet()         Supplier<StyleSheet> styles)

class PdfReportFactory  implements  static ReportFamily pdf()
class HtmlReportFactory implements  static ReportFamily html()

selection: if/else or a Map        Map<Format, ReportFamily>, or a
                                   sealed Format with exhaustive switch
```

Keep the interface when a product needs more than construction from the family — shared
configuration, a `supports()` predicate, a lifecycle to close — or when third parties implement
it, since an interface is a stabler SPI contract than a record's component list.

## Decision rules

```text
IF the products can be used in any combination without breaking
THEN there is no family. Inject each product independently.

IF the family is fixed at startup by profile or property
THEN dependency injection. Do not add a factory the container calls once.

IF the family key arrives from a request, a tenant or a document
THEN Abstract Factory keyed by that value, with an explicit failure for
     an unknown key — never a silent default family.

IF the key comes from outside the process
THEN validate it against the supported registry before selection. Never turn an
     untrusted class name into reflective loading; an extensible plugin key need not
     be a compile-time closed enum, but it still needs authorization and failure policy.

IF a new product is added to the family
THEN every implementation must change. If that is unacceptable, the
     family is not stable enough for this pattern — reconsider.

IF the factory starts caching what it creates
THEN that is Flyweight or a singleton scope arriving unannounced;
     make the lifetime explicit (gof-flyweight, gof-singleton).
```

## Cross-cutting checks

- **Concurrency.** A factory is normally a stateless immutable value shared by all threads —
  keep it that way. The moment it holds mutable state (a cache, a counter, a "current family"
  field) it needs a memory model argument, and a mutable `currentFamily` field is a race that
  hands out mixed families under load.
- **Distribution.** The pattern is process-local. A "remote factory" that returns handles to
  objects living elsewhere is a Proxy problem with the failure semantics that implies
  (`gof-proxy`). Where families correspond to protocol or schema versions, the selection is
  capability negotiation and needs an explicit unsupported-version path.
- **Performance.** The pattern does not imply allocation: a family may return cached, pooled or
  newly constructed products. Dispatch may inline at stable call sites and may become
  megamorphic with many implementations. Neither effect is a design-level reason to adopt or
  reject the pattern; profile the actual construction and call sites
  (`jit-inlining-and-escape-analysis`).
- **Testing.** The legitimate testing benefit is a whole coherent in-memory family, which makes
  integration-style tests fast without mocks. The illegitimate one is a factory added so that a
  single collaborator can be stubbed — inject that collaborator instead.

## Review checklist

- [ ] There are two or more products, and a stated invariant binds them
- [ ] Mixing families is impossible by construction, not by convention
- [ ] The selection key is named, closed, and validated when externally supplied
- [ ] An unknown key fails loudly rather than falling back to a default family
- [ ] At least two families exist today
- [ ] The factory holds no mutable state
- [ ] The products differ in behaviour, not only in configuration values
- [ ] Adding a product to the family is an acceptable change to every implementation

## References

- [Decision and alternatives](references/decision-and-alternatives.md) — the family-invariant
  test, Abstract Factory against dependency injection, `Map<Key, Supplier>`, `ServiceLoader` and
  configuration, and how it differs from Factory Method and Builder. Read before introducing or
  removing a factory interface.
- [Worked example](references/worked-example.md) — a report-export family selected per request,
  built first as a classical hierarchy and then as a record of suppliers, with the tenant-scoped
  variant, the failure path for an unknown format, and what each version costs. Read when
  implementing.
