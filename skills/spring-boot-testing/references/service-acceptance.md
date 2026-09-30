# Evidence for a service the team will maintain

Use this when creating a service or reviewing whether its tests support delivery.
Start from the requested use cases, access policy and storage guarantees. Map each
consequential claim to a failing observation: for example, "two accepted registrations
cannot persist the same normalized tax identifier." This skill configures that evidence;
the domain, HTTP and persistence specialists define the actual contract. Do not invent
additional endpoints or authentication requirements to fill a checklist. An explicitly
disposable in-memory demonstration has a smaller acceptance boundary.

## Select the boundary that can fail

| Claim                                                              | Harness and observation                                                                                                                                                                         | False assurance to reject                                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A domain rule rejects invalid state                                | Direct tests of the actual domain/use-case types, without Boot when wiring is irrelevant                                                                                                        | Mocking the object whose rule is being checked                                                              |
| The HTTP contract binds, validates and translates errors correctly | Focused MVC test with real advice, converters and relevant security configuration; assert status, headers and public body                                                                       | Only asserting a mocked service result or disabling filters                                                 |
| Application wiring connects requests to durable changes            | Full application context with real filters, application beans and the selected database; use configured MockMvc or a live server as the claim requires, then independently read committed state | A mocked repository, `contextLoads()` alone, or a test transaction masking the missing application boundary |
| Servlet-container behavior produces the expected HTTP response     | A `RANDOM_PORT` server and actual HTTP client exercising the relevant container path, such as error-page dispatch                                                                               | Calling MVC advice or `/error` directly and claiming container dispatch was exercised                       |
| The deployed schema enforces its constraints                       | Run the actual migrations on an isolated instance of the required engine/version; execute the relevant repository queries and constraint failures                                               | Hibernate generating tables instead of migrations, or H2 claimed as evidence for another engine             |
| A use-case failure leaves no partial work                          | Trigger the relevant failure through the real proxied entry point without an outer test transaction, then observe state outside the failed transaction                                          | Test rollback supplying the missing application transaction                                                 |
| State survives application restart                                 | When durability is required, stop/restart the application while retaining the isolated database, then query through the service                                                                 | Restarting both application and disposable database, or only reloading the persistence context              |

Context breadth, real collaborators and transport are separate choices. For an MVC
service that already has a full-context `@SpringBootTest` with `@AutoConfigureMockMvc`,
real service/repository beans and an isolated database, reuse it for request-to-commit
wiring when no container behavior is claimed. MockMvc does not inherently mock those
beans. Remove an outer test transaction when it would hide the boundary being proved.
If the claim instead depends on servlet-container error dispatch, use a running server:
MockMvc's mock servlet objects do not execute that lifecycle. This adds startup and
independent server-state cleanup costs; keep focused slice checks for other concerns.
Preserve the application's actual web stack. For WebFlux, inspect the supported
WebTestClient binding and reactive context rather than importing an MVC harness; a
client's type alone does not establish whether it uses mock binding or actual HTTP.

Name tests after observable behavior, such as
`duplicateTaxIdentifierIsRejectedWithoutCreatingAnotherCompany`, and place them beside
the feature or layer they exercise using the project's conventions. Use existing test
builders/fixtures for coherent inputs when they reduce noise; a shared abstract Boot
test class is not a substitute for choosing the appropriate context and transaction.

For the real database path, choose a disposable Testcontainer or an isolated CI database
with an explicit cleanup owner. Reuse an adequate existing instance; a container is a
lifecycle option, not an additional acceptance requirement. Verify the actual connected
product/version and schema,
including service-connection precedence and slice replacement; follow
[context/service lifetime](context-and-services.md). Use the production migration
mechanism and disable schema creation that could conceal missing migrations, usually
with Hibernate validation when JPA is used. For a schema change, exercise upgrade from
the supported prior schema with representative data when that is the deployment path;
fresh-database startup alone cannot verify an upgrade. A failed migration must fail that
startup/test path. Do not silently fall back to an embedded database.

## Compare the published contract with the actual boundary

When an OpenAPI contract is shipped, identify whether its source of truth is an authored
contract or generated code-first description. Load the supported published contract and
any generated document for the active API group/configuration; compare representative
requests and responses with the configured application boundary. A schema snapshot alone
does not show that the application accepts it. Documentation generated from the same
incorrect annotations is not independent evidence of consumer compatibility. Include
cases that distinguish the rules: required versus null versus absent,
length boundaries under the declared Unicode semantics, and malformed values. For
paged queries, exercise the declared size limit, stable ordering and allowed sort fields.
Resolve disagreement with `spring-boot-web`; do not weaken an assertion to match either
side without deciding the intended public contract.

