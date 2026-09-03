# Pattern by pattern: the modern verdict

Three columns: what modern Java or the framework supplies, whether the classical mechanism should
still be written, and the residual case where it should.

## Creational

| Pattern              | Modern mechanism                                                   | Write the classical form?                                                                         |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **Abstract Factory** | One `@Configuration` per profile; a record of suppliers in a `Map` | **Sometimes.** When the family is chosen per request/tenant, or when third parties contribute one |
| **Builder**          | Record + compact constructor + named factories                     | When positional construction is ambiguous, staged, or one process builds multiple representations |
| **Factory Method**   | Injected `Supplier`; `Map<Key, Supplier>`; sealed `switch`         | When inherited creation is a real framework/extension hook                                        |
| **Prototype**        | Immutability; copy constructors; explicit/generated withers        | Configured runtime templates or polymorphic copies; avoid introducing new `Cloneable` APIs        |
| **Singleton**        | Container lifecycle scope or explicit owned instance               | Rare bridges where process/class-loader scoped global access is a real constraint                 |

Notes worth carrying:

- The commonest correct Abstract Factory in a Spring application is a `@Configuration` per profile,
  and it is usually not recognised as the pattern — which is what stops someone adding a redundant
  factory interface on top.
- "Factory Method" and "static factory method" are different things. The second is a named
  constructor and is excellent; it involves no subclass (`gof-factory-method`).

## Structural

| Pattern       | Modern mechanism                                                      | Write the classical form?                                                      |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Adapter**   | A lambda for single-method mismatches; generated Spring Data adapters | **Yes, routinely.** It is the standard shape for a vendor SDK behind your port |
| **Bridge**    | Composition + DI; a one-method implementor can be a lambda            | **Yes, when two axes genuinely vary.** JDBC and SLF4J remain the model         |
| **Composite** | Sealed interface + records + exhaustive `switch`                      | **Yes, but sealed.** The transparent/safe trade-off disappears                 |
| **Decorator** | Filters, interceptors, client builders, Resilience4j                  | **For domain-shaped layers only.** Transport concerns belong to the framework  |
| **Facade**    | An application service / use-case class                               | **Yes, and it already exists** under another name in most codebases            |
| **Flyweight** | String deduplication; enum constants; boundary canonicalisation       | **Rarely, and only after a heap measurement**                                  |
| **Proxy**     | `@Transactional`/`@Cacheable` proxies; JPA lazy loading               | **Rarely by hand.** A virtual proxy for a genuinely expensive resource         |

Notes:

- Composite's classical dilemma — declare `add`/`remove` on the component (transparent, leaves
  throw) or only on the composite (safe, clients cast) — is resolved by sealing: shared operations
  on the interface, structural ones on the branch type, exhaustive dispatch with no cast
  (`gof-composite`).
- Decorator is the pattern most often duplicated beside a framework that already provides it. The
  test: is the concern transport-shaped (framework) or domain-shaped (yours)?

## Behavioural

| Pattern                     | Modern mechanism                                                  | Write the classical form?                                                              |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Chain of Responsibility** | Servlet filters, interceptor chains; a `List<Handler>` iterated   | For domain pipelines or when framework chains cannot express the required contract     |
| **Command**                 | A record; `Runnable`/`Callable`; a sealed set + `switch` dispatch | **Yes, when something queues, stores, retries or undoes it**                           |
| **Interpreter**             | Sealed AST + folds; or CEL/JSONLogic/a rules engine               | **For a small grammar you must control** — especially when the AST is translated       |
| **Iterator**                | `Iterable`, `Stream`, `Spliterator`, Gatherers                    | Implement the smallest pull/stream/splitting contract consumers actually need          |
| **Mediator**                | Nothing supplies it                                               | **Yes, bounded.** Its distributed form is an orchestrator                              |
| **Memento**                 | Immutable state behind one reference; records                     | **When the originator is genuinely mutable.** Otherwise share the reference            |
| **Observer**                | `ApplicationEventPublisher`; reactive streams; brokers            | **Rarely by hand.** Use the framework's, and know which of the three levels you are on |
| **State**                   | Sealed states + one transition function                           | **Yes, in the modern form.** A class per state only when each has real behaviour       |
| **Strategy**                | A lambda; a domain functional interface; DI-selected map          | **When it needs a name, a key, metadata or injection**                                 |
| **Template Method**         | A `final` class taking composed steps                             | **Framework extension points and contract test base classes**                          |
| **Visitor**                 | Sealed interface + exhaustive `switch`                            | **Only for types you do not compile, or an `accept`-based API**                        |

Notes:

- Observer's three levels — in-process, reactive stream, distributed pub/sub — are not
  interchangeable implementations of one idea. Moving between them changes transactional
  semantics, ordering, error handling and idempotency requirements at once
  (`gof-observer`).
- Iterator is the pattern most completely absorbed: implementing `Spliterator` yields both a stream
  and an iterator, and reaching for a hand-written `Iterator` is almost always a sign of not
  knowing that (`gof-iterator`).
- Mediator is the pattern the ecosystem supplies least. Note that "mediator" libraries in other
  ecosystems are command dispatchers and share none of its properties.

## The six that should rarely be hand-written today

```text
Iterator      implement Spliterator; expose Iterable/Stream
Singleton     one bean, injected
Proxy         @Transactional, @Cacheable, JPA lazy loading
Decorator     filters/interceptors for transport concerns
Observer      application events; a broker beyond the process
Chain         the framework's filter chain, for transport concerns
```

Writing any of these by hand beside the framework's version puts the same policy in two places
that cannot see each other, and the hand-rolled one is invisible to the framework's ordering,
metrics and tracing.

## The six that still need the classical thinking

```text
Composite     recursion, depth bounds, cycles, mutation-during-traversal
Bridge        two axes, an implementor contract designed for its worst
              backend
Mediator      a bounded hub, or a god object
Interpreter   a grammar, resource limits, and a security boundary
Abstract      a family invariant, and mixing made impossible
  Factory
Adapter       translation of model, vocabulary and failure
```

Modern types change how these are written; none of them changes the analysis. The design questions
— what varies, what must not be mixed, what the contract must admit — are unchanged since 1994.

## The one thing that has not changed at all

The decision to use no pattern. Every feature in this reference makes "no pattern" easier to reach
and none makes it less legitimate: an immutable record, a configuration value and a direct method
call are still the answer to most design questions that get a pattern name attached
(`gof-pattern-thinking`).
