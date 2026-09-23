# Recognising and stopping a cascade in progress

## Is it a cascade?

Dependency failure, insufficient capacity and a cascade can overlap on the same error-rate
graph. Identify the feedback edge before choosing which work to reduce or capacity to restore.

| Observation                                         | Candidate explanation                                          | Discriminating evidence                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Attempts per logical call rise                      | retries, changed fan-out or routing                            | trace attempt ownership and compare the same operation mix and measurement boundary                        |
| Goodput falls as offered load rises                 | wasted work, resource retention or lost capacity               | align useful completions with retry work, CPU/GC, occupancy and healthy capacity                           |
| Unrelated endpoints wait on pools                   | shared executors, connections or infrastructure                | identify the shared resource and which operations hold it; utilisation alone does not identify the cause   |
| Queue age rises or a bounded queue stays full       | input exceeds current drain capacity                           | compare arrivals, completions, expiry and rejection for the same queue                                     |
| Errors persist after the trigger clears             | feedback/backlog, an unrepaired dependency or changed workload | verify external load and usable capacity against the healthy baseline; measure whether backlog is draining |
| Ejections or crashes are followed by more ejections | remaining instances inherit enough load to fail too            | align routing changes, ready-instance count and per-instance demand over time                              |
| Blast radius exceeds the apparent call graph        | shared dependency, common deploy or propagating failure        | reconstruct resource topology and failure order before attributing causality                               |

These observations are not mandatory signatures. A cascade can have one attempt per logical
call, bounded queues and a blast radius confined to one service: losing usable replicas can
concentrate unchanged demand on the survivors. Conversely, a wide shared outage need not have
feedback. If the necessary traces or counters are absent, keep the mechanism conditional and
name the smallest observation that would distinguish it.

Plot **goodput** — successful logical operations meeting the correctness/deadline contract —
next to attempt throughput. Divergence shows wasted work, not its cause; correlate it with the
suspected feedback edge. Fast rejection can improve latency while success remains degraded.

## Intervention order

Rank these levers by evidence, time to effect and reversibility. Choose one where practical,
observe goodput and resource recovery, then retain guardrails until recovery is sustained.

1. **Trip or force-open breakers on the failing dependency.** Converts a slow failure into a
   fast one for newly rejected calls. It does not cancel calls already admitted or release their
   resources; pair it with verified timeout/cancellation and observe in-flight drain. Cost: everything with
   no fallback now errors fast instead of slowly. Mechanism: `circuit-breakers`.
2. **Cut retries.** Set attempts to 1 at the layer that retries, or empty the retry budget.
   This is usually the largest single reduction because the multiplier is compounding across
   layers. Policy: `retries-and-backoff`.
3. **Shed at the entry point, non-uniformly.** Reject the lowest-priority classes first and
   expired disposable requests first. Age is not a substitute for remaining deadline or durable
   acceptance obligations; preserve required writes and ordered jobs. Mechanism and priority
   classes: `rate-limiting-and-load-shedding`.
4. **Bound active work and waiting admission at the saturated resource.** A semaphore alone
   can move the backlog into waiting callers. Reject immediately or bound both waiter count
   and wait time, and count acquisition failures as rejections. Do not block an event-loop
   caller while acquiring a permit. Mechanism: `concurrency-limiting-and-bulkheads`.
5. **Reduce per-attempt timeouts on the failing dependency** so resources return sooner, while
   disabling or budgeting retries so faster failures do not increase attempt rate. This is
   useful only when abandonment actually reduces held resources or downstream work. A shorter
   client wait alone may leave the origin executing and can trigger more retries.
6. **Disable non-critical work on the request path** — enrichment calls, recommendation
   fetches, or audit writes only when policy permits and durable capture remains. This is only available if criticality was decided in
   advance; see `cutting-the-loop.md`.

## What deepens it

- **Adding replicas blindly.** New instances start with cold caches, unfilled pools and uncompiled
  code, take a full share of the backlog immediately, saturate, and become another source of
  timeouts and retries against the same dependency. Warm capacity at the actual bottleneck may
  help even during a cascade; prove it adds useful headroom rather than just more callers.
- **Raising timeouts without a resource model.** Longer waits may retain resources and amplify
  overload. A hard concurrency cap changes this into additional waiting/rejection; a client-side
  timeout change does not necessarily change how long the server executes.
- **Retrying harder**, including a manual "just re-run it" from an operator or a support
  tool. The dependency's problem is arrival rate.
- **Rolling restarts of the whole fleet**, which synchronise cache fills and reconnects.
- **Clearing caches** as a reflex. `FLUSHALL` during an incident removes the only thing
  holding load off the dependency (`caching-strategies`).
- **Widening a health check** to unstick pods. A readiness probe that consults the failing
  dependency removes healthy instances and concentrates load on the rest.

## Recovering from a metastable state

Suspect metastability when the trigger is removed and external load returns to a formerly
healthy level, but internal retries/backlog or lost effective capacity sustain failure.
First rule out an unrepaired dependency, resource leak or changed workload; demonstrate the
feedback mechanism and whether the drain rate is positive before claiming waiting cannot help.

1. **Reduce new input below sustainable drain capacity.** Reject or pause producers where the
   contract allows and leave bounded healthy consumers draining. Full rejection may be necessary
   when usable capacity is very low. Pausing consumers can protect a dependency but does not drain
   their queue; monitor retained backlog and storage limits and plan controlled resumption.
2. **Classify the backlog before changing it.** Expire read/request work whose propagated deadline
   has passed; coalesce superseded refreshes; preserve accepted writes, ordered events and jobs
   whose contract outlives the caller. Purge/skip only with authorization, an auditable range and
   a replay/reconciliation plan (`task-queues-and-competing-consumers`). Quarantine durable work
   and replay it later at a controlled rate when immediate processing would sustain the outage.
3. **Restart only components that need it**, in stages with jitter and readiness checks.
4. **Ramp admission back** from measured surviving capacity, not a universal percentage. Wait
   through relevant timeout/retry and warm-up windows at each step, and roll back if queue age,
   client errors or dependency saturation exceed agreed bounds. Budget the combined recovery
   load: new traffic, retries, probes, cache warming and replay, plus work still running after
   caller timeout or removal from routing. Reuse existing controls where they already cover
   that demand; a low client-side in-flight count alone does not establish downstream headroom.
   The ramp prevents the thundering herd on recovery — the backlogged clients all retry the
   instant the first success appears.
5. **Watch goodput, attempts/logical call, queue age and dependency saturation** alongside error
   and shed rates. Fast rejection can lower latency while availability remains degraded.

## Recording it

Capture, before the evidence rotates out: the amplification point, the attempts-per-logical-
call ratio at peak, which lever moved goodput first, and how long the metastable state
persisted after the trigger cleared. The last number is the argument for the design controls
in `cutting-the-loop.md`.
