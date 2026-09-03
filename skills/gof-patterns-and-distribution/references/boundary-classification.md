# Boundary classification

All twenty-three, by where their guarantees hold, with what a boundary crossing requires.

## Process-local — the guarantee stops at the JVM

| Pattern       | What is local                 | What people wrongly assume          | The distributed answer                                       |
| ------------- | ----------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| **Singleton** | One instance per class loader | One instance per cluster            | Leader election with fencing, a lease, or idempotency        |
| **Flyweight** | Shared references             | A shared cache across nodes         | A distributed cache — different pattern, invalidation policy |
| **Iterator**  | A cursor in this process      | A stable view of the source         | Keyset pagination, bounded, with stated consistency          |
| **Memento**   | Opaque, transient state       | It can be written to disk unchanged | A versioned snapshot with a tolerant reader                  |

**Singleton** carries the most expensive misunderstanding, because it fails silently and only at
scale. A process-local rate limiter, connection pool, sequence generator or cache warmer becomes N
of them the day a second replica starts:

```text
maxPoolSize 20 × 8 replicas = 160     database max_connections = 100
rate limit 100/s × 8        = 800/s   at the dependency
"run once at startup" × 8   = 8       concurrent warm-ups
```

None of these fail in a single-replica environment. Write the multiplied figure beside every
process-local limit (`gof-singleton`, `connection-pool-sizing`).

**Flyweight** cannot cross a boundary by construction: it shares references, and references do not
serialise. Each node interns its own copies. A "distributed flyweight" is a cache, with all the
questions a cache has — invalidation, staleness, a network hop per miss, and a stampede when it
empties (`caching-strategies`).

**Memento** becomes a snapshot the moment it is persisted, and a snapshot needs what a memento
deliberately lacks: a version field, a schema, and a defined behaviour when read by an older
version. The failure is a checkpoint written without a version, unreadable after the first shape
change (`gof-memento`).

## Boundary — the pattern manages a seam

| Pattern     | Its job at the seam                                | The hazard                                             |
| ----------- | -------------------------------------------------- | ------------------------------------------------------ |
| **Adapter** | Where a foreign model, vocabulary and failure stop | Forwarding the vendor's exception; missing timeouts    |
| **Proxy**   | Standing in for the subject                        | Making a network call look like a method call          |
| **Facade**  | Coarse operations                                  | Fan-out with no deadline and no partial-failure result |
| **Bridge**  | Backends behind one contract                       | An interface designed against the in-memory backend    |

**Adapter** gains three duties at a network seam that it does not have locally: it owns the
timeout (the port cannot express "may hang forever"), it classifies failures as transient or
permanent (only it knows the vendor's taxonomy), and it decides what an unknown enum value from a
newer peer means (`gof-adapter`).

**Proxy** is the pattern most able to hide a boundary, and the failure is architectural rather than
local:

```text
for (Order o : orders) enrich(o, directory.byId(o.customerId()));
    → 2 000 sequential HTTP calls from a loop that reads like field access
```

The fix is never in the proxy; it is in the contract. `byIds(Set, Deadline)` returning a map makes
the granularity visible and the cost bounded (`gof-proxy`, `rpc-and-api-contracts`).

**Bridge**'s implementor interface must be designed for its worst backend, not its most convenient
one. An interface with `exists(Key)`, `read(Key)`, `write(Key, byte[])` is fine over a local file
system and catastrophic over object storage when the abstraction loops. If any backend may be
remote, the bulk operation belongs in the interface from the start (`gof-bridge`).

**Facade**'s remote form makes three decisions that must be explicit: sequential or concurrent
(latency is the sum or the maximum), what a partial failure returns, and how one deadline is shared
across several calls (`scatter-gather`, `structured-concurrency`).

## Interaction — the pattern shapes who talks to whom

| Pattern      | Distributed form  | Must be added                                                                |
| ------------ | ----------------- | ---------------------------------------------------------------------------- |
| **Command**  | A message         | Stable name, version, idempotency key, staleness rule, dead-letter path      |
| **Observer** | Publish/subscribe | Outbox, idempotent consumers, DLQ, lag alerting, per-partition ordering only |
| **Mediator** | Orchestrator      | Durable state, per-step timeout, compensation, an availability budget        |
| **Chain**    | Workflow          | Per-step failure, redelivery semantics, partial-effect handling              |

**Command** crossing a boundary becomes a versioned contract with a future version of your own
code. The five additions: a wire name decoupled from the class name; an explicit version field; a
tolerant reader; a staleness rule (a command released from a queue after a six-hour outage may no
longer be appropriate); and a terminal path for permanent failures, or one poison message blocks a
partition forever (`gof-command`, `poison-messages-and-dlq`).

**Observer** changes six properties at once, which is why moving a listener to a broker is a
redesign and not a refactor:

```text
                In-process              Over a broker
thread          the publisher's         the consumer's, elsewhere
transaction     API/context-defined     usually separate; needs an explicit bridge
ordering        implementation-defined broker/protocol/topology-specific
delivery        in memory               configured broker semantics
failure         policy-defined          acknowledgement/retry/terminal policy
schema          a Java type             a versioned contract
```

The transactional bridge is an outbox: write the event in the same transaction as the state change
and let a relay forward it. Publishing to a broker inside a transaction that then rolls back — or
after it commits, from a process that dies — is a dual write, and it loses or invents events
(`gof-observer`, `event-driven-architecture`).

**Mediator** becomes an orchestrator, and the differences are operational: it must survive its own
restart, so its position in the flow is a row rather than a field; every call to a participant can
time out; rollback becomes compensation; and its availability multiplies into everyone's. The
alternative — choreography, where participants react to each other's events — removes the hub and
the bottleneck, and removes the single place where the flow is readable and cancellable. Both are
defensible; the choice must be stated (`gof-mediator`).

**Chain** across services is a workflow. Two consequences: with at-least-once delivery, a failure at
stage three re-runs stages one and two on redelivery, so either those stages are idempotent or
their effects are deferred to the end; and an expired deadline must propagate, or the chain keeps
working for a caller that has gone (`cancellation-and-interruption`).

## Algorithm — largely unaffected, with three exceptions

| Pattern             | Unaffected              | The exception                                                                 |
| ------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| **Strategy**        | Its structure           | The _choice_ of partitioner, serialiser or retry policy is system-wide        |
| **State**           | The transition function | It becomes durable, resumable, and its state names become a public vocabulary |
| **Template Method** | The skeleton            | A remote step's timeout and failure classification belong to the template     |
| **Visitor**         | The dispatch            | The element set becomes a versioned contract; unknown types must be decided   |

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

## The escalation ladder

```text
A class                 → a design pattern applies
A package/module        → component design; the pattern is inside it
A release unit          → versioning and compatibility appear
A process               → serialisation, latency, partial failure
Several processes       → ordering, idempotency, consensus
Several regions         → partitions between them; consensus gets expensive
```

Each step down adds constraints the step above did not have, and none of them is reached by
renaming a class. When a design discussion moves from one row to the next, stop applying the
previous row's vocabulary (`distribution-boundaries`).
