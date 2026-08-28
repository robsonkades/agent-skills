# Feature to pattern

## Records

**Changes:** Builder, Prototype, Memento, Command, Value objects.

A record gives a constructor with named components, `equals`/`hashCode`/`toString`, and shallow
immutability, for one line. The consequences:

- **Builder** is needed only past four components or where optional ones exist — below that the
  canonical constructor is already checked by the compiler.
- **Prototype** mostly dissolves: an immutable record needs no copy, and where a variant is needed
  a `withX` method beats a copy step that must be kept in sync with the field list.
- **Memento** becomes "hold the previous reference", and an undo stack becomes a stack of
  references with structural sharing rather than a stack of copies.
- **Command** becomes a record implementing a sealed interface, which is also the right wire shape
  when it is persisted.

The caveat that survives: a record component holding a mutable `List` is not immutable. `List.copyOf`
in the compact constructor is what makes the guarantee real (`java-immutability`).

## Sealed types

**Changes:** Visitor, State, Composite, Interpreter, Strategy, Chain of Responsibility.

Sealing a hierarchy makes the variant set known to the compiler. That single fact is what makes an
exhaustive `switch` a completeness check rather than a hope, and it is the property Visitor's
double dispatch was buying.

The trade is explicit and worth stating in review: a sealed set makes **new operations cheap** (one
more function) and **new variants loud** (every switch fails to compile). An open hierarchy is the
reverse. Choose by which change the domain actually produces.

## Pattern matching for `switch`, with deconstruction

**Changes:** Visitor, State, Composite, Interpreter, and every `instanceof` chain.

```java
return switch (node) {
    case Text(String value, var emphasis) -> render(value, emphasis);
    case Section(var title, var children) -> renderSection(title, children);
};      // no default: adding a variant breaks this at compile time
```

Two effects beyond brevity. Deconstruction binds components without accessor calls, which removes
the pressure Visitor puts on element types to expose their internals. And `case null` becomes
explicit, so a switch over a possibly-null value states its intent rather than throwing
(`java-null-safety`).

The rule that carries the whole benefit: **no `default` in an operation over a closed set.** A
`default` converts a compile error into a silent gap.

## Lambdas, method references, functional interfaces

**Changes:** Strategy, Command, Factory Method, Observer, Template Method, Visitor (as folds).

A single-method interface is implementable by a lambda, so any pattern whose participant has one
method loses its class hierarchy:

```text
Strategy         Comparator, UnaryOperator, a domain DiscountRule
Command          Runnable, Callable, or a record + a handler function
Factory Method   Supplier<T>, Function<Args, T>, T::new
Observer         Consumer<Event>
Template Method  a final class taking its steps as function parameters
```

Declare a **domain-named** functional interface rather than reusing `Function<A,B>`: it costs one
file and gives the intent a name at every call site.

The cost to weigh: lambdas have no useful class names, so `lambda$price$3` appears in stack traces,
thread dumps and profiles. Use classes for anything you expect to debug in production.

## Generics

**Changes:** Visitor (`Visitor<R>` instead of a mutable result field), Builder (staged builders),
Abstract Factory (a typed family), Command (`Command<R>`).

The main practical effect is that a Visitor can return a value rather than accumulating into a
field, which removes its statefulness and makes it safe to share.

## `Optional`

**Changes:** Chain of Responsibility, Null Object, Factory Method.

`Optional<Result> handle(Request)` expresses "I have no opinion" in one call, replacing the
`supports()`-then-`handle()` pair that can disagree. As a return type only — not as a field, not
as a parameter (`java-optional`).

## Immutable collections and copy factories

**Changes:** Prototype, Memento, Flyweight, Builder, Composite.

`List.of`, `List.copyOf` and `Map.of` make defensive copying one call, which is what makes captures
and copies correct by default. `List.of()` is itself a shared instance — a flyweight in the JDK.

## Default methods

**Changes:** Adapter, Visitor, Bridge.

A default method adapts an interface to implementors that cannot supply a new operation, which
removes one reason for an abstract adapter class. In Visitor, a `default visit` is a hazard rather
than a convenience: it silently absorbs new element types.

## Dependency injection

**Changes:** Singleton, Abstract Factory, Factory Method, Strategy selection, Bridge.

The container makes one instance and wires it, so uniqueness stops needing a static; it can supply
a whole matched family per profile, so deployment-time Abstract Factory becomes a `@Configuration`;
and it can inject `List<T>` or `Map<K,T>` of an interface's implementations, which is Strategy
selection with no selector to write.

The hazard worth naming: injecting `List<T>` means the set is whatever is on the class path. Build
the map from a key the strategy declares, and fail at startup on a duplicate or a missing key
(`java-dependency-inversion`).

## Virtual threads

**Changes:** Command (as deferral), Decorator (async layers), Proxy (async remote), Observer
(async listeners).

Much machinery exists to avoid blocking a scarce platform thread: task objects submitted to
executors, callback-based decorators, reactive chains. When blocking is cheap, a straightforward
blocking call on a virtual thread is simpler and easier to debug than any of them.

What does **not** change: durability. A Command that exists so work survives a restart still needs a
queue; virtual threads only remove the ones that existed to avoid blocking
(`thread-sizing-and-virtual-threads`).

## Structured concurrency

**Changes:** Facade (remote fan-out), Mediator, Composite (parallel traversal), Scatter-gather.

`StructuredTaskScope` gives a fan-out with a joined lifetime, propagated cancellation and a single
place to handle partial failure — which is what a facade over several remote collaborators needs
and what hand-rolled `CompletableFuture` compositions get wrong
(`structured-concurrency`).

## `ScopedValue`

**Changes:** Chain of Responsibility, Mediator, Command, Decorator, Observer — anything that
carries per-request context.

`ThreadLocal` does not follow work handed to another thread and leaks across pooled threads.
`ScopedValue` is bound for a dynamic scope and is inherited by structured-concurrency forks, which
is exactly the shape a request travelling through a chain of handlers needs
(`scoped-values`).

## Stream Gatherers

**Changes:** Iterator, Chain of Responsibility (as a pipeline).

Stateful and windowing operations that previously required a hand-written `Iterator` with a buffer
— sliding windows, run-length grouping, fold-with-emit — are expressible as a gatherer in a stream
pipeline, keeping laziness and short-circuiting.

## Framework mechanisms, briefly

| Mechanism                                | Pattern it supplies                 |
| ---------------------------------------- | ----------------------------------- |
| Singleton scope                          | Singleton (lifecycle half only)     |
| `@Transactional`, `@Cacheable`, `@Async` | Proxy                               |
| Servlet `Filter`, `HandlerInterceptor`   | Chain of Responsibility / Decorator |
| `RestClient` interceptors and builders   | Decorator                           |
| `ApplicationEventPublisher`              | Observer                            |
| Spring Data repositories                 | Adapter (generated)                 |
| JPA lazy associations                    | Proxy (virtual)                     |
| `Converter`/`Formatter` registries       | Strategy, keyed                     |
| Resilience4j decorators                  | Decorator                           |

Using these is not "not using patterns" — it is using the pattern the framework already
implemented, with its ordering, configuration and observability solved.
