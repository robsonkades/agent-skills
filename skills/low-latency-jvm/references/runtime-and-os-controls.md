# Runtime and OS controls

## Strategy table

| Strategy               | Buys                                       | Principal risk                          | Required evidence                      |
| ---------------------- | ------------------------------------------ | --------------------------------------- | -------------------------------------- |
| GC-friendly            | lower allocation/live-set pressure         | residual collector/JIT/OS tails         | allocation and pause correlation       |
| low-pause collector    | shorter collector pauses as an objective   | CPU/headroom and allocation stalls      | GC log/JFR under quota and burst       |
| Epsilon/GC-free window | no collection during run                   | abrupt exhaustion and operational reset | allocation budget plus run horizon     |
| CPU/NUMA/IRQ placement | lower scheduling/locality variance         | starving runtime/kernel work            | topology, migrations, misses and tails |
| busy spin              | lower wake-up delay                        | dedicated CPU/power and interference    | distribution gain per reserved core    |
| kernel bypass          | bypasses selected kernel packet processing | operational and native complexity       | kernel/network share of latency budget |

Use `allocation-profiling`, collector-specific skills, `jit-compilation`,
`numa-and-cpu-affinity`, `linux-for-jvm`, `tcp-tuning` and `io-uring-and-zero-copy` for mechanism
details. Keep every claim scoped to JDK, kernel, CPU topology and deployed library version.

Epsilon removes reclamation, not all VM activity: HotSpot JDK 25 can still enter metadata-related
safepoints. A bounded finite process can finish without replacement; a continuously running service
needs a tested handoff/restart horizon, memory margin and overload behavior. Heap allocation budget
does not cover all native memory or cgroup charges. See the
[JDK 25 implementation](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/epsilon/epsilonHeap.cpp).
