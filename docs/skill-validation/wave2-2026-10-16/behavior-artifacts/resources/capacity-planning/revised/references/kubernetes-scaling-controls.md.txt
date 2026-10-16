# Kubernetes scaling controls

Use this when a capacity decision must choose among replica scaling, per-pod sizing and an in-place
resource change.

| Control          | Decision it owns                                        | Does not prove                                |
| ---------------- | ------------------------------------------------------- | --------------------------------------------- |
| HPA              | desired replica count from observed signals             | one replica is correctly sized or schedulable |
| VPA              | recommended/requested resources per pod                 | the workload scales horizontally              |
| in-place resize  | applying supported resource changes without replacement | JVM startup ergonomics recompute              |
| rollout/recreate | replacing pods with a new startup envelope              | available capacity survives transition        |

Pin Kubernetes version, feature gates, cgroup version, autoscaler versions/modes and workload
controller. Read actual pod status and cgroup state; accepted YAML is only declared intent.

CPU HPA utilization is relative to requested CPU, so changing requests changes the controller's
input even if workload CPU is unchanged. CPU limits can add quota throttling; requests affect
scheduling and relative shares. QoS class concerns eviction and allocation policy, not a guarantee
of latency or CPU headroom.

Do not let VPA and HPA independently control the same CPU/memory resource metric without
checking the installed versions' supported interaction. VPA request changes can move the
HPA utilization denominator and create feedback unrelated to demand. Consider VPA
recommendation-only mode or an HPA custom/external signal whose relationship to demand has
been validated. Review the [VPA known limitations](https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/docs/known-limitations.md)
for the deployed version and replay both controllers together before enabling changes.

The JVM may observe a changed processor count while boot-derived GC, JIT, common-pool or scheduler
sizes remain fixed. Verify the exact JDK and effective runtime values; choose pod replacement when
those ergonomics must be recomputed. Test controller delay, metric delay, scheduling delay, warm-up,
rollout overlap, downscale and dependency capacity as one control loop.

## Transient dependency budgets

Check resource use at maximum scale during rollout, not just steady state. Starting pods
may open pools before readiness, and terminating pods may retain connections until cleanup.
[Kubernetes Deployment semantics](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#updating-a-deployment)
allow resource consumption beyond `replicas + maxSurge` while old pods terminate. Inspect
the deployed controller behavior, rollout policy and observed termination duration.

For each database endpoint, budget the sum of pool caps for all simultaneous connection
holders plus other services, jobs and administrative/failover reserves. Use different caps
for old/new versions when necessary. Pool caps are potential demand, not measured occupancy;
if relying on a smaller total, identify and test the enforced aggregate bound. Observing
mostly idle pools is insufficient protection against simultaneous growth.

Illustrative bound: ten pods with a cap of 20 plus 20 reserved connections require 220 in
steady state. If a transition allows two additional starting/surge pods and two terminating
holders, the bound becomes 300. Those overlap counts are scenario inputs, not Kubernetes
defaults or universal maxima. If the budget fails, compare lower overlap, smaller pools or
an enforced shared bound; recheck rollout availability and pool wait latency before choosing.
Pass pool tuning and transaction-hold diagnosis to `connection-pool-sizing`.

Primary references: versioned Kubernetes documentation for
[HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/),
[VPA](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler), and
[in-place resize](https://kubernetes.io/docs/tasks/configure-pod-container/resize-container-resources/).
