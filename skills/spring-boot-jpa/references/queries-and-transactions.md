# Queries, transactions and write semantics

Read the sections relevant to the use case. The central objective is to preserve the
result and consistency contract while making SQL and transaction behavior observable.

## Fetch and repository decisions

Start with the simplest derived method or JPQL query that expresses the predicate.
Use Specifications for combinations actually required by consumers, and repository
fragments for cohesive custom behavior. Native SQL/JDBC is legitimate for database
features or an existing clear query. Bind values; distinguish an empty filter from
missing filter, and never let optional predicates remove tenant/authorization scope.

Choose the fetched shape from the response/use case:

- A scalar/DTO or closed projection can reduce materialization when no managed update
  is needed. Verify columns and joins; an open projection with expressions or nested
  associations need not fetch only the visible fields.
- A fetch join or entity graph can initialize required associations in the current
  unit. An inner join can drop roots with no matching children; use outer semantics
  when those roots belong in the result. An entity graph is a loading request, not a
  guarantee of one SQL statement or permission to paginate a collection safely.
- Association batch fetching reduces select amplification when join multiplication is
  worse. It is distinct from JDBC `fetch_size` and DML `batch_size`; measure the actual
  statement count and memory, including serialization after the service returns.
- Preserve an adequate fetch plan. Do not globally change LAZY to EAGER or enable OSIV
  to conceal a boundary failure. With OSIV disabled, materialize the required DTO/data
  within the appropriate unit; disabling OSIV alone does not remove N+1 queries.

