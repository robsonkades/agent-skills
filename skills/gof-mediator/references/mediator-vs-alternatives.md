# Mediator against the alternatives

## The four candidates

| Pattern                | Who knows whom                                      | Coupling removed         | Coupling added                            |
| ---------------------- | --------------------------------------------------- | ------------------------ | ----------------------------------------- |
| **Direct references**  | Everyone knows everyone                             | —                        | N×N                                       |
| **Mediator**           | Participants ↔ hub; hub knows all                   | N×N between participants | N to the hub; the hub knows all rules     |
| **Observer / events**  | Publishers know nothing; subscribers know the event | Publisher → subscriber   | Everyone couples to the event's shape     |
| **Command dispatcher** | Sender knows the command; one handler exists        | Sender → handler         | None to speak of — but no protocol either |

Two discriminations matter in review.

**Mediator versus Observer.** A mediator _decides_: it knows that when A finishes, B should start
unless C is pending. An observer publisher does not decide anything; it states a fact and is
indifferent to who reacts. If your hub's methods contain conditional logic about other
participants, it is a mediator; if it only forwards, it is an event bus wearing a hub's name and
the indirection is buying nothing.

**Mediator versus command dispatcher.** Libraries in other ecosystems popularised calling a
request-to-handler dispatcher a "mediator". It shares no properties with this pattern: there are no
participants, no protocol, no callbacks, and nothing to coordinate. Calling it one obscures the
real question — whether the dispatch adds anything over calling the handler (`gof-command`).

## God-object criteria

A mediator has failed when any two of these are true:

- **More than about seven participants.** The number is a heuristic; the underlying property is
  that no reader can hold the protocol in mind.
- **Methods that share no state.** `onPaymentSettled` and `onCatalogueImported` touching disjoint
  fields are two protocols in one class.
- **Participants injected but used by one method each.** The hub is a namespace, not a coordinator.
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

Guards, in increasing robustness:

```java
// 1. a flag — correct only if single-threaded
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

The third removes the possibility rather than detecting it, and is the design to prefer when the
protocol can be expressed as a state transition (`gof-state`).

## Threading models

```text
Shared, synchronised hub
  + participants call from any thread
  − lock ordering across participants is now the hub's problem
  − contention proportional to interaction rate

Single-threaded hub (queue + one consumer)
  + protocol state needs no synchronisation; reentrancy becomes queueing
  + easy to reason about and to test deterministically
  − a throughput ceiling of one, and callers must accept asynchrony
  − a slow participant blocks the whole protocol unless calls are offloaded

Immutable state + CAS
  + no blocking
  − only workable when the transition is a pure function and effects
    can be applied after the swap
```

The single-threaded hub is under-used and is usually the right first choice for in-process
coordination: it is the actor model in miniature, and it converts every concurrency question into
a queueing question, which is easier to answer (`littles-law-and-queueing`).

## Orchestration versus choreography

The distributed forms of Mediator and Observer respectively.

|                           | Orchestration (a mediator)                        | Choreography (events)                          |
| ------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Where the flow is visible | One place — you can read it                       | Nowhere — reconstructed from event definitions |
| Adding a step             | Change the orchestrator                           | Add a subscriber; no existing service changes  |
| Availability              | The orchestrator's availability bounds everyone's | No shared component to fail                    |
| Cancellation              | Possible — one component knows the whole flow     | Hard; nothing owns the flow                    |
| Debugging a stuck flow    | Query the orchestrator's state                    | Correlate traces across services               |
| Coupling                  | Orchestrator knows every participant              | Everyone couples to event schemas              |

Neither is correct in general. The decision rules that hold up:

- **A flow with compensation, deadlines or cancellation wants an orchestrator**, because something
  must own "the whole thing" to time it out or unwind it.
- **A fan-out of independent reactions wants choreography**, because an orchestrator would be a
  bottleneck that adds nothing.
- **Do not mix them for one flow.** Half-orchestrated flows have two sources of truth about what
  should happen next, and they disagree during incidents.

Whichever is chosen, the orchestrator's own state must be durable: it is a process that survives
restarts, so its position in the flow belongs in a store, not in memory
(`distributed-transactions-and-sagas`, `event-driven-architecture`).
