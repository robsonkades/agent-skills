# Behavioural lookalikes

Each section: the discriminating question, a misclassification that happens, and what it costs.

## Strategy vs State

**Question: policy selection or lifecycle transitions?**

```java
// Strategy — the caller supplies it; it does not change itself
var priced = pricer.price(order, PricingPolicy.CONTRACT);

// State — the object changes its own; the variants relate to each other
order.apply(new Pay(now, reference));    // Draft → Paid, decided inside
```

**The ambiguous case:** an `OrderStrategy` field reassigned by the order itself after each
operation.

**Check:** adaptive strategy selection can reassign a policy internally; a state machine can
accept external transition requests. If variants represent lifecycle states, inspect guards and
illegal transitions such as `Shipped → Paid`. Naming alone enforces nothing (`gof-state`).

## Strategy vs Template Method

**Question: composition or an inherited algorithm skeleton?**

**The candidate refactor:** a Template Method with one hook may be simpler as an injected
function when the application owns its extension set. One hook is still a valid Template Method;
framework/public extension contracts can justify retaining it.

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

A Strategy supplies behavior; a Command represents a request. Commands can execute synchronously
without storage, and a request can carry a policy identifier. Queueability is a possible use,
not the definition. Inspect whether the object selects how or requests what.

**Cost of confusing them:** a "strategy" serialised into a message becomes a versioned contract
nobody designed, and a "command" passed as a parameter to configure behaviour gains an
`execute()` that nobody calls.

## Command vs Event

**Question: tense, and who owes an answer.**

| Command                       | Event                                         |
| ----------------------------- | --------------------------------------------- |
| `PlaceOrder`                  | `OrderPlaced`                                 |
| One logical handler           | Any number of subscribers                     |
| May be rejected               | Already happened                              |
| The sender expects an outcome | Fact stands even if delivery/processing fails |

**The misclassification:** `OrderValidated`, published for a subscriber to approve or reject.

**Cost:** the publisher now depends on a decision it cannot see, the answer has nowhere to go, and
adding another decision-maker can change the operation's meaning. Tense is only a naming clue:
an event may have one consumer and its handling can fail; the reported fact is already established.
A broker acknowledgment concerns delivery, not whether that fact happened (`gof-command`).

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

**The potential misclassification:** a bus that itself owns participant sequencing is also a
mediator. A listener with domain conditions does not turn the transport/bus into a mediator;
identify where the coordination rules actually live.

**Cost:** the hub grows into a god object while everyone believes it is a thin dispatcher, because
the word "bus" suggests it. Naming it a mediator sets the expectation that it must be bounded and
split (`gof-mediator`).

## Facade vs Mediator

**Question: does it simplify access or own participant interaction rules?** Callbacks can supply
progress/results to a facade without making it a mediator. A mediator can also expose a facade.

**The ambiguous case:** a `Coordinator` described as a facade because it "simplifies access".

**Cost:** a facade is expected to stay thin, so nobody watches its size. A mediator must be
watched, because it accumulates protocol rules by design.

## Chain of Responsibility vs Decorator

**Question: what is the continuation and responsibility protocol?**

First-match chains stop when a handler accepts; processing chains may handle and forward.
Decorators wrap a component to add behavior and may short-circuit (a cache hit, for example).
Count of executed layers does not decide the pattern.

**The contract defect:** a chain documented as first-match forwards after accepting.

**Cost:** downstream handlers receive a request that has already been handled, and the
first-match-wins contract silently does not hold. Deciding which shape it is fixes the
unhandled-request and terminal-result policy for either a processing chain or first-match chain
(`gof-chain-of-responsibility`).

## Composite vs Decorator

**Question: how many children, and why?**

Both can hold objects of their own interface. Composite models part/whole even with zero or one
child; Decorator augments a wrapped component. Intent matters more than current cardinality.

**The possible overlap:** a one-child composite that also augments behavior. Inspect aggregate
semantics and the delegated contract before imposing a single label.

**Cost:** small in code, real in expectations. Readers of a composite expect aggregation semantics
(`size()` sums its children); readers of a decorator expect delegation and stacking. A class that
does both surprises both.

## Visitor vs Iterator

**Question: what is being supplied — the elements, or the operation?**

An Iterator gives you elements and knows nothing about what you do with them. A Visitor gives you
the operation and usually needs a traversal from somewhere.

**The review candidate:** a "visitor" that walks the structure and does one thing, with one
implementation.

**Check:** a single visitor may implement a required public traversal API or keep operations
outside a closed element model. If those constraints are absent, compare a direct method or
baseline-compatible switch; operation count alone does not invalidate Visitor (`gof-visitor`).

## Bridge vs Strategy

**Question: does the abstraction side have variants of its own?**

Strategy selects behavior through composition. Bridge separates abstraction and implementation
axes for independent evolution; those axes need not both have multiple deployed variants yet.

**The misclassification:** calling every composed interface a bridge.

**Cost:** mostly vocabulary — but it obscures the real Bridge test, which is whether the class
count or changes are coupling independent axes. A sparse current matrix can still justify a Bridge
(`gof-bridge`).

## Factory Method vs Abstract Factory vs Builder vs static factory

| What you have                                        | It is                               |
| ---------------------------------------------------- | ----------------------------------- |
| A subclass hook, called from inherited code          | Factory Method (GoF)                |
| `static X of(...)` on the product type               | A static factory — not this pattern |
| Several products that must come from the same family | Abstract Factory                    |
| Staged construction with intermediate choices        | Builder                             |
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

| Property           | Memento              | Snapshot                     | Event sourcing                |
| ------------------ | -------------------- | ---------------------------- | ----------------------------- |
| Lives              | Transient or durable | In storage                   | In an append-only log         |
| Readable by others | No — opaque          | Yes — a contract             | Yes — events are the contract |
| Versioned          | If persisted         | **Required for durable use** | Required, forever             |
| Answers "why"      | No                   | No                           | Only recorded reasons         |

**The mistake:** treating a persisted memento as exempt from snapshot compatibility duties.

**Cost:** cross-version restoration fails without a schema identity and migration/rejection
policy. A memento can be durable; a literal version field is one possible mechanism
(`gof-memento`).

## Proxy vs a remote client

**Question: does the interface admit that the call is remote?**

A remote Proxy can also be called a client. Expose deadline and failure semantics, including
unknown outcomes, and appropriate bulk operations regardless of label; do not conceal network cost.

**Cost of the wrong one:** the loop that calls `directory.byId(...)` per element — correct against
a local table, 2 000 network calls against a service (`gof-proxy`,
`gof-patterns-and-distribution`).
