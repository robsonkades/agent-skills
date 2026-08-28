---
name: event-sourcing
description: >
  Storing a sequence of immutable events as the source of truth and deriving current state
  from it: deciding whether the system needs it, designing events and streams, concurrency
  through expected stream version, building and rebuilding projections, and the problems that
  have no clean answer — event schema change, personal-data erasure, and read-your-own-write.
  Use when event sourcing is proposed or already in place, when auditability is the stated
  driver, when a projection has drifted from its stream, when an event needs a field it never
  had, or when a user reports data that "disappeared" after saving. Does not cover event-driven integration
  between services (event-driven-architecture), broker delivery guarantees
  (delivery-semantics), cross-service workflow compensation
  (distributed-transactions-and-sagas), optimistic locking over a mutable row
  (offline-concurrency-control), or what a client may observe across replicas
  (consistency-models).
---

# Event Sourcing

## Purpose

Decide, and then correctly operate, a system whose durable truth is an append-only sequence of
facts rather than a mutable row. State is a fold over that sequence; the row you used to
update becomes a derived view you can throw away and rebuild.

This buys things nothing else buys as cleanly: a complete and non-negotiable history, the
ability to ask what the state was at any past moment, and the freedom to build new views of
old facts. It costs a permanent obligation — **events are immutable and forever, but
requirements are not** — and that obligation is the reason most systems that adopt it should
not have.

The two failures this exists to prevent: adopting event sourcing for auditability, which an
audit table delivers at a hundredth of the cost; and adopting it without designing for schema
change, projection rebuilds and erasure, which are the three problems that arrive at year two
and have no clean solution retrofitted.

## Workflow

1. **State the driver, and check it against the cheaper alternative.** Audit? A history
   table. Debugging? Structured logs. Temporal queries? Bitemporal columns. Only when the
   business genuinely reasons in events — ledgers, trading, workflow, anything where the
   sequence _is_ the domain — does the cost become proportionate.
2. **Fix the stream boundary.** A stream is the consistency and concurrency unit, and it should
   be one aggregate. Getting this wrong is not tunable later.
3. **Design events as facts, in past tense, in the business's language.** `FundsWithdrawn`,
   not `BalanceUpdated`. An event named after a data change is a row update wearing a hat.
4. **Decide concurrency before writing code.** Appends carry an expected version; a mismatch
   is a conflict the caller must resolve. This is optimistic locking with a different name
   (`offline-concurrency-control`).
5. **Design the read models first, not last.** Nothing queries the event store; every screen
   is a projection, and projections are eventually consistent by construction.
6. **Write the rebuild before you need it.** A projection you cannot rebuild is a database you
   cannot migrate. Time it against production volume now, not during the incident.
7. **Answer the three hard questions up front** — event versioning, personal-data erasure, and
   what the user sees immediately after they save. Each is cheap now and expensive later.

## What changes when the log is the truth

```text
   Command ──► Aggregate ──► Event(s) ──► append to stream
                   ▲                            │  (expected version)
                   │                            │
             fold over the                      ▼
             stream to rebuild            ┌─────────────┐
             current state                │ EVENT STORE │  ← the only truth
                                          └──────┬──────┘
                                                 │  subscribe
                                    ┌────────────┼────────────┐
                                    ▼            ▼            ▼
                              projection    projection   projection
                              (SQL view)    (search)     (report)
                                    │            │            │
                                    └──── all EVENTUALLY consistent ────┘
                                         and all REBUILDABLE
```

Three consequences follow, and they are the whole of the trade:

- **You cannot change the past.** A wrong event is corrected with a compensating event, never
  with an `UPDATE`. This is a feature for a ledger and an obstacle for a typo.
- **Every query goes through a projection**, so every query is a little stale, and every new
  query is a new projection built from history.
- **The write model and the read model diverge on purpose.** That divergence is what makes
  both simple; it is also the divergence a team must be willing to operate.

## Decision rules

