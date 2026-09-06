# Generator Configuration and Output Contracts

## Arrival-executor concurrency

For iteration arrival rate \(\lambda_i\) and mean iteration duration \(E[W_i]\):

\[
E[L_i]=\lambda_i E[W_i]
\]

This estimates mean busy virtual users, not a safe maximum. Duration variability, timeouts,
multi-request workflows, client work and generator scheduling require a pilot. Choose
preallocation from the observed concurrency distribution plus explicit headroom, and prove
generator CPU, memory, network, sockets and metrics output remain below their limits.

In current k6 arrival-rate executors, each iteration needs an available VU. Insufficient
allocation causes dropped iterations, including when target slowdown holds VUs longer;
this does not uniquely identify generator hardware saturation. Zero drops also do not
prove starts met their planned timestamps. Dynamic allocation up to maxVUs can itself consume
resources, so official guidance favors adequate preallocation for stable tests. Pin the k6
version and inspect the achieved start timestamps.

## k6 example

Partial options for an illustrative HTTP capacity scenario, not a runnable workload.
Supply the iteration body, expected response classification and business correctness checks;
derive thresholds and VU counts from the target SLO and pilot, not these example numbers.

```javascript
export const options = {
  scenarios: {
    api: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 800, // derived from a pilot, not copied
    },
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    // Acceptance: the service objective.
    http_req_duration: ['p(99)<500'],
    http_req_failed: ['rate<0.01'], // configure which responses count as expected
    checks: ['rate==1'], // requires emitted business checks and non-empty validation
    // Fidelity: configured starts occurred.
    dropped_iterations: ['count<1'],
  },
};
```

One iteration can issue zero, one or many requests. If target demand is request/s or
business operations/s, measure requests/useful operations per iteration and configure the
iteration rate accordingly.

`http_req_duration` measures sending, waiting and receiving, excluding DNS/connection/TLS
setup. If the objective includes these or multiple requests, instrument the logical operation
boundary separately. A failed `check()` alone does not fail the process; thresholds gate it.
Require non-empty request/check populations, reconcile attempts and useful completions, and
scope metrics to the intended scenario/phase before claiming this predicate passed.
Built-in HTTP samples are timestamped at request completion: a completion-window summary can
include requests started earlier and omit unfinished ones. Declare start cohorts, drain
allowances, client timeouts and interrupted iterations; timed-out clients can leave server
work running. Do not silently mix warmup, test and recovery samples.

A dropped-iteration threshold is a useful CI gate for a configured-arrival claim. Preserve
the raw count and phase: it does not erase valid lower-load phases, and a deliberately
generator-saturation experiment has a different claim.

## Gatling and JMeter

Gatling distinguishes open workload injection (users arriving over time) from closed
concurrent-user injection. A user scenario that loops internally can add closed feedback
even if users were initially injected openly. Record requests per user and scenario
duration.

JMeter's Open Model Thread Group is documented as experimental in current releases. Pin
the version, seed/schedule and test a small fixture. A traditional looping Thread Group
with a throughput timer is still bounded by available threads and response duration.

## Raw versus aggregated output

Never infer schema from a filename or CLI flag. For every tool/version:

1. generate a deterministic fixture with known outcomes;
2. retain the raw output and the human summary;
3. assert required fields, units, populations and non-empty counts;
4. compare parser output with an independently calculated result;
5. fail on unknown schema versions or histogram range overflow.

k6 raw sample/event streams are not the same as summary aggregation. Explicitly configure
summary statistics only when consuming the summary; calculate from raw samples using a
documented estimator when consuming events.

## Distributed generators

When one host cannot provide headroom:

- synchronize the offered schedule, not only process start time;
- measure per-shard clock error and achieved arrivals;
- partition identities/data without changing key/tenant skew;
- avoid shared NAT, DNS, load balancer or metrics bottlenecks;
- aggregate mergeable histograms, not exported percentile values;
- retain shard-level results to reveal imbalance;
- validate aggregate offered load from timestamps.

## JVM-side evidence

Prefer JFR and service metrics for aligned CPU, allocation, GC, safepoint, lock, thread and
I/O evidence. Commands and events vary by JDK; verify with the exact runtime rather than
asserting that one diagnostic command exists “in any JDK.”

Platform-thread dumps do not enumerate all unmounted virtual threads. On JDKs supporting
virtual-thread dump-to-file, use the documented jcmd command and validate output/version.
Thread count is not sufficient: capture queue age/depth, executor state, pinned/carrier
evidence and downstream occupancy.

GC and safepoint logging can help correlation, but “always instrument GC” is too broad:
control volume/overhead and preserve the same observability configuration between compared
runs. A pause correlation is not causation; compare event intervals and competing signals.

## Thread-pool interpretation

ThreadPoolExecutor behavior depends on core size, queue type/capacity, maximum size,
rejection handler and task submission:

1. below core size, a worker is normally added;
2. otherwise the task is offered to the queue;
3. if the offer fails and count is below maximum, a worker may be added;
4. otherwise the task is rejected.

An unbounded queue normally prevents growth beyond core size after initialization, making
maximumPoolSize ineffective for that path. Frameworks can wrap/alter queues and submission,
so inspect the effective implementation and metrics before attributing a plateau.

## References

- [k6 constant arrival rate](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/)
- [k6 arrival-rate VU allocation](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/)
- [k6 built-in metrics](https://grafana.com/docs/k6/latest/using-k6/metrics/reference/)
- [k6 thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/)
- [Gatling injection](https://docs.gatling.io/concepts/injection/)
- [Apache JMeter component reference](https://jmeter.apache.org/usermanual/component_reference.html)
- [JDK jcmd](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
