# What to look for, in payoff order

Work down. Stop at the level where you find something that invalidates the change — there is no
point reviewing the naming in a method that should not exist.

## 1. Is it the right thing?

- Does the change do what the description says, and is that what the ticket asked for?
- Is there a simpler change that satisfies the same requirement (java-dry-kiss-yagni)?
- Does it introduce a concept the domain does not have — a new abstraction, a new layer, a
  configuration flag — and is that concept paid for by something in this change, or only by an
  imagined future one?
- Was a requirement assumed rather than confirmed? Assumptions belong in the description where
  someone can contradict them (requirements-and-acceptance).

## 2. Does it fail well?

The highest-yield question in most reviews, because happy paths get tested and failure paths
get imagined.

- What happens on: empty, null, zero, negative, maximum, duplicate, out-of-order input?
- What happens when the dependency times out, returns 500, or returns success after the caller
  gave up?
- Is a failure swallowed — an empty `catch`, a `catch (Exception)` that logs and continues, a
  default that hides a missing case (java-exception-design)?
- Is the exception translated at the boundary with its cause preserved?
- If this is retried, is it safe to run twice (idempotency)?
- Partial failure: if step 3 of 5 fails, what state is left behind?

## 3. Concurrency, state and data

- New shared mutable state? A field on a singleton, a static, a cached collection
  (java-concurrency, java-memory-model).
- A check-then-act sequence across a transaction boundary — `existsBy` then `save` is a race.
- Lock scope: does anything hold a lock across an I/O call?
- Is a resource closed on every path (try-with-resources), including the failure paths?
- Unbounded anything: a queue, a thread pool, a list built from a query with no limit, a cache
  with no eviction.
- Does a database change work against the data that already exists, and can it be rolled back?

## 4. Contracts and compatibility

- Is a published API, event payload or database column changed in a way that breaks an existing
  consumer (java-api-design)?
- Old and new versions run simultaneously during a deploy — does this change survive that?
- Does the change alter behaviour a caller could reasonably depend on without changing the
  signature? Those are the breakages nobody notices until production.

## 5. Security

- Input from outside the system: is it validated at the boundary, and is the validation the
  authoritative one rather than a duplicate of the client's?
- Query construction by concatenation; deserialisation of untrusted input; path assembled from
  user data.
- Are credentials, tokens or personal data in a log line, an exception message, or an error
  response body?
- Does an authorisation check exist on the new path, and does it check the right subject rather
  than merely that someone is authenticated?

## 6. Can it be operated?

- If this fails at 3am, what will the on-call person see? Is there a log line with the
  correlation id and enough context to act (structured-logging)?
- Is a new failure mode visible in metrics, or does it show only as latency somewhere else
  (metrics-and-cardinality, slo-and-alerting)?
- Is a new configuration value documented and defaulted safely?

## 7. Tests

- Can each new test fail? Look for assertions that restate the implementation, mocks verified
  against themselves, and tests with no assertion at all (java-test-doubles).
- Does the test cover the risk the change carries, or only the path that was easy to test
  (java-testing-strategy)?
- Were tests deleted or disabled in this change? That needs an explicit reason in the
  description.
- Is there a regression test for the bug, if this is a fix (tdd)?

## 8. Readability and structure

Real, but last — and most of it is the author's judgement to make.

- Will the next reader understand the intent without running it (java-clean-code)?
- Do the names carry the domain's vocabulary (java-api-design)?
- Is there duplicated _knowledge_, as opposed to duplicated text (java-dry-kiss-yagni)?
- Structural smells worth naming, if they are load-bearing for this change: java-code-smells.

## What to hand to automation instead

Every item here is a machine's job. If you are writing review comments about them, the fix is
in the pipeline, not in the review (quality-gates).

| Instead of reviewing          | Enforce with                                          |
| ----------------------------- | ----------------------------------------------------- |
| Formatting, import order      | Spotless / google-java-format, checked in CI          |
| Unused variables, raw types   | `javac -Xlint:all -Werror`                            |
| Common bug patterns           | Error Prone, SpotBugs                                 |
| Nullability contract breaks   | NullAway with JSpecify annotations (java-null-safety) |
| Layer and dependency rules    | ArchUnit (architecture-testing)                       |
| Known-vulnerable dependencies | Dependency scanning in CI                             |
| Test coverage of new lines    | A coverage _report_ on the diff — as information      |

A reviewer's remaining job after all of that is the part requiring a model of the system, the
domain and the operational reality. That is the part worth the wait.
