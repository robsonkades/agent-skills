# Zones and calendar arithmetic

Read when civil values become instants, a zone is changed, or a calculation uses days,
months or years. The examples use ISO dates and Java 17 APIs.

## Region, offset and the authoritative value

A `ZoneOffset` is a displacement from UTC. A region `ZoneId` obtains rules that vary over
time. Do not replace a region with its current offset, infer a region from an offset, or
interpret an offset-free event with `ZoneId.systemDefault()` unless the contract explicitly
uses that host setting.

For a recorded occurrence, preserve its instant. If the original region or textual offset
has business value, preserve those separately too. For a future civil commitment, establish
whether the local fields and region or an already agreed instant are authoritative when
zone rules change. This is a product decision, not a reason to rewrite existing records.
For investigations requiring reproducibility, record JDK build and, for the configured
provider, versions exposed by `ZoneRulesProvider.getVersions(zoneId)`; do not assume all
machines have identical rules. See the
[Java 17 zone rules provider contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/zone/ZoneRulesProvider.html).

To change a display zone while preserving the occurrence, use `instant.atZone(targetZone)`
or `withZoneSameInstant`. `withZoneSameLocal` attempts to retain civil fields and can change
the instant; reserve it for an intentional reinterpretation. Converting to `LocalDateTime`
discards the offset/zone and cannot be treated as a reversible conversion.

## Explicit gap and overlap policy

Inspect `zone.getRules().getValidOffsets(local)` before resolving user-supplied civil time.

| Valid offsets | Meaning                             | Policy choices                                                                                                             |
| ------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| One           | Ordinary local time                 | Use it; reject a supplied offset that disagrees.                                                                           |
| Zero          | Gap: that civil time does not exist | Reject, or apply a documented shift. A shift by the gap length and a clamp to the first valid time are different policies. |
| Multiple      | Overlap: civil time is ambiguous    | Require a valid offset, reject ambiguity, or explicitly choose earlier/later occurrence.                                   |

Do not use `ZoneRules.getOffset(local)` as validation: it returns a best-effort offset even
where the local value is ambiguous or invalid. Use the transition's actual duration; not
every change is one hour. See
[ZoneRules.getValidOffsets and getTransition](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/zone/ZoneRules.html#getValidOffsets(java.time.LocalDateTime)>).

`local.atZone(zone)` normally shifts gaps forward by their length and selects the earlier
offset in an overlap. Some operations on an existing `ZonedDateTime` retain its previous
valid offset instead. These defaults are usable only when they match the contract.
`ZonedDateTime.ofStrict(local, offset, zone)` rejects an invalid combination; `ofLocal` takes
a preference that can be ignored, so it is not a substitute for validation. Explicit overlap
choices can use `withEarlierOffsetAtOverlap()` or `withLaterOffsetAtOverlap()`. These are
the documented [ZonedDateTime resolution rules](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/ZonedDateTime.html).

For example, a booking interface that rejects gaps and requires an offset for overlaps
should retain the entered local value and zone, return actionable validation errors, and
accept a selected offset only if it belongs to the valid-offset list. The runnable test
reference implements this policy; it is an example contract, not a universal default.

## Calendar arithmetic and day windows

`Period` uses calendar years, months and days. `Duration` uses seconds and nanoseconds;
`Duration.ofDays(1)` means 86,400 seconds. Across a DST transition, adding a period day to
a zoned value aims to retain local time, while adding a duration day moves along the instant
timeline. Neither implements business-day or holiday rules. See
[Period's DST example](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/Period.html)
and [Duration's units](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/Duration.html).

Month/year addition can adjust to the last valid day: January 31 plus one month may become
February 28, and reversing the operation need not recover January 31. Choose clamping,
rejection or end-of-month semantics from the domain; do not assume repeated additions are
equivalent to adding the total months to the original date. See
[LocalDate.plusMonths](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/LocalDate.html#plusMonths(long)>).

For all occurrences on a civil date in a specified region, construct a half-open instant
interval `[start, nextStart)`. Partial Java 17 snippet; `date` and `zone` are validated inputs:

```java
Instant start = date.atStartOfDay(zone).toInstant();
Instant nextStart = date.plusDays(1).atStartOfDay(zone).toInstant();
// Query event >= start AND event < nextStart.
```

Do not use `start.plus(Duration.ofDays(1))` or an inclusive `23:59:59.999...` endpoint.
`atStartOfDay(zone)` selects the earliest valid time under the rules; this need not be
midnight. A skipped civil date can produce an empty interval. For an exact requested
midnight appointment, use the gap policy instead of silently applying this date-window rule.
See [LocalDate.atStartOfDay](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/LocalDate.html#atStartOfDay(java.time.ZoneId)>).

Compare the property the domain owns: two `OffsetDateTime` values can represent the same
instant but fail `equals`. `isEqual` compares their instants; natural ordering also has a
local-field tie-breaker. Canonicalize to `Instant` for occurrence keys, and preserve offset
identity when that is actually required. See
[OffsetDateTime comparisons](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/OffsetDateTime.html#isEqual(java.time.OffsetDateTime)>).
