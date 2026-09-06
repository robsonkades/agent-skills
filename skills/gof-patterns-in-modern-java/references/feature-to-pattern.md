# Feature to pattern

## Records

**Changes:** Builder, Prototype, Memento, Command, Value objects.

A record gives a constructor with named components, `equals`/`hashCode`/`toString`, and shallow
immutability, for one line. The consequences:

- **Builder** is useful when staged construction, ambiguous positional values or invariants
  justify it. No component-count threshold proves the choice; constructor type checking does
  not catch swapped same-typed arguments.
- **Prototype** mostly dissolves: an immutable record needs no copy, and where a variant is needed
  a `withX` method beats a copy step that must be kept in sync with the field list.
- **Memento** becomes "hold the previous reference", and an undo stack becomes a stack of
  references with structural sharing rather than a stack of copies.
- **Command** can be a record; persistence still requires schema, validation, compatibility and
  idempotency contracts. A Java record alone is not a durable wire format.

The caveat that survives: a record component holding a mutable `List` is not immutable. `List.copyOf`
in the compact constructor snapshots list structure, not mutable elements. Deep immutability,
sharing, record rendering and ownership still need review (`java-immutability`, `gof-memento`).

## Sealed types

**Changes:** Visitor, State, Composite, Interpreter, Strategy, Chain of Responsibility.

Sealing a hierarchy makes the variant set known to the compiler. That single fact is what makes an
exhaustive `switch` a completeness check rather than a hope, and it is the property Visitor's
double dispatch was buying.

The trade is explicit and worth stating in review: a sealed set makes **new operations cheap** (one
more function) and **new variants loud** (affected exhaustive switches without catch-all cases
must be revisited on recompilation). A non-sealed branch remains open; existing binaries are not
magically recompiled. Classic Visitor also favors adding operations over a known element family.
Choose by which change and compatibility boundary the domain actually produces.

## Pattern matching for `switch`, with deconstruction

**Changes:** Visitor, State, Composite, Interpreter, and every `instanceof` chain.

Partial Java 21 example: Node is sealed with Text and Section record variants; render helpers
and domain types are omitted. No preview flags are needed for record patterns/pattern switch.

```java
return switch (node) {
    case Text(String value, var emphasis) -> render(value, emphasis);
    case Section(var title, var children) -> renderSection(title, children);
};      // no default: adding a variant breaks this at compile time
```

Deconstruction invokes record component accessors; it does not bypass or restore encapsulation.
Accessor exceptions can affect matching. The shown switch rejects a null selector; add `case null`
only when the operation defines null behavior
(`java-null-safety`).

