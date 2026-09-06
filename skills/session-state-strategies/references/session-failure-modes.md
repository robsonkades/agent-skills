# Session Failure Modes

These failure modes can occur in production or development. Treat the listed causes as hypotheses;
confirm the deployed storage, configuration and timeline before changing placement.

## Everyone is logged out by a deploy

**Symptom:** a rolling deploy produces a spike of logins, abandoned baskets and support
calls.

**Candidate causes:** lost in-process sessions, incompatible serialized data, changed cookie/key
configuration, or external-store eviction/expiry. Correlate logout with node and repository events.

**Misdiagnosis:** "the load balancer is not draining properly". Draining helps in-flight
requests, not sessions that live in the instance's heap.

**Fix:** address the evidenced cause. Shared session storage can preserve the existing login
protocol; durable workflow storage may be needed. A token migration is a separate contract change.

**Verify:** in an authorized test environment, replace one instance under load and assert the
agreed survival/loss budget, including old/new readers and in-flight writes.

## It works on one replica and fails on two

**Symptom:** a wizard loses its data intermittently; the failure rate is roughly
`(n-1)/n` only under uniform independent routing to n replicas with state on one replica.

**Cause:** server session state without sticky routing or replication.

**The wrong fix that gets applied:** enable sticky sessions. It works, and it converts an
obvious bug into a subtle one — the conversation now breaks only during deploys and
scale-in, which is when nobody is watching for it.

**Fix:** place the state per the placement table (`state-placement.md`). Sticky routing is
not a failover guarantee; it can coexist with durable/shared or replicated state for locality.

## The session store is down and everything is down

**Symptom:** a Redis blip produces 500s on every endpoint, including pages that do not need
a session.

**Cause:** the session filter runs before everything, has no timeout, and has no degraded
path.

**Fix:** bounded connect/acquire/command waits within the request deadline; a defined degradation
(anonymous experience, or fail only endpoints that require a session); no session lookup at
all on endpoints that do not need one — inspect lazy lookup or route/filter configuration
(`timeouts-and-deadlines`). Verify framework lookup behavior first. Never bypass required
authentication or authorization on protected operations when the store is unavailable.

**Verify:** run with the store blocked and confirm which endpoints still work. If the answer
is none, the dependency is stronger than intended.

## The token cannot be revoked

**Symptom:** an account is disabled and the user keeps working for the token's remaining
lifetime.

**Cause:** offline validation cannot learn an account's new status without updated authority.

**Options, with their real costs:** enforced short expiry plus revocable refresh bounds stale
acceptance by remaining lifetime and clock leeway. Denylist/introspection or pushed revocation state
can reduce delay, subject to propagation, cache TTL and outage policy. In-flight operations need
their own authority/recheck contract; an invalidation does not undo completed effects.

The design error is not picking the wrong option — it is not stating the revocation latency
anywhere, so it is discovered during a security incident.

## The token is too big

**Symptom:** intermittent 431 or 400 from a proxy, or a header truncated in one environment
and not another. Frequently appears only for users with many roles.

**Cause:** claims accumulate. Permissions, feature flags, a display name, a tenant list.

**Fix:** carry identity and a small role set; look everything else up. Add a test asserting
a maximum encoded token size for a worst-case user, because this regresses silently as
claims are added by different teams.

## Two tabs corrupt one conversation

**Symptom:** a multi-step form ends in an inconsistent state; a basket loses an item;
double-submits create two records.

**Cause:** the session is shared mutable state and two requests mutate it concurrently.
Container-managed sessions do not serialise access in any way you should rely on.

**Fix:** treat the conversation as data with a version, and detect the conflict
(`offline-concurrency-control`). For the double-submit case specifically, an idempotency
key on the submit is the direct answer (`idempotency`).
Require atomic compare-and-update with affected-row/result checks, not just a version field.
Test two writers from the same version and a stale request saving after logout/ID rotation;
the loser must not overwrite newer state or resurrect an invalidated session. Distributed stores
can lose updates too; container attribute-map safety does not protect mutable attribute objects.

## The session grows without bound

**Symptom:** heap grows with active users and never returns; or the session store's memory
climbs until eviction starts dropping live sessions.

**Cause:** accumulation. A search result cached "just for this request", a list of viewed
products, an entity graph put there to avoid a reload.

**Detection:** in the heap, sessions are reachable from the container's session manager —
a heap dump grouped by session shows the size distribution immediately
(`heap-dump-analysis`). For an external store, sample serialised sizes rather than trusting
the code.

**Fix:** the inventory step. Ask of each item: what recreates it if it is missing? If
recreating it is cheap, it does not belong in the session.

## Abandoned conversations fill the table

**Symptom:** a `basket` or `draft` table with a hundred million rows, most of them years
old; queries and backups degrade.

**Cause:** database session state with no expiry and no sweeper. Abandonment is the normal
case — most baskets are never checked out.

**Fix:** an `expires_at` column, an index on it, and a chunked delete job. Retrofitting
this to an existing large table requires a partitioned or batched deletion, which is a
migration in its own right (`architecture-refactoring-paths`).

## Session fixation and leakage

- **Fixation:** rotate the session identifier on authentication/privilege changes and invalidate
  the old authority according to the framework contract. Inspect defaults and test concurrent
  requests rather than assuming rotation occurs or survives a stale replicated save.
- **Cookie flags:** `HttpOnly`, `Secure` and an appropriate `SameSite` are not optional.
- **Identifiers in URLs** leak through referrers, logs and shared links. Never expose bearer
  session secrets there. An ordinary draft resource ID may be in a URL if every access checks
  authorization; it must not silently act as the sole access credential.
- **Logging.** Tokens and session identifiers must be redacted; access logs are a common
  place they escape. Test redaction across proxies, application errors and traces.
- **Tenant in the session, trusted downstream.** If a tenant identifier arrives in a token
  the service must still validate issuer/audience and enforce resource-to-tenant authorization.
  A valid signature alone does not prove the caller can access an arbitrary resource ID.

## Diagnostic sequence

1. What is in the session? Inspect code and bounded approved names/types/size telemetry.
2. Where does each item live, and where should it live per the placement table?
3. What is the behaviour when the store or the instance is lost — for each item?
4. What is the expiry and who enforces it?
5. What happens with two tabs?
6. What is the p99 added latency of the session lookup on the request path?

Sources: [Servlet 6.0 session concurrency](https://jakarta.ee/specifications/servlet/6.0/jakarta-servlet-spec-6.0),
[OWASP session lifecycle](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[JWT BCP](https://datatracker.ietf.org/doc/html/rfc8725).