```text
The driver is "we need an audit trail"
        → do not event source. An append-only history table, or the
          database's temporal tables, gives auditability without making
          every query a projection.

The driver is "we might want to analyse this later"
        → do not event source. Emit events to a log or warehouse
          alongside a normal database (event-driven-architecture).

The business itself reasons in immutable facts — ledger entries,
trades, claim events, workflow transitions — and the sequence carries
meaning current state cannot express
        → the strongest case. Adopt it for those aggregates.

Requirements demand "what did it look like on date X" as a first-class
query, not a report
        → a real case, but compare against bitemporal tables first;
          they are far cheaper if the need is only historical read.

The domain is CRUD, and the state is the truth the business cares about
        → do not event source. You are buying a rebuild pipeline and a
          versioning problem to store a form (domain-logic-organization).

Event sourcing is proposed for the WHOLE system
        → almost certainly wrong. Apply it per aggregate. Most systems
          have one or two aggregates that deserve it and many that do not.

Personal data must be erasable on request
        → resolve before adopting. An immutable log and a legal erasure
          obligation conflict; crypto-shredding is the usual answer and
          must be designed in from the first event.

The stream for one aggregate will grow without bound (a device feed,
a long-lived account)
        → either snapshot, or the stream boundary is wrong. Unbounded
          streams make every load slower forever.
```

## Rules

- **Events are facts that already happened**, named in the past tense, in the business's
  vocabulary, and never rejected on replay. An event that a rule can invalidate later is not a
  fact — validation belongs before the append, in the aggregate.
- The aggregate decides; the event records. Load the stream, fold it into state, validate the
  command against that state, emit events. This is a functional core with an append at the end
  (`humble-objects-and-functional-core`).
- **The append is the transaction boundary.** All events from one command are appended
  atomically at an expected version, or none are. A conflicting version means someone else
  wrote first — surface it as a conflict, do not blind-retry a command whose decision was made
  against stale state (`enterprise-transactions`).
- **Carry a command id and record it in the event's metadata.** The version check catches a
  concurrent writer; it cannot catch a retry after an _unknown_ outcome, which re-decides and
  appends a second legitimately-versioned copy of the same command. Expected version is
  concurrency control, not idempotency (`idempotency`).
- **Never mutate or delete an event.** Correct with a compensating event. The moment a system
  edits history, every projection rebuild becomes non-deterministic and the audit property —
  the reason for the whole exercise — is gone.
- Projections are derived and disposable, and must claim each event with an **atomic
  conditional advance of their position**, not a read-then-skip. Two workers reading the same
  watermark both apply a non-idempotent fold; this is the check-then-act that `idempotency`
  forbids (`delivery-semantics`).
- **Rebuild time is a capacity metric.** Measure it as history grows, and know the number
  before an incident forces a rebuild. When it exceeds the acceptable window the answers are
  snapshots, a parallel rebuild with a cut-over, or a carry-forward event that bounds the
  stream — never simply truncating history, which makes the snapshot the source of truth.
- Snapshots are an optimisation, never a source of truth: deleting every snapshot must still
  produce correct state.
- **Read-your-own-writes is the user-visible cost**, and it is decided per screen rather than
  per system. The mitigations differ in what they cost and what they can actually deliver
  (`references/projections-and-evolution.md`, `consistency-models`).
- **Event schema evolution has no free option.** Additive fields with defaults are the only
  cheap change. Anything else is upcasting on read, a new event type alongside the old, or a
  rewritten stream — all forever, because the old events are still there.
- **Publish to other services from a catch-up subscription over the store, never from the
  command handler.** An append followed by a broker publish in the same method is a dual write
  and loses the message on any crash between them. The log is already the outbox — one of the
  few operational advantages event sourcing buys (`distributed-transactions-and-sagas`).
- **Internal events are not integration events.** Publishing an aggregate's internal events to
  other services couples them to your write model's evolution. Translate at the boundary
  (`event-driven-architecture`, `rpc-and-api-contracts`).

## References

- [Deciding and designing](references/deciding-and-designing.md) — the honest comparison
  against audit tables, temporal tables and change-data-capture; choosing stream boundaries and
  bounding unbounded ones; designing event payloads; the expected-version concurrency model
  worked through in Java, including the unknown-outcome case that duplicates a command;
  choosing the store and the payload format; snapshots. Read when deciding whether to adopt, or
  designing the write side.
- [Projections, evolution and erasure](references/projections-and-evolution.md) — the atomic
  position advance and why a read-then-skip corrupts a fold, gapless-feed assumptions, rebuild
  and cut-over strategies, the five read-your-own-write mitigations with what each actually
  delivers, event versioning through upcasting and copy-and-replace, and what crypto-shredding
  does and does not erase. Read when building the read side or facing an event that must
  change.
