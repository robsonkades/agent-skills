---
name: patterns-and-modern-frameworks
description: >
  Which classical enterprise patterns a modern Java and Spring stack already implements,
  which it only partly implements, and which it does not implement at all — plus the modern
  Java expression of each. Use when a repository interface is written over Spring Data, when
  a unit of work or identity map is built over JPA, when a front controller is hand-rolled,
  when a caching layer is written over the caching abstraction, when an entity is written as
  a mutable bean because "JPA requires it", when a pattern's implementation is copied from
  an old text, or when deciding whether a pattern is obsolete or merely invisible. Does not
  cover choosing the pattern (pattern-selection-and-composition) or judging whether an
  abstraction should exist (enterprise-architecture-smells).
---

# Patterns and Modern Frameworks

## Purpose

Answer two questions that cause a lot of wasted work: **does the framework already do
this?**, and **what does this pattern look like in modern Java?**

Both failures are common. Rebuilding a pattern the framework provides produces a wrapper
that is worse than what it wraps. Assuming a pattern is present when it is only partly
present produces a design that relies on a guarantee nobody makes — an identity map assumed
to be a cache, a unit of work assumed to span a request, a repository assumed to protect an
aggregate.

## The map

```text
Mechanism substantially provided — configure before rebuilding
    Front Controller         DispatcherServlet / router
    Unit of Work             JPA persistence context
    Identity Map             first-level cache
    Lazy Load                ORM proxies
    Metadata Mapping         JPA annotations / orm.xml
    Template View            Thymeleaf and friends
    Plugin                   conditional bean registration
    Registry                 the application context (used well: injection)

Provided, partial — the mechanism exists, the design decision does not
    Repository               Spring Data gives the implementation; the
                             aggregate boundary and the interface's shape
                             are still yours
    Service Layer            @Transactional gives demarcation; what a use
                             case is remains a design decision
    Optimistic Offline Lock  @Version detects; the conflict experience,
                             the retry policy and bulk-update safety are
                             yours
    Data Mapper              JPA maps; whether the domain may diverge from
                             the schema is your choice

Not provided — you must design it
    Domain Model organisation, aggregate boundaries and invariants
    Remote Facade granularity
    Pessimistic Offline Lock across requests
    Coarse-Grained Lock scope
    Application Controller flows
    Session state placement
    Distribution boundaries and saga design
```

## Workflow

1. **Before implementing a pattern, locate it in the map.** If the mechanism exists, compare its
   actual guarantees and extension points before wrapping or rebuilding it.
2. **For the second group, separate mechanism from decision.** The framework supplies the
   mechanism; the decision is still yours and is where the value is.
3. **Check what the framework's version actually guarantees**, not what the pattern
   classically guarantees. The gaps are listed in the references and each has produced
   production incidents.
4. **Express the pattern in modern Java** where the language now does the work — records for
   value objects and DTOs, sealed interfaces for closed hierarchies, exhaustive switch for
   dispatch.
5. **Do not force a modern idiom where it changes the pattern's intent.** A record cannot be
   a mutable aggregate root; a sealed hierarchy is not a plugin point.
6. **When a pattern looks obsolete, separate the idea from its implementation.** Most
   classical patterns have been absorbed, not refuted — the idea still explains the
   framework's behaviour.

## Decision rules

```text
The framework provides the pattern completely
        → configure it. A wrapper adds a name and removes features.

The framework provides the mechanism, you own the decision
        → make the decision explicitly and write it down. This is where
          the pattern knowledge actually pays.

The framework provides something similar with different guarantees
        → read the guarantee. An identity map is not a cache; a
          persistence context is not a request scope; @Version does not
          survive a bulk update.

The framework does not provide it
        → design it, using the pattern as the starting point rather
          than the answer (pattern-selection-and-composition).

A pattern's classical implementation conflicts with a modern idiom
        → keep the intent, change the implementation. Immutability,
          records and sealed types usually express the intent better.

A pattern appears obsolete
        → check whether it was absorbed rather than refuted. Table
          Module's idea survives as set-based SQL; Row Data Gateway's
          survives as a row record.
```

## Rules

- **Do not mechanically wrap a framework abstraction.** A `CacheService` over the
  caching abstraction, a `TransactionService` over `@Transactional`, an `HttpService` over
  `RestClient` — each adds a name, removes features, and will not survive replacing the
  framework anyway unless it narrows capability, owns domain semantics, translates failures or
  provides a genuine replacement/test seam (`enterprise-architecture-smells`).
- **Spring Data does not decide your aggregate boundary.** It generates an implementation.
  Which aggregates exist, what the repository's surface is, and whether reads go through it
  remain design decisions and are the whole content of the pattern
  (`repository-pattern`).
- A transaction-scoped persistence context is the common unit-of-work lifetime. Extended contexts
  and Open Session In View can outlive one service transaction; evaluate their explicit consistency,
  query and connection behavior rather than calling every longer scope inherently worse
  (`orm-behavioral-patterns`).
- **The first-level cache is an identity map, not a cache.** It disappears with the
  transaction. Anything that must survive is a second-level cache, with invalidation and
  staleness of its own (`caching-strategies`).
- `@Version` implements detection only. The conflict's presentation, the retry policy, and
  the fact that bulk statements bypass it are yours to design
  (`offline-concurrency-control`).
- **JPA does not require a mutable JavaBean.** It requires a no-arg constructor (which may
  be `protected`) and field access. Setters are a choice, and omitting them is what lets an
  entity protect its invariants (`domain-logic-organization`).
- Records are often effective for immutable values, DTOs, commands and events. They are not JPA
  entities and do not fit aggregates that require in-place mutation/proxying, but aggregate state is
  not mutable “by definition”; immutable replacement/event-sourced models exist.
- Sealed interfaces plus exhaustive `switch` give a closed hierarchy with compile-checked
  handling. That is better than a Special Case subclass where callers must distinguish, and
  worse where they must not (`enterprise-base-patterns`).
- Virtual threads make thread-per-task blocking designs competitive for I/O-heavy Java services;
  they do not make them a universal default. Pinning, native calls, downstream capacity, memory and
  framework support still decide. They change none of
  these patterns; what they change is the sizing arithmetic around them
  (`thread-sizing-and-virtual-threads`). A pattern that was chosen to avoid blocking a
  platform thread may be worth revisiting; one chosen for a domain reason is not.
- **A pattern absorbed by a framework is still worth understanding.** The framework's
  surprising behaviours are the pattern's classical consequences, and someone who knows the
  pattern predicts them instead of debugging them.

## References

- [What the framework already provides](references/framework-equivalents.md) — pattern by
  pattern: what Spring and JPA implement, what they guarantee, the gap between the classical
  pattern and the framework's version, and the wrapper to avoid in each case. Read before
  implementing any classical pattern in a Spring stack.
- [Modern Java expression](references/modern-java-idioms.md) — records, sealed types,
  exhaustive switch, immutability and virtual threads applied to the enterprise patterns:
  where they express the intent better, where they conflict with it, and the persistence
  constraints that decide which. Read when writing a pattern in current Java, or when
  modernising an old implementation.
