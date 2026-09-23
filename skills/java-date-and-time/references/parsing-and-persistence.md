# Parsing and persistence

Read when values cross a text, JSON, JDBC or ORM boundary. Start with real producer/consumer
examples and the effective schema and configuration, not only the Java field declaration.

## Grammar before formatter

Specify whether an input is a civil date, unresolved local date-time, or an occurrence that
must include an offset. Set locale for human text; use a defined machine grammar for wire
data. Reject trailing data and invalid values through a complete typed parse, such as
`LocalDate.parse(text, formatter)`, rather than accepting a partially parsed prefix.

For an ISO calendar-date pattern, `uuuu` is the proleptic year, `yyyy` is year-of-era and
`YYYY` is week-based-year. Do not mix week-based-year with month/day. `ofPattern` defaults to
SMART resolution; choose STRICT for input that must reject invalid dates. `parseStrict()`
on a formatter builder controls the text parsing phase and does not replace strict field
resolution; see [the builder's parsing mode](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/format/DateTimeFormatterBuilder.html#parseStrict()>).
This partial Java 17 snippet belongs inside a class with appropriate imports:

```java
private static final DateTimeFormatter DATE =
    DateTimeFormatter.ofPattern("uuuu-MM-dd", Locale.ROOT)
        .withResolverStyle(ResolverStyle.STRICT);
```

Use predefined ISO formatters when they match the contract. Calendar validation does not
establish a unique regional instant: apply the gap/overlap policy separately. For an input
containing both offset and region, validate their consistency explicitly when required;
successful parsing is not a guarantee that the original pair was consistent. See the
[Java 17 formatter contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/format/DateTimeFormatter.html).

## Precision is part of the public contract

Write down accepted fractional digits, whether excess precision is rejected, truncated or
rounded, and where that happens. `Instant` can hold nanoseconds; epoch milliseconds cannot
preserve all of them. Numeric timestamps need a named unit, range and consumer-compatible
representation. Do not infer seconds versus milliseconds from digit count or route epoch
integers through floating point. For millisecond-only values, for example, either reject
`instant.getNano() % 1_000_000 != 0` or deliberately canonicalize to milliseconds before
identity comparisons. Preserve existing API behavior unless a contract change is authorized.
See [Instant.toEpochMilli](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/Instant.html#toEpochMilli()>).

Inspect the actual serializer, module registration, settings and resolved version. Specify
an offset-bearing string or a documented numeric epoch for instants, a date-only string for
`LocalDate`, and an explicit region field where it must survive. Do not promise that a JSON
library will serialize a Java type a particular way without configuration evidence. Bracketed
region syntax understood by Java is not automatically accepted by external consumers.

Round-trip tests should assert temporal meaning and agreed precision. Text equality is
required only for a canonical format or a signature contract; `Z` versus `+00:00`, fractional
width, and equivalent offsets may encode the same instant with different text. If precision
loss could merge uniqueness keys or alter optimistic-lock tokens, reject the lossy mapping
or revise that contract rather than weakening an equality assertion.

## JDBC: bind and read the intended SQL meaning

Inspect column type and precision, database/session zone, JDBC driver and ORM mapping. Prefer
typed `setObject`/`getObject` mappings where supported; explicit conversions must happen at
the boundary. Do not assume `Instant` or `ZonedDateTime` has portable direct driver support,
or that a column called “timestamp with time zone” preserves the original region or offset.

Concrete example: current pgJDBC documentation maps `DATE` to `LocalDate`, `TIMESTAMP WITHOUT
TIME ZONE` to `LocalDateTime`, and `TIMESTAMP WITH TIME ZONE` to `OffsetDateTime`. It documents
UTC offsets on read and no direct `Instant`/`ZonedDateTime` support. Verify the deployed driver
version before applying this example. See
[pgJDBC temporal mappings](https://jdbc.postgresql.org/documentation/query/#using-java-8-date-and-time-classes).

For a PostgreSQL occurrence column, a boundary conversion can be `instant.atOffset(UTC)` on
write and `offsetDateTime.toInstant()` on read. The following is a partial Java 17/JDBC
snippet, assuming an existing `PreparedStatement`, `ResultSet`, non-null input, and the
documented pgJDBC mapping to a `TIMESTAMP WITH TIME ZONE` column:

```java
statement.setObject(1, instant.atOffset(ZoneOffset.UTC));
OffsetDateTime stored = result.getObject("occurred_at", OffsetDateTime.class);
Instant restored = stored == null ? null : stored.toInstant();
```

PostgreSQL 17 `timestamp with time zone` preserves the occurrence, not its originally supplied
zone. Display uses the session zone; its timestamp resolution is microseconds. Keep a region
column when needed and test the actual column's declared precision. See
[PostgreSQL 17 date/time types](https://www.postgresql.org/docs/17/datatype-datetime.html).

Test through the real isolated driver/database path: write and read under different session
zones; include sub-column precision, a negative epoch, null if allowed, and the two overlap
occurrences. Assert `Instant` equality after the explicit precision policy, or local-field
equality for civil data. A fake repository cannot prove driver rounding or session-zone
behavior. If the database is unavailable, report the proposed mapping and pending integration
check; do not invent a passing round trip. A data migration also needs evidence of the old
values' meaning before adding an assumed zone to them.
