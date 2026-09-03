# Projections, Evolution and Erasure

The write side of event sourcing is the easy half. These are the three problems that decide
whether the system is still pleasant in year three.

## Projections

A projection folds the event stream into a shape a query can use: a SQL table, a search index,
a cache, a report. Its state should be rebuildable from the declared event/snapshot horizon.
External effects triggered while projecting are not disposable: rebuild mode must suppress or
deduplicate them, and irreversible notifications generally belong to a separate integration
consumer rather than the read-model fold.

### Position tracking and idempotency

Every projection records the position it has processed, in the same transaction as the data it
writes. Two details decide whether that is actually correct, and both are routinely got wrong.

**Advance the position with a conditional write, never a read-then-skip.**

```java
@Transactional
public void handle(RecordedEvent recorded) {
    // Claims this event: 0 rows means another worker owns it, or it is a replay.
    if (positions.advance(PROJECTION_NAME, recorded.position(), recorded.previousPosition()) == 0) {
        return;
    }
    switch (recorded.event()) {
        case AccountEvent.FundsDeposited e -> balances.add(e.accountId(), e.amount());
        case AccountEvent.FundsWithdrawn e -> balances.subtract(e.accountId(), e.amount());
        case AccountEvent.AccountOpened e  -> balances.create(e.accountId(), Money.zero());
        case AccountEvent.AccountFrozen e  -> balances.markFrozen(e.accountId());
    }
}
```

```sql
-- positions.advance(...)
UPDATE projection_position SET position = :new
 WHERE name = :name AND position = :expected
```

This works only when position and projected rows commit in the same database transaction (or
one equivalent atomic sink operation). The check and claim are one atomic statement. The
obvious-looking alternative —
`if (recorded.position() <= positions.lastProcessed(name)) return;` followed by a write — is a
check-then-act, and two workers (a rolling deploy overlap, a consumer-group rebalance, a
manual catch-up) both read the same watermark and both apply `balance = balance + amount`.
`@Transactional` does not prevent it under read-committed. This is exactly the shape
`idempotency` forbids.

**A position is only a safe watermark if the feed has no gaps.** Any store that assigns a
position at insert but makes rows visible in commit order — a `bigserial` or `IDENTITY`
column — can commit position 100 before 99. A projection that has recorded 100 will never
see 99, and the balance is permanently wrong in a way that a rebuild silently corrects,
producing two different numbers for the same account. Either use a subscription API that
guarantees gapless in-order delivery, or track the low-water mark of the oldest in-flight
transaction rather than the highest seen. **Establish which one your store gives you before
writing the first projection.**

The remaining rule is unchanged and still load-bearing: **the position and the data are
written in one transaction.** Written separately, a crash between them either loses an event
or double-applies one — the dual-write problem an outbox solves, in a different place
(`distributed-transactions-and-sagas`).

Design for redelivery/replay according to the subscription contract. Reconnects and rebuilds
commonly re-read events; even an exactly-once broker boundary does not automatically include
the projection database (`delivery-semantics`).

### Ordering

A projection that folds a running total requires per-stream order. Event stores normally
provide stream order; a global cross-stream order exists only if the selected store exposes
and preserves one. Depending on it couples the projection to that sequencing contract.

**The position is per ordering domain, never a single scalar.** From a totally-ordered
catch-up subscription it is one number. From a partitioned broker it is one number _per
partition_; a single `lastProcessed` over a partitioned feed silently discards every event
whose offset is below the highest seen on another partition. From a per-stream subscription it
is one per stream.

Where projections are fed through a partitioned broker, partition by the aggregate id so one
stream's events stay ordered, keep a position per partition, and accept that cross-aggregate
order is not guaranteed (`message-ordering-and-partitioning`).

### Rebuilds

A projection you cannot rebuild is a schema you cannot migrate. The rebuild is not an
emergency procedure; it is the normal way a projection changes shape.

```text
1. Create the new projection alongside the old, at position 0.
2. Replay history into it. The old projection keeps serving reads.
3. When the new one catches up to the live position, switch reads over.
4. Delete the old one once the switch is proven.
```

