---
name: gof-pattern-antipatterns
description: >
  Detecting and removing design-pattern misuse: abstractions that trace to no requirement,
  patterns chosen because a name sounded right, and the specific failure each overused pattern
  produces. Covers the detectable signals — an interface with one implementation, a class per
  constant, a factory whose products are unrelated, a hub with twelve dependencies, a listener
  never deregistered, a wrapper stack nobody can read, a getInstance() a test must reset — with the
  cause, the concrete cost, and the removal procedure that does not break callers. Use when
  reviewing a design that feels over-engineered, when a class name ends in Manager or Helper and
  nobody can say what it does, when tests need many mocks to construct one object, or when
  deleting an abstraction and the change must stay safe. Does not cover choosing a pattern (gof-pattern-selection), telling
  lookalikes apart (gof-pattern-confusion), general code smells (java-code-smells), or enterprise
  architecture smells (enterprise-architecture-smells).
---

# Pattern Anti-Patterns

## Purpose

Find abstractions that cost more than they return, and remove them safely. Every entry here is a
pattern applied correctly in structure and wrongly in judgement — which is why review misses them:
each looks like good practice in isolation.

The unifying test is the same one that should have been applied before adoption: **what named
force does this abstraction resolve, and what would break if it were inlined?** If neither can be
answered, it is a candidate for removal (`gof-pattern-thinking`).

## Detection first

```text
Signals you can grep for or count
  an interface with exactly one implementation (+ a test double)
  a class whose body differs from its siblings only in literals
  a constructor whose parameters form unrelated clusters or are repeatedly miswired
  a *Factory with methods whose products share no call site
  getInstance() anywhere
  a listener registered with no corresponding removal
  a class named *Manager, *Helper, *Processor, *Handler with no
    stated responsibility
  a test dominated by mocks and incidental interaction setup
  a wrapper whose every method is `return delegate.same()`
  @Order(100), @Order(200) with no comment

Signals from behaviour
  adding a feature means editing a hierarchy in three places
  nobody can answer "what runs here" without opening the wiring
  a bug is fixed in one variant and not the other four
  tests pass alone and fail together
```

The first list is cheap and mechanical; run it before opinions are formed. The second list is what
justifies acting on the first.

## The catalogue, in brief

These are investigation signals, not automatic deletion criteria. Inspect source, build/toolchain,
framework contracts and external consumers. Examples target Java 17 terminology; no upgrade is implied.

| Anti-pattern                        | Signal                                                 | Cost                                               |
| ----------------------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| **Speculative interface**           | One implementor and no present boundary/policy force   | Unjustified indirection                            |
| **Class per constant**              | Siblings differ only in literals                       | A deploy to change a number                        |
| **Factory for a constructor**       | Delegation with no naming, access or lifecycle purpose | Unjustified construction indirection               |
| **Abstract Factory everywhere**     | Products have no family-selection invariant            | Unrelated construction responsibilities            |
| **Builder for a two-field record**  | No useful naming/defaults/staging contract             | Optional setters may defer required-field checks   |
| **Singleton as global state**       | `getInstance()`; a `reset()` for tests                 | Order-dependent tests; hidden dependencies         |
| **Observer leak**                   | `register` with no `unregister`                        | Slow heap growth; a listener firing after disposal |
| **Mediator god object**             | Unrelated protocols and costly coordinated changes     | Concentrated unrelated changes                     |
| **Opaque decorator stack**          | Order and observable policy cannot be explained        | Unclear composed semantics                         |
| **Proxy hiding a network**          | A getter that makes a call                             | N+1 remote calls from an innocent loop             |
| **Flyweight contention**            | A shared pool on a hot path without measurements       | Lookup/retention may outweigh saved work           |
| **Visitor over a growing type set** | Every release breaks every visitor                     | The expression problem, chosen backwards           |
| **Template Method with 9 hooks**    | A base class nobody can subclass correctly             | Fragile base; unreviewable changes                 |
| **Strategy class for a lambda**     | One method, no state, no key                           | Five files for five expressions                    |
| **Prototype with `clone()`**        | `implements Cloneable`                                 | Shallow copies sharing mutable state               |
| **Pattern by precedent**            | "Every service here has one"                           | The whole list above, propagated                   |

