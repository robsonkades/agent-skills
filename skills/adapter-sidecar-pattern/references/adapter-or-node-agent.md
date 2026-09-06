# Adapter sidecar, node agent, in-process, or change the app

## Select by access and ownership

| Option                                  | Selecting evidence                                                                                                                          | Recurring cost or failure surface                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Change producer / instrument in-process | Code can change and the required semantics are available there                                                                              | Library, schema and release maintenance; instrumentation still costs resources |
| Node agent                              | Existing collector can access the stream and route its formats with acceptable permissions and isolation                                    | Shared capacity/failure domain; node access and configuration ownership        |
| Adapter sidecar                         | Pod-only files, local endpoint/credentials, independent release needs or measured isolation requirements prevent adequate shared collection | CPU/memory per replica, another image and a compatibility contract             |

A vendor binary justifies translation, not necessarily per-pod placement. Different log formats
can be routed through workload-specific parsers in a capable collector. Pod identity can also
be attached by a node collector when its metadata association is reliable. Inspect the actual
collector configuration, permissions and version before claiming either capability is available.
Reject enrichment if it can associate a record with the wrong workload after a restart.

For ordinary stdout/stderr logs, first assess the existing runtime-to-node-agent path. A peer
container does not automatically receive another container's stdout. File-only output may
justify a shared-volume sidecar that translates to its own stdout for node collection, or one
that ships directly. Choose a single intended ingestion path; collecting both duplicates data.
Compare measured memory/CPU per replica versus per node at representative volume, including
noisy workloads, buffer requirements and permissible data loss. See
[Kubernetes logging architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/).

## Metrics: translation or redundant re-exposure?

This skill specifies deployment and translation contracts, with no Java API baseline or
executable Java example. Before proposing JVM instrumentation, inspect the project's Java
release/toolchain, runtime image and resolved framework/Micrometer versions. Verify endpoint
integration against those versions; adopting this skill does not authorize upgrades or new
dependencies.

If an application already serves the required exposition, another exporter normally adds no
translation value. Micrometer's Prometheus registry still needs an HTTP endpoint, supplied by
application wiring or framework integration; adding the registry dependency alone is insufficient.
Verify the actual endpoint and content negotiation before proposing a sidecar. See
[Micrometer's endpoint prerequisites](https://docs.micrometer.io/micrometer/reference/implementations/prometheus.html).

An exporter can instead translate a vendor's status API, even when the binary cannot be changed.
Determine whether it collects on each scrape or polls into a cache. Prefer collection on scrape
for Prometheus; justify caching expensive sources and document it in HELP. Specify source failure
behavior (failed scrape or a separate source-success signal). A successful HTTP scrape does not
prove successful source collection. See
[Prometheus exporter guidance](https://prometheus.io/docs/instrumenting/writing_exporters/).

For caching, set a freshness budget and expiry policy; expose last successful collection time
or age and ensure alerts use it. Age depends on polling, scrape timing, delays and failures;
there is no finite interval-only bound during an outage. Repeated cached counters can distort
rates, and resets between polls can be missed; gauges can hide short peaks. Test source restart,
collection failure and expiry. A freshness metric reveals stale data but cannot recover missed
observations. Do not attach old sample timestamps as a substitute for a defined cache policy.

## Health: name the condition before adapting it

No HTTP health endpoint is not sufficient justification for a sidecar. A native TCP probe may
be adequate if the required condition is connection acceptance; an existing exec or protocol
check may suffice. TCP success does not establish business progress. See
[Kubernetes probe behavior](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/).

Use an adapter when a necessary, observable predicate needs translation that existing checks
cannot provide. A query can show database responsiveness; a broker metadata call shows broker
access, not progress of the local consumer. A progress marker needs workload cadence and idle
behavior defined before choosing an expiry threshold. If no observation distinguishes a wedged
process from a healthy idle one, state that gap instead of manufacturing a health contract.

Bound check duration, concurrency and resource use; require a fresh result or reject it after
a specified age. Distinguish adapter failure, target failure and shared dependency failure.
Delegate readiness/liveness configuration to `kubernetes-service-lifecycle`: restarting a
container because a shared broker is down need not repair anything. A liveness probe attached
to the adapter restarts that container, not automatically the application it observes.
