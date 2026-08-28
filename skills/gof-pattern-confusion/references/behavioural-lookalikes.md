# Behavioural lookalikes

Each section: the discriminating question, a misclassification that happens, and what it costs.

## Strategy vs State

**Question: who changes it?**

```java
// Strategy — the caller supplies it; it does not change itself
var priced = pricer.price(order, PricingPolicy.CONTRACT);

// State — the object changes its own; the variants relate to each other
order.apply(new Pay(now, reference));    // Draft → Paid, decided inside
```

**The misclassification:** an `OrderStrategy` field reassigned by the order itself after each
operation.

**Cost:** the transitions exist but are written nowhere. Illegal ones are reachable, because
"assign a different strategy" has no rule attached, and nothing rejects `Shipped → Paid`. Naming it
State forces the transition function to exist (`gof-state`).

## Strategy vs Template Method

**Question: does the whole algorithm vary, or named steps inside a fixed one?**

**The misclassification:** a Template Method with one abstract hook. That is a strategy expressed as
a hierarchy — the most expensive possible way to say "this one thing varies".

**Cost:** subclasses coupled to the base's self-use, a class per variant, and no ability to combine
a step from one variant with a step from another. Converting it to a final class taking the step as
a parameter removes all three (`gof-template-method`).

The converse also happens: five separate strategies each repeating the same setup and teardown
around their one differing line. That repetition is the template, and it should be in the caller
once.

## Strategy vs Command

**Question: is it a way of doing something, or a request to do something?**

```java
interface PricingRule { Money price(Order order); }        // Strategy: a how
record CancelOrder(OrderId id, Reason reason) { }          // Command: a what
```

A Strategy is supplied to an operation; a Command _is_ the operation, captured. The test that
settles it: **would you put it on a queue?** Strategies are not queued; commands are.

**Cost of confusing them:** a "strategy" serialised into a message becomes a versioned contract
nobody designed, and a "command" passed as a parameter to configure behaviour gains an
`execute()` that nobody calls.

## Command vs Event

**Question: tense, and who owes an answer.**

| Command                       | Event                         |
| ----------------------------- | ----------------------------- |
| `PlaceOrder`                  | `OrderPlaced`                 |
| One logical handler           | Any number of subscribers     |
| May be rejected               | Already happened              |
| The sender expects an outcome | The publisher expects nothing |

**The misclassification:** `OrderValidated`, published for a subscriber to approve or reject.

**Cost:** the publisher now depends on a decision it cannot see, the answer has nowhere to go, and
adding a second subscriber silently changes the operation's meaning. Read the name with "please"
in front — if it sounds wrong, it is an event (`gof-command`).

## Observer vs Mediator

**Question: does the notifier decide what happens next?**

```java
// Observer — the subject states a fact and is indifferent
events.publish(new PriceChanged(sku, newPrice));

// Mediator — the hub decides, and calls participants
void priceChanged(Sku sku, Price p) {
    if (basket.contains(sku) && !checkout.isLocked()) basket.reprice(sku, p);
}
```

**The misclassification:** an "event bus" whose handler contains conditionals about other
components. It is a mediator, and every new relationship adds a rule to it.

**Cost:** the hub grows into a god object while everyone believes it is a thin dispatcher, because
the word "bus" suggests it. Naming it a mediator sets the expectation that it must be bounded and
split (`gof-mediator`).

## Facade vs Mediator

**Question: direction.** Do the collaborators call back into it?

**The misclassification:** a `Coordinator` described as a facade because it "simplifies access".

**Cost:** a facade is expected to stay thin, so nobody watches its size. A mediator must be
watched, because it accumulates protocol rules by design.

## Chain of Responsibility vs Decorator

**Question: does one handler handle and the rest stop, or do all of them run?**

Both are a sequence of same-interface objects. In a chain, a handler may decline and the request
moves on, and exactly one handles. In a decorator stack, every layer runs and each wraps the rest.

**The misclassification:** a "chain" where each handler both handles and forwards.

