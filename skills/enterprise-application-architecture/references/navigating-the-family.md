# Navigating This Family

## By the question you are asking

### Deciding

| Question                                         | Skill                               |
| ------------------------------------------------ | ----------------------------------- |
| How do I make and record this decision?          | `architecture-decision-making`      |
| Which patterns should this module use?           | `pattern-selection-and-composition` |
| Does the framework already provide this pattern? | `patterns-and-modern-frameworks`    |
| What kind of application is this?                | this skill, `application-types.md`  |

### Structure

| Question                                                 | Skill                       |
| -------------------------------------------------------- | --------------------------- |
| Where do the boundaries go, and which way do they point? | `layering-and-boundaries`   |
| Where do business rules live?                            | `domain-logic-organization` |
| What is the application service for?                     | `service-layer-design`      |
| Which small structural pattern do I need here?           | `enterprise-base-patterns`  |

### Persistence

| Question                                     | Skill                              |
| -------------------------------------------- | ---------------------------------- |
| How should code reach the database?          | `data-source-patterns`             |
| Why did the ORM do that?                     | `orm-behavioral-patterns`          |
| How do I map this association, key or value? | `orm-structural-mapping`           |
| How do I map this subtype hierarchy?         | `inheritance-mapping-strategies`   |
| Where does the mapping configuration live?   | `metadata-mapping`                 |
| How do I express this query?                 | `query-objects-and-specifications` |
| What belongs behind a repository?            | `repository-pattern`               |

### Behaviour under load and concurrency

| Question                                  | Skill                          |
| ----------------------------------------- | ------------------------------ |
| Where does the transaction start and end? | `enterprise-transactions`      |
| Two users overwrote each other            | `offline-concurrency-control`  |
| Why is this slow?                         | `architecture-and-performance` |

### Boundaries and the outside world

| Question                              | Skill                              |
| ------------------------------------- | ---------------------------------- |
| Should this be a separate service?    | `distribution-boundaries`          |
| What should the remote API look like? | `remote-facade-and-dto`            |
| How is a request routed and handled?  | `mvc-and-request-handling`         |
| How is the response produced?         | `view-and-representation-patterns` |
| Where does conversation state live?   | `session-state-strategies`         |

### Changing an existing system

| Question                                          | Skill                             |
| ------------------------------------------------- | --------------------------------- |
| Is something actually wrong here?                 | `enterprise-architecture-smells`  |
| How do I move from pattern A to pattern B?        | `architecture-refactoring-paths`  |
| How do I modernise a legacy system in production? | `legacy-enterprise-modernization` |
| How do I test that the architecture holds?        | `architecture-testing`            |

## By symptom

| Symptom                                         | Start at                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| A list screen is slow                           | `architecture-and-performance`, then `query-objects-and-specifications` |
| `LazyInitializationException`                   | `orm-behavioral-patterns`                                               |
| Two users overwrote each other                  | `offline-concurrency-control`                                           |
| A use case half-committed                       | `enterprise-transactions`                                               |
| Adding a field touches seven files              | `enterprise-architecture-smells`                                        |
| A service class has 3 000 lines                 | `service-layer-design`                                                  |
| Entities are anaemic                            | `domain-logic-organization`                                             |
| A column rename broke a client                  | `remote-facade-and-dto`                                                 |
| A deploy logged everyone out                    | `session-state-strategies`                                              |
| Services must be deployed in a fixed order      | `distribution-boundaries`                                               |
| The client makes five calls per screen          | `remote-facade-and-dto`                                                 |
| A schema change was discovered at runtime       | `metadata-mapping`                                                      |
| A bulk update defeated optimistic locking       | `offline-concurrency-control`                                           |
| Rules appear in a template                      | `view-and-representation-patterns`                                      |
| Cross-cutting code is copied into every handler | `mvc-and-request-handling`                                              |
| A rewrite is being proposed                     | `legacy-enterprise-modernization`                                       |
| Nobody knows why the system is built this way   | `architecture-decision-making`                                          |

## Boundaries between neighbours

These pairs are easy to confuse; the distinction decides which skill applies.

| Pair                                                                  | The distinction                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `enterprise-transactions` vs `offline-concurrency-control`            | Inside one transaction, or across a user's thinking time                       |
| `layering-and-boundaries` vs `distribution-boundaries`                | Source-code dependency direction, or a process boundary                        |
| `domain-logic-organization` vs `service-layer-design`                 | Where the rules live, or what wraps them                                       |
| `data-source-patterns` vs `repository-pattern`                        | How code reaches the database, or the collection abstraction over aggregates   |
| `orm-structural-mapping` vs `metadata-mapping`                        | What the mapping says, or where it is written and how it drifts                |
| `mvc-and-request-handling` vs `view-and-representation-patterns`      | Routing and handling, or producing the response                                |
| `remote-facade-and-dto` vs `rpc-and-api-contracts`                    | The operation's granularity and payload shape, or compatibility and versioning |
| `architecture-refactoring-paths` vs `legacy-enterprise-modernization` | One pattern change, or a programme over a system nobody fully knows            |
| `enterprise-architecture-smells` vs `architecture-decision-making`    | Is something wrong, or how to decide and record what to do                     |
| `architecture-and-performance` vs `performance-methodology`           | Attributing latency to architecture, or the investigation process itself       |

## Neighbours outside this family

This family stops where these begin:

- `performance-methodology`, `latency-statistics`, `java-performance`, `jvm-gc-tuning` —
  performance investigation, statistics and runtime behaviour.
- `littles-law-and-queueing`, `connection-pool-sizing`, `universal-scalability-law` — the
  arithmetic behind capacity and pool sizing.
- `consistency-models`, `delivery-semantics`, `idempotency`, `failure-models` — distributed
  systems fundamentals that the distribution skills depend on.
- `rpc-and-api-contracts`, `timeouts-and-deadlines`, `retries-and-backoff`,
  `concurrency-limiting-and-bulkheads` — the mechanics of a remote call once the boundary
  exists.
- `caching-strategies`, `stateless-service-design`, `sharding-and-partitioning` — the
  operational patterns that sit beside these architectural ones.
- `skill-engineering` — for writing or reviewing a skill in this family.

## A reading order for someone new to the family

1. This skill, for the forces and the decision order.
2. `domain-logic-organization` — the highest-consequence decision.
3. `data-source-patterns` and `orm-behavioral-patterns` — what the persistence layer
   actually does.
4. `enterprise-transactions` — the boundary everything else assumes.
5. `pattern-selection-and-composition` — putting the pieces together.
6. `enterprise-architecture-smells` — recognising when they have been put together badly.

The rest are consulted by question, not read in sequence.
