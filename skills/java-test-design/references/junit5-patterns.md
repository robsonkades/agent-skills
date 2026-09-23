# JUnit patterns

These are partial snippets, not a bundled executable suite or an assertion of a passing test
count. They use Java 17+ language features and Jupiter 5 APIs (reviewed against 5.13.4). Supply
Jupiter API/engine/params, AssertJ, java.time and static assertion/builder imports, and place
the parameterised/nested tests inside RenewalPolicyTest. Use the project's resolved versions;
Jupiter 6 compatibility must be checked with its engine/build integration rather than assumed.

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

These examples pass a fixed `Clock`, making the time input explicit. Injection alone does not
control other inputs or make an arbitrary clock deterministic; the determinism reference also
covers constrained legacy seams.

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
reader sees the relevant input. When a record gains a component, centralize incidental defaults
in the builder, but explicitly revisit tests whose behaviour depends on the new component.

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
converter is needed for this LocalDate parameter. The four rows should be reported as four invocations.

The `name` attribute expresses the scenario clearly. Default names normally include the index
and arguments, and are configurable; do not assume they contain only `[1]`, `[2]`, `[3]`.

Use `@MethodSource` when the arguments are objects rather than literals, or building them needs
code. Literal expected columns make these boundary cases easy to read; generated/property cases
can instead use an independent oracle. A computed expectation is not automatically a different
behavior, but duplicating the production decision is not an independent check.

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

Keep fallible arrangement outside the callback: parsing input or constructing a fixture inside
it can throw the expected exception before the intended operation runs. In this example the
constructor is the operation under test; keep it inside, and prepare arguments outside if their
construction can fail. Assert subsequent state or absence of side effects outside the callback
when the rejection contract includes them.

`org.junit.jupiter.api.Assertions.assertThrows` returns the exception for further assertions
and accepts the expected class or a subtype. Do not tighten a valid subtype contract merely
to make the test look stricter. For an exact-class contract, `assertThrowsExactly` is available
since Jupiter 5.8 (stable since 5.10). On older versions, capture with `assertThrows`, then compare
the expected exception class to `thrown.getClass()` using `assertEquals`; no upgrade is needed.
The optional message argument to `assertThrows` is the assertion's failure message, not a check
of the exception's message; assert that separately on the returned exception when contractual.

Exception assertions fail when _nothing_ is thrown. A correct `try/fail/catch` can also enforce
the contract; prefer framework assertions when they clarify the failure, and check that no-throw
and wrong-type paths really fail rather than rejecting the manual form by syntax.

Assert `hasMessage` only when that exact message is a contract. Use `hasMessageContaining`
when a required diagnostic fragment is the contract; omit message assertions for incidental
wording and prefer stable structured exception fields where available.

## Lifecycle, and where shared state comes from

| Choice                                     | Instance per test | Consequence                                               |
| ------------------------------------------ | ----------------- | --------------------------------------------------------- |
| Default (`PER_METHOD`)                     | Yes               | Instance fields are fresh; static/external state can leak |
| `@TestInstance(PER_CLASS)`                 | No                | Fields persist across tests — every field is now shared   |
| `static` field                             | No                | Shared across the whole class, and across parallel runs   |
| `@BeforeAll` (needs `static` or PER_CLASS) | No                | Whatever it builds is shared                              |

`PER_CLASS` permits instance `@BeforeAll` and `@MethodSource` methods and can support an owned
class-level lifecycle. Its fields persist between tests: prefer immutable fixtures, or reset and
confine mutable state deliberately. Inspect configured defaults and parallel modes before judging
isolation; runner resource locks coordinate participating tests, not unrelated background users.

Conflicting unsynchronized concurrent accesses can race; a static field alone does not prove one.
Synchronization prevents some races but does not by itself prevent stale state leaking between tests.

## Primary references

- [JUnit 5.13.4 user guide](https://docs.junit.org/5.13.4/user-guide/) — lifecycle, parameter conversion, assertions and execution configuration.
- [JUnit 5.13.4 Assertions](https://docs.junit.org/5.13.4/api/org.junit.jupiter.api/org/junit/jupiter/api/Assertions.html) — exception scope, subtype acceptance, exact-type API availability and assertion messages.
- [JUnit 5.7.2 Assertions](https://docs.junit.org/5.7.2/api/org.junit.jupiter.api/org/junit/jupiter/api/Assertions.html) — older `assertThrows` and `assertEquals` APIs for the exact-class fallback.
- [JUnit 5.13.4 TestInstance](https://docs.junit.org/5.13.4/api/org.junit.jupiter.api/org/junit/jupiter/api/TestInstance.html)
- [JUnit 5.13.4 ResourceLock](https://docs.junit.org/5.13.4/api/org.junit.jupiter.api/org/junit/jupiter/api/parallel/ResourceLock.html)
