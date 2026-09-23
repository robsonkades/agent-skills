# Feature to pattern

## Records

**Changes:** Builder, Prototype, Memento, Command, Value objects.

A record gives a constructor with named components, `equals`/`hashCode`/`toString`, and shallow
immutability, for one line. The consequences:

- **Builder** is useful when staged construction, ambiguous positional values or invariants
  justify it. No component-count threshold proves the choice; constructor type checking does
  not catch swapped same-typed arguments.
- **Prototype** may use immutable sharing when callers do not require a distinct identity or
  owned copy. Compare copy factories and withers against the actual copy/validation contract;
  record syntax does not make either maintenance-free.
- **Memento** may capture an immutable state reference, while retaining required opaque handles,
  originator-owned restoration and history/lifetime policy. Records do not provide structural
  sharing, restoration authority or undo of external effects by themselves.
- **Command** can be a record; persistence still requires schema, validation, compatibility and
  repeat/effect contracts. Use `idempotency` when repeated effects need that mechanism; it is not
  implied by every record or persistence use. A Java record alone is not a durable wire format.

The caveat that survives: a record component holding a mutable `List` is not immutable. `List.copyOf`
in the compact constructor snapshots list structure, not mutable elements. Deep immutability,
sharing, record rendering and ownership still need review (`java-immutability`, `gof-memento`).

Generated equality compares reference components with `Objects.equals`: arrays therefore use
identity, not content. Cloning a `byte[]` in the constructor/accessor protects ownership but does
not make generated equality deep; two equal-content captures may cease to be equal map keys.
If the existing contract requires content equality, preserve matching `equals` and `hashCode`
and verify reconstruction from accessors remains equal to the original (`java-object-contracts`).
See the [Java 17 Record contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Record.html).

## Sealed types

**Changes:** Visitor, State, Composite, Interpreter, Strategy, Chain of Responsibility.

Sealing constrains permitted direct subtypes and can support an exhaustive `switch` coverage check.
That is not a check of operation semantics. Visitor double dispatch selects an operation for an
element; its coverage and fallback guarantees depend on the actual visitor API.

The trade is explicit and worth stating in review: a sealed set makes **new operations cheap** (one
more function) and **new variants loud** (affected exhaustive switches without catch-all cases
must be revisited on recompilation). A non-sealed branch remains open; existing binaries are not
magically recompiled. Classic Visitor also favors adding operations over a known element family.
Choose by which change and compatibility boundary the domain actually produces.

