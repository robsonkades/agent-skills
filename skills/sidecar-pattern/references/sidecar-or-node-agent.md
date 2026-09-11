# Sidecar, library, node agent, or nothing

Four ways to deliver the same capability. The choice is made by observable properties of the
fleet, not by architectural preference — and "nothing" is a real answer that is rarely on the
table when it should be.

## The four options against the conditions that select them

| Option                     | Select it when                                                                                                                                                    | Costs you                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Library, in process**    | A maintained implementation covers the required languages/call sites, ownership and isolation permit it, and its path cost fits the budget                        | A dependency in every service, coordinated upgrades, no process isolation — a bug in it can affect the app process    |
| **Sidecar, per pod**       | Separate per-Pod process/lifecycle is justified by language coverage, isolation or policy; workload identity alone does not decide placement                      | Memory and CPU per replica, a loopback hop, a second image to patch, an ordering problem, a second thing on the graph |
| **Node agent (DaemonSet)** | The input is already at the node boundary (stdout, cgroup metrics, host network) and required workload identity/policy can be isolated and enforced by that agent | One agent's failure affects every pod on the node; noisy-neighbour coupling; usually needs elevated host access       |
| **Nothing new**            | The platform already meets the requirement, or expected benefit does not justify cost; no past incident alone does not invalidate preventive controls             | Residual risk and continued reliance on existing controls; state what is accepted                                     |

## Resource arithmetic within the hard constraints

Per-pod cost scales with replicas; per-node cost scales with nodes. For a fleet of 40
services at an average of 8 replicas on 25 nodes:

```
sidecar at 128 MiB:   40 × 8 × 128 MiB  ≈ 40 GiB
node agent at 512 MiB:     25 × 512 MiB ≈ 12.5 GiB
```

The illustrative sidecar total is 3.2 times the agent total; actual growth depends on node
and replica scaling, packing and workload. These are assumed per-instance costs, not measurements
or proof either placement satisfies capacity, privilege or failure constraints. A node agent can maintain distinct workload
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
  can diverge. Give version/configuration ownership an effective mechanism: a supported injector,
  controller or managed template may fit. Injection is not the only way to maintain consistency.
- **A hop, priced honestly.** Connection reuse, scheduling, serialization, TLS and policy
  processing determine cost; no generic microsecond range is a capacity input. Measure with a
  workload model matching production: independent arrivals need offered/start/outcome evidence,
  while a real completion-paced population can use a closed model. The aggregation discipline
  is `latency-statistics`.
- **A wider blast radius per pod.** Two processes that can each fail means the pod's
  availability requires joint success when both are required. Multiplying availabilities
  assumes independent failures and aligned definitions; shared nodes/resources correlate
  them. Degradation policy changes which failures affect the user.
- **Debugging cost.** Every incident now begins with "which container?" — and that question is
  only cheap if the logs and metrics were labelled by container from the start.

## Log shipping and placement

A per-pod log sidecar tailing a shared `emptyDir` requires a file path, bounded volume/rotation
and a shipper per replica. If the application can write to stdout and an existing node collector
meets the contract, retain that path. Per-Pod parsing differences alone do not require per-Pod
placement: an agent may already route by workload with adequate isolation and capacity. Choose
a sidecar when an actual access, capability, ownership, isolation or capacity constraint justifies
it, and account for volume-full, outage and flush behavior. The normalisation contract belongs
to `adapter-sidecar-pattern`.

## Reviewing an existing sidecar

Use the questions relevant to the review. Source/configuration can support a narrow contract
explanation; incident, cost and performance claims need corresponding runtime evidence. Keep an
adequate placement when its requirements are met.

- What is the sidecar's effect on request latency under a representative workload? Use
  matched traces or controlled comparisons; subtracting unrelated p99 values does not yield
  its causal contribution. Missing measurements leave the justification unknown.
- How many restarts per day per replica? A higher rate is a signal to inspect exit reasons, probes, rollouts and resources,
  not proof of a sizing bug.
- What is its memory working set versus its request? A request set to a round number nobody
  measured is how a fleet loses tens of gibibytes.
- If the sidecar were stopped right now, what would the app do — fail closed, fail open, or
  hang? For a hang, inspect waits, deadlines and cancellation/recovery behavior before assigning
  a cause; a configured timeout may not cover the blocked phase.
- Is there a second sidecar doing an overlapping job (two log shippers, a mesh proxy plus a
  hand-rolled proxy)? Overlap is the signal that policy now lives in two places.

## Primary example

- [Istio 1.25.0 ztunnel architecture](https://github.com/istio/istio/blob/1.25.0/architecture/ambient/ztunnel.md)
  illustrates a node proxy selecting workload credentials; per-workload identity does not
  inherently require a per-Pod proxy. Verify the deployed implementation and policy scope.
