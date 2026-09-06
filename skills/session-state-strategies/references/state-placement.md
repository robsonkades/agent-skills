# Placing Session State

## The comparison

| Dimension           | Client (cookie/token)                | Server, in-process                 | Server, external store         | Database                           |
| ------------------- | ------------------------------------ | ---------------------------------- | ------------------------------ | ---------------------------------- |
| Instance disposable | yes                                  | only with acceptable loss/recovery | yes                            | yes                                |
| Survives restart    | while client retains valid data      | no without recovery                | depends on store durability    | depends on commit/recovery         |
| Survives store loss | yes                                  | n/a                                | no                             | no (but it is your database)       |
| Cost per request    | transmitted bytes plus verification  | lookup/locking/heap                | network and save/TTL policy    | queries, writes and contention     |
| Size limit          | cookie and aggregate header limits   | bound bytes/session and count      | bound bytes/session and count  | bound row/payload and total growth |
| Confidentiality     | requires suitable encryption         | access controls required           | access controls required       | access controls required           |
| Tamper resistance   | validated MAC/signature or AEAD      | authorize every mutation           | authorize every mutation       | authorize every mutation           |
| Revocation          | expiry or current revocation state   | invalidation plus in-flight rules  | propagation/cache-dependent    | transaction/cache-dependent        |
| Auditability        | requires server-side audit events    | requires audit events              | requires audit events          | history/audit not automatic        |
| Cleanup             | client expiry plus server validation | container timeout                  | TTL and repository policy      | TTL column plus sweeper            |
| Typical failure     | token too large; cannot revoke       | lost on deploy or scale-in         | store down on the request path | table growth; write amplification  |

## Per-item placement, in practice

A typical "session" holds four different things. Placing them together is what makes
session design hard; placing them separately makes it straightforward.

| Item                                    | Placement                          | Why                                                                          |
| --------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| User id, roles, tenant                  | Opaque session or validated token  | Choose revocation/freshness contract; roles and membership change            |
| Locale, theme, last-used filter         | Cookie                             | Trivially recomputable; nobody minds losing it                               |
| Multi-step application form             | Database row keyed by a draft id   | Losing it costs the user real work; must survive deploys                     |
| Shopping basket (must survive days)     | Durable store plus access control  | Recovery/audit are explicit; a client id alone is not authorization          |
| Shopping basket (session-scoped only)   | External store, TTL of hours       | Cheap, expected to be transient                                              |
| CSRF token                              | Framework-supported CSRF scheme    | Synchronizer token or properly bound signed double-submit, not bare equality |
| Wizard step counter for a 2-minute flow | Client hint or authoritative state | Server must validate allowed transitions; do not trust hidden fields         |
| Permissions computed from roles         | Nowhere — recompute or cache       | Derived state in a session goes stale silently                               |
| The `User` entity                       | Nowhere — store the id             | Serialised entities break across deploys (`orm-behavioral-patterns`)         |

Derived state needs a freshness contract. A TTL alone can be too stale for revoked permissions;
choose recomputation or invalidation from the allowed delay (`caching-strategies`).

## Token design

For identity carried in a signed token:

- **Keep claims minimal.** User id, tenant, a small role set, expiry, issuer. Not the
  user's profile, not their permissions matrix, not their last order.
- **Size discipline.** Test encoded tokens together with other headers/cookies against each
  deployed hop's limits. Redact credentials from logs; no universal 2 KB threshold applies.
- **Validate the token contract.** Allowlist algorithms and trusted keys; verify signature,
  issuer, intended audience, token purpose and required claims. Enforce `exp`/`nbf` using JWT
  NumericDate seconds and bounded clock skew; decoding is not validation. Recheck resource/tenant
  authorization, including the allowed staleness of embedded roles.
- **Expiry and revocation.** Choose lifetime from the required delay. Refresh must reject a
  revoked account/session; otherwise short access lifetimes just issue more tokens. A denylist,
  introspection or pushed revocation policy must include propagation, negative-cache TTL and
  outage behavior. Cached “not revoked” answers delay enforcement; do not call that immediate.
- **Confidentiality and transport.** A signature does not encrypt claims or prevent replay of
  a stolen bearer token. Prefer minimal claims; use a reviewed authenticated-encryption protocol
  only if needed, with decryption keys limited to intended recipients and TLS on transport.
- **Rotate keys** with an overlap based on accepted token lifetime and verifier caches. A
  compromised key may require immediate retirement; keeping it valid for overlap is not recovery.
