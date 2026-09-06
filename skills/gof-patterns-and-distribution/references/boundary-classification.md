# Boundary classification

All twenty-three, by where their guarantees hold, with what a boundary crossing requires.

## Process-local — the guarantee stops at the JVM

| Pattern       | What is local                  | What people wrongly assume          | The distributed answer                                       |
| ------------- | ------------------------------ | ----------------------------------- | ------------------------------------------------------------ |
| **Singleton** | One instance per class loader  | One instance per cluster            | Leader election with fencing, a lease, or idempotency        |
| **Flyweight** | Shared references              | A shared cache across nodes         | A distributed cache — different pattern, invalidation policy |
| **Iterator**  | Traversal state                | A stable view of a changing source  | Cursor/keyset/offset chosen for access and consistency needs |
| **Memento**   | Encapsulated restoration state | Arbitrary persistence is compatible | Snapshot format, consistency and unknown-version policy      |

**Singleton** can hide a scope mismatch. A process-local rate limiter, connection pool,
sequence generator or cache warmer becomes N
of them the day a second replica starts:

```text
maxPoolSize 20 × 8 replicas = 160     possible app pool capacity; DB limit assumed 100
rate limit 100/s × 8        = 800/s   aggregate configured allowance, not measured traffic
"run once at startup" × 8   = 8       runs; concurrent only if lifetimes overlap
```

The examples assume eight active replicas and one pool/limiter/job each. Model rollout overlap,
sidecars and other clients; actual use may be lower and one replica can also exhaust resources.
Write assumptions beside each bound (`gof-singleton`, `connection-pool-sizing`).

**Flyweight** cannot cross a boundary by construction: it shares references, and references do not
serialise. Each node interns its own copies. A "distributed flyweight" is a cache, with all the
questions a cache has — invalidation, staleness, a network hop per miss, and a stampede when it
empties (`caching-strategies`).

**Memento** can also be persisted, but opacity does not establish format compatibility, snapshot
consistency or recovery. Define schema identity (field or envelope), migration and unsupported-version
behavior. Tolerating an unknown value is not always safe for restoration (`gof-memento`).

## Boundary — the pattern manages a seam

| Pattern     | Its job at the seam                                | The hazard                                             |
| ----------- | -------------------------------------------------- | ------------------------------------------------------ |
| **Adapter** | Where a foreign model, vocabulary and failure stop | Forwarding the vendor's exception; missing timeouts    |
| **Proxy**   | Standing in for the subject                        | Making a network call look like a method call          |
| **Facade**  | Coarse operations                                  | Fan-out with no deadline and no partial-failure result |
| **Bridge**  | Backends behind one contract                       | An interface designed against the in-memory backend    |

**Adapter** maps foreign failure/schema semantics and enforces the remaining deadline from the
owning call context. Retry safety depends on operation effects, not merely transient/permanent
exception labels. Unknown enum behavior belongs to the accepted boundary contract (`gof-adapter`).

**Proxy** is the pattern most able to hide a boundary, and the failure is architectural rather than
local:

```text
for (Order o : orders) enrich(o, directory.byId(o.customerId()));
    → 2 000 sequential HTTP calls from a loop that reads like field access
```

Consider bulk contract changes or justified batching/caching in the client. `byIds(Set, Deadline)`
still needs maximum batch/response sizes, missing-key semantics and bounded parallelism; a method
name alone does not bound cost (`gof-proxy`, `rpc-and-api-contracts`).

**Bridge** needs a contract every supported backend can honor. Separate exists/read/write calls
can race locally too. Inspect atomicity, conditional writes and measured call granularity; introduce
bulk operations when workload evidence needs them rather than speculating about every backend
(`gof-bridge`).

**Facade**'s remote form makes three decisions that must be explicit: sequential or concurrent
(ideal serial latency sums service times; concurrent latency also includes scheduling, queues and
concurrency limits), what a partial failure returns, and how one deadline is shared
across several calls (`scatter-gather`, `structured-concurrency`).

## Interaction — the pattern shapes who talks to whom

| Pattern      | Distributed form  | Must be added                                                                   |
| ------------ | ----------------- | ------------------------------------------------------------------------------- |
| **Command**  | A message         | Schema identity, staleness, delivery/effect policy and terminal outcome         |
| **Observer** | Publish/subscribe | Delivery/ordering scope, failure handling and any required transactional bridge |
| **Mediator** | Orchestrator      | Required durable progress, deadlines, semantic undo where needed, availability  |
| **Chain**    | Workflow          | Per-step failure, redelivery semantics, partial-effect handling                 |

