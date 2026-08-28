---
name: gof-pattern-confusion
description: >
  Telling apart the patterns that look alike, so a design is not chosen because a name sounded
  right. Covers the four wrappers (Adapter, Decorator, Proxy, Facade) and the two questions that
  separate them, Strategy against State against Template Method against Command, Observer against
  Mediator, the three creational lookalikes plus the static factory that is not Factory Method,
  Composite against Decorator, Visitor against Iterator, Command against Event, and Memento against
  snapshot against event sourcing. Use when two patterns both seem to fit, when a review comment
  disputes what a class is, when a wrapper's kind must be named, when a class is described with a
  pattern name that does not match what it does, or when documenting an existing design. Does not
  cover getting from a problem to a shortlist (gof-pattern-selection), the reasoning discipline
  (gof-pattern-thinking), any individual pattern's own guidance (the gof-* skills), or misuse
  catalogues (gof-pattern-antipatterns).
---

# Pattern Confusion

## Purpose

Stop a design being selected by name similarity. Most of the twenty-three patterns have at least
one neighbour with the same structure and a different intent, and the difference is always
behavioural — who knows whom, who decides, what the caller believes it is holding.

Naming a class correctly is not pedantry. "This is a Proxy, not a Decorator" tells the next reader
that the subject may be unreachable any other way; "this is a Mediator, not a Facade" tells them
the collaborators call back into it and that it will accumulate their rules.

## The two questions that separate the four wrappers

```text
Q1: Is the wrapper's interface the SAME as the wrapped object's?

    same        → Decorator or Proxy
    different   → Adapter or Facade

Q2 (same interface): could you stack two of them and still make sense?

    yes, and the order matters      → Decorator
    no; it stands in for the thing  → Proxy

Q2 (different interface): how many objects are behind it?

    one, and you did not design it  → Adapter
    several, and you own them       → Facade
```

| Pattern       | Interface    | Behind it        | Caller believes         | Tell                                   |
| ------------- | ------------ | ---------------- | ----------------------- | -------------------------------------- |
| **Adapter**   | Different    | One foreign type | It is using your API    | Foreign types stop at it               |
| **Facade**    | New, coarser | Several, yours   | It is using a subsystem | It calls collaborators, not one object |
| **Decorator** | Same         | One, same type   | It has the thing        | Two could be stacked, in an order      |
| **Proxy**     | Same         | One, same type   | It **has** the thing    | It controls whether you reach it       |

## Behavioural lookalikes, in one line each

```text
Strategy vs State
    Who changes it? The caller → Strategy. The object → State.

Strategy vs Template Method
    Whole algorithm varies → Strategy. Named steps inside a fixed
    sequence vary → Template Method.

Strategy vs Command
    A way of doing something, passed in → Strategy.
    A request to do something, stored → Command.

Command vs Event
    Imperative, one handler, may be refused → Command.
    Past tense, any subscribers, already happened → Event.

Observer vs Mediator
    The subject does not care who reacts → Observer.
    The hub decides what happens next → Mediator.

Facade vs Mediator
    Direction. Do the collaborators call back in? Then Mediator.

Mediator vs command dispatcher
    Is there a protocol between participants? If not, it is dispatch.

Chain of Responsibility vs Decorator
    Does one handler handle and the rest stop → Chain.
    Do all of them run, wrapping each other → Decorator/pipeline.

Composite vs Decorator
    Structurally identical. Composite has many children and models
    part/whole; Decorator has exactly one and adds behaviour.

Visitor vs Iterator
    Iterator supplies the elements; Visitor supplies the operation.
    A Visitor usually needs a traversal; an Iterator needs no operation.

Bridge vs Strategy
    Does the abstraction side have variants of its own? Bridge.
    One class holding one varying behaviour? Strategy.

Factory Method vs Abstract Factory vs Builder
    One product, chosen by a subtype → Factory Method.
    A family that must match → Abstract Factory.
    One product, many parameters → Builder.

Factory Method vs static factory method
    A subclass hook inside an inherited algorithm → the GoF pattern.
    A named constructor on the type → Effective Java's Item 1. Not it.

Singleton vs Flyweight
    One instance because uniqueness matters → Singleton.
    Shared instances because memory matters → Flyweight.

Memento vs snapshot vs event sourcing
    In-process and opaque → Memento.
    Durable, versioned, a contract → snapshot.
    History of why, replayed → event sourcing.

Proxy vs a remote client
    If the interface admits remoteness — deadlines, failure types,
    bulk operations — it is a client and that is healthier than a
    proxy pretending the call is local.
```

## Decision rules

```text
IF two candidates both fit
THEN ask what the caller must NOT know. That is almost always the
     discriminator, because intent is what differs.

IF a wrapper's interface differs from the wrapped type's
THEN it is not a Decorator or a Proxy, whatever it is called.

IF the class is invoked by its own collaborators
THEN it is a Mediator, not a Facade, and it will grow.

IF a "Strategy" is reassigned by the object that holds it
THEN it is a State, and there are transitions nobody has written down.

IF an "event" can be rejected, or has exactly one handler that owes
an answer
THEN it is a command; rename it before the coupling is built on it.

IF a "Factory Method" is static and lives on the product type
THEN judge it as a named constructor, not by this pattern's criteria.

IF a name is disputed in review and both parties agree on the
behaviour
THEN write the behaviour in the class Javadoc and move on. The name
     matters only where it changes what a reader expects.
```

## References

- [The four wrappers](references/wrappers.md) — Adapter, Decorator, Proxy and Facade separated in
  full: the same code shape written four ways with what differs, the ownership and reachability
  questions, the composed cases (a decorator over a proxy over an adapter) and how to describe
  them, and how to classify an existing wrapper in three questions. Read when naming or reviewing
  a wrapper.
- [Behavioural lookalikes](references/behavioural-lookalikes.md) — Strategy/State/Template
  Method/Command, Observer/Mediator, Chain/Decorator, Composite/Decorator, Visitor/Iterator,
  Command/Event, and Memento/snapshot/event sourcing, each with the discriminating question, a
  worked misclassification and the concrete cost of getting it wrong. Read when a behavioural
  pattern's name is disputed.
