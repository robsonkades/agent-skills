# Reading the dependency graph and choosing the edge to break

## Producing the graph

```bash
jdeps -verbose:class -filter:none build/classes        # class-level edges
jdeps -verbose:package build/classes                   # package-level summary
jdeps -dotoutput /tmp/graph build/classes              # DOT files for rendering
```

Exclude generated code before analysing, and run over production classes only.
Under JPMS the package graph is supplemented by the module graph: `requires`
edges, which the compiler enforces and which cannot form cycles.

## Choosing the edge to break in a cycle

A cycle is broken by removing one edge. Rank the candidates:

1. **The edge with the cheapest safe migration.** `jdeps -verbose:class` shows which classes
   create bytecode edges; fewer sites can be cheaper, but public contracts, reflection, data
   formats and ownership may dominate the count.
2. **The edge that points against policy flow** — from the package that decides
   less towards the package that decides more.
3. **The edge caused by a misplaced class.** Ask of each contributing class:
   which package's changes does it track? If it tracks the _other_ package, the
   fix is a move, not an inversion.

Moving a class is cheaper than inverting an edge (no new interface, no new
wiring), so establish first that the class is genuinely in the right place and
only then reach for java-dependency-inversion.

## Worked example: an inventory cycle

`jdeps -verbose:package` reports:

```text
inv.pricing   -> inv.stock
inv.stock     -> inv.pricing
inv.reporting -> inv.pricing
inv.reporting -> inv.stock
```

`inv.stock` and `inv.pricing` form a cycle: neither can be compiled, released or
reasoned about alone. Class-level detail shows each direction's cause:

- `inv.pricing -> inv.stock`: `VolumeDiscount` reads `StockLevel.quantity()` —
  several call sites; pricing genuinely consumes stock data.
- `inv.stock -> inv.pricing`: one method —

```java
package inv.stock;

import inv.pricing.PriceList;   // the only import of pricing in this package
import java.math.BigDecimal;
import java.util.List;

public final class Warehouse {
    private final List<StockLevel> levels;

    public Warehouse(List<StockLevel> levels) { this.levels = List.copyOf(levels); }

    public List<StockLevel> levels() { return levels; }

    public BigDecimal totalValue(PriceList prices) {
        return levels.stream()
                .map(l -> prices.unitPrice(l.sku()).multiply(BigDecimal.valueOf(l.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
```

**Analysis.** `totalValue` is valuation: it changes when pricing policy changes
(currency handling, promotional pricing entered valuation twice in the log) and
never when stock handling changes. The class tracks the wrong package for that
method — a misplaced concern, so the fix is a move, not an interface. The
opposite edge (`pricing -> stock`) points from the deciding package towards the
data it consumes; one direction is healthy, and it stays.

**After.** Valuation lives with pricing, consuming stock data through its public
surface:

```java
package inv.pricing;

import inv.stock.StockLevel;
import java.math.BigDecimal;
import java.util.List;

public final class StockValuation {
    private final PriceList prices;

    public StockValuation(PriceList prices) { this.prices = prices; }

    public BigDecimal value(List<StockLevel> levels) {
        return levels.stream()
                .map(l -> prices.unitPrice(l.sku()).multiply(BigDecimal.valueOf(l.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
```

`Warehouse.totalValue` is deleted; callers use `new StockValuation(prices)
.value(warehouse.levels())`. The graph becomes acyclic:

```text
inv.pricing   -> inv.stock
inv.reporting -> inv.pricing
inv.reporting -> inv.stock
```

**Trade-offs.** Callers now assemble two objects where one method existed —
valuation stopped being discoverable from `Warehouse`. `levels()` had to be
exposed; that is stamp-shaped, accepted because valuation is a whole-inventory
concern. The alternative — keeping `totalValue` and inverting with a
`Valuer` interface in `inv.stock` — would break the cycle equally but leave
valuation logic maintained by the stock package forever; wrong ownership beats
an extra interface as the thing to avoid.

**Verification.** Re-run `jdeps -verbose:package`: no `inv.stock -> inv.pricing`
line. Then make the rule physical with modules — the cycle can never return,
because the module system refuses cyclic `requires` at compile time:

```java
module inv.stock { exports inv.stock; }

module inv.pricing {
    requires inv.stock;
    exports inv.pricing;
}
```

## Tool and module references

- [`jdeps` for JDK 25](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jdeps.html)
- [JPMS module declarations, JLS §7.7](https://docs.oracle.com/javase/specs/jls/se25/html/jls-7.html#jls-7.7)
- [`Module` exports, opens and readability](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Module.html)