For protected operations, include unauthenticated, insufficient-authority and permitted
requests. Where tenant/owner scope exists, try accessing another principal's resource.
Verify that denials do not perform the protected mutation and errors do not expose
internal messages. A deliberately public operation needs its public behavior tested,
not an invented login requirement. MockMvc `user()` or `jwt()` can test authorization
mapping, but bypasses parts of authentication: validating token verification, expiry or
issuer/audience requires that actual configured boundary. Use owned test credentials,
keys or a test identity service; never production identities.

## Exercise shared invariants with independent work

For database uniqueness or lost-update claims, use independent transactions/connections
against the same isolated database. For a cross-instance guarantee, use independent
application instances without a shared in-memory lock. Coordinate contenders at the
relevant boundary, collect every outcome, and check the final persisted state. For a
non-idempotent create contract, for example, one duplicate contender succeeds and the
other returns the documented conflict, with exactly one row; an idempotent contract may
legitimately return success to both for the same result. Assert the chosen contract.
Parallel mock invocations cannot prove either guarantee, and repetition alone does not
ensure the tested interleaving occurred.

Bound barrier waits, client timeouts, database lock waits and completion waits. Avoid
sleeps as coordination. Do not share a persistence context across worker threads or
assume the test's transaction follows them. In `finally`, release waiting participants,
cancel remaining work and await termination before deleting owned rows. Client
cancellation alone does not prove server work stopped: wait for server-side completion,
or close the test-owned application before disposing its dedicated database. Ensure
failure paths cannot leave a worker blocked or racing cleanup; respect interruption.
Async effects similarly need a bounded observation of completion, not just HTTP success.
These checks demonstrate the exercised invariant, not throughput or scalability.

## Ensure the required checks actually execute

Preserve the project's unit/integration test split and inspect the effective CI command,
discovery patterns, tags and reports. A class named `*IT` is not evidence it ran. For a
Maven Failsafe suite, bind both `integration-test` and `verify` and run through `verify`
so teardown and result verification execute; use the equivalent configured lifecycle
for other build tools. This does not require moving existing correctly discovered
integration tests out of Surefire.

Required database/integration checks must be selected by CI and fail when their
infrastructure is unavailable. An optional local skip may help development, but report
it as unexecuted coverage; never treat skipped tests as a release check passing. Read
fresh per-suite counts, failures, errors and skips, and report the actual database,
request transport and authentication boundary exercised. Keep fast slice evidence and
full service evidence distinct. High line coverage cannot fill an untested boundary.

Sources verified on 2026-09-29:

- [Boot 4.1.1 test modes and slices](https://github.com/spring-projects/spring-boot/blob/v4.1.1/documentation/spring-boot-docs/src/docs/antora/modules/reference/pages/testing/spring-boot-applications.adoc)
  establishes what mock, live-server and JPA contexts actually configure.
- [Framework 7.0.9 MockMvc and end-to-end boundaries](https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/testing/mockmvc/vs-end-to-end-integration-tests.adoc)
  explains mock servlet objects, real MVC configuration and missing container dispatch.
- [Boot 4.1.1 test services](https://github.com/spring-projects/spring-boot/blob/v4.1.1/documentation/spring-boot-docs/src/docs/antora/modules/reference/pages/testing/testcontainers.adoc)
  documents connection precedence and lifecycle ownership.
- [Framework 7.0.9 test transactions](https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/testing/testcontext-framework/tx.adoc)
  explains thread-bound transactions and false positives from unflushed ORM work.
- [Maven Failsafe lifecycle](https://maven.apache.org/surefire/maven-failsafe-plugin/)
  explains teardown and result verification through the `verify` phase.
- [Boot database initialization](https://docs.spring.io/spring-boot/how-to/data-initialization.html)
  distinguishes Hibernate schema creation from migration tools; the page describes Boot 4.1.1.
- [Spring Security JWT test support](https://docs.spring.io/spring-security/reference/servlet/test/mockmvc/oauth2.html)
  distinguishes a mock JWT identity from signed bearer-token authentication. Match the
  project's resolved Security version (7.1.1 in this fixture's Boot dependency management).