Prefer no catch-all when every variant needs explicit handling. A deliberate default may reject
unsupported variants, but removes the compile-time reminder to handle new ones. See
[Java 21 record patterns](https://docs.oracle.com/en/java/javase/21/language/record-patterns.html).

## Lambdas, method references, functional interfaces

**Changes:** Strategy, Command, Factory Method, Observer, Template Method, Visitor (as folds).

A functional interface can be implemented by a lambda; a sealed functional-shaped interface
cannot be a lambda target ([JLS 17 §9.8](https://docs.oracle.com/javase/specs/jls/se17/html/jls-9.html#jls-9.8)).
State, identity or lifecycle may still justify named classes:

```text
Strategy         Comparator, UnaryOperator, a domain DiscountRule
Command          Runnable, Callable, or a record + a handler function
Factory Method   Supplier<T>, Function<Args, T>, T::new
Observer         Consumer<Event>
Template Method  a final class taking its steps as function parameters
```

Use a domain-named functional interface when it adds semantics or a checked-failure contract;
standard Function/Comparator types are suitable when their contracts already fit.

The cost to weigh: lambdas have no useful class names, so `lambda$price$3` appears in stack traces,
thread dumps and profiles. Compare real diagnostics before replacing functions with classes.

## Generics

**Changes:** Visitor (`Visitor<R>` instead of a mutable result field), Builder (staged builders),
Abstract Factory (a typed family), Command (`Command<R>`).

Returning a value can remove a mutable result field, but other visitor state and collaborators
still determine whether it is safe to share.

## `Optional`

**Changes:** Chain of Responsibility, Null Object, Factory Method.

`Optional<Result> handle(Request)` expresses "I have no opinion" in one call, replacing the
`supports()`-then-`handle()` pair that can disagree when absence really means decline. Distinguish
decline, rejection and failure; Optional should not collapse them. Prefer it for return absence;
field/parameter decisions depend on domain and framework contracts (`java-optional`).

## Immutable collections and copy factories

**Changes:** Prototype, Memento, Flyweight, Builder, Composite.

`List.of`, `List.copyOf` and `Map.of` provide unmodifiable structures, not deep copies. Validate
mutable leaves and obtain coherent source snapshots. Factory result identity/reuse is not a
portable contract; do not rely on `List.of()` identity or claim a guaranteed Flyweight.

## Default methods

**Changes:** Adapter, Visitor, Bridge.

A default method adapts an interface to implementors that cannot supply a new operation, which
removes one reason for an abstract adapter class. In Visitor, a `default visit` is a hazard rather
than a convenience: it silently absorbs new element types.

## Dependency injection

**Changes:** Singleton, Abstract Factory, Factory Method, Strategy selection, Bridge.

Spring singleton scope is per bean definition/container. Profiles can assemble families, but
active combinations need invariant checks. Autowiring Map<String,T> collects matching beans by
bean name; an arbitrary domain-keyed Map<K,T> requires explicit construction/registration.

The list contains eligible registered beans after configuration/qualifiers, not every class on
the classpath. Build
the map from a key the strategy declares, and fail at startup on a duplicate or a missing key
(`java-dependency-inversion`).
See [Spring autowiring](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html).

## Virtual threads

**Changes:** Command (as deferral), Decorator (async layers), Proxy (async remote), Observer
(async listeners).

Much machinery exists to avoid blocking a scarce platform thread: task objects submitted to
executors, callback-based decorators, reactive chains. When blocking is cheap, a straightforward
blocking call on a virtual thread may simplify the code. Compare the actual cancellation,
backpressure and resource contracts rather than assuming equivalent behavior.

What does **not** change: durability. A Command that exists so work survives a restart still needs a
durable representation. Scheduling, isolation and overload control may still require queues;
virtual threads do not increase downstream capacity or accelerate CPU-bound work
(`thread-sizing-and-virtual-threads`).

## Structured concurrency

**Changes:** Facade (remote fan-out), Mediator, Composite (parallel traversal), Scatter-gather.

`StructuredTaskScope` can bind fan-out lifetime and failure policy. In Java 25 it is preview and
uses a release-specific API; compile with `javac --enable-preview --release 25` and run with
`java --enable-preview` on matching JDK 25 only when the project permits preview. Cancellation
interrupts cooperatively; close waits for children, so uninterruptible work can delay it indefinitely.
Correct CompletableFuture composition remains an alternative
(`structured-concurrency`).
See [JDK 25 API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/StructuredTaskScope.html).

## `ScopedValue`

**Changes:** Chain of Responsibility, Mediator, Command, Decorator, Observer — anything that
carries per-request context.

ThreadLocal needs lifecycle cleanup and does not automatically follow arbitrary submitted tasks.
`ScopedValue` is bound for a dynamic scope and is inherited by structured-concurrency forks, which
is exactly the shape a request travelling through a chain of handlers needs
(`scoped-values`).
ScopedValue is final in Java 25; inheritance through StructuredTaskScope still uses that release's
preview API. Ordinary executor submissions do not automatically inherit bindings, and an immutable
binding does not freeze a mutable bound object.

## Stream Gatherers

**Changes:** Iterator, Chain of Responsibility (as a pipeline).

Gatherers are final in Java 24; earlier preview APIs differ. Keep Iterator when explicit pull
control is required rather than introducing a stream merely for a new API.

Stateful and windowing operations that previously required a hand-written `Iterator` with a buffer
— sliding windows, run-length grouping, fold-with-emit — are expressible as a gatherer in a stream
pipeline, keeping laziness and short-circuiting.

## Framework mechanisms, briefly

| Mechanism                                | Pattern it supplies                                  |
| ---------------------------------------- | ---------------------------------------------------- |
| Singleton scope                          | Singleton (lifecycle half only)                      |
| `@Transactional`, `@Cacheable`, `@Async` | Proxy                                                |
| Servlet `Filter`, `HandlerInterceptor`   | Chain of Responsibility / Decorator                  |
| `RestClient` interceptors and builders   | Decorator                                            |
| `ApplicationEventPublisher`              | Observer                                             |
| Spring Data repositories                 | Repository abstraction; may combine adapters/proxies |
| JPA lazy associations                    | Proxy or enhancement; provider/mapping dependent     |
| `Converter`/`Formatter` registries       | Strategy, keyed                                      |
| Resilience4j decorators                  | Decorator                                            |

Using these is not "not using patterns" — it is using the pattern the framework already
implemented. Ordering, configuration, error handling and observability still require project
validation; reactive streams and brokers add contracts beyond an in-process Observer.
