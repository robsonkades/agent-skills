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

Two failures need different evidence. Rebuilding an already adequate mechanism can duplicate
work; a boundary that owns compatibility, lifetime or failure policy can still be justified.
Assuming a pattern is present when it is only partly
present produces a design that relies on a guarantee nobody makes — an identity map assumed
to be a cache, a unit of work assumed to span a request, a repository assumed to protect an
aggregate.

## The map

```text
Mechanism substantially provided — inspect guarantees and extension points
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
   actual guarantees and extension points before wrapping or rebuilding it. Retain an adequate
   implementation and reuse matching evidence; a narrow explanation need not trigger changes.
2. **For the second group, separate mechanism from decision.** The framework supplies the
   mechanism; the decision is still yours and is where the value is.
3. **Inspect the actual toolchain, dependencies and configuration:** Java release, provider,
   transaction manager, proxy/weaving mode, context lifetime and enhancement where relevant.
   Do not infer guarantees from annotation names or upgrade to match an example.
4. **Consider a supported language idiom when it preserves the contract and earns its cost** — records for
   value objects and DTOs, sealed interfaces for closed hierarchies, exhaustive switch for
   dispatch.
5. **Do not force a modern idiom where it changes the pattern's intent.** A record cannot be
   a mutable aggregate root; sealing must preserve required plugin extension points, possibly
   through an intentional `non-sealed` branch.
6. **When a pattern looks obsolete, separate the idea from its implementation.** Most
   classical patterns have been absorbed, not refuted — the idea still explains the
   framework's behaviour.

## Decision rules

```text
The framework provides the required mechanism
        → compare existing configuration and extension points with the actual boundary duties.
          A wrapper may own compatibility, lifetime, failure policy or a replacement/test seam;
          equivalent signatures alone neither justify nor disqualify it.

The framework provides the mechanism, you own the decision
        → make the decision explicitly and write it down. This is where
          the pattern knowledge actually pays.

The framework provides something similar with different guarantees
        → read the guarantee. Context-local identity is not cross-context caching;
          context lifetime is integration-dependent; bulk updates need explicit
          version participation.

The framework does not provide it
        → design it, using the pattern as the starting point rather
          than the answer (pattern-selection-and-composition).

A pattern's classical implementation conflicts with a modern idiom
        → preserve intent and compare compatibility, identity, mutation and extension needs.
          Keep the existing form if changing it brings no justified benefit.

A pattern appears obsolete
        → check whether it was absorbed rather than refuted. Table
          Module's idea survives as set-based SQL; a Row Data Gateway
          must still own row persistence, not just carry projection data.
```

## Rules

- **Do not mechanically wrap a framework abstraction.** A `CacheService` over the
  caching abstraction, a `TransactionService` over `@Transactional`, an `HttpService` over
  `RestClient` should have an explicit role: capability restriction, domain or compatibility
  semantics, resource ownership, failure translation or a replacement/test seam. Assess
  its actual coupling and costs; a wrapper's shape alone does not prove it redundant
  (`enterprise-architecture-smells`).
- **Spring Data does not decide your aggregate boundary.** It generates an implementation.
  Which aggregates exist, what the repository's surface is, and whether reads go through it
  remain design decisions and are the whole content of the pattern
  (`repository-pattern`).
- A transaction-scoped persistence context is the common unit-of-work lifetime. Extended contexts
  and Open Session In View can outlive one service transaction; evaluate their explicit consistency,
  query and connection behavior rather than calling every longer scope inherently worse
  (`orm-behavioral-patterns`).
- **The first-level cache provides context-local identity.** It lasts with the persistence
  context, which need not end at transaction completion. It does not provide freshness or
  thread safety. Cross-context caching requires an explicit cache/provider and invalidation
  contract (`caching-strategies`).
- `@Version` implements managed-entity conflict detection. The client's original version,
  conflict presentation, valid retry and bulk SQL participation remain application concerns
  (`offline-concurrency-control`).
- **JPA does not require public JavaBean setters.** Portable entities need a public/protected
  no-arg constructor and a valid field or property access strategy. Field access supports
  mutation through domain methods; persistent fields must not be final (`domain-logic-organization`).
- Records are often effective for immutable values, DTOs, commands and events. They are not JPA
  entities and do not fit aggregates that require in-place mutation/proxying, but aggregate state is
  not mutable “by definition”; immutable replacement/event-sourced models exist.
- Sealed interfaces plus exhaustive `switch` can give compile-checked handling of known
  alternatives. An open `non-sealed` branch is handled collectively; the compiler does not
  require a case for every plugin implementation. Distinguish variants when callers need it; preserve
  uniform Special Case behavior when they do not (`enterprise-base-patterns`).
- Virtual threads make thread-per-task blocking designs competitive for I/O-heavy Java services;
  they do not make them a universal default. Pinning, native calls, downstream capacity, memory and
  framework support still decide. They change none of
  these patterns; what they change is the sizing arithmetic around them
  (`thread-sizing-and-virtual-threads`). A pattern that was chosen to avoid blocking a
  platform thread may be worth revisiting; one chosen for a domain reason is not.
- **A pattern absorbed by a framework is still worth understanding.** The framework's
  mechanism suggests consequences to investigate; verify the actual provider, configuration
  and observed behavior instead of assuming the pattern name proves them.

For the proposed implementation, return the framework mechanism and its verified scope,
the application responsibility it leaves open, and relevant evidence or a targeted check of a real gap
(for example rollback, context lifetime, stale-client writes or cache interception).
When configuration evidence is missing, state the assumption and how to verify it; do not
present the feature as an established guarantee. An adequate implementation may need no change
or additional test. Keep the response proportional to the task.

## References

- [What the framework already provides](references/framework-equivalents.md) — pattern by
  pattern: what Spring and JPA implement, what they guarantee, the gap between the classical
  pattern and the framework's version, and the wrapper to avoid in each case. Read before
  assessing a framework mechanism, extension point or guarantee in a Spring stack.
- [Modern Java expression](references/modern-java-idioms.md) — records, sealed types,
  exhaustive switch, immutability and virtual threads applied to the enterprise patterns:
  where they express the intent better, where they conflict with it, and the persistence
  constraints that decide which. Read when writing a pattern in current Java, or when
  modernising an old implementation.