This is a blue/green deployment for derived data, and it is why the pattern's flexibility is
real: a new query shape costs a replay, not a migration script.

“Catches up” needs a race-free protocol: capture a high-water position, consume through it,
continue tailing while routing switches, then atomically publish the active projection version.
Keep the old view until parity/invariants and rollback are proven. Rebuild consumers must not
re-emit emails, integration events or other historical side effects.

**Measure the replay against production volume, and keep measuring.** Rebuild time grows with
history and is the metric that quietly turns event sourcing from an asset into a liability.
When it exceeds the acceptable window:

- parallelise by aggregate id — projections that fold per-aggregate state partition cleanly;
- fold from snapshots where the projection tolerates it;
- move older events to cold storage **only behind a closing/carry-forward event that makes the
  archived prefix unnecessary for correctness**, and only while the archive stays replayable in
  position order;
- reconsider whether that aggregate should have been event-sourced.

The third option is the one to be careful with. Truncating history without a carry-forward
event makes the snapshot the source of truth — contradicting every rule about snapshots being
discardable — breaks the replay-from-zero in step 1, and destroys the audit property that
justified the design. It cannot be undone.

### Read-your-own-writes

The user saves, is redirected, and their change is not there yet. This is the most common
production complaint about event-sourced systems and it is a design decision, not a bug.

| Mitigation                                                               | Cost                                                                                                  | Use when                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Return the new state in the command's response                           | The write handler must now produce the read shape; **does not survive a redirect or a second device** | A screen that can render from the response and never re-reads |
| Read from the write model (replay the stream) for the affected aggregate | A stream read per request                                                                             | Detail screens right after a write                            |
| Block until the projection reaches the written position                  | Latency, a timeout and a fallback; needs a comparable position and a session pin                      | A redirect to a list the user expects to be current           |
| Client-side optimistic update                                            | Client complexity; divergence if the command failed                                                   | Rich clients that already model pending state                 |
| Accept the staleness and show it                                         | Free                                                                                                  | Dashboards, reports, anything already understood as lagging   |

Two traps in that table:

- The first row is not read-your-own-writes — it is one screen not needing a read. The moment
  the flow is POST-redirect-GET, the response is discarded and the problem returns.
- The third row needs the append to return a position **in the coordinate system the projection
  tracks**. The stream version from an append is per stream; a projection's position is global
  or per partition. They are different coordinate systems. Send a session consistency token
  to a reader/coordinator capable of comparing it; sticky routing is only one implementation
  (`consistency-models`).

Choose per screen. Applying one answer everywhere produces either needless latency or a
confusing UI.

## Event evolution

Events are normally immutable for their declared retention/replay horizon; requirements are
not. Every stored shape remains a reader/upcaster/migration obligation until it is verifiably
outside that horizon.

### The changes, from cheapest to worst

**Make a format-compatible additive change.** Optional/defaulted fields are often cheapest,
but behavior depends on JSON binding, Avro writer/reader schemas or Protobuf semantics. Test
archived bytes in every supported compatibility direction. Avoid Java native serialization
for long-lived events because class evolution, security and cross-language constraints are
poor fits (`serialization-performance`, `schema-evolution-and-compatibility`).

**Remove a field.** Stop reading it; leave it in the stored payload. It is part of history.

**Rename or restructure — upcast on read.** A function from the stored shape to the current
one, applied as events are loaded. The write model and projections only ever see the current
shape.

```java
public final class AccountEventUpcaster {
    /** v1 had a single `amount` in cents; v2 carries Money with a currency. */
    public AccountEvent upcast(StoredEvent stored) {
        if (stored.type().equals("FundsWithdrawn") && stored.version() == 1) {
            long cents = stored.payload().get("amountInCents").asLong();
            return new AccountEvent.FundsWithdrawn(
                    stored.payload().get("accountId").asText(),
                    Money.ofCents(cents, "EUR"),        // the assumption is now permanent
                    Instant.parse(stored.payload().get("at").asText()));
        }
        return deserialise(stored);
    }
}
```

