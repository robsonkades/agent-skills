---
name: kubernetes-service-lifecycle
description: >
  A Java service at the edges of its life under Kubernetes: liveness, readiness and startup
  probes as three different questions, probe timing arithmetic, graceful shutdown as a
  sequence where endpoint removal races SIGTERM, terminationGracePeriodSeconds as a budget,
  draining non-HTTP work such as Kafka consumers and scheduled jobs, PodDisruptionBudgets,
  and limits as availability decisions. Use when 502s appear only during a rolling update,
  when a liveness probe checks a database and a blip restarts every healthy pod, when
  initialDelaySeconds was guessed instead of a startupProbe, when a pod exits 137 or loops
  in CrashLoopBackOff, when a node drain hangs, or when in-flight Kafka or scheduled work is
  lost on redeploy. Does not cover what the JVM detects in a cgroup (container-awareness),
  host kernel behaviour (linux-for-jvm), faster startup (startup-cds-crac-leyden), replica
  disposability (stateless-service-design), routing (load-balancing-and-routing), or API
  compatibility (rpc-and-api-contracts).
---

# Kubernetes Service Lifecycle

## Purpose

Make a Java service correct at the two moments the orchestrator controls: when it is
declared ready, and when it is told to stop. Almost every "mystery 502 during deploy" and
every "database blip took down the whole service" is a lifecycle misconfiguration, not an
application bug — the code was fine and was killed, or was sent traffic before it could
serve it.

The failure this prevents is the probe that answers the wrong question. A liveness probe
that checks a downstream dependency converts a partial degradation into a total outage:
the database wobbles, every replica fails liveness, the kubelet restarts all of them at
once, and now nothing is serving even after the database recovers.

## Workflow

1. **Assign each probe its own question.** Liveness = "restart me, I am unrecoverable in
   process". Readiness = "send me traffic now". Startup = "I am still booting, do not judge
   me yet". Three endpoints, three answers; a single `/health` wired to all three is the
   root of most incidents here.
2. **Strip dependencies out of liveness.** Liveness must depend on nothing outside the
   process. If restarting the process cannot fix the condition, it does not belong in
   liveness.
3. **Do the probe arithmetic.** Detection time is roughly
   `periodSeconds × failureThreshold` (plus `initialDelaySeconds` for the first check), and
   `timeoutSeconds` must exceed the check's own worst case. Write both numbers down and
   compare them with the SLO. See `references/probe-and-shutdown-configuration.md`.
4. **Replace guessed startup delays with a startup probe.** `startupProbe` (GA since
   Kubernetes 1.20) suspends liveness and readiness until it first succeeds, so a slow boot
   gets a long budget without making crash detection slow forever.
5. **Budget the shutdown as a sum.** `terminationGracePeriodSeconds` must exceed `preStop`
   plus the application's own drain, with margin. It is one countdown, not one per stage;
   overrun means SIGKILL mid-request.
6. **Enumerate the in-flight work that is not an HTTP request** — Kafka consumers,
   `@Scheduled` jobs, executors, queue leases — and give each an explicit stop. See
   `references/draining-non-http-work.md`. Then check the disruption path: a
   PodDisruptionBudget plus `replicas: 1` is zero availability during any voluntary
   disruption _and_ a drain that never completes.

## Probe decision block

```text
Use a liveness probe when:
- the process has a reachable state that only a restart clears — a deadlock, an
  exhausted internal thread pool, a wedged event loop — and you can detect it in process.
Avoid a liveness probe when:
- the check touches a database, a cache, a broker or another service. A shared dependency
  makes every replica fail simultaneously, which is a correlated failure you built.
- you cannot name the in-process condition it detects. Then it has no signal, only risk;
  omitting liveness entirely is a legitimate configuration.
Use a readiness probe when:
- the pod can be temporarily unable to serve while still being worth keeping — warming a
  cache, reconnecting, or shedding under local overload.
Avoid putting a hard dependency in readiness when:
- the whole fleet shares it. All replicas leave the endpoint list at once and the Service
  has no backends, which is worse than serving degraded responses.
Prefer a startup probe instead when:
- boot time varies with data volume, cluster load or CPU throttling, i.e. whenever you
  would otherwise have guessed initialDelaySeconds.
```

## Rules

- A failing readiness probe removes the pod from Service endpoints and never restarts the
  container; a failing liveness probe restarts it. Choosing the wrong one turns a routing
  decision into a restart storm.
- The probe endpoint must do no business work and have **no side effect**. It runs on every
  pod every `periodSeconds` forever: a query inside it is permanent background load, and a
  write inside it is a bug the kubelet triggers on a schedule.
- `timeoutSeconds` shorter than the check's own worst case makes the probe fail under exactly
  the load it exists to survive — a 1 s timeout on a check with a p99 of 900 ms fails
  whenever the service is busy. `successThreshold` must be 1 for liveness and startup probes;
  Kubernetes rejects any other value there.
- **SIGTERM and endpoint removal are concurrent, not ordered.** The kubelet begins
  termination while the EndpointSlice controller and every kube-proxy or ingress data plane
  are still converging, so a pod receives new connections _after_ SIGTERM. A `preStop` that
  sleeps a few seconds is the standard fix — a fix for a race, not for slow shutdown.
- The native `sleep` preStop action arrived in Kubernetes 1.29 and is on by default from
  1.30. On older clusters `preStop` must be `exec` with a real `sleep` binary, which a
  distroless or scratch image does not contain, so the hook fails silently.
- `preStop` runs **inside** `terminationGracePeriodSeconds`, not before it. A 30 s grace
  period with a 20 s preStop leaves the application 10 s, then SIGKILL.
- Spring Boot's `server.shutdown` defaults to `immediate`; draining requires
  `server.shutdown=graceful`, and the window is `spring.lifecycle.timeout-per-shutdown-phase`.
  Setting the first without checking the second gives a silently capped drain.
- A container killed by the grace period expiring and one killed by the memory limit both
  exit **137**; only the pod status distinguishes them, via `reason: OOMKilled`. Heap sizing
  against that limit is `container-awareness` — do not re-derive it here.
- A CPU limit throttles the JVM hardest during startup, its most CPU-hungry phase. A startup
  budget tuned on an unthrottled machine fails in the cluster and produces a CrashLoopBackOff
  that looks like an application fault; the throttling evidence is `linux-for-jvm`.
- A rolling update runs two versions concurrently by design. The API contract consequence is
  `rpc-and-api-contracts`; the _data_ consequence is yours — a schema change must be readable
  by both versions at once.
- A PodDisruptionBudget constrains only **voluntary** disruptions routed through the Eviction
  API. It does not protect against a node crash, a direct pod delete, or the Deployment's own
  `maxUnavailable`, and `minAvailable: 1` with `replicas: 1` blocks every node drain forever.
- Never claim a rolling update is zero-downtime because the manifest has a readiness probe.
  Prove it: run a continuous open-loop client through a deploy and count non-2xx responses.

## References

- [Probe and shutdown configuration](references/probe-and-shutdown-configuration.md) — a
  correct three-probe manifest fragment with the timing arithmetic derived, the
  preStop/grace-period/drain budget as one sum, and the Spring Boot properties and Actuator
  health groups behind it. Read when writing or reviewing a Deployment, or when a probe
  setting is being changed.
- [Draining work that is not an HTTP request](references/draining-non-http-work.md) —
  Kafka consumers, `@Scheduled`, executor shutdown, Spring's stop ordering, and a concrete
  test that proves a shutdown actually drains. Read when the service consumes a queue, runs
  scheduled work, or owns its own threads.
