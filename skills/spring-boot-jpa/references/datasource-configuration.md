# Datasource, pool and provider configuration

Read this for Boot wiring, property reviews or pool symptoms. Defaults are a baseline;
change a value only when its prerequisite, intended effect and verification are known.

## Trace the effective configuration

Record the BOM and resolved dependencies, active profiles/property sources, actual
DataSource class, persistence unit, transaction manager, database/driver metadata and
sanitized connection properties. Check custom beans and auto-configuration conditions
before assuming `spring.datasource.*` still controls a datasource. Driver configuration
under Hikari and Hibernate's own connection-provider configuration are different paths.
Do not add a second pool through Hibernate when Boot already supplies the datasource.

For multiple units, verify `@EnableJpaRepositories` package scope, entity-manager-factory
reference and transaction-manager reference, plus each manager's datasource. Local
transactions on two managers do not become atomic by sharing a method annotation.
Retain an adequate single-datasource auto-configuration; explicit factories need a reason.
[Boot SQL integration](https://docs.spring.io/spring-boot/reference/data/sql.html).

For every proposed property, state: supported resolved version, unit, problem, prerequisite,
expected observation, cost and condition for retaining the default. Hibernate's arbitrary
property map can accept an unknown/historical key without demonstrating any behavior.
Consult the exact provider settings/source before claiming a property has an effect or
has been removed. Use managed versions unless the project has an intentional override.
[Boot managed versions](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html).

## Pool decisions

Measure acquisition wait, active/idle/pending connections, timeouts and **connection hold
time**, plus database CPU, I/O and locks for the same interval. A long checkout can include
remote waits and application work, not just SQL. Attribute the bottleneck before raising
`maximum-pool-size`. Model total potential connections across peak replicas, rolling
deployments, multiple pools, jobs, administrators and other clients. Virtual threads
increase possible waiting callers, not the database budget; bound admission when required.

| Hikari property       | Contract and decision                                                                                                              | Verification                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `maximum-pool-size`   | Concurrent physical connections, including idle ones; choose within measured database capacity                                     | Compare throughput, acquisition/hold tails and errors at representative offered load; a larger pool can increase contention |
| `minimum-idle`        | Lower values save idle resources but require connection creation after a quiet period; default behavior supports a fixed-size pool | Include cold/idle-to-burst traffic, readiness and creation latency; zero is not universally better                          |
| `connection-timeout`  | Milliseconds waiting for a pool connection; 250 ms is the documented minimum, not a recommended optimum or query timeout           | Fit the request/job deadline and test pool saturation, connection creation and database slowdown                            |
| `idle-timeout`        | Milliseconds governing eligible idle retirement; matters when minimum idle is below maximum                                        | Observe retire/recreate behavior and cost after idle, not a transaction deadline                                            |
| `max-lifetime`        | Milliseconds of connection age; active connections are retired only after return                                                   | Align with infrastructure limits; it does not terminate a stuck query or impose a security lifetime                         |
| `keepalive-time`      | Idle-connection liveness checks; must fit lifecycle/network constraints                                                            | Verify infrastructure idle policy and churn; it cannot make an active blocked statement responsive                          |
| `auto-commit`         | Default state of borrowed connections                                                                                              | Test actual borrowed state and commit/rollback for ORM and direct JDBC consumers before changing it                         |
| `connection-init-sql` | Runs when a physical connection is created, not on every checkout                                                                  | Verify session initialization and subsequent state changes; prefer a demonstrated requirement over a copied SET statement   |

Driver login/socket timeout, pool acquisition timeout, transaction timeout, query timeout
and lock timeout bound different phases. Construct a deadline budget and test cancellation
and resource return; a small pool timeout does not bound a query already executing.
REQUIRES_NEW can require another connection while an outer one remains checked out.
Reduce unnecessary nesting/hold time and assess the database budget before increasing
capacity. [Hikari configuration](https://github.com/brettwooldridge/HikariCP#configuration-knobs-baby),
[sizing and pool-locking](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing).

## JPA/Hibernate settings

| Setting                                              | Required reasoning                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spring.jpa.open-in-view`                            | Choose persistence-context lifecycle intentionally. For an API with OSIV disabled, load required data inside the use case. Test rendering outside it; OSIV off is not an N+1 fix.                                                                                                                               |
| `ddl-auto`, SQL initialization and migrations        | Identify the one schema owner and startup order. `none` plus SQL init `never` neither migrates nor validates. Use Flyway/Liquibase according to the project; `validate` is a useful partial compatibility check, not complete migration verification. Do not use automatic update as a production rollout plan. |
| `hibernate.dialect`                                  | Keep adequate metadata detection; override for an actual custom/offline requirement and verify database support. A fixed wrong dialect is not portability.                                                                                                                                                      |
| `hibernate.connection.provider_disables_autocommit`  | Set true only when the actual provider guarantees autoCommit=false on acquired connections. It tells Hibernate to skip work; it does not change the provider state. Test rollback and direct JDBC consumers.                                                                                                    |
| `hibernate.jdbc.batch_size`                          | Maximum compatible statements per batch, not fetch size or ID allocation. Verify generator strategy, actual batches and failure behavior before adopting 50.                                                                                                                                                    |
| `hibernate.order_inserts`, `hibernate.order_updates` | May improve grouping or lock acquisition order at sorting cost; compare representative workload and failure paths.                                                                                                                                                                                              |
| Historical `hibernate.jdbc.batch_versioned_data`     | Audit support/effect against the resolved provider version. Do not preserve an inert key just because Boot forwards it, or announce removal from absence in one reference page alone.                                                                                                                           |
| `hibernate.jdbc.fetch_size`                          | Driver fetch hint, not a result limit, page size or N+1 solution. Verify driver cursor/buffering prerequisites and memory/resource lifetime.                                                                                                                                                                    |
| `hibernate.id.optimizer.pooled.preferred`            | Conditional generator policy; reconcile every affected generator and DDL. The fixture's pooled-lo choice does not authorize changing all project sequences.                                                                                                                                                     |
| `hibernate.jdbc.time_zone`                           | Affects defined JDBC temporal paths. Verify actual attribute type/bind/extraction, database precision and two JVM zones; do not claim all Instant values bind as datetime2 in local JVM time.                                                                                                                   |
| `generate_statistics`, SQL logging and formatting    | Enable targeted observation with measured overhead and privacy controls. Statistics aggregate across operations unless isolated; formatted SQL is not proof of batching and missing logs are not proof of no queries.                                                                                           |

Check [JdbcSettings](https://docs.hibernate.org/orm/7.4/javadocs/org/hibernate/cfg/JdbcSettings.html)
and [BatchSettings](https://docs.hibernate.org/orm/7.4/javadocs/org/hibernate/cfg/BatchSettings.html)
for the baseline, then the target version. Prefer logger configuration over duplicate
`show-sql` paths. Use version-appropriate bind categories (for Hibernate 7, inspect
`org.hibernate.orm.jdbc.bind`) only with sanitized fixtures or an approved data policy;
do not log secrets/production payloads just to count queries.

## Worked review: SQL Server scheduler configuration

The input proposes pool 20/min-idle 0/acquisition 250 ms/lifetime 600000 ms, autocommit
false with provider-disables-autocommit true, batch/fetch/allocation 50, UTC binding,
ARITHABORT ON, non-Unicode parameter mode and virtual threads. These are review inputs,
not a ready-made tuned configuration. No credentials or usable connection URL are needed
to reason about them.

1. **Retain the consistency goal:** an outbox claim changes eligible rows atomically;
   determine transaction manager, isolation, competing workers and recovery contract.
   A pool or row lock does not establish distributed delivery semantics.
2. **Verify the autocommit assertion first:** inspect the supplied datasource and test a
   write followed by rollback. If a custom source can return autocommit=true, reject
   the Hibernate assertion until the prerequisite is established.
3. **Treat capacity numbers as hypotheses:** measure peak-replica connection budget,
   acquisition after idle, database headroom and connection hold time. Do not derive
   20 from HTTP/virtual-thread counts or describe 10-minute lifetime as security.
4. **Unbundle the three 50s:** ID allocation needs optimizer/DDL/writer agreement; DML
   batch size needs batchable statements; fetch size concerns driver retrieval. None
   validates another. Audit historical properties against the actual version.
5. **Investigate the claimed filtered-index scan:** inspect actual statement/bind types,
   predicate implication, session SET options, compatibility level, statistics and plan.
   ARITHABORT ON is not a guarantee of a seek. SQL Server documents a set of requirements,
   and ANSI_WARNINGS ON implicitly enables ARITHABORT at compatibility level >=90.
   Distinguish index eligibility from optimizer choice before attributing a regression.
6. **Protect the text contract:** check column collation/type and bind API before setting
   `sendStringParametersAsUnicode=false`; exercise non-ASCII/supplementary data and the
   indexed predicate. Do not trade silent data loss for an assumed plan improvement.
7. **Clarify deployment configuration:** remove conflicting duplicate driver/encrypt/
   application-name sources after establishing the effective value. Separate local
   fixtures from deployment secrets, application identity and certificate validation.
   `trustServerCertificate=true` bypasses certificate validation; do not turn a sample
   administrative account/database or password fallback into a production template.

[Filtered-index SET requirements](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-index-transact-sql#filtered-indexes),
[JDBC properties](https://learn.microsoft.com/en-us/sql/connect/jdbc/setting-the-connection-properties),
[TLS behavior](https://learn.microsoft.com/en-us/sql/connect/jdbc/connecting-with-ssl-encryption).

HTTP/2, compression, forwarded headers, virtual-thread executor selection and Actuator
exposure in the same YAML are Boot/Web concerns. Pass the active profiles, proxy topology,
endpoint/security-chain inventory and request budget to those skills. This snippet alone
proves neither that management endpoints are public nor that they are protected. Continue
the persistence review without silently changing those independent settings.
