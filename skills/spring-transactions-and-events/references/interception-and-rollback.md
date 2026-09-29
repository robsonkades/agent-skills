# Interception and rollback

Read when a transaction attribute appears ineffective or persisted state contradicts the
error returned to a caller. These are imperative Spring contracts; database isolation and
business atomicity remain decisions for `enterprise-transactions`.

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
