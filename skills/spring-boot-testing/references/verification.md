# Verify the test's actual claim

Read the [run instructions](../assets/harness-fixture/README.md) when a concrete MVC
slice or JPA test shape is useful. The [Maven example](../assets/harness-fixture/pom.xml)
is executable in an isolated temporary copy; no script runs on skill activation.
Use the target application's existing types and build when repairing its tests.

| Decision                                                    | Runnable example                                                                                                    | Limit                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Keep real MVC behavior while replacing the excluded service | `MvcSliceTest`: real advice/filter chain, `@MockitoBean`, denied and allowed requests, validation                   | Mock identity is not a password/token authentication test; service is mocked. |
| Check database work without claiming a commit               | `TicketRepositoryTest`: repository, `TestEntityManager` flush/clear, database constraint and after-rollback absence | H2 mapping behavior only.                                                     |
| Read committed state after a real service call              | `TicketServiceCommitTest`: imported service, no outer test transaction, later repository read and committed cleanup | One write; does not establish multi-write atomicity or event phase.           |

The production-shaped event observer, physical JDBC helpers, raw-HTTP client and manual
context/container lifecycle probes are deliberately absent. They do not help a consumer
write these application tests. Conditional decisions survive in
[transaction observability](transaction-observability.md) and
[context/service lifetime](context-and-services.md), including the stronger evidence
required for an `AFTER_COMMIT` claim. Those references contain partial adaptation
snippets, not executable integration suites.

For a repair, show why the assertion or configuration would expose the original defect.
Removing filters, replacing the object whose behavior is under test, or using the same
transaction as evidence of commit changes the claim instead of verifying it. Read fresh
per-test counts and failures; compilation is not runtime evidence. Stop once the actual
contract and the known failure are covered. Running this teaching example does not
prove improvement in an agent's decisions.
