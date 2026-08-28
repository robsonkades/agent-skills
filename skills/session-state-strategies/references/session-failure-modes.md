# Session Failure Modes

Each of these appears in production, none appears in a single-instance development
environment, and most are misdiagnosed as something else.

## Everyone is logged out by a deploy

**Symptom:** a rolling deploy produces a spike of logins, abandoned baskets and support
calls.

**Cause:** in-process server session state. Every replaced instance drops its sessions.

**Misdiagnosis:** "the load balancer is not draining properly". Draining helps in-flight
requests, not sessions that live in the instance's heap.

**Fix:** move identity to a token and valuable state to the database. An external session
store also fixes it, and is the lighter change when the session is small and transient.

**Verify:** kill one instance under load; no conversation should break.

## It works on one replica and fails on two

**Symptom:** a wizard loses its data intermittently; the failure rate is roughly
`(n-1)/n`.

**Cause:** server session state without sticky routing or replication.

**The wrong fix that gets applied:** enable sticky sessions. It works, and it converts an
obvious bug into a subtle one — the conversation now breaks only during deploys and
scale-in, which is when nobody is watching for it.

**Fix:** place the state per the placement table (`state-placement.md`). Sticky routing is
acceptable only for state that is cheap to lose.

## The session store is down and everything is down

**Symptom:** a Redis blip produces 500s on every endpoint, including pages that do not need
a session.

**Cause:** the session filter runs before everything, has no timeout, and has no degraded
path.

**Fix:** a hard timeout on the store (a few hundred milliseconds); a defined degradation
(anonymous experience, or fail only endpoints that require a session); no session lookup at
all on endpoints that do not need one — which requires the filter to be scoped rather than
global (`timeouts-and-deadlines`).

**Verify:** run with the store blocked and confirm which endpoints still work. If the answer
is none, the dependency is stronger than intended.

## The token cannot be revoked

**Symptom:** an account is disabled and the user keeps working for the token's remaining
lifetime.

**Cause:** self-contained tokens are valid until they expire, by construction.

**Options, with their real costs:** short expiry plus refresh (revocation latency equal to
the access token's lifetime; no per-request lookup); a denylist checked per request
(immediate, but the store is now on the critical path and must be highly available);
introspection against the issuer (immediate, and the issuer becomes a hard dependency of
every request).

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

- **Fixation:** the session identifier must be regenerated on privilege change (login).
  Frameworks do this by default; custom session handling frequently does not.
- **Cookie flags:** `HttpOnly`, `Secure` and an appropriate `SameSite` are not optional.
- **Identifiers in URLs** leak through referrers, logs and shared links. Never place a
  session or draft identifier in a query string that a user may copy.
- **Logging.** Tokens and session identifiers must be redacted; access logs are the most
  common place they escape redaction is a logging-configuration concern.
- **Tenant in the session, trusted downstream.** If a tenant identifier arrives in a token
  and every query trusts it, the token's signature is the entire tenant isolation
  mechanism. Keep a server-side check on the critical paths.

## Diagnostic sequence

1. What is in the session? Log the key set in production for a week.
2. Where does each item live, and where should it live per the placement table?
3. What is the behaviour when the store or the instance is lost — for each item?
4. What is the expiry and who enforces it?
5. What happens with two tabs?
6. What is the p99 added latency of the session lookup on the request path?
