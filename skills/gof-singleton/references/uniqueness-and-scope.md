# "There must be only one" — one per what?

Every singleton requirement is really a scope statement with the scope left out. Fill it in
before choosing a mechanism; the wrong row is the defect.

## The ladder

| Scope           | Mechanism that provides it                                                                  | What defeats it                                                                    |
| --------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Thread          | `ThreadLocal`, `ScopedValue`                                                                | Work handed to another thread; a pooled thread not cleaned up                      |
| Class loader    | `static final` field                                                                        | A second class loader — app servers, plugin systems, hot reload, some test runners |
| Process (JVM)   | A static field _if_ one class loader; a DI container's singleton scope _if_ one context     | A second application context (common in tests); a child class loader               |
| Container / pod | The process, restated                                                                       | A sidecar or second JVM in the same pod                                            |
| Node / host     | A file lock, a pid file, a bound port, a unix socket                                        | Containers with separate mount namespaces; the lock file surviving a crash         |
| Cluster         | Leader election (`leader-election`) or a lock with a lease (`distributed-locks-and-leases`) | Lease expiry under GC pause or network partition — two leaders, briefly            |
| Region / global | Consensus across zones, or a single-writer design                                           | Partitions between regions; latency making the design unusable                     |
| "The system"    | Not a primitive. Designed, and usually replaced by idempotency                              | The assumption that it exists                                                      |

Two rows deserve emphasis.

**Class loader, not JVM.** A `static` field is unique per class loader, and the same class loaded
by two loaders yields two independent "singletons" whose `instanceof` checks against each other
fail. This is a live concern for application servers, OSGi-style plugin systems, and test
frameworks that isolate class paths. It is also why an enum singleton's identity can surprise:
the enum constant is unique per loader, and serialisation across loaders does not preserve
identity.

**Cluster leadership is not exclusive.** Every practical leader election is a lease. A leader
whose process pauses (a long GC, a CPU-throttled container, a network partition) may still
believe it holds the lease after it has expired and another leader has taken over. Designs must
tolerate a brief overlap — via fencing tokens, or by making the operation idempotent — rather
than assume the lease guarantees exclusion (`distributed-failure-catalogue`).

## Requirements that look like singletons and are not

| Stated requirement                      | What it actually needs                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| "The nightly job must run once"         | A distributed lock around the job, or an idempotent job (`distributed-locks-and-leases`) |
| "Ids must be unique"                    | An id scheme that does not need coordination — UUIDv7, ULID, or a per-node prefix        |
| "Only one connection pool"              | One per process is correct; size it for N replicas (`connection-pool-sizing`)            |
| "Rate limit to 100 req/s"               | A shared limiter, or per-replica limits of 100/N (`rate-limiting-and-load-shedding`)     |
| "Cache must be consistent"              | A shared cache, or per-process caches with a TTL and accepted staleness                  |
| "Configuration loaded once"             | One bean; injection                                                                      |
| "The scheduler must not overlap itself" | A lock with `lockAtMostFor`, which is a different problem from cluster singularity       |

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
        → make it idempotent first (idempotency). A deduplication key
          beats a lock, because it survives the lock failing.

Work must happen once, duplicates are merely wasteful
        → a lease-based lock (ShedLock, Redis with a token, a DB row).
          Accept occasional double execution.

A single writer is needed for correctness
        → leader election with fencing tokens, and reject writes whose
          token is stale. Without fencing, the lease guarantees nothing.

A resource must be held by one process at a time
        → the resource itself should enforce it: a unique constraint, an
          advisory lock in the database, a queue with one consumer.
```

The last line is the most under-used. Pushing exclusivity into a system that already has
consensus — the database's unique index, a partitioned queue — is nearly always cheaper and more
reliable than building coordination beside it.

## Spring's singleton scope, precisely

`@Scope("singleton")` means _one instance per `ApplicationContext`_. Consequences worth knowing:

- Two contexts in one JVM produce two instances. Test suites routinely create several contexts;
  a bean caching state will not behave as one instance across them.
- The container controls creation order and destruction, so initialisation-order questions have
  an owner — unlike a static holder.
- Nothing reaches it statically, so the global-access half of the GoF pattern is absent. It is
  the lifecycle half only, and it is the recommended way to have one instance.
- A singleton-scoped bean holding mutable request state is still a bug — the scope says nothing
  about thread safety, and one bean serves every concurrent request
  (`java-dependency-inversion`).
