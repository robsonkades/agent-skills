---
name: java-date-and-time
description: >-
  Model and validate Java date and time values when choosing between civil dates,
  local date-times and instants, resolving DST gaps or overlaps, applying calendar
  arithmetic, testing time-dependent rules, or preserving temporal meaning across
  parsing, JSON and JDBC. Covers java.time types, region versus offset, Duration
  versus Period, Clock injection and precision contracts. Does not cover calendar
  job scheduling or operational timeout budgets (timeouts-and-deadlines).
---

# Java Date and Time

Choose a temporal representation from the business meaning, then preserve that meaning
through conversion, arithmetic and external boundaries. A timestamp-shaped string is not
enough evidence to decide whether the value denotes an instant or a civil date-time.

## Establish the contract

Inspect compiler release/toolchain, runtime image, existing temporal types, serializer
configuration, driver/database versions, schema and representative payloads. Guidance and
examples target Java 17 APIs without preview features or added dependencies; preserve the
project baseline. Zone rules come from the runtime's provider, so the JDK build and available
rules matter even when source code is unchanged.

For the affected value, establish its meaning, authoritative zone if any, precision and
range, equality semantics, and interval boundaries. Use existing contracts first. If a
material policy is absent, expose the choice and its consequence before changing persisted
data or a public format; do not silently infer UTC or the host's zone.

## Choose the representation

| Meaning                                               | Representation   | Consequential constraint                                                                           |
| ----------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| Recorded occurrence, audit timestamp, absolute expiry | `Instant`        | Display requires a zone; it does not remember the sender's offset or region.                       |
| Birthday, service date, accounting date               | `LocalDate`      | No time or zone; inventing midnight UTC can change the displayed date.                             |
| Civil date and time awaiting interpretation           | `LocalDateTime`  | No unique instant until a zone or offset and any ambiguity policy are supplied.                    |
| Date-time with a transmitted UTC offset               | `OffsetDateTime` | Identifies an instant; an offset cannot recover a region's transition rules.                       |
| Resolved date-time whose region rules matter          | `ZonedDateTime`  | Contains local fields, zone and resolved offset; preserve the zone separately if storage drops it. |

Use `LocalTime`, `YearMonth` or `MonthDay` when the domain has only that information, rather
than inserting a dummy date. These distinctions follow the
[Java 17 temporal model](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/package-summary.html).

## Work the affected path

1. **Identify every interpretation step.** Search for `now()`, `systemDefault()`, `atZone`,
   `toLocalDateTime`, numeric epoch conversions, formatters and database mappings. Mark where
   information is supplied or discarded; a display conversion should preserve the instant.
2. **Resolve civil time deliberately.** A region such as `Europe/Paris` is not a fixed
   `+01:00`. When a local value becomes an instant, specify gap and overlap behavior before
   accepting an API default. For resolution, date windows or calendar arithmetic, read
   [zones and calendar arithmetic](references/zones-and-calendar.md).
3. **Choose the clock and amount independently.** Current business time comes from an injected
   `Clock`; elapsed process time comes from `System.nanoTime()` differences. Use `Period` for
   calendar units and `Duration` for seconds/nanoseconds; a duration day is 24 hours, not a
   promise about a civil day. For time-dependent code and regression checks, read
   [clocks and deterministic tests](references/clocks-and-tests.md).
4. **Specify the boundary before converting.** State accepted grammar, zone/offset requirements,
   fractional precision, epoch units if numeric, nullability and rejection/rounding rules.
   Read [parsing and persistence](references/parsing-and-persistence.md) for wire or database work.
   Type compatibility alone does not establish a lossless round trip.
5. **Validate the property the domain needs.** Compare `Instant` values for occurrence identity;
   compare full values only when offset/zone identity matters. Exercise the affected boundary,
   including exact expiry, an invalid or ambiguous input, and precision loss where applicable.
   Run on the target toolchain when available; distinguish API/source compatibility from
   runtime and driver integration evidence.

## Deliver the decision

For a small fix, return the temporal meaning, chosen conversion/policy, changed code and
checks run. A boundary review should additionally identify the first lossy or ambiguous
conversion, show an input that exposes it, and state any unresolved product or storage
contract. Do not label a hypothetical driver round trip as tested.

Operational deadlines, timeout propagation and cancellation belong to
**timeouts-and-deadlines**. Public format changes may also need **rpc-and-api-contracts**;
broader database mapping decisions belong to **orm-structural-mapping**. These are optional
handoffs, not prerequisites for an ordinary temporal fix. Calendar job scheduling is outside
this skill; choosing a civil-time policy does not implement a scheduler.
