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
resource or traffic evidence is unknown. Return the selected placement, lifecycle/failure
contract, peak resource cost, validation performed and remaining operational checks.

## Workflow

1. **Name the capability and why the application cannot carry it.** "A library exists in our
   language and we own the code" is the lower-operational-cost baseline; compare isolation,
   rollout, language coverage and failure containment before rejecting it. Read
   `references/sidecar-or-node-agent.md` before continuing.
2. **Choose the unit of deployment**: per pod (sidecar), per node (DaemonSet), or in process.
   Per-pod cost is paid once per replica; per-node cost once per node. That ratio is usually
   the decision, not elegance.
3. **When the cluster supports it, prefer a native sidecar** — an init container with
   `restartPolicy: Always` — when startup, termination or Job completion ordering matters, so
   the kubelet starts it before the app containers and terminates it after them. Alpha in
   Kubernetes 1.28, on by default from 1.29, stable in 1.33. Check the cluster version before
   relying on it; feature-gate and API compatibility must be verified during admission and
   rollout on mixed-version clusters.
4. **Give it `requests` and `limits`.** They are per container, but the QoS class and node
   pressure eviction are per pod, so an unbounded sidecar degrades the app's scheduling.
5. **Write down the coupling surface** — which `localhost` port, which shared volume, and
   nothing else. Filesystems and the PID namespace are not shared unless you ask for it.
6. **Decide what the app does when the sidecar is up and answering wrongly.** A crash loop is
   visible to Kubernetes; a gray failure needs meaningful probes and request-path telemetry.
7. **Instrument per container**, not per pod: restarts, memory and CPU broken out by
   container name, or the sidecar's regression stays invisible inside the pod's totals.

## Decision block

```text
Use a sidecar when:
- the capability must apply uniformly to services in languages you do not all own, so a
  library would have to be written and kept in step N times;
- the workload is a vendor or legacy image you cannot rebuild;
- the policy must ship on its own cadence, independent of the application release.
Avoid a sidecar when:
- one language, code you own, and a library already does it — you are paying a container, a
  loopback hop, a memory floor per replica and a lifecycle problem to avoid a dependency;
- the sidecar must see the app's in-process state — heap, threads, session objects — which
  no volume or socket exposes;
- the added memory times the replica count is a bigger number than the problem: 128 MiB
  across 300 replicas is roughly 37 GiB of cluster memory for one capability.
Prefer a node agent (DaemonSet) instead when:
- the input is already at the node boundary — stdout, node metrics, host network — so one
  process per node replaces N per pod;
- the fleet is large and the capability is uniform and read-only.
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
  between them. Every "start the proxy first" hack — a sleep, a retry loop, an init container
  that polls — is a workaround for that missing guarantee, not a fix for it.
- A native sidecar guarantees **ordering relative to the app containers**: started first,
  stopped after app containers during graceful termination, and restarted independently even when the pod's `restartPolicy` is `Never`
  or `OnFailure`. Without a startupProbe, started means its process is running, not that it
  can serve. Readiness affects Pod readiness, not initial startup ordering. Termination shares
  the Pod grace budget; node failure or force-kill cannot guarantee an ordered graceful drain.
- In a `Job`, an ordinary sidecar that never exits keeps the pod `Running` forever and the
  Job never completes. This is the most common reason a batch pod hangs at 1/2 containers
  ready. A native sidecar is terminated by the kubelet once the last app container exits,
  which is the fix.
- Under traditional container-level resources, adding a container without matching non-zero
  CPU and memory requests/limits drops the pod out of **Guaranteed** QoS. Kubernetes 1.34+
  can instead classify from Pod-level resources when that beta feature is enabled. Verify the
  effective cluster policy; QoS influences node-pressure eviction preference but is not an
  absolute eviction order independent of requests, priority and actual usage.
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
- Never justify a sidecar as "transparent to the application". It adds latency, a startup
  dependency and a new failure mode. If you cannot say which of the three you measured, the
  claim is unfalsifiable.

## References

- [Lifecycle and composition mechanics](references/lifecycle-and-composition.md) — native
  versus ordinary sidecar with a manifest fragment, startup and shutdown ordering, the Job
  case, the shared-volume and localhost contract, requests against pod QoS, and the failure
  matrix. Read when writing or reviewing a two-container pod.
- [Sidecar, library, node agent or nothing](references/sidecar-or-node-agent.md) — the four
  options with the observable condition that selects each, and what each really costs in
  memory, latency, patching and image sprawl. Read before adding the second container, and
  whenever the sidecar count per pod is growing.
