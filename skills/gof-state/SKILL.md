---
name: gof-state
description: >
  State in modern Java: making an object's behaviour depend on an explicit state, with the
  transitions themselves modelled rather than implied by scattered flags. Covers the intent difference
  from Strategy, where transitions should live — in the state classes, in a table, or in one
  exhaustive switch — sealed records against enums, rejecting illegal transitions by default,
  persisting a state through stable codes rather than ordinals, atomic transitions under concurrency, and timeouts
  as transitions in a durable workflow. Use
  when boolean flags multiply on an entity, when a status field is checked in scattered ifs, when
  an illegal transition reaches production, when a workflow must survive a restart, or when two
  requests transition the same entity concurrently. Does not cover interchangeable algorithms
  chosen by a caller (gof-strategy), saga orchestration across services
  (distributed-transactions-and-sagas, gof-mediator), or optimistic locking mechanics
  (offline-concurrency-control).
---

# State

## Purpose

Make "what this object can do now" a property of an explicit state rather than of a combination of
flags. The pattern's real product is the **transition function**: a single place that says which
events are legal in which state and what the result is, so an illegal transition is a rejection
rather than a corrupted object.

The classical structure — a state object per state, with behaviour — is one way to express it. In
Java a useful expression for small owned machines is a sealed set of states plus one exhaustive
`switch` over `(state, event)`, because that puts the whole machine in one readable place and
checks state-type coverage when recompiled. It does not prove guards, payload validity or effects.
Pattern-switch snippets require Java 21 without preview; inspect target compiler/framework/database
versions before applying them. Older targets can use enums or state methods without an upgrade.

## State against Strategy

```text
Same structure. Different intent, and three observable differences:

Who chooses          Strategy: policy/configuration/client normally selects.
                     State: transition rules select as events are applied.

Does it change       Strategy may be replaced dynamically, but replacement is
itself               not usually the domain behavior being modeled.
                     State transitions are part of the modeled behavior.

Do variants know     Strategy: preferably independent algorithms.
each other           State: transitions relate them, whether the states
                     know each other or a table does.
```

Choose by intent: domain lifecycle rules suggest State; interchangeable algorithms suggest Strategy.
A terminal state need not transition, and policies can compose/reference one another without
becoming a lifecycle (`gof-strategy`).

## When it is the answer

```text
Behaviour depends on a status, and the legal transitions between
statuses are a real domain rule
        → State, with an explicit transition function.

Boolean flags have multiplied — paid, shipped, cancelled, refunded —
and their legal combinations are fewer than 2^n
        → inspect whether one lifecycle or several independent dimensions are present;
          use State or composed machines when transition rules justify it.

A long-running process must be resumable and its position queryable
        → a persistent state machine (a workflow), which is this
          pattern with durability added.
```

## When it is not

- **A binary property with no transition-specific behavior or history.** A well-named boolean may
  be clearer. Two states can still deserve explicit types when transitions, data or vocabulary
  matter.
- **There is no lifecycle or transition behavior at all.** Consider Strategy or plain type dispatch;
  this does not exclude terminal states within a real lifecycle.
- **The status is derived, not stored.** If `isOverdue` is a function of a date and the clock, it
  is a query, not a state; storing it creates a second source of truth that goes stale.
- **Only caller policy varies.** Separate authorization/policy from lifecycle mechanics, but apply
  its guards at the authoritative transition boundary; State and policy can coexist.

## Modern Java expression

```text
Classical                            Modern
───────────────────────────────────  ───────────────────────────────────
abstract class State with one        sealed interface OrderState
method per event, subclass per         permits Draft, Paid, Shipped, ...
state
                                     records when a state carries data
                                       (Shipped(TrackingId, Instant))
                                     enum constants when it carries none

each state knows its successors      one transition function:
                                       OrderState next(OrderState, Event)
                                     with an exhaustive switch — the whole
                                     machine readable at once

illegal transition → no-op or a      an explicit exception naming the
silent ignore                        state and the event

state stored as an ordinal           stored as a stable code, with an explicit
                                     mapping and a rejected-unknown case
```

Prefer the transition function while you own every state. Keep behaviour on the state objects when
each state has substantial behaviour of its own beyond transitioning — otherwise the `switch`
grows into a god method (`java-composition-over-inheritance`).

## Decision rules

