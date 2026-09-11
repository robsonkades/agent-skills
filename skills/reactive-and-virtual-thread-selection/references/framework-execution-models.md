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

For a proposed flag change, check the affected components:

- **A servlet worker-pool limit may stop being the admission limit.** Confirm the embedded
  server and Boot version rather than generalising Tomcat behaviour to Jetty or Undertow.
  Preserve the required admission/resource properties through existing or new equivalent
  controls; a redundant worker cap need not gain a duplicate gate.
- **The auto-configured `@Async` executor is unbounded by default.** A custom executor or
  `@Async` qualifier can select something else. `SimpleAsyncTaskExecutor` starts virtual
  threads as it is given work. Where an executor-level cap is needed, inspect
  `spring.task.execution.simple.concurrency-limit` (and the scheduling counterpart) on
  Boot versions exposing them; adequate upstream admission can already bound submission.
  Spring Framework 6.2.0's concurrency-limit policy blocks submitters; inspect the selected
  version/policy rather than treating it as non-blocking rejection on an event loop.
  Bound admission/waiters separately from active execution.
- **Scheduling semantics need revalidation.** Pool settings are ignored by the simple
  virtual-thread scheduler, and fixed-delay tasks have special handling. Test overlap for
  affected trigger type when evidence is needed. Preserve an adequate serial execution
  contract; add a single-flight guard only if required non-overlap is otherwise lost. Do not
  infer the current guarantee from a historical pool size.

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
that the scheduler is bounded. Compare those defaults with the actual dependency budget;
they do not establish that it is protected. Use existing equivalent admission or a needed
resource-local limiter, including aggregate callers and waiting tasks.

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

These are partial endpoint sketches, not a complete resource class. A service can contain
all three. For Quarkus REST, inspect return type, method/class/application annotations and
transactional defaults in the resolved version; absence of a method annotation alone does
not identify its thread. An annotation states routing intent, not every downstream callback's execution.

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
# Bash; set JVM_PID for thread captures and/or RECORDING for a JFR listing.
# Use an authorized target/capture; an unset input skips that capture group.
if [ -z "${JVM_PID:-}" ] && [ -z "${RECORDING:-}" ]; then
    printf 'Set JVM_PID or RECORDING for the relevant capture.\n' >&2
    exit 1
fi
capture_dir=$(mktemp -d) || exit 1
printf 'Evidence directory: %s\n' "$capture_dir"
capture() {
    local label=$1 status
    shift
    if "$@" >"$capture_dir/$label.out" 2>"$capture_dir/$label.err"; then
        status=0
    else
        status=$?
    fi
    printf '%s\n' "$status" >"$capture_dir/$label.status"
    return "$status"
}

if [ -n "${JVM_PID:-}" ]; then
    if ! capture dump jcmd "$JVM_PID" Thread.dump_to_file -format=json "$capture_dir/threads.json"; then
        printf 'Thread dump unavailable; inspect dump.err/dump.out.\n' >&2
    fi
    if capture platform jcmd "$JVM_PID" Thread.print; then
        if capture worker-count grep -c 'http-nio-.*exec' "$capture_dir/platform.out"; then
            cat "$capture_dir/worker-count.out"
        elif [ "$(cat "$capture_dir/worker-count.status")" = 1 ]; then
            printf 'No matching names in this successful capture.\n'
        else
            printf 'Worker-name filter failed; count unavailable.\n' >&2
        fi
    else
        printf 'Platform-thread capture unavailable; no count inferred.\n' >&2
    fi
fi
if [ -n "${RECORDING:-}" ]; then
    if capture starts jfr print --events jdk.VirtualThreadStart "$RECORDING"; then
        if ! capture preview head -n 20 "$capture_dir/starts.out"; then
            printf 'Preview failed; retain the full starts.out.\n' >&2
        fi
    else
        printf 'JFR listing unavailable; no event count inferred.\n' >&2
    fi
fi
```

Run only the relevant captures; use tooling and output paths accessible in the target's
environment. Retain raw output and statuses before filtering, and inspect tool diagnostics
and output validity even after exit zero. The preview is truncated; the full listing remains.
Names identify implementation/configuration, not request ownership or universal thread type.
A wrong property, overridden executor or unsupported server can explain a configuration/runtime
mismatch. An empty successful JFR listing can mean disabled events, recording-window coverage or no
captured event, not absence of virtual threads or waiting. Compute rates from timestamps and
a defined capture window. A thread snapshot misses completed threads and requires request
correlation; profiler and JFR event support depend on the runtime.

Use runtime evidence for a claim about actual execution; the property being present in
`application.yaml` proves only that the file contains it. A source/configuration review can
finish without a new runtime capture if its conclusion stays within that evidence.

## Review checklist

Apply the relevant checks to the affected paths, reusing adequate existing evidence:

- [ ] Execution and handoff contracts are discoverable for the reviewed paths
- [ ] Required properties of removed limits survive through equivalent controls
- [ ] Active execution, admission and waiting bounds are established, not inferred from a property alone
- [ ] Required job non-overlap survives through a supported scheduler contract or guard
- [ ] No blocking call reachable from a WebFlux/Vert.x event-loop thread
- [ ] Scheduler caps/queues and aggregate downstream budgets fit the claimed workload
- [ ] Actual-execution claims have relevant runtime evidence; source/configuration claims state their limits

## Sources

- [Spring Boot 3.5 task execution and scheduling](https://docs.spring.io/spring-boot/3.5/reference/features/task-execution-and-scheduling.html) — auto-configuration and custom executors.
- [SimpleAsyncTaskScheduler 6.1 API](https://docs.spring.io/spring-framework/docs/6.1.0/javadoc-api/org/springframework/scheduling/concurrent/SimpleAsyncTaskScheduler.html) — fixed-delay scheduler thread and concurrency limit.
- [Jakarta Concurrency 3.1 specification](https://jakarta.ee/specifications/concurrency/3.1/jakarta-concurrency-spec-3.1.pdf) — managed context, transaction boundaries and virtual-thread configuration.
- [JEP 491](https://openjdk.org/jeps/491) — JDK 24 monitor pinning change; not a general absence-of-blocking guarantee.
- [SimpleAsyncTaskExecutor 6.2.0 source](https://github.com/spring-projects/spring-framework/blob/v6.2.0/spring-core/src/main/java/org/springframework/core/task/SimpleAsyncTaskExecutor.java) — default concurrency and submitting-thread behavior.
- [Quarkus REST execution model](https://quarkus.io/guides/rest#execution-model-blocking-non-blocking) and [virtual-thread endpoints](https://quarkus.io/guides/rest-virtual-threads) — resolve these against the deployed Quarkus version.
- [Jakarta Concurrency 3.1 ManagedExecutorDefinition](https://jakarta.ee/specifications/concurrency/3.1/apidocs/jakarta.concurrency/jakarta/enterprise/concurrent/managedexecutordefinition) — virtual request, inline tasks and Java 17 fallback.
- [Helidon 4 WebServer](https://helidon.io/docs/v4/se/webserver) and [JDK 25 jcmd](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html) — component and tool scope.
