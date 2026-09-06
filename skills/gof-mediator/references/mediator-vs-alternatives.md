# Mediator against the alternatives

## The four candidates

| Pattern                | Who knows whom                                               | Coupling removed                    | Coupling added                                |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------- | --------------------------------------------- |
| **Direct references**  | Participants reference needed peers                          | —                                   | Can grow toward N×(N−1) directed dependencies |
| **Mediator**           | Participants ↔ hub through ports/messages                    | Protocol dependencies between peers | Hub owns the collaboration rules              |
| **Observer / events**  | Publisher knows subscription mechanism; listeners know event | Concrete subscriber implementations | Event/delivery contracts                      |
| **Command dispatcher** | Sender knows the command; one handler exists                 | Sender → handler                    | Command/result contracts and dispatch policy  |

Two discriminations matter in review.

**Mediator versus Observer.** A mediator _decides_: it knows that when A finishes, B should start
unless C is pending. An observer publisher does not decide anything; it states a fact and is
indifferent to who reacts. If your hub's methods contain conditional logic about other
participants, it may be a mediator; forwarding alone may be an event bus with useful dispatch,
subscription or delivery policy. Classify the responsibility instead of inferring value from the name.

**Mediator versus command dispatcher.** Libraries in other ecosystems popularised calling a
request-to-handler dispatcher a "mediator". It shares no properties with this pattern: there are no
participants, no protocol, no callbacks, and nothing to coordinate. Calling it one obscures the
real question — whether the dispatch adds anything over calling the handler (`gof-command`).

## God-object criteria

A mediator deserves closer inspection when these signals reveal unrelated change or ownership:

- **The interaction protocol is hard to follow.** Participant count alone supplies no failure threshold.
- **Methods serving unrelated protocols.** Disjoint state is supporting evidence, not proof by itself.
- **Participants used by unrelated methods.** Check whether a shared protocol orders those calls;
  one call site per participant can still be cohesive coordination.
- **Tests repeatedly require unrelated fakes and setup.** Interaction tests scale with protocol
  participants; unrelated setup is stronger evidence of mixed protocols than any fixed count.
- **Every feature touches it.** Merge conflicts concentrate there because it is the application.

### Splitting

Split by **protocol**, never by noun.

```java
// before: one hub for "orders"
class OrderCoordinator {          // 9 participants, 14 methods
    void onOrderPlaced(...)       // fulfilment protocol
    void onStockReserved(...)     // fulfilment protocol
    void onPaymentSettled(...)    // fulfilment protocol
    void onReturnRequested(...)   // returns protocol
    void onRefundIssued(...)      // returns protocol
    void onCatalogueUpdated(...)  // pricing protocol
}

// after: one hub per interaction
final class FulfilmentCoordinator { }   // 4 participants
final class ReturnsCoordinator { }      // 3 participants
// pricing had no protocol at all — it was one event and one listener
```

The last line is the common outcome: part of a god mediator is not coordination and becomes a
plain listener or a direct call. Extract that first; it is the cheapest reduction.

## Reentrancy

```java
class LayoutMediator {
    void changed(Widget source) {
        for (Widget w : widgets) {
            w.setEnabled(rule(w));      // setEnabled fires changed(w) → re-enters
        }
    }
}
```

Symptoms range from an infinite loop, to a `StackOverflowError`, to the subtler case: a
participant observing the hub's state part-way through an update and acting on it.

Candidate strategies, with different semantics:

```java
// 1. flag: single-threaded, and only if dropping nested notifications is allowed
private boolean updating;
void changed(Widget source) {
    if (updating) return;
    updating = true;
    try { ... } finally { updating = false; }
}

// 2. queue notifications, drain after the current update completes
private final Deque<Widget> pending = new ArrayDeque<>();

// 3. make the update a pure function of state, applied once
State next = protocol.apply(current, event);   // no callbacks during computation
applyTo(participants, next);
```

Pure computation prevents callbacks during computation, but applyTo can still re-enter. Commit
state before effects and route callbacks through the chosen delivery policy. Queues require a
drain guard, capacity/overflow rules and convergent or deduplicated transitions; they do not stop
an endless feedback loop by themselves (`gof-state`).

## Threading models

```text
Shared, synchronised hub
  + participants call from any thread
  − lock ordering across participants is now the hub's problem
  − contention proportional to interaction rate

Single-threaded hub (queue + one consumer)
  + confined protocol state needs no locks if all callbacks enqueue, never invoke inline
  + easy to reason about and to test deterministically
  − a throughput ceiling of one, and callers must accept asynchrony
  − a slow participant blocks the whole protocol unless calls are offloaded

Immutable state + CAS
  + state publication can avoid a lock; CAS retries and downstream effects may still stall
  − only workable when the transition is a pure function and effects
    can be applied after the swap
```

Choose confinement when its latency/capacity contract fits. Offloaded effects still need ordered
completion, cancellation and failure handling. CAS publication does not atomically deliver an effect;
use claimed effect identities and a delivery/recovery policy (`littles-law-and-queueing`).

## Orchestration versus choreography

The distributed forms of Mediator and Observer respectively.

|                           | Orchestration (a mediator)               | Choreography (events)                                                                   |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Where the flow is visible | Central protocol definition              | Distributed protocol; documentation and projections may provide an overview             |
| Adding a step             | Usually change the orchestrator          | Independent reactions may need only a subscriber; protocol changes may affect producers |
| Availability              | Dependent progress may wait for recovery | Broker/storage and participants can be shared failure dependencies                      |
| Cancellation              | Central state can help enforce policy    | Requires explicit distributed ownership and protocol                                    |
| Debugging a stuck flow    | Query the orchestrator's state           | Correlate traces across services                                                        |
| Coupling                  | Orchestrator knows every participant     | Everyone couples to event schemas                                                       |

Neither is correct in general. The decision rules that hold up:

- **Compensation, deadlines and cancellation can favor an orchestrator** for explicit ownership;
  choreography can implement them too, with additional distributed protocol state.
- **Independent fan-out often favors choreography.** Central coordination may still be needed for
  bounded concurrency, aggregate completion or another explicit requirement.
- **Hybrid flows need one authority per transition.** Orchestrated core work can publish events for
  independent reactions; duplicated decisions about the same transition are the problem.

For flows required to survive restart, persist progress under the chosen owner, centrally or distributed;
an in-memory coordinator alone cannot supply that recovery contract
(`distributed-transactions-and-sagas`, `event-driven-architecture`).
