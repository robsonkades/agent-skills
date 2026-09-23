---
name: leader-election
description: >
  Electing one active instance for work that must not run concurrently: the lease renewal
  model and the rule that failed renewal never extends the leader's conservative deadline;
  split-brain and resource-side fencing/idempotency; failover time as detection, election and
  warm-up; coordination-store leases, Kubernetes Lease objects and ShedLock rows, and what
  each is adequate for; and when not to elect. Use when a @Scheduled job runs once per
  replica after scaling out, when two instances both believe they lead, when a leader keeps
  working after its lease expired, when failover takes a minute nobody budgeted, or when
  ShedLock is described as leader election. Not lease and fencing mechanics
  (distributed-locks-and-leases), how the election is decided (consensus-and-quorums), why a
  scheduled job duplicates (stateless-service-design), splitting work by key
  (sharding-and-partitioning), or pod termination (kubernetes-service-lifecycle).
---

# Leader Election

## Purpose

Leader election assigns a distinguished role for an epoch; a lease is one common failure-
detection/expiry mechanism, but session locks and quorum terms are alternatives. A
**distributed lock** usually protects a critical section while an election owns a long-lived
role, though both need the same stale-owner analysis (`distributed-locks-and-leases`). A lock
need not be a lease. A **mutex** is in-process exclusion and unrelated
(`java-memory-model`). Lease expiry is one implementation choice, not a requirement. **Ownership by
partition** is the alternative that removes the singleton altogether by assigning keys to
instances (`sharding-and-partitioning`). **Consensus** is how the election is actually decided
(`consensus-and-quorums`); election is a consumer of it, not a synonym.

Two failures. The first is the one that brings people here: a `@Scheduled` job that ran once
becomes a job that runs N times when the deployment scales to N replicas, silently — the problem
statement is `stateless-service-design`. The second is worse and is what this skill is really
about: the leader that has already lost its lease and does not know yet. Between expiry and
the former holder noticing, a successor may begin work while the old holder still acts as
leader. Their activity then overlaps, even if neither logs anything unusual.

## Workflow

Inspect the project's Java baseline, election-library/provider versions, grant/renewal
semantics and every protected sink before adapting an example. The Java deadline illustration
uses Java 17 language features; it does not authorize a runtime or dependency upgrade.
Reuse the supplied ownership, workload and failure evidence. For a focused review, examine the
affected invariant and lifecycle path; an adequate existing coordinator can remain in place
without a new mechanism comparison or full fault-injection campaign.

1. **Ask whether the work needs a singleton at all.** If it can be partitioned by key, every
   instance owns a disjoint subset and the global singleton disappears. Running everywhere
   additionally requires concurrency-safe effects and acceptable duplicate load; repeatability
   alone does not prove either. One active worker can be a capacity ceiling; an elected
   coordinator can also delegate partitioned work.
2. **State the failover budget as a number.** Budget detection + election + recovery/warm-up
   until correct useful work resumes after an interruption; a local leader flag does not prove
   availability. This budget constrains the lease/detection settings and recovery path.
3. **Use measured pause/network tails to estimate churn and failover**, not as hard safety bounds.
   Longer unseen stalls remain possible. State the provider, clock-rate and quiescence assumptions
   behind a local lease budget and preserve sink-side safety even when a holder cannot run its
   stop check (`pause-attribution`). Arithmetic in `references/lease-and-split-brain.md`.
4. **Write the leader loop to stop before its conservative local validity deadline.** A single
   timed-out renewal is ambiguous and need not stop work immediately if sufficient lease budget
   remains; it must never extend that deadline. Stop admission early enough for in-flight work
   to quiesce, and do not wait to be told another leader won.
5. **Prevent stale authority from violating safety.** Enforce a monotonically increasing term/
   fence at every mutable resource, put the effect and authority check in the same transaction, or
   ensure repeated and concurrent effects preserve the required invariant, including any
   reconciliation window. Local leader belief is never the enforcement boundary.
6. **When changing the ownership or deployment lifecycle, handle the rolling deploy explicitly.**
   Stop new work, quiesce or hand off in-flight work,
   persist a checkpoint, then release/transfer authority. Releasing first can overlap the
   successor with unfinished effects (`kubernetes-service-lifecycle`).
7. **Validate the affected failure path.** For new or changed election safety, test an isolated
   store partition or paused holder and assert local admission and the sink invariant separately.
   Reuse adequate prior evidence; a narrow arithmetic review does not need a live cluster test.

## Decision block

```text
Elect a leader when:
- the fleet needs one coordinator or active worker and the role cannot be partitioned — a
  reconciliation sweep, a global aggregate, a single outbound connection to a peer that admits
  only one client
- a duplicate run is expensive and the work can be fenced or made idempotent
- one instance's throughput is sufficient for the whole workload, now and after growth
Avoid electing when:
- the work is safe under repeated concurrent execution and duplicate load/cost is acceptable,
  so the singleton has no remaining operational purpose
- one worker cannot keep up and the elected role cannot delegate partitioned work
- the failover window (detection/remaining grant + election + recovery/warm-up) exceeds the tolerance for
  having no owner
Prefer instead when:
- the work is per-key and the key space can be split: partitioned ownership gives one owner per
  key, scales with instances, and needs no election (sharding-and-partitioning)
- what is actually wanted is "do not run this twice concurrently" for a scheduled job that is
  idempotent — a lease-per-execution row (ShedLock-style) is simpler and honest about its limits
```

