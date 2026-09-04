# Cloud instance selection

Use this when choosing a VM family, architecture, purchase model or storage/network envelope.

## Comparison contract

Compare at least one credible alternative on useful work per cost under the same service SLO. Pin
region, date/currency, operating system, CPU architecture/generation, vCPU-to-core/SMT semantics,
memory, sustained and burst network/storage limits, local/remote storage, quotas, availability and
interruption/recovery behavior. Catalog price is not measured price-performance.

Provider specifications often have floors, ceilings, “up to” bursts, credit systems and size-
dependent baselines. Preserve the full piecewise rule and retrieve effective values from the API;
do not extrapolate one row or multiply a marketing peak into a capacity guarantee.

Benchmark native dependencies and JVM behavior on every candidate architecture. Include startup/
warm-up, compilation, collector CPU, memory bandwidth, NUMA topology and native-image/library
availability. Cost per successful business operation includes compute, storage provisioned IOPS/
throughput, network, sidecars, failover reserve and interruption waste.

Spot/preemptible capacity is interruptible, not committed headroom. Keep a measured stable floor or
degradation policy, test correlated reclamation and prove drain/replacement inside the provider's
effective notice—not its nominal maximum. Prefer managed interruption handling when available and
validate the pod/application shutdown path through `kubernetes-service-lifecycle`.

Re-evaluate on price/spec, instance generation, JDK, native dependency or workload changes.
