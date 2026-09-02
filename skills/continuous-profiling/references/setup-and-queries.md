# Setting up collection and querying the history

## Pyroscope Java SDK — the real `Config.Builder` API

```java
import io.pyroscope.javaagent.EventType;
import io.pyroscope.javaagent.PyroscopeAgent;
import io.pyroscope.javaagent.config.Config;

import java.time.Duration;
import java.util.Map;

public final class PyroscopeSetup {

    public static void configure() {
        Config.Builder builder = new Config.Builder()
            .setApplicationName("order-service")
            .setServerAddress(System.getenv().getOrDefault(
                "PYROSCOPE_SERVER_ADDRESS", "http://localhost:4040"))
            .setProfilingInterval(Duration.ofMillis(10))
            // One CPU engine, not a list. Default is ITIMER.
            .setProfilingEvent(EventType.ITIMER)
            .setUploadInterval(Duration.ofSeconds(10))   // the SDK's real default
            .setLabels(Map.of(
                "env", System.getenv().getOrDefault("ENVIRONMENT", "local"),
                "region", System.getenv().getOrDefault("AWS_REGION", "unknown"),
                "version", BuildInfo.VERSION));

        // Allocation and lock are independent channels behind a threshold, not
        // EventType values — and they belong behind a flag in production.
        if (Boolean.parseBoolean(System.getenv()
                .getOrDefault("ENABLE_ALLOC_PROFILING", "false"))) {
            builder.setProfilingAlloc("512k");
        }

        PyroscopeAgent.start(builder.build());
    }
}
```

Verify signatures against `agent/src/main/java/io/pyroscope/javaagent/config/Config.java` in
`grafana/pyroscope-java` for the version you actually installed. `addProfilingType(...)` is
not in that class.

Resolution against overhead, when tuning:

```java
.setProfilingInterval(Duration.ofMillis(10))    // default: more resolution, more overhead
// .setProfilingInterval(Duration.ofMillis(100)) // minimal overhead
.setProfilingLock("10ms")                        // enable while debugging contention
```

Maven coordinate — check Maven Central for the current stable version rather than pinning a
number from memory:

```xml
<dependency>
    <groupId>io.pyroscope</groupId>
    <artifactId>agent</artifactId>
    <version><!-- check before use --></version>
</dependency>
```

## Per-request labels in Spring Boot

