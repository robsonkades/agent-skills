# Framework execution models

Everything in this file is **framework** behaviour. None of it is something the Java platform
does on its own, and conflating the two is how "Java enables virtual threads by default"
enters a design document.

## Spring Boot (MVC)

`spring.threads.virtual.enabled=true` — opt-in on Java 21+, and still opt-in in Boot 4. It
can change several auto-configured components. Inspect the resolved Boot version, custom
beans and executor selection first; the table describes applicable defaults, not overrides:

| Component                            | Default (property off)                                        | With virtual threads on                                                                                    |
| ------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Servlet request handling             | container-specific worker pool                                | supported embedded containers can use virtual-thread execution; verify                                     |
| `applicationTaskExecutor` (`@Async`) | `ThreadPoolTaskExecutor`: 8 core threads, **unbounded queue** | `SimpleAsyncTaskExecutor` on virtual threads: **unbounded concurrency**                                    |
| `taskScheduler` (`@Scheduled`)       | `ThreadPoolTaskScheduler` (pool of 1 by default)              | `SimpleAsyncTaskScheduler`: separate threads for supported triggers; fixed-delay uses the scheduler thread |
| Kafka / AMQP listener containers     | platform threads                                              | verify listener-container executor separately; the property is not a blanket switch                        |

Three consequences worth stating out loud before flipping it:

- **A servlet worker-pool limit may stop being the admission limit.** Confirm the embedded
  server and Boot version rather than generalising Tomcat behaviour to Jetty or Undertow.
  Replace any removed bound with limits next to scarce resources and edge shedding.
- **The auto-configured `@Async` executor is unbounded by default.** A custom executor or
  `@Async` qualifier can select something else. `SimpleAsyncTaskExecutor` starts virtual
  threads as it is given work. Set `spring.task.execution.simple.concurrency-limit`
  (and `spring.task.scheduling.simple.concurrency-limit`) unless unbounded is genuinely
  intended, on Boot versions exposing those properties. The default concurrency-limit
  policy blocks submitters; do not use it from an event loop as if it were non-blocking
  rejection. Bound admission/waiters separately.
- **Scheduling semantics need revalidation.** Pool settings are ignored by the simple
  virtual-thread scheduler, and fixed-delay tasks have special handling. Test overlap for
  each trigger type and add an explicit single-flight guard when the job requires it; do not
  infer the guarantee from a historical pool size.

Verify rather than assume:

```java
@GetMapping("/whoami")
String whoami() {
    Thread t = Thread.currentThread();
    return t + " virtual=" + t.isVirtual();      // evidence for this sampled invocation
}
```

## Spring WebFlux

The common Reactor Netty deployment uses event loops; WebFlux also supports other servers
and explicitly configured blocking-controller execution. `spring.threads.virtual.enabled`
alone does not move every operator or handler to a virtual thread. Verify the actual server,
handler adapter and scheduler at each blocking call, including after operator handoffs.

If a WebFlux service must call one blocking dependency, this partial Reactor snippet shows
isolation (the JDBC call and types are placeholders):

```java
Mono.fromCallable(() -> jdbcClient.query(...))
    .subscribeOn(Schedulers.boundedElastic());   // never on the event loop
```

and then decide, separately, whether `boundedElastic` should itself run on virtual threads
(`reactor.schedulers.defaultBoundedElasticOnVirtualThreads=true`, Reactor 3.6.0+, Java 21+). The virtual-thread
implementation still uses the configured thread cap (default `10 × availableProcessors`)
and bounded deferred-task capacity; it changes the thread-per-task machinery, not the fact
that the scheduler is bounded. Those defaults are usually far too broad to protect a
specific database, so keep a resource-local limiter when that is the real constraint.

## Quarkus

Quarkus is reactive at the core (Vert.x + Mutiny) and lets you opt a **method** onto a
virtual thread:

