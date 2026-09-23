# In-process state inventory

Use the relevant rows for a narrow question, or a full inventory for a service-wide scaling
audit. Each row suggests state to inspect, possible failure, a discovery shape and a placement
option. Classifications describe separate dimensions; derivable state can still influence an
authoritative decision while its source is unavailable.

## The classification

- **Derivable** — reconstructible from an authoritative source; verify freshness, rebuild cost
  and availability/security consequences before declaring loss harmless.
- **Per-request** — intended to end with the request; inspect escaping references, async work
  and effects already committed or acknowledged.
- **Authoritative** — a copy or protocol owns a correctness decision. Identify its permitted
  decisions, readers/writers and consistency scope independently of whether another durable
  copy exists. A durable replica or temporarily trusted cache can still exercise local authority;
  shared or partitioned/replicated ownership needs an explicit divergence/recovery contract.

Ask what changes if this instance is lost, if copies disagree, and while state is reconstructed.
An abrupt permanent-loss thought experiment is useful, but cannot establish divergence safety,
acceptable rebuild load or timely recovery on its own.

## The table

| State in the process                        | Class                  | Potential failure                                                                                           | How to find it                                                           | Where it goes                                                 |
| ------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `HttpSession` attributes                    | authority-dependent    | Request lands on another replica; the user is logged out or the wizard restarts                             | `setAttribute(`, `@SessionAttributes`, `@SessionScope`                   | Spring Session store, or a token — see `session-placement.md` |
| Local cache (Caffeine, `ConcurrentHashMap`) | derivable              | Replicas can disagree for an unbounded interval without expiry/invalidation                                 | `Caffeine.newBuilder`, `@Cacheable` on a local cache manager             | Stays if bounded with declared staleness; shared L2 if needed |
| Rate-limit / quota counter                  | scope-dependent        | Fleet quota becomes separate per-instance allowances; protective local cap may be intended                  | `AtomicLong` or `LongAdder` field compared against a threshold           | Name local scope or use shared/escrow budget                  |
| Idempotency / dedup map                     | authority-dependent    | Local dedup misses another replica/restart; effect safety depends on the actual protocol                    | `Set<String> seen`, `Map<String, Result>` keyed by a request id          | Repeat-safe effect or durable claim/recovery (`idempotency`)  |
| `@Scheduled` job                            | effect-dependent       | Enabled schedule registrations multiply by bean/context; duplicate effect may or may not be safe            | `@Scheduled`, `ScheduledExecutorService`, `TaskScheduler`                | Partition/idempotency or coordinated scheduler/election       |
| One-time startup work (`ApplicationRunner`) | effect-dependent       | Runs per replica/restart; migration or side effect duplicates                                               | `ApplicationRunner`, `CommandLineRunner`, `@PostConstruct` doing I/O     | Idempotent bootstrap or externally coordinated migration/job  |
| Local file / `java.io.tmpdir`               | durability-dependent   | Follow-up on another/replaced instance cannot find ephemeral file                                           | `Files.write`, `new File(`, `createTempFile`, `MultipartFile.transferTo` | Finish in request or use declared durable/shared storage      |
| In-memory queue / unbounded `BlockingQueue` | acceptance-dependent   | Sole accepted-work record can disappear on replacement; durable replay or accepted best-effort loss differs | `LinkedBlockingQueue` field, `executor.submit` after responding          | Broker/outbox and durable ack when promised; name loss policy |
| Sequence / ID generator counter             | design-dependent       | Identical unnamespaced seeds collide; per-node/epoch scheme may be safe                                     | `AtomicLong` used to build an identifier                                 | Prove node/epoch uniqueness or use DB/standard ID scheme      |
| WebSocket / SSE registry                    | local live connections | A push from another replica reaches nobody                                                                  | `Map<UserId, WebSocketSession>`, `SseEmitter` registry                   | A broker fan-out; the registry stays local per instance       |
| Feature-flag or config snapshot             | derivable              | Missed refreshes or startup-only snapshots can leave replicas on different config indefinitely              | `@RefreshScope`, a field loaded once at startup                          | Stays if freshness/failure policy fits; observe revision/age  |
| `ThreadLocal` set on a request              | per-request            | Not a replica problem — a **leak** problem: on a pooled platform thread it survives into the next request   | `ThreadLocal` without a `remove()` in a `finally`                        | Clear it, or use a request-scoped bean / `ScopedValue`        |
| Connection pools, buffers, JIT state        | derivable              | Cold recovery, reconnect load and in-flight transaction outcomes need a policy                              | —                                                                        | Stays                                                         |

## Grep pass

