# Routing

Find the row that matches the situation. Every skill named here exists in this repository.

## Before writing code

| Situation                                               | Skill                        |
| ------------------------------------------------------- | ---------------------------- |
| The ticket's edge cases are unstated                    | requirements-and-acceptance  |
| The request names a solution rather than a need         | requirements-and-acceptance  |
| Someone wants a date                                    | estimation-under-uncertainty |
| A structural choice needs to be made and recorded       | architecture-decision-making |
| The boundary or package structure is being argued about | layering-and-boundaries      |
| Which layer the business rules belong in                | domain-logic-organization    |

## While writing code

| Situation                                                | Skill                              |
| -------------------------------------------------------- | ---------------------------------- |
| A method or class has grown past comprehension           | java-clean-code                    |
| Naming, signatures, what is public, API evolution        | java-api-design                    |
| Deciding whether two similar pieces should be merged     | java-dry-kiss-yagni                |
| A class seems to do too much; a principle is being cited | java-solid, java-cohesion-coupling |
| Choosing between inheritance and composition             | java-composition-over-inheritance  |
| Depending on a concrete type across a boundary           | java-dependency-inversion          |
| Designing a value object or an immutable type            | java-immutability                  |
| Nullability contracts; NPEs recurring                    | java-null-safety, java-optional    |
| A service reads state, decides, writes it back           | java-tell-dont-ask                 |
| Long navigation chains                                   | java-law-of-demeter                |
| Designing the exception surface; a swallowed failure     | java-exception-design              |
| Where to validate, and where validation became noise     | java-defensive-programming         |
| Invariants that live in the callers' heads               | java-design-by-contract            |
| Splitting decision from effect to make logic testable    | humble-objects-and-functional-core |

## Testing

| Situation                                           | Skill                       |
| --------------------------------------------------- | --------------------------- |
| Deciding where a change should be tested            | java-testing-strategy       |
| Writing the test; it is flaky, slow, or unreadable  | java-test-design            |
| Choosing what to mock, fake or use for real         | java-test-doubles           |
| Deciding whether to drive the change with tests     | tdd                         |
| Threading, races, cancellation under test           | concurrency-testing         |
| Layer and dependency rules as tests                 | architecture-testing        |
| Failure injection, resilience under partial failure | distributed-systems-testing |
| Benchmarking a method                               | jmh-microbenchmarks         |
| Load, throughput, saturation                        | load-testing                |

## Changing existing code

| Situation                                      | Skill                               |
| ---------------------------------------------- | ----------------------------------- |
| Restructuring without changing behaviour       | java-refactoring                    |
| Code with no tests that must be changed        | java-refactoring                    |
| Auditing for structural problems               | java-code-smells                    |
| Moving from one architectural shape to another | architecture-refactoring-paths      |
| Deciding whether a shortcut is acceptable      | technical-debt-decisions            |
| Pricing a dependency on the framework          | framework-coupling-and-independence |

## Concurrency

| Situation                                                | Skill                             |
| -------------------------------------------------------- | --------------------------------- |
| The construct is not yet decided — start here            | java-concurrency                  |
| Correctness, visibility, happens-before                  | java-memory-model                 |
| Fan-out with failure propagation                         | structured-concurrency            |
| Request-scoped context without ThreadLocal               | scoped-values                     |
| Migrating off platform threads or a reactive stack       | virtual-thread-migration          |
| Sizing pools and thread counts                           | thread-sizing-and-virtual-threads |
| Executor lifecycle and shutdown                          | executors-and-task-lifecycle      |
| Cancellation and interruption                            | cancellation-and-interruption     |
| Timeouts and deadline propagation                        | timeouts-and-deadlines            |
| Composing asynchronous stages                            | completablefuture-composition     |
| A live system is stuck or slow and threads are suspected | concurrency-diagnostics           |

## Diagnosing

| Situation                                            | Skill                   |
| ---------------------------------------------------- | ----------------------- |
| A fault whose cause is unknown                       | debugging               |
| Latency or CPU regression, cause not yet established | java-performance        |
| GC confirmed as the cause                            | jvm-gc-tuning           |
| Memory growth; a heap dump to read                   | heap-dump-analysis      |
| Choosing what to measure and how                     | performance-methodology |

## Operating

| Situation                                  | Skill                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| A new failure mode needs to be visible     | metrics-and-cardinality                                                |
| Log structure and correlation              | structured-logging                                                     |
| Spans, context propagation                 | distributed-tracing-design                                             |
| Defining or alerting on an objective       | slo-and-alerting                                                       |
| Probes, draining, rolling deploys          | kubernetes-service-lifecycle                                           |
| Retry, backoff, circuit breaking, shedding | retries-and-backoff, circuit-breakers, rate-limiting-and-load-shedding |
| Safe-to-retry semantics                    | idempotency                                                            |

## Finishing

| Situation                                   | Skill                     |
| ------------------------------------------- | ------------------------- |
| Deciding which checks this change must pass | quality-gates             |
| Reviewing, or being reviewed                | code-review               |
| Bad news, a risk, a refusal, an escalation  | engineering-communication |
| About to claim work is complete             | coding-agent-discipline   |

## When two skills seem to disagree

Usually they are scoped to different contexts and the disagreement is in the reading. The
recurring pairs:

| Tension                                               | Resolution                                                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| "Extract for clarity" vs "extraction has a price"     | java-clean-code owns both; the test is whether the fragment stands alone                                         |
| "Prefer abstraction" vs "avoid premature abstraction" | java-dependency-inversion applies at boundaries you must substitute; java-dry-kiss-yagni applies everywhere else |
| "Wrap third-party types" vs "do not add indirection"  | Wrap what you need to substitute or isolate; call the rest directly                                              |
| "Readable code" vs "fast code"                        | java-clean-code yields to performance only with a measurement attached                                           |
| "Test everything" vs "do not test the framework"      | java-testing-strategy: test the risk, at the narrowest level it is real                                          |
| "Always TDD" vs "TDD is contextual"                   | tdd owns the decision; the loop is not the point, the feedback is                                                |
| "Fix what you touch" vs "minimise the diff"           | Opportunistic within the change's own footprint; report the rest                                                 |

If a genuine contradiction remains after reading both skills' boundary statements, that is a
defect in the skills, not a judgement call to make silently — say so (skill-engineering).
