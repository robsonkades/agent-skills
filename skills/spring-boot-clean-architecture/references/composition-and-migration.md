# Compose the core and migrate one slice

Read before moving a managed class, extracting an independent core or changing which
entry invokes a use case. Start with its actual callers and transaction manager.

## Outer composition implements inner requirements

Register plain domain/application objects from external configuration. Prefer `@Bean`
parameters and single constructors. Reuse existing component scanning where its scope
is accepted; scanning is not required for dependency injection. Spring's
[Java configuration composition](https://docs.spring.io/spring-framework/reference/core/beans/java/composing-configuration-classes.html)
documents bean wiring. The fixture creates its raw use case privately in configuration
and exposes only the transaction entry as the application-facing Spring bean. This
reduces accidental injection of an unwrapped bean; it is not an access control boundary.

The application owns which effects must be atomic. Its implementation can remain in
an outer facade/decorator that uses the correct transaction manager, or in an explicitly
accepted Spring-aware application service. `TransactionTemplate` is one imperative
option and couples its containing class to Spring; placing it outside does not remove
the coupling from the system. The fixture's template encloses both writes and returns
the result after local transaction completion when invoked without an enclosing
transaction, as in its tests. Default `REQUIRED` propagation can join an outer
transaction; in that case the outer caller still owns physical completion. Do not
announce committed success until that effective boundary completes. See Spring's
[programmatic transaction contract](https://docs.spring.io/spring-framework/reference/data-access/transaction/programmatic.html).

If using `@Transactional`, verify effective external invocation through the managed
proxy, rollback settings and method/class eligibility. In default proxy mode a self-call
does not gain advice. Moving the annotation to a private method or constructing the
service with `new` at a caller can remove the mechanism while leaving unit tests green.
Inspect the target version's
[declarative transaction rules](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html)
and use `spring-transactions-and-events` for the repair. Checked exceptions, caught
failures, a returned failure value or a different resource can change rollback behavior;
do not assume all unsuccessful outcomes roll back.

Authenticate at the appropriate trusted entry and translate identity into a small
application context. Keep use-case/resource authorization effective for every relevant
entry. A framework-neutral actor object is not proof of authentication: accepting its
roles/customer ID from the request would permit forgery. Method security requires its
own enabled interceptors and real call path; see
[Spring Security method security](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html).
The fixture tests entitlement enforcement using a trusted caller-supplied actor, not
token verification, servlet filters or method-security advice.

Do not expand a local transaction to remote calls merely to fit a diagram. Name local
atomic writes, remote effects and failure recovery separately. This skill does not
design sagas or guarantee exactly-once side effects.

## Safe extraction sequence

1. Capture one operation's current public examples, authorization, failure and durable
   state. Determine which behaviors are requirements and which are accidental defects.
2. Extract the rule or application operation, with inner-owned inputs/results and any
   needed output collaborator. Add pure tests for the meaningful rule and denial path.
3. Adapt existing persistence/protocol types at the seam; avoid changing the database,
   URL, event schema or build tool as an incidental part of this move.
4. Register the outer implementation and effective transaction entry. Switch the real
   consumers, including non-HTTP callers; ensure no production entry bypasses the required
   wrapper. Verify actual wiring instead of manually assembling only the happy path.
5. Observe successful commit and second-write failure without a surrounding test
   transaction. Exercise access denial through the new entry and recheck public
   representation/error compatibility where changed.
6. Remove the obsolete route only after callers and tests use the new one. Keep a
   reversible source/configuration step where practical; if schemas changed, follow
   the project's compatibility and rollback policy. Never promise a code rollback
   reverses already committed business effects.

Start with package boundaries and tests when sufficient. Introduce build modules only
when compilation/ownership isolation earns their dependency and build costs. A staged
migration may deliberately contain mixed styles; document the migrated boundary and
remaining coupling instead of declaring the whole system independent.
