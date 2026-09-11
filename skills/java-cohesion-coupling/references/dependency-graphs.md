# Reading the dependency graph and choosing the edge to break

## Producing the graph

```bash
jdeps -verbose:class -filter:none build/classes        # class-level edges
jdeps -verbose:package build/classes                   # package-level summary
jdeps -dotoutput /tmp/graph build/classes              # DOT files for rendering
```

Commands are templates: replace `build/classes` with actual production class roots or JARs,
and `/tmp/graph` with an isolated writable output directory. Supply resolved `--class-path`
or `--module-path`; for multi-release JARs select the target `--multi-release` version.
Treat missing dependencies and stale/incomplete artifacts as gaps, not absent coupling.
Use `-filter:none` for class-level investigation to disable package/archive filtering;
explicit `-filter` regexes and input selection still apply. Verify the selected tool's filters
against a known edge before treating absence as evidence. Keep generated production code visible,
labeling it separately when
computing source-maintenance metrics; exclude test outputs from production counts.
An absent bytecode edge is not proof of absent source coupling: `SOURCE`-retention annotations
can disappear. A use of a `static final` constant variable is compiled to its value, erasing
the field reference even if `jdeps` still reports the declaring class. Compare source/build
dependencies when changing such a contract; old binaries can retain the old value.
Under JPMS the package graph is supplemented by the module graph: `requires`
edges, which the compiler enforces and which cannot form cycles.

## Choosing the edge to break in a cycle

A simple cycle is broken by removing one participating edge; an SCC may contain several
overlapping cycles. Recompute SCCs after each proposed removal. Rank the candidates:

1. **The edge with the cheapest safe migration.** `jdeps -verbose:class -filter:none` shows which classes
   create bytecode edges; fewer sites can be cheaper, but public contracts, reflection, data
   formats and ownership may dominate the count.
2. **The edge that points against policy flow** — from the package that decides
   less towards the package that decides more.
3. **The edge caused by a misplaced class.** Ask of each contributing class:
   which package's changes does it track? If it tracks the _other_ package, the
   fix is a move, not an inversion.

Moving a class may avoid a new interface and wiring, but published names, reflection and
serialization can make it costlier than inversion. Establish ownership and migration cost
before choosing; reach for java-dependency-inversion when the abstraction belongs with the
consumer and the concrete implementation should remain elsewhere.

## Worked example: an inventory cycle

`jdeps -verbose:package` reports:

```text
inv.pricing   -> inv.stock
inv.stock     -> inv.pricing
inv.reporting -> inv.pricing
inv.reporting -> inv.stock
```

`inv.stock` and `inv.pricing` form a cycle. They can compile together within one artifact,
but cannot be independently ordered as a package DAG. Separate build/module and release
constraints need their own evidence. Assume the
following illustrative history and class-level detail, rather than measured repository evidence:

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

This sketch assumes all callers are controlled and migrated together. Deleting the public
method breaks external source/binary callers; if it is published, use java-api-design to
plan compatibility, and do not call deletion a safe internal cleanup. With that assumption,
`Warehouse.totalValue` is deleted; callers use `new StockValuation(prices)
.value(warehouse.levels())`. The graph becomes acyclic:

```text
inv.pricing   -> inv.stock
inv.reporting -> inv.pricing
inv.reporting -> inv.stock
```

**Trade-offs.** Callers now assemble two objects where one method existed —
valuation stopped being discoverable from `Warehouse`. `levels()` was already public in
the before sketch; its shallow snapshot does not make `StockLevel` immutable. That surface
is accepted because valuation is a whole-inventory
concern. The alternative — keeping `totalValue` and inverting with a
`Valuer` interface in `inv.stock` — can keep the implementation in `inv.pricing`, with
composition supplying it. It adds an abstraction/wiring cost and changes the old method's
parameter contract unless a migration is designed. Choose based on ownership and caller
compatibility, not the assumption that an interface forces implementation into its package.

**Verification.** Re-run `jdeps -verbose:package`: no `inv.stock -> inv.pricing`
line, then run valuation/caller tests. If the project already uses JPMS or a separate module
migration is authorized, separate named modules can reject a cyclic `requires` graph at
compile time. This does not prohibit runtime/semantic cycles or package cycles inside one module:

```java
module inv.stock { exports inv.stock; }

module inv.pricing {
    requires inv.stock;
    exports inv.pricing;
}
```

## Tool and module references

Java blocks are partial sketches: domain collaborators/imports and module source layout
must be supplied. Module declarations belong in separate `module-info.java` files; they
are an optional architecture change, not runnable alongside the classes as one source file.

- [`jdeps` for JDK 25](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jdeps.html)
- [JPMS module declarations, JLS §7.7](https://docs.oracle.com/javase/specs/jls/se25/html/jls-7.html#jls-7.7)
- [`Module` exports, opens and readability](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Module.html)
- [JLS 25 binary representation of constant variables](https://docs.oracle.com/javase/specs/jls/se25/html/jls-13.html#jls-13.1)
  explains why inlined field uses cannot be recovered as symbolic field references.
- [JLS 25 annotation retention](https://docs.oracle.com/javase/specs/jls/se25/html/jls-9.html#jls-9.6.4.2)
  specifies omission of source-only annotations from binaries.
- [OpenJDK 25.0.3 jdeps options](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/jdk.jdeps/share/classes/com/sun/tools/jdeps/JdepsTask.java)
  provides the implementation's filter defaults and option handling; check the actual tool build.
