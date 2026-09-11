# Behavioral validation cases

These cases evaluate skill selection and observable decisions, not the adapter's code.
Status: documented, not executed. No measured improvement is claimed.

Run each request below in a fresh session. For a paired comparison, hold model/version,
tool access, system instructions and supplied context constant. In the baseline omit this
skill; in the treatment provide SKILL.md and allow its referenced resources. Keep these
expectations out of both prompts and exclude this evaluation file from task-runner access;
the treatment's technical resources are the other two references. Record outputs, tool calls, model/settings, date and
pass/fail per required characteristic with evidence. For selection cases, provide the same
neighboring descriptions to both runs, adding this skill's description only in the treatment.
Do not count repository verification or fixture tests as these runs.

## 1. Representative translation with semantic drift

**Request/context:** “Design a metrics adapter for a vendor binary we cannot change.
Its versioned status API is reachable only inside the pod. v1 returns
`{"requests_total":42,"latency_ms":250}`; v2 returns
`{"requests_total":42,"latency_s":0.25}`. The vendor documents requests_total as cumulative
since process start and latency as the latest request duration. Prometheus expects a counter
and a seconds gauge. No cache is needed; collection takes 20 ms within our scrape budget.”

**Expected behavior:** Justify local translation, preserve type/unit meaning and acknowledge
the versioned source. Prefer collection on scrape.

**Required output:** Both versions map latency to 0.25 seconds; counter reset handling,
source-failure behavior and semantic fixture assertions are explicit. Repeated source
snapshots `42, 42, 45` expose those values rather than accumulating them locally.

**Failure:** Double conversion, a timer/cache without justification, claims of an inherently
unversioned contract, adding every snapshot to a local counter, or HTTP success presented
as source health.

## 2. Pressure to add sidecars and invent context

**Request/context:** “Approve sidecars for our 200 pods because the two vendor log formats
differ. Our existing node collector already routes both formats and reliably attaches pod UID.
Logs have no request IDs and concurrent requests interleave. Put a random trace ID on every
line so we can correlate them. A controlled pod-UID map identifies each exclusively assigned
tenant; we need tenant enrichment too.”

**Expected behavior:** Challenge the unsupported sidecar requirement and fabricated request
correlation while allowing verified tenant enrichment.

**Required output:** Existing collector is assessed first; enrichment requires exclusive
assignment and correct association over pod replacement; request context remains absent.

**Failure:** Accepting random trace IDs as request correlation, rejecting all metadata not
printed by the application, or insisting different formats require per-pod parsing.

## 3. Missing evidence after an upgrade

**Request/context:** “Telemetry looks wrong since yesterday's upgrade. We have no old/new
samples, schema, error counters or collector configuration. Write the production regex now
and say the upgrade caused it.”

**Expected behavior:** Ask for minimum source/consumer evidence and continue with a conditional
investigation rather than a fabricated parser or confirmed cause.

**Required output:** Specific sample/version/configuration requests and a check distinguishing
format drift from truncation or mixed input; execution limitations stated.

**Failure:** Invented field layout, claimed validation, or drift declared proven by timing alone.

## 4. Health predicate ambiguity

**Request/context:** “Our legacy queue consumer has no HTTP health endpoint. TCP connects
and a proposed sidecar's broker metadata call succeeds while the consumer is stuck. Restart
the application whenever that sidecar's liveness check fails. No progress or idle contract
has been defined.”

**Expected behavior:** Distinguish broker reachability from consumer progress and ask for
an observable predicate/idle behavior before choosing a threshold.

**Required output:** Explain that adapter-container liveness failure restarts the adapter;
delegate probe wiring; recognize TCP as valid for the narrower acceptance condition.

**Failure:** Metadata success proves consumer health, TCP is universally invalid, an invented
progress timeout, or promising application restart from an adapter-attached liveness probe.

## 5. Cached metrics and unsafe buffering guarantees

**Request/context:** “Our adapter polls counters every 60 seconds and Prometheus scrapes
every 15. It returns the last successful values indefinitely after source failure. Logs go
through a shared `emptyDir` with `medium: Memory` and `sizeLimit: 128Mi`. Approve this:
counters survive caching and sizeLimit guarantees lossless logging during any sink outage.”

**Expected behavior:** Reject both guarantees; expose freshness/source failure and reason
about finite buffers and memory accounting.

**Required output:** Counter reset/rate risks, expiry policy, writing-container memory/OOM
risk, explicit overflow decision and source/sink outage tests observing application impact.

**Failure:** Stale counters called safe, disk eviction asserted as the only failure,
or a finite volume accepted as lossless for an unlimited outage.

## 6. Scope boundary

**Request/context:** “Adapt a vendor Java SDK type to our domain interface and translate
its exceptions. This is entirely in-process; no Kubernetes or telemetry is involved.”

**Expected behavior:** Do not activate this skill; route to gof-adapter if available.

**Required output:** In-process interface/error adaptation, without telemetry topology work.

**Failure:** Proposing a sidecar or requiring Kubernetes/log fixtures for this request.

## 7. Backpressure, recovery and storage lifetime

**Request/context:** “The adapter has 100 MiB of usable queue capacity with 10 MiB already
queued. Input is 4 MiB/s and impaired drain is 1 MiB/s, measured at that queue in encoded bytes.
Once full, the producer's blocking writes stop accepting new work; no other queue grows.
Recovery can drain 8 MiB/s while input remains 4 MiB/s. The queue is a disk-backed `emptyDir`.
Can this avoid drops during a long sink outage and survive replacing the Pod?”

**Expected behavior:** Separate finite buffering, verified producer backpressure, availability
and durable recovery. Treat the supplied rates as a constant-rate scenario, not measurements
of a real deployment.

**Required output:** Capacity fills in 30 seconds; from a full queue, catch-up takes 25 seconds
under the stated recovery rates. Backpressure can prevent overflow by stopping admission, with
an explicit application impact; `emptyDir` does not preserve the queue across Pod removal.

**Failure:** Ignoring existing backlog, claiming continuing availability at a blocked producer,
declaring drops inevitable despite the stated backpressure, or treating a disk-backed `emptyDir`
as durable across Pod replacement.
