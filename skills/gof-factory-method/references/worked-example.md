# Worked example: an import pipeline whose subclasses only picked a parser

## Before

Partial Java 17 snippets: domain types, imports, repository wiring and parser implementations
are omitted. Assume eager parsing closes file resources before returning rows; parsers themselves
hold no closeable resources. A streaming or closeable parser needs explicit per-run cleanup,
including parse/save failure paths.

```java
public abstract class ImportJob {

    public ImportResult run(Path file) {
        var parser = createParser();                 // the hook
        var rows = parser.parse(file);
        var valid = rows.stream().filter(this::isValid).toList();
        repository.saveAll(valid);
        return new ImportResult(rows.size(), valid.size());
    }

    protected abstract Parser createParser();
    protected boolean isValid(Row row) { return row.isComplete(); }
}

public final class CsvImportJob extends ImportJob {
    @Override protected Parser createParser() { return new CsvParser(';'); }
}
public final class XmlImportJob extends ImportJob {
    @Override protected Parser createParser() { return new XmlParser(); }
}
public final class FixedWidthImportJob extends ImportJob {
    @Override protected Parser createParser() { return new FixedWidthParser(LAYOUT); }
}
```

Three subclasses, three one-line overrides, and the hierarchy has to be extended to answer the
question "which parsers do we support?" — the answer is spread across three files and whatever
wiring picks the subclass.

There is real inherited behaviour here (`run`), so this is genuine GoF Factory Method, not a
misnamed `Supplier`. It is still the wrong shape, for a different reason: the variation is one
value per kind, and the kinds are data.

## After — the per-run creation function is passed in

```java
public final class ImportJob {
    private final Supplier<? extends Parser> parsers;
    private final ImportRepository repository;

    public ImportJob(Supplier<? extends Parser> parsers, ImportRepository repository) {
        this.parsers = Objects.requireNonNull(parsers);
        this.repository = Objects.requireNonNull(repository);
    }

    public ImportResult run(Path file) {
        var parser = Objects.requireNonNull(parsers.get(), "parser supplier returned null");
        var rows = parser.parse(file);
        var valid = rows.stream().filter(Row::isComplete).toList();
        repository.saveAll(valid);
        return new ImportResult(rows.size(), valid.size());
    }
}
```

Three classes became one. `ImportJob` is now `final`, which removes the whole
fragile-base-class surface. The supplier runs once per invocation, preserving the original
creation frequency when wired to constructors. A supplier returning a shared parser changes
that lifetime and requires a separate justification.

## Selection moves to one visible place

```java
public enum SourceFormat { CSV, XML, FIXED_WIDTH }

@Configuration
class Parsers {
    @Bean
    Map<SourceFormat, Supplier<Parser>> parsers() {
        return Map.of(SourceFormat.CSV, () -> new CsvParser(';'),
                      SourceFormat.XML, XmlParser::new,
                      SourceFormat.FIXED_WIDTH, () -> new FixedWidthParser(LAYOUT));
    }
}
```

```java
Supplier<Parser> selected = parsers.get(format);
if (selected == null) throw new UnsupportedSourceFormat(format, parsers.keySet());
var job = new ImportJob(selected, repository);
```

Every supported format is now readable in one place, and adding one is a map entry rather than a
class plus its wiring.

Share instances only when the parser and its collaborators support concurrent reuse and their
lifetime permits it. A supplier is a creation function replacing the GoF hook, not that
inheritance pattern. The Spring configuration is optional wiring and needs the project's
existing Spring dependencies; the map can be built directly without a framework.

## Where the hook correctly stays

A framework may expose a required creation hook. This illustrative SPI invokes it after
construction; retain it when the published extension contract requires this shape:

```java
abstract class FrameworkImporter {
    public final ImportResult execute(Path file) {
        return createJob().run(file);
    }
    protected abstract ImportJob createJob();
}
```

Inspect actual registration/injection options before assuming the creator must be framework
constructed with no arguments. Spring's `AbstractRoutingDataSource.determineCurrentLookupKey()`
selects a lookup key, not a new product: it is a routing hook, not a creation-hook example.
See its [API contract](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/jdbc/datasource/lookup/AbstractRoutingDataSource.html).

## The trap this refactor also removed

The original had a latent version of the constructor defect:

```java
public abstract class ImportJob {
    private final Parser parser;
    protected ImportJob() { this.parser = createParser(); }   // would break CsvImportJob
    ...
}

public final class CsvImportJob extends ImportJob {
    private final char delimiter;
    public CsvImportJob(char delimiter) { this.delimiter = delimiter; }
    @Override protected Parser createParser() { return new CsvParser(delimiter); }  // NUL in super()
}
```

Had anyone moved `createParser()` into the constructor to "create it once", `delimiter` would
have been read before its initialiser ran, and every CSV import would have parsed on a NUL
separator. Passing the parser in makes the ordering question impossible to ask.

## Testing, before and after

```java
// before: a test subclass, coupled to protected members and to the hierarchy
class TestImportJob extends ImportJob {
    @Override protected Parser createParser() { return file -> List.of(new Row("a", "b")); }
}

// after: a lambda
var job = new ImportJob(() -> file -> List.of(new Row("a", "b")), repository);
```

The second version does not break when `ImportJob` gains a second hook, does not require the
production class to stay non-final, and reads as a test of `ImportJob` rather than of a subclass
that only exists in `src/test`.

## What it cost

Nothing was lost that was being used. What would have been lost, had the subclasses carried
real behaviour — a format-specific `isValid`, a different result shape — is polymorphism on the
job itself, and then the right answer is to keep a small hierarchy or a sealed set of jobs and
still pass the parser in. The hook was doing one job: choosing a value.
