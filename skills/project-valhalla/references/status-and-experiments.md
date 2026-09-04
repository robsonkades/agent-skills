# Status and experiment protocol

## Authority order

1. Current [Project Valhalla page](https://openjdk.org/projects/valhalla/) and JEP headers.
2. Release notes and source for the exact EA/GA build being tested.
3. Current compiler diagnostics and generated class file from that build.
4. Design notes, talks and articles, explicitly dated and labeled when historical.

Capture URL, retrieval date, JEP status/target and exact build. A proposed target can move; an
Integrated JEP in a future release is not functionality in an older supported release.

## Experiment record

```text
question and decision:
baseline and Valhalla representation:
JDK vendor/version/build/commit, OS and architecture:
preview/compiler/runtime flags:
semantic assertions:
layout evidence and flattening observation:
workload, data/access distribution and concurrency:
JMH forks/warm-up/measurement and profilers:
raw results, uncertainty and negative controls:
what the result does not prove:
```

Compare retained footprint, allocation, cache misses/bandwidth and useful latency/throughput. A
sequentially allocated object array can already have favourable locality; add randomized/scattered
access when pointer chasing is the hypothesis. Prevent setup allocation from being mistaken for
hot-path allocation, and do not attribute an unexplained tie to escape analysis without compiler or
allocation evidence.
