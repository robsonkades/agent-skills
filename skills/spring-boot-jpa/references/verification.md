# Persistence verification and evidence limits

Load this when implementing a path or claiming a diagnosis is verified. Match evidence to
the contract; do not use one successful annotation compilation as proof of transaction,
database or performance behavior.

## Select the smallest adequate test

| Contract                               | Adequate evidence                                                                                     | Insufficient by itself                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Repository wiring and newness behavior | Context/slice with actual provider and correctly selected datasource; inspect resulting SQL/state     | A mocked repository returning the input object                              |
| Commit/rollback                        | Failure after a write, transaction completes, independent transaction/context reads the database      | Reading the same managed instance or calling flush                          |
| Partial update                         | Omitted field survives, explicit null has defined meaning, stale version conflicts                    | Reconstructing an entity with default values and checking one changed field |
| Fetch/page                             | Representative empty/large relations, stable IDs/order/count, SQL limiting and statement observations | Fewer SELECTs while silently dropping roots or loading all rows             |
| Real type/sequence/dialect             | Production-family database and actual driver/schema, boundaries and concurrent/restart cases          | H2 compatibility mode, mocks or SQL compilation                             |
| Lock/optimistic conflict               | Coordinated independent transactions, bounded completion, asserted final invariant and conflict       | Sequential calls in one test-managed transaction                            |
| Pool tuning                            | Offered load, database budget, hold/acquire distributions, cold and saturated periods                 | Threads count or a single request's latency                                 |

Use `@DataJpaTest` for an appropriately scoped persistence test, importing only required
collaborators. Inspect Boot 4's package/module for the annotation and how the test replaces
or retains the datasource; do not paste Boot 3 imports. A real-database slice may require
explicit no-replacement configuration depending on the setup. Use `@SpringBootTest` when
actual application wiring is the subject. The supplied fixture deliberately uses it with
a small non-web application and constructor injection in tests.
[Boot 4 test slices](https://docs.spring.io/spring-boot/appendix/test-auto-configuration/slices.html).

Do not place every test inside a test-managed transaction. That can hide missing service
boundaries, defer failures or make a repository result visible only in the first-level
cache. Flush then clear when persistence state matters, and end the transaction before
asserting commit from a different context. A test's rollback does not undo server-thread
writes from a random-port HTTP call; arrange isolation/cleanup for those committed rows.
Use deterministic barriers/latches and bounded waits for concurrency, not sleeps as proof.

Run against disposable databases created for the test. Reuse established Testcontainers
or project infrastructure; never connect to a user's existing database without a task
that authorizes it. Match engine/version, collation, isolation, migrations and driver
features that affect the claim. A PostgreSQL run does not validate SQL Server Unicode,
locking or filtered-index behavior. Report unavailable runtime/license/network separately.

## Fixture route and checks

Read [the fixture README](../assets/persistence-fixture/README.md) before running it.
It states prerequisites, local writes and isolation. The Maven test sources demonstrate
managed updates, rollback after flush, optimistic conflict and collection-fetch page
semantics on the pinned provider with H2. The SQL Server mapping and database scripts
are separate probes; compilation does not execute those database checks.

For complete entity work, reconcile the entire attribute inventory with mapping, schema,
validation and consumers, including nullable and generated attributes. Exercise both null
and present optional values. The fixture README inventories every field, including deliberate
defaults and checks that remain specific to a real database.

For generated-ID equality, test transient distinction, hash membership before/after
allocation, detached/cross-context instances, and proxy symmetry/equal hashes. Exercise
open and closed contexts under the actual proxy-compliance setting. The fixture adds
both compliance settings explicitly so a zero-query claim cannot hide the getter's
initialization behavior. Different inheritance/provider contracts need additional cases.

The fixture targets Java 25 and includes ten tests for state/transaction/query behavior,
optional attributes and generated-ID/proxy equality. The coordinator's clean isolated run
passed all ten with zero failures/errors/skips, compiling with release 25 and executing
on Temurin 25.0.3, Maven 3.9.15, Boot 4.1.1, Hibernate 7.4.5.Final and H2 2.4.240.
Consult the fixture README for its scope and limitations. Technical fixture evidence
does not establish measured agent improvement.

For a changed type/ID/lock path, extend the fixture or project tests with these checks:

1. Insert/read Java boundary values and Unicode text through Hibernate, then inspect
   SQL values and bind types. Run in two JVM time zones when temporal values are involved.
2. Cross a sequence allocation boundary from independent factories/processes; restart
   one and roll back another. Assert uniqueness and surviving rows, not gaplessness.
3. Hold the protected row in session A; coordinate B's competing operation; capture
   blocking/timeout/conflict and final state under the real isolation and deadlines.
4. For batching/bulk changes, prove affected rows, callbacks/audit/version behavior,
   context refresh and actual batched execution. Read after an independent commit.

These are reproducible verification requirements, not a claim every shipped fixture
already executes all of them. Runtime results must name the command, versions, database,
assertions exercised, skipped checks and unresolved prerequisites.

## Regression scenarios for applying the guidance

Use these as review prompts when an implementation touches the relevant contract:

- A paged response needs only a to-one name; then add a to-many list with many children.
  Re-evaluate exact-provider SQL, root cardinality/order/count and cost. On Hibernate
  7.4 with a supporting dialect, direct collection-fetch pagination is a candidate;
  with an earlier provider, investigate in-memory limiting and alternatives.
- A reference is sufficient to assign a known internal FK; then require tenant ownership
  and immediate missing-row handling. The latter needs evidence the reference cannot give.
- The pool guarantees autoCommit=false; then replace it with an unknown custom datasource.
  The Hibernate assertion must change or remain unproven, even when YAML is identical.
- A managed entity update must audit the actor; then replace it with bulk DML. Verify
  explicit audit/version work rather than expecting listeners to run.
- The request asks only for findings or supplies an adequate JDBC query. Preserve that
  scope and approach instead of turning skill activation into a JPA migration.

## External example adaptation

The planning input included [piomin's skill package at the reviewed commit](https://github.com/piomin/claude-ai-spring-boot/tree/d87e7a38588a0a945ae2c11a251954897692330e/.claude/skills),
notably jpa-patterns and spring-boot/references/data.md and testing.md. Its fetch,
projection, audit and test examples motivated the cases above. Its primary Spring skill
targets Boot 3.x, so examples are not copied as the Boot 4 baseline. Preserve result
semantics when replacing a query with an inner fetch join; do not enable OSIV as an
automatic lazy-loading cure or infer correctness from a fixed coverage percentage.

When test doubles are required elsewhere, Boot 4 removed `@MockBean`/`@SpyBean` support
in favor of Spring Framework's `@MockitoBean`/`@MockitoSpyBean`; inspect their actual
targets and context semantics. H2 and a mocked security principal do not validate real
database behavior or bearer-token verification. This package's fixture uses actual
Spring Data repositories, not repository mocks.
[Boot 4 migration guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide).
