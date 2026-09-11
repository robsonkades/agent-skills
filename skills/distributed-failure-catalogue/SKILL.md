---
name: distributed-failure-catalogue
description: >
  Evidence-oriented recognition index for recurring distributed failure shapes: overload
  amplification, gray and asymmetric failure, split ownership, stale work, mixed versions,
  correlated faults, silent stagnation and destructive automation. Use to turn incident
  observations into discriminable hypotheses and route each to the skill owning diagnosis
  and remediation. It is not a substitute for the owner skill or causal evidence.
---

# Distributed Failure Catalogue

## Purpose

Turn a symptom into a name, and a name into the skill that owns the fix. Distributed failures
recur in a small number of shapes; an engineer who can name the shape reaches the right
mechanism in minutes instead of rediscovering it during an incident.

This skill deliberately **does not teach the fixes**. Every entry ends at an owner, because a
catalogue that also explained the remedies would drift out of step with the skills that own
them. Destructive cleanup is the explicit exception, with bounded guard guidance below.
Its value is recognition and routing — and, for a design review, a list of concrete
failures to argue a design against rather than a general appeal to robustness.

## Workflow

This is a protocol/operations catalogue, with no Java language minimum. The scheduled-task
reference uses the Java 25 API documentation for a long-standing contract. Inspect the target
runtime, scheduler/framework, client retry defaults and deployment configuration before
applying version-sensitive claims; this skill does not authorize upgrades or fault injection.

Reuse the incident record, accepted service contract and known owner before collecting more
evidence. During an outage, bound classification by the response time available and hand off
to the authorized incident owner/runbook without delaying containment for a complete catalogue
walk. Carry the evidence, unresolved discriminator and remaining time into that handoff.

1. **Write down the observation, not the theory.** "Inbound rate rose while success rate
   fell", "the queue is empty and no alert fired", "duplicates 1.5 s apart". The index below
   is keyed on observations.
2. **Build a shared timeline and denominator.** Record clock domains, timestamp uncertainty
   and sampling gaps; do not infer causal ordering from cross-host timestamps alone. Align deploys, topology changes, retries,
   offered load, admissions, attempts, goodput, saturation and freshness. Rates without
   logical-request/attempt denominators routinely misidentify amplification.
3. **Match the recognition index**, then read the full entry and try to falsify the mechanism.
   Several patterns share a symptom; require its discriminator and a competing explanation.
4. **Check "where it hides"** in code, config, sidecars, SDKs and control planes before accepting the match.
   A pattern you cannot locate in the system is a hypothesis, not a diagnosis.
5. **Go to the owner skill for the fix.** Do not improvise a remedy from the entry — the
   entries are deliberately too short to implement from. Match any intervention to existing
   authority, affected scope and recovery/stop conditions; naming a pattern grants none.
6. **In a design review, walk the index as a checklist** and require an answer for each
   pattern the design can exhibit. "That cannot happen here" is an acceptable answer only with
   the reason.

## Decision block

```text
Use the catalogue when:
- an incident has a shape you recognise but cannot name, so the search terms are unknown
- a postmortem must state a cause class other teams can find later
- a design review needs a concrete list of failures to argue a design against
Avoid the catalogue when:
- the pattern is already named and its owner known — open that skill directly
- a single stack trace needs local defect analysis → debugging; sparse evidence alone cannot
  establish or rule out a distributed mechanism
Prefer instead when:
- the question is which faults the system tolerates rather than what is happening now →
  failure-models
- an outage is in progress and the question is which lever to pull → cascading-failures
```

## Recognition index

| Observation                                                        | Pattern                        | Owner                                  |
| ------------------------------------------------------------------ | ------------------------------ | -------------------------------------- |
| Synchronised spike after a restart, deploy, TTL expiry or recovery | Thundering herd                | `cascading-failures`                   |
| Dependency inbound rate rises while its success rate falls         | Retry storm                    | `retries-and-backoff`                  |
| Failure spreads to services that never call the failing one        | Cascading failure              | `cascading-failures`                   |
| Request-owned work continues beyond its accepted lifetime          | Timeout stacking               | `timeouts-and-deadlines`               |
| Queue depth and latency grow without bound; goodput falls          | Unbounded queue growth         | `rate-limiting-and-load-shedding`      |
| Pool acquisition timeouts on unrelated endpoints; FD or OOM errors | Resource exhaustion            | `concurrency-limiting-and-bulkheads`   |
| Node is up, health check green, answering ten times slower         | Gray failure / slow node       | `failure-models`                       |
| Only some callers/regions can reach a dependency                   | Asymmetric partition           | `failure-models`                       |
| Two records for one intent; a side effect applied twice            | Duplicate processing           | `delivery-semantics`, `idempotency`    |
| Two instances both believe they hold the lock or the leadership    | Split-brain                    | `distributed-locks-and-leases`         |
| Negative durations, leases expiring early, out-of-order timestamps | Clock skew                     | `distributed-locks-and-leases`         |
| Errors only while a rollout is in progress, then they stop         | Version skew                   | `rpc-and-api-contracts`                |
| Everything is green and a downstream dataset stopped changing      | Absence of errors as an error  | `slo-and-alerting`                     |
| Error rate spiked but nothing is broken — or the reverse           | Expected vs unexpected errors  | `rpc-and-api-contracts`                |
| Work completes long after anyone wanted it; results are rejected   | Stale or obsolete work         | `task-queues-and-competing-consumers`  |
| A cleanup job removed far more rows or objects than intended       | Destructive cleanup            | this catalogue (guard rails)           |
| One request produces millions of downstream operations             | Input explosion                | `rate-limiting-and-load-shedding`      |
| An "optional" dependency's outage took the request path down       | Optional-dependency assumption | `failure-models`                       |
| The replacement is more general, more distributed, less reliable   | Second-system effect           | `architecture-decision-making`         |
| Trigger is gone but the system remains in a bad equilibrium        | Metastable failure             | `cascading-failures`                   |
| Independent replicas fail together on one shared dependency/change | Correlated/common-mode failure | `failure-models`                       |
| Data plane fails because discovery/control plane is unavailable    | Control-plane coupling         | `failure-models`, `caching-strategies` |

