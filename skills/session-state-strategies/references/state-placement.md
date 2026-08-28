# Placing Session State

## The comparison

| Dimension           | Client (cookie/token)                    | Server, in-process               | Server, external store         | Database                          |
| ------------------- | ---------------------------------------- | -------------------------------- | ------------------------------ | --------------------------------- |
| Instance disposable | yes                                      | no (needs sticky or replication) | yes                            | yes                               |
| Survives restart    | yes                                      | no                               | yes (store's durability)       | yes                               |
| Survives store loss | yes                                      | n/a                              | no                             | no (but it is your database)      |
| Cost per request    | bandwidth, every request, every hop      | none                             | one network round trip         | one query, sometimes a write      |
| Size limit          | ~4 KB cookie; headers limited by proxies | heap                             | practical: tens of KB          | none in practice                  |
| Confidentiality     | visible unless encrypted                 | private                          | private                        | private                           |
| Tamper resistance   | needs a signature                        | inherent                         | inherent                       | inherent                          |
| Revocation          | hard; needs expiry or a list             | immediate                        | immediate                      | immediate                         |
| Auditability        | none                                     | none                             | limited                        | full — it is a table              |
| Cleanup             | expiry in the cookie                     | container timeout                | TTL in the store               | your job: TTL column plus sweeper |
| Typical failure     | token too large; cannot revoke           | lost on deploy or scale-in       | store down on the request path | table growth; write amplification |

## Per-item placement, in practice

A typical "session" holds four different things. Placing them together is what makes
session design hard; placing them separately makes it straightforward.

| Item                                    | Placement                         | Why                                                                  |
| --------------------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| User id, roles, tenant                  | Signed token, short expiry        | Small, stable, needed on every request, needed by every service      |
| Locale, theme, last-used filter         | Cookie                            | Trivially recomputable; nobody minds losing it                       |
| Multi-step application form             | Database row keyed by a draft id  | Losing it costs the user real work; must survive deploys             |
| Shopping basket (must survive days)     | Database, with the id in a cookie | Business value; auditable; also serves recovery e-mails              |
| Shopping basket (session-scoped only)   | External store, TTL of hours      | Cheap, expected to be transient                                      |
| CSRF token                              | Cookie plus per-form value        | Must be per-session; small                                           |
| Wizard step counter for a 2-minute flow | Client, in the form               | Trivial; no server state at all                                      |
| Permissions computed from roles         | Nowhere — recompute or cache      | Derived state in a session goes stale silently                       |
| The `User` entity                       | Nowhere — store the id            | Serialised entities break across deploys (`orm-behavioral-patterns`) |

The most valuable line is the last-but-one. Sessions rot by accumulating derived data that
was expensive once; the fix is a cache with a TTL, not a session field that no invalidation
path knows about (`caching-strategies`).

## Token design

For identity carried in a signed token:

- **Keep claims minimal.** User id, tenant, a small role set, expiry, issuer. Not the
  user's profile, not their permissions matrix, not their last order.
- **Size discipline.** Every claim is paid on every request, in every hop of a service
  chain, and in every access log. Past roughly 2 KB, proxy header limits become a live
  concern, and the failure (a 431, or a truncated header) does not resemble its cause.
- **Short expiry plus refresh.** 5–15 minutes for the access token means a revoked user is
  locked out within that window without a per-request lookup. This is the standard
  compromise and it is a compromise: state the revocation latency explicitly.
- **Immediate revocation requires a lookup.** A denylist keyed by token id, checked per
  request, with the store's availability now on the critical path. Adopt it only where the
  requirement is real, and cache the negative answer.
- **Signature, not encryption, by default.** Signing prevents tampering; it does not hide
  the contents. Anything the user must not read requires encryption, which requires key
  distribution to every verifier — a significant operational step, so avoid needing it.
- **Rotate keys**, and support two valid keys during rotation, or every rotation is an
  outage.

## External store configuration

Moving server session state to Redis or similar is the common modernisation. The decisions
that matter:

```yaml
spring:
  session:
    store-type: redis
    timeout: 30m # TTL — abandoned sessions must expire
  data:
    redis:
      timeout: 200ms # request-path timeout: never unbounded
      lettuce:
        pool:
          max-active: 16 # bounded, sized against the connection budget
```

- **Serialisation format is a compatibility contract.** Java serialisation couples every
  replica to the exact class shape and makes a rolling deploy a version conflict. Use JSON
  with an explicit, versioned representation.
- **Store identifiers, not graphs.** A session with three ids re-reads cheaply; a session
  with a serialised object graph is slow to write, slow to read, and breaks on the deploy
  that renames a field.
- **Write only when something changed.** Frameworks that persist the session on every
  request turn a read-only page into a write to the store.
- **Decide the down behaviour.** Fail the request, or continue as anonymous with reduced
  functionality? Both are defensible; the default (an exception from a filter, producing a
  500 on every page) is not a decision.

## Database session state, done properly

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

Four things this gets right and hand-rolled versions usually miss: an explicit expiry with
an index to sweep it; a version column, because two browser tabs are genuine concurrent
editors (`offline-concurrency-control`); a payload shape that can evolve; and an identity
that works before the user has one.

The cleanup job is part of the design, not an operational afterthought:

```sql
DELETE FROM application_draft WHERE expires_at < now() LIMIT 10000;   -- chunked, repeated
```

Unbounded deletes on a large table are their own outage (`enterprise-transactions`).

## Migrating server sessions out

1. **Inventory** what is in the session today — log the keys in production for a week
   rather than reading the code, because the code will not mention what an old feature left
   behind.
2. **Delete the derived data.** Usually the largest share, and it needs no replacement.
3. **Move identity to a token.** Independent, and it delivers most of the disposability.
4. **Move valuable workflow state to the database**, with its own table and expiry.
5. **Whatever remains** — small and transient — goes to an external store or stays with
   sticky routing consciously.
6. **Then remove sticky routing**, and verify by killing an instance under load and
   confirming that no conversation breaks.
