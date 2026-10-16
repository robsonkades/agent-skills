# Boundaries, identity and concurrent writes

Read when choosing the root's contents, changing child ownership, reviewing identity
or diagnosing an invariant violated by concurrent commands.

## Derive the boundary from a falsifiable rule

Start with a concrete command and a counterexample. Suppose an order accepts at
most ten units across all its lines. With eight units already accepted, two
independent writers each adding two units would pass a check against the old total
yet jointly exceed the limit. The invariant includes the lines and the root's limit;
a line's own quantity check cannot enforce it.

Prefer grouping the state whose invariants must survive one atomic update. Avoid
adding every related object merely because navigation is convenient. Smaller
aggregates reduce unnecessary shared write contention, but preserving the actual
rule comes first. Vernon's discussion grounds the consistency boundary and small
aggregate heuristic; it does not supply workload measurements for this application.
[Effective Aggregate Design, Part I](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf).

Ask what changes together, not what appears together on a screen:

| Evidence in this domain                                                   | Candidate design                           | What would reject the choice                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| Child existence and mutation belong to the root; one invariant spans both | Child entity or value within the aggregate | Independent lifecycle or an unbounded history unrelated to current invariants |
| Only descriptive attributes matter; replacement preserves meaning         | Immutable value object                     | The business distinguishes the same instance through changes                  |
| Another object's lifecycle and writes are independent                     | Reference its domain identifier            | A strict invariant actually requires coordinated updates                      |
| Several roots appear on one page                                          | Compose a query projection                 | The page's command also imposes an immediate shared invariant                 |

For a strict rule crossing existing roots, inspect whether the missing concept is a
single owner of the scarce resource, whether a short transaction with suitable
isolation/locking across roots is justified, or whether a reservation state changes
the business process acceptably. Document the constraint each alternative enforces.
Merely adding `@Transactional` does not prevent every write-skew anomaly; its
isolation and locked/versioned data must cover the actual predicate.

An asynchronous process is valid only with an accepted intermediate business state,
defined owner, failure outcome and recovery rule. Compensation does not make an
unacceptable oversell retroactively consistent. If the rule's tolerance is unknown,
keep the boundary decision provisional and continue inspecting write paths/tests.

## Identity survives state and storage changes

Entities track continuity; equal attributes do not establish identical entities.
Make identity distinctions explicit, including whether identifiers are scoped to a
tenant or a root. Value objects have value equality instead. These distinctions
follow Evans's entity/value object descriptions; the Java representation remains a
project decision. [DDD Reference, Entities and Value Objects](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf).

For this Java family:

- `OrderID` identifies the domain order. Generate or obtain it once through the
  existing identity policy and restore exactly that value on load.
- `OrderLineID` can be unique only within its owning `OrderID`; an external contract
  addressing a line then needs both. Promote a child to a root only if lifecycle,
  invariants and ownership justify it, not because it has an ID or a table.
- A surrogate `Long persistenceId` is a storage concern. Prefer keeping it in the
  persistence model. If established mappings carry it in the domain, preserve that
  contract deliberately; it must not leak into command identity or replace `OrderID`
  in equality merely because insertion assigned a number.
- Review existing `equals`/`hashCode`, generated IDs and proxy assumptions before
  edits. For stable assigned domain IDs, identity-based equality can include domain
  type and scope. Object-reference equality can also be intentional; compare typed
  IDs explicitly if that is the established contract. Never change a hash key when
  the entity transitions, and do not accidentally equate unrelated transient rows
  because their storage IDs are both null.

## One concurrency protocol for all invariant-bearing writes

Record which mechanism rejects or serializes the second writer. An explicit
optimistic protocol might condition a root update on the version originally loaded:

```sql
-- Protocol sketch; adapt SQL and row-count semantics to the actual database.
BEGIN;
UPDATE orders
   SET version = version + 1
 WHERE domain_id = :order_id AND version = :expected_version;
-- Require exactly one affected row; otherwise roll back and report a conflict.
-- Persist every changed child in this same transaction, then COMMIT.
```

No child write may commit after that root check fails. Even a command changing only a
line must claim the root version when the root's invariant depends on that line.
Check native SQL, bulk jobs, delete paths and administrative tools as well as the
ordinary repository. A zero-row result is not automatically proof of a concurrent
update rather than deletion; follow the repository's conflict/not-found contract.

For JPA mappings, entity versioning is not an automatic aggregate-wide protocol.
What counts as the versioned entity's state and relationship ownership matters;
changing an independently mapped child can leave a root's version untouched. Inspect
the actual provider/version and mapping, then test it. Force-increment or explicit
root updates are options only after confirming their transactional behavior.
[Jakarta Persistence 3.2, sections 3.5.1 and 3.5.2](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2).

Keep the persisted expected version distinct from a domain revision or audit counter
unless the project explicitly defines one protocol for both. Several method calls
inside one transaction do not necessarily mean several persisted version increments.
A conflict discards the stale instance and its uncommitted events. A retry reloads
current state and re-evaluates the command; it may now fail a business rule. Retrying
a blind save of stale state is not recovery, and non-idempotent external effects
must not run again accidentally.

## Checks that can falsify the design

Use a deterministic barrier so two transactions load the same root version; issue
commands whose combination breaks the invariant. Require at most one commit, no
partial child data and no committed event from the loser. Exercise a child-only
update as well as a root-field update. Run on the target database and isolation;
an in-memory fake or a single-threaded repository test cannot establish the result.

Also attempt mutation through a constructor argument, a collection accessor and a
returned child. An unmodifiable list of mutable children fails this check. A read
snapshot must not change behind the caller after a later root transition unless the
API explicitly promises a live view and controls its mutation paths.
Inspect `clone()` implementations too: a shallow clone can share mutable children
or the inherited pending-event list. An intentional copy must define which state
is independent and whether uncommitted events are retained; it is not necessarily
the same operation as rehydration.
