# Enum patterns

These are partial sketches unless all declarations are shown: supply domain types,
constructors/accessors, imports (`java.util`, stream collectors/functions) and omitted bodies.
The currency set is an illustrative supported subset, not a replacement for an evolving
currency catalog. `toUnmodifiableMap` needs Java 10+, switch expressions Java 14+.

## Data per constant: fields, never position

```java
public enum Currency {
    BRL(986, 2, "R$"),
    USD(840, 2, "$"),
    JPY(392, 0, "¥");

    private final int isoNumeric;      // the external identity, independent of declaration order
    private final int minorUnits;
    private final String symbol;

    Currency(int isoNumeric, int minorUnits, String symbol) { ... }

    private static final Map<Integer, Currency> BY_ISO =
        Arrays.stream(values()).collect(toUnmodifiableMap(Currency::isoNumeric, identity()));

    public static Optional<Currency> byIso(int code) { return Optional.ofNullable(BY_ISO.get(code)); }
}
```

Points that generalise:

- This reverse lookup builds a `static final` map after the constants; duplicate codes fail
  collection instead of silently overwriting an identity. A small, infrequent linear lookup may
  be adequate; choose by clarity and measured need rather than assuming a map improves performance.
- Define unknown-code behavior explicitly: `Optional`, a domain exception or an established
  nullable contract can fit. `valueOf` recognizes names, not the code field. Unexpected external
  codes need deliberate handling, not accidental coercion; see java-optional and java-exception-design.
- Constants are constructed before later static fields are initialized. Direct access from an
  enum constructor to its non-constant static fields is prohibited; indirect helper access can
  still observe uninitialized state. Build the lookup after constant construction.

## Behaviour per constant

Three forms; choose by behavior ownership and the changes the contract must support:

**1. Constant-specific method bodies** — when each constant genuinely behaves differently.

```java
public enum Operation {
    PLUS  { public double apply(double x, double y) { return x + y; } },
    MINUS { public double apply(double x, double y) { return x - y; } };

    public abstract double apply(double x, double y);
}
```

The abstract method makes a new constant a compile error until its body is written. An exhaustive
switch expression can provide a similar source-recompilation check, with different ownership and
separate-compilation behavior.

**2. Strategy enum** — when constants group into a handful of behaviours and repeating the
body would duplicate logic.

```java
public enum PayrollDay {
    MONDAY(PayType.WEEKDAY), SATURDAY(PayType.WEEKEND), SUNDAY(PayType.WEEKEND);

    private final PayType payType;
    PayrollDay(PayType payType) { this.payType = payType; }
    int pay(int minutesWorked, int payRate) { return payType.pay(minutesWorked, payRate); }

    private enum PayType {                       // the strategy, itself an enum
        WEEKDAY { int overtimePay(int m, int r) { ... } },
        WEEKEND { int overtimePay(int m, int r) { ... } };
        abstract int overtimePay(int minutes, int rate);
        int pay(int minutes, int rate) { return minutes * rate + overtimePay(minutes, rate); }
    }
}
```

Adding a constant now forces a decision about which strategy applies. Payroll arithmetic is
schematic: specify rate units, numeric bounds and overflow policy before use; this is not
validated money arithmetic.

**3. A `switch` in the caller** — legitimate when the behaviour belongs to the caller rather
than to the enum: rendering, mapping to a transport code, or applying a policy that the
enum's own module must not know about. Omit a catch-all when every new constant needs an
explicit decision on source recompilation:

```java
String label = switch (status) {
    case NEW      -> "Novo";
    case SHIPPED  -> "Enviado";
    case CANCELLED-> "Cancelado";
};   // recompiling with a newly uncovered constant requires a decision here
```

A `default` hides missing explicit cases in that switch, but can be the intended behavior for
future constants. Test that fallback rather than removing it by rule; observe unexpected values
only as the operational contract warrants. A raw unknown string may fail decoding before any
switch runs, so boundary decoding needs its own policy.

## Extensibility through interfaces

An enum cannot be extended, and that is a deliberate constraint. When a set of operations must
be extensible — by another module, another team, or a plugin — declare an interface and let
enums implement it:

