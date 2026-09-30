# Focused Spring Boot tests

Use this executable example to adapt one test to an existing application:

- `MvcSliceTest` keeps the real controller advice and security chain and uses
  `@MockitoBean` for the excluded service. Invalid or denied requests must not call it;
  successful creation returns `201` and the resource's `Location`.
- `TicketRepositoryTest` flushes and clears before reload, exposes a database constraint,
  and checks after the test transaction that rollback removed its row.
- `TicketServiceCommitTest` imports the real service into a JPA slice and disables the
  outer test transaction. A later repository read observes committed data; `@AfterEach`
  removes that test's row in a committed repository transaction.

`Ticket`, its Spring Data repository and concrete service are only the application
context needed to make those choices executable. No interface/fake hierarchy, custom
connection helper or event observer is needed. The service test's single write does
not prove service-level atomicity: a repository transaction alone could also commit
it. Add an actual use-case failure path when that stronger contract matters.

Baseline: **Java 25, Spring Boot 4.1.1, Maven 3.9.x**, Boot-managed dependencies and no
preview flags. The isolated H2 database tests do not validate another engine's behavior.
The security tests use MockMvc identities and test CSRF tokens, not real credentials or
an identity provider. This is an executable teaching example, not a deployable service.
The controller uses concrete `ResponseEntity` types; static JSON request fixtures use
text blocks. Keep any fuller HTTP/domain conventions in the target application.

Copy the directory into a temporary workspace, set `JAVA_HOME` to Java 25, and run:

```text
mvn --batch-mode verify
```

Expected: **six tests, zero failures/errors/skips**. Read fresh reports in
`target/surefire-reports/`: three MVC, two repository and one service commit test.
The repository constraint test deliberately logs a SQL length error which its assertion
expects. Surefire fails if no tests are discovered. No optional container profile or
Failsafe suite is present. JUnit parallel methods are not enabled; the MVC class shares
a mock that Framework resets per method.

Do not point the example at a real database, copy its build policy into a project, or
commit `target/` and logs. Container lifetime, live-server cleanup and listener-phase
diagnosis are explained in the skill's conditional references; this executable does
not claim to test them. Prefer the project's existing application tests when evaluating
those boundaries.
