# Interception and rollback

Read when placing a use-case boundary, when a transaction attribute appears ineffective,
or when persisted state contradicts the error returned to a caller. These are imperative
Spring contracts; database isolation and business atomicity remain decisions for
`enterprise-transactions`.

## Give the unit of work an owner

Start with the operation's outcome: which writes must succeed together, and which effects
may occur independently? Put the boundary around that application operation, for example
`CreateCompanyUseCase.execute`, using the project's service convention or an intercepted
transactional decorator when the application layer is deliberately framework-independent.
Repository-local transactions do not make a sequence of repository calls atomic. Retain
the existing naming and package roles; neither a controller-wide transaction nor a new
generic transaction superclass establishes the correct unit of work.
[Spring Data JPA 4.1.1 transaction boundaries](https://github.com/spring-projects/spring-data-jpa/blob/4.1.1/src/main/antora/modules/ROOT/pages/jpa/transactions.adoc).

Keep the database unit bounded. A remote payment or email is not rolled back by the local
manager; calling it inside the method also extends connection and lock ownership while
waiting. If it must participate in the business outcome, identify the coordination,
idempotency or retained-intent requirement before moving it to an after-commit listener.
Making it asynchronous does not supply atomicity or durability.

## Trace an invocation, not an annotation

Locate the object obtained by the caller and the concrete method it reaches. Record whether
the object is Spring-managed, whether transaction advice exists, and whether this invocation
crosses it. Separate bean construction (`proxyBeanMethods=false`), transaction proxying and
an explicitly configured AspectJ mode; they answer different questions.

For ordinary proxy mode, a call through a proxy may apply transaction attributes; a call
through `this` does not apply the inner method's attributes. If the caller already owns a
transaction, a self-call can still participate in that existing context. An observed active
transaction therefore cannot prove `REQUIRES_NEW` was applied. Check the manager/resource
and independent commit/rollback outcome. Interface proxies need public interface methods;
class proxies can support protected/package-visible methods on the relevant Framework
versions, but cannot advise private/final methods. Prefer a real application entrypoint
or a transactional collaborator when that matches ownership; `TransactionTemplate` is an
explicit alternative for a local unit. Avoid introducing self-injection merely to keep
an unclear call graph intact.

Check composed annotations, class-versus-method attributes, manager qualifiers and context
placement. Two managers against two stores do not become one atomic resource just because
both calls have `@Transactional`. The
[Framework annotation contract](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html)
is the source for these version-sensitive interception and manager rules.

## Separate save, flush and commit

Within an outer transaction, a returned `save` or `saveAndFlush` is not evidence of commit.
Flush synchronizes pending persistence changes and can expose a constraint failure sooner;
the transaction can still roll back. Choose an explicit flush only when that timing is
needed, not as a universal durability fix. Hand ORM-specific flush behavior to
`spring-boot-jpa`.

With ordinary interceptor-managed completion, commit happens after the target method
body returns. A catch around `save` inside that body cannot catch a failure raised later
by commit. Translate a completion failure at a boundary outside the actual committing
invocation (or outside `TransactionTemplate.execute`), preserving its cause and useful
business identity. An outer REQUIRED transaction may own completion instead of the
apparently transactional inner method. Classify the actual constraint/exception; do not
turn every database failure into a duplicate-company error or return success after a
rollback-only failure. Keep HTTP status and safe response mapping in the web layer.
[JPA repository flush contract](https://github.com/spring-projects/spring-data-jpa/blob/4.1.1/spring-data-jpa/src/main/java/org/springframework/data/jpa/repository/JpaRepository.java),
[Framework 7.0.9 interceptor completion](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java).

## Determine the effective exception rule

The ordinary default rolls back on unchecked exceptions and `Error`; checked exceptions
can commit. Inspect project configuration first: Framework 6.2+ supports
`@EnableTransactionManagement(rollbackOn=ALL_EXCEPTIONS)`, while method-specific rules can
override matching cases. Do not propose a global switch to fix one use case without reviewing
intentional commit-on-business-exception callers.

Prefer typed `rollbackFor`/`noRollbackFor` rules when changing a specific failure contract.
Name patterns are substring matches and can accidentally include nested or suffixed types.
Choose from the exception that actually reaches the interceptor, including translation and
wrapping, rather than from an exception thrown and swallowed inside the method. A failed
result object generally differs from throwing; Framework has explicit handling for Vavr
failure and Futures already exceptionally completed when returned. A failure happening
later cannot retroactively roll back a finished transaction.
[Rollback rules](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html).

If a proxied REQUIRED participant marks the shared transaction rollback-only, catching its
exception does not restore commitability. Verify `UnexpectedRollbackException` and the
absence of **both** outer and inner writes. Use a genuinely independent audit transaction
only if the audit should survive a failed business operation; do not scatter REQUIRES_NEW
to suppress errors. It can require another pooled connection while outer locks remain held.
[Propagation and rollback-only](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html).

## Check the physical transaction and resource budget

- **REQUIRED joins an existing transaction:** its physical isolation, timeout and read-only
  characteristics normally win over inner declarations. An inner shorter timeout does
  not create a new deadline. Inspect manager validation settings before relying on
  rejection of isolation/read-only mismatches. `readOnly=true` is a subsystem hint, not
  a portable write prohibition or authorization control.
- **REQUIRES_NEW suspends participation in the outer unit:** the outer connection and locks
  can remain held while an inner connection is acquired. Bound concurrent entrants and
  acquisition time; check pool headroom, nesting and competing work. A pool occupied by
  outer transactions can starve every inner call, and an inner write can wait on a lock
  held by its suspended caller. Changing propagation requires an independent-outcome
  requirement, not just a larger pool.
- **NESTED is a savepoint path, not an independent commit:** verify support in the actual
  manager and driver. Outer rollback still discards successful inner work. In
  `JpaTransactionManager`, enabling JDBC savepoints does not rewind the EntityManager's
  cached entities; do not promise nested JPA object-state rollback.

These checks establish what the annotations do; `enterprise-transactions` owns selecting
the business isolation/atomicity model. A new worker thread, including a virtual thread,
does not inherit an imperative transaction. If independent work is intentional, pass
immutable data and establish its own effective boundary; do not share a managed entity
or copy transaction thread-locals to simulate propagation.
[Framework 7.0.9 propagation](https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/data-access/transaction/declarative/tx-propagation.adoc),
[transaction attribute contract](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-tx/src/main/java/org/springframework/transaction/annotation/Transactional.java),
[JPA manager savepoint limits](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-orm/src/main/java/org/springframework/orm/jpa/JpaTransactionManager.java).

## Make the evidence distinguish the mechanism

A useful test calls the actual bean from a nontransactional test and injects failure after
the first write. Read committed state from outside the completed unit. A transaction on
the test itself can hide missing application interception, defer after-commit callbacks or
roll back everything regardless of the application's rule.

Choose the failing path in the actual application: compare proxy versus self-call only
when interception is disputed, checked-exception rules when that exception escapes, or
a caught REQUIRED participant failure when rollback-only is suspected. Do not introduce
an artificial ledger or failure-control API into application code just to demonstrate
all three. For multiple managers, prove which resource changed; transaction-active logging
alone is insufficient. See [verification](verification.md) for the observable outcomes.