Each entry is expanded — with the cause, the exact failure and the fix — in
[references/catalogue.md](references/catalogue.md).

## Decision rules

```text
IF an abstraction cannot be traced to a named force
THEN it is a removal candidate. Removal is a change like any other:
     propose it, measure the diff, and check the tests.

IF an interface has one implementation and one mock
THEN the mock is not evidence of runtime variability. Keep the interface
     when it enforces dependency direction, narrows a volatile/foreign API,
     marks an ownership boundary or enables a deliberate test seam; otherwise
     consider inlining it.

IF variants differ only in literals
THEN compare a value table/enum or validated configuration with required identity and policy.
     External configuration avoids deploys only if an authorized reload/distribution path exists.

IF a class name is Manager, Helper, Util, Processor or Handler
THEN identify its responsibility and reasons for change. Split unrelated ownership/protocols;
     the word "and" is not a cohesion test.

IF a test needs many mocks and asserts their call order
THEN inspect whether the subject has unrelated responsibilities or the
     test is coupled to implementation. Count alone is not a finding
     (java-test-doubles).

IF the design is over-abstracted AND under-tested
THEN add the characterisation tests before removing anything. Removing
     indirection without a safety net is how a refactoring becomes an
     incident.

IF the pattern is load-bearing for a framework
THEN preserve the behavior and lifecycle that rely on it. Replacement requires a supported
     mechanism and integration evidence; the framework name alone neither forbids nor justifies it.

IF removal would be large
THEN use independently reviewable steps, often leaf-first. Merge only when authorized;
     small cohesive removals can stay together.
```

## What is not an anti-pattern

Guarding against the opposite error, which this skill can otherwise encourage:

- **A port over an external dependency with one implementation.** It bounds a foreign model and
  gives tests a seam. That is a named force (`gof-adapter`).
- **A stable hierarchy with no demonstrated maintenance or runtime cost.** Compare evidence of
  benefit with migration cost; absence of bugs alone does not decide (`java-dry-kiss-yagni`).
- **A framework's own use of a pattern.** Filters, interceptors, proxies and template base classes
  are the framework's design, not yours.
- **A contract test base class.** Inheritance is correct there: the subclass supplies a value and
  inherits a specification.
- **An abstraction with a named present force.** Multiple implementations are one justification;
  dependency inversion, protocol translation, security policy and ownership can justify one too.

## Review checklist

- [ ] Every interface has runtime variability or a stated boundary/ownership/policy reason
- [ ] Literal-only variants justify identity/metadata or use a simpler representation
- [ ] Global access has an explicit scope and ownership; tests do not mutate shared state accidentally
- [ ] Listener retention and disposal match publisher/subscriber lifetimes or subscription ownership
- [ ] Coordinators with many dependencies have one coherent use case and manageable test/change cost
- [ ] Wrapper stacks document their order at the wiring site
- [ ] Remote/lazy access has explicit cost, failure and batching contracts
- [ ] Copying preserves intended aliasing, invariants and compatibility regardless of mechanism
- [ ] Names state a responsibility, not a role in a pattern
- [ ] Each removal has proportionate contract checks and a compatible migration path

## References

Report evidence, the missing or obsolete force, concrete cost, smallest safe change and validation.
If the force or consumer set remains unknown, investigate it and keep removal conditional.

- [Catalogue](references/catalogue.md) — every entry above expanded: why it happens, how to detect
  it precisely, the failure it produces in production, and the fix. Read when a specific misuse has
  been identified or suspected.
- [Removing a pattern safely](references/removing-a-pattern.md) — the general procedure for
  deleting an abstraction without breaking callers, the characterisation tests to add first,
  ordering rules for large removals, and the four cases where the correct decision is to leave it
  alone. Read before deleting anything.
