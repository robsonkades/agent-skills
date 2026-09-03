# Sizing heap and CPU limits

## Fixed `-Xmx` or `MaxRAMPercentage`

| Criterion                                    | Fixed `-Xmx` / `-Xms`                             | `MaxRAMPercentage` / `MinRAMPercentage`                          |
| -------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| One image across pods of different sizes     | Needs one image or config per size                | Scales automatically with `limits.memory`                        |
| Predictability of native headroom            | High — you know exactly what is left outside heap | Low — 25% of 512Mi and 25% of 8Gi leave very different absolutes |
| Limits changed while JVM is running          | Heap maximum does not automatically recompute     | Percentage was resolved at startup; restart is normally required |
| Native footprint already measured and stable | Preferred — size from the NMT figure              | Acceptable, but revalidate the real headroom                     |

Working rule: start with `MaxRAMPercentage` where pod sizes vary or a vertical autoscaler
is in play; move to fixed `-Xmx`/`-Xms` once NMT has measured the native footprint and you
want maximum predictable heap. Never set `-Xmx` numerically equal to `limits.memory`.

## Memory headroom procedure

1. Run under representative load with `-XX:NativeMemoryTracking=summary`.
2. Collect `jcmd <pid> VM.native_memory summary` **at peak usage**, not at boot.
3. Reconcile NMT committed categories with process RSS/PSS and cgroup `memory.stat`. Do not
   sum reservations or equate NMT committed with resident/charged memory.
4. Set `limits.memory` with margin over measured high-water behavior, covering plausible load
   variation — more connections, more dynamically generated classes.
5. Re-measure after any library, framework or load-pattern change. Native footprint is not
   static.

Why no fixed multiplier works: native footprint is driven by thread count, dynamically
generated classes, allocators, agents and direct buffers, while cgroups can charge cache and
kernel memory that NMT does not own. These are application/runtime properties, not a fixed
function of `Xmx`.

## CPU limit procedure

1. Measure deltas of `nr_periods`, `nr_throttled` and `throttled_usec` over a timestamped
   peak-load window.
2. Use `Δnr_throttled / Δnr_periods` for frequency and
   `Δthrottled_usec / elapsed_usec` for denied time, then correlate with runnable demand and
   latency. There is no universal percentage threshold.
3. Before changing collector, check the simpler hypothesis: `limits.cpu` is too low for the
   parallelism the JVM is already trying to use, with GC threads, JIT compiler threads and
   application threads competing for the same small quota.
4. A different collector changes pause/concurrent CPU shape but cannot create quota. Compare
   total CPU, p99, allocation headroom and throttling under the same workload before treating
   collector selection as mitigation.
5. Validate by repeating the `nr_throttled` measurement under the same load.

## Deployment review checklist

Before a new Deployment ships:

- [ ] Memory request/limit and CPU request/optional limit chosen explicitly. Omitting a CPU
      limit can avoid quota throttling but requires fair multi-tenant controls and capacity
      policy; declaring one caps runaway CPU but can worsen tails.
- [ ] `-Xmx` or `MaxRAMPercentage` chosen from the criteria above, not copied from another
      service.
- [ ] If `-Xmx` is fixed, an NMT measurement exists that supports the `limits.memory` value.

During an OOM incident:

- [ ] Local `oom_kill` delta correlated with this container's terminated status and time;
      otherwise investigate runtime, signals and node pressure.
- [ ] Heap usage at the moment of the kill known: near `Xmx`, or well below it (which
      points at native footprint).
- [ ] NMT summary collected close to the incident, not only at boot.

When measuring throttling:

- [ ] Counters read from the correct cgroup v2 path, with no `/cpu/` subdirectory.
- [ ] Measurement window correlated by timestamp with the client-side latency spikes.
- [ ] The "limits.cpu is simply too small" hypothesis explicitly ruled out.

After any adjustment:

- [ ] The metric that motivated the change re-measured under the same load.
- [ ] No regression on another axis — a larger heap that returns native headroom to where
      it started is not an improvement.