## Rules

- **One leader does not guarantee one execution per work item or schedule interval.** A successor
  with a valid new term can replay an already committed effect after a crash before checkpointing.
  When replay needs deduplication, keep work identity stable across terms. Define replay and
  missed-interval recovery separately from election; see `references/election-mechanisms.md`
  when every interval or effect matters.
- **A leader stops before it can no longer prove its grant valid, not on the first failed
  renewal and not when another actor reports winning.** Convert a successful grant response
  into a conservative monotonic deadline accounting for request/response uncertainty, clock-
  rate drift and quiescence time. Timeout never extends it.
- Split-brain is two instances acting as leader at once, and its cost is whatever the work does
  twice — a doubled batch, two conflicting reconciliations, two outbound connections a peer
  rejects. Name that cost in the design; it decides how much fencing is worth.
- **A leader must be prepared to lose authority mid-operation.** Surviving designs include
  resource-enforced term/fence, mutation and authority check in one transaction, or
  idempotent/reconcilable work. Cancellation alone cannot retract a committed remote effect.
- Export local role, term, lease-deadline margin, renewal result/latency and useful-work age.
  `sum(is_leader) != 1` is a diagnostic of sampled local belief, not proof: scrape gaps and
  stale metrics lie. Alert primarily on no useful progress and fence rejections; compare
  multiple leaders by overlapping terms and resource-side evidence.
- **Two peers cannot guarantee both exclusive authority and continued progress after either
  becomes unreachable in this failure model.** Requiring both votes or standing down can
  preserve safety while losing availability; unilateral promotion cannot distinguish a failed
  peer from a partition without additional assumptions or an arbiter.
  Two instances electing _through_ a quorum-backed store are fine — the store is the arbiter.
- Failover time is detection/remaining grant + election + state recovery + warm-up/backlog.
  With an exclusive lease, a successor may need to wait up to the remaining duration, not at
  least the full lease. Session failure detectors may react earlier. Measure time to first
  correct useful result, not time to set a leader flag.
- The lease-length trade is explicit: short leases can reduce detection delay and increase
  false failovers under pauses or network blips; longer leases can reduce churn but delay recovery.
  Use measured distributions and the failover budget to choose an operating point, not to prove
  exclusive effects. Observed maxima do not bound future pauses or delayed requests.
- **ShedLock and equivalents are not leader election.** They are "do not run this twice"
  mechanisms built on a database row with an expiry (`lockAtMostFor`), and the expiry is a lease
  with the usual defect: a node still executing after it expires is not stopped, and there is no
  fencing token. That is _adequate_ for a job that is idempotent or tolerant of a skipped or
  duplicated run, and _not_ adequate when a second concurrent run corrupts data — set
  `lockAtMostFor` from the job-duration evidence and justified margin, and treat overlap as possible
  even when no observed run has exceeded it.
- The Kubernetes `Lease` object is a renewable record of a holder identity and a duration, and
  the basis of the lease-based election controllers use. Same property: it establishes who
  _should_ lead and does not stop a stalled former holder from writing.
- **A rolling deploy can terminate the leader.** On SIGTERM, stop admission; continue renewal
  only as needed for a bounded safe drain, then checkpoint and release authority. If the
  grace period expires, rely on fence/idempotency rather than an unsafe release. A deliberate
  handoff can reduce gaps but must use a new term and acknowledgement protocol.

## Safety and liveness contract

```text
Safety: no stale term can commit an effect that violates the invariant.
Liveness: when a quorum/store and at least one eligible member remain reachable long enough,
          a leader eventually performs useful work.
```

Election gives local role information; it does not automatically enforce safety at databases,
object stores, brokers or third-party APIs. List every sink and show how it rejects stale terms
or tolerates duplicate/concurrent effects. A highest-seen-term fence rejects old terms only
after the new term is installed at that sink; it does not itself reject every post-expiry
write. Establish the sink's authority transition before successor work, or atomically validate
current authority with the effect when strict expiry exclusion is required. If a sink cannot
enforce or tolerate the required invariant, election alone is insufficient.

For a review, return the affected invariant, supporting evidence, any gap and the smallest
correction/check. Separate observed timing from assumptions and unexecuted scenarios; a supported
no-change conclusion is sufficient when the current design meets its contract.

## References

- [Leases, renewal and the split-brain window](references/lease-and-split-brain.md) — renewal
  timing, the stop-acting rule as code on a monotonic clock, the split-brain sequence, lease
  selection against pauses and blips, the failover budget, and rolling-deploy behaviour. Read
  when choosing a lease duration or after a duplicate run.
- [Mechanisms and alternatives](references/election-mechanisms.md) — the ways to avoid electing
  at all, then coordination-store lease, Kubernetes Lease and ShedLock-style database rows
  compared on fencing, failover time, dependencies and what each is adequate for, with a
  decision block and work recovery across handover. Read when choosing a mechanism, reviewing
  one already in place, or checking whether scheduled work may be replayed or missed.
