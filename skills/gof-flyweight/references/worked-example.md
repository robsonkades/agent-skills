# Worked example: 40 million parsed records in memory

A reconciliation job loads a day of transactions into memory, indexes them, and matches them
against a second file. The heap was sized at 8 GB and the job began failing with long full
collections after volume grew.

## The measurement that started it

```text
jcmd <pid> GC.heap_dump /tmp/recon.hprof     (or -XX:+HeapDumpOnOutOfMemoryError)
```

Grouped by class, retained size:

```text
java.lang.String                    3.1 GB   58 M instances
byte[]                              1.4 GB   (the Strings' backing arrays)
com.acme.recon.Txn                  1.9 GB   40 M instances
java.time.LocalDate                 0.6 GB   40 M instances
```

Grouped by value, the `String` fields told the real story:

```text
field            instances     distinct values
currency          40 M              7
counterpartyId    40 M            412
productCode       40 M          1 830
narrative         40 M       38 000 000        ← genuinely unique
```

Three fields with occurrence/distinct ratios in the millions; one with a ratio of one. That table
is the whole decision — canonicalising the first three is worth roughly 2.3 GB, and touching
`narrative` would be pure overhead.

## What was tried first, and kept

```text
-XX:+UseStringDeduplication
```

Live set fell by about 0.9 GB with no code change: the collector shared the backing `byte[]`s of
equal strings, though the 58 M `String` objects themselves remained. It was kept, and it set a
realistic bar for whether writing code was worth it.

## The change: canonicalise at the boundary

```java
final class TxnParser {

    // confined to the parsing thread; discarded when the load finishes
    private final Map<String, String> currencies = new HashMap<>();
    private final Map<String, String> counterparties = new HashMap<>();
    private final Map<String, String> products = new HashMap<>();

    Txn parse(String line) {
        var f = split(line);
        return new Txn(
            canon(currencies, f[3]),
            canon(counterparties, f[4]),
            canon(products, f[5]),
            f[6],                                  // narrative: never canonicalised
            LocalDate.parse(f[7]));
    }

    private static String canon(Map<String, String> pool, String raw) {
        return pool.computeIfAbsent(raw, Function.identity());
    }
}
```

Three properties that made this cheap and safe:

- **One map per field, not one global pool.** Each is small and its key space is closed by the
  data's own domain, so none can grow without bound.
- **Confined to the parsing thread.** A plain `HashMap`, no synchronisation, no contention. When
  parsing was later run on four threads, each got its own parser instance and the pools were
  merged at the end — still cheaper than a shared concurrent map on the hot path.
- **Dropped after the load.** The pools are not fields of a long-lived service, so nothing leaks
  between runs.

## `LocalDate` — the same idea, a different mechanism

40 M `LocalDate` instances across roughly 400 distinct dates:

```java
private final Map<String, LocalDate> dates = new HashMap<>();
LocalDate date = dates.computeIfAbsent(f[7], LocalDate::parse);
```

This also removed 40 M parses, which turned out to be the larger win: parsing dominated CPU in
the profile, and the change cut wall-clock time by more than it cut memory. Worth noting because
it is the opposite of the usual trade — here sharing saved both.

## After

```text
                    before      after      delta
live set             7.4 GB     4.6 GB     −2.8 GB
String instances      58 M       18 M
full GCs per run        9          0
wall clock          41 min     28 min
CPU in canon()          —       ~1.1%      (from an async-profiler run)
```

The 1.1% is the honest cost, and it is reported alongside the saving because a reviewer needs
both numbers to judge the change (`jfr-and-async-profiler`).

## The `==` trap that appeared during the change

An existing matcher had this:

```java
if (a.currency() == b.currency()) { ... }        // worked in tests, wrong in principle
```

It had always worked in tests because the test fixtures used string literals, which the constant
pool already shares. In production, before canonicalisation, currencies came from `split()` and
were distinct objects — so the comparison was silently always false, and a whole class of matches
had been missed for months. Canonicalisation would have "fixed" it by accident.

It was changed to `equals` regardless, and a test added with values that are equal but not
identical:

```java
@Test
void matches_on_equal_currency_even_when_not_the_same_instance() {
    var eur = new String("EUR");                 // deliberately not interned
    assertThat(matcher.matches(txn("EUR"), txn(eur))).isTrue();
}
```

The general rule this illustrates: never let a sharing optimisation be load-bearing for
correctness. If a change to the cache can change behaviour, the behaviour was wrong before the
change.

## What was reverted

An earlier attempt pooled the `Txn` objects themselves in a `ConcurrentHashMap` keyed by a
composite of all five fields, on the theory that duplicate transactions were common. Measurement
said otherwise:

```text
distinct Txn values / total = 0.94        ratio 1.06 — almost nothing shared
map overhead                = 40 M × ~48 B ≈ 1.9 GB    added
CPU in computeIfAbsent      = 7% under 4 parsing threads (bin-lock contention)
```

It made the job slower and used more memory than not doing it. It was reverted the same day,
which is the outcome the arithmetic in
[when-sharing-pays.md](when-sharing-pays.md) would have predicted before it was written.

## What was considered and not done

- **A `byte` index instead of a `String` reference** for currency and product code. Would have
  saved a further ~200 MB and required an indirection at every read site. Not worth it at 4.6 GB;
  it becomes the right answer if the volume triples.
- **Columnar layout.** Would remove the 40 M `Txn` headers entirely — around 640 MB — but the
  matcher is written against objects and rewriting it is a week. Recorded as the next step if the
  job grows again.
- **An off-heap store.** Correct at a much larger scale, and a substantial complexity step
  (`off-heap-memory`). Not justified by 4.6 GB in an 8 GB heap.
