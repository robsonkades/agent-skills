# Enum patterns

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

- The reverse lookup lives in a `static final` map built once in a static initialiser, not in a
  linear scan over `values()` per call.
- The lookup returns `Optional` (or throws a domain exception) rather than `null` or
  `IllegalArgumentException` from `valueOf` — an unknown code from outside the process is an
  expected input, not a programming error. See java-optional and java-exception-design.
- Enum constructors run during class initialisation, before the constants exist. A constructor
  cannot access a static field of its own enum (except compile-time constants), which is why
  the map is built after the constants, in a static block or via `values()`.

## Behaviour per constant

Three forms, in the order to reach for them:

**1. Constant-specific method bodies** — when each constant genuinely behaves differently.

```java
public enum Operation {
    PLUS("+")  { public double apply(double x, double y) { return x + y; } },
    MINUS("-") { public double apply(double x, double y) { return x - y; } };

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
    MONDAY(WEEKDAY), SATURDAY(WEEKEND), SUNDAY(WEEKEND);

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

Adding a constant now forces a decision about which strategy applies, and the strategies are
testable independently.

**3. A `switch` in the caller** — legitimate when the behaviour belongs to the caller rather
than to the enum: rendering, mapping to a transport code, or applying a policy that the
enum's own module must not know about. Use a switch expression with no `default` so the
compiler enforces exhaustiveness:

```java
String label = switch (status) {
    case NEW      -> "Novo";
    case SHIPPED  -> "Enviado";
    case CANCELLED-> "Cancelado";
};   // no default: adding a constant breaks the build here, which is what you want
```

What a `default` costs: with one, a new constant silently takes the fallback path in every
switch in the codebase, and the bug appears as wrong behaviour rather than as a compile error.
Prefer no `default` for enums you own; where a fallback genuinely is correct (an unknown value
from outside), make it explicit and log it.

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
logic goes in a helper class or a default method. If the extension set is large and needs
shared state, the honest answer is that this is no longer an enum — a sealed interface with
record implementations gives closed extensibility with data, and pattern matching gives the
exhaustiveness back.

## EnumSet and EnumMap

```java
// Bit fields — do not write these
public static final int STYLE_BOLD = 1, STYLE_ITALIC = 2, STYLE_UNDERLINE = 4;
void applyStyles(int styles) { ... }                      // untyped, unprintable, easy to mis-OR

// EnumSet — same representation internally, with a type
void applyStyles(Set<Style> styles) { ... }
applyStyles(EnumSet.of(Style.BOLD, Style.ITALIC));
```

- `EnumSet` is implemented as a bit vector (a single `long` for enums up to 64 constants, an
  array beyond), so it is as compact and nearly as fast as the bit field, and it prints and
  iterates in declaration order.
- Accept `Set<Style>` in the parameter, not `EnumSet<Style>` — callers may hold any set — and
  return an unmodifiable copy: `EnumSet` is mutable and not thread-safe. `Set.copyOf` produces
  an immutable set but loses the `EnumSet` representation; `Collections.unmodifiableSet(EnumSet.copyOf(s))`
  keeps it.
- `EnumMap` is an array indexed internally by ordinal, wrapped in the `Map` interface. It
  replaces the "array indexed by `ordinal()`" pattern that breaks whenever a constant is
  inserted, and its iteration order is declaration order — useful for deterministic output.
- Neither is a concurrent collection. Prefer immutable publication; otherwise choose external
  synchronization, copy-on-write, or `ConcurrentHashMap` according to update/read patterns and
  atomic-operation needs.

## Enums as state machines

An enum with an abstract transition method is a compact, exhaustively checked state machine:

```java
public enum OrderState {
    NEW       { OrderState on(Event e) { return e == PAID ? PAID_STATE : this; } },
    PAID_STATE{ OrderState on(Event e) { return e == SHIPPED ? SHIPPED_STATE : this; } },
    SHIPPED_STATE { OrderState on(Event e) { return this; } };
    abstract OrderState on(Event event);
}
```

It stays a good fit while the transitions are pure and the state is a single value. It stops
being one when transitions need side effects, guards over aggregate data, or persistence of
intermediate steps — at that point the state belongs to a domain object and the enum is just
its status field. And note the distributed caveat: a state machine held in an enum field is
per-process. Two replicas processing the same entity concurrently need optimistic locking or a
lease, not a more careful enum — see offline-concurrency-control and distributed-locks-and-leases.

## Performance notes worth knowing, not optimising for

- `values()` clones its array per call; hoist it if it is on a hot path, and measure before
  assuming it matters (allocation-profiling).
- `EnumSet`/`EnumMap` operations are array or bitmask operations — cheaper than hashing, and
  the reason to prefer them is correctness and clarity as much as speed.
- Enum-switch lowering (`$SwitchMap`, direct ordinal dispatch, type-switch machinery) is a
  compiler/JDK implementation detail. Judge performance from generated bytecode/JIT evidence;
  separate compilation still means old bytecode only knew the constants visible when compiled.
