# Reading and comparing flame graphs

## Read one graph

### 1. State the sample universe

Write one sentence:

> During `[window]`, `[producer/event]` selected `[population]`; one unit of width represents
> `[weight]`, under `[filters/rate/stack limits]`.

If that sentence cannot be completed, return to the raw recording/configuration. A title such
as “CPU Flame Graph” is not sufficient provenance.

### 2. Validate totals and quality

Record:

- total sample/event weight and count;
- duration and completed/error/cancelled workload;
- missing targets/threads/context;
- lost/dropped/throttled events;
- truncated/unknown/unresolved stack fractions;
- producer/converter/JDK/platform epoch.

Render thresholds can hide narrow frames without removing their weight from ancestors. Filters
can remove complete stacks or frames depending on tool. Read the exact conversion command.

### 3. Partition heterogeneous populations

Whole-process graphs mix request threads, GC, JIT compilers, signal/profiler/export workers,
and idle pools. Split only on trustworthy metadata:

- application/runtime/native/kernel thread roles;
- runnable/sleeping/blocked state where defined;
- service/operation/workload cohort;
- version/instance/host class;
- virtual-thread logical task versus carrier when supported.

Thread names are hints, can be reused, and can contain high-cardinality data. Validate IDs and
lifecycle.

### 4. Read inclusive and leaf weight

Suppose retained stack weights form:

```text
request                                      100
├─ parse                                      35
│  └─ decode                                  30
├─ persist                                    50
│  └─ pool.borrow
│     └─ park                                 45
└─ respond                                    10
```

Under this simplified aggregate, `request` has roughly 5 units with no displayed child,
`parse` roughly 5, and `persist` roughly 5. That arithmetic can be distorted by filtered or
hidden frames, recursion, truncation, inline attribution, and renderer minimum width. The graph
does not say whether `park` is avoidable or which resource caused it.

### 5. Switch views

Use root-oriented view for ownership paths. Use bottom-up/reversed aggregation to answer “all
callers of this leaf/mechanism.” Search may highlight/sum matches, but name normalization,
overloads, recursion, and duplicate display names can affect totals.

Use time-bucketed/heatmap/JFR views when phase matters. Horizontal flame-graph position is not
chronology.

## Rank next measurements, not fixes

For each candidate path record:

| Candidate  |        Selected weight | Outcome it could affect | Alternative explanation | Discriminating evidence                     |
| ---------- | ---------------------: | ----------------------- | ----------------------- | ------------------------------------------- |
| serializer |           absolute + % | CPU/request             | changed payload mix     | bytes/items + CPU profile per work          |
| pool wait  | absolute + % wall/lock | request latency         | healthy idle workers    | pool queue/leases/timeouts + request cohort |
| GC worker  |       absolute + % CPU | capacity/tail           | normal concurrent phase | allocation/live set/GC phase CPU and pauses |

The most useful next step can target a narrow but high-cost/failure-critical path, or measure a
wide frame whose mechanism is still ambiguous.

## Amdahl as a bounded hypothesis

Use Amdahl only after mapping selected weight to the resource being optimized and avoiding
double-counting inclusive ancestors:

```text
p = non-overlapping end-to-end resource fraction affected
s = credible speedup of that fraction
overall speedup <= 1 / ((1 - p) + p/s)
```

State why `p` is credible. If a CPU profile says a leaf has 20% of samples but the service is
I/O-bound, eliminating it can reduce CPU cost materially while barely moving latency. Both can
be valuable; they are different decisions.

## Differential design

### Pair the question and denominator

| Question                                  | Comparison basis                                             |
| ----------------------------------------- | ------------------------------------------------------------ |
| Did fixed work use more CPU?              | absolute CPU-event weight for equal work, or CPU weight/work |
| Did per-request code mix change?          | matched operation cohort, weight/successful request          |
| Did an incident phase change composition? | normalized share plus raw totals and load                    |
| Did allocation per item change?           | allocated weight/item and object/site distribution           |
| Did wait move?                            | matched request/thread cohort and elapsed-wait weight/work   |

Total normalization is appropriate only for composition. It can make a candidate that uses
twice the CPU appear unchanged if every stack doubles together.

### Validate converter direction

Create tiny folded inputs:

```text
# baseline
root;stable 80
root;removed 20

# candidate
root;stable 80
root;added 20
```

Run the exact pinned differential pipeline and record which sign/color means added versus
removed. Palettes differ between classic FlameGraph, async-profiler HTML, JMC, and other
backends. Colors in a normal graph may encode language/frame type or be decorative.

### Use repeated trials

One pair is descriptive. For a regression decision, collect randomized/paired independent
runs and compare stable stack groups or resource outcomes at the run level. Individual
samples inside one profile are not independent version trials. Preserve each raw profile;
aggregating first can hide host/run variance.

### Interpret tree reshaping

Compiler inlining, deoptimization, hidden-class/lambda naming, library upgrades, symbolization,
and converter normalization can move weight among frames without changing machine work. Use
bottom-up stable mechanisms, JIT compilation/assembly where needed, and external metrics.

## Post-change protocol

1. Predeclare expected outcome and affected path/resource.
2. Repeat the same compatible experiment, including control/order policy.
3. Compare throughput/latency/errors/resource per work with uncertainty.
4. Verify the target stack mechanism changed by the expected absolute weight.
5. Inspect displaced/new work and system bottleneck migration.
6. Test relevant scale/concurrency/data and failure conditions.
7. Record negative or inconclusive results; do not select the best rerun.

A graph that “looks cleaner” is not a validation criterion.

## Review checklist

- [ ] Source/event/weight/population/filters are named.
- [ ] Absolute totals, workload denominator, loss, truncation, and symbols are checked.
- [ ] Runtime/idle/application populations are separated only where metadata supports it.
- [ ] Inclusive and leaf widths are not double-counted.
- [ ] Bottom-up/search grouping is used for mechanisms spread across callers.
- [ ] Amdahl fraction maps to the actual resource/outcome and states assumptions.
- [ ] Differential denominator and converter sign are explicitly validated.
- [ ] Repeated compatible runs and external outcomes—not graph shape alone—decide the change.

## Authoritative references

- [Flame Graphs](https://www.brendangregg.com/flamegraphs.html)
- [Differential Flame Graphs](https://www.brendangregg.com/blog/2014-11-09/differential-flame-graphs.html)
- [FlameGraph scripts](https://github.com/brendangregg/FlameGraph)
