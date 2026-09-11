---
name: event-sourcing
description: >
  Event streams as authoritative state: adoption criteria, stream boundaries, expected-version
  appends, command idempotency, snapshots, projection correctness/rebuild, temporal replay,
  schema evolution and erasure. Use when event sourcing is proposed, projections drift, old
  payloads must evolve, or write/read visibility surprises users. Integration messaging,
  delivery, sagas, mutable-row locking and replica consistency remain separate skills.
---

# Event Sourcing

## Purpose

Decide, and then correctly operate, a system whose durable truth is an append-only sequence of
facts rather than a mutable row. State is a fold over that sequence; the row you used to
update becomes a derived view you can throw away and rebuild.

This can preserve a sequenced decision history, reconstruct state under a specified model and
build new views from retained facts. It does **not** automatically make history complete,
tamper-evident, legally immutable or semantically reproducible: missing external inputs,
changed projection code and retention/redaction policies still matter. The durable obligation
is to keep event meaning, replay tooling and governance compatible for the declared horizon.

Compare audit/history storage before adopting event sourcing solely for auditability;
measure actual operating cost rather than assuming a fixed ratio. Design schema
evolution, projection rebuilds and retention/erasure before committing long-lived history.

Inspect the target JDK, event-store/server and client versions, append/subscription contracts,
retention and transaction manager. Java examples use Java 21 standard pattern switches
and are partial domain examples, not client SDK implementations. Do not upgrade a project
to use them. With missing evidence, keep adoption/correctness claims conditional and name
the store-level test needed. Return the driver, alternative, authoritative boundary,
recovery/visibility contract and validation evidence.

Reuse the request, current architecture, append/projection evidence and accepted replay,
visibility and recovery targets before asking questions. Ask only for missing facts that change
the recommendation or next check. During repair, preserve the existing action authority and
recovery deadline; a design review must not delay an already authorized mitigation.

## Workflow

1. **State the driver, and check it against the cheaper alternative.** Audit? A history
   table. Debugging? Structured logs. Temporal queries? Bitemporal columns. When the
   business genuinely reasons in events — ledgers, trading, workflow, anything where the
   sequence _is_ the domain — does the cost become proportionate.
2. **Fix the stream boundary.** It is usually one aggregate's ordering/concurrency unit. Model
   maximum length, contention, invariant scope and migration strategy; changing it later is a
   data migration, not literally impossible.
3. **Design events as facts, in past tense, in the business's language.** `FundsWithdrawn`
   preserves a decision that a generic `BalanceUpdated` may obscure. A balance reconciliation
   can itself be a business fact; preserve its reason and required historical meaning.
4. **Decide concurrency before writing code.** Appends carry an expected version; a mismatch
   is a conflict the caller must resolve. This is optimistic locking with a different name
   (`offline-concurrency-control`).
5. **Design reads and consistency explicitly.** Separate asynchronous projections are common
   and stale by lag; inline projections, direct stream reads or same-transaction read models
   have different semantics. CQRS deployment is optional, not implied by event sourcing.
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
                                    └──── asynchronous example ────────┘
                                         rebuildable from retained facts
```

Three consequences follow, and they are the whole of the trade:

- **Normal business correction appends a new fact.** Exceptional redaction or repair needs
  the controlled migration and retention contract described below.
- **Queries need a state representation.** It may be a direct fold, snapshot or projection;
  only asynchronously maintained projections are necessarily stale.
- **The write model and the read model diverge on purpose.** That divergence is what makes
  both simple; it is also the divergence a team must be willing to operate.

## Decision rules

```text
The driver is "we need an audit trail"
        → compare append-only history and temporal tables against required
          actor, retention and tamper-evidence controls; replay is a separate need.

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
        → justify each aggregate's replay/history need and operating cost.
          Keep ordinary state storage where adequate; all aggregates in a
          bounded system may qualify, but adoption elsewhere is not a reason.

Personal data has erasure or retention obligations
        → resolve with privacy/legal owners before adopting. Minimise data;
          redaction, segregated mutable data or cryptographic deletion each
          has assumptions and derived-copy obligations.

The stream for one aggregate will grow without bound (a device feed,
a long-lived account)
        → use indexed incremental reads and measure replay; snapshot, close
          on a business boundary, or redesign when the SLO requires it.
```

## Rules

- **Events record committed facts.** Validate commands before append; replay must not
  reapply today's command rules to yesterday's accepted decisions. Still reject/quarantine
  corrupt, unknown or structurally invalid history rather than silently inventing state.
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
- Treat committed events as immutable in normal business flow and correct with new facts.
  Exceptional redaction/repair may be legally or operationally required; use a controlled,
  auditable stream-rewrite/version migration and rebuild every dependent projection. Append-
  only storage alone is not tamper evidence.
- For a transactional projection, apply the fold and advance its checkpoint atomically,
  using a conditional advance or another proven ownership/deduplication protocol. A failed
  advance can mean a missing predecessor, not just a duplicate; do not acknowledge it blindly.
  Two workers reading the same
  watermark both apply a non-idempotent fold; this is the check-then-act that `idempotency`
  forbids (`delivery-semantics`).
- **Rebuild time is a capacity metric.** Measure it as history grows, and know the number
  before an incident forces a rebuild. When it exceeds the acceptable window the answers are
  snapshots, a parallel rebuild with a cut-over, or a carry-forward event that bounds the
  stream — never simply truncating history, which makes the snapshot the source of truth.
- In classic event sourcing, snapshots are rebuildable optimization: deleting them must still
  permit correct replay from retained events. If a design compacts/deletes the prefix and makes
  a checkpoint authoritative, name that different retention/audit contract explicitly.
- **Read-your-own-writes is the user-visible cost**, and it is decided per screen rather than
  per system. The mitigations differ in what they cost and what they can actually deliver
  (`references/projections-and-evolution.md`, `consistency-models`).
- **Event schema evolution has no free option.** Format-compatible additive changes are often
  cheapest, but legality depends on format, defaults and compatibility mode. Alternatives are
  upcasting, parallel event types, migration or a bounded legacy reader over the retention
  horizon (`schema-evolution-and-compatibility`).
- **Publish integration events from a durable subscription/CDC or an explicitly atomic append-
  and-publish mechanism.** An ordinary append followed by broker send in the command handler is
  a dual write. Treat the event log as the source for a replayable relay, while translating
  internal events at the boundary (`distributed-transactions-and-sagas`).
- **Internal events are not integration events.** Publishing an aggregate's internal events to
  other services couples them to your write model's evolution. Translate at the boundary
  (`event-driven-architecture`, `rpc-and-api-contracts`).
- Auditability needs more than append-only APIs: authorize appends per stream/tenant, protect
  administrator mutation paths, record actor/causation, define hash/signature or WORM controls
  when tamper evidence is required, and test backup restore plus projection reconciliation.

## References

- [KurrentDB Java client: expected-state and atomic append](https://docs.kurrent.io/clients/java/v1.2/appending-events)
- [Apache Kafka log and retention design](https://kafka.apache.org/41/implementation/log/)
- [GDPR Article 17 — right to erasure](https://eur-lex.europa.eu/eli/reg/2016/679/art_17/oj)

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