**Command** crossing a boundary becomes a versioned contract with a future version of your own
code. Define wire/schema identity (a field or envelope), compatibility and unknown-value behavior,
effect deduplication where required, and a staleness rule (a command released from a queue after a six-hour outage may no
longer be appropriate); and a terminal path for permanent failures, or one poison message blocks a
partition forever (`gof-command`, `poison-messages-and-dlq`).

**Observer** changes six properties at once, which is why moving a listener to a broker is a
redesign and not a refactor:

```text
                In-process              Over a broker
thread          API/executor-defined    the consumer's execution context
transaction     API/context-defined     usually separate; needs an explicit bridge
ordering        implementation-defined broker/protocol/topology-specific
delivery        in memory               configured broker semantics
failure         policy-defined          acknowledgement/retry/terminal policy
schema          a Java type             a versioned contract
```

When committed changes must reliably publish, an outbox is one bridge: write the event in the same
transaction as state and let a relay forward it, allowing redelivery. Event sourcing or supported
transactional integration may meet other contracts. Publishing to a non-enlisted broker inside a transaction that then rolls back — or
after it commits, from a process that dies — is a dual write, and it loses or invents events
(`gof-observer`, `event-driven-architecture`).

**Mediator** can implement orchestration. If progress must survive restart, persist it and define
delivery/recovery. Calls can time out after taking effect; compensation is semantic undo where
needed, not automatic rollback. Dependent progress may wait for orchestrator recovery. Choreography
distributes protocol state and still needs explicit cancellation and observability; broker/storage
can remain shared dependencies. Choose by protocol requirements (`gof-mediator`).

**Chain** across services needs workflow contracts. Replay starts at the acknowledged/checkpointed
unit, not necessarily stage one; inspect which effects can repeat. Atomically couple progress with
local effects or use deduplication/idempotency for ambiguous outcomes. Propagate request budgets;
detached durable workflows instead need their own deadline/cancellation contract
(`cancellation-and-interruption`).

## Algorithm — largely unaffected, with three exceptions

| Pattern             | Unaffected              | The exception                                                                |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| **Strategy**        | Its structure           | The _choice_ of partitioner, serialiser or retry policy is system-wide       |
| **State**           | The transition function | Persistence where required; only exposed state names become public contracts |
| **Template Method** | The skeleton            | Coordinate remaining budget/outcome policy with the transport adapter        |
| **Visitor**         | The dispatch            | The element set becomes a versioned contract; unknown types must be decided  |

**Strategy**'s exception matters more than it looks. Several of the most consequential choices in a
distributed system are strategies chosen by configuration:

```text
partitioning strategy   determines ordering guarantees
serialisation strategy  determines forward/backward compatibility
retry policy            determines amplification under failure
load-balancing strategy determines tail latency
```

Changing one is a migration with a compatibility window, not a configuration flip. Repartitioning a
topic changes which events are ordered relative to each other, and consumers that relied on that
order break (`message-ordering-and-partitioning`).

**Visitor**'s exception: a fold over a structure received from another service will meet a node type
it does not know. "Skip it" is rarely safe — a filter that ignores an unknown node matches more than
it should, and a pricing fold drops a charge. Reject, or model an explicit `Unknown` variant so
every operation must state what it does about it (`gof-visitor`).

## Other local roles

The remaining seven patterns mostly retain their local roles; remote participation adds contracts:

| Pattern          | Primary class | Boundary consideration                                                            |
| ---------------- | ------------- | --------------------------------------------------------------------------------- |
| Abstract Factory | Process-local | Family compatibility and versioned backend capabilities                           |
| Factory Method   | Process-local | Creator remains local; created client needs remote lifecycle/failure contracts    |
| Builder          | Process-local | Local assembly does not make remote validation or effects atomic                  |
| Prototype        | Process-local | Copy format, identity and aliasing; no shared references across processes         |
| Decorator        | Boundary      | Retry safety, deadline/context propagation and observable composition order       |
| Composite        | Interaction   | Remote traversal may fan out; bound depth, calls, concurrency and partial results |
| Interpreter      | Algorithm     | Versioned expression semantics, validation and resource bounds before evaluation  |

## The escalation ladder

```text
A class                 → a design pattern applies
A package/module        → component design; the pattern is inside it
A release unit          → versioning and compatibility appear
A process               → serialisation, latency, partial failure
Several processes       → ordering, idempotency, consensus
Several regions         → partitions between them; consensus gets expensive
```

Each broader scope adds contracts to check; renaming a class supplies none of them. Retain relevant
local correctness checks and add the operational analysis (`distribution-boundaries`).

Sources: [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html),
[Saga coordination and limitations](https://microservices.io/patterns/data/saga.html), and
[Java 17 Flow contracts](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/Flow.html).