## Rules

- **An entry is a routing decision, not a remedy.** If you find yourself implementing from an
  entry, stop and open the owner skill; the entry omits the conditions that make the fix
  correct.
- **A symptom rarely identifies one pattern.** Retry storm, cascading failure and
  under-provisioning all show elevated latency and errors. Use the discriminator stated in the
  entry — usually a second series whose _direction_ differs — rather than the first match.
- **Absence is not evidence of health.** A monitoring stack built on error rates cannot see a
  consumer that stopped, a job that did not run, or a producer that went quiet: there are no
  errors because there are no requests. Every pipeline needs a liveness or freshness signal —
  age of the newest record, time since the last successful run — alerted on independently.
- **Do not use one undifferentiated error ratio.** Separate protocol/client rejection,
  dependency failure, server defect and business outcome, while retaining a bounded status
  class/reason dimension. Whether a 4xx is expected depends on the contract; authentication
  outages and rate-limit saturation can be service incidents too.
- **Every rolling deploy is a mixed-version window.** Compatibility direction depends on who
  produces/consumes first, rollback requirements, persisted messages and database migration
  order. Build a version-interoperability matrix and use expand/migrate/contract rather than
  the slogan “both directions” without a time horizon.
- **Destructive cleanup needs executable bounds**, not only a dry-run count. Validate selection
  inputs, preview candidates, bound each batch and cap the whole logical run across retries
  and workers. Counting then deleting with a changed predicate/snapshot is a race; the reference
  explains candidate identity and revalidation. Dry-run success alone does not establish safety.
- **Bound fan-out in both contract and implementation.** Enforce size/depth/range limits and
  resource budgets. SQL `LIMIT` bounds returned rows, not necessarily scanned rows, joins,
  sorting or downstream fan-out; inspect actual work before calling the input bounded.
- Patterns with a dedicated skill are not duplicated here: poison messages and dead-letter
  handling are `poison-messages-and-dlq`, distribution skew is
  `hot-partitions-and-rebalancing`, and the fault classes themselves are `failure-models`.

Return a small ranked hypothesis set with observed evidence, one discriminator and competing
explanation per hypothesis, owner skill, and the next bounded evidence request. Missing
telemetry must remain explicit. Do not claim a mechanism was confirmed by matching its name.
For design reviews, distinguish possible failure surfaces from observed incidents and retain
adequate existing controls. A supported no-change conclusion is a valid result.

## References

- [Gray Failure: The Achilles' Heel of Cloud-Scale Systems](https://www.microsoft.com/en-us/research/publication/gray-failure-achilles-heel-cloud-scale-systems/)
- [RFC 9110 — HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110)
- [Java 25 `ScheduledExecutorService`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ScheduledExecutorService.html)
- [RFC 5905 — Network Time Protocol v4](https://www.rfc-editor.org/rfc/rfc5905)

- [Overload and amplification patterns](references/overload-and-amplification.md) — thundering
  herd, retry storm, cascading failure, timeout stacking, unbounded queue growth, resource
  exhaustion, input explosion, duplicate processing and gray failure, each as symptom,
  mechanism, where it hides, and owner. Read when the incident involves load, latency,
  saturation or repeated effects.
- [Silent, temporal and operational patterns](references/silent-and-operational.md) — absence
  of errors, expected versus unexpected errors, version skew, stale work, destructive cleanup,
  the optional-dependency assumption, the second-system effect, split-brain and clock skew.
  Read when nothing is obviously overloaded, when the incident is tied to a deploy, a schedule
  or a clock, or when the evidence is something that failed to happen.
