# NUMA

## Verify the topology first

```bash
numactl --hardware        # if there is only one node, there is nothing to tune
```

On a virtual machine presenting a single node to the guest, `-XX:+UseNUMA` fragments TLAB
allocation for no locality gain. That is the worst class of configuration: silently
accepted, doing nothing, and producing the feeling of having solved something.

## The costs involved

Remote access can add latency and consume interconnect bandwidth, but the magnitude depends
on this machine's distance matrix, CPU, memory channels, access pattern and concurrency.
Measure local/remote latency and bandwidth on the target host; do not transfer a published
nanosecond ratio into capacity arithmetic.

## Which collectors respond to the flag

`-XX:+UseNUMA` is implemented by **Parallel GC and G1 only** (JEP 345, JDK 14, Linux), and
it improves **allocation** locality — where new objects are placed — not the locality of
everything already on the heap.

ZGC has collector-specific NUMA work that is not governed by `UseNUMA`, and that behavior is
JDK-version-specific (allocation and relocation support have evolved). CPU confinement can
change the visible topology. Verify target-build logs/source and measure placement rather
than extrapolating the G1 flag contract.

With Serial or Shenandoah, the flag is accepted and produces no effect.

## Measuring

```bash
numastat -p <pid>     # local_node vs other_node
```

Per-process `numastat` reports where pages reside, not which CPUs access them or whether an
access was remote. Use it with CPU placement and PMU/topology evidence; no universal
`other_node` percentage proves a problem.

## Distributing versus pinning

Two strategies, and the choice depends on whether the workload fits in one node:

- **Distribute** (`-XX:+UseNUMA` under Parallel/G1): allocation follows the thread's node.
  Appropriate when the process legitimately spans nodes.
- **Pin** (`numactl --cpunodebind=0 --membind=0`): confine the process to one node.
  Appropriate when it fits, and usually simpler and more predictable.

A diagnostic signal for the choice: if the scalability curve's knee coincides with the core
count of a single node, the workload is crossing the node boundary and pinning is worth
evaluating.

## Checklist for multi-socket systems

- [ ] `numactl --hardware` confirms more than one node
- [ ] The scalability knee coincides with one node's core count
- [ ] Per-process page residence interpreted with CPU placement and access evidence, without
      a universal `other_node` threshold
- [ ] The collector in use actually responds to `-XX:+UseNUMA` (Parallel or G1) — and if it
      is ZGC, that its default awareness has not been switched off by CPU confinement
- [ ] Pinning with `numactl` evaluated as an alternative to distributing
- [ ] `numastat` measured before **and** after the change