Note the comment. Upcasting frequently requires inventing information the old event did not
carry — here, a currency. That invention becomes part of the system's history forever, so it
must be defensible and documented. **This is the real cost of event versioning, and it is not
technical.**

Upcasters accumulate. Keep them in one place per event type, keep them pure, and test them
against real archived payloads rather than freshly serialised ones.

**Split or merge event types — a new type alongside the old.** Write the new type going
forward; keep an old reader/upcaster for the supported horizon, or migrate with an explicit
cutoff. Dual publication needs deduplication and decommission evidence.

**Copy-and-replace the stream.** The last resort: read the old stream, write a new one with
transformed events, switch over, archive or destroy the original according to policy. It is
high-risk because identities, positions, signatures and downstream copies may change. Require
an explicit reason (defect, privacy obligation or bounded migration), mapping/audit record,
downstream rebuild plan, rollback point and retention decision.

### What to do about it in advance

- Give every payload an unambiguous schema identity/version, in the envelope or registry. Do
  not infer shape from deployment date.
- Keep payloads explicit and evolution-friendly. Nesting is acceptable for a stable value
  boundary, but replacing a deep shared structure is harder to upcast.
- Store the raw payload as written. If the store keeps only deserialised objects, upcasting
  has nothing to work from.
- Keep archived payload samples as test fixtures. They are the only real evidence that an
  upcaster works.

## Erasure and personal data

A legal erasure obligation and an immutable log are in direct conflict, and the conflict must
be resolved before the first event is written, not when the first request arrives.

**Cryptographic deletion** is one possible control: personal data is encrypted with a key held
outside the event store, and erasure destroys every usable key copy. Whether this satisfies a
specific legal obligation is a legal/privacy decision. The event remains ordered/countable
while protected fields become computationally inaccessible under the encryption and key-
destruction assumptions.

```text
Event payload:  { accountId: "1234",
                  holderRef: "subject-9f2a",
                  holderData: <ciphertext> }

Key store:      subject-9f2a → AES key      ← delete this to erase
```

What this preserves: stream integrity, replay, projection rebuilds for everything that does
not need the personal fields, and the audit property.

**What it does not do, and this is the part that gets systems into trouble: destroying every
usable key copy may render event ciphertext inaccessible, but it does not erase other copies.**
The live projection may already have persisted
the name and the email in clear text, because that is what it was built to do. So did the
search index, the cache, the snapshots, the logs, and every downstream consumer. Delete the
key, declare compliance, and the personal data is still queryable through the UI.

Cryptographic deletion addresses the event ciphertext only if no usable key copy remains; it
addresses the data subject only if derived stores no longer hold plaintext.
Enumerate every derived copy before adopting it, and make erasure a fan-out across all of
them — projections, snapshots, indexes, caches, logs, downstream services.

The rest of what must be decided up front:

- **Key backups and replicas are inside the erasure boundary.** A key restored from backup
  un-erases the subject. Either set a retention on key backups shorter than the erasure SLA, or
  make key deletion a tombstone that propagates to every replica.
- Key management becomes a durability-critical system. Lose a key by accident and you have
  erased a subject you did not mean to.
- Projections must tolerate unreadable fields on rebuild, after erasure. A rebuild that throws
  on a shredded payload is a rebuild you cannot run.
- Encryption is per subject, so the subject must be identifiable in every event that carries
  their data — a modelling decision made at design time. An event with two subjects (a
  transfer has a payer and a payee; a message has a sender and a recipient) needs per-field
  keys, because erasing one subject must not destroy the other's record.

**The simpler alternative worth considering first:** keep personal data out of events
entirely. Events reference a subject id; the personal data lives in a normal, mutable,
deletable table. Erasure is a `DELETE`, the log keeps its integrity, and no key management
exists. This is adequate far more often than crypto-shredding proposals assume, and it should
be ruled out before the harder mechanism is built.
