---
name: gof-observer
description: >
  Observer in modern Java, treated as high-risk: notifying an unknown set of dependents that
  something changed, and the guarantees it does not provide. Covers the properties people assume
  and the contract does not give — synchrony on the publisher thread, unspecified ordering, one
  exception breaking the rest, no delivery guarantee — the listener leak from a long-lived
  subject, reentrant registration during notification, never notifying while holding a lock, and
  the differences between an in-process observer, a reactive stream, and distributed pub/sub. Use
  when a listener mechanism is added, when a listener leak appears, when an in-process listener is
  moved to a message broker, when order between listeners matters, or when a failing listener
  silently loses work. Does not cover Spring's event
  phases and the outbox (event-driven-architecture), broker delivery semantics
  (delivery-semantics), reactive backpressure (reactive-backpressure), or hub-based coordination
  (gof-mediator).
---

# Observer

## Purpose

Let a subject tell an unknown set of dependents that something happened, without depending on
them. It is the most reached-for decoupling mechanism in object design and the one whose contract
is most often over-read.

What the classical pattern actually promises: registered observers are called. That is all. It
does not promise an order, does not promise isolation between observers, does not promise delivery
if the process dies, and does not promise anything about which thread runs them.

## What people assume, and what holds

```text
Assumed                              Actually
───────────────────────────────────  ───────────────────────────────────
"Asynchronous"                       Synchronous, on the notifying thread,
                                     inside the caller's transaction

"They run in registration order"     Unspecified. Ordering must be
                                     imposed explicitly if it matters

"A failing listener is isolated"     The exception propagates and the
                                     remaining listeners never run

"The event will be delivered"        In-process only, and lost on crash

"Adding a listener is free"          The subject now holds it alive, and
                                     notification cost is linear

"The subject is decoupled"           From the listeners' types, yes. From
                                     their latency and failures, no
```

Every one of these is fixable, and each fix is a decision to make deliberately rather than
inherit.

## Observer, reactive stream, pub/sub

| Property              | In-process Observer     | Reactive Stream              | Distributed pub/sub                |
| --------------------- | ----------------------- | ---------------------------- | ---------------------------------- |
| Thread                | The publisher's         | Wherever scheduled           | The consumer's, another process    |
| Backpressure          | None — publisher blocks | `request(n)`, explicit       | Broker buffering, consumer lag     |
| Delivery              | Best effort, in memory  | In memory, with cancellation | At-least-once, durable             |
| Ordering              | Unspecified             | Per subscription             | Per partition only                 |
| Failure of a consumer | Breaks the publisher    | Terminates that subscription | Independent; retry and dead-letter |
| Transaction           | The publisher's         | None                         | Separate; needs an outbox          |
| Schema                | A Java type             | A Java type                  | A versioned contract               |

These are not interchangeable implementations of one idea. Moving a listener from the first column
to the third changes transactional semantics, ordering, error handling, latency and idempotency
requirements — it is a redesign, not a refactor (`event-driven-architecture`, `delivery-semantics`).

## When it is the answer

```text
A subject must notify dependents it does not know about, in-process
        → Observer, with ordering, error and lifecycle policies stated.

Modules within one application must react to a domain change without
the originator knowing them
        → application events, published after the transaction commits.

A consumer must control the rate of a stream it cannot outrun
        → a reactive stream; Observer has no backpressure and the
          publisher simply blocks (reactive-backpressure).

Another service must react
        → messaging with an outbox. Not this pattern.
```

## When it is not

- **There is one listener and it is known.** Call it. An event with a single subscriber is
  indirection that hides the call graph.
- **The publisher needs the outcome.** Observers return nothing; a publisher that inspects results
  is issuing commands, not events (`gof-command`).
- **Order between listeners is essential.** Then the flow is a sequence and should be written as
  one; imposing order on listeners re-couples them without making the sequence readable.
- **The listener must not fail silently.** In-process events give no retry, no dead-letter and no
  record. Work that must not be lost belongs on a durable queue.

