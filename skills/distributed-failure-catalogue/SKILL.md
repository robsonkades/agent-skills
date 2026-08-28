---
name: distributed-failure-catalogue
description: >
  A recognition index of named distributed failure patterns, each given as symptom,
  mechanism, where it hides in code or config, and the skill that owns the fix: thundering
  herd, retry storm, cascading failure, timeout stacking, unbounded queue growth, resource
  exhaustion, gray failure, duplicate processing, split-brain, clock skew, version skew in a
  rolling deploy, stale work past its deadline, destructive cleanup, input explosion, the
  optional dependency that is really required, the second-system rewrite, expected errors
  mixed with unexpected, and the absence of errors as an error. Use when an incident has a
  shape you recognise but cannot name, when a postmortem needs the pattern's name, when a
  design review needs failures to argue against, when a consumer stopped silently and no
  alert fired, or when a cleanup job deleted more than intended. Does not contain the fixes:
  every entry routes to its owner — cascading-failures, retries-and-backoff,
  circuit-breakers, failure-models and the rest.
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
2. **Match it in the recognition index**, then read the full entry in the reference to check
   the _mechanism_ against your evidence. Several patterns share a symptom; the entry names
   the discriminator.
3. **Check "where it hides"** in your own code and configuration before accepting the match.
   A pattern you cannot locate in the system is a hypothesis, not a diagnosis.
4. **Go to the owner skill for the fix.** Do not improvise a remedy from the entry — the
   entries are deliberately too short to implement from.
5. **In a design review, walk the index as a checklist** and require an answer for each
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

| Observation                                                        | Pattern                        | Owner                                 |
| ------------------------------------------------------------------ | ------------------------------ | ------------------------------------- |
| Synchronised spike after a restart, deploy, TTL expiry or recovery | Thundering herd                | `cascading-failures`                  |
| Dependency inbound rate rises while its success rate falls         | Retry storm                    | `retries-and-backoff`                 |
| Failure spreads to services that never call the failing one        | Cascading failure              | `cascading-failures`                  |
| Caller gave up but downstream work is still running                | Timeout stacking               | `timeouts-and-deadlines`              |
| Queue depth and latency grow without bound; goodput falls          | Unbounded queue growth         | `rate-limiting-and-load-shedding`     |
| Pool acquisition timeouts on unrelated endpoints; FD or OOM errors | Resource exhaustion            | `concurrency-limiting-and-bulkheads`  |
| Node is up, health check green, answering ten times slower         | Gray failure / slow node       | `failure-models`                      |
| Two records for one intent; a side effect applied twice            | Duplicate processing           | `delivery-semantics`, `idempotency`   |
| Two instances both believe they hold the lock or the leadership    | Split-brain                    | `distributed-locks-and-leases`        |
| Negative durations, leases expiring early, out-of-order timestamps | Clock skew                     | `distributed-locks-and-leases`        |
| Errors only while a rollout is in progress, then they stop         | Version skew                   | `rpc-and-api-contracts`               |
| Everything is green and a downstream dataset stopped changing      | Absence of errors as an error  | `slo-and-alerting`                    |
| Error rate spiked but nothing is broken — or the reverse           | Expected vs unexpected errors  | `rpc-and-api-contracts`               |
| Work completes long after anyone wanted it; results are rejected   | Stale or obsolete work         | `task-queues-and-competing-consumers` |
| A cleanup job removed far more rows or objects than intended       | Destructive cleanup            | this catalogue (guard rails)          |
| One request produces millions of downstream operations             | Input explosion                | `rate-limiting-and-load-shedding`     |
| An "optional" dependency's outage took the request path down       | Optional-dependency assumption | `failure-models`                      |
| The replacement is more general, more distributed, less reliable   | Second-system effect           | `architecture-decision-making`        |

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
- **Never mix client errors and server errors in one metric.** A 4xx spike from one bad client
  reads as an incident; a 5xx rise hidden inside a large 4xx baseline reads as normal. Split
  by class before anything is alerted on.
- **Every rolling deploy is a mixed-version window**, so any change to a message, a schema or
  an API must be compatible in both directions across it. A change that is only
  forward-compatible fails for the duration of the rollout, which is why the errors stop by
  themselves and the cause is never found.
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
