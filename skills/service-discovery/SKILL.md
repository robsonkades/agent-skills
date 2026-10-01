---
name: service-discovery
description: >-
  Design and diagnose endpoint discovery when membership changes, clients cache stale information or bootstrap depends on an unavailable source. Define authority, update, expiry and failure contracts separately from load balancing.
---

# Service Discovery

## Purpose and boundary

Make a logical service name resolve to a defensible, time-bounded view of its endpoints.
Use this skill for discovery design, stale membership incidents, registration/removal,
bootstrap failure and Java client integration. Discovery establishes a known set and its
provenance; it does not prove that an endpoint is healthy, authorized for an operation,
reachable from this caller, or the correct owner of a data shard.

When relevant, hand eligibility, selection and connection reuse to
`load-balancing-and-routing`; local proxy delegation to `ambassador-pattern`; readiness
and drain timing to `kubernetes-service-lifecycle`; and HTTP client wiring to
`spring-http-clients`. Those skills are optional follow-ups. Continue the discovery
analysis with an explicit handoff contract if they are unavailable. Mesh adoption is
not a prerequisite or an outcome of stale discovery alone.

## Establish the evidence

Inspect the caller and deployed path before prescribing a registry or cache setting:

- Logical name and namespace/tenant/environment; discovery authority and credentials;
  DNS, configuration, registry, proxy or platform API actually consulted by each caller.
- Registration owner, instance identity/incarnation, advertised address/port/protocol,
  renewal/removal mechanism, authoritative absence semantics and known convergence target.
- Snapshot versus delta/watch protocol; revision semantics, reconnect/resync behavior,
  positive/negative caches and whether the backend itself serves a cached view.
- Client resolver and transport, connection reuse/re-resolution triggers, effective JDK,
  Spring Boot/Cloud/provider versions, BOM/toolchain and deployment configuration. Resolve
  ambiguous dependency versions from the build; do not infer behavior from a starter name.
- Timestamped source records, consumer snapshots, refresh outcomes and actual connection
  destinations during the same incident. DNS success is evidence of an answer, not of
  application availability; registry health is not endpoint health.

Reuse adequate evidence. If source consistency, client caching or stale tolerance is
unknown, identify the discriminating capture or fault test, give conditional options and
continue independent work. Ask only for missing facts that change the recommendation.
Separate observed membership and traffic from the hypothesis that a cache caused failure.

The architectural contract is framework independent. The executable teaching example uses
Java 21 standard APIs, without preview or dependencies; its authoring checks target Java 21
with a JDK 25 compiler and execute on JDK 25. This is not runtime-21 validation. Applying
the skill does not authorize a Java, Spring or infrastructure upgrade.

## Workflow and decisions

1. **Choose the authority, keeping an adequate existing source.** A stable configured
   service address plus DNS/platform routing can meet the requirement without exposing
   replicas to every client. Direct instance discovery is justified when clients need
   instance metadata or membership and can own update/recovery semantics. Compare
   configuration, DNS, a maintained registry client and the platform's existing API by
   required freshness, bootstrap dependencies, client support and operational ownership.
   Do not add a second registry simply because services are distributed.
2. **Define the membership lifecycle.** Name who registers, updates and removes each
   incarnation, and when an advertised endpoint is usable from the caller's network.
   Prevent a delayed unregister from an old process deleting its replacement. Document
   crash/lease expiry separately from graceful removal; neither immediately rewrites
   every consumer cache. Decide how authenticated writers are restricted to their service
   and environment. A successful heartbeat is only the source's declared observation.
3. **Define a coherent update contract.** Full snapshots replace a complete scoped view;
   deltas require a known base, continuity and deletion handling. Never publish half a
   paginated list or treat a delta as the whole set. Reject rollback only with the source's
   actual ordering guarantee; an opaque token or wall-clock timestamp is not an invented
   sequence number. Reconnect from an accepted cursor or resync when history is lost.
   Authority changes need an explicit reset/epoch boundary and rejection of late old-source
   callbacks. Read [Source and client semantics](references/source-and-client-semantics.md)
   for DNS, Kubernetes and Spring-specific limits.
