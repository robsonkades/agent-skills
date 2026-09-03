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
them. Its value is recognition and routing — and, for a design review, a list of concrete
failures to argue a design against rather than a general appeal to robustness.

## Workflow

1. **Write down the observation, not the theory.** "Inbound rate rose while success rate
   fell", "the queue is empty and no alert fired", "duplicates 1.5 s apart". The index below
   is keyed on observations.
2. **Build a shared timeline and denominator.** Align deploys, topology changes, retries,
   offered load, admissions, attempts, goodput, saturation and freshness. Rates without
   logical-request/attempt denominators routinely misidentify amplification.
3. **Match the recognition index**, then read the full entry and try to falsify the mechanism.
   Several patterns share a symptom; require its discriminator and a competing explanation.
4. **Check "where it hides"** in code, config, sidecars, SDKs and control planes before accepting the match.
   A pattern you cannot locate in the system is a hypothesis, not a diagnosis.
5. **Go to the owner skill for the fix.** Do not improvise a remedy from the entry — the
   entries are deliberately too short to implement from.
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
- the evidence is one stack trace or one malformed request. That is a defect, not a pattern
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
| Caller gave up but downstream work is still running                | Timeout stacking               | `timeouts-and-deadlines`               |
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
- **A destructive job needs three guard rails**, and this is the one pattern whose remedy lives
  here because no other skill owns it: a dry-run mode that reports what would be deleted; a
  bounded batch per run; and an **absolute cap that aborts** when the predicate selects more
  than a plausible number of rows. The canonical failure is a predicate that silently matched
  everything — a join that returned no rows treated as "nothing is referenced", a null
  parameter that removed the filter.
- **Bound every fan-out at the contract**, not in the implementation. A list field with no
  maximum length, a query with no `LIMIT`, a batch endpoint with no cap — each turns one
  request into an unbounded amount of work, and the request is usually well within every rate
  limit while it does so.
- Patterns with a dedicated skill are not duplicated here: poison messages and dead-letter
  handling are `poison-messages-and-dlq`, distribution skew is
  `hot-partitions-and-rebalancing`, and the fault classes themselves are `failure-models`.

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
