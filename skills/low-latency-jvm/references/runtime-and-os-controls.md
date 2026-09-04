# Runtime and OS controls

## Strategy table

| Strategy               | Buys                                   | Principal risk                          | Required evidence                      |
| ---------------------- | -------------------------------------- | --------------------------------------- | -------------------------------------- |
| GC-friendly            | lower allocation/live-set pressure     | residual collector/JIT/OS tails         | allocation and pause correlation       |
| low-pause collector    | bounded concurrent collection behavior | CPU/headroom and allocation stalls      | GC log/JFR under quota and burst       |
| Epsilon/GC-free window | no collection during run               | abrupt exhaustion and operational reset | allocation budget plus run horizon     |
| CPU/NUMA/IRQ placement | lower scheduling/locality variance     | starving runtime/kernel work            | topology, migrations, misses and tails |
| busy spin              | lower wake-up delay                    | dedicated CPU/power and interference    | distribution gain per reserved core    |
| kernel bypass          | removes kernel data path               | operational and native complexity       | kernel/network share of latency budget |

Use `allocation-profiling`, collector-specific skills, `jit-compilation`,
`numa-and-cpu-affinity`, `linux-for-jvm`, `tcp-tuning` and `io-uring-and-zero-copy` for mechanism
details. Keep every claim scoped to JDK, kernel, CPU topology and deployed library version.