```java
public interface Operation { double apply(double x, double y); }

public enum BasicOperation implements Operation { PLUS { ... }, MINUS { ... }; }
public enum ExtendedOperation implements Operation { EXP { ... }, REMAINDER { ... }; }

// Callers work with the interface; a bounded type parameter keeps enum capabilities
static <T extends Enum<T> & Operation> void runAll(Class<T> opType, double x, double y) {
    for (Operation op : opType.getEnumConstants()) { ... }
}
```

The limitation is real: implementation _inheritance_ between the enums is impossible, so shared
logic goes in a helper class or a default method. Open plugins or per-instance data may call for
ordinary interface implementations and a registry. Sealed variants with records fit a deliberately
closed data-bearing family; size or state alone does not justify closing an existing extension API.

## EnumSet and EnumMap

```java
// Bit fields — do not write these
public static final int STYLE_BOLD = 1, STYLE_ITALIC = 2, STYLE_UNDERLINE = 4;
void applyStyles(int styles) { ... }                      // untyped, unprintable, easy to mis-OR

// EnumSet — same representation internally, with a type
void applyStyles(Set<Style> styles) { ... }
applyStyles(EnumSet.of(Style.BOLD, Style.ITALIC));
```

- `EnumSet` uses bit vectors and iterates in declaration order. Specific storage layouts
  and comparisons against primitive bit fields depend on the JDK and workload; object and
  wrapper overhead means equivalent total footprint or speed must not be assumed.
- The bit-field contrast is for a new local API. Preserve published masks and unknown bits when
  translating an existing protocol; enum declaration positions are not that protocol's bit numbers.
- Accept `Set<Style>` in the parameter, not `EnumSet<Style>` — callers may hold any set — and
  return an unmodifiable copy: `EnumSet` is mutable and not thread-safe. `Set.copyOf` does
  not promise declaration-order iteration or an `EnumSet` representation. For arbitrary
  possibly empty sets, start with `EnumSet.noneOf(Style.class)`, `addAll(styles)`, then wrap
  the owned copy with `Collections.unmodifiableSet`. `EnumSet.copyOf(emptyHashSet)` throws
  because the element type cannot be inferred; copying an empty `EnumSet` works.
- `EnumSet` cannot contain null; `EnumMap` cannot contain null keys but permits null values.
  Preserve or deliberately migrate caller contracts before replacing collections that accept them.
- `EnumMap` is an array indexed internally by ordinal, wrapped in the `Map` interface. It
  avoids hand-maintained index mappings, and its iteration order is declaration order. An owned
  array initialized from the same enum version can also remain correct; compare actual contracts
  and measured costs before replacing it.
- Neither is a concurrent collection. Prefer immutable publication; otherwise choose external
  synchronization, copy-on-write, or `ConcurrentHashMap` according to update/read patterns and
  atomic-operation needs.

## Enums as state machines

An abstract transition method requires an implementation for each state, but does not check
every state/event pair. Define null/unknown/invalid-event policy and test a transition table:

```java
public enum OrderState {
    NEW       { OrderState on(Event e) { return e == PAID ? PAID_STATE : this; } },
    PAID_STATE{ OrderState on(Event e) { return e == SHIPPED ? SHIPPED_STATE : this; } },
    SHIPPED_STATE { OrderState on(Event e) { return this; } };
    abstract OrderState on(Event event);
}
```

Keep per-entity state and resource ownership outside shared enum constants. An enum may still
describe statuses or transition policy when a domain object supplies guard data or owns effects;
its presence does not make read-decide-write atomic. Preserve an adequate authoritative conditional
update/transaction or choose concurrency control for the actual state location. A distributed lease
is only one option and needs protected-resource enforcement, not merely a careful enum — see
gof-state, offline-concurrency-control and distributed-locks-and-leases.

## Performance notes worth knowing, not optimising for

- Inspect/profile the target compiler's `values()` implementation before caching; allocation
  observations are workload-specific (allocation-profiling).
- `EnumSet`/`EnumMap` specialize enum operations; prefer them for suitable contracts, but
  measure before claiming them faster than hashing for the actual workload.
- Enum-switch lowering (`$SwitchMap`, direct ordinal dispatch, type-switch machinery) is a
  compiler/JDK implementation detail. Judge performance from generated bytecode/JIT evidence;
  separate compilation still means old bytecode only knew the constants visible when compiled.

Primary references: [EnumSet API and empty-copy behavior](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/EnumSet.html)
and [EnumMap API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/EnumMap.html),
[Enum identity and ordering](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Enum.html),
and [JLS enum members](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.9.3).
