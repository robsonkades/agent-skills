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

Name the intent when useful ("Strategy, as a function"); keep established consumer-facing names.
Before replacing a mechanism, inspect ordinary calls, public extension use and failure/misuse
behavior. Reuse known forces and project evidence; ask only for missing identity, ownership,
lifecycle or compatibility requirements that could change the choice. Retaining an adequate
implementation is a valid result; state what evidence would justify changing it.

Inspect compiler release/toolchains, resolved framework versions, CI/runtime and existing extension
contracts before suggesting a replacement. Records/sealed types fit Java 17; record patterns and
pattern switch need Java 21 without preview; Gatherers are final in 24 and ScopedValue in 25.
StructuredTaskScope remains preview in Java 25: its release-specific API needs explicit project
preview authorization and compiler/runtime flags. Do not upgrade or enable preview merely to use
this skill. Missing environment evidence makes a version-sensitive recommendation conditional.

## Three categories

```text
COMMON MECHANISMS PROVIDED — reuse them when their guarantees match
    Iterator          Iterable / Iterator / Spliterator (Stream is a pipeline, not a replacement)
    Singleton-like lifecycle  the container's singleton scope (not global uniqueness)
    Proxy             configured proxy advice; JPA proxy/enhancement depends on mapping/provider
    Decorator         filters/interceptors when their wrapping contract fits
    Observer          application events; reactive streams; brokers
    Chain of Resp.    filter chains, interceptor chains

ALTERNATIVE EXPRESSIONS — compare with the existing contract
    Strategy          a lambda or a domain functional interface
    Command           a record; often a Runnable/Callable
    Factory Method    Supplier/keyed map only when existing creation-hook contracts permit
    Visitor           sealed interface + exhaustive switch
    State             sealed states + one transition function
    Prototype         copy factory or immutable sharing, preserving required identity/ownership
    Memento           immutable captures can preserve opaque restoration handles
    Template Method   composed steps can retain intent; subtype hooks remain a distinct mechanism
    Builder           compare records/factories with staged construction needs

DOMAIN DESIGN STILL REQUIRED — libraries may supply mechanisms;
the classical questions apply with modern types
    Composite, Bridge, Mediator, Interpreter, Abstract Factory,
    Adapter, Facade, Flyweight
```

## The two changes that matter most

**Sealed types plus pattern matching.** A closed hierarchy with
an exhaustive `switch` can express external operations and state dispatch. Adding an operation is
often one new function; adding a variant requires updating affected exhaustive switches on
recompilation. Catch-all cases and non-sealed branches limit that check. Sealing does not define
valid state transitions or decide which Composite types expose child mutation. Where you own
the relevant variants and compatibility boundary, consider it; check separately deployed consumers,
since a new permitted variant can reach an old switch and cause `MatchException` on Java 21+
(`java-composition-over-inheritance`).

**The container.** DI can own instance lifetimes and assemble a family, but singleton scope is
per bean definition/container, profiles can overlap, and compatible-family invariants need tests
or validation. Supplier injection can replace application-controlled creation hooks when public
extension and lifecycle contracts permit it.

Two smaller but real ones: **records** remove the boilerplate that made Builder, Memento and
Prototype heavy, but records are only shallowly immutable. Preserve equality, hashing and rendering
contracts when replacing classes; array components use identity in generated equality, even with
defensive copies (`java-object-contracts`). **Virtual threads** can simplify
blocking I/O orchestration; they do not remove requests represented as Commands, durable work,
admission control, cancellation or downstream capacity limits (`thread-sizing-and-virtual-threads`).

## Decision rules

```text
IF you are implementing a pattern from an older text
THEN check whether the JDK/framework supplies the required semantics before
     hand-writing infrastructure. Do not turn categories into prohibitions.

IF the framework provides the mechanism
THEN compare ordering, lifecycle, failure and observability semantics before reuse.
     Avoid duplicate policy; custom implementations can still integrate correctly.

IF the variant set is closed and you own it
THEN consider sealed + exhaustive switch against Visitor, State and Strategy,
     preserving behavior, compatibility and the actual direction of change.

IF the variant set is open to code you do not compile
THEN preserve an extension interface. Classic Visitor also couples visitors to
     element types; it does not automatically solve independently added variants.

IF a lambda would express the pattern
THEN compare a function with a named implementation for state, metadata,
     checked failures and diagnostics; name the intent whichever form is chosen.

IF diagnosability matters (a hot path, a production stack trace)
THEN inspect actual traces/profiles; named methods/classes can help, but a lambda
     is not automatically undiagnosable (flame-graph-analysis).

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
- **Unresolved risks.** Language features do not establish global-state isolation, event ordering,
  cohesive coordination, remote call costs, safe sharing or copy semantics. Inspect which risks
  the actual Singleton, Observer, Mediator, Proxy, Flyweight or Prototype implementation has.
- **"No pattern" as an answer.** Modern features make it easier to reach, not less legitimate.

## References

Return the existing mechanism, proposed replacement or reason to retain it, target compatibility,
preserved contracts and checks executed versus pending. A shorter class list is not validation.

- [Feature to pattern](references/feature-to-pattern.md) — each modern Java feature with the
  patterns it changes and how: records, sealed types, pattern matching, switch expressions,
  lambdas and method references, generics, `Optional`, immutable collections, default methods,
  dependency injection, virtual threads, structured concurrency, `ScopedValue` and Gatherers. Read
  when a language feature suggests a design might be simplified.
- [Pattern by pattern](references/pattern-by-pattern.md) — all twenty-three with the modern verdict,
  the mechanism that replaces or supplies each, and the residual case where the classical form is
  still correct. Read when implementing a specific pattern from an older reference.