**Cost:** downstream handlers receive a request that has already been handled, and the
first-match-wins contract silently does not hold. Deciding which shape it is fixes the
unhandled-request policy too — a pipeline cannot fall off the end, and a chain can
(`gof-chain-of-responsibility`).

## Composite vs Decorator

**Question: how many children, and why?**

Structurally identical — both hold objects of their own interface. A Composite holds many and
models part/whole; a Decorator holds exactly one and adds behaviour.

**The misclassification:** a Composite with exactly one child used to add behaviour, or a
"decorator" holding a list.

**Cost:** small in code, real in expectations. Readers of a composite expect aggregation semantics
(`size()` sums its children); readers of a decorator expect delegation and stacking. A class that
does both surprises both.

## Visitor vs Iterator

**Question: what is being supplied — the elements, or the operation?**

An Iterator gives you elements and knows nothing about what you do with them. A Visitor gives you
the operation and usually needs a traversal from somewhere.

**The misclassification:** a "visitor" that walks the structure and does one thing, with one
implementation.

**Cost:** the accept/visit machinery for a plurality that does not exist. One operation over a
structure is a method or a `switch` (`gof-visitor`).

## Bridge vs Strategy

**Question: does the abstraction side have variants of its own?**

Strategy: one class holding one varying behaviour. Bridge: two hierarchies, both with members,
varying independently.

**The misclassification:** calling every composed interface a bridge.

**Cost:** mostly vocabulary — but it obscures the real Bridge test, which is whether the class
count is multiplying. If there is only one abstraction, there is no product to prevent
(`gof-bridge`).

## Factory Method vs Abstract Factory vs Builder vs static factory

| What you have                                        | It is                               |
| ---------------------------------------------------- | ----------------------------------- |
| A subclass hook, called from inherited code          | Factory Method (GoF)                |
| `static X of(...)` on the product type               | A static factory — not this pattern |
| Several products that must come from the same family | Abstract Factory                    |
| One product, many or optional parameters             | Builder                             |
| A `Supplier` field                                   | A function, and that is fine        |

**The misclassification:** calling `Money.of(...)` a Factory Method.

**Cost:** it invites someone to "complete the pattern" by adding a hierarchy the static factory
never needed. The static factory's value — a name, instance control, returning a subtype — has
nothing to do with subclassing (`gof-factory-method`).

## Singleton vs Flyweight

**Question: is one instance the requirement, or is sharing an optimisation?**

Singleton exists because uniqueness matters. Flyweight exists because memory matters, and it
usually has many instances — one per distinct value.

**The misclassification:** a "cache singleton" that is both, and neither well.

**Cost:** the two have opposite review checklists. Singleton needs the "one per what?" question and
a testability answer; Flyweight needs a heap measurement, a bound and an immutability guarantee.
Conflating them means neither list is applied (`gof-singleton`, `gof-flyweight`).

## Memento vs snapshot vs event sourcing

| Property           | Memento     | Snapshot         | Event sourcing                |
| ------------------ | ----------- | ---------------- | ----------------------------- |
| Lives              | In memory   | In storage       | In an append-only log         |
| Readable by others | No — opaque | Yes — a contract | Yes — events are the contract |
| Versioned          | No          | **Required**     | Required, forever             |
| Answers "why"      | No          | No               | **Yes**                       |

**The misclassification:** calling a persisted, cross-version state document a memento.

**Cost:** it is written without a version field, because mementos do not need one. The first
deploy that changes the shape cannot read the old ones, and a resumable job cannot resume
(`gof-memento`).

## Proxy vs a remote client

**Question: does the interface admit that the call is remote?**

An interface with a deadline parameter, a documented transient/permanent failure split and bulk
operations is a client, and it is healthier than a proxy pretending the call is local.

**Cost of the wrong one:** the loop that calls `directory.byId(...)` per element — correct against
a local table, 2 000 network calls against a service (`gof-proxy`,
`gof-patterns-and-distribution`).
