# Designing for no ordering requirement

Ordering is a property the **handler** demands, not one the domain has. The question is narrow:
_if these two records arrive swapped, is the final state different?_ If not there is no
requirement, and the key constraint, the parallelism ceiling and the one-way door all lift.

## 1 — The version guard

The default answer. The record carries a version that is monotonic per key and comes from the
**source of truth** (the row's version column, the aggregate's sequence number), not from
publish time. The handler applies a record only if it is newer, in one statement:

```sql
UPDATE customer
   SET name = :name, email = :email, version = :version
 WHERE id = :id AND version < :version
```

- An update count of **0 is success**, not a failure: a newer version is already stored, so log
  at debug and acknowledge. Treating it as an error sends good records to a DLQ.
- The comparison must be in the same statement as the write. Read-then-compare-then-write
  reintroduces the race between concurrent consumers that the guard exists to remove.
- This is not JPA's `@Version` optimistic locking, which _rejects the stale writer_ so it can
  retry. Here the stale record is discarded on purpose and never retried.
- The version must be monotonic per key at the producer. A broker offset is not (it moves on a
  partition change) and a publish timestamp is not (see below).

## 2 — Commutative handlers

Operations whose composition does not depend on order:

- Assigning fields from a **full snapshot** carried in the record. This is why an event should
  carry the resulting state rather than a delta (`event-driven-architecture`); a delta forces
  ordering, a snapshot does not.
- Upsert keyed by a natural id; insert into a set; any idempotent assignment.
- A counter incremented once per record id, with the id stored as a dedup key — addition
  commutes but is not repeat-safe, so this needs `effectively-once` application: at-least-once
  delivery plus deduplication at the store (`delivery-semantics`, `idempotency`).

Not commutative, and often mistaken for it: "increase by 10%" composed with "add 5"; a partial
update that also overwrites fields it did not mean to touch; a delete followed by a create.

## 3 — Last-write-wins, and what it costs

LWW picks a winner and **discards the loser silently**. Three caveats, all of which have to be
accepted explicitly:

- **With wall-clock timestamps, clock skew chooses the winner.** One host minutes ahead wins
  every conflict until someone notices. Prefer a version from the source of truth; use a
  timestamp only where the producers share a trusted clock source and the loss is tolerable.
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

Terminal states absorbing late records are what stop a reordered create from resurrecting a
deleted entity. **Distinguish stale from early** — they need opposite responses:

| Situation                                  | Test                            | Response                                                |
| ------------------------------------------ | ------------------------------- | ------------------------------------------------------- |
| Stale — its effect is already applied      | `version <= current`            | Drop and acknowledge                                    |
| Early — its predecessor has not arrived    | `version > current + 1`, or gap | Park briefly and re-check, or resync from the authority |
| Illegal — no such transition exists at all | Not in `LEGAL`                  | Park and alert; this is a bug or a corrupt producer     |

Rejecting an _early_ record as if it were stale loses it permanently, which is the usual way
this technique is implemented wrongly.

## Choosing between them

| Technique           | Requires                                                  | Gives up                                           |
| ------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Version guard       | A monotonic per-key version from the authority            | Intermediate states — only the newest is observed  |
| Commutative handler | Snapshots or idempotent assignments in the payload        | Payload size; deltas are no longer expressible     |
| LWW                 | A comparable version or a trusted clock, plus a tie-break | Concurrent updates, silently                       |
| State machine       | A closed status set and a transition table                | Freedom to add states without revisiting the table |

All four remove the ordering requirement, so the key can be chosen for load distribution
instead (`sharding-and-partitioning`) and the consumer can scale past one thread per partition.

## Proving that handlers are order-insensitive

```java
@RepeatedTest(50)
void final_state_is_independent_of_delivery_order() {
    long seed = System.nanoTime();
    List<Event> delivery = new ArrayList<>(RECORDS);
    delivery.addAll(RECORDS.subList(0, 2));          // at-least-once: duplicates too
    Collections.shuffle(delivery, new Random(seed));

    var handler = newHandler();
    delivery.forEach(handler::apply);

    assertEquals(EXPECTED_STATE, handler.state(), () -> "seed=" + seed);
}
```

- **Print the seed in the failure message.** A shuffle test that cannot be replayed reports a
  flake instead of a bug.
- **Include duplicates in the shuffle.** At-least-once delivery produces reordering and
  repetition together, so the test should too — it then proves both properties at once.
- **Assert the final state, never the sequence of calls.** A test that asserts call order has
  re-introduced the requirement it was written to remove.
- With few enough records, enumerate every permutation instead of shuffling; beyond a handful a
  property-based generator over permutations is the same test with better coverage.
