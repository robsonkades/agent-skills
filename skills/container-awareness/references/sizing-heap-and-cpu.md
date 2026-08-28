# Sizing heap and CPU limits

## Fixed `-Xmx` or `MaxRAMPercentage`

| Criterion                                       | Fixed `-Xmx` / `-Xms`                             | `MaxRAMPercentage` / `MinRAMPercentage`                          |
| ----------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| One image across pods of different sizes        | Needs one image or config per size                | Scales automatically with `limits.memory`                        |
| Predictability of native headroom               | High — you know exactly what is left outside heap | Low — 25% of 512Mi and 25% of 8Gi leave very different absolutes |
| Vertical autoscaling changing limits at runtime | Breaks silently; the heap does not follow         | Follows automatically                                            |
| Native footprint already measured and stable    | Preferred — size from the NMT figure              | Acceptable, but revalidate the real headroom                     |

Working rule: start with `MaxRAMPercentage` where pod sizes vary or a vertical autoscaler
is in play; move to fixed `-Xmx`/`-Xms` once NMT has measured the native footprint and you
want maximum predictable heap. Never set `-Xmx` numerically equal to `limits.memory`.

## Memory headroom procedure

1. Run under representative load with `-XX:NativeMemoryTracking=summary`.
2. Collect `jcmd <pid> VM.native_memory summary` **at peak usage**, not at boot.
3. Sum committed heap + metaspace + code cache + thread + the rest. That total, not `Xmx`,
   is the expected RSS.
4. Set `limits.memory` with margin over that measured total, covering plausible load
   variation — more connections, more dynamically generated classes.
5. Re-measure after any library, framework or load-pattern change. Native footprint is not
   static.

Why no fixed multiplier works: native footprint is driven by thread count, dynamically
generated classes and direct buffers — application properties, not heap properties. A
`1.5×` rule that holds for one service fails for another; a measured composite case
required `1.62×`.

## CPU limit procedure

1. Measure `nr_periods` and `nr_throttled` at expected peak load, never at idle.
2. A non-negligible `nr_throttled / nr_periods` ratio — tens of percent, as an order of
   magnitude, not zero — means the cgroup is being frozen often enough to matter.
3. Before changing collector, check the simpler hypothesis: `limits.cpu` is too low for the
   parallelism the JVM is already trying to use, with GC threads, JIT compiler threads and
   application threads competing for the same small quota.
4. Collectors with more incremental concurrent phases (generational ZGC, generational
   Shenandoah — both in the JDK 25 baseline) spread CPU demand more evenly and reduce the
   chance of a burst exhausting the quota at once. That is mitigation, not a substitute:
   if sustained demand exceeds the quota, throttling returns whatever the collector.
5. Validate by repeating the `nr_throttled` measurement under the same load.

## Deployment review checklist

Before a new Deployment ships:

- [ ] `resources.requests` and `resources.limits` declared for both CPU and memory.
- [ ] `-Xmx` or `MaxRAMPercentage` chosen from the criteria above, not copied from another
      service.
- [ ] If `-Xmx` is fixed, an NMT measurement exists that supports the `limits.memory` value.

During an OOM incident:

- [ ] `oom_kill` confirmed in the cgroup's own `memory.events` — otherwise it is node-level
      pressure and belongs to the host layer.
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
