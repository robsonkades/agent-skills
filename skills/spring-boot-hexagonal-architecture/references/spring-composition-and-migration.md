# Spring composition and incremental migration

Read when implementing a chosen independent core, changing transaction/wiring ownership,
or moving an existing use case behind ports without breaking its callers.

## Compile-time direction and runtime calls

For a core required to be independent of Spring and persistence APIs, a useful arrangement is:

```text
Compile-time dependencies:
  HTTP/import adapter -> application input contract
  application use case -> inner-owned output contract (domain or application)
  JDBC/client adapter -> inner-owned output contract (domain or application)
  outer configuration -> use case + adapters

Runtime call sequence:
  driving adapter -> transaction boundary -> use case -> output adapter -> device
```

The application invoking a JDBC adapter through its port does not require an import of the
JDBC implementation. Locate contracts with their inner owner: a domain persistence contract
can live beside its aggregate, while operation-specific commands and results belong to the
application. In the catalog DDD reference, `domain.category.CategoryGateway` is implemented
by `infrastructure.category.CategoryMySQLGateway`; do not relocate it solely to impose an
`application` package rule. Avoid a shared `common` module through which unrelated adapters
silently regain access to each other. Start with package boundaries; build modules require
a useful compile/release boundary of their own.

Hexagonal architecture does not mandate a separate JPA model in every application. If the
chosen boundary permits persistence annotations and their lifecycle, keep that decision
explicit. When independent rules cannot safely use ORM hydration/proxies or external schemas
evolve separately, a separate persistence model and mapper may be justified. Price identity,
nullability, precision and lifecycle mapping work. An import-free domain with lazy framework
behavior smuggled in through an interface is not behaviorally independent.

## Wire exactly the intended object graph

Use the project's composition root and single-constructor injection. For an independent core,
instantiate plain objects in outer `@Bean` factories; use method parameters for dependencies
with `@Configuration(proxyBeanMethods = false)`. Direct calls between such factory methods
are ordinary Java calls and can create additional objects instead of retrieving managed beans.
This concerns factory-method interception, not whether a produced bean receives transaction
advice. [Spring's configuration documentation](https://docs.spring.io/spring-framework/reference/core/beans/java/basic-concepts.html)
explains that distinction.

Choose one registration route per instance. A scanned service plus a factory for the same
type can create ambiguity, wrong instances or duplicate resource owners. If a decorator
implements an input port, expose the decorated entry intentionally; prevent production
callers from selecting a raw implementation by concrete type. A qualifier can identify a
real alternative; it does not repair a bypassed contract. Test the actual bean used by each
entry point, not only direct construction of the use case.

Give clients, pools and executors one lifecycle owner. Prefer managed infrastructure already
present; configure shutdown/close through its supported lifecycle. The use case borrows a
port; it should not construct or close a shared client on each call. A per-call result handle
is a different ownership choice and needs explicit cleanup on success, failure and cancellation.
Boot singleton scope does not make an adapter's mutable state safe for concurrent calls.

## Make the transaction real

The use-case contract determines which effects must commit together. Choose its mechanism
against the accepted coupling policy:

- **Annotation on the application service:** reasonable when Spring coupling is allowed.
  Calls must reach the managed advised instance. In default proxy mode, self-invocation does
  not activate transactional advice; a manually constructed object is not intercepted either.
  Inspect proxy type, supported method visibility and actual entry route before changing them.
  [Spring's annotation guide](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html)
  defines these conditions.
- **Outer transaction decorator or programmatic callback:** useful when core compile-time
  isolation is required. A `TransactionTemplate` boundary can surround the plain use case
  while both depend on the application input contract. This avoids depending on annotation
  interception for that call, but the configuration must still expose the decorated object
  to every entry point. [Spring's programmatic transaction guide](https://docs.spring.io/spring-framework/reference/data-access/transaction/programmatic.html)
  documents the template mechanism. Do not invent a transaction framework inside the domain.

Check the selected transaction manager, shared participating resource, propagation and
isolation. Separate repository transactions do not make two writes atomic. A failure
represented as a normal result can commit unless the chosen mechanism explicitly marks
rollback; a swallowed exception can have the same effect. Declarative defaults roll back
for unchecked exceptions and errors, not all checked exceptions; inspect configured
overrides. [Spring's rollback rules](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html)
provide the baseline, not evidence of the project's configuration.

With `REQUIRED`, joined scopes share the physical transaction; an inner rollback-only marker
can produce `UnexpectedRollbackException` at the outer boundary. A successful return from
an inner use case is provisional until the owning outer transaction commits. Before an
adapter acknowledges final success, identify who owns that commit and its error mapping;
test a successful inner return followed by outer rollback when callers can supply a transaction.
`REQUIRES_NEW` uses an independent transaction and additional resource demand, so it changes atomicity and pool
requirements. Do not choose it merely to silence a rollback symptom.
[Spring's propagation documentation](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html)
describes these consequences.

External network effects are outside a local JDBC transaction. Put durable delivery/recovery
behind an explicit design when required; an in-process after-commit callback alone has a
process-crash gap. Its phase also does not make a later callback write part of the completed
transaction. [Spring transaction-bound events](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)
describes the event phases; the durable-delivery requirement needs its own mechanism.
Avoid holding a database transaction open around slow remote work unless the actual contract
requires it and its failure/capacity costs are accepted.

## Migrate one behavior, then widen

1. Capture the selected use case's current public contract and relevant failure behavior.
   Identify duplicated or misplaced rules and which are intentional. Preserve required
   authorization, serialization and completion semantics even if an old implementation is ugly.
2. Introduce the smallest seam inside the existing deployment. Adapt the current dependency
   to the application contract before replacing its technology. Keep unrelated packages and
   schema unchanged when the task permits; folder relocation is not the target behavior.
3. Move the shared decision into the chosen owner, wire existing callers, and retain adapter
   mappings at the outer edges. Compare outputs on controlled fixtures without duplicating
   production side effects. Do not dual-write just to compare an old and new implementation.
4. Exercise an alternate controlled entry plus the real adapter and transaction failure path.
   Add the agreed dependency check, including its violating case. Remove the superseded rule
   only after all affected callers use its replacement; partial migration needs a named seam.
5. State rollout and rollback where external contracts or persisted representations changed.
   Code rollback is insufficient if new data cannot be read by the previous version. Keep
   compatibility windows and migrations explicit; escalate the unresolved contract rather
   than assuming a toggle makes incompatible state reversible.

The comparison that should change a decision is concrete: a simple existing application with
permitted annotations can retain its transactional service; the same application under an
explicit framework-free core requirement needs a compatible outer boundary. Both must prove
the same authorized behavior and database outcome. More files are not the acceptance criterion.

Sources were consulted against Framework **7.0.9**, managed by the fixture's Boot **4.1.1**.
Rolling documentation URLs can change; verify the target release before applying version-sensitive
details. These references support framework mechanisms, not claims about an unseen project.