4. **Specify the cache state machine before choosing TTLs.** Distinguish uninitialized,
   fresh nonempty, authoritative empty, stale and expired/unavailable. A timeout, denied
   read, decoding failure or watch disconnect is not an authoritative empty answer.
   Do not stamp stale upstream data as newly authoritative just because a local poll
   succeeded. State positive TTL, negative-result policy, bounded stale allowance,
   refresh owner, total refresh deadline and boot behavior; derive values from the
   tolerated exposure window and source/client semantics rather than framework defaults.
5. **Choose stale policy from the operation's hazard.** A previously verified read replica
   may remain useful during a source outage if bounded stale membership is permitted and
   destination identity remains valid. A removed or revoked endpoint, cross-tenant
   destination or expired ownership grant must not be resurrected to improve availability.
   Authoritative removal supersedes old positive entries. With no acceptable snapshot,
   return a typed unavailable outcome or a deliberately degraded service mode; a new
   process cannot use an in-memory last-known-good view it has never obtained.
6. **Implement only the requested change.** Use the maintained client's existing cache
   and lifecycle when they satisfy this contract. Keep source I/O and cancellation outside
   cache publication locks; publish immutable snapshots atomically, bound service keys and
   endpoint counts, coalesce refreshes and jitter retries. Own and close watches/executors.
   Preserve logical service identity for TLS and HTTP authority when substituting physical
   addresses. Do not authorize a destination merely because a registry returned it.
   Read [Java snapshot resolver](references/java-snapshot-resolver.md) when implementing
   or testing local state transitions; it is a contract illustration, not a production
   replacement for Spring or a provider client.
7. **Verify the actual propagation path.** Exercise registration, replacement, removal,
   source outage, recovery and cold start using the target client. Measure time to stop
   using removed endpoints separately from time to receive the new snapshot. Existing
   connections can outlive DNS/cache TTLs; hand reconnect/drain requirements to routing.
   A review may end with findings and a reproducer; implement and document rollback only
   when the request includes changes.

## Failure and acceptance contract

Record the source scope, freshness limit, stale allowance, empty/unknown behavior and
bootstrap dependency as a small contract. Validate the risks relevant to the request:

| Scenario                                                      | Required observable behavior                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| An older refresh completes after a newer snapshot             | It cannot restore removed endpoints or silently renew their age; ordering follows the source contract.              |
| Full authoritative response contains zero endpoints           | Previously known endpoints are removed; negative caching has an explicit expiry/recovery path.                      |
| Source fails after a usable snapshot                          | Serve only within the chosen freshness/stale limit, expose degradation, then fail according to the contract.        |
| Source is unavailable on cold start                           | Bound waiting/retries; fail readiness or the affected operation as designed, without fabricated fallback addresses. |
| Watch history is lost or a list is incomplete                 | Resynchronize a complete view; do not present partial state as current.                                             |
| A record names a forbidden environment, scheme or destination | Reject and report the record; preserve TLS identity and avoid following redirects into unauthorized destinations.   |

Use a decisive pair: identical source outages with an operation that permits bounded
stale membership versus one requiring prompt endpoint revocation. The permitted behavior
must change. Test fresh and already-connected clients; a passing cache unit test cannot
prove transport convergence. Use bounded metric dimensions such as service and outcome;
put specific addresses/revisions in protected diagnostic events when needed. Useful
signals include time since authoritative refresh, accepted revision, endpoint count,
refresh error category, stale-served count and unknown/expired outcomes.

## Deliverable and limits

For a diagnosis or review: provide the evidence, finding/hypothesis, consequence, proposed
adjustment or justified no-change, and a check that could refute it. For a design: also
name authority and lifecycle owners, client/cache path, state and failure contract,
alternatives rejected and condition for reconsideration. For implementation: deliver
the focused code/configuration, consumer wiring, failure tests and operational recovery;
rollback must not restore endpoints whose identity or authority has been revoked.

Report structural checks, executable-example tests and actual agent/runtime evaluations
separately. Cite applicable primary contracts and versions for framework claims. A configured
TTL is not a measured convergence guarantee, a successful lookup is not a health proof,
and local snapshot age does not establish age at the authoritative source.