The label API is `io.pyroscope.labels.v2`: `LabelsSet` (key/value pairs),
`ScopedContext` (`AutoCloseable`; the constructor pushes the labels onto the **current
thread's** async-profiler context id, `close()` restores the previous one) and
`Pyroscope.LabelsWrapper.run(LabelsSet, Runnable | Callable)` which wraps the two. There
is no `Labels.Builder`, no `Scope` and no `LabelsWrapper.of(...)`.

```java
import io.pyroscope.labels.v2.LabelsSet;
import io.pyroscope.labels.v2.ScopedContext;

@Component
public class PyroscopeRequestInterceptor implements HandlerInterceptor {

    private static final String ATTR = ScopedContext.class.getName();

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        String tenant = req.getHeader("X-Tenant-Id");
        String route = (String) req.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        req.setAttribute(ATTR, new ScopedContext(new LabelsSet(
            "tenant", tenant != null ? tenant : "unknown",
            "endpoint", req.getMethod() + " " + (route != null ? route : "unmatched"))));
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest req, HttpServletResponse res,
                                Object handler, Exception ex) {
        ScopedContext ctx = (ScopedContext) req.getAttribute(ATTR);
        if (ctx != null) ctx.close();
    }
}
```

Two things the interceptor shape gets wrong unless you handle them. The label is bound to
the thread, so a servlet async dispatch or a hand-off to another executor runs the rest of
the request unlabelled — wrap that work in `LabelsWrapper.run(...)` on the worker. And the
`endpoint` label must be the **route template**, not `getRequestURI()`: a URI with an id
in it is one label value per request, which is the cardinality failure
`metrics-and-cardinality` describes, paid here in the profile store.

Every sample taken inside the scope carries those labels; filtering the UI by
`tenant="acme"` then isolates that tenant's flame graph.

## Continuous profiling with only the JDK

Recording that never stops, retained on disk:

```bash
# No duration= — this is the continuous form. maxsize/maxage supply retention.
# settings=default is the configuration the JDK documents for continuous use;
# profile.jfc is "for short periods of time". Override single events on top of it
# with <event>#<setting>=<value> (jcmd help JFR.start shows the syntax).
jcmd <pid> JFR.start name=continuous settings=default \
  jdk.ExecutionSample#period=10ms \
  maxsize=512m maxage=24h filename=/var/log/jfr/continuous.jfr

# JDK 25, Linux, experimental: per-thread CPU-time samples with an explicit budget.
jcmd <pid> JFR.start name=cputime settings=default \
  jdk.CPUTimeSample#enabled=true jdk.CPUTimeSample#throttle=500/s maxage=6h

# Read the accumulated history without stopping the recording; -30m limits the dump:
jcmd <pid> JFR.dump name=continuous begin=-30m filename=/var/log/jfr/snapshot-%t.jfr

# Look before you download: top frames of the last 10 minutes, in the JVM.
jcmd <pid> JFR.view hot-methods maxage=10m

jcmd <pid> JFR.stop name=continuous
```

`maxage`/`maxsize` bound what stays on disk; `JFR.dump begin=`/`end=` bound what one
snapshot carries. A dump without either copies the whole retained window every time.

Consuming events live instead, with nothing written to disk:

```java
import jdk.jfr.consumer.RecordingStream;

public final class ContinuousStreamExporter {

    private static final Map<String, Long> samplesByTopFrame = new ConcurrentHashMap<>();

    public static void main(String[] args) throws InterruptedException {
        try (RecordingStream rs = new RecordingStream()) {
            rs.enable("jdk.ExecutionSample").withPeriod(Duration.ofMillis(20));
            rs.onEvent("jdk.ExecutionSample", event -> {
                var stack = event.getStackTrace();
                if (stack == null || stack.getFrames().isEmpty()) return;
                String top = stack.getFrames().get(0).getMethod().getName();
                samplesByTopFrame.merge(top, 1L, Long::sum);
            });
            rs.startAsync();   // start() would block this thread indefinitely

            Thread.sleep(Duration.ofSeconds(60).toMillis());
            samplesByTopFrame.forEach((m, c) -> System.out.printf("%-40s %d%n", m, c));
        }
    }
}
```

Replacing the final `printf` with a Micrometer/Prometheus `/metrics` endpoint or a periodic
`POST` to a time-series backend turns this into a minimal continuous profiler with no
third-party `-javaagent`.

## Regression alerting

```yaml
apiVersion: 1
groups:
  - name: cpu-regression
    interval: 5m
    rules:
      - alert: CPUProfilingRegression
        expr: |
          (
            sum(rate(pyroscope_cpu_samples_total{
              app="order-service", endpoint="/api/orders"}[5m]))
            /
            sum(rate(pyroscope_cpu_samples_total{
              app="order-service", endpoint="/api/orders"}[5m] offset 1w))
          ) > 1.2
        labels:
          severity: warning
        annotations:
          summary: 'CPU regression on /api/orders'
          description: '20% more expensive than the same window last week.'
```

The `offset 1w` is doing the load-comparability work: same weekday, same hour.

## Diff query procedure

1. Pick two windows with structurally equivalent load — same weekday and hour, or the
   intervals immediately before and after a deploy under the same traffic.
2. Filter by the relevant label (tenant, endpoint) **before** comparing. Comparing
   unfiltered aggregates mixes signals from different sources.
3. Read the sample count of every frame before any quantitative statement.
4. Confirm the direction of the diff against latency or throughput before declaring root
   cause, and check that no new frame appeared as an unforeseen side effect of the fix.

## Development environment

```yaml
services:
  pyroscope:
    image: grafana/pyroscope:latest
    ports: ['4040:4040']
    command: ['server', '--config.file=/etc/pyroscope/config.yaml']
    volumes:
      - ./pyroscope-config.yaml:/etc/pyroscope/config.yaml
      - pyroscope-data:/var/lib/pyroscope

  app:
    image: eclipse-temurin:25-jdk # the openjdk Docker Hub repo is discontinued
    environment:
      PYROSCOPE_SERVER_ADDRESS: 'http://pyroscope:4040'
      PYROSCOPE_APPLICATION_NAME: 'my-java-app'
      PYROSCOPE_PROFILING_INTERVAL: '10ms'

volumes:
  pyroscope-data:
```
