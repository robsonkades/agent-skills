---
name: architecture-testing
description: >
  Testing what an enterprise architecture actually promises: that boundaries hold, that a
  use case is atomic, that persistence mapping matches the schema, that concurrent edits are
  detected, that a query budget is not exceeded, and that a contract stays compatible. Use
  when every test needs the whole application context, when a test suite is slow enough that
  people skip it, when an N+1 or a lost update reached production despite green tests, when
  a mapping change broke a client, when concurrency is "tested" with a mocked repository,
  when a layering rule exists only in a wiki, when an integration test uses an in-memory
  database that behaves differently from production, or when deciding what belongs at which
  test level. Does not cover general unit-testing practice, the architecture decisions
  themselves (layering-and-boundaries, architecture-decision-making), load and performance
  testing (load-testing), or contract versioning policy (rpc-and-api-contracts).
---

# Architecture Testing

## Purpose

Test the properties an architecture claims, which ordinary functional tests do not cover.
A green suite routinely coexists with an N+1, a lost update, a broken layering rule, a
mapping that does not match the schema, and a contract change that breaks a client — because
all of those are functionally correct in a single-threaded test against ten rows.

## The levels, and what each is for

```text
Domain unit test        rules and invariants. No framework, no database,
                        milliseconds. Should be most of the suite.

Use case test           orchestration, with fakes for ports. Fast; asserts
                        the collaboration, not the SQL.

Adapter/persistence     mapping, queries, constraints — against the REAL
integration test        engine. Where the ORM's behaviour actually exists.

Boundary test           binding, validation, status codes, error shape,
                        payload contract. Web layer only.

Architecture test       dependency rules, package boundaries, conventions.
                        Static; runs in seconds.

Concurrency test        two threads, real transactions, asserting one wins.

Budget test             query and remote-call counts per operation.

Contract test           the shape both sides agreed, verified from both
                        sides independently.
```

## Workflow

1. **Put each assertion at the cheapest level that can make it.** A rule tested through HTTP
   and a database is slow, fragile, and does not localise the failure.
2. **Test the adapter against the real engine.** An in-memory database has different
   constraints, different SQL and different locking; a passing test proves little about
   production.
3. **Add architecture tests for every boundary you claim.** A rule that is not executed is a
   suggestion.
4. **Add a budget test to every endpoint whose cost matters.** This is the only reliable
   defence against a reintroduced N+1.
5. **Test the failure paths of every gateway** — timeout, 500, malformed response — with a
   stub that can produce them.
6. **Test concurrency with concurrency**, at least for the aggregates where a lost update
   would matter.

## Decision rules

```text
The assertion is about a business rule
        → domain unit test. If it needs a database, the rule is in the
          wrong place (domain-logic-organization).

The assertion is about mapping, a query, a constraint, or ORM behaviour
        → integration test against the real engine (Testcontainers).
          An in-memory database will pass and production will not.

The assertion is about orchestration across collaborators
        → use case test with hand-written fakes. Prefer fakes to mocks:
          a fake enforces the interface's semantics; a mock asserts a
          call sequence you will then be unable to refactor.

The assertion is about status codes, validation or the response shape
        → boundary test with the web layer only, service mocked.

The assertion is "layer A must not depend on B"
        → architecture test in the build. Nothing else enforces it.

The assertion is "this endpoint costs at most N queries"
        → budget test asserting the statement count.

The assertion is "two users cannot overwrite each other"
        → two threads, real transactions, real database.

The assertion is "our API still satisfies its consumers"
        → contract test, verified independently on both sides
          (rpc-and-api-contracts).
```

## Rules

- **Test the architecture's promises, not the framework's.** Asserting that Spring Data
  returns a saved entity tests Spring Data. Asserting that a use case with two writes is
  atomic tests your design.
- The suite's shape should follow the risk, not a ratio. Rules that change often need fast
  tests; a mapping that never changes needs one integration test; a boundary that many teams
  cross needs an enforced rule.
- **An in-memory database is not the database.** Different constraint enforcement, different
  SQL dialect, no real locking, different isolation behaviour. Every defect this skill exists
  to catch — deadlock, lock contention, constraint violation, plan behaviour — is invisible
  there. Use a container running the real engine.
- Prefer hand-written fakes to mocking frameworks at the port boundary. A fake repository
  that actually stores and retrieves catches "saved but never read back"; a mock returns
  whatever the test said and passes regardless.
- **Do not mock what you do not own.** A mocked HTTP client asserts your belief about the
  vendor. Test the gateway against a stub server that can also fail
  (`enterprise-base-patterns`).
- **Query-budget tests are the highest-return architecture test in a JPA codebase.** An N+1
  is functionally correct, so nothing else catches it, and it appears in production at a
  data volume no test used (`architecture-and-performance`).
- Concurrency assertions require concurrency. A single-threaded test cannot observe a lost
  update, a deadlock or a race; the test that can is two threads, a latch, and a real
  transaction each (`offline-concurrency-control`).
- Test transaction boundaries by asserting the **outcome of a failure**: force the second
  write to fail and assert the first was rolled back. Asserting the annotation's presence
  asserts nothing — self-invocation and proxy limits make it routinely inert
  (`enterprise-transactions`).
- Run migrations in tests, from empty, exactly as production will. A schema created by
  `ddl-auto` in tests and by migrations in production means the tests validate a schema that
  does not exist anywhere (`metadata-mapping`).
- A test that requires the whole application context to assert a rule is a signal about the
  code, not about the test. Take it as evidence before adding another one.

## References

- [Boundary and contract tests](references/boundary-and-contract-tests.md) — architecture
  tests that enforce layering and conventions, web boundary tests, gateway tests against a
  stub server including failure paths, consumer and provider contract tests, and the
  negative assertions that catch accidental exposure. Read when setting up the guardrails or
  testing an edge.
- [Persistence and concurrency tests](references/persistence-and-concurrency-tests.md) —
  container-based persistence testing, migration verification, mapping round trips, query
  budgets, the two-thread optimistic-lock test, transaction rollback tests, deadlock
  reproduction, and the test data volume that makes a plan realistic. Read when testing the
  data layer or a concurrency mechanism.
