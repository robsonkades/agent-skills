# Pattern by pattern: the modern verdict

Three columns: what modern Java or the framework supplies, whether the classical mechanism should
still be written, and the residual case where it should.

## Creational

| Pattern              | Modern mechanism                                                   | Write the classical form?                                                                         |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **Abstract Factory** | DI family assembly; related factories/suppliers when contracts fit | When family invariants, construction lifecycle or extension ownership require it                  |
| **Builder**          | Record + compact constructor + named factories                     | When positional construction is ambiguous, staged, or one process builds multiple representations |
| **Factory Method**   | Supplier/map/dispatch as alternatives to subtype creation hooks    | Retain inherited creation when public/framework hooks and algorithm lifecycle require it          |
| **Prototype**        | Immutability; copy constructors; explicit/generated withers        | Configured runtime templates or polymorphic copies; avoid introducing new `Cloneable` APIs        |
| **Singleton**        | Container lifecycle scope or explicit owned instance               | Rare bridges where process/class-loader scoped global access is a real constraint                 |

Notes worth carrying:

- Configuration can assemble a family at deployment time; test active profile combinations,
  product compatibility and lifecycle. A DI registry can also select prebuilt families per request;
  runtime selection alone does not require a new factory hierarchy.
- "Factory Method" and "static factory method" are different things. The second is a named
  constructor and is excellent; it involves no subclass (`gof-factory-method`).

## Structural

| Pattern       | Modern mechanism                                                                       | Write the classical form?                                                      |
| ------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Adapter**   | A lambda for compatible single-method translation; generated adapters where applicable | When the existing port and collaborator contracts need translation             |
| **Bridge**    | Composition + DI; a one-method implementor can be a lambda                             | When independent abstraction/implementation contracts warrant the boundary     |
| **Composite** | Sealed interface + records + exhaustive `switch`                                       | Choose sealed or open from extension needs; mutation API remains a choice      |
| **Decorator** | Filters, interceptors, Resilience4j                                                    | When existing mechanisms do not meet the required contract                     |
| **Facade**    | An application service / use-case class                                                | When a consumer boundary simplifies actual subsystem use or coordination       |
| **Flyweight** | String deduplication; enum constants; boundary canonicalisation                        | When measured retention, allocation or construction cost justifies sharing     |
| **Proxy**     | Configured advice proxies; provider-specific JPA proxy/enhancement                     | When existing mechanisms lack required access, lifecycle or location semantics |

Notes:

- Composite's classical dilemma — declare `add`/`remove` on the component (transparent, leaves
  throw) or only on the composite (safe) — remains an API decision. Pattern matching makes
  branch-specific access convenient but does not remove the transparency/safety choice
  (`gof-composite`).
- Before writing a decorator, compare the framework's ordering, lifecycle and failure semantics;
  transport versus domain responsibility is a clue, not a prohibition on custom layers.

## Behavioural

| Pattern                     | Modern mechanism                                                                | Write the classical form?                                                            |
| --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Chain of Responsibility** | Servlet filters, interceptor chains; a `List<Handler>` iterated                 | For domain pipelines or when framework chains cannot express the required contract   |
| **Command**                 | A record; `Runnable`/`Callable`; a sealed set + `switch` dispatch               | For explicit requests, including synchronous invocation                              |
| **Interpreter**             | Sealed AST + folds; or CEL/JSONLogic/a rules engine                             | **For a small grammar you must control** — especially when the AST is translated     |
| **Iterator**                | `Iterable`, `Stream`, `Spliterator`, Gatherers                                  | Implement the smallest pull/stream/splitting contract consumers actually need        |
| **Mediator**                | Libraries can supply dispatch/orchestration; domain protocol still needs design | **Yes, bounded.** Its distributed form is an orchestrator                            |
| **Memento**                 | Immutable captures; records where their exposure contract fits                  | Retain required capture opacity, restoration ownership and history/lifetime policy   |
| **Observer**                | `ApplicationEventPublisher`; reactive streams; brokers                          | Reuse a matching mechanism; implement when lifecycle/delivery contracts require it   |
| **State**                   | Sealed states + one transition function                                         | Compare explicit transitions with per-state classes for behavior and extension needs |
| **Strategy**                | A lambda; a domain functional interface; DI-selected map                        | When consumer semantics, failures, state, lifecycle or diagnostics justify it        |
| **Template Method**         | Composed steps as an alternative; injected policies within inherited templates  | Retain legitimate public/framework hooks and sequence/lifecycle contracts            |
| **Visitor**                 | Sealed interface + exhaustive `switch`                                          | For stable element families, external operations or required accept APIs             |

Notes:

- Observer's three levels — in-process, reactive stream, distributed pub/sub — are not
  interchangeable implementations of one idea. Moving between them changes transactional
  semantics, ordering, error handling and idempotency requirements at once
  (`gof-observer`).
- Spliterator can adapt to streams and iterators, but Iterator may be simpler for pull protocols.
  Adapters do not supply resource cleanup or cancellation (`gof-iterator`).
- Inspect a "mediator" library's behavior: command dispatch alone does not coordinate participant
  interactions, though a library may support both roles.
- A final composed sequence retains an intent, not the subtype-hook mechanism of Template Method.
  Compare an actual improvement before migrating supported extension APIs or renaming working code.

## Six supplied mechanisms to check before duplicating

```text
Iterator      use the existing traversal, or implement only the needed contract
Singleton     one bean, injected
Proxy         configured advice; provider-specific JPA proxy/enhancement
Decorator     filters/interceptors for transport concerns
Observer      application events; a broker beyond the process
Chain         the framework's filter chain, for transport concerns
```

Avoid duplicating an existing policy. A custom implementation is justified when the supplied
mechanism lacks required semantics; integrate and verify ordering, lifecycle, metrics and tracing.

## The six that still need the classical thinking

```text
Composite     recursion, depth bounds, cycles, mutation-during-traversal
Bridge        two axes, an implementor contract designed for its worst
              backend
Mediator      explicit protocol ownership and cohesive coordination
Interpreter   a grammar, resource limits, and a security boundary
Abstract      a family invariant enforced through types, assembly or validation
  Factory
Adapter       translation of model, vocabulary and failure
```

Modern types change how these are written; none of them changes the analysis. The design questions
— what varies, what must not be mixed, what the contract must admit — are unchanged since 1994.

## The one thing that has not changed at all

The decision to use no pattern. Every feature in this reference makes "no pattern" easier to reach
and none makes it less legitimate: an immutable record, a configuration value and a direct method
call may already meet the design contract; retain adequate existing mechanisms
(`gof-pattern-thinking`).
