# Worked example: from implicit to explicit contract

An inventory service tracks stock per SKU. The reservation logic works — as long as every
caller remembers the rules.

## Before

```java
public class StockLevel {
    private int onHand;
    private int reserved;

    public int getOnHand() { return onHand; }
    public void setOnHand(int onHand) { this.onHand = onHand; }
    public int getReserved() { return reserved; }
    public void setReserved(int reserved) { this.reserved = reserved; }
}

// caller A — knows the rules
if (level.getOnHand() - level.getReserved() >= qty && qty > 0) {
    level.setReserved(level.getReserved() + qty);
}

// caller B — knows most of the rules
level.setReserved(level.getReserved() + qty); // qty checked... somewhere upstream?
```

## Analysis

The contract exists — `0 <= reserved <= onHand`, reservations are positive — but it is
_implicit_: enforced by caller A, half-enforced by caller B, stated nowhere. The
consequences of implicitness:

- Every caller re-derives the availability check; the check-then-act is duplicated and
  will drift (caller B already dropped half of it).
- A violation (negative availability) is not detected at the violating call — it is
  detected at the next picking run, hours later, as an impossible warehouse instruction.
  Distance from cause to detection is the cost of an unstated invariant.
- Nothing distinguishes "caller bug" from "legitimately out of stock": both end as
  inconsistent integers.

## After

Invariants move into types and constructors; input obligations become documented, enforced entry
conditions; the postcondition is asserted and tested. The fragment targets Java 25 and elides the
`InsufficientStockException` declaration.

```java
import java.util.Objects;

/** A strictly positive number of units. */
public record Quantity(int units) {
    public Quantity {
        if (units <= 0) {
            throw new IllegalArgumentException("units must be > 0, was " + units);
        }
    }
}

/**
 * Stock position of one SKU. Invariant: {@code 0 <= reserved <= onHand}.
 * Immutable; operations return the new level.
 */
public final class StockLevel {
    private final int onHand;
    private final int reserved;

    public StockLevel(int onHand, int reserved) {
        if (onHand < 0) {
            throw new IllegalArgumentException("onHand must be >= 0, was " + onHand);
        }
        if (reserved < 0 || reserved > onHand) {
            throw new IllegalArgumentException(
                    "reserved must be in [0, %d], was %d".formatted(onHand, reserved));
        }
        this.onHand = onHand;
        this.reserved = reserved;
    }

    public int available() { return onHand - reserved; }

    /**
     * Reserves {@code quantity} units.
     *
     * @return a new level; {@code available()} decreases by exactly
     *         {@code quantity.units()}
     * @throws InsufficientStockException if {@code quantity.units() > available()}
     */
    public StockLevel reserve(Quantity quantity) {
        Objects.requireNonNull(quantity, "quantity");
        if (quantity.units() > available()) {
            throw new InsufficientStockException(
                    "cannot reserve %d units, only %d available"
                            .formatted(quantity.units(), available()));
        }
        StockLevel next = new StockLevel(onHand, reserved + quantity.units());
        assert next.available() == available() - quantity.units();
        return next;
    }
}
```

What each mechanism carries:

- **`Quantity`** removes "must be positive" from every reservation path in the module —
  callers cannot construct the invalid call. Caller B's dropped check is now
  unnecessary rather than forgotten.
- **The constructor** owns the class invariant; immutability means nothing can break it
  after construction, so no method needs to re-verify it.
- **`InsufficientStockException`** separates the expected state conflict the caller could not
  guarantee ("legitimately out of stock" — callers branch on it) from the _bug_ class
  (`IllegalArgumentException` from `Quantity` — nobody catches it). If declines turn
  out to be a routine outcome the caller always branches on, promote the result to a
  sealed type — that decision belongs to java-exception-design.
- **The `assert`** states the postcondition at its source. Disabled in production
  (`-ea` in CI and tests), its expression is not evaluated there and it pins a cheap diagnostic
  near the arithmetic. If violating this guarantee could be persisted rather than discarded with
  the new object, use an unconditional internal check as well.
- **Javadoc** turns the callers'-heads knowledge into the promise: the `@throws`
  condition _is_ the availability rule, stated once.

## Trade-offs

- Immutability changed the calling convention (`level = level.reserve(q)`); every
  existing call site was touched. For an entity under JPA this shape needs the
  mapping-layer treatment instead — the invariant-in-constructor idea survives, the
  `final` fields may not.
- `Quantity` is one more type, and one more thing to unwrap at the JSON and JDBC edges.
  Worth it here because reservations arrive from three call paths; a single-call-path
  value would not repay the wrapping.
- Callers that used to "reserve what's available, capped" now get an exception; the
  capping behaviour, if wanted, must become its own honest method (`reserveUpTo`),
  which is the contract surfacing a product decision that was previously an accident.
- Immutability makes one `StockLevel` value safe; it does not serialize updates. Two requests can
  read the same level, both create valid successors, and lose one reservation on write. The
  repository must use a version/CAS or conditional update (`available >= quantity`) and map a
  failed predicate to the same explicit state-conflict outcome.

## Verification

- Tests per contract clause, named for the clause: reserving more than available throws
  `InsufficientStockException` and leaves the level unchanged; reserving exactly
  `available()` succeeds with `available() == 0`; `new StockLevel(5, 6)` and
  `new Quantity(0)` throw naming expected and actual.
- Run the suite with `-ea` so the postcondition assert is live in CI.
- Race reservations against the real persistence mechanism and prove no oversell/lost update;
  unit tests of the value object cannot establish datastore atomicity.
- Grep callers: the old `getOnHand() - getReserved()` arithmetic appears nowhere
  outside the class; `setReserved` has no remaining callers and is deleted, not
  deprecated-and-kept.
