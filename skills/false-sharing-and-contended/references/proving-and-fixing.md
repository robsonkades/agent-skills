# Proving and fixing false sharing

## Hypothesis table

| Hypothesis                       | Supporting observation                            | Discriminator                                 |
| -------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| true CAS/data contention         | same logical value and retries                    | shard semantics or locked baseline            |
| false sharing                    | independent writers, same line, coherence traffic | separate lines/owners without semantic change |
| ordinary cache capacity/locality | misses track working set/read access              | block/compact/locality change                 |
| scheduler/NUMA effect            | migration/socket/remote memory alignment          | controlled placement/first-touch              |
| GC/JIT/load confounder           | aligned runtime phase/work changes                | matched window and runtime evidence           |

## PMU protocol

Use `perf list`/tool discovery for the exact CPU. Event names and meaning differ by Intel/AMD/Arm,
kernel and perf version. Some useful coherence signals can distinguish local/remote HITM or snoop
responses, but may be unavailable in VMs/containers.

Record:

```text
CPU model/microcode, sockets/NUMA/SMT
event encoding and semantic source
user/kernel/process/CPU/cgroup scope
time enabled/running and multiplex ratio
sample period, lost samples, skid and symbol coverage
thread/core placement and migrations
```

Never substitute generic cache-miss counts for ownership invalidations without a stated limitation.

## Controlled perturbations

Choose one:

- place independent fields in verified contention groups;
- increase array stride/alignment;
- make updates owner-local and combine later;
- stripe independent cells;
- batch writes to reduce coherence frequency.

Hold algorithmic semantics, useful work, writer mapping and memory lifecycle constant as far as
possible. When a mitigation changes consistency (for example `LongAdder`), it is not a pure false-
sharing experiment; report the semantic factor.

## JMH shape

Use shared benchmark state and per-thread role state so each worker deterministically targets its
assigned logical variable. Include an invariant/result so updates are not eliminated. Avoid
`@Group` configurations whose actor ratios/slot mapping differ from production.

Run topology blocks:

```text
same physical core/SMT siblings
different cores same socket
different sockets/NUMA nodes
container cpuset/quota configuration
```

Not every environment permits reliable pinning. Record actual placement and report uncertainty.

## Result criteria

The claim “false sharing materially caused the regression” requires:

- verified independent variables and same-line placement in baseline;
- supported coherence evidence consistent with writer invalidation, or explicit limitation;
- a separation/ownership change reduces coherence/retry CPU in the same operation;
- useful throughput/tail/CPU per operation improves across relevant topology;
- correctness/consistency are unchanged or the change is explicit;
- footprint/allocation/GC/locality do not create a worse production trade.

## Troubleshooting

```text
@Contended shows no layout change
  -> restriction flag, annotation target/group, wrong JDK/launch, class-file metadata
layout changes but performance does not
  -> not false sharing, insufficient write rate/topology, other bottleneck
performance improves but coherence counter does not
  -> changed alignment/locality/codegen/work; investigate before attribution
only cross-socket regression
  -> remote coherence/NUMA/placement; production scheduler topology matters
padding causes GC/cache regression
  -> ownership/batching/striping alternative or keep baseline
```

## Authoritative references

- [Linux perf security](https://docs.kernel.org/admin-guide/perf-security.html)
- [Linux perf list/stat documentation](https://man7.org/linux/man-pages/man1/perf-stat.1.html)
- [OpenJDK JMH](https://github.com/openjdk/jmh)
- [OpenJDK JOL](https://github.com/openjdk/jol)
