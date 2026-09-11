# What to look for, in payoff order

Choose passes from the change's risk, using this order as a starting point. A blocker may make
local polishing pointless, but continue independent paths and report any intentionally deferred
coverage. Inspect surrounding implementation and consumers; the diff alone is not the contract.

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
- A check-then-act sequence such as `existsBy` then `save`: what invariant must hold, and what
  enforces it when concurrent callers both pass the check? Inspect constraints, atomic writes,
  isolation/locking and conflict handling before asserting a data-integrity defect.
- Lock scope: does anything hold a lock across an I/O call?
- Who owns each resource, and when does its last consumer finish? Check cleanup by that owner
  on success, failure and cancellation; do not close a borrowed resource or recommend
  try-with-resources around work that continues using it after the block exits.
- Unbounded anything: a queue, a thread pool, a list built from a query with no limit, a cache
  with no eviction.
- Does a database change work against the data that already exists, and can it be rolled back?

For example, a matching unique constraint may prevent duplicate committed keys even when both
callers observe absence. Check whether the losing write produces the required conflict response
and whether side effects occurred before the rejection. The interleaving alone does not prove
duplicate data; a constraint alone does not prove correct application behavior. See
[PostgreSQL's uniqueness checks](https://www.postgresql.org/docs/18/index-unique-checks.html)
for one engine's enforcement; inspect the actual engine and schema before generalizing.

## 4. Contracts and compatibility

- Is a published API, event payload or database column changed in a way that breaks an existing
  consumer (java-api-design)?
- Old and new versions run simultaneously during a deploy — does this change survive that?
- Does the change alter behaviour a caller could reasonably depend on without changing the
  signature? Those are the breakages nobody notices until production.
- Which compiler release/toolchain and resolved dependency versions does the project actually
  use? Check proposed APIs against those versions, distinguishing source, binary and behavioral
  compatibility; do not silently introduce preview flags or a newer runtime.

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

Review readability where it affects understanding or safe modification; keep preferences
non-blocking unless an explicit repository rule applies.

- Will the next reader understand the intent without running it (java-clean-code)?
- Do the names carry the domain's vocabulary (java-api-design)?
- Is there duplicated _knowledge_, as opposed to duplicated text (java-dry-kiss-yagni)?
- Structural smells worth naming, if they are load-bearing for this change: java-code-smells.

## What to hand to automation instead

Delegate repetitive checks to configured automation, but inspect whether it ran and what it
can detect. A tool's potential capability does not establish coverage or excuse an observed defect.
Tool adoption and rollout belong to `quality-gates`; this is a routing table, not an instruction
to add every tool during a review.

| Instead of reviewing                                | Enforce with                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Formatting, import order                            | Spotless / google-java-format, checked in CI                                           |
| Raw/unchecked types and supported compiler warnings | Project-compatible `javac -Xlint` settings; inspect enabled categories                 |
| Unused locals/imports                               | Configured IDE or static-analysis rule; javac does not generally warn on unused locals |
| Common bug patterns                                 | Error Prone, SpotBugs                                                                  |
| Nullability contract breaks                         | NullAway with JSpecify annotations (java-null-safety)                                  |
| Layer and dependency rules                          | ArchUnit (architecture-testing)                                                        |
| Known-vulnerable dependencies                       | Dependency scanning in CI                                                              |
| Test coverage of new lines                          | A coverage _report_ on the diff — as information                                       |

A reviewer's remaining job after all of that is the part requiring a model of the system, the
domain and the operational reality. That is the part worth the wait.

Compiler categories were checked against the [Java 17 javac manual](https://docs.oracle.com/en/java/javase/17/docs/specs/man/javac.html).
Inspect the actual project's JDK before suggesting flags; enabling all warnings as errors can
break an existing build and is not a prerequisite for a useful review.
