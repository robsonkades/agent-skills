# Clocks and deterministic tests

Read when business logic depends on “now”, or when validating an affected temporal boundary.

## Control business time, measure elapsed time separately

Inject `Clock` where policy reads current time; capture one instant per decision if all
comparisons must use the same observation. Derive a business date with an explicit business
zone, for example `LocalDate.now(clock.withZone(businessZone))`. The zone on a fixed clock
does not change its instant. A UTC production clock does not mean all business dates are
UTC dates. Fixed clocks allow before/at/after tests without sleeping. See
[Clock's testing contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/Clock.html).

A wall-clock source is not an elapsed-time guarantee. Measure elapsed time within one JVM
using `System.nanoTime() - started`; its origin is arbitrary, so do not persist it or compare
it across JVMs. The subtraction is valid for intervals below `2^63` nanoseconds. Nanosecond
units do not guarantee nanosecond resolution. If elapsed logic needs deterministic tests,
inject a separate ticker such as `LongSupplier`; a fixed wall clock is not that ticker.
See [System.nanoTime](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/System.html#nanoTime()>).

If the task becomes deadline propagation, retry budgets or cancellation, route to
**timeouts-and-deadlines**. Do not extend this example into a timeout framework.

## Executable policy checks

The following is a complete Java 17-compatible program, without libraries, preview flags or
an assertion-enable requirement. Save as `TemporalChecks.java`; run
`javac --release 17 TemporalChecks.java` and `java TemporalChecks` in a scratch directory.
It uses known historical Paris transitions from the runtime zone database; a failure requires
inspecting the actual rules, not silently updating expected values.

The illustrative policy rejects gaps, requires an explicit valid offset for overlaps, and
treats exact expiry as expired. `null` for `selected` means “no offset supplied”; other
parameters are required. Adapt those choices only when the application contract differs.

```java
import java.time.Clock;
import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.Locale;

public class TemporalChecks {
    private static int checks;

    static Instant resolve(LocalDateTime local, ZoneId zone, ZoneOffset selected) {
        var offsets = zone.getRules().getValidOffsets(local);
        if (offsets.isEmpty()) {
            throw new DateTimeException("Local time is in a gap");
        }
        if (selected == null) {
            if (offsets.size() != 1) {
                throw new DateTimeException("Choose an offset for the overlap");
            }
            selected = offsets.get(0);
        }
        return ZonedDateTime.ofStrict(local, selected, zone).toInstant();
    }

    static boolean expired(Instant expiresAt, Clock clock) {
        return !clock.instant().isBefore(expiresAt);
    }

    static void check(boolean condition) {
        if (!condition) throw new AssertionError("Check " + (checks + 1));
        checks++;
    }

    static void rejects(Runnable operation) {
        try {
            operation.run();
        } catch (DateTimeException expected) {
            checks++;
            return;
        }
        throw new AssertionError("Expected temporal rejection");
    }

    public static void main(String[] args) {
        ZoneId paris = ZoneId.of("Europe/Paris");
        LocalDateTime gap = LocalDateTime.parse("2024-03-31T02:30");
        rejects(() -> resolve(gap, paris, null));
        LocalDateTime overlap = LocalDateTime.parse("2024-10-27T02:30");
        rejects(() -> resolve(overlap, paris, null));
        rejects(() -> resolve(overlap, paris, ZoneOffset.UTC));
        Instant earlier = resolve(overlap, paris, ZoneOffset.ofHours(2));
        Instant later = resolve(overlap, paris, ZoneOffset.ofHours(1));
        check(earlier.equals(Instant.parse("2024-10-27T00:30:00Z")));
        check(later.equals(Instant.parse("2024-10-27T01:30:00Z")));

        var noon = ZonedDateTime.of(2024, 3, 30, 12, 0, 0, 0, paris);
        check(noon.plus(Period.ofDays(1)).getHour() == 12);
        check(noon.plus(Duration.ofDays(1)).getHour() == 13);
        LocalDate day = LocalDate.of(2024, 3, 31);
        Instant start = day.atStartOfDay(paris).toInstant();
        Instant end = day.plusDays(1).atStartOfDay(paris).toInstant();
        check(Duration.between(start, end).equals(Duration.ofHours(23)));
        check(LocalDate.of(2023, 1, 31).plusMonths(1)
            .equals(LocalDate.of(2023, 2, 28)));

        Instant expiry = Instant.parse("2024-01-01T00:00:00Z");
        check(!expired(expiry, Clock.fixed(expiry.minusNanos(1), ZoneOffset.UTC)));
        check(expired(expiry, Clock.fixed(expiry, ZoneOffset.UTC)));
        check(expired(expiry, Clock.fixed(expiry.plusNanos(1), ZoneOffset.UTC)));
        Clock fixed = Clock.fixed(expiry, ZoneOffset.UTC);
        check(LocalDate.now(fixed.withZone(ZoneId.of("America/Los_Angeles")))
            .equals(LocalDate.of(2023, 12, 31)));

        var dateFormat = DateTimeFormatter.ofPattern("uuuu-MM-dd", Locale.ROOT)
            .withResolverStyle(ResolverStyle.STRICT);
        check(LocalDate.parse("2024-02-29", dateFormat)
            .equals(LocalDate.of(2024, 2, 29)));
        rejects(() -> LocalDate.parse("2023-02-29", dateFormat));
        rejects(() -> LocalDate.parse("2024-02-29extra", dateFormat));
        Instant precise = Instant.parse("1969-12-31T23:59:59.999999999Z");
        check(!precise.equals(Instant.ofEpochMilli(precise.toEpochMilli())));
        var original = earlier.atOffset(ZoneOffset.ofHours(2));
        var utc = earlier.atOffset(ZoneOffset.UTC);
        check(original.isEqual(utc) && !original.equals(utc));
        System.out.println("Passed " + checks + " temporal checks");
    }
}
```

These checks exercise the sample policy and selected API semantics. They do not validate
the application's JSON configuration, driver, database, future zone-rule updates or scheduler.
Source contracts for zone resolution, arithmetic and parsing are linked in the corresponding
references; a newer compiler's `--release 17` checks Java 17 API/source compatibility but
does not run the code on Java 17.

For application tests, choose cases that expose the actual risk: both sides of midnight in
the business zone; a non-hour transition or skipped date if supported regions require it;
an overlap's two distinct instants; exact inclusive/exclusive endpoints; leap-day and month-end
arithmetic; and the storage precision threshold. Prefer fixed inputs to `sleep()` and avoid
changing process-wide default zones inside parallel tests. A separate process with a different
default zone can reveal accidental reliance on host configuration.