For a page of roots with a **to-one**, a bounded join/projection can be suitable. Change
that requirement to a **to-many collection**, and re-evaluate row multiplication,
distinct roots, database limiting and count. Hibernate **7.4** supports collection-fetch
pagination by rewriting SQL when the database supports limits/offsets in subqueries
(the documented exception is Sybase ASE). Earlier Hibernate 7 and 6 commonly limited
such results in memory. Do not apply the old blanket prohibition to the fixture baseline
or upgrade a target project to obtain this feature. Verify the exact query/dialect,
generated SQL, root ordering/count and costs; a direct fetch may now be the simpler
valid choice. [Hibernate 7.4 limits and fetch joins](https://docs.hibernate.org/orm/7.4/whats-new/#limits-and-fetch-joins).

When direct collection fetching is unsuitable, a common alternative pages root IDs first
with stable ordering and a unique tie-breaker, then fetches children for those IDs and
restores root order. Handle empty IDs, SQL parameter limits, roots without children and
changes between the two queries according to the required consistency. Another valid
choice is a summary DTO or bounded association batching. Multiple independent fetched
collections can create a cartesian product even when Hibernate deduplicates root objects.

`Page` may require a count query; ensure its predicates/cardinality match the data query,
especially with native SQL or custom joins. `Slice` avoids the total-count contract when
only continuation is needed. Supported scrolling/keyset APIs require a compatible
Spring Data version, stable sort and handling of null/sort-key values. Streaming query
results retain resources: consume/close them within their transaction instead of returning
an open stream to another thread or HTTP serializer.
[Spring Data projections](https://docs.spring.io/spring-data/jpa/reference/repositories/projections.html),
[Hibernate fetching and batching](https://docs.hibernate.org/orm/7.4/userguide/html_single/).

For externally driven lists, cap page size and allowlist sort fields/directions before
building the query. Keep tenant/authorization predicates on every page and count. Apply
the limit in the database: `findAll()` followed by `subList`, `stream().limit` or a
`PageImpl` does not bound the rows loaded. A small page with an enormous offset can still
be expensive; choose a bounded offset policy or supported keyset continuation from the
access pattern. Define cursor/sort consistency under concurrent inserts instead of
promising a fixed snapshot across separate requests.

Decide whether a page's items and total must reflect the same snapshot. In PostgreSQL
18 READ COMMITTED, two successive SELECTs can observe different committed states even
inside one transaction; `@Transactional(readOnly=true)` does not change that isolation
contract. For navigation that tolerates concurrent change, the existing behavior may be
adequate. For a contractual same-snapshot result, consider one query that supplies both
values or a bounded read transaction using an appropriate isolation level; PostgreSQL
REPEATABLE READ provides a stable snapshot for its successive queries. Check effective
outer transaction settings and the cost of retaining the snapshot, and coordinate a writer
between data/count queries in a real-database test. Neither option freezes later HTTP pages.
[PostgreSQL 18 isolation contracts](https://www.postgresql.org/docs/18/transaction-iso.html),
[Spring Data 4.1.1 transaction contracts](https://github.com/spring-projects/spring-data-jpa/blob/4.1.1/src/main/antora/modules/ROOT/pages/jpa/transactions.adoc).

Verify with roots having zero, one and many children; a page boundary; duplicate sort
values; at least two pages; and a count assertion if totals matter. Statement count alone
can reward an incorrect inner join or a query that loads the entire table. Record row
counts, returned IDs, memory-sensitive size and the actual SQL pagination.

## Transaction boundary and interception

Put the database consistency unit around the dependent reads, decisions and writes.
Spring Data inherited CRUD methods and declared query methods do not automatically have
identical transaction configuration; an outer service boundary controls participating
calls. A transaction per repository call cannot make a read/check/write sequence atomic.
[Repository transaction contracts](https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html).

For annotation-based transactions, inspect actual proxy mode, method visibility,
invocation through the proxy and manager selection. Self-invocation in proxy mode does
not start the annotated inner transaction. `@Configuration(proxyBeanMethods=false)` is
a bean-factory choice and does not disable transactional interception. A separate
transactional collaborator or `TransactionTemplate` can make a boundary explicit; do not
add self-injection to conceal unclear ownership. Check local/global rollback defaults;
checked exceptions are not automatically rollback triggers under the usual default,
but project configuration may change that. Test a real failure after an earlier write.
[Spring transaction annotation contracts](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html).

`readOnly=true` expresses intent and can affect flushing/driver behavior. It does not
replace permissions or universally reject writes. An inner REQUIRED call usually joins
the outer physical transaction; declaring a different read-only/isolation preference
does not necessarily establish a new one. A rollback-only marker can cause an eventual
UnexpectedRollbackException even if an intermediate exception was caught.

REQUIRES_NEW uses an independent physical transaction and can require another connection
while the outer transaction retains its own. Assess concurrent outer callers, pool
capacity, timeouts and the required independent outcome before adopting it. Enlarging
the pool cannot resolve an inner transaction waiting on a lock held by its own suspended
outer transaction. NESTED/savepoint semantics depend on the manager and do not make the
JPA persistence context automatically rewind like the database.
[Propagation contracts](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html).

Keep remote calls or lengthy CPU work out of the lock/connection holding interval where
possible. If moving them changes the business guarantee, design the reservation/outbox/
compensation protocol explicitly; an email or payment cannot be undone by a local DB
rollback. Hand off cross-resource recovery when necessary. Do not split atomic dependent
database operations merely to make every individual transaction short.

## Concurrency and failure

Choose from the invariant:

- A unique/check/FK constraint protects the database against all writers. An `exists`
  check can improve an error message but is not race protection; map only a recognized
  constraint violation to a business conflict, not every integrity error.
- A conditional update can reserve inventory with a predicate such as available >=
  requested and a checked affected-row count. Include version/tenant predicates when
  their contracts require them; distinguish missing, forbidden and conflicting states
  without disclosing unauthorized data.
- `@Version` protects participating entity updates against stale versions. It does not
  by itself serialize all rows involved in a cross-row invariant or protect bulk/native
  writes that omit the version predicate/increment. A child-only change need not advance
  its parent's version; inverse relationships are not automatically part of the parent's
  versioned state. If the conflict boundary is the aggregate, establish a common writer
  protocol, such as a justified force-increment/lock on the root. Do not impose root-wide
  conflicts on independent children. Test concurrent edits to different children under
  the shared invariant; hand off broader protocol design to offline-concurrency-control.
  [Jakarta versioned state and lock modes](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2#optimistic-locking).
- `@Lock(LockModeType.PESSIMISTIC_WRITE)` requests a persistence lock for the repository
  query. It needs an active transaction that covers the protected decision and update.
  Inspect emitted SQL and lock scope under the real dialect/isolation. JPA lock modes,
  query timeout hints and SQL Server hints are separate contracts.

For lock contention, bound waits and examine acquisition order, transaction duration,
deadlocks and cancellation. `jakarta.persistence.lock.timeout` is a portability request,
not proof every provider/driver honors a millisecond bound. SKIP LOCKED/READPAST/NOWAIT
may change fairness or which rows are observed; they are conditional queue semantics,
not interchangeable performance hints. A row lock alone does not prove exactly-once
outbox delivery, worker crash recovery or consumer idempotency.
[Spring Data locking](https://docs.spring.io/spring-data/jpa/reference/jpa/locking.html),
[Jakarta EntityManager locking contract](https://jakarta.ee/specifications/persistence/3.2/apidocs/jakarta.persistence/jakarta/persistence/entitymanager).

Retry only failures identified as transient/retryable under the operation's contract.
Start the next attempt in a fresh transaction, reread required state, bound the entire
deadline, and account for external effects and uncertain commit outcome. Do not keep
using a failed Hibernate session/transaction after a persistence exception as though
it were a clean retry context.

### Translate the failure at the boundary that can observe it

`save()` can queue work. A try/catch around it may miss an error raised by a later query,
explicit flush or transaction commit. With the usual Spring transaction proxy, commit
runs after the target method returns; a catch inside that method cannot catch that
commit failure. Handle it around the actual transaction owner, for example an outer
application adapter invoking a transactional collaborator or `TransactionTemplate`.
If that call joins an existing transaction, its return still does not prove commit.
Do not introduce `REQUIRES_NEW` merely to move the catch point; it changes atomicity.
[Spring 7.0.9 transaction interceptor](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java),
[JPA transaction completion and translation](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-orm/src/main/java/org/springframework/orm/jpa/JpaTransactionManager.java).

An intentional flush can expose an immediate constraint earlier, but also flushes other
pending work, does not commit and cannot force every deferred constraint to be checked.
For example, PostgreSQL deferred constraints can wait until commit.
[PostgreSQL constraint timing](https://www.postgresql.org/docs/18/sql-set-constraints.html).
After a failed write, leave/roll back the failed unit; do not swallow the exception and
return a success or keep writing inside a rollback-only transaction. Classify a specific
unique constraint using the actual provider/driver metadata and named schema contract,
not a substring of a localized SQL message or SQLState class alone. Constraint metadata
may be absent; preserve an unclassified failure instead of guessing the business rule.
[Hibernate 7.4.5 constraint metadata](https://github.com/hibernate/hibernate-orm/blob/7.4.5/hibernate-core/src/main/java/org/hibernate/exception/ConstraintViolationException.java).
Preserve the cause when translating, and keep SQL, values and driver diagnostics out of
public error details.
Unknown integrity/commit failures must retain their actual failure category.

Distinguish an application precondition rejected before mutation (missing ID or stale
client version) from a database conflict discovered at flush/commit. A shared business
exception can expose stable code and typed context for the former; provider/framework
exceptions for the latter still need the operation's conflict policy. Test both paths,
including transaction completion and a fresh read that the winning state survived.

## Bulk work, auditing and batching

Choose entity changes when lifecycle callbacks, cascades, ordinary version checks and
auditing must run. Bulk JPQL/native DML can be appropriate for set-based work but bypasses
those paths. With `@Modifying`, decide whether pending changes must flush first and when
to clear/refresh affected managed state; clearing can discard unflushed changes and detach
unrelated entities. Include explicit version conditions/increments, timestamps or audit
records when the contract requires them. Check affected-row counts and database state
from a fresh context.

JDBC batching groups compatible DML statements; it is neither a bulk SQL statement nor
association batch fetching. Observe real executeBatch behavior and rows, not just formatted
SQL output. Hibernate identity generation prevents normal insert batching for identity
entities; sequence preallocation may help when a schema change is justified. Ordering
inserts/updates can increase grouping and alter lock order at CPU cost; test the workload.
For large sets, flush/clear in intentional chunks to bound managed memory, while recognizing
that flush/clear does **not** commit, shorten all database locks, or define restartability.
A commit-per-chunk design changes atomicity and requires recovery/idempotency decisions.

When auditing is required, configure `@EnableJpaAuditing`, the entity listener and the
selected `@CreatedDate`/`@LastModifiedDate` or actor fields. Supply `AuditorAware<T>` for
actor metadata with a clear HTTP-user, anonymous and background-job policy. Dates alone
do not require an auditor. Do not cast every security principal to a domain user or use
`isAuthenticated()` alone to identify a human; anonymous and system contexts need explicit
classification. Avoid retaining an actor in thread-local state across unrelated work.

Wire a controllable `Clock` into the **DateTimeProvider actually selected** by auditing
(for example via `dateTimeProviderRef`), not merely an unused bean. Test persisted dates
and actors after flush/clear, including a job with no request. Audit fields describe
creation/latest modification; they are not a full historical ledger. Bulk DML and external
writers require separate auditing provisions.
[Spring Data auditing](https://docs.spring.io/spring-data/jpa/reference/auditing.html).
