# Designing for no ordering requirement

Ordering can be required by a domain invariant, an externally visible history, or an
implementation. Ask separately: if records swap, is final state different; is an invalid
intermediate state/effect visible; and must every transition occur? Equal final state alone is
insufficient for payments, notifications or audits.

## 1 — The version guard

For a projection that may skip intermediate states, the record carries a version monotonic per key from the
**source of truth** (the row's version column, the aggregate's sequence number), not from
publish time. The handler applies a record only if it is newer, in one statement:

This replacement assumes a complete authoritative snapshot of the affected state. Applying
delta v3 before v2 and discarding v2 can lose an essential change; deltas needing predecessors
require ordered application/gap repair. Define initial insertion, non-null version, delete
tombstones and equal-version conflict handling separately.

```sql
UPDATE customer
   SET name = :name, email = :email, version = :version
 WHERE id = :id AND version < :version
```

- An update count of 0 is not automatically success: distinguish stale/duplicate from missing
  target or equal-version conflict by reading authoritative state or using a richer conditional
  statement/result. A stale snapshot may be acknowledged; a missing target needs the defined
  insertion/recovery path.
- This newer-than predicate accepts jumps, such as v3 replacing v1; it does not detect a missing
  v2. That is intentional for complete snapshots with skippable intermediate effects. It is
  not a substitute for a contiguous-sequence guard when every transition must be applied.
- The comparison must be in the same statement as the write. Read-then-compare-then-write
  reintroduces the race between concurrent consumers that the guard exists to remove.
- This is not JPA's `@Version` optimistic locking, which _rejects the stale writer_ so it can
  retry. Here the stale record is discarded on purpose and never retried.
- The version must be monotonic per key at the producer. A broker offset is not (it moves on a
  partition change) and a publish timestamp is not (see below).

## 2 — Commutative handlers

Operations whose composition does not depend on order include:

- Taking the set union of uniquely identified facts, `max` of comparable monotonic watermarks,
  or a CRDT merge with its algebra and metadata intact.
- Applying a **full snapshot with a version guard**. Assignment alone is idempotent but not
  commutative: an old snapshot applied last overwrites a new one.
- An upsert only when conflicting values have a commutative deterministic merge. A plain upsert
  with different values is last-arrival-wins, not commutative.
- A counter incremented once per record id, with the id stored as a dedup key — addition
  commutes but is not repeat-safe, so this needs `effectively-once` application: at-least-once
  delivery plus deduplication at the store (`delivery-semantics`, `idempotency`).

Not commutative, and often mistaken for it: "increase by 10%" composed with "add 5"; a partial
update that also overwrites fields it did not mean to touch; a delete followed by a create.

## 3 — Last-write-wins, and what it costs

LWW picks a winner and **discards the loser silently**. Three caveats, all of which have to be
accepted explicitly:

- **Wall-clock skew can choose a winner unrelated to domain order.** A clock ahead of its
  peers can dominate conflicts. Prefer a version from the source of truth; timestamp LWW
  requires accepting loss and documenting clock uncertainty, resolution and ties. Clock
  synchronization alone does not order events within overlapping uncertainty intervals.
- **A tie must break deterministically** — compare a stable id when versions or timestamps are
  equal — or two replicas applying the same pair converge on different states.
- **Record-level LWW discards a whole concurrent update**, not only the conflicting field.
  Field-level LWW keeps more but needs a version per field. Where losing an update is
  unacceptable, LWW is the wrong model — keep both versions and resolve, or write through the
  authority in a transaction. What a reader then observes is `consistency-models`.

## 4 — The state-machine guard

Model the entity's status as a closed set with an explicit legal-transition table, and let the
handler reject what cannot apply:

```java
enum Status { NEW, PAID, SHIPPED, CANCELLED }

private static final Map<Status, Set<Status>> LEGAL = Map.of(
    Status.NEW,       EnumSet.of(Status.PAID, Status.CANCELLED),
    Status.PAID,      EnumSet.of(Status.SHIPPED, Status.CANCELLED),
    Status.SHIPPED,   EnumSet.noneOf(Status.class),      // terminal: absorbs late records
    Status.CANCELLED, EnumSet.noneOf(Status.class));
```

The table is illustrative Java 9+ initialization, not a complete transition handler. Enforce
state/version checks atomically with writes. A retained terminal state or versioned tombstone
can reject a late create; physical deletion of both state and watermark loses that protection.
Retain recovery metadata for the replay horizon and define legitimate recreation by epoch.
**Classify sequence position before transition legality.** The table below assumes contiguous
per-key event versions and a checkpoint for a fully applied prefix in the same source epoch.
If versions are merely monotonic or the consumer filters events, obtain predecessor/gap
semantics from the authority; `current + 1` alone cannot distinguish a lost event from an
intentional numeric gap.