Adding a permitted subtype can be binary compatible while an old exhaustive pattern switch throws
`MatchException` when it receives the new variant: successful linkage is not behavioral compatibility
([JLS 21 §13.5.2](https://docs.oracle.com/javase/specs/jls/se21/html/jls-13.html#jls-13.5.2)).
Inspect which library and consumer versions can coexist. Test an old consumer against the expanded
hierarchy and recompile affected switches; choose coordinated updates or an explicit unknown-variant
policy only when it fits the existing contract. Do not add a catch-all just to conceal missing cases.

## Pattern matching for `switch`, with deconstruction

**Changes:** Visitor, State, Composite, Interpreter, and every `instanceof` chain.

Partial Java 21 example: Node is sealed with Text and Section record variants; render helpers
and domain types are omitted. No preview flags are needed for record patterns/pattern switch.

```java
return switch (node) {
    case Text(String value, var emphasis) -> render(value, emphasis);
    case Section(var title, var children) -> renderSection(title, children);
};      // no default: recompiling against a new uncovered variant fails
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
Creation         Supplier<T>, Function<Args, T>, T::new (not necessarily a subclass hook)
Observer         Consumer<Event>
Fixed sequence   composed functions; an inherited template may also invoke injected policies
```

Use a domain-named functional interface when it adds semantics or a checked-failure contract;
standard Function/Comparator types are suitable when their contracts already fit.

Generated lambda class/frame names are implementation details, and a named method reference may
already give useful diagnostics. Compare actual traces before replacing functions with classes;
do not depend on lambda object identity or a particular synthetic name
([JLS 17 §15.27.4](https://docs.oracle.com/javase/specs/jls/se17/html/jls-15.html#jls-15.27.4)).

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

A default method can provide compatible fallback behavior and remove one reason for an abstract
adapter class. In Visitor, distinguish silent omission from a declared rejection or generic visit:
[Java 17 ElementVisitor](https://docs.oracle.com/en/java/javase/17/docs/api/java.compiler/javax/lang/model/element/ElementVisitor.html)
uses defaults that call `visitUnknown`. Preserve accepted fallbacks; test required specialization
and compatibility rather than assuming defaults guarantee or defeat semantic coverage.

## Dependency injection

**Changes:** Singleton, Abstract Factory, Factory Method, Strategy selection, Bridge.

Spring singleton scope is per bean definition/container. Profiles can assemble families, but
active combinations need invariant checks. Autowiring Map<String,T> collects matching beans by
bean name; an arbitrary domain-keyed Map<K,T> requires explicit construction/registration.

Injected collections contain eligible registered beans after configuration/qualifiers, not every
class on the classpath. Retain bean-name keys when they meet the routing contract. If domain keys
are required, construct that registry explicitly and validate required coverage and the declared
duplicate/unknown-key policy at the appropriate registration boundary
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
`ScopedValue` is bound for a dynamic scope and can be inherited by structured-concurrency forks;
compare this lifetime with the actual handler chain and any escaping work
(`scoped-values`).
ScopedValue is final in Java 25; inheritance through StructuredTaskScope still uses that release's
preview API. Ordinary executor submissions do not automatically inherit bindings, and an immutable
binding does not freeze a mutable bound object.

## Stream Gatherers

**Changes:** Iterator, Chain of Responsibility (as a pipeline).

Gatherers are final in Java 24; earlier preview APIs differ. Keep Iterator when explicit pull
control is required rather than introducing a stream merely for a new API.

Stateful/windowing operations can be expressed as gatherers, but stream laziness does not bound
input work or buffering before the first output. For example, `Gatherers.fold` waits for upstream
completion, whereas `scan` emits intermediate accumulations. A downstream `findFirst` does not make
every gatherer suitable for an unbounded source. Compare emission, work/memory bounds, downstream
rejection and resource cleanup with the existing traversal contract (`gof-iterator`). See the
[Gatherer contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/Gatherer.html)
and [JDK 25 implementations](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/Gatherers.html).

## Framework mechanisms, briefly

| Mechanism                                           | Pattern it supplies                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Singleton scope                                     | Singleton (lifecycle half only)                                        |
| Proxy-mode `@Transactional`, `@Cacheable`, `@Async` | Proxy; actual advice activation and call path matter                   |
| Servlet `Filter`, `HandlerInterceptor`              | Chain of Responsibility / Decorator                                    |
| `RestClient` interceptors                           | Decorator / Chain of Responsibility; inspect wrapping and continuation |
| `ApplicationEventPublisher`                         | Observer                                                               |
| Spring Data repositories                            | Repository abstraction; may combine adapters/proxies                   |
| JPA lazy associations                               | Proxy or enhancement; provider/mapping dependent                       |
| `Converter`/`Formatter` registries                  | Strategy, keyed                                                        |
| Resilience4j decorators                             | Decorator                                                              |

Using these is not "not using patterns" — it is using the pattern the framework already
implemented. Ordering, configuration, error handling and observability still require project
validation; reactive streams and brokers add contracts beyond an in-process Observer.
[Builders](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/web/client/RestClient.Builder.html)
configure/create clients; they do not themselves establish decoration.
[Interceptors](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/http/client/ClientHttpRequestInterceptor.html)
may wrap requests/responses and choose whether to continue. Inspect the actual
advice mode: proxy self-invocation bypass differs from AspectJ weaving, and annotations alone do not
prove interception ([Spring proxying](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html)).
