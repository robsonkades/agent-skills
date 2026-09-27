# Session Failure Modes

These failure modes can occur in production or development. Treat the listed causes as hypotheses;
confirm the deployed storage, configuration and timeline before changing placement.

## Everyone is logged out by a deploy

**Symptom:** a rolling deploy produces a spike of logins, abandoned baskets and support
calls.

**Candidate causes:** lost in-process sessions, incompatible serialized data, changed cookie/key
configuration, or external-store eviction/expiry. Correlate logout with node and repository events.

**Drain distinction:** draining only in-flight requests does not preserve later requests in
a heap-resident conversation. A planned full-conversation drain can work if admission/routing
and a finite remaining lifetime are enforced for the whole drain horizon. An inactivity timeout
that active users keep extending is not such a bound; neither drain protects an unplanned crash.

**Fix:** address the evidenced cause. Shared session storage can preserve the existing login
protocol; durable workflow storage may be needed. A token migration is a separate contract change.

**Verify:** use relevant existing evidence or an authorized replacement test for the claimed
survival/loss budget, including mixed readers/in-flight writes when those paths are affected.

## It works on one replica and fails on two

**Symptom:** a wizard loses its data intermittently; the failure rate is roughly
`(n-1)/n` only under uniform independent routing to n replicas with state on one replica.

**Candidate cause:** instance-local state without the needed routing/recovery contract. Trace
session identifiers, selected replica and actual repository/key/expiry behavior before concluding.

**Decision:** sticky routing may be sufficient when local conversation loss/recovery is accepted,
or valuable for locality with another recovery mechanism. It is insufficient when the contract
requires survival of instance loss and no adequate recovery exists.

**Fix:** place the state per the placement table (`state-placement.md`). Sticky routing is
not a failover guarantee; it can coexist with durable/shared or replicated state for locality.

## The session store is down and everything is down

**Symptom:** a Redis blip produces 500s on every endpoint, including pages that do not need
a session.

**Candidate causes:** eager lookup, an actual security/session requirement on each path, unbounded
store waits, or incorrectly configured public-route access. Inspect the effective filter chain.

**Fix:** bounded connect/acquire/command waits within the request deadline; a defined degradation
(anonymous experience, or fail only endpoints that require a session); no session lookup at
all on endpoints that do not need one — inspect lazy lookup or route/filter configuration
(`timeouts-and-deadlines`). Verify framework lookup behavior first. Never bypass required
authentication or authorization on protected operations when the store is unavailable.

**Verify:** compare route behavior with its intended authority contract using existing evidence
or an authorized outage test. All protected routes may deliberately fail closed; only an
unexpected dependency on a session-free/public path establishes that particular problem.

## The token cannot be revoked

**Symptom:** an account is disabled and the user keeps working for the token's remaining
lifetime.

**Candidate cause:** offline validation cannot learn an account's new status without updated
authority. Inspect the actual lookup/push/cache/expiry and refresh paths before attributing delay.

**Options, with their real costs:** enforced short expiry plus revocable refresh bounds stale
acceptance by remaining lifetime and clock leeway. Denylist/introspection or pushed revocation state
can reduce delay, subject to propagation, cache TTL and outage policy. In-flight operations need
their own authority/recheck contract; an invalidation does not undo completed effects.

The design error is not picking the wrong option — it is not stating the revocation latency
anywhere, so it is discovered during a security incident.

## The token is too big

**Symptom:** intermittent 431 or 400 from a proxy, or a header truncated in one environment
and not another. Frequently appears only for users with many roles.

**Candidate cause:** encoded claims or other headers/cookies exceed a specific hop's limit.
Measure the actual request and rejecting hop; status alone does not identify which header grew.

**Fix:** remove unjustified claims or change representation/lookup where the audience and
freshness contract permits it. Validate worst-case encoded tokens together with other headers
against actual hop limits; a fixed role/profile rule is not a substitute for that contract.

## Two tabs corrupt one conversation

**Symptom:** a multi-step form ends in an inconsistent state; a basket loses an item;
double-submits create two records.

**Distinguish identity from update conflicts.** A cookie-based login session can serve several
tabs; it is not an identifier for one business conversation. Servlet 6.0 section 7.7.3 tells
applications to assume client windows can share a session. Inspect the draft ID selected by
each request, not just the session ID or replica. Duplicate effects may also come from retries.

