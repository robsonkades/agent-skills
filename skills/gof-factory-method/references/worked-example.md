# Worked example: an import pipeline whose subclasses only picked a parser

## Before

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

## After — the parser is passed in

```java
public final class ImportJob {
    private final Parser parser;
    private final ImportRepository repository;

    public ImportJob(Parser parser, ImportRepository repository) {
        this.parser = parser;
        this.repository = repository;
    }

    public ImportResult run(Path file) {
        var rows = parser.parse(file);
        var valid = rows.stream().filter(Row::isComplete).toList();
        repository.saveAll(valid);
        return new ImportResult(rows.size(), valid.size());
    }
}
```

Three classes became one. `ImportJob` is now `final`, which removes the whole
fragile-base-class surface, and it can be constructed in a test with a lambda parser.

## Selection moves to one visible place

```java
public enum SourceFormat { CSV, XML, FIXED_WIDTH }

@Configuration
class Parsers {
    @Bean
    Map<SourceFormat, Parser> parsers() {
        return Map.of(SourceFormat.CSV, new CsvParser(';'),
                      SourceFormat.XML, new XmlParser(),
                      SourceFormat.FIXED_WIDTH, new FixedWidthParser(LAYOUT));
    }
}
```

```java
Parser parser = parsers.get(format);
if (parser == null) throw new UnsupportedSourceFormat(format, parsers.keySet());
```

Every supported format is now readable in one place, and adding one is a map entry rather than a
class plus its wiring.

If the parsers are stateless, the map holds shared instances and construction disappears
entirely. If a parser is stateful per file, hold `Map<SourceFormat, Supplier<Parser>>` instead —
that supplier _is_ the factory method, expressed as a value.

## Where the hook correctly stays

A framework that instantiates your class cannot hand you anything:

```java
public class TenantRoutingDataSource extends AbstractRoutingDataSource {
    @Override
    protected Object determineCurrentLookupKey() {
        return TenantContext.currentTenant();
    }
}
```

The framework constructs `AbstractRoutingDataSource`'s machinery and calls into the subclass;
there is no seam at which a `Supplier` could have been injected. The same applies to
`HttpServlet`, `AbstractProcessor`, custom `HandlerMethodArgumentResolver`s, and JUnit
extensions. Recognising these as Factory Method (or Template Method) is useful; replacing them
is not.

## The trap this refactor also removed

The original had a latent version of the constructor defect:

```java
public abstract class ImportJob {
    private final Parser parser;
    protected ImportJob() { this.parser = createParser(); }   // would break CsvImportJob
    ...
}

public final class CsvImportJob extends ImportJob {
    private final char delimiter = ';';
    @Override protected Parser createParser() { return new CsvParser(delimiter); }  // ' '
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
var job = new ImportJob(file -> List.of(new Row("a", "b")), repository);
```

The second version does not break when `ImportJob` gains a second hook, does not require the
production class to stay non-final, and reads as a test of `ImportJob` rather than of a subclass
that only exists in `src/test`.

## What it cost

Nothing was lost that was being used. What would have been lost, had the subclasses carried
real behaviour — a format-specific `isValid`, a different result shape — is polymorphism on the
job itself, and then the right answer is to keep a small hierarchy or a sealed set of jobs and
still pass the parser in. The hook was doing one job: choosing a value.
