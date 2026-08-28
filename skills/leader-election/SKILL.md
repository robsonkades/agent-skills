---
name: leader-election
description: >
  Electing one active instance for work that must not run concurrently: the lease renewal
  model and the rule that a leader stops acting when renewal fails, not when it learns it
  lost; split-brain as the window between those, and the two designs that survive it — fence
  every write, or make the work idempotent; failover time as detection, election and
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

Leader election is **ownership over time**: one instance holds a role for a duration and renews
it. A **distributed lock** is ownership over a _critical section_ — acquired, used, released —
and the two share a mechanism (both are leases underneath, `distributed-locks-and-leases`) while
differing in every design question: a lock asks how long the section takes, an election asks how
long the fleet can go without an owner. A **mutex** is in-process exclusion and unrelated
(`java-memory-model`). A **lease** is the primitive both are built from. **Ownership by
partition** is the alternative that removes the singleton altogether by assigning keys to
instances (`sharding-and-partitioning`). **Consensus** is how the election is actually decided
(`consensus-and-quorums`); election is a consumer of it, not a synonym.

Two failures. The first is the one that brings people here: a `@Scheduled` job that ran once
becomes a job that runs N times when the deployment scales to N replicas, silently — the problem
statement is `stateless-service-design`. The second is worse and is what this skill is really
about: the leader that has already lost its lease and does not know yet. Between the instant a
lease expires and the instant its former holder notices, two instances are both acting as
leader, and neither logs anything unusual.

## Workflow

1. **Ask whether the work needs a singleton at all.** If it can be partitioned by key, every
   instance owns a disjoint subset and the singleton disappears; if it is idempotent, it can run
   everywhere. A leader is a capacity ceiling of one — choose it deliberately.
2. **State the failover budget as a number.** Detection + election + warm-up is a period with no
   leader, user-visible if anything waits on the leader's work. That number sets the lease
   length, not the other way round.
3. **Size the lease against the measured pause distribution**, not a round number: a lease
   shorter than the worst stop-the-world pause or network blip produces failovers that are pure
   churn (`pause-attribution`). Arithmetic in `references/lease-and-split-brain.md`.
4. **Write the leader loop to stop on renewal failure.** Check the lease deadline on a monotonic
   clock before every unit of work, and stop when renewal has not succeeded — not when a call to
   the store reports someone else won.
5. **Make the work survive two leaders anyway**, because the window cannot be closed: fence every
   write with the lease's token (`distributed-locks-and-leases`), or make the work idempotent and
   re-runnable (`idempotency`). A design with neither is relying on the window never opening.
6. **Handle the rolling deploy explicitly.** A deploy kills the leader on purpose, so failover
   happens on every release: release the lease during termination and stop acting on SIGTERM
   rather than at the end of the grace period (`kubernetes-service-lifecycle`).
7. **Instrument and test the split.** Export an `is_leader` gauge per instance; in a test,
   partition the leader from the store and assert both that it stopped and that its late write
   was rejected.

## Decision block

```text
Elect a leader when:
- the work must happen once per interval across the fleet and cannot be partitioned — a
  reconciliation sweep, a global aggregate, a single outbound connection to a peer that admits
  only one client
- a duplicate run is expensive and the work can be fenced or made idempotent
- one instance's throughput is sufficient for the whole workload, now and after growth
Avoid electing when:
- the work is already idempotent and safe on every replica: coordination buys nothing
- one instance cannot keep up — a leader does not scale, and adding replicas adds standbys,
  not capacity
- the failover window (lease + election + warm-up) is longer than the work's tolerance for
  having no owner
Prefer instead when:
- the work is per-key and the key space can be split: partitioned ownership gives one owner per
  key, scales with instances, and needs no election (sharding-and-partitioning)
- what is actually wanted is "do not run this twice concurrently" for a scheduled job that is
  idempotent — a lease-per-execution row (ShedLock-style) is simpler and honest about its limits
```

## Rules

- **A leader stops acting when renewal fails, not when it learns it lost.** Those are different
  instants and the gap between them is the split-brain window. The check is local: on the
  holder's own monotonic clock, stop before `lease_start + lease_duration − skew_margin −
worst_write_latency`, whether or not the store has been reachable to say so.
- Split-brain is two instances acting as leader at once, and its cost is whatever the work does
  twice — a doubled batch, two conflicting reconciliations, two outbound connections a peer
  rejects. Name that cost in the design; it decides how much fencing is worth.
- **A leader must be prepared to discover mid-operation that it is no longer leader.** Only two
  designs survive: every externally visible write carries the lease token and the resource
  rejects a stale one, or the work is idempotent and re-runnable so a duplicate converges.
- Export `is_leader` (0 or 1) from every instance and alert on `sum(is_leader) != 1` sustained
  beyond one lease period. Above 1 is split-brain observed; 0 is a job silently not running,
  which no other alert will catch.
- **Two peers alone cannot elect safely.** With no external arbiter, neither can distinguish "the
  other died" from "I am partitioned", and both leading is as defensible as both standing down.
  Two instances electing _through_ a quorum-backed store are fine — the store is the arbiter.
- Failover time is `detection + election + warm-up`, and detection is bounded below by the lease
  length. A 60-second lease means up to a minute with no leader after a crash, plus whatever
  priming the new leader needs. "Highly available" without that number is a claim nobody checked.
- The lease-length trade is explicit: **short leases give fast failover and false failovers**
  under a GC pause or a network blip, each of which costs a warm-up and a burst of churn; long
  leases give stability and a longer outage. Pick from the pause distribution and the budget.
- **ShedLock and equivalents are not leader election.** They are "do not run this twice"
  mechanisms built on a database row with an expiry (`lockAtMostFor`), and the expiry is a lease
  with the usual defect: a node still executing after it expires is not stopped, and there is no
  fencing token. That is _adequate_ for a job that is idempotent or tolerant of a skipped or
  duplicated run, and _not_ adequate when a second concurrent run corrupts data — set
  `lockAtMostFor` above the job's worst observed duration and treat overlap as possible anyway.
- The Kubernetes `Lease` object is a renewable record of a holder identity and a duration, and
  the basis of the lease-based election controllers use. Same property: it establishes who
  _should_ lead and does not stop a stalled former holder from writing.
- **A rolling deploy kills the leader deliberately**, so a service that deploys daily fails over
  daily. Release the lease on shutdown so the successor need not wait out the full duration, and
  stop leading at SIGTERM rather than at the end of the grace period — otherwise the new leader
  starts while the old one is still finishing.

## References

- [Leases, renewal and the split-brain window](references/lease-and-split-brain.md) — renewal
  timing, the stop-acting rule as code on a monotonic clock, the split-brain sequence, lease
  selection against pauses and blips, the failover budget, and rolling-deploy behaviour. Read
  when choosing a lease duration or after a duplicate run.
- [Mechanisms and alternatives](references/election-mechanisms.md) — the ways to avoid electing
  at all, then coordination-store lease, Kubernetes Lease and ShedLock-style database rows
  compared on fencing, failover time, dependencies and what each is adequate for, with a
  decision block. Read when choosing a mechanism or reviewing one already in place.
