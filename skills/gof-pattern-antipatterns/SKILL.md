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

| Anti-pattern                        | Signal                                          | Cost                                               |
| ----------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| **Speculative interface**           | One implementor, no named second                | Indirection on every read, forever                 |
| **Class per constant**              | Siblings differ only in literals                | A deploy to change a number                        |
| **Factory for a constructor**       | `createX()` returning `new X()`                 | A file, a stack frame, nothing gained              |
| **Abstract Factory everywhere**     | Products never used together                    | A service locator with a respectable name          |
| **Builder for a two-field record**  | `build()` on a type with no optional components | A compile-time check replaced by a runtime one     |
| **Singleton as global state**       | `getInstance()`; a `reset()` for tests          | Order-dependent tests; hidden dependencies         |
| **Observer leak**                   | `register` with no `unregister`                 | Slow heap growth; a listener firing after disposal |
| **Mediator god object**             | 12 dependencies; methods sharing no state       | Every feature edits one file                       |
| **Opaque decorator stack**          | 6 layers, order undocumented                    | Nobody can predict the semantics                   |
| **Proxy hiding a network**          | A getter that makes a call                      | N+1 remote calls from an innocent loop             |
| **Flyweight contention**            | A shared pool on a hot path                     | Memory saved, throughput lost, neither measured    |
| **Visitor over a growing type set** | Every release breaks every visitor              | The expression problem, chosen backwards           |
| **Template Method with 9 hooks**    | A base class nobody can subclass correctly      | Fragile base; unreviewable changes                 |
| **Strategy class for a lambda**     | One method, no state, no key                    | Five files for five expressions                    |
| **Prototype with `clone()`**        | `implements Cloneable`                          | Shallow copies sharing mutable state               |
| **Pattern by precedent**            | "Every service here has one"                    | The whole list above, propagated                   |

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
THEN the fix is configuration, and it also removes a deploy from the
     change.

IF a class name is Manager, Helper, Util, Processor or Handler
THEN ask what it is responsible for in one sentence. If the sentence
     needs "and", split it.

IF a test needs many mocks and asserts their call order
THEN inspect whether the subject has unrelated responsibilities or the
     test is coupled to implementation. Count alone is not a finding
     (java-test-doubles).

IF the design is over-abstracted AND under-tested
THEN add the characterisation tests before removing anything. Removing
     indirection without a safety net is how a refactoring becomes an
     incident.

IF the pattern is load-bearing for a framework
THEN leave it. @Transactional proxies, servlet filters and JPA lazy
     proxies are not your abstractions to remove.

IF removal would be large
THEN do it leaf-first and merge each step. A big-bang de-abstraction
     is as unreviewable as the abstraction was.
```

## What is not an anti-pattern

Guarding against the opposite error, which this skill can otherwise encourage:

- **A port over an external dependency with one implementation.** It bounds a foreign model and
  gives tests a seam. That is a named force (`gof-adapter`).
- **A stable, working hierarchy that has not caused a bug.** The cost of migration is real; the
  benefit is speculative (`java-dry-kiss-yagni`).
- **A framework's own use of a pattern.** Filters, interceptors, proxies and template base classes
  are the framework's design, not yours.
- **A contract test base class.** Inheritance is correct there: the subclass supplies a value and
  inherits a specification.
- **An abstraction with a named present force.** Multiple implementations are one justification;
  dependency inversion, protocol translation, security policy and ownership can justify one too.

## Review checklist

- [ ] Every interface has runtime variability or a stated boundary/ownership/policy reason
- [ ] No class differs from its siblings only in literals
- [ ] No `getInstance()`, and no test needs a `reset()`
- [ ] Every listener registration has a deregistration with a named owner
- [ ] Coordinators with many dependencies have one coherent use case and manageable test/change cost
- [ ] Wrapper stacks document their order at the wiring site
- [ ] No getter triggers a network call or a database query
- [ ] No `Cloneable`; copying is a constructor or a factory
- [ ] Names state a responsibility, not a role in a pattern
- [ ] Each removal is proposed leaf-first with tests in place

## References

- [Catalogue](references/catalogue.md) — every entry above expanded: why it happens, how to detect
  it precisely, the failure it produces in production, and the fix. Read when a specific misuse has
  been identified or suspected.
- [Removing a pattern safely](references/removing-a-pattern.md) — the general procedure for
  deleting an abstraction without breaking callers, the characterisation tests to add first,
  ordering rules for large removals, and the four cases where the correct decision is to leave it
  alone. Read before deleting anything.
