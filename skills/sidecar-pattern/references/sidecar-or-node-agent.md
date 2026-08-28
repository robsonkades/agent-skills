# Sidecar, library, node agent, or nothing

Four ways to deliver the same capability. The choice is made by observable properties of the
fleet, not by architectural preference — and "nothing" is a real answer that is rarely on the
table when it should be.

## The four options against the conditions that select them

| Option                     | Select it when                                                                                                                              | Costs you                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Library, in process**    | One or two languages, you own every call site, the capability is on the hot path, and the latency budget is tight                           | A dependency in every service, coordinated upgrades, no isolation — a bug in it is a bug in the app process           |
| **Sidecar, per pod**       | Language-heterogeneous fleet, or an image you cannot rebuild; the capability needs per-pod identity (mTLS certificate, per-workload policy) | Memory and CPU per replica, a loopback hop, a second image to patch, an ordering problem, a second thing on the graph |
| **Node agent (DaemonSet)** | The input is already at the node boundary (stdout, cgroup metrics, host network) and no per-pod identity or per-pod policy is required      | One agent's failure affects every pod on the node; noisy-neighbour coupling; usually needs elevated host access       |
| **Nothing**                | The capability is speculative, the platform already provides it, or the problem it solves has never actually occurred in this fleet         | Nothing — this is the option a proposal must argue against, not skip                                                  |

## The arithmetic that usually decides it

Per-pod cost scales with replicas; per-node cost scales with nodes. For a fleet of 40
services at an average of 8 replicas on 25 nodes:

```
sidecar at 128 MiB:   40 × 8 × 128 MiB  ≈ 40 GiB
node agent at 512 MiB:     25 × 512 MiB ≈ 12.5 GiB
```

The sidecar is three times the memory here and it grows with traffic, because replica counts
grow and node counts grow more slowly. The number flips when the capability genuinely needs
per-pod identity — a workload certificate cannot be issued once per node — and that is the
argument that justifies a mesh sidecar despite the cost.

Do the same arithmetic for CPU requests, because a `100m` request on every sidecar is 4 whole
cores of reserved capacity across that fleet whether or not it is used.

## Costs that do not appear in a resource request

- **A second supply chain.** The sidecar image has its own CVEs and its own release cadence. A
  proxy patched across 300 pods is a fleet-wide rollout, and a rollout restarts application
  pods that had no reason to restart.
- **Image sprawl.** Every pod spec grows a container block. Left to teams, the sidecar list
  diverges — three versions of the same proxy in one namespace is the normal end state
  without an admission-time injector to own it.
- **A hop, priced honestly.** A loopback hop is typically tens to low hundreds of
  microseconds, plus whatever the sidecar itself does — TLS handshakes, parsing, policy
  evaluation — which is the part that actually shows up. Measure it before and after with an
  open-loop client; the aggregation discipline is `latency-statistics`.
- **A wider blast radius per pod.** Two processes that can each fail means the pod's
  availability is the product of two availabilities, not one, unless the app is written to
  degrade when the sidecar is gone.
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

- What is the sidecar's p99 contribution to the request path? If nobody has measured it, the
  latency justification is a guess in either direction.
- How many restarts per day per replica? A restart rate above the app's own is a sizing bug.
- What is its memory working set versus its request? A request set to a round number nobody
  measured is how a fleet loses tens of gibibytes.
- If the sidecar were stopped right now, what would the app do — fail closed, fail open, or
  hang? A "hang" answer means a missing timeout, not a missing sidecar.
- Is there a second sidecar doing an overlapping job (two log shippers, a mesh proxy plus a
  hand-rolled proxy)? Overlap is the signal that policy now lives in two places.
