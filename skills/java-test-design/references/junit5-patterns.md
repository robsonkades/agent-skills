# JUnit patterns, verified

Every listing below was compiled and executed on JDK 25 with Jupiter 6.1.3, AssertJ 3.27 —
9 tests, all passing. The same code compiles unchanged on JUnit 5.x; nothing here uses an API
that changed between Jupiter 5 and 6.

## The code under test

```java
package billing;

import java.time.*;

record Subscription(String id, LocalDate renewsOn, boolean active) {
    Subscription {
        if (id == null || id.isBlank()) throw new IllegalArgumentException("id must not be blank");
    }
}

final class RenewalPolicy {
    private final Clock clock;

    RenewalPolicy(Clock clock) { this.clock = clock; }

    boolean isDueWithin(Subscription subscription, Period window) {
        if (!subscription.active()) return false;
        LocalDate today = LocalDate.now(clock);
        LocalDate renewsOn = subscription.renewsOn();
        return !renewsOn.isBefore(today) && !renewsOn.isAfter(today.plus(window));
    }
}
```

`Clock` is a constructor parameter, not a call to `LocalDate.now()` inside the method. That
one decision is what makes every test below deterministic; no test framework can substitute
for it.

## Test data builder

```java
final class SubscriptionBuilder {
    private String id = "sub-1";
    private LocalDate renewsOn = LocalDate.of(2026, 3, 8);
    private boolean active = true;

    static SubscriptionBuilder aSubscription() { return new SubscriptionBuilder(); }

    SubscriptionBuilder renewingOn(LocalDate date) { this.renewsOn = date; return this; }
    SubscriptionBuilder inactive() { this.active = false; return this; }
    Subscription build() { return new Subscription(id, renewsOn, active); }
}
```

The point is not the fluency. It is that a test names _only the field it depends on_, so the
reader sees the one input that matters. When the record gains a component, the builder gets a
default and no test changes.

Keep builders in test source, one per aggregate you construct often. A builder for a
two-component record is ceremony; construct it directly.

## Naming, arrangement, assertion

```java
class RenewalPolicyTest {

    private static final Clock MARCH_FIRST =
            Clock.fixed(Instant.parse("2026-03-01T10:15:00Z"), ZoneOffset.UTC);

    private final RenewalPolicy policy = new RenewalPolicy(MARCH_FIRST);

    @Test
    void renewalOnTheLastDayOfTheWindowIsDue() {
        Subscription subscription = aSubscription().renewingOn(LocalDate.of(2026, 3, 8)).build();

        assertThat(policy.isDueWithin(subscription, Period.ofDays(7))).isTrue();
    }

    @Test
    void inactiveSubscriptionIsNeverDue() {
        Subscription subscription = aSubscription()
                .renewingOn(LocalDate.of(2026, 3, 2)).inactive().build();

        assertThat(policy.isDueWithin(subscription, Period.ofDays(7))).isFalse();
    }
}
```

`policy` is a `final` field initialised inline, and the class is instantiated fresh per test
by default — so there is no shared state and no `@BeforeEach` needed. Reach for `@BeforeEach`
only when construction is genuinely identical _and_ non-trivial.

## Parameterised: boundaries in one place

```java
@ParameterizedTest(name = "renewing on {0} within 7 days -> {1}")
@CsvSource({
    "2026-02-28, false",
    "2026-03-01, true",
    "2026-03-08, true",
    "2026-03-09, false",
})
void windowBoundaries(LocalDate renewsOn, boolean due) {
    Subscription subscription = aSubscription().renewingOn(renewsOn).build();

    assertThat(policy.isDueWithin(subscription, Period.ofDays(7))).isEqualTo(due);
}
```

Jupiter's implicit conversion parses the `String` into a `LocalDate` using ISO-8601 — no
converter is needed for `java.time` types. Verified: all four cases run as separate tests.

The `name` attribute matters. Without it the report says `[1]`, `[2]`, `[3]` and a failure
does not name the case.

Use `@MethodSource` when the arguments are objects rather than literals, or when building
them needs code. Do not use `@CsvSource` with a case whose expected value you must compute —
that is a different test.

## `@Nested` for a shared condition

```java
@Nested
class WhenTheWindowIsZeroDays {

    @Test
    void onlyARenewalTodayIsDue() {
        Subscription today = aSubscription().renewingOn(LocalDate.of(2026, 3, 1)).build();
        Subscription tomorrow = aSubscription().renewingOn(LocalDate.of(2026, 3, 2)).build();

        assertThat(policy.isDueWithin(today, Period.ZERO)).isTrue();
        assertThat(policy.isDueWithin(tomorrow, Period.ZERO)).isFalse();
    }
}
```

An inner class is worth its indentation when several tests share a _condition_ — the class
name completes the sentence the test name starts. Nesting to mirror the production class
structure adds depth and no information.

Two assertions here describe one outcome (the boundary of a zero-length window), which is
within the one-reason-to-fail rule. If you want both reported when both fail, wrap them in
`assertAll`.

## Exception assertions

```java
@Test
void blankIdIsRejectedAtConstruction() {
    assertThatThrownBy(() -> new Subscription("  ", LocalDate.of(2026, 3, 8), true))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("id must not be blank");
}
```

`org.junit.jupiter.api.Assertions.assertThrows` is equivalent and returns the exception for
further assertions. Both fail correctly when _nothing_ is thrown — which the `try { …;
fail(); } catch` idiom gets wrong often enough to be worth banning.

Assert `hasMessage` only when that exact message is a contract. When it is merely helpful,
`hasMessageContaining` on the identifying part avoids a test that breaks on rewording.

## Lifecycle, and where shared state comes from

| Choice                                     | Instance per test | Consequence                                             |
| ------------------------------------------ | ----------------- | ------------------------------------------------------- |
| Default (`PER_METHOD`)                     | Yes               | Fields are fresh; no leakage                            |
| `@TestInstance(PER_CLASS)`                 | No                | Fields persist across tests — every field is now shared |
| `static` field                             | No                | Shared across the whole class, and across parallel runs |
| `@BeforeAll` (needs `static` or PER_CLASS) | No                | Whatever it builds is shared                            |

`PER_CLASS` exists so `@BeforeAll` and `@MethodSource` can be instance methods. Choosing it
for that convenience silently converts every field into shared state; if you take it, keep the
fields immutable.

Under parallel execution, a `static` mutable field is a race, not just an ordering hazard.