For independent workflows, consider A opening draft X, B opening draft Y, then A submitting its
next step. If opening B changed `session.currentDraft` to Y, A may edit Y even when the requests
run sequentially. Locking that pointer, versioning only the session or moving it to Redis does
not recover A's intended identity. Carry a conversation/draft ID in the request and keep state
under that key; a session-scoped map may suffice for accepted transient loss, while durable
drafts need the required shared recovery. Check owner/tenant, expiry and allowed transitions
for the selected draft on every operation. An ID is a selector, not proof of authority; preserve
the existing protected capability contract for anonymous drafts.

When both tabs intentionally edit X, distinct tab IDs must not silently fork the authoritative
draft or bypass conflict handling. Container-managed sessions do not serialize those business
updates. Use the actual conversation's concurrency protocol below. A tab-local UI hint may
remember a selector but cannot authorize it or establish independent server-side state.

**Fix for shared updates:** treat the conversation as data with a version, and detect the conflict
(`offline-concurrency-control`). For repeated submissions, use an operation-scoped idempotency
protocol binding key, intent/payload, authority and outcome; a key field alone does not prevent
duplicate effects (`idempotency`).
Require atomic compare-and-update with affected-row/result checks, not just a version field.
Test distinct drafts under the same session for isolation, then two writers to the same draft
from the same version. Also test a foreign/expired draft ID and a stale request after a tab
opens a different workflow; it must not redirect the mutation to that new workflow.
Test a stale request saving after logout/ID rotation;
the loser must not overwrite newer state or resurrect an invalidated session. Distributed stores
can lose updates too; container attribute-map safety does not protect mutable attribute objects.

## The session grows without bound

**Symptom:** heap grows with active users and never returns; or the session store's memory
climbs until eviction starts dropping live sessions.

**Candidate causes:** retained attributes, missing cleanup, longer lifetimes or a larger active
population. Attribute size, reachability and count distinguish them; heap growth alone does not.

**Detection:** in the heap, sessions are reachable from the container's session manager —
a heap dump grouped by session shows the size distribution immediately
(`heap-dump-analysis`). For an external store, sample serialised sizes rather than trusting
the code.

**Fix:** remove items only when recreation preserves the required draft/snapshot/authority
contract and cost. Bound retained size and population; cheap recomputation alone does not make
conversation continuity redundant.

## Abandoned conversations fill the table

**Symptom:** a `basket` or `draft` table with a hundred million rows, most of them years
old; queries and backups degrade.

**Candidate causes:** authorized retention, growing population, cleanup lag or retained abandoned
data. Inspect age/size/access distributions and policy; no automatic expiry alone is not a defect.

**Fix:** enforce the agreed retention/growth policy. For expiring drafts, an expiry column/index
and bounded delete job may fit; retained audit data may require archival or other controls.
Do not delete data merely because it is old. Retrofitting large-table cleanup requires a scoped
migration and authorized retention decision (`architecture-refactoring-paths`).

## Session fixation and leakage

- **Fixation:** rotate the session identifier on authentication/privilege changes and invalidate
  the old authority according to the framework contract. Inspect defaults and test concurrent
  requests rather than assuming rotation occurs or survives a stale replicated save.
- **Browser credential cookies:** configure `HttpOnly`, `Secure` over the intended HTTPS
  transport, and `SameSite` for actual cross-site needs; check deployed framework/proxy behavior.
  Non-credential UI preferences and non-cookie clients have different contracts.
- **Identifiers in URLs** leak through referrers, logs and shared links. Never expose bearer
  session secrets there. An ordinary draft resource ID may be in a URL if every access checks
  authorization; it must not silently act as the sole access credential.
- **Logging.** Tokens and session identifiers must be redacted; access logs are a common
  place they escape. Test redaction across proxies, application errors and traces.
- **Tenant in the session, trusted downstream.** If a tenant identifier arrives in a token
  the service must still validate issuer/audience and enforce resource-to-tenant authorization.
  A valid signature alone does not prove the caller can access an arbitrary resource ID.

## Diagnostic sequence

Select the questions needed to distinguish the reported hypotheses; reuse adequate evidence.
Do not require a full session audit or new latency/failure campaign for a narrow contract question.

1. What is in the session? Inspect code and bounded approved names/types/size telemetry.
2. Where does each item live, and where should it live per the placement table?
3. What is the behaviour when the store or the instance is lost — for each item?
4. What is the expiry and who enforces it?
5. What happens with two tabs?
6. What is the p99 added latency of the session lookup on the request path?

Sources: [Servlet 6.0 session concurrency and client semantics](https://jakarta.ee/specifications/servlet/6.0/jakarta-servlet-spec-6.0),
[OWASP session lifecycle](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[JWT BCP](https://datatracker.ietf.org/doc/html/rfc8725).
