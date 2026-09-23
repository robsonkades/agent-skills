---
name: sidecar-pattern
description: >
  Composing a second container into the same pod to add a capability to a container you
  cannot or will not modify: the shared network namespace and volumes that make this
  different from a library, native sidecar containers (an init container with restartPolicy
  Always) and the startup and shutdown ordering they fix, per-container requests against
  pod-level QoS, and the failure matrix of a two-container pod. Use when a proxy, TLS
  terminator, config reloader or log shipper is added beside an application, when requests
  fail in the first seconds after a pod starts because the app came up before its proxy,
  when a Job's pod stays Running because the sidecar never exits, or when a sidecar is up
  but broken and the app cannot tell. Does not cover probes and graceful shutdown
  (kubernetes-service-lifecycle), mediating outbound traffic (ambassador-pattern),
  normalising what the app emits (adapter-sidecar-pattern), or JVM cgroup detection
  (container-awareness).
---

# Sidecar Pattern

## Purpose

A sidecar can deliver a capability independently of the application's language/build,
including when you own the application but need separate process or operational ownership. The pod is the
mechanism — one scheduling unit, one network namespace so `localhost` reaches the peer, and
volumes both containers can mount — and that is the whole reason a sidecar can wrap a binary
no library could reach.

The failure this prevents is the sidecar adopted as though it were free. It is a second
process with its own memory, its own patch cadence and its own lifecycle, multiplied by every
replica; and unless it is declared as a **native sidecar**, the pod gives no ordering
guarantee between it and the application at either edge of the pod's life — so the app can
serve before the proxy is up, and the proxy can exit while the app is still draining.

## Target and evidence

Inspect cluster/API/kubelet versions, feature gates, injected containers, controller rollout
policy and effective resources. Preserve the deployed Java baseline (the HttpClient sketch
requires Java 11+) and cluster policy; the skill does not authorize upgrades. Missing probe,
resource or traffic evidence is unknown. Use the steps needed for the question and reuse adequate
evidence. A narrow API/lifecycle explanation or an adequate existing boundary need not trigger a
new placement campaign. Return the supported keep/change conclusion and material limits; for a
placement or lifecycle change, include the relevant capability, failure and resource contracts.

## Workflow

1. **Name the capability and its ownership.** When application changes are possible, compare a
   maintained library with required process isolation, rollout, language coverage and failure
   containment. Owning the code does not settle placement. Read
   `references/sidecar-or-node-agent.md` when choosing or reconsidering placement.
2. **Choose the unit of deployment**: per pod (sidecar), per node (DaemonSet), or in process.
   Per-pod cost is paid once per replica; per-node cost once per node. Compare that cost only
   after capability, security, hard capacity and failure constraints are satisfied.
3. **When the cluster supports it, prefer a native sidecar** — an init container with
   `restartPolicy: Always` — when startup, termination or Job completion ordering matters, so
   the kubelet starts it before the app containers and terminates it after them. Alpha in
   Kubernetes 1.28, on by default from 1.29, stable in 1.33. The shutdown ordering described
   here applies from 1.29; 1.28 alpha had different termination behavior but can support a
   startup-only requirement with its gate enabled. Verify effective node and API versions,
   feature gates and admission compatibility, especially during mixed-version rollouts.
4. **Set resources from demand and cluster policy.** Account for requests, enforced memory/CPU
   bounds, burst needs and effective QoS. A deliberate policy can omit CPU limits to avoid
   throttling while accepting the resulting QoS; do not impose Guaranteed at any cost.
5. **Write down the coupling surface** — listener/protocol, shared mounts and any deliberately
   exposed management/agent or process-namespace interface. Specify identity, permissions and
   lifetime. Filesystems and the PID namespace are not shared unless configured.
6. **Decide what the app does when the sidecar is up and answering wrongly.** A crash loop is
   visible to Kubernetes; a gray failure needs meaningful probes and request-path telemetry.
7. **Retain container identity alongside Pod totals** for relevant restarts, memory, CPU and
   request-path evidence, so an aggregate does not hide the responsible process.

## Decision block

