# Navigating This Family

## By the question you are asking

### Deciding

| Question                                         | Skill                               |
| ------------------------------------------------ | ----------------------------------- |
| How do I make and record this decision?          | `architecture-decision-making`      |
| What does an ambiguous quality requirement mean? | `architecture-characteristics`      |
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

| Question                                             | Skill                          |
| ---------------------------------------------------- | ------------------------------ |
| Where does the transaction start and end?            | `enterprise-transactions`      |
| Does stale state cross a transaction boundary?       | `offline-concurrency-control`  |
| Which architectural choice causes the measured cost? | `architecture-and-performance` |
| What explains an unlocalized performance problem?    | `performance-methodology`      |

### Boundaries and the outside world

| Question                              | Skill                              |
| ------------------------------------- | ---------------------------------- |
| Should this be a separate service?    | `distribution-boundaries`          |
| Who may act on this data?             | `java-application-security-basics` |
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

Symptoms are investigation leads, not defect verdicts. Confirm the affected operation and
actual boundary before choosing an owner; carry existing evidence forward and stop when the
question is resolved rather than reading the entire family.

| Symptom                                         | Start at                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| A list screen slows as query/call work grows    | `architecture-and-performance`, then `query-objects-and-specifications` |
| `LazyInitializationException`                   | `orm-behavioral-patterns`                                               |
| A client saves state read before another commit | `offline-concurrency-control`                                           |
| A use case half-committed                       | `enterprise-transactions`; apply the recovery fork below                |
| Another tenant's object can be read or changed  | `java-application-security-basics`                                      |
| Internal fields appear in an external response  | `remote-facade-and-dto`                                                 |
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
| `enterprise-transactions` vs `offline-concurrency-control`            | Reads/writes within each transaction, or stale state across transactions       |
| `enterprise-transactions` vs `distributed-transactions-and-sagas`     | One verified atomic resource scope, or durable recovery across separate owners |
| `layering-and-boundaries` vs `distribution-boundaries`                | Source-code dependency direction, or a process boundary                        |
| `domain-logic-organization` vs `service-layer-design`                 | Where the rules live, or what wraps them                                       |
| `data-source-patterns` vs `repository-pattern`                        | How code reaches the database, or the collection abstraction over aggregates   |
| `orm-structural-mapping` vs `metadata-mapping`                        | What the mapping says, or where it is written and how it drifts                |
| `mvc-and-request-handling` vs `view-and-representation-patterns`      | Routing and handling, or producing the response                                |
| `remote-facade-and-dto` vs `rpc-and-api-contracts`                    | The operation's granularity and payload shape, or compatibility and versioning |
| `architecture-refactoring-paths` vs `legacy-enterprise-modernization` | One pattern change, or a programme over a system nobody fully knows            |
| `enterprise-architecture-smells` vs `architecture-decision-making`    | Is something wrong, or how to decide and record what to do                     |
| `architecture-and-performance` vs `performance-methodology`           | Attributing latency to architecture, or the investigation process itself       |

### Route a partially completed use case

Carry the invariant, actual commit points, enlisted resources, observable intermediate states
and permitted recovery outcome into the handoff:

- Writes that should share one transaction: `enterprise-transactions` verifies effective
  enlistment and rollback. The same annotation or database address is not enough evidence.
- Local state plus publication intent: `delivery-semantics` checks durable intent and duplicate
  delivery; an outbox does not make the consumer's remote effect atomic with the local commit.
- Steps committed by separate owners: `distributed-transactions-and-sagas` compares an existing
  valid atomic scope, supported coordinated transactions and durable application recovery.
  Compensation is conditional on acceptable intermediate states and meaningful recovery, not
  the default merely because several services exist.

This fork locates the decision; return to the original use-case acceptance check instead of
expanding an orientation request into a saga implementation.

## Neighbours outside this family

This family stops where these begin:

- `java-concurrency` — shared-memory races and task lifecycles inside one JVM. Trace the
  state owner before treating a concurrency symptom as a database problem.
- `java-application-security-basics` — code-level authorization ownership and trusted identity;
  pass actors, resources, allowed operations and alternate entry paths. Full security architecture
  or deployment controls require the project's security owner; this entry point does not certify them.
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
2. `domain-logic-organization` — rule ownership; prioritise a fixed schema, consistency or
   deployment constraint first when it dominates the current decision.
3. `data-source-patterns` and `orm-behavioral-patterns` — what the persistence layer
   actually does.
4. `enterprise-transactions` — the boundary everything else assumes.
5. `pattern-selection-and-composition` — putting the pieces together.
6. `enterprise-architecture-smells` — recognising when they have been put together badly.

The rest are consulted by question, not read in sequence.

## Decision checks

These teaching cases are walkthrough/evaluation inputs, not executed behavioral evidence.

- **Same business unit, different resource scope:** two writes use a verified shared local
  transaction versus the second write committing in a partner service. Expected: investigate
  local rollback/enlistment in the first case and observable partial state/recovery ownership in
  the second. Failure: assume the caller's annotation covers the partner or mandate a saga
  without checking tolerated intermediate states and existing alternatives.
- **Hostile alternate entry path:** an authenticated tenant A supplies tenant B's order ID;
  HTTP rejects it, but an import job calls the same mutation without equivalent authorization.
  Expected: preserve the differing entry paths and trusted actor/resource evidence, route the
  protected-operation contract to the security owner, and request a negative authorization
  check for the bypass. Failure: treat login or the HTTP guard as proof of authorization, or
  redesign persistence without addressing the access decision.
- **Adequate simple module:** a public read-only reference-data module already meets its
  latency, schema and exposure contracts. Expected: explain and retain it; no new Domain Model,
  service split or access hierarchy is required by this routing exercise. Failure: impose a
  family-wide reference architecture merely because other modules are more complex.
- **Unresolved driver:** a new module is called "secure and scalable" without an affected
  operation, workload or access rule. Expected: inspect available requirements, ask only about
  consequential gaps and keep alternatives conditional. Failure: invent throughput/authorization
  policy or declare an architectural style necessary from those adjectives alone.

## Sources for routing boundaries

- [JLS 17, happens-before order](https://docs.oracle.com/javase/specs/jls/se17/html/jls-17.html#jls-17.4.5) defines ordering and visibility for shared-memory actions; this is a different contract from database isolation.
- [RFC 9110, If-Match](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1) describes client preconditions against overwriting changed state; the stale-client problem is not limited to human editing.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): map actors, resources and operations; verify authorization at the protected access, including negative cases.
- [OWASP Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html): use data flows and trust boundaries to locate security questions without prescribing one architecture.
- [Richardson: Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html): local transaction/publication intent and duplicate relay delivery are distinct from remote business completion.
