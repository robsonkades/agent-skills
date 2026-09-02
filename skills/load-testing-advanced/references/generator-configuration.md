# Generator configuration and output formats

## Sizing the generator with Little's Law

Applied to the _generator_, not the system under test:

```
VUs in flight = λ_target × W_worst

λ_target = 300 req/s, worst tolerable latency = 400 ms
  VUs = 300 × 0.400 = 120
```

If `maxVUs` is below that, k6 cannot keep enough requests in flight, and the symptom is
`dropped_iterations > 0` — the generator stopped emitting on schedule, which reintroduces
omission underneath the open-loop executor.

Size from the **worst tolerable** latency, never the mean. The moment latency rises is
exactly when the generator most needs spare VUs, and exactly when an under-sized `maxVUs`
starts dropping. Testing 500 req/s with an SLO of p99 < 300 ms but tolerance for a
temporary rise to 1.2 s needs `maxVUs = 500 × 1.2 = 600`, plus margin for k6's own runtime
overhead — not the 150 that the normal SLO would suggest.

## k6, constant arrival rate

```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    api_load: {
      executor: 'constant-arrival-rate', // open-loop
      rate: 1000,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 200,
      maxVUs: 2000,
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
    dropped_iterations: ['count<1'], // any drop invalidates the run
  },
};

export default function () {
  const response = http.get('http://api.example.com/endpoint', {
    tags: { name: 'get-endpoint' },
  });
  check(response, { 'status 200': (r) => r.status === 200 });
  // no sleep() — open-loop adds no artificial pause
}
```

`summaryTrendStats` must list every percentile any downstream consumer reads, whatever the
installed version's default happens to be. Depending on the default is depending on
unversioned behaviour from inside your own script.

`dropped_iterations > 0`, or `vus == maxVUs` sustained, invalidates an open-loop run.
Expressing it as a threshold turns that into an explicit pipeline failure instead of a
quietly wrong number in the report.

## Weighted traffic mix

```javascript
export const options = {
  scenarios: {
    reads: {
      // 60% of production traffic
      executor: 'constant-arrival-rate',
      rate: 600,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 100,
      maxVUs: 500,
    },
    writes: {
      // 30%
      executor: 'constant-arrival-rate',
      rate: 300,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
    heavy: {
      // 10% by count — can still dominate a shared resource
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
};
```

Weights come from real access-log analysis. A heavy endpoint at 10% of request count that
holds a database connection ten times longer per request contributes half the real load on
that pool.

## Gatling, multi-stage injection

```scala
setUp(
    scn.inject(
        rampUsersPerSec(0).to(1000).during(60.seconds),
        constantUsersPerSec(1000).during(5.minutes),
        rampUsersPerSec(1000).to(0).during(30.seconds)
    )
).protocols(httpProtocol)
.assertions(
    global.responseTime.percentile(95).lt(200),
    global.responseTime.percentile(99).lt(500),
    global.failedRequests.percent.lt(1)
)
```

Prefer the explicit `percentile(N)` form over the legacy `percentile1..percentile4` aliases,
whose mapping depends on `charting.indicators` in `gatling.conf` and is not
self-describing in the script.

## wrk2, tail-latency precision

```bash
wrk2 -t8 -c100 -d300s -R 10000 --latency http://api.example.com/endpoint

# -R  target rate (open-loop), requests per second
# -c  simultaneous open connections
# -t  wrk2's own threads
# --latency  REQUIRED to print the percentile distribution block;
#            without it only the aggregate summary appears, with no tail

#     50.000%    1.23ms
#     90.000%    5.67ms
#     99.000%   45.23ms
#     99.900%  234.10ms
#     99.990%  890.50ms
```

wrk2 rather than wrk: the original is internally closed-loop. wrk2 uses HdrHistogram's
`recordValueWithExpectedInterval` to reconstruct the samples that would have been omitted.

## Output-format traps

| Flag               | What it writes                         | Percentiles available?                     |
| ------------------ | -------------------------------------- | ------------------------------------------ |
| `--summary-export` | Aggregated summary JSON                | Yes, but only those in `summaryTrendStats` |
| `--out json=...`   | One event per sample, aggregated never | No — the field does not exist              |

Reading a percentile from the raw event stream is the most common bug in automated
breakpoint scripts, and it fails silently because the field is simply absent. Run any parser
manually against the output of a real execution and confirm, by looking at the number, that
it matches what the tool reported.

## JVM-side correlation during the run

```bash
# live platform thread count — jcmd has NO Thread.count command
watch -n 5 "jcmd <pid> Thread.print | grep -c 'tid='"

# Thread.print lists platform threads. Mounted virtual threads appear;
# unmounted ones (most of them, under I/O) do not. For a real count:
jcmd <pid> Thread.dump_to_file -format=json threads.json

watch -n 1 'jcmd <pid> GC.heap_info'
tail -f gc.log | grep -E "Pause (Young|Full)"

# JDK 25: the virtual-thread scheduler itself — parallelism, active carriers, steals,
# and `delayed` (parked virtual threads with a timeout)
jcmd <pid> Thread.vthread_scheduler
jcmd <pid> Thread.vthread_pollers          # I/O poller threads and registrations
```

`jcmd <pid> Thread.count` has never existed in any JDK. It fails with `Unknown diagnostic
command`, which is noisy enough — until the pattern is copied into a script that swallows
stderr, at which point "the command does not exist" silently becomes "zero threads".

Run the JVM under test with `-Xlog:gc*,safepoint:file=gc.log:time` and correlate its
timestamps with the generator's latency series over NTP-synchronised clocks. A load test
with no GC instrumentation is blind to the largest single influence on JVM latency.

## Interpreting a thread-count plateau

`ThreadPoolExecutor` — and Tomcat's pool built on it — queues before it grows:

```
1. Task arrives, active < corePoolSize          → create a thread (up to core)
2. active == corePoolSize                       → task goes to the queue
3. Queue full AND active < maximumPoolSize      → create a thread
4. Queue full AND active == maximumPoolSize     → RejectedExecutionHandler
```

A pool of `(core=10, max=50)` with a 100-slot queue stays at 10 threads until 100 tasks are
queued. During a ramp, the observable is latency rising while the pool sits at
`corePoolSize` — the pool is behaving exactly as configured, and the parameter that matters
is queue size, not `maximumPoolSize`.

With an effectively unbounded queue, `maximumPoolSize` is dead configuration: the queue
never rejects, so step 3 never runs. A thread count that plateaus below `maximumPoolSize`
while the queue grows means you found the limit of something else — CPU, database
connections, or the test target itself.
