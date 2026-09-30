# Verify the test's actual claim

Read the [run instructions](../assets/harness-fixture/README.md) when a concrete MVC
slice or JPA test shape is useful. The [Maven example](../assets/harness-fixture/pom.xml)
is executable in an isolated temporary copy; no script runs on skill activation.
Use the target application's existing types and build when repairing its tests.
For a new service's acceptance claims, use
[service acceptance boundaries](service-acceptance.md); the six fixture tests are not
a complete service acceptance suite.

## Execute the smallest check that can reject the claim

1. Identify the contract and the current evidence before editing. For a repair, run the
   selected existing test to capture the actual failure when its prerequisites are
   available; distinguish a setup failure from an application assertion. If the original
   test passes while hiding the defect, add or adapt the assertion that exposes the
   missing boundary instead of treating green as confirmation.
2. Change the relevant imports, overrides, properties or resource ownership using the
   project's supported facilities. Keep names and fixtures aligned with observable
   behavior. Reuse a builder for coherent domain inputs if one exists; avoid a generic
   fluent harness that obscures which beans, transactions and services are real.
3. Run the affected checks through the actual build lifecycle. Include the contrasting
   path the fix could hide: denied and allowed requests for filter wiring, rollback and
   committed cleanup for transaction changes, or both classes together for a lifetime
   mismatch. Inspect fresh reports and owned resource cleanup, not only the exit code.
4. Broaden only for remaining risk or required project checks. A pure domain-rule change
   needs no new Boot context, and a DTO validation repair needs no database container
   unless its claim crosses persistence. Do not rerun a flaky test until it happens to
   pass; preserve the first failure and check order, state and lifecycle hypotheses.

For a substantial suite change, keep progress and unresolved boundaries in the project's
existing task record. An ADR is appropriate for a durable CI/service-lifecycle choice
with operational cost, not for each test annotation.

## Leave a reproducible handoff

Update the existing test guide only where changed: exact focused and required CI commands,
profiles/tags, required engine or service access, fixture ownership and cleanup after a
failed run. Explain where fresh reports are written and which observable failure means
the claim is broken. Use placeholders for credentials and sanitized diagnostics.

Report actual tests executed, counts/skips, versions and the boundary exercised; state
which dependencies were substituted. Separate observed results from an inferred cause
and proposed checks. If execution was blocked, identify the missing prerequisite and
the command/check that would resolve the gap. A passing test establishes its exercised
contract under those conditions, not production capacity, untested transports or another
database engine. Do not install a new test service just to avoid reporting that limit.

## Runnable examples and limits

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
