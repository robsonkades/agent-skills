# "There must be only one" — one per what?

Every singleton requirement is really a scope statement with the scope left out. Fill it in
before choosing a mechanism; the wrong row is the defect.

## The ladder

| Scope           | Mechanism that provides it                                                                  | What defeats it                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Thread          | ThreadLocal binding; ScopedValue binds dynamic context, not uniqueness                      | Work handed to another thread; a pooled thread not cleaned up                                     |
| Class loader    | `static final` field                                                                        | A second class loader — app servers, plugin systems, hot reload, some test runners                |
| Process (JVM)   | One defining class/static, or one bean definition per container                             | A second application context (common in tests); a child class loader                              |
| Container / pod | The process, restated                                                                       | A sidecar or second JVM in the same pod                                                           |
| Node / host     | OS-enforced lock/socket; pid file alone is not a lock                                       | Containers with separate mount namespaces; the lock file surviving a crash                        |
| Cluster         | Leader election (`leader-election`) or a lock with a lease (`distributed-locks-and-leases`) | Lease expiry under GC pause or network partition — stale actors may overlap without a fixed bound |
| Region / global | Consensus across zones, or a single-writer design                                           | Partitions between regions; latency making the design unusable                                    |
| "The system"    | Not a primitive. Designed, and usually replaced by idempotency                              | The assumption that it exists                                                                     |

Two rows deserve emphasis.

**Class loader, not JVM.** A `static` field is unique per class loader, and the same class loaded
by two loaders yields two independent "singletons" whose `instanceof` checks against each other
fail. This is a live concern for application servers, OSGi-style plugin systems, and test
frameworks that isolate class paths. It is also why an enum singleton's identity can surprise:
the enum constant is unique per loader, and serialisation across loaders does not preserve
identity.

**Election is not effect exclusion by itself.** Elections may use terms/quorums rather than
leases. A paused or partitioned former leader can continue acting on stale authority, with no
universal bound on the overlap. Have the effect-owning resource reject stale authority (for
example through fencing/epochs), and separately address duplicate effects. Idempotency does not
prevent conflicting distinct operations or provide leadership (`distributed-failure-catalogue`).
For a term/quorum election example, see [Raft §5.2](https://raft.github.io/raft.pdf); protecting
effects outside the replicated state machine still needs its own authority boundary.

## Requirements that look like singletons and are not

| Stated requirement                      | What it actually needs                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| "The nightly job must run once"         | Durable run identity/progress, idempotent effects and a scheduling/coordination policy |
| "Ids must be unique"                    | A collision policy: probabilistic IDs or coordinated unique node/range allocation      |
| "Only one connection pool"              | Pool per owned datasource/credentials/lifecycle; budget all pools and peak replicas    |
| "Rate limit to 100 req/s"               | Shared enforcement or allocated budgets accounting for bursts, skew and changing N     |
| "Cache must be consistent"              | Explicit consistency/invalidation policy; TTL alone is not coherence                   |
| "Configuration loaded once"             | One bean; injection                                                                    |
| "The scheduler must not overlap itself" | Local exclusion or distributed lease as scoped; expiry does not stop running work      |

The pattern in the right-hand column: **the requirement is about an effect, not an instance.**
Once restated as an effect, most of these dissolve into either idempotency or a per-replica
budget, both of which scale and neither of which needs a leader.

## Per-replica budgets — the arithmetic that gets forgotten

A process-local singleton multiplied by replicas is the most frequent production consequence of
this pattern:

```text
maxPoolSize: 20    ×  8 replicas  = 160 connections
database max_connections: 100     → refused connections after a scale-up

rate limiter: 100 rps (in-process)  ×  8 replicas = 800 rps at the dependency

warm-up job on startup (singleton per process) × 8 = 8 concurrent warm-ups
```

None of these fail in a single-replica environment, which is why they reach production. Whenever
a limit is configured in a process-local object, write the multiplied figure next to it.

## Choosing a distributed mechanism

```text
Work must happen exactly once, and duplicates are harmful
        → define the logical operation key and atomically couple deduplication
          with its effect/result, or reconcile unknown remote outcomes. A key
          alone and a lock alone do not guarantee exactly-once effects (idempotency).

Work must happen once, duplicates are merely wasteful
        → a lease-based lock (ShedLock, Redis with a token, a DB row).
          Accept occasional double execution.

A single writer is needed for correctness
        → leader election with fencing tokens, and reject writes whose
          token is stale. A lease alone cannot stop a paused stale writer.

A resource must be held by one process at a time
        → prefer enforcement at the resource. A unique constraint protects
          a key, not arbitrary work; advisory locks need cooperating users and
          correct lifetime. One active consumer can still redeliver work or leave
          a stale worker running after failover.
```

Match resource guarantees to the effect and failure model. A local constraint or queue assignment
does not imply consensus across deployments; route implementation to the coordination specialists.

## Spring's singleton scope, precisely

`@Scope("singleton")` means one instance per bean definition per container, as documented by
[Spring bean scopes](https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html).
Consequences worth knowing:

- Two definitions of one class can produce two instances even in one context. Child contexts may
  inherit a parent's instance or define another; inspect actual registration and lookup.
- The container controls creation order and destruction, so initialisation-order questions have
  an owner — unlike a static holder.
- Injecting it avoids a global accessor; a static ApplicationContext/service locator reintroduces
  global access despite the bean scope. Inspect callers rather than inferring this from annotations.
- A singleton-scoped bean holding mutable request state is still a bug — the scope says nothing
  about thread safety, and one bean serves every concurrent request
  (`java-dependency-inversion`).
