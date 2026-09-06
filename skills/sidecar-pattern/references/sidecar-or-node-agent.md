# Sidecar, library, node agent, or nothing

Four ways to deliver the same capability. The choice is made by observable properties of the
fleet, not by architectural preference — and "nothing" is a real answer that is rarely on the
table when it should be.

## The four options against the conditions that select them

| Option                     | Select it when                                                                                                                                                    | Costs you                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Library, in process**    | One or two languages, you own every call site, the capability is on the hot path, and the latency budget is tight                                                 | A dependency in every service, coordinated upgrades, no isolation — a bug in it is a bug in the app process           |
| **Sidecar, per pod**       | Separate per-Pod process/lifecycle is justified by language coverage, isolation or policy; workload identity alone does not decide placement                      | Memory and CPU per replica, a loopback hop, a second image to patch, an ordering problem, a second thing on the graph |
| **Node agent (DaemonSet)** | The input is already at the node boundary (stdout, cgroup metrics, host network) and required workload identity/policy can be isolated and enforced by that agent | One agent's failure affects every pod on the node; noisy-neighbour coupling; usually needs elevated host access       |
| **Nothing new**            | The platform already meets the requirement, or expected benefit does not justify cost; no past incident alone does not invalidate preventive controls             | Residual risk and continued reliance on existing controls; state what is accepted                                     |

## The arithmetic that usually decides it

Per-pod cost scales with replicas; per-node cost scales with nodes. For a fleet of 40
services at an average of 8 replicas on 25 nodes:

```
sidecar at 128 MiB:   40 × 8 × 128 MiB  ≈ 40 GiB
node agent at 512 MiB:     25 × 512 MiB ≈ 12.5 GiB
```

The illustrative sidecar total is 3.2 times the agent total; actual growth depends on node
and replica scaling, packing and workload. A node agent can maintain distinct workload
identities; it must prove isolation, credential protection and policy attribution. Do not
confuse one agent per node with one shared identity for all workloads.

Do the same arithmetic for CPU requests, because a `100m` request on every sidecar is 32 whole
cores of requested capacity across that fleet whether or not it is used.

## Costs that do not appear in a resource request

- **A second supply chain.** The sidecar image has its own CVEs and its own release cadence. A
  Deployment template change commonly replaces Pods, restarting apps too. Updating a native
  sidecar image in an existing supported Pod can restart that container only; inspect the
  actual controller/update mechanism and compatibility.
- **Image sprawl.** Every pod spec grows a container block. Left to teams, the sidecar list
  diverges — three versions of the same proxy in one namespace is the normal end state
  without an admission-time injector to own it.
- **A hop, priced honestly.** Connection reuse, scheduling, serialization, TLS and policy
  processing determine cost; no generic microsecond range is a capacity input. Measure with an
  open-loop client; the aggregation discipline is `latency-statistics`.
- **A wider blast radius per pod.** Two processes that can each fail means the pod's
  availability requires joint success when both are required. Multiplying availabilities
  assumes independent failures and aligned definitions; shared nodes/resources correlate
  them. Degradation policy changes which failures affect the user.
- **Debugging cost.** Every incident now begins with "which container?" — and that question is
  only cheap if the logs and metrics were labelled by container from the start.

## Log shipping, the case that is usually decided wrong

A per-pod log sidecar tailing a shared `emptyDir` is the textbook example and is the wrong
default in most fleets: the app must write to a file instead of stdout, the volume can fill,
and you pay a shipper per replica. If the application can write to stdout, the container
runtime already collects it and a node agent reads it once per node. Choose the sidecar form
only when the app cannot be made to write to stdout, when a single pod's log volume is large
enough to hurt the shared node agent, or when per-pod parsing rules differ. The normalisation
question inside that decision belongs to `adapter-sidecar-pattern`.

## Reviewing an existing sidecar

Ask these against the running system, not the design document:

- What is the sidecar's effect on request latency under a representative workload? Use
  matched traces or controlled comparisons; subtracting unrelated p99 values does not yield
  its causal contribution. Missing measurements leave the justification unknown.
- How many restarts per day per replica? A higher rate is a signal to inspect exit reasons, probes, rollouts and resources,
  not proof of a sizing bug.
- What is its memory working set versus its request? A request set to a round number nobody
  measured is how a fleet loses tens of gibibytes.
- If the sidecar were stopped right now, what would the app do — fail closed, fail open, or
  hang? A "hang" answer means a missing timeout, not a missing sidecar.
- Is there a second sidecar doing an overlapping job (two log shippers, a mesh proxy plus a
  hand-rolled proxy)? Overlap is the signal that policy now lives in two places.

## Primary example

- [Istio ztunnel architecture](https://github.com/istio/istio/blob/master/architecture/ambient/ztunnel.md)
  illustrates a node proxy selecting workload credentials; per-workload identity does not
  inherently require a per-Pod proxy. Verify the deployed implementation and policy scope.