```text
IF a transition is invalid
THEN define rejection explicitly. Repeated commands may intentionally be idempotent
     no-ops returning the existing outcome; distinguish that from silently swallowing
     a genuinely illegal event.

IF a new state is added
THEN recompile dispatch over the closed state set without a catch-all to expose omissions.
     Rejected unknown events may use a default, but event coverage then needs explicit tests.

IF the state is persisted
THEN use an explicit stable storage code, not enum ordinal and not an enum name you
     expect to rename freely. Define unknown-value behavior for rolling upgrades;
     reject, quarantine, or preserve—not accidental coercion.

IF two requests can transition the same entity
THEN check-then-act is a race. Use a conditional update (compare the
     current state in the WHERE clause), optimistic locking with a
     version, or a CAS on an immutable state reference
     (offline-concurrency-control).

IF a transition has side effects
THEN coordinate them with the state change: one local transaction where possible,
     or transactional outbox plus idempotent consumer/deduplication. Do not claim
     exactly-once across an uncoordinated external boundary.

IF time causes a transition (expiry, timeout, escalation)
THEN it is an event like any other and needs something to deliver it.
     Durable due-time records and catch-up semantics must survive scheduler outages;
     an in-memory timer alone loses progress (distributed-locks-and-leases).

IF the state machine coordinates multiple services with local transactions
THEN evaluate saga semantics when compensation is appropriate; not every distributed
     state machine is a saga. Define recovery, durability and irreversible steps
     (distributed-transactions-and-sagas).

IF states hold references to each other
THEN adding a state edits several classes. Prefer a transition function
     or a table.
```

## Cross-cutting checks

- **Concurrency.** A transition is read-decide-write and is not atomic. Two concurrent
  `cancel()` and `ship()` calls can both read `Paid` and both succeed. Options include
  an immutable state behind one reference updated with compare-and-set; a database
  update whose `WHERE` includes the expected state, checking the affected row count; or optimistic
  locking on a version column. Which one depends on where the state lives — but "the transition
  method is `synchronized`" only helps if every path to the state goes through one instance in one
  process (`java-memory-model`).
- **Distribution.** A durable state machine is the honest form of most business workflows: the
  state is a row, transitions are transactional, and the process can restart mid-flow. What
  changes from the in-memory version is that every transition may be retried (so it must be
  idempotent), timeouts must be real scheduled events rather than in-memory timers, and a state
  can be observed by another service — which makes the state names a published vocabulary
  (`distributed-transactions-and-sagas`).
- **Performance.** Enum constants are shared but dispatch/storage still has cost. Record states
  are allocation candidates per transition and buy per-state data; measure only on hot paths.
  Persistence indexes depend on query shape, selectivity, update rate and partial-index support—a
  frequently polled due-state query often needs a composite/partial index, not every state column.
- **Testing.** The transition table is the specification, so test it as one: a parameterised test
  over every `(state, event)` pair asserting either the resulting state or the rejection. That
  coverage must include guarded payloads and assert the case inventory grows with states/events.
  It complements scenario, persistence, concurrency and effect tests; a hand-written list does not
  automatically detect missing pairs. Add bounded sequence tests for domain invariants.

## Review checklist

- [ ] States and independent dimensions are explicit; closure or extension policy is justified
- [ ] Transition rules have an authoritative home; closed-state dispatch exposes missing cases
- [ ] Invalid transitions have explicit rejection/idempotent-repeat semantics
- [ ] Persisted states use stable codes and define unknown-value behavior during upgrades
- [ ] Transitions are atomic under concurrency by a named mechanism
- [ ] Side effects use a local transaction or durable outbox/idempotent delivery protocol
- [ ] Time-driven transitions have a real delivery mechanism
- [ ] Every `(state, event)` pair is covered by a test
- [ ] State/event evolution triggers compiler coverage or an explicit case-inventory check

Deliver the transition/guard and repeat policy, persisted representation, concurrency/effect
protocol, and executed checks or identified gaps. Keep the decision proportional to the machine.

## References

- [Modelling transitions](references/modelling-transitions.md) — where transitions should live and
  what each placement costs; sealed records against enums; persistence, ordinals and evolving the
  state set; atomicity mechanisms compared; timeouts as events; and the State/Strategy
  discrimination in detail. Read before designing a machine.
- [Worked example](references/worked-example.md) — an order lifecycle taken from four boolean flags
  to a sealed state with one transition function: the illegal combinations that existed, the
  conditional update that fixed a double-ship race, persistence and migration, and the
  table-driven test. Read when implementing.
