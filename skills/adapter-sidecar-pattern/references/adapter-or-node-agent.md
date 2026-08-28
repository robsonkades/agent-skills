# Adapter sidecar, node agent, in-process, or change the app

## The four options

| Option                         | Selected by                                                                                 | Cost                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **In-process instrumentation** | You own the code and a library emits the platform's format directly                         | A dependency and a release; nothing at runtime beyond the exporter itself                                    |
| **Adapter sidecar (per pod)**  | Vendor or legacy binary; per-workload parsing rules; translation needs pod-local identity   | Memory and CPU per replica, a second image to patch, and a parsing contract that nobody versions             |
| **Node agent (DaemonSet)**     | The signal is already at the node boundary (stdout, cgroup, host) and the rules are uniform | One agent's failure affects every pod on the node; usually needs host access; per-workload rules get awkward |
| **Change the application**     | You own the code and the format will keep changing                                          | One release now, nothing recurring — the only option whose cost does not compound                            |

Order of preference for a fleet you own: change the app, then in-process, then node agent,
then adapter sidecar. The order inverts only for workloads you cannot rebuild — which is
exactly the case the adapter exists for, and exactly the case people generalise from.

## Metrics: the honest counterexample

A JVM service with Micrometer and the Prometheus registry already exposes an exposition
endpoint. Putting an exporter sidecar in front of it converts a working scrape into a
two-process scrape with a new failure mode and no new information.

```java
// Conceptual: in-process, with a bounded tag set. No adapter can produce this,
// because no adapter can see the two dimensions that matter.
Counter.builder("orders.submitted")
       .tag("channel", channel.name())       // enum: bounded
       .tag("outcome", outcome.name())       // enum: bounded
       .register(registry)
       .increment();
```

The adapter earns its place for a process that has no instrumentation hook at all — a
database, a broker, an appliance, a vendor JAR you cannot modify — where the exporter reads
that system's own status interface and translates it. That is a different job from re-exposing
metrics an application already publishes correctly.

An exporter sidecar also inherits a scrape-interval problem: the platform scrapes the adapter,
the adapter polls the app on its own schedule, and the reported value is up to the sum of both
intervals old. Counters survive this; gauges and anything used for alerting do not, unless the
age of the sample is exported alongside it.

## Logs: the topology comparison

| Topology                                               | How it works                                                       | Choose it when                                                                            | Fails by                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **App writes structured JSON to stdout; node agent**   | Runtime captures the stream; one agent per node reads and forwards | You can change the app's log layout — this is the default                                 | One agent per node is a shared dependency; a single loud pod can starve its neighbours |
| **App writes plain text to stdout; node agent parses** | Same, plus regex or grok in the agent                              | The app cannot be changed and the format is stable across the fleet                       | Parsing rules diverge per workload and end up unmaintainable in one config             |
| **App writes a file to `emptyDir`; sidecar tails**     | Sidecar reads the shared volume, parses, ships                     | The app can only log to files, or one pod's volume is large enough to hurt a shared agent | The volume fills; ephemeral-storage eviction of the pod; a shipper per replica         |
| **App ships logs itself**                              | An appender writes straight to the log backend                     | Rarely — an in-app network dependency on the log backend                                  | Log backend outage becomes application latency, and buffering becomes heap             |

The default answer for a fleet is the first row, and the reason is arithmetic: a shipper at
64–256 MiB per pod, times every replica, against one agent per node. The sidecar form is
justified by a specific inability — no stdout, per-pod rules, or a pod whose volume genuinely
would degrade the shared agent — and that justification should be written in the manifest as a
comment, because the next person will otherwise copy it.

## Health: adapting a process that has none

A legacy process with no health endpoint is the one case where an adapter is unambiguously
right: no code change is possible, and a TCP-connect probe is not a health check — a wedged
process still accepts connections.

The adapter should perform the smallest operation a real client performs and report the
result. A database gets a trivial query on a connection it opened itself; a queue consumer
gets a broker metadata call; a batch process gets a check that its progress marker advanced
within an expected interval. It should report _unhealthy_ only for conditions that the correct
Kubernetes action (restart, or removal from endpoints) would actually address — which probe,
and how it is configured, is `kubernetes-service-lifecycle`.

Two adapter-specific traps: the check runs on every probe period forever, so it must be cheap
and must not accumulate state; and its result must be computed fresh or explicitly labelled
with its age, or a probe reads a cached "healthy" from before the process wedged.
