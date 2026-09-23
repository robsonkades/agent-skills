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

Use `allocation-profiling`, collector-specific skills, `jit-compilation`, `deoptimization`, `safepoints`,
`numa-and-cpu-affinity`, `linux-for-jvm`, `tcp-tuning` and `io-uring-and-zero-copy` for mechanism
details. Keep every claim scoped to JDK, kernel, CPU topology and deployed library version.

Epsilon removes reclamation, not all VM activity: HotSpot JDK 25 can still enter metadata-related
safepoints. A bounded finite process can finish without replacement; a continuously running service
needs a tested handoff/restart horizon, memory margin and overload behavior. Heap allocation budget
does not cover all native memory or cgroup charges. See the
[JDK 25 implementation](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/epsilon/epsilonHeap.cpp).

## Choose a waiting policy with its CPU budget

Before selecting continuous spin, identify the producer/consumer threads, allowed CPUs, SMT
siblings and the capacity left for GC, JIT and OS work. Affinity restricts where a thread may run;
it does not reserve execution time. For Linux cgroup v2 under the fair scheduler, inspect effective
`cpu.max` limits, including ancestors, and timed `cpu.stat` throttling deltas. A wide CPU set can
still share a small bandwidth budget. Missing host/quota evidence leaves the isolation claim
unverified; it does not justify assuming dedicated cores.

| Policy                  | Candidate when                                                                                                 | Reason to reconsider                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Continuous spin         | Measured wake-up cost dominates the target, and capacity is reserved for the waiter, producer and runtime work | Quota throttling, shared CPU contention, long idle periods or lost throughput erase the tail benefit |
| Bounded spin, then park | Short waits are common but consuming a core throughout long waits is unjustified                               | The spin budget consumes capacity without avoiding parks, or park/wake races break progress          |
| Blocking wait           | CPU sharing, idle periods or power limits matter and measured wake-up tails meet the objective                 | Wake-up delay is an evidenced budget violation with capacity available for an alternative            |

Reuse the queue/library's supported wait strategy where adequate. Choose any spin budget from
measured wait distributions and resource limits; no iteration count or nanosecond threshold is
portable. A dedicated-core result does not establish the same benefit in a CPU-limited container.
Compare idle-to-burst latency, throughput, throttling and CPU cost as well as steady-state tails;
exercise a stalled producer and shutdown so the optimization cannot turn absent work into an
unbounded wait.

`Thread.onSpinWait()` (Java 9+) is an optional runtime hint, not a promise to yield CPU or a
replacement for volatile/atomic publication. For a park-based strategy, preserve the queue's
predicate/notification protocol, recheck the predicate after wake-up (including spurious returns),
and honor interruption/deadline semantics. Changing the waiting policy cannot repair a data race.
This skill chooses the policy and acceptance evidence; synchronization implementation still needs
its own correctness review.

Sources: [Linux cgroup v2 CPU interface](https://docs.kernel.org/admin-guide/cgroup-v2.html#cpu-interface-files),
[Java 25 `Thread.onSpinWait`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Thread.html#onSpinWait()>),
and [Java 25 `LockSupport`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/LockSupport.html).
