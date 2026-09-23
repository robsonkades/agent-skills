# LSP and ISP: substitution and interface shape

Java examples are partial violation fixtures: supply `BigDecimal` imports and an `Order`
domain fixture, put public types in separate files, and use Java 17+ for the shown `instanceof`
pattern. Compilation alone intentionally will not detect these behavioral violations.

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

    /** For a positive covered amount, succeeds and reduces balance by that amount. */
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
argument check in an override that rejects an input the documented supertype contract accepts;
a base class need not enforce every precondition itself. A fix must preserve that success guarantee,
or model the capped account separately. An outcome/capability contract may be a useful API redesign,
but allowing rejection of formerly accepted calls weakens the existing promise and needs an explicit
consumer transition. Adding `maxWithdrawal()` alone does not make the current subtype substitutable.
When eligibility depends on mutable balance or limits, couple its check with the mutation; a separate
observation can become stale. The fixed 1000 cap in this fixture does not itself create such a race.

### Violation 2: throwing from an override

```java
public interface OrderRepository {
    Order find(String id);
    /** Persists a valid order; saving is required, not an optional capability. */
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
— which is simultaneously the ISP evidence (see below). Rejecting every valid save contradicts
the required operation. An unchecked exception is not inherently a violation if it represents
a failure already allowed by the contract. Detection: `UnsupportedOperationException` or any `throw new`
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
`false`. Symmetry — part of the `Object.equals` contract — is broken. The shown objects also have
different hash codes despite the base reporting equality, violating the equal-objects/equal-hashes
requirement. Hash-based lookup can fail as well; do not explain all collection behavior solely by
comparison order. Check both contracts: matching hashes alone does not repair asymmetric equality.
Prefer a record/final value or
composition (`VersionedSku` _has a_ `Sku`). Other coherent policies exist but change semantics:
the base can use exact-class equality so cross-subtype values are always unequal, or final base
`equals` and `hashCode` can deliberately ignore subtype state when that state is not identity. Detection:
`instanceof` equality in an extensible value class plus a state-adding subtype, especially when
the subtype overrides equality differently.

### LSP false positives

- **Covariant return types** legally narrow the declared reference return type. This alone is not
  an LSP violation or proof of substitutability: nullness, effects and failure guarantees still
  apply. An override returning `null` can compile while violating an inherited non-null promise.
- **Immutable subtype of a mutable-looking supertype is not automatically safe**,
  but a subtype that narrows _its own new_ API while honouring the inherited one is
  fine. New methods must still preserve inherited invariants and history constraints:
  mutating a value the supertype promises never changes can break a supertype alias even
  without an override. Subtype-only state may vary when those observations remain valid.
- **`List.of(...).add(...)` throwing** is not an application LSP bug to fix — it is
  a documented optional operation in the collections contract. For an application API,
  judge whether an explicit optional-capability contract and its discovery/failure handling
  serve consumers; neither an exception name nor optionality alone proves a defect.

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

When the client/implementation harm is established, role interfaces named for the client's
need (`OrderReader`, `OrderWriter`) are one fix, with the full-service class implementing several. The replica
repository above becomes an honest `OrderReader`, and `save` stops existing where
it cannot work. For an exported API, add role views or stage a consumer/implementor migration;
removing an existing method is not a mechanical compatibility-preserving split.

### Default methods: pressure valve and trap

A compatible `default` can let a published interface gain behavior without requiring an
implementation in every class, as with `Collection.stream()`. Check inherited method conflicts
and separately compiled consumers; a default is not an unconditional compatibility guarantee.
The trap: a default that cannot be implemented meaningfully at the interface
level (returning `null`, throwing, or silently doing nothing) is a fat interface
hiding behind source compatibility. Every implementor that _should_ have made a
decision now silently inherits a wrong one. Rule: a default must satisfy the documented contract
for every conforming implementor, or it is deferred breakage. Binary compatibility alone is not
behavioral compatibility.

### ISP false positives and limits

- **A wide but single-role interface** (a driver SPI with fifteen genuinely related
  operations, all implemented by every driver) does not need splitting; it has one
  kind of client.
- **Splitting to one-method interfaces everywhere** trades a fat interface for an
  interface explosion — N names, N seams, and composition roots juggling them. Cut
  along observed client groupings, not along method boundaries.

See [Collection optional operations](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Collection.html)
and [JLS 21 interface evolution](https://docs.oracle.com/javase/specs/jls/se21/html/jls-13.html#jls-13.5.7)
when deciding whether throwing or adding a default is actually a contract defect.
For equality, check both [Object.equals and Object.hashCode contracts](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Object.html).
For return-type rules, see [JLS §8.4.8.3](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.4.8.3);
covariant reference returns have been supported since Java 5, independently of behavioral contracts.
For inherited history constraints, see [Liskov and Wing, behavioral subtyping](https://www.cs.cmu.edu/~wing/publications/LiskovWing94.pdf),
especially the distinction between mutations visible and invisible to supertype clients.
