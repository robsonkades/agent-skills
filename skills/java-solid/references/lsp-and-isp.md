# LSP and ISP: substitution and interface shape

## Liskov substitution

LSP is a contract rule, not an inheritance style: any code correct against the
supertype's contract must remain correct when handed the subtype. Concretely, an
override may **weaken preconditions** (accept more) and **strengthen
postconditions** (promise more), never the reverse, and must preserve the
supertype's invariants. The formal side — writing the contracts down — is the
java-design-by-contract skill; this section is the review checklist.

### Violation 1: a strengthened precondition in an override

```java
public class SettlementAccount {
    protected BigDecimal balance = BigDecimal.ZERO;

    /** Precondition: {@code amount} is positive and no greater than the balance. */
    public void withdraw(BigDecimal amount) {
        balance = balance.subtract(amount);
    }
}

public final class InstantSettlementAccount extends SettlementAccount {
    @Override
    public void withdraw(BigDecimal amount) {
        if (amount.compareTo(new BigDecimal("1000")) > 0) {
            throw new IllegalArgumentException("instant settlement capped at 1000");
        }
        super.withdraw(amount);
    }
}
```

Every caller holding a `SettlementAccount` was promised that a covered, positive
amount succeeds. Hand it the subtype and a legal call now throws. Detection: any
argument check in an override that the supertype does not make. Fix: lift the cap
into the supertype contract (a `maxWithdrawal()` the caller must consult), or stop
pretending the subtype is substitutable and model it as a separate type.

### Violation 2: throwing from an override

```java
public interface OrderRepository {
    Order find(String id);
    void save(Order order);
}

public final class ReadReplicaRepository implements OrderRepository {
    @Override public Order find(String id) { /* query the replica */ return null; }
    @Override public void save(Order order) {
        throw new UnsupportedOperationException("replica is read-only");
    }
}
```

The implementor is announcing that the interface promised more than it can honour
— which is simultaneously the ISP evidence (see below). A new unchecked exception
from an override is a strengthened precondition in disguise: "callable only if you
never call `save`". Detection: `UnsupportedOperationException` or any `throw new`
in an override with no counterpart in the supertype's documented behaviour.

### Violation 3: asymmetric equals across a subclass

```java
public class Sku {
    protected final String code;
    public Sku(String code) { this.code = code; }
    @Override public boolean equals(Object o) {
        return o instanceof Sku other && code.equals(other.code);
    }
    @Override public int hashCode() { return code.hashCode(); }
}

public final class VersionedSku extends Sku {
    private final int version;
    public VersionedSku(String code, int version) { super(code); this.version = version; }
    @Override public boolean equals(Object o) {
        return o instanceof VersionedSku other
                && code.equals(other.code) && version == other.version;
    }
    @Override public int hashCode() { return code.hashCode() * 31 + version; }
}
```

`new Sku("A1").equals(new VersionedSku("A1", 2))` is `true`; the reverse is
`false`. Symmetry — part of the `Object.equals` contract — is broken, so
collections behave differently depending on comparison order. There is no fix that
keeps subclassing, a state-extending subclass, and a working `equals`: prefer a
`record` or `final` class per identity, or composition (`VersionedSku` _has a_
`Sku`). Detection: any `equals` override in a non-final class compared against any
subclass that adds state.

### LSP false positives

- **Covariant return types** in overrides are legal and strengthen the
  postcondition — the permitted direction.
- **Immutable subtype of a mutable-looking supertype is not automatically safe**,
  but a subtype that narrows _its own new_ API while honouring the inherited one is
  fine; only inherited methods carry the contract.
- **`List.of(...).add(...)` throwing** is not an application LSP bug to fix — it is
  a documented optional operation in the collections contract. Cite it as prior
  art for why optional operations make painful contracts, not as a licence to add
  your own.

## Interface segregation

Judge an interface by its clients. Method count is not the signal; forced,
unusable dependency is.

### Detection heuristics

- An implementor throws `UnsupportedOperationException` or leaves methods empty.
- Distinct client groups call disjoint subsets — reporting code calls the three
  read methods, ingestion calls the two write methods, nobody calls both.
- A test double must stub a dozen methods to exercise one.
- Recompilation ripples: a change for one client group forces every implementor
  and every other client to recompile.

The fix is role interfaces named for the client's need (`OrderReader`,
`OrderWriter`), with the full-service class implementing several. The replica
repository above becomes an honest `OrderReader`, and `save` stops existing where
it cannot work.

### Default methods: pressure valve and trap

A `default` method lets a published interface gain a method without breaking
implementors — the legitimate use, and the reason `Collection.stream()` could
ship. The trap: a default that cannot be implemented meaningfully at the interface
level (returning `null`, throwing, or silently doing nothing) is a fat interface
hiding behind source compatibility. Every implementor that _should_ have made a
decision now silently inherits a wrong one. Rule: a default must be a correct
implementation for every conceivable implementor, or it is deferred breakage.

### ISP false positives and limits

- **A wide but single-role interface** (a driver SPI with fifteen genuinely related
  operations, all implemented by every driver) does not need splitting; it has one
  kind of client.
- **Splitting to one-method interfaces everywhere** trades a fat interface for an
  interface explosion — N names, N seams, and composition roots juggling them. Cut
  along observed client groupings, not along method boundaries.