```text
Use a sidecar when:
- the capability must apply uniformly to services in languages you do not all own, so a
  library would have to be written and kept in step N times;
- the workload is a vendor or legacy image you cannot rebuild;
- the policy must ship on its own cadence, independent of the application release.
Avoid a sidecar when:
- an adequate library meets the isolation/ownership and latency contract with less total cost;
- required application state has no supported, authorized exposure. Deliberate JMX/JVMTI,
  agent or shared-PID integration can expose selected state, with its own security/lifecycle cost;
- the peak resource budget cannot fit or is not justified. Illustratively, 128 MiB across
  300 replicas is 37.5 GiB; requests, limits and observed working set are different quantities.
Prefer a node agent (DaemonSet) instead when:
- the input is already at the node boundary — stdout, node metrics, host network — so one
  process per node replaces N per pod;
- the agent can enforce required workload identity, isolation and policy within node capacity;
  fleet size or a read-only capability alone does not establish that.
Prefer changing the application instead when:
- you own the code, the capability sits on the request path, and the latency budget is tight
  enough that a loopback hop is measurable against it.
```

## Rules

- `localhost` between two containers of one pod is a loopback network call, not a function
  call: it has a connect timeout, a read timeout, a queue and its own failure mode. A client
  pointed at `127.0.0.1` with default (often unbounded) timeouts is the same bug as one
  pointed across a datacentre.
- Containers in a pod **share the port space**. Conflicting address/port/protocol bindings
  collide; different addresses or protocols can coexist. Allocate listeners explicitly.
- Ordinary containers have **no ordering guarantee**. The kubelet does not wait for one app
  container to become ready before starting the next, and gives no defined termination order
  between them. An explicit bounded application readiness/retry and shutdown protocol can
  satisfy the dependency contract; it does not add kubelet ordering. A fixed sleep is not
  readiness evidence. An ordinary init step cannot wait for a regular app container that
  only starts after init completion.
- A supported native sidecar on Kubernetes 1.29+ provides **ordering relative to the app containers**: started first,
  stopped after app containers during graceful termination, and restarted independently even when the pod's `restartPolicy` is `Never`
  or `OnFailure`. Without a startupProbe, started means its process is running, not that it
  can serve. Its startupProbe must not depend on the app or a later init container: neither
  can start until that gate passes. Readiness affects Pod readiness, not initial startup ordering. Termination shares
  the Pod grace budget; node failure or force-kill cannot guarantee an ordered graceful drain.
- In a `Job`, a running ordinary helper can prevent successful completion after the main
  containers finish. A native sidecar does not block
  completion after app containers finish. An ordinary helper can also terminate through a
  supported completion/failure protocol; inspect all containers and effective Job policy.
- Under traditional container-level resources, adding a container without matching non-zero
  CPU and memory requests/limits drops the pod out of **Guaranteed** QoS. Kubernetes 1.34+
  can instead classify from Pod-level resources when that beta feature is enabled. Verify the
  effective cluster policy. QoS can help estimate memory-pressure eviction risk; the kubelet
  ranks using requests, priority and actual usage, not the QoS label itself.
- A container-cgroup OOM is often localized, but inspect killed processes, cgroup level and
  node evidence. Pod-level limits, node OOM or eviction can affect the app too. Restart follows
  the effective container policy; native sidecars use Always during Pod life. Sizing the JVM
  under its actual limit is `container-awareness`.
- A crash-looping sidecar is loud (`RESTARTS` climbs, events fire). A sidecar that is up and
  broken is a **gray failure**: without meaningful probes Kubernetes may see a healthy
  container. Observe errors, latency and correctness against the peer. A sidecar readiness
  probe affects the whole Pod; choose that routing policy deliberately — probe semantics
  are `kubernetes-service-lifecycle`.
- The app must survive a sidecar restart. Bound connect/request timeouts and make the pool evict
  failed or closed connections; validation on borrow is one option, with an extra round trip or
  health-check cost, not a universal requirement.
- Use `kubectl logs -c <container>` explicitly to select the peer; defaults/annotations may
  otherwise select a container. Inspect metric identity and aggregation: a missing container
  label does not itself imply summation or identify which process was measured.
- Qualify "transparent": unchanged application code or API does not establish zero resource,
  latency or failure cost. Identify the actual interface, dependency and degradation policy;
  measure the relevant cost before claiming a performance benefit.

## References

- [Lifecycle and composition mechanics](references/lifecycle-and-composition.md) — native
  versus ordinary sidecar with a manifest fragment, startup and shutdown ordering, the Job
  case, shared-volume lifetime and localhost contracts, init-phase resource accounting, pod QoS, and the failure
  matrix. Read when writing or reviewing a two-container pod.
- [Sidecar, library, node agent or nothing](references/sidecar-or-node-agent.md) — the four
  options with the observable condition that selects each, and what each really costs in
  memory, latency, patching and image sprawl. Read before adding the second container, and
  whenever the sidecar count per pod is growing.
