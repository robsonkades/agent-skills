# Context reuse and service lifetime

For a test that passes alone but fails after another class, collect the first failure,
test execution order/forks, context cache DEBUG logs and the service start/stop trace.
Distinguish a different cached configuration, dirty shared state, and a stopped service
behind a still-live client before proposing a fix.

Spring caches by merged configuration, including configuration classes, profiles,
properties and context customizers (including relevant overrides and dynamic property
methods). Test-class names alone do not imply different contexts. A supplier returning
a changing endpoint is not a reliable cache invalidation mechanism: a client can retain
the old endpoint even when a property lookup returns a new value. Separate incompatible
configurations deliberately, or keep the endpoint valid for the cached context.

| Situation                                                                  | Decision                                                                                                                      | Observable check                                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Same configuration, fresh test class                                       | Reuse the cached context if its dependencies and state permit it.                                                             | Same context/resource identity; service still responds.                                                |
| Different property/override/profile required                               | Preserve the meaningful key difference. Do not unify it merely to reduce startup count.                                       | Both configurations produce their intended different behavior.                                         |
| Mutable fake, listener collector or database state leaks                   | Reset the owned state or namespace it by test; decide parallel execution isolation explicitly.                                | Reordered cases still pass and each cleanup removes only its own state.                                |
| Test permanently mutates context structure                                 | Targeted `@DirtiesContext` can be justified.                                                                                  | Old resource closes and a new usable context is created.                                               |
| JUnit-owned container stops after a class while its context remains cached | Prefer context-owned container beans for that shared lifetime, or scope the context to the shorter lifetime when intentional. | Reuse across class boundaries still reaches the service; shutdown closes clients before the container. |

Cache is process-local. Forking a fresh JVM per class defeats cross-class reuse; cache
eviction and dirtiness can also close it. Inspect these facts before attributing suite
time to a particular annotation. Do not introduce a suite-wide `@DirtiesContext` rule
or enable parallel execution as an unmeasured speed fix.

For supported Boot/Testcontainers versions, an imported `@TestConfiguration` can
declare a typed container `@Bean` with `@ServiceConnection`. Boot then manages its
lifecycle with the context and supplies recognized connection details. Those details
take precedence over connection properties: assert the **actual connection's** product
and endpoint rather than trusting a YAML URL. A generic image may need a supported
connection name; consult the available factory instead of inventing one. For a JPA
slice intended to use the container, make the database replacement choice explicit.

For example, if two real application test classes reuse a context, import this shared
test configuration into both. This partial configuration targets Boot 4.1.1 and its
managed Testcontainers 2 API; it needs the test-scoped `spring-boot-testcontainers`,
`testcontainers-postgresql` and PostgreSQL JDBC dependencies. It starts a disposable
container when the importing test context starts and stops it when that context closes:

```java
@TestConfiguration(proxyBeanMethods = false)
class PostgresTestConfiguration {
    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer("postgres:17.6-alpine");
    }
}
```

Here `PostgreSQLContainer` is `org.testcontainers.postgresql.PostgreSQLContainer`.
Use `@Import(PostgresTestConfiguration.class)` on the actual `@DataJpaTest` or
`@SpringBootTest`. For the slice, `@AutoConfigureTestDatabase(replace = NONE)` can make
the intended external database explicit; inspect the target's replacement defaults.
Keep schema setup appropriate to the actual project. The image is illustrative and
must match the project's required engine/version; it does not certify that version.

The decisive constraint is the consumer lifetime. An existing JUnit `@Container` is
adequate when its lifetime already covers every consuming context. Do not convert it
merely to use another annotation. Conversely, a cached datasource cannot safely depend
on a container that stops at the previous class boundary. Boot's bean-owned lifecycle
solves that mismatch without manual starts, dynamic port propagation or a custom
`TestContextManager` test framework.

Verify with the affected **application tests** run together: a meaningful database
operation must still succeed in the later class. Read context-cache and container
lifecycle logs, and inspect actual connection metadata when wrong-database selection
is suspected. There is no need to ship a separate test of Spring's cache identity or
eviction implementation. If Docker is unavailable, report real-service execution as
unavailable; compilation and H2 tests do not establish PostgreSQL wiring or lifecycle.

Sources checked 2026-09-28:

- [Spring context cache](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/ctx-management/caching.html)
  defines the key, process scope, eviction, dirtiness and diagnostic logging.
- [Boot Testcontainers lifecycle](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html#testing.testcontainers.lifecycle)
  documents context-owned containers and client/container shutdown ordering.
- [Boot service connections](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html#testing.testcontainers.service-connections)
  lists supported factories and required test dependency. The page displayed Boot 4.1.1.
