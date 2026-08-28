# In-process state inventory

Run this over one service before raising `replicas`. Each row is a kind of in-process state,
what it is once you classify it by consequence of loss, what breaks at `replicas > 1`, the
shape that finds it, and where it goes.

## The classification

- **Derivable** — reconstructible from an authoritative source. Loss costs latency only.
- **Per-request** — created and discarded inside one request. Never survives to matter.
- **Authoritative** — nothing else holds it. Loss changes an outcome. Must leave the process.

The whole audit is applying one question to each field: _SIGKILL now, never restart — is any
outcome now wrong?_

## The table

| State in the process                        | Class         | Failure at replicas > 1                                                                                   | How to find it                                                           | Where it goes                                                    |
| ------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `HttpSession` attributes                    | authoritative | Request lands on another replica; the user is logged out or the wizard restarts                           | `setAttribute(`, `@SessionAttributes`, `@SessionScope`                   | Spring Session store, or a token — see `session-placement.md`    |
| Local cache (Caffeine, `ConcurrentHashMap`) | derivable     | Replicas disagree after an invalidation; with no TTL, permanently                                         | `Caffeine.newBuilder`, `@Cacheable` on a local cache manager             | Stays, but bounded and with a TTL; shared L2 if divergence hurts |
| Rate-limit / quota counter                  | authoritative | Effective limit is N × configured; no error anywhere                                                      | `AtomicLong` or `LongAdder` field compared against a threshold           | `rate-limiting-and-load-shedding` — shared budget or reconciled  |
| Idempotency / dedup map                     | authoritative | Duplicates pass whenever the retry lands on a different replica                                           | `Set<String> seen`, `Map<String, Result>` keyed by a request id          | Durable table with a unique constraint (`idempotency`)           |
| `@Scheduled` job                            | authoritative | Runs N times concurrently, over the same rows                                                             | `@Scheduled`, `ScheduledExecutorService`, `TaskScheduler`                | `leader-election`, or a lease with a TTL                         |
| One-time startup work (`ApplicationRunner`) | authoritative | Runs once per replica per deploy, concurrently                                                            | `ApplicationRunner`, `CommandLineRunner`, `@PostConstruct` doing I/O     | A migration tool with its own lock, or a job outside the pod     |
| Local file / `java.io.tmpdir`               | authoritative | The follow-up request lands elsewhere and the file does not exist                                         | `Files.write`, `new File(`, `createTempFile`, `MultipartFile.transferTo` | Object storage, or complete the work inside one request          |
| In-memory queue / unbounded `BlockingQueue` | authoritative | Work accepted then lost on any pod replacement, with a 2xx already returned                               | `LinkedBlockingQueue` field, `executor.submit` after responding          | A broker or an outbox table; ack only after durable write        |
| Sequence / ID generator counter             | authoritative | Two replicas mint the same id                                                                             | `AtomicLong` used to build an identifier                                 | Database sequence, or UUIDv7 / a partitioned generator           |
| WebSocket / SSE registry                    | authoritative | A push from another replica reaches nobody                                                                | `Map<UserId, WebSocketSession>`, `SseEmitter` registry                   | A broker fan-out; the registry stays local per instance          |
| Feature-flag or config snapshot             | derivable     | Replicas act on different config for as long as the refresh interval                                      | `@RefreshScope`, a field loaded once at startup                          | Stays, but bound the staleness and make it observable            |
| `ThreadLocal` set on a request              | per-request   | Not a replica problem — a **leak** problem: on a pooled platform thread it survives into the next request | `ThreadLocal` without a `remove()` in a `finally`                        | Clear it, or use a request-scoped bean / `ScopedValue`           |
| Connection pools, buffers, JIT state        | derivable     | None. This is what "warm" means                                                                           | —                                                                        | Stays                                                            |

## Grep pass

```bash
# Fleet-wide state hiding in singletons
rg -n 'static\s+(final\s+)?(Map|Set|List|AtomicLong|AtomicInteger|LongAdder)\b' src/main/java

# Work that is meant to happen once, that will happen N times
rg -n '@Scheduled|ApplicationRunner|CommandLineRunner|ScheduledExecutorService' src/main/java

# State that dies with the pod
rg -n 'java\.io\.tmpdir|createTempFile|transferTo\(|new FileOutputStream' src/main/java

# Servlet session usage
rg -n 'setAttribute\(|@SessionScope|@SessionAttributes|HttpSession' src/main/java
```

A hit is a question, not a defect. `static final Map` used as an immutable lookup table built
at class initialisation is fine; the same declaration written to on the request path is the
bug. Read the writers, not the declaration.

## False positives — in-process state that is not a violation

- **A bounded local cache with a TTL.** Derivable by definition. Divergence within the TTL is
  the price you already agreed to pay; if it is not acceptable, the problem is the TTL, and
  the design is `caching-strategies`.
- **Request-scoped and transaction-scoped objects.** They cannot outlive the request that
  made them, so no other replica can observe them.
- **A `ScopedValue` binding for per-request context.** Bound for the dynamic extent of one
  call and inherited by forked subtasks; it is per-request state with an enforced end.
- **A metrics registry.** Per-instance by construction. Aggregation happens in the metrics
  backend, and combining percentiles across replicas is `latency-statistics`, not a
  statelessness problem.
- **A connection pool.** Per-instance and derivable, but it multiplies: N replicas open N
  pools against one database. That is capacity, not correctness — `connection-pool-sizing`.

## Proving the inventory is complete

Configuration review does not prove this; two runs do.

1. **Two replicas, affinity off, one killed mid-suite.** Deploy two instances behind a
   balancer with session affinity disabled, run the functional suite, and `kill -9` one
   instance halfway through. Anything that fails is authoritative state that never left the
   process. Round-robin alone is not enough — a suite that happens to pass on either replica
   independently still passes; the kill is what forces the state question.
2. **The idempotency probe.** Send the same logical request twice with the same key, forcing
   the two attempts onto different instances. Exactly one effect must be observable. This is
   the check most likely to fail on a service that "already has idempotency".
