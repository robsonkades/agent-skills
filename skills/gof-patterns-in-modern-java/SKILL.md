---
name: gof-patterns-in-modern-java
description: >
  Which Gang-of-Four patterns modern Java and Spring already implement, which they only
  change the expression of, and which still need writing by hand. Covers records, sealed
  types and pattern matching against Visitor, State, Composite and Interpreter; lambdas and
  functional interfaces against Strategy, Command, Factory Method and Observer; the
  container against Singleton, Abstract Factory and Factory Method; framework mechanisms
  against Decorator and Proxy; and what virtual threads and ScopedValue change about
  patterns that carry context or defer work. Use when implementing a pattern from an older
  text, when a hand-rolled mechanism duplicates something the framework provides, or when
  deciding whether a pattern is obsolete or merely invisible. Does not cover choosing a
  pattern (gof-pattern-selection), any individual pattern's guidance (the gof-\* skills),
  enterprise patterns against frameworks (patterns-and-modern-frameworks), or the
  inheritance decision (java-composition-over-inheritance).
---

# Patterns in Modern Java

## Purpose

Separate what a pattern _is_ from how it is _written_. Almost no GoF pattern has become obsolete;
many have stopped needing a class hierarchy, and several are now supplied by the language or the
framework so completely that hand-writing them duplicates working machinery.

The distinction to hold throughout:

```text
Design intent       "this algorithm varies, and callers must not know
                     which one runs"    → still true, still Strategy

Implementation      interface + N classes + a selector
mechanism           → optional; a lambda expresses the same intent
```

Refusing the vocabulary because the mechanism changed is as costly as building the 1994 mechanism.
Say "Strategy, as a function" and the design stays legible.

## Three categories

```text
COMMON MECHANISMS PROVIDED — reuse them when their guarantees match
    Iterator          Iterable / Iterator / Spliterator (Stream is a pipeline, not a replacement)
    Singleton-like lifecycle  the container's singleton scope (not global uniqueness)
    Proxy             @Transactional, @Cacheable, JPA lazy loading
    Decorator         servlet filters, interceptors, client builders
    Observer          application events; reactive streams; brokers
    Chain of Resp.    filter chains, interceptor chains

CHANGED — the intent survives; the classical mechanism is usually the
wrong expression now
    Strategy          a lambda or a domain functional interface
    Command           a record; often a Runnable/Callable
    Factory Method    an injected Supplier or a keyed map
    Visitor           sealed interface + exhaustive switch
    State             sealed states + one transition function
    Prototype         a copy factory; usually immutability instead
    Memento           an immutable state behind one reference
    Template Method   a final class taking composed steps
    Builder           record + static factories, until arity demands one

STILL HAND-WRITTEN — nothing supplies these; the classical thinking
applies with modern types
    Composite, Bridge, Mediator, Interpreter, Abstract Factory,
    Adapter, Facade, Flyweight
```

## The two changes that matter most

**Sealed types plus pattern matching.** A closed hierarchy with
an exhaustive `switch` gives, in one construct, what Visitor needed double dispatch for, what State
needed a class per state for, and what Composite needed the transparent/safe trade-off for — with
the compiler enumerating every switch site when a variant is added. This favors adding variants but
can make adding operations touch many switches—the expression-problem trade-off Visitor addresses.
Where you own every variant, consider it
(`java-composition-over-inheritance`).

**The container.** Dependency injection makes Singleton's uniqueness a consequence of wiring rather
than of a static, turns the deployment-time case of Abstract Factory into one `@Configuration` per
profile, and makes Factory Method's subclass hook unnecessary wherever you construct the object
yourself.

Two smaller but real ones: **records** remove the boilerplate that made Builder, Memento and
Prototype heavy, and make immutability cheap enough that several patterns dissolve into "share the
reference". **Virtual threads and structured concurrency** remove much of the reason to defer work
through Command objects and asynchronous decorators — a blocking call on a virtual thread is
usually simpler than the machinery built to avoid one (`thread-sizing-and-virtual-threads`).

## Decision rules

```text
IF you are implementing a pattern from an older text
THEN check whether the JDK/framework supplies the required semantics before
     hand-writing infrastructure. Do not turn categories into prohibitions.

IF the framework provides the mechanism
THEN use it. A hand-rolled chain, proxy or event bus beside the
     framework's is invisible to its ordering, metrics and tracing.

IF the variant set is closed and you own it
THEN sealed + exhaustive switch, and reconsider Visitor, State and
     Strategy against it.

IF the variant set is open to code you do not compile
THEN the classical mechanism is still right: an interface, or
     accept(Visitor), because there is no closed set to switch over.

IF a lambda would express the pattern
THEN use it — and name the intent in review, so the design stays
     recognisable.

IF diagnosability matters (a hot path, a production stack trace)
THEN a named class beats a lambda. lambda$price$3 in an incident
     report is a real cost (flame-graph-analysis).

IF a pattern exists to defer or offload work
THEN check whether virtual threads remove the need
     (thread-sizing-and-virtual-threads, structured-concurrency).

IF immutable context must flow down a bounded call tree
THEN consider ScopedValue on Java 25+. ThreadLocal remains appropriate for
     mutable/per-thread integration in some libraries but requires lifecycle
     cleanup and does not automatically propagate to arbitrary executor tasks
     (scoped-values).
```

## What has not changed

- **Coupling analysis.** Who knows whom, and what must not know what, is unaffected by syntax.
- **The cost of indirection.** A lambda hides a dispatch site exactly as a class does.
- **Naming.** "Strategy", "Adapter", "Mediator" still tell a reader what to expect, and the
  expectations differ.
- **The high-risk set.** Singleton, Observer, Mediator, Proxy, Flyweight and Prototype are risky
  for reasons the language does not address — global state, unspecified ordering, god objects,
  hidden network calls, shared mutation, and broken copying.
- **"No pattern" as an answer.** Modern features make it easier to reach, not less legitimate.

## References

- [Feature to pattern](references/feature-to-pattern.md) — each modern Java feature with the
  patterns it changes and how: records, sealed types, pattern matching, switch expressions,
  lambdas and method references, generics, `Optional`, immutable collections, default methods,
  dependency injection, virtual threads, structured concurrency, `ScopedValue` and Gatherers. Read
  when a language feature suggests a design might be simplified.
- [Pattern by pattern](references/pattern-by-pattern.md) — all twenty-three with the modern verdict,
  the mechanism that replaces or supplies each, and the residual case where the classical form is
  still correct. Read when implementing a specific pattern from an older reference.
