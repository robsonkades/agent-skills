# The loop, executed

A real session on JDK 25 with Jupiter 6.1.3 and AssertJ 3.27. Every output below is the actual
runner output, not a reconstruction.

**The requirement:** split a total into N instalments in cents, such that the instalments
always sum back to the total.

## Red 1 — a failing test, and a stub that fails honestly

```java
final class Instalments {
    static List<BigDecimal> split(BigDecimal total, int count) {
        throw new UnsupportedOperationException("not implemented");
    }
}
```

```java
@Test
void anAmountThatDoesNotDivideEvenlyPutsTheRemainderInTheFirstInstalment() {
    List<BigDecimal> instalments = Instalments.split(new BigDecimal("100.00"), 3);

    assertThat(instalments).containsExactly(
            new BigDecimal("33.34"), new BigDecimal("33.33"), new BigDecimal("33.33"));
}
```

Run:

```
[         0 tests successful      ]
[         1 tests failed          ]
    => java.lang.UnsupportedOperationException: not implemented
```

The stub throws rather than returning `null` or an empty list on purpose. A stub that returns
a plausible empty value produces a failure message about a size mismatch, which looks like a
logic failure; `UnsupportedOperationException` says unambiguously "you have not written this
yet". The first red should never be ambiguous.

Note also that the test names the _rule_ (the remainder goes first), not the method. That
decision was already made — the alternative, spreading the extra cent over the last
instalment, is a different requirement and would have been a different test.

## Green 1 — the simplest thing that could work

```java
static List<BigDecimal> split(BigDecimal total, int count) {
    BigDecimal base = total.divide(BigDecimal.valueOf(count), 2, RoundingMode.DOWN);
    BigDecimal remainder = total.subtract(base.multiply(BigDecimal.valueOf(count)));

    List<BigDecimal> instalments = new ArrayList<>(count);
    instalments.add(base.add(remainder));
    for (int i = 1; i < count; i++) {
        instalments.add(base);
    }
    return List.copyOf(instalments);
}
```

```
[         1 tests successful      ]
[         0 tests failed          ]
```

`RoundingMode.DOWN` and an explicit remainder rather than `HALF_UP` on each share: rounding
each instalment independently is the classic way to end up a cent short of the total. There is
no test for that yet — which is exactly what the next step is for.

## Red 2 — stating the invariant finds a real defect

Two tests added: the invariant across many counts, and the degenerate input.

```java
@ParameterizedTest(name = "{0} instalments still sum to the total")
@ValueSource(ints = {1, 2, 3, 6, 7, 12})
void instalmentsAlwaysSumToTheTotal(int count) {
    BigDecimal total = new BigDecimal("100.00");

    BigDecimal sum = Instalments.split(total, count).stream()
            .reduce(BigDecimal.ZERO, BigDecimal::add);

    assertThat(sum).isEqualByComparingTo(total);
}

@Test
void zeroInstalmentsIsRejected() {
    assertThatThrownBy(() -> Instalments.split(new BigDecimal("100.00"), 0))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("count must be positive");
}
```

Run:

```
[         7 tests successful      ]
[         1 tests failed          ]

MethodSource [className = 'billing.InstalmentsTest', methodName = 'zeroInstalmentsIsRejected']
    => java.lang.AssertionError:
Expecting actual throwable to be an instance of:
  java.lang.IllegalArgumentException
but was:
  java.lang.ArithmeticException: / by zero
	at java.base/java.math.BigDecimal.divideAndRound(BigDecimal.java:4840)
```

Two things happened, and both are the loop doing its job:

- The invariant held for all six counts, including 7 and 12 where the remainder is not a
  single cent. That is evidence the `DOWN`-plus-remainder approach was right — evidence the
  first test alone did not provide.
- The degenerate case exposed a defect that had already been written and would have shipped: a
  caller passing 0 gets `ArithmeticException: / by zero` from deep inside `BigDecimal`, not a
  message naming their mistake.

`isEqualByComparingTo`, not `isEqualTo`: `BigDecimal.equals` compares scale, so `100.00` and
`100.0` are unequal. Asserting a sum with `isEqualTo` produces a failure that looks like an
arithmetic bug and is a scale mismatch (java-test-design).

## Green 2

```java
if (count <= 0) throw new IllegalArgumentException("count must be positive");
```

```
[         8 tests successful      ]
[         0 tests failed          ]
```

## Refactor — while green, and verified after

The extracted `shares` removes a repeated conversion and names the quantity:

```java
static List<BigDecimal> split(BigDecimal total, int count) {
    if (count <= 0) throw new IllegalArgumentException("count must be positive");

    BigDecimal shares = BigDecimal.valueOf(count);
    BigDecimal base = total.divide(shares, 2, RoundingMode.DOWN);
    BigDecimal remainder = total.subtract(base.multiply(shares));

    List<BigDecimal> instalments = new ArrayList<>(count);
    instalments.add(base.add(remainder));
    for (int i = 1; i < count; i++) {
        instalments.add(base);
    }
    return List.copyOf(instalments);
}
```

Suite re-run: 8 passing. That re-run is not optional — a refactoring that has not been
verified is an edit.

## What the session shows about step size

Four runs, each under a minute of work, each with an unambiguous result. When a step goes
wrong the cause is in the last edit, and the fix is to revert that edit rather than to debug.

The step that would have been too big: writing `split`, the validation, the invariant and a
currency-aware variant before running anything. The suite would then have gone red in three
places at once, and separating an arithmetic mistake from a validation mistake from a scale
mistake is exactly the debugging the loop exists to avoid.