- **Browser security.** Cookie-carried credentials still need CSRF protection. Use framework
  synchronizer tokens or session-bound signed double-submit as appropriate, plus cookie policy;
  `HttpOnly` and `SameSite` alone do not solve all CSRF/XSS risks.

## External store configuration

Moving server session state to Redis or similar is the common modernisation. The decisions
that matter:

For Spring Boot 3.3 servlet auto-configuration, the available Spring Session modules select the
repository; inspect the actual bean and configuration overrides. Do not assume an old
`spring.session.store-type` property selects it. `spring.session.timeout` configures session
inactivity, not the entire request deadline. Inspect connection/command/pool-acquisition limits,
save/flush mode, TTL refresh, eviction and persistence/replication behavior for the installed
client/repository. A pool's maximum size alone does not bound waiting, and Lettuce may share
connections instead of borrowing one for every request.

- **Serialisation format is a compatibility contract.** Java serialization has defined evolution
  rules; incompatible graphs can still break rolling readers. JSON also needs a versioned schema,
  safe type handling and old/new fixtures. A format switch alone does not prove compatibility.
- **Store identifiers, not managed graphs.** Measure reload cost and authorization checks;
  serialized graphs can retain excess data and couple deployed readers to class/schema evolution.
- **Inspect writes and refresh.** Even a read can refresh inactivity TTL. Understand attribute
  mutation detection and concurrent save semantics before changing write policy; skipping saves
  can lose in-place mutations or expire active sessions.
- **Decide the down behaviour.** Fail the request, or continue as anonymous with reduced
  functionality on public paths? Protected operations must reject unavailable authority rather
  than silently authorize an anonymous substitute. Test bypasses against the security filter chain.

## Database session state, done properly

Partial PostgreSQL 17 schema; it does not implement authentication, audit or concurrency by itself:

```sql
CREATE TABLE application_draft (
    id           UUID PRIMARY KEY,
    customer_id  BIGINT      NULL,          -- may be anonymous
    payload      JSONB       NOT NULL,      -- the in-progress form
    step         SMALLINT    NOT NULL,
    version      BIGINT      NOT NULL,      -- two tabs are concurrent editors
    updated_at   TIMESTAMPTZ NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX ON application_draft (expires_at);
```

Enforce expiry and owner/tenant on reads and writes. Anonymous drafts need an independently
protected access capability and a secure binding to the authenticated owner. Apply an atomic
`WHERE id = ... AND version = expected` update that increments `version`, checking affected rows;
a version column alone does not prevent lost updates. JSONB still needs a versioned payload schema.

The cleanup job is part of the design, not an operational afterthought:

```sql
WITH batch AS (
    SELECT id FROM application_draft
    WHERE expires_at < now()
    ORDER BY expires_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT 10000
)
DELETE FROM application_draft AS draft
USING batch
WHERE draft.id = batch.id;
```

PostgreSQL has no `DELETE ... LIMIT`. Run the batch only within an authorized retention cleanup,
with bounded transaction time and commits between batches. `SKIP LOCKED` requires later passes for
locked rows; inspect indexes/plan and foreign-key effects on the target (`enterprise-transactions`).

## Migrating server sessions out

1. **Inventory** source paths plus bounded, approved telemetry of attribute names/types/sizes;
   avoid raw credentials, values or uncontrolled production logging.
2. **Remove unnecessary derived data**, preserving required recomputation/cache paths and freshness.
3. **Preserve or deliberately migrate identity.** An opaque session in a shared repository can
   make instances disposable without replacing the authentication protocol with JWT.
4. **Move valuable workflow state to the database**, with its own table and expiry.
5. **Whatever remains** — small and transient — goes to an external store or stays with
   sticky routing consciously.
6. **Remove sticky routing if no longer needed**, then test replacement under load against the
   agreed conversation survival and recovery contract.

Run failure injection in an authorized isolated/canary environment and assert the agreed loss
budget, protected-route behavior and old/new compatibility rather than promising universal survival.

Sources: [PostgreSQL 17 DELETE](https://www.postgresql.org/docs/17/sql-delete.html),
[Spring Boot 3.3 Session](https://docs.spring.io/spring-boot/3.3/reference/web/spring-session.html),
[JWT BCP RFC 8725](https://datatracker.ietf.org/doc/html/rfc8725),
[JWT time claims RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519#section-4.1.4),
[OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
