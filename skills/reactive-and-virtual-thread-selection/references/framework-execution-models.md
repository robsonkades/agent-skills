# Framework execution models

Everything in this file is **framework** behaviour. None of it is something the Java platform
does on its own, and conflating the two is how "Java enables virtual threads by default"
enters a design document.

## Spring Boot (MVC)

`spring.threads.virtual.enabled=true` — opt-in on Java 21+, and still opt-in in Boot 4. It
changes several things at once, which is why it deserves a checklist rather than a shrug:

| Component                            | Default (property off)                                        | With virtual threads on                                                 |
| ------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Servlet request handling             | container-specific worker pool                                | supported embedded containers can use virtual-thread execution; verify  |
| `applicationTaskExecutor` (`@Async`) | `ThreadPoolTaskExecutor`: 8 core threads, **unbounded queue** | `SimpleAsyncTaskExecutor` on virtual threads: **unbounded concurrency** |
| `taskScheduler` (`@Scheduled`)       | `ThreadPoolTaskScheduler` (pool of 1 by default)              | `SimpleAsyncTaskScheduler`: a new virtual thread per execution          |
| Kafka / AMQP listener containers     | platform threads                                              | virtual threads, where the starter supports it                          |

Three consequences worth stating out loud before flipping it:

- **A servlet worker-pool limit may stop being the admission limit.** Confirm the embedded
  server and Boot version rather than generalising Tomcat behaviour to Jetty or Undertow.
  Replace any removed bound with limits next to scarce resources and edge shedding.
- **`@Async` becomes unbounded.** `SimpleAsyncTaskExecutor` will start as many virtual
  threads as it is given work. Set `spring.task.execution.simple.concurrency-limit`
  (and `spring.task.scheduling.simple.concurrency-limit`) unless unbounded is genuinely
  intended.
- **Scheduling semantics need revalidation.** Pool settings are ignored by the simple
  virtual-thread scheduler, and fixed-delay tasks have special handling. Test overlap for
  each trigger type and add an explicit single-flight guard when the job requires it; do not
  infer the guarantee from a historical pool size.

Verify rather than assume:

```java
@GetMapping("/whoami")
String whoami() {
    Thread t = Thread.currentThread();
    return t + " virtual=" + t.isVirtual();      // the only answer that settles it
}
```

## Spring WebFlux

Reactive, on Netty event loops, regardless of `spring.threads.virtual.enabled`. Setting that
property on a WebFlux application does not make blocking safe, does not move request handling
off the event loops, and mostly affects the auxiliary executors.

If a WebFlux service must call one blocking dependency:

```java
Mono.fromCallable(() -> jdbcClient.query(...))
    .subscribeOn(Schedulers.boundedElastic());   // never on the event loop
```

and then decide, separately, whether `boundedElastic` should itself run on virtual threads
(`reactor.schedulers.defaultBoundedElasticOnVirtualThreads=true`). The virtual-thread
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

The rule that survives every server: in a managed environment, get threads from the container
when context propagation matters, and use unmanaged threads only for work that carries no
container context.

## Helidon 4

Virtual-thread-native: the server assigns a virtual thread per request with no flag. It is
the one mainstream framework where "thread-per-request on virtual threads" is the default
rather than an option, which makes it a useful reference point when someone claims the model
is experimental.

## Verifying what actually ran

```bash
# Which requests ran on virtual threads? The JSON dump lists them; jstack does not.
jcmd <pid> Thread.dump_to_file -format=json /tmp/d.json

# Are known platform worker pools still doing the work? Names are implementation/configuration evidence only.
jcmd <pid> Thread.print | grep -c 'http-nio-.*exec'

# Under load: virtual threads started per second (event disabled by default)
jfr print --events jdk.VirtualThreadStart recording.jfr | head
```

A configuration change that was supposed to move request handling onto virtual threads and
did not is common — a wrong property name, a starter that does not honour it, a server
version that predates support. Confirm at runtime; the property being present in
`application.yaml` proves only that the file contains it.

## Review checklist

- [ ] The model each endpoint runs under is stated somewhere a reader will find it
- [ ] Enabling virtual threads was accompanied by a replacement for the removed pool bound
- [ ] `spring.task.execution.simple.concurrency-limit` set, or unbounded chosen deliberately
- [ ] Jobs requiring single-flight execution have an explicit guard and an overlap test
- [ ] No blocking call reachable from a WebFlux/Vert.x event-loop thread
- [ ] `boundedElastic` caps and queues are measured; downstream-specific limits remain local
- [ ] Runtime verification performed, not just configuration review
