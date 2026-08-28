# Granularity, Implicit Locks and Failure Modes

## Choosing what to lock together

Granularity is decided by the invariant, not by the table structure.

```text
Order (root, @Version)
 ├── OrderLine   ── quantity affects order total, which is checked against credit limit
 ├── OrderLine
 └── ShippingAddress ── independent of the total

Fine-grained (version per row):
    A edits line 1, B edits line 2 → both succeed → total is now derived from a
    combination neither editor saw. Credit limit check passes at every step and
    the final state violates it.

Coarse-grained (one version on Order):
    A edits line 1, B edits line 2 → one succeeds, one is told to reload.
    The invariant is safe. Throughput on hot orders is halved.
```

The coarse-grained lock is the correct default wherever an invariant spans the parts. The
cost — writers to one aggregate serialise — is the invariant's price, and if it is
intolerable the honest fix is a smaller aggregate, not a weaker lock
(`domain-logic-organization`).

The shipping address is the interesting case: it participates in no invariant with the
lines. Splitting it into its own aggregate is legitimate if independent editing matters.
That is an aggregate design decision, made deliberately, not an exception carved into the
locking mechanism.

### Bumping the root's version from a child change

With JPA, modifying a child does not by itself increment the root's `@Version`. Two ways to
get coarse-grained behaviour:

```java
// 1. Declarative, on the association: forces the root's version on any child change.
@OneToMany(mappedBy = "order", cascade = ALL, orphanRemoval = true)
@OptimisticLock(excluded = false)          // Hibernate default for owned collections
private List<OrderLine> lines = new ArrayList<>();

// 2. Explicit, and clearer at the call site.
em.lock(order, LockModeType.OPTIMISTIC_FORCE_INCREMENT);
```

Whichever is chosen, assert it: a test that edits a child through the root and asserts the
root's version changed. This is precisely the behaviour that a mapping change silently
alters two years later.

## Contention, and the lock ordering that avoids deadlock

Coarse-grained locks make one row hot. Two failure shapes follow:

- **A hotspot aggregate** — a `Warehouse` root guarding every stock movement serialises the
  entire warehouse. The aggregate is wrong: stock levels per SKU are usually independent
  invariants and belong in separate aggregates with the cross-SKU rule handled
  asynchronously.
- **Deadlock across aggregates** — a transfer that locks account A then B, while another
  locks B then A. Fix by ordering acquisitions on a stable key in every path:

```java
var ordered = Stream.of(sourceId, targetId).sorted().toList();   // always ascending
var first  = accounts.lockById(ordered.get(0));
var second = accounts.lockById(ordered.get(1));
```

This is one of the few places where a comment explaining _why_ the sort exists is worth
writing, because it looks removable (`enterprise-transactions`).

## Implicit locking

The point of implicit locking is that the mechanism cannot be forgotten. A new repository
method, a new import job, a new admin screen — none of them can omit the version check
because none of them applies it.

```java
@MappedSuperclass
public abstract class VersionedAggregate {
    @Version private long version;
    public long version() { return version; }
}
```

Plus an architecture test making the omission impossible to introduce quietly:

```java
@ArchTest
static final ArchRule aggregates_are_versioned =
    classes().that().areAnnotatedWith(Entity.class)
        .and().areAssignableTo(AggregateRoot.class)
        .should().beAssignableTo(VersionedAggregate.class);
```

### The price: invisibility

An implicit mechanism fires from code the reader is not looking at. Pay it back:

- **Log the conflict with both versions and the entity id** at the point of failure, not
  just the framework's message.
- **Name the exception in the API contract** — a documented `409` with a stable code beats a
  generic error (`remote-facade-and-dto`).
- **Meter conflicts.** A conflict counter per aggregate type is the earliest available
  signal that an aggregate is too coarse or a job is fighting users. Without it, the first
  evidence is a support ticket.

## How locking gets silently defeated

| Mechanism                                         | What happens                                                                                                           | Detection                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Bulk `UPDATE`/JPQL update                         | Rows change without the version being read or incremented; every concurrent optimistic lock is defeated for those rows | Review every bulk statement for `version = version + 1`; test it        |
| Native SQL in a repository                        | Same, plus the persistence context now holds stale entities                                                            | Grep for `@Query(nativeQuery = true)` on versioned tables               |
| Second-level cache with a stale entry             | The version compared is the cached one                                                                                 | Cache configuration review; conflicts that "should" fire and do not     |
| Detached entity merged without the client version | Version comes from the re-read, not the editor's snapshot                                                              | The `merge` path with no version in the request payload                 |
| `saveAndFlush` in a loop after a failure          | Retry uses re-read state; see the unsafe retry in the sibling reference                                                | Any `@Retryable` on a method taking a full-state request object         |
| Trigger or stored procedure writing the table     | Version untouched; the ORM's next write appears valid                                                                  | Schema audit; this is the hardest to find and the most common in legacy |
| Read-then-write across two transactions in a job  | The job is itself an offline editor and needs the same discipline                                                      | Batch code that loads, computes for a while, then saves                 |

The first row is the most frequent by a wide margin, and it is usually introduced as a
performance fix for exactly the reason bulk updates exist (`domain-logic-organization`
covers when set-based work is right — it is, often; it just has to increment the version).

## When no offline lock is the right answer

- **Insert-only or append-only data.** There is nothing to overwrite.
- **Last-write-wins is the business rule.** A "current status from device telemetry" field
  genuinely wants the latest value; adding a version there produces conflicts that have no
  meaningful resolution.
- **The operation is a delta, not a state assignment.** `UPDATE balance SET n = n + :amount`
  is correct under concurrency without any version.
- **Conflicts are resolvable by construction** — CRDT-like structures, or per-user rows
  that no one else writes.

State which of these applies when you decide not to version something. "No version column"
should be a decision in the record, not an omission (`architecture-decision-making`).
