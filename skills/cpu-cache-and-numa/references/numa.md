# NUMA

## Verify the topology first

```bash
numactl --hardware        # if there is only one node, there is nothing to tune
```

On a virtual machine presenting a single node to the guest, `-XX:+UseNUMA` fragments TLAB
allocation for no locality gain. That is the worst class of configuration: silently
accepted, doing nothing, and producing the feeling of having solved something.

## The costs involved

Local DRAM is ~80–100 ns; remote DRAM is ~150–300 ns — a factor of 2–3×. The ~10 ns
sometimes quoted in NUMA discussions is **cache** latency, not memory latency, and using it
makes the remote penalty look catastrophic rather than significant.

## Which collectors respond to the flag

`-XX:+UseNUMA` is implemented by **Parallel GC and G1 only** (JEP 345, JDK 14, Linux), and
it improves **allocation** locality — where new objects are placed — not the locality of
everything already on the heap.

ZGC is NUMA-aware by default, with no flag. It also **disables that logic by itself** when
the process is confined to a CPU subset — which is exactly the case for any container with
a `cpuset`, `taskset` or `isolcpus`. So on a NUMA host, a containerised ZGC process may
have NUMA awareness silently off; check before assuming it is active.

With Serial or Shenandoah, the flag is accepted and produces no effect.

## Measuring

```bash
numastat -p <pid>     # local_node vs other_node
```

`other_node` above roughly 10% indicates remote access worth investigating. Measure it
before and after any change — this is the only number that says whether the change did
anything.

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
- [ ] `numastat -p <pid>` shows `other_node` below ~10%
- [ ] The collector in use actually responds to `-XX:+UseNUMA` (Parallel or G1) — and if it
      is ZGC, that its default awareness has not been switched off by CPU confinement
- [ ] Pinning with `numactl` evaluated as an alternative to distributing
- [ ] `numastat` measured before **and** after the change