```bash
# Fleet-wide state hiding in singletons
rg -n 'static\s+(final\s+)?(Map|Set|List|AtomicLong|AtomicInteger|LongAdder)\b' src/main/java

# Potentially repeated work; inspect actual registrations and effect contract
rg -n '@Scheduled|ApplicationRunner|CommandLineRunner|ScheduledExecutorService' src/main/java

# State that dies with the pod
rg -n 'java\.io\.tmpdir|createTempFile|transferTo\(|new FileOutputStream' src/main/java

# Servlet session usage
rg -n 'setAttribute\(|@SessionScope|@SessionAttributes|HttpSession' src/main/java
```

A hit is a question, not a defect. `static final Map` used as an immutable lookup table built
at class initialisation is fine; the same declaration mutated on the request path requires authority and concurrency analysis.
Read both writers and consumers, not only the declaration.

For configuration snapshots, identify the actual update trigger and each instance's applied
revision/last successful refresh. A nominal interval does not bound failed or missed refreshes.
Spring Cloud 4.2's Config Client does not poll by default; `@RefreshScope` caches bean targets
until invalidated, then reconstructs them on use. Refreshing A does not establish that B received
or applied the update. A cosmetic flag may tolerate old values; a flag controlling protected
actions must obey its authority/freshness policy when stale or unavailable. Retain local snapshots
when that contract fits; neither the annotation nor shared configuration storage proves convergence.

## False positives — in-process state that is not a violation

- **A bounded local cache with a TTL.** Valid only with a reconstruction source and acceptable
  freshness/loss policy. TTL does not prove durability or bound source lag, refresh failures
  and invalidation races; route those mechanisms to `caching-strategies`.
- **Request-scoped and transaction-scoped objects.** Scope conventions do not prevent Java
  references escaping into static fields or background tasks. Verify ownership, cleanup and
  transaction boundaries; a transaction need not coincide with one HTTP request.
- **A `ScopedValue` binding for per-request context.** Bound for the dynamic extent of one
  call and inherited through supported structured task scopes, not arbitrary executor tasks.
  The binding ends, but referenced mutable objects can escape. Java 25 makes this API final;
  preserve an older project's baseline rather than introducing preview APIs implicitly.
- **A metrics registry.** Per-instance by construction. Aggregation happens in the metrics
  backend, and combining percentiles across replicas is `latency-statistics`, not a
  statelessness problem.
- **A connection pool.** Per-instance and derivable, but it multiplies: N replicas open N
  pools against one database. That is capacity, not correctness — `connection-pool-sizing`.

## Exercising the inventory

Review plus targeted runs can reveal omissions; no small set proves the inventory complete.
Select scenarios needed for the actual guarantee, reuse adequate evidence and run only in an
isolated or authorized environment. A narrow explanation need not run this whole matrix.

1. **Explicit cross-replica journey and kill/restart.** Address instances directly or attach
   instance IDs so setup runs on A and continuation on B; random balancing is insufficient.
   Kill A after acceptance and during in-flight work. A failure is evidence to classify: it
   may be an accepted correctness loss, a session availability contract, or missing durability.
2. **The idempotency probe.** Send the same logical request twice with the same key, forcing
   the two attempts onto different instances. Verify the promised state/effect/response
   equivalence and recovery window; one non-repeatable effect is required where that is the
   contract. Natural state idempotence need not mean one physical attempt.

3. **Divergence and recovery.** Update authority, partition invalidation/config delivery, and
   verify applied revisions and stale/unavailable behavior on named instances. Repair delivery
   and verify the promised convergence. When claiming full-fleet cold recovery, cover that population
   and measure rebuild/RTO plus shared-dependency surge; narrower replacement evidence has narrower scope.
4. **Rolling mixed version.** Alternate requests between old/new instances and test session,
   cache serialization, tokens, local files and accepted queues through rollback.

## Inventory fields

For each relevant item record owner, scope (request/instance/key/fleet), durable copy, consistency,
maximum staleness, loss behavior, reconstruction source/time, size/cardinality bound, security
classification and shutdown handoff. “Map” or “Redis” is an implementation, not a state model.

## Primary references

- [Kubernetes 1.34 volumes](https://v1-34.docs.kubernetes.io/docs/concepts/storage/volumes/) — Pod lifetime versus container restarts; inspect persistent mounts separately.
- [Java 25 ScopedValue](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ScopedValue.html) — dynamic binding lifetime, structured inheritance and mutable values.
- [Spring 6.2.12 scheduling](https://github.com/spring-projects/spring-framework/blob/v6.2.12/framework-docs/modules/ROOT/pages/integration/scheduling.adoc) — repeatable declarations and multiple bean instances; verify the deployed registration/coordination configuration.
- [Spring Cloud 4.2 context refresh](https://docs.spring.io/spring-cloud-commons/reference/4.2/spring-cloud-commons/application-context-services.html) — explicit refresh triggers and cached bean targets; inspect the installed version and update delivery.