## Decision rules

```text
IF a long-lived subject holds listeners
THEN every registration needs a deregistration with a defined owner.
     This is the classic Java memory leak, and lambdas make it worse:
     the listener has no other referent, so nothing else keeps it alive
     and nothing else can find it to remove it.

IF listeners may register or deregister during notification
THEN iterate a snapshot (CopyOnWriteArrayList, or a copy) or you will
     get ConcurrentModificationException — or worse, a skipped listener.

IF a listener throws
THEN decide: fail the publisher (fine when the listener is essential),
     or isolate and record (fine when it is not). Silently swallowing
     is the failure that gets discovered by a customer.

IF the subject notifies while holding a lock
THEN a listener that acquires another lock, or calls back into the
     subject, can deadlock. Notify outside the critical section, always.

IF the listener does I/O
THEN the publisher's latency now includes it. Either accept that
     explicitly or hand the work to an executor — and then handle the
     failure that no longer propagates.

IF the event is published inside a transaction and the listener writes
THEN ordering with the commit matters: before-commit sees uncommitted
     data, after-commit runs in a new transaction or none at all
     (event-driven-architecture).

IF the listener is in another process
THEN the event must be durable, versioned and idempotently consumed.
     An in-memory publish plus a broker send is a dual write
     (event-driven-architecture).

IF ordering between listeners matters
THEN state it explicitly and test it, or remove the dependency.
```

## Cross-cutting checks

- **Concurrency.** Three recurring failures. Mutation of the listener list during notification —
  use `CopyOnWriteArrayList`, which is exactly the right structure here (many notifications, rare
  registrations). Notification under a lock, which turns any listener's own locking into a
  deadlock risk. And reentrancy: a listener that triggers another notification on the same subject
  produces nested notification with the subject mid-update (`java-memory-model`).
- **Distribution.** Observer stops at the process boundary. Crossing it introduces at-least-once
  delivery (so consumers must be idempotent), partition-scoped ordering only, consumer failures
  that are now invisible to the publisher, and an event schema that other teams depend on. The
  transactional bridge is an outbox: publish by writing to the same database transaction, and let
  a relay forward it — anything else is a dual write that loses events or invents them
  (`idempotency`, `message-ordering-and-partitioning`).
- **Performance.** Notification is linear in listeners and synchronous, so the publisher's latency
  is the sum of every listener's. A hot subject with many listeners is a fan-out on the request
  path. Also watch allocation: an event object per notification is normally fine, and is not fine
  in a per-element loop over a large collection (`allocation-profiling`).
- **Testing.** Test the publisher by asserting the event it published, and each listener
  independently against a constructed event — this is the pattern's main testing dividend. Then add
  the two tests nobody writes: that a throwing listener behaves as the chosen policy says, and that
  deregistration actually removes the listener (a leak test that registers, drops the reference,
  and asserts the subject no longer notifies).

## Review checklist

- [ ] Every registration has a deregistration with a named owner
- [ ] The listener collection is safe to iterate while listeners are added or removed
- [ ] Nothing is notified while a lock is held
- [ ] The policy for a throwing listener is explicit and tested
- [ ] Listener ordering is either irrelevant or imposed and tested
- [ ] Listeners doing I/O are accounted for in the publisher's latency budget
- [ ] Events crossing a transaction boundary have a defined phase
- [ ] Events crossing a process boundary go through an outbox and are consumed idempotently
- [ ] An event with exactly one known listener is a direct call instead

## References

- [Observer variants and lifecycle](references/observer-variants.md) — in-process, reactive and
  distributed compared in full; the listener leak with weak-reference pitfalls; ordering, error
  and reentrancy policies with code; notification outside locks; and Spring's event phases with
  what each guarantees. Read when designing a notification mechanism.
- [Worked example](references/worked-example.md) — an in-process domain listener migrated to a
  broker: what the outbox changed, why the consumer needed an idempotency key, the ordering
  assumption that broke, and the tests that caught each. Read when implementing or migrating.
