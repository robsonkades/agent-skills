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

The JVM may observe a changed processor count while boot-derived GC, JIT, common-pool or scheduler
sizes remain fixed. Verify the exact JDK and effective runtime values; choose pod replacement when
those ergonomics must be recomputed. Test controller delay, metric delay, scheduling delay, warm-up,
rollout overlap, downscale and dependency capacity as one control loop.

Primary references: versioned Kubernetes documentation for
[HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/),
[VPA](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler), and
[in-place resize](https://kubernetes.io/docs/tasks/configure-pod-container/resize-container-resources/).