| Situation                                | Test                                                                    | Response                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Stale — covered by the applied prefix    | `version < current`; equal version requires matching event/payload      | Acknowledge covered replay; quarantine conflicts                 |
| Early — its predecessor has not arrived  | `version > current + 1`                                                 | Park boundedly; recover predecessors, then reassess              |
| Next — valid transition                  | `version == current + 1` and transition is in `LEGAL` for current state | Apply with atomic state/version guard; honor the effect contract |
| Illegal — invalid after its predecessors | `version == current + 1` but transition is not in `LEGAL`               | Park and investigate the producer or contract mismatch           |

For example, `NEW@1` receiving `SHIPPED@3` before `PAID@2` is an early record, even though
`NEW -> SHIPPED` is absent from `LEGAL`. Recover and apply v2, then reassess v3 against `PAID`.
Receiving `SHIPPED@2` at the same `NEW@1` checkpoint is a different case: no predecessor is
missing under this sequence contract, so the transition itself is invalid. Without trustworthy
sequence evidence, current-state rejection alone cannot prove the producer is corrupt.
Dropping an early record as stale loses it; replacing state from a snapshot also does not
replay missing required effects.

## Choosing between them

| Technique           | Requires                                                   | Gives up                                           |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Version guard       | Complete snapshots plus atomic authoritative version guard | Some intermediate states may be skipped            |
| Commutative handler | Commutative merge plus duplicate-safe application          | Required merge/dedup metadata; domain constraints  |
| LWW                 | A comparable version or a trusted clock, plus a tie-break  | Concurrent updates, silently                       |
| State machine       | A closed status set and a transition table                 | Freedom to add states without revisiting the table |

These techniques relax different requirements. Version guard/LWW can preserve newest final
state while discarding intermediates; ascending deliveries can still expose every intermediate
snapshot. A state machine with sequence evidence detects gaps but may need ordered repair;
only a genuinely commutative, associative and duplicate-safe merge is independent of order for
its declared outcome. Key choice can change only after checking every required effect and
recovery path.

## Challenging an order-insensitivity claim

Use these checks when that claim or a proposed change needs validation. Reuse adequate
existing evidence for an unchanged contract; select histories and effects the claim covers.

```java
@RepeatedTest(50)
void final_state_is_independent_of_delivery_order() {
    long seed = Long.getLong("ordering.test.seed", System.nanoTime());
    List<Event> delivery = new ArrayList<>(RECORDS);
    delivery.addAll(RECORDS.subList(0, 2));          // at-least-once: duplicates too
    Collections.shuffle(delivery, new Random(seed));

    var handler = newHandler();
    delivery.forEach(handler::apply);

    assertEquals(EXPECTED_STATE, handler.state(), () -> "seed=" + seed);
}
```

- **Print and accept the seed.** Replay with `-Dordering.test.seed=<reported seed>` against
  the same fixture and algorithm. This is a partial JUnit Jupiter test requiring domain fixtures.
- **Include duplicates in the shuffle.** At-least-once delivery produces reordering and
  repetition together, so the test should challenge both properties. Finite permutations do
  not prove all event histories or concurrent database schedules.
- Assert final state and every externally relevant invariant/effect. Do not assert incidental
  call order, but do assert required transition/audit/notification semantics.
- With few enough records, enumerate every permutation instead of shuffling; beyond a handful a
  property-based generator over permutations is the same test with better coverage.

For the affected mechanism, include relevant duplicates, gaps, late snapshots, concurrent
equal versions, restore/epoch reset or poison records. Validate a changed persistence guard
against the target transactional constraint when claiming database behavior: an in-memory
model does not prove the SQL predicate is atomic. Report unexecuted checks explicitly.

## Decision matrix

| Need                                       | Suitable mechanism                      | What still fails                                    |
| ------------------------------------------ | --------------------------------------- | --------------------------------------------------- |
| Only newest snapshot matters               | authority version + conditional replace | missing intermediate effects are intentionally lost |
| Every delta exactly once, order irrelevant | unique operation ID + commutative merge | retention expiry or non-atomic dedup+merge          |
| Every transition in sequence               | per-key sequence + gap buffer/replay    | permanent gap blocks progress                       |
| Concurrent offline edits                   | CRDT/domain merge or conflict retention | metadata growth and semantic conflicts              |
| Audit-visible total history                | authoritative sequencer/log             | sequencing availability/throughput ceiling          |

## Primary references

- [Shapiro et al., Conflict-free Replicated Data Types](https://inria.hal.science/inria-00609399/document)
- [RFC 1982: Serial Number Arithmetic](https://www.rfc-editor.org/rfc/rfc1982)
- [RFC 5905: NTP clock offset, delay and dispersion](https://www.rfc-editor.org/rfc/rfc5905.html#section-8) — synchronization has uncertainty; a timestamp comparison is not a domain sequencing protocol.
