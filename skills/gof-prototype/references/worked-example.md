# Worked example: a registry of configured document templates

Illustrative Java 17 partial examples, not a production benchmark. Domain types, imports and
rendering/persistence operations are omitted. Import java.util collections, Objects and static
Collectors.toCollection/toMap. Style is deeply immutable; MetricsRecorder supports concurrent use;
Section.copy and MergeRule.copy must duplicate owned mutable state.

A reporting service holds document templates configured at startup from a CMS: sections, a
header, a style, a set of merge rules. Rendering a document mutates a working copy — sections
are filtered, placeholders substituted — so each request needs its own instance, and rebuilding
one from the CMS per request is a network call the service cannot afford.

This is the shape Prototype exists for: expensive-to-assemble configuration, cheap to duplicate,
and callers need independently mutable working state. This example uses a known final concrete
type; heterogeneous templates would additionally need a subtype-preserving copy interface.

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

Two risks to inspect:

- `sections` and `rules` are **shared** with the original. A request that filters sections
  mutates the registry's template, and every subsequent request sees the filtered version. This
  is a shallow-copy ownership defect.
- super.clone does not revalidate through a constructor. A valid unchanged source can preserve
  its invariants; an empty source produced by later mutation stays empty. Independently owned
  final mutable references cannot be repaired by ordinary assignment in the cloned instance.

If requests mutate the shared `ArrayList` concurrently, they can lose updates or observe
inconsistent data. Iteration may throw `ConcurrentModificationException`, but
[fail-fast detection is best-effort](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/ArrayList.html);
absence of that exception does not establish isolation or thread safety.

## After — a copy factory, with each field decided

```java
public final class DocumentTemplate {
    private final String name;
    private final Style style;                    // immutable value
    private final List<Section> sections;         // owned, mutable
    private final Map<String, MergeRule> rules;   // owned, mutable
    private final MetricsRecorder metrics;        // shared by design

    // Private ownership-transfer constructor: only fresh owned containers/elements may be passed.
    private DocumentTemplate(String name, Style style, List<Section> sections,
                             Map<String, MergeRule> rules, MetricsRecorder metrics) {
        if (sections.isEmpty()) throw new IllegalArgumentException("template needs a section");
        this.name = Objects.requireNonNull(name);
        this.style = Objects.requireNonNull(style);
        this.sections = sections;
        this.rules = Objects.requireNonNull(rules);
        this.metrics = Objects.requireNonNull(metrics);
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

All construction paths must honor the ownership-transfer precondition; external mutable input
must first be copied, or later aliases could mutate registry prototypes. Section/rule copies here
assume a tree of independently owned values; a graph requiring shared-node identity needs one
copy context across fields. workingCopy requires a stable source, and failures publish no partial copy.

Three things this version fixes. The copy runs the constructor, so the invariant holds. Every
field is a deliberate decision, and the Javadoc states which are shared. And adding a field to
the constructor signature can expose missing arguments. Merely adding a field does not necessarily
change that signature; tests must still exercise each copied/shared/reset field.

## The registry

```java
public final class TemplateRegistry {
    private final Map<String, DocumentTemplate> prototypes;   // immutable map, built at startup

    public TemplateRegistry(Map<String, DocumentTemplate> sources) {
        var owned = new LinkedHashMap<String, DocumentTemplate>();
        sources.forEach((key, value) -> owned.put(Objects.requireNonNull(key),
                Objects.requireNonNull(value).workingCopy()));
        this.prototypes = Map.copyOf(owned);
    }

    public DocumentTemplate instantiate(String name) {
        var prototype = prototypes.get(name);
        if (prototype == null) throw new UnknownTemplate(name); // do not expose the full registry to an untrusted caller
        return prototype.workingCopy();
    }
}
```

The registry constructor requires a stable input map and source values while it copies them. It takes owned
copies so retaining the input map or source objects cannot later mutate its prototypes.
The registry holds prototypes it never mutates and never hands out directly. That last part is
the discipline the pattern needs: if any code path can obtain the prototype itself, the
registry's copies stop being independent, and the failure appears in an unrelated request.

Where templates may be reloaded from the CMS at runtime, replace the whole map behind a
`volatile` reference rather than mutating it — readers then see either the old map or the new
one, never a partially updated one. Build the entire owned map privately before assigning it;
Map.copyOf and volatile publication do not make mutable values or shared collaborators immutable.

## Concurrency: copying while the source changes

If prototypes are reloaded in place instead of replaced, `workingCopy()` reads five fields while
a reloader mutates their reachable state. In this final-field version it cannot replace name/style
normally, but it can race on sections/rules and produce inconsistent working state. The two acceptable
answers:

```java
// (a) copy under the lock the mutators use
synchronized (prototype) { return prototype.workingCopy(); }

// (b) never mutate a prototype; replace the map wholesale
private volatile Map<String, DocumentTemplate> prototypes;
```

(b) avoids locking readers only if the published prototype graph is never mutated again and shared
collaborators satisfy their own concurrency contract. Capture the map once per operation if several
lookups must use one generation; volatile alone is not a multi-read snapshot.

## When the copy is persisted

If a working copy is saved as a new document, identity must be created rather than inherited:

```java
public static Document draftFrom(DocumentTemplate template, UserId author, Clock clock) {
    return new Document(
        DocumentId.newId(),          // new identity
        /* version */ null,          // illustrative nullable generated @Version; inspect mapping
        template.name(),
        template.workingCopy().sections(),
        author,                      // not the template's author
        clock.instant());            // re-stamped
}
```

This sketch assumes application-assigned DocumentId and a nullable provider-managed version.
Generated IDs should instead remain unset. Persist/merge and repository new-entity detection
must be tested against actual mappings; old IDs can cause rejection or update an existing row. Note also that this is a **named domain factory**, not a generic `copy()` — the domain
decides what a draft inherits from a template, and that decision does not belong in a copying
utility.

## What was considered and rejected

- **Serialisation round-trip.** Its treatment of metrics depends on serializability, ignored fields
  and replacement hooks: duplication, omission or failure are all possible. Explicit sharing better
  states the desired policy; no cost multiplier is claimed without measurement.
- **Rebuild from the CMS each time.** The correct answer if the CMS call were cheap. It is not;
  that is the force justifying the pattern, and it is worth restating in the code comment so a
  future reader can re-check it if the CMS gets a cache.
- **Make `DocumentTemplate` immutable and never copy.** The right answer if rendering could
  produce rendered output from an immutable template, with request-local buffers. A large section
  count alone does not reject that design. Compare it with copying using representative rendering,
  allocation and latency measurements; this example supplies none.

Suggested checks (not executed integration tests): mutate an input template after registry creation;
mutate two instantiated documents independently; verify deliberate Style/MetricsRecorder sharing;
reject invalid/unknown templates without leaking registry contents; publish a reload generation and
check each request uses coherent state. For persistence, insert a draft alongside the source and
verify distinct IDs, provider version initialization, child ownership and unchanged source rows.
