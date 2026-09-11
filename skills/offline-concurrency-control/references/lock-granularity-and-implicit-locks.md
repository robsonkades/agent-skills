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
    The invariant is safe if every child write participates in the root check.
    The throughput cost depends on contention, retries and transaction duration.
```

A shared root version/lock is a straightforward way to coordinate an invariant spanning
the parts. Its conflict cost is the price of that protocol; an authoritative constraint,
conditional update or another proven invariant-preserving protocol may allow different
concurrency. Preserve an adequate existing mechanism. If contention warrants a change,
consider narrower coordination or smaller aggregates only where the invariant remains
enforced (`domain-logic-organization`).

The shipping address is the interesting case: it participates in no invariant with the
lines. Splitting it into its own aggregate is legitimate if independent editing matters.
That is a domain design option, not a required response to every false conflict. A narrower
concurrency boundary can also be valid without changing the aggregate's public semantics,
provided its independent-write and invariant assumptions hold.

### Bumping the root's version from a child change

Changing an existing child's scalar field does not by itself increment the root's
`@Version`. Hibernate's `@OptimisticLock(excluded = false)` on a collection does not turn
arbitrary changes inside its elements into root changes; collection membership and child
entity state are different dirty-tracking concerns.

For coarse-grained behavior, one explicit option is this partial JPA snippet inside the
transaction that changes the child:

```java
em.lock(order, LockModeType.OPTIMISTIC_FORCE_INCREMENT);
```

Still compare the editor's original root version. Capture the root version with the state
used to validate the invariant; perform its check/bump and the related writes in the same
transaction so a conflict rolls them all back. Every child write path must participate,
including imports and administrative operations; cascade settings alone do not enforce this.
Only report success after commit. Test existing-child scalar edits separately from additions
and removals, with two transactions competing on the same root.

## Contention, and the lock ordering that avoids deadlock

Coarse-grained locks make one row hot. Two failure shapes follow:

- **A hotspot aggregate** — a `Warehouse` root guarding every stock movement serialises the
  entire warehouse. Investigate whether stock per SKU has independent invariants before splitting it.
  A strict cross-SKU invariant cannot simply be moved to asynchronous reconciliation.
- **Deadlock across aggregates** — a transfer that locks account A then B, while another
  locks B then A. Fix by ordering acquisitions on a stable key in every path:

```java
// Partial Java 17 example; handle sourceId == targetId before acquiring twice.
var ordered = Stream.of(sourceId, targetId).sorted().toList();   // always ascending
var first  = accounts.lockById(ordered.get(0));
var second = accounts.lockById(ordered.get(1));
```

This is one of the few places where a comment explaining _why_ the sort exists is worth
writing, because it looks removable (`enterprise-transactions`).

## Implicit locking

Implicit locking centralizes the normal entity-write path. It reduces omissions but does
not constrain every bulk statement, native query, trigger or external writer.
Keep an adequate explicit conditional-write path; introducing a mapped superclass is useful
only when it improves participation without breaking the existing mapping/API contract.

```java
@MappedSuperclass
public abstract class VersionedAggregate {
    @Version private long version;
    public long version() { return version; }
}
```

This partial architecture rule checks the mapping convention, not the behavior of every write:

```java
@ArchTest
static final ArchRule aggregates_are_versioned =
    classes().that().areAnnotatedWith(Entity.class)
        .and().areAssignableTo(AggregateRoot.class)
        .should().beAssignableTo(VersionedAggregate.class);
```

### The price: invisibility

An implicit mechanism fires from code the reader is not looking at. Pay it back:

- **Log the entity id and versions actually known**, without fabricating a current version
  from an exception that does not contain one.
- **Name the exception in the API contract** — a documented conflict status (412 for failed `If-Match`, otherwise the API's 409 contract) beats a
  generic error (`remote-facade-and-dto`).
- **Meter conflicts.** A conflict counter per aggregate type can reveal contention worth investigating; it does not establish that the aggregate is too coarse.

## How locking gets silently defeated

| Path                                            | Risk and verification                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bulk JPQL or native SQL                         | Automatic entity version checks may be bypassed. Incrementing the version invalidates older editors but does not protect the bulk operation's own stale snapshot: add expected-version predicates and check row counts when that operation depends on previously read state. Refresh or clear affected persistence contexts and handle caches. |
| Stale second-level cache                        | Can cause stale reads or conflicts; it does not defeat a correct database version predicate. Inspect emitted SQL and cache invalidation instead of assuming silent overwrite.                                                                                                                                                                  |
| Reconstructed entity without the client version | Re-reading current state on submission loses the original edit precondition. Verify that the client version reaches the comparison.                                                                                                                                                                                                            |
| Retry after a failed flush                      | Reusing a failed transaction or overwriting with a stale request is unsafe. Test fresh transactions, intent revalidation and bounded attempts.                                                                                                                                                                                                 |
| Trigger, stored procedure or external writer    | A write that leaves the version unchanged can make a pending editor look current. Audit all writers, not just ORM mappings.                                                                                                                                                                                                                    |
| Read-then-write across transactions in a job    | The job is itself an offline editor and needs the same version or ownership discipline.                                                                                                                                                                                                                                                        |

Set-based work remains appropriate where its semantics permit it; version participation and
its own preconditions are separate requirements.

## When no offline lock is the right answer

- **Insert-only or append-only data.** There is no existing row to overwrite, but uniqueness,
  quotas and other cross-record invariants may still need concurrency control.
- **Last-write-wins is the business rule.** A "current status from device telemetry" field
  may accept the last arrival. If "latest" means device event time, define ordering and
  reject older events; arrival order alone is insufficient.
- **The operation is a delta, not a state assignment.** `UPDATE balance SET n = n + :amount`
  can avoid lost increments without a version, but limits, account state and duplicate
  requests still need protection. Increment a shared version if snapshot editors coexist.
- **Conflicts are resolvable by construction** — structures with the required convergence
  semantics, or data with an enforced single-writer contract. A per-user key alone does not
  prevent two tabs, devices or jobs for that user from racing.

State which of these applies when you decide not to version something. "No version column"
should be a decision in the record, not an omission (`architecture-decision-making`).