```java
@GET
@RunOnVirtualThread                 // io.smallrye.common.annotation.RunOnVirtualThread
public Order get(String id) { … }   // blocking code, legally

@GET
@Blocking                            // a worker platform thread, the older escape hatch
public Order slow(String id) { … }

@GET
@NonBlocking                         // stays on the event loop; must not block
public Uni<Order> fast(String id) { … }
```

Because the choice is per method, a service can and will contain all three. That is a feature
and an obligation: the annotation is the model declaration, and a method with none of them
inherits a default that depends on its return type.

## Jakarta EE and application servers

Managed executors (`ManagedExecutorService`, `ManagedScheduledExecutorService`) are
container-managed and propagate container context — which a raw
`Executors.newVirtualThreadPerTaskExecutor()` does not. Jakarta Concurrency 3.1 adds
virtual-thread support (`@ManagedExecutorDefinition(virtual = true)` style configuration);
what a given server actually implements varies, so verify against the server's own
documentation rather than the specification version.

Managed context is not automatic transaction inheritance: managed executor tasks execute
outside the submitting thread's transaction. Inspect the configured context service and
establish the task's own permitted transaction boundary. Do not share its EntityManager.
`virtual=true` also needs a supporting runtime; Concurrency 3.1 permits platform-thread
fallback on Java 17. Follow the container's lifecycle/threading rules even for work without
context; absence of context alone does not authorize unmanaged executors.

## Helidon 4

Virtual-thread-native: the server assigns a virtual thread per request with no flag. Verify the Helidon version and component being discussed; this server choice does not
establish what auxiliary tasks or client callbacks use.

## Verifying what actually ran

```bash
# Snapshot of tracked live threads, including virtual threads; correlate to requests.
jcmd <pid> Thread.dump_to_file -format=json /tmp/d.json

# Are known platform worker pools still doing the work? Names are implementation/configuration evidence only.
jcmd <pid> Thread.print | grep -c 'http-nio-.*exec'

# Inspect captured start events (disabled by default); this is not a per-second rate.
jfr print --events jdk.VirtualThreadStart recording.jfr | head
```

A configuration change that was supposed to move request handling onto virtual threads and
did not is common — a wrong property name, a starter that does not honour it, a server
version that predates support. An empty JFR listing can mean disabled events, recording-window/threshold coverage or no
captured event, not absence of virtual threads or waiting. Compute rates from timestamps and
a defined capture window. A thread snapshot misses completed threads and requires request
correlation; profiler and JFR event support depend on the runtime.

Confirm at runtime; the property being present in
`application.yaml` proves only that the file contains it.

## Review checklist

- [ ] The model each endpoint runs under is stated somewhere a reader will find it
- [ ] Enabling virtual threads was accompanied by a replacement for the removed pool bound
- [ ] `spring.task.execution.simple.concurrency-limit` set, or unbounded chosen deliberately
- [ ] Jobs requiring single-flight execution have an explicit guard and an overlap test
- [ ] No blocking call reachable from a WebFlux/Vert.x event-loop thread
- [ ] `boundedElastic` caps and queues are measured; downstream-specific limits remain local
- [ ] Runtime verification performed, not just configuration review

## Sources

- [Spring Boot 3.5 task execution and scheduling](https://docs.spring.io/spring-boot/3.5/reference/features/task-execution-and-scheduling.html) — auto-configuration and custom executors.
- [SimpleAsyncTaskScheduler 6.1 API](https://docs.spring.io/spring-framework/docs/6.1.0/javadoc-api/org/springframework/scheduling/concurrent/SimpleAsyncTaskScheduler.html) — fixed-delay scheduler thread and concurrency limit.
- [Jakarta Concurrency 3.1 specification](https://jakarta.ee/specifications/concurrency/3.1/jakarta-concurrency-spec-3.1.pdf) — managed context, transaction boundaries and virtual-thread configuration.
- [JEP 491](https://openjdk.org/jeps/491) — JDK 24 monitor pinning change; not a general absence-of-blocking guarantee.
