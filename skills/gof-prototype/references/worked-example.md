# Worked example: a registry of configured document templates

A reporting service holds document templates configured at startup from a CMS: sections, a
header, a style, a set of merge rules. Rendering a document mutates a working copy — sections
are filtered, placeholders substituted — so each request needs its own instance, and rebuilding
one from the CMS per request is a network call the service cannot afford.

This is the shape Prototype exists for: expensive-to-assemble configuration, cheap to duplicate,
and the registry does not know the concrete template classes.

## Before — `Cloneable`

```java
public class DocumentTemplate implements Cloneable {
    private String name;
    private Style style;
    private List<Section> sections;
    private Map<String, MergeRule> rules;

    @Override
    public DocumentTemplate clone() {
        try {
            return (DocumentTemplate) super.clone();
        } catch (CloneNotSupportedException e) {
            throw new AssertionError(e);
        }
    }
}
```

Two defects, both silent:

- `sections` and `rules` are **shared** with the original. A request that filters sections
  mutates the registry's template, and every subsequent request sees the filtered version. This
  is the single most common `Cloneable` bug.
- `super.clone()` runs no constructor, so any invariant `DocumentTemplate`'s constructor
  enforces — "a template has at least one section" — does not hold for clones, and a `final`
  field could not have been reassigned even if the copy wanted to.

Under load the first defect is worse than it looks: the shared `ArrayList` is mutated
concurrently by every request, so the failure is not just wrong output but
`ConcurrentModificationException` and lost elements.

## After — a copy factory, with each field decided

```java
public final class DocumentTemplate {
    private final String name;
    private final Style style;                    // immutable value
    private final List<Section> sections;         // owned, mutable
    private final Map<String, MergeRule> rules;   // owned, mutable
    private final MetricsRecorder metrics;        // shared by design

    private DocumentTemplate(String name, Style style, List<Section> sections,
                             Map<String, MergeRule> rules, MetricsRecorder metrics) {
        if (sections.isEmpty()) throw new IllegalArgumentException("template needs a section");
        this.name = name;
        this.style = style;
        this.sections = sections;
        this.rules = rules;
        this.metrics = metrics;
    }

    /**
     * A working copy. Sections and merge rules are duplicated; the style is immutable and
     * shared; the metrics recorder is shared deliberately, so copies report to one place.
     */
    public DocumentTemplate workingCopy() {
        return new DocumentTemplate(
            name,
            style,
            sections.stream().map(Section::copy).collect(toCollection(ArrayList::new)),
            rules.entrySet().stream()
                 .collect(toMap(Map.Entry::getKey, e -> e.getValue().copy(),
                                (a, b) -> a, LinkedHashMap::new)),
            metrics);
    }
}
```

Three things this version fixes. The copy runs the constructor, so the invariant holds. Every
field is a deliberate decision, and the Javadoc states which are shared. And adding a field to
the class breaks `workingCopy()` at compile time only if the constructor is positional — which
is why the private canonical constructor takes every field rather than being assembled with
setters.

## The registry

```java
public final class TemplateRegistry {
    private final Map<String, DocumentTemplate> prototypes;   // immutable map, built at startup

    public DocumentTemplate instantiate(String name) {
        var prototype = prototypes.get(name);
        if (prototype == null) throw new UnknownTemplate(name, prototypes.keySet());
        return prototype.workingCopy();
    }
}
```

The registry holds prototypes it never mutates and never hands out directly. That last part is
the discipline the pattern needs: if any code path can obtain the prototype itself, the
registry's copies stop being independent, and the failure appears in an unrelated request.

Where templates may be reloaded from the CMS at runtime, replace the whole map behind a
`volatile` reference rather than mutating it — readers then see either the old map or the new
one, never a partially updated one.

## Concurrency: copying while the source changes

If prototypes are reloaded in place instead of replaced, `workingCopy()` reads five fields while
a reloader writes them, and a copy can mix old sections with a new style. The two acceptable
answers:

```java
// (a) copy under the lock the mutators use
synchronized (prototype) { return prototype.workingCopy(); }

// (b) never mutate a prototype; replace the map wholesale
private volatile Map<String, DocumentTemplate> prototypes;
```

(b) is preferable: it makes the prototype immutable in practice, so the copy needs no
synchronisation at all and readers never block behind a reload.

## When the copy is persisted

If a working copy is saved as a new document, identity must be created rather than inherited:

```java
public static Document draftFrom(DocumentTemplate template, UserId author, Clock clock) {
    return new Document(
        DocumentId.newId(),          // new identity
        /* version */ 0,             // not the template's
        template.name(),
        template.workingCopy().sections(),
        author,                      // not the template's author
        clock.instant());            // re-stamped
}
```

Carrying the source's `@Id` or `@Version` into a copy is the failure mode that reaches
production: with a detached copy it throws on flush; with a managed one it silently updates the
original. Note also that this is a **named domain factory**, not a generic `copy()` — the domain
decides what a draft inherits from a template, and that decision does not belong in a copying
utility.

## What was considered and rejected

- **Serialisation round-trip.** Would have copied `metrics` too, creating a second recorder per
  request whose measurements went nowhere, and would have cost a full graph serialise per
  request.
- **Rebuild from the CMS each time.** The correct answer if the CMS call were cheap. It is not;
  that is the force justifying the pattern, and it is worth restating in the code comment so a
  future reader can re-check it if the CMS gets a cache.
- **Make `DocumentTemplate` immutable and never copy.** The right answer if rendering could
  produce a new template instead of mutating a working copy. It was rejected here because
  rendering mutates in a loop over thousands of sections — but for most types this is the option
  that should be tried first, because it deletes the pattern.
