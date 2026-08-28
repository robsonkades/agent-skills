---
name: adapter-sidecar-pattern
description: >
  A Kubernetes sidecar that normalises what an application emits — metrics, logs, health —
  so a heterogeneous fleet presents one interface to the platform; not the Gang-of-Four
  Adapter design pattern for in-process object interfaces (that is java-api-design). Use
  when a legacy or vendor process exposes metrics in a format the platform cannot scrape,
  when every service logs in a different shape, when a legacy process has no usable health
  endpoint, when choosing between a per-pod log sidecar and a DaemonSet node agent, when an
  adapter is being asked to synthesise a trace or correlation ID the application never
  emitted, or when an application upgrade silently changed a log format that an adapter
  parses. Does not cover pod-level container mechanics (sidecar-pattern), how to design the
  telemetry itself (metrics-and-cardinality, structured-logging,
  distributed-tracing-design), probe semantics and configuration
  (kubernetes-service-lifecycle), or collector cost and sampling
  (opentelemetry-performance).
---

# Adapter Pattern

## Purpose

An adapter sidecar is a translation layer. The application keeps emitting whatever it emits,
and a peer container converts that into the shape the platform consumes — one scrape format,
one log schema, one health contract — across a fleet nobody is going to rewrite. The pod
mechanics that make a peer container possible are `sidecar-pattern`; this skill is only about
the translation.

The failure this prevents is the adapter treated as a permanent answer to a contract problem.
An adapter that parses an application's log lines or metric output is coupled to an
**unversioned interface**: the app's next release renames a field, the adapter keeps running
and reporting, and the platform receives plausible, wrong data with no error anywhere in the
chain. Where the application can be changed instead, changing it is the cheaper answer over
any horizon longer than a quarter. The adapter is for when it cannot.

## Workflow

1. **Write down both formats with a real sample in hand** — what the app emits today, byte for
   byte, and what the platform requires. An adapter designed against remembered formats is
   rewritten against the real ones.
2. **Exhaust the cheaper options first.** In-process instrumentation, stdout in the platform's
   own format, or an upstream image that already speaks it. See
   `references/adapter-or-node-agent.md`.
3. **Choose the topology** — per pod (sidecar) or per node (DaemonSet). For anything the app
   already writes to stdout this is the real decision, and the node agent usually wins.
4. **Pin the input contract.** Capture a genuine sample of the app's output as a fixture, run
   the adapter against it in CI, and treat a format change as a breaking change in a
   dependency you do not control.
5. **Bound the output.** Every label, field or metric name the adapter derives from app output
   must come from an enumerable set; anything carrying an identifier is a cardinality
   incident waiting for traffic.
6. **Decide the behaviour when the adapter falls behind or dies** — does the application
   block, drop, or fill a volume until the pod is evicted? Pick one deliberately.
7. **Test the output contract**, not the adapter's internals: fixture in, expected platform
   format out, asserted by the platform's own parser where one exists.

## Decision block

```text
Use an adapter sidecar when:
- the workload is a vendor or legacy binary that cannot be instrumented or recompiled, and
  the platform requires a specific exposition or log schema;
- parsing rules differ per workload, so one node-agent configuration cannot cover the fleet;
- the translation needs pod-local context at emission time — pod name, workload identity,
  a per-pod certificate.
Avoid an adapter when:
- the application is yours and a library already emits the platform's format: a JVM service
  with Micrometer and the Prometheus registry already serves an exposition endpoint, and an
  adapter in front of it is a proxy that adds a failure mode and no information;
- the source is a log format you also control — change it once instead of parsing it forever;
- the adapter would have to invent information the app never emitted, such as a trace or
  correlation ID;
- the app's output format is unstable release to release and nobody owns keeping the two in
  step.
Prefer a node agent (DaemonSet) instead when:
- the app writes to stdout and the normalisation is uniform across workloads: one process per
  node replaces one per pod, and the container runtime is already collecting the stream.
Prefer changing the application instead when:
- you own the code, and the format will change again anyway — every such change costs an
  adapter release that is coupled to, but not released with, the application.
```

## Rules

- **An adapter can only translate what was emitted.** It cannot add a trace ID, a correlation
  ID or a tenant that the application never wrote. A synthesised one is worse than none: it
  looks real and correlates nothing. Designing those identifiers is `structured-logging` and
  `distributed-tracing-design`.
- Ingestion time is not event time. If the app emits no timestamp, the adapter stamps arrival,
  which is wrong by however long the line sat in a buffer — visible afterwards as bursts of
  events sharing one timestamp, and as ordering that inverts under load.
- Parsing the app's output is a contract with **no version and no owner**. Pin a fixture in
  CI, and re-capture it from the real image on every application upgrade. "It still parses" is
  not the assertion; "the parsed fields still mean the same thing" is.
- Every derived label must come from a bounded set. A path label containing identifiers, a
  customer ID, or an exception message creates one time series per distinct value; the series
  count is the label sets multiplied, not added. The sizing is `metrics-and-cardinality`.
- **stdout is a pipe.** If nothing drains it, the kernel buffer (64 KiB by default on Linux)
  fills and the next `write` blocks — logging turns into latency and then into a stall in the
  application thread that logged. Any design where the adapter is the drain must state what
  happens when the adapter stops draining.
- A file handed over through an `emptyDir` is node ephemeral storage. An adapter that falls
  behind fills it, and the pod is evicted for local storage usage. Set a `sizeLimit`, rotate,
  and decide explicitly whether the application drops lines or blocks when the file cannot
  grow.
- A metrics adapter that scrapes the app and re-exposes must publish **its own** success and
  the age of what it is serving. Serving a cached exposition without its age turns a dead
  application into a healthy-looking flat line.
- A health adapter must exercise the protocol the legacy process actually speaks — a query it
  really answers — not a TCP connect, which succeeds against a wedged process holding an open
  socket. What each probe should answer, and how it is configured, is
  `kubernetes-service-lifecycle`.
- Version the adapter's **output** schema and emit the version in the output. Consumers can
  then fail loudly on a change instead of silently mis-reading a renamed field.
- Never claim the adapter makes the fleet uniform. It makes the emitted _format_ uniform;
  semantics still differ — one service's `request_duration` includes queueing and another's
  does not. Uniform shape is not uniform meaning, and a dashboard that assumes otherwise
  compares two different quantities.

## References

- [Adapter, node agent, in-process or change the app](references/adapter-or-node-agent.md) —
  the four options with the observable condition that selects each and what each costs, plus
  the log-shipping topology comparison in detail. Read before adding an adapter container, and
  when a log pipeline is being designed or revisited.
- [Coupling and failure surface](references/coupling-and-failure.md) — the unversioned format
  contract and how to pin it, what an adapter can and cannot synthesise, cardinality
  arithmetic, backpressure when the adapter falls behind or dies, and a contract test for the
  output. Read when writing an adapter, and when telemetry has gone silently wrong after an
  application upgrade.
