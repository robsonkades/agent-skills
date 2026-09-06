---
name: session-state-strategies
description: >
  Placing the state that spans several requests of one conversation: client session state,
  server session state and database session state, plus signed tokens and external stores.
  Use when a multi-step wizard loses its data on the second replica, when HttpSession holds
  an object graph, when sticky sessions are added to keep an application working, when a
  rolling deploy logs everyone out, when a JWT carries mutable state or cannot be revoked,
  when session data is pushed into Redis without deciding what happens if Redis is down, or
  when "make it stateless" is proposed without saying where the state will go. Does not
  cover making an instance disposable in general (stateless-service-design), cache design
  (caching-strategies), or locks held across a conversation (offline-concurrency-control).
---

# Session State Strategies

## Purpose

Decide where the state of a multi-request conversation lives, from what the state actually
is, and accept the consequences deliberately. This is a placement decision with three
honest answers, not a morality question with one correct one; "stateless is better" is a
slogan that hides the fact that the state still exists and has merely moved somewhere with
different properties.

## The three placements

```text
Client session state    the client holds it and sends it back each request.
                        Server need not retain the conversation payload.
                        Costs bandwidth; signing protects integrity, not
                        confidentiality. Expiry/revocation may require state.

Server session state    the server holds it between requests, keyed by an
                        identifier the client returns. In-process state can
                        prevent disposal without loss; routing and replication
                        address different parts of this problem.

Database session state  the conversation's state is rows in the database,
                        tied to a session key. Durability depends on commits,
                        replication and recovery. Requires I/O, access control
                        and cleanup for abandoned conversations.
```

An external store (Redis, a session grid) is server session state that has been moved out
of the process. It buys disposability and costs a network hop and a new dependency on the
request path.

## Workflow

Inspect the target JDK, Servlet/framework versions, session repository and effective configuration;
examples do not authorize upgrades. Preserve the existing authentication contract unless changing
it is within scope. Separate evidence from suspected causes when logs or failure tests are absent.

1. **Inventory what is actually in the session**, item by item. Most sessions hold four
   distinct kinds of thing and each wants a different placement — see the decision rules.
2. **Establish the state's lifetime and value.** Lost on restart: annoying, or a lost
   transaction? Must it survive a week? Must it be auditable?
3. **Establish its size and change rate.** Kilobytes changing every request behave very
   differently from a 40-byte identifier that never changes.
4. **Place each item**, not the session as a whole. Compare an opaque server session and
   self-contained tokens for identity; durable workflow storage, client preferences and
   recomputation/caching may coexist.
5. **Decide the failure behaviour** for whatever is remote: if the session store is down,
   does the request fail, or serve an explicitly public experience? Never bypass required
   authentication/authorization or silently turn a protected mutation into anonymous work.
6. **Decide expiry and cleanup at design time.** Abandoned conversations accumulate;
   without a TTL or a sweeper, the store grows without bound.

## Decision rules

```text
Identity and authorisation claims (who, roles, tenant)
        → opaque session or validated signed token, selected by trust,
          revocation and deployment requirements. Roles/tenant membership
          can change; define freshness and refresh/revocation behavior.

Small preferences and UI state (locale, theme, last tab)
        → client, in a cookie. No server involvement, survives restarts.

In-progress workflow whose loss costs the user real work
(multi-step application, long form, basket that must survive days)
        → durable shared storage, often database rows. Recovery across browsers
          needs a secure identity/recovery path; audit history must be designed.

Short conversation state, small, no business value if lost
(a wizard completed in two minutes)
        → bounded server state or validated client state may suffice.
          Sticky routing alone gives affinity, not failover or durability.

Data derived from other state (totals, permissions computed from roles)
        → recompute, or cache with an explicit freshness/invalidation policy
          (caching-strategies). Sessions rot mainly by accumulating this.

Anything security-sensitive the client must not see or change
        → prefer server-side; signing alone cannot hide it. Authenticated
          encryption may fit a deliberate protocol with key/replay management.

Large object graphs, entities, ORM-managed objects
        → none of the placements. Store identifiers and reload. A
          serialised entity graph in a session is a version-coupled
          time bomb (orm-behavioral-patterns).
```

## Rules

- **"Stateless" means no state whose loss changes a correct outcome** — not "nothing in
  memory". A signed token moves state to the client; an external store moves it to another
  server. Both are legitimate; neither makes the state disappear
  (`stateless-service-design`).
- Sticky routing alone loses in-process conversations when their instance is lost. It may
  coexist with replication or shared storage for locality; verify failover independently.
- Replication cost depends on replica count/topology, save policy and consistency. Test
  acknowledged-write loss, version skew and conflicting updates; a rolling deploy does not
  inherently imply split-brain. Compare the existing container facilities with external storage.
- Offline signature verification alone cannot observe individual revocation. Expiry bounds
  acceptance only when enforced and refresh is also revoked; lookup or pushed revocation state
  has propagation/cache/failure costs. State the worst accepted revocation delay.
- Token size is paid wherever it is transmitted; redact it from logs. Claims accumulate; a
  4 KB token in a header multiplied by a service chain is a measurable cost and can exceed
  proxy header limits, which fails in a way that looks nothing like its cause.
- Never put an ORM-managed entity into any session store. Serialisation drags the object
  graph, lazy proxies fail outside their persistence context, and the class shape becomes a
  compatibility contract across deploys. Store the identifier.
- Database session state needs a cleanup strategy from day one — a TTL column and a
  scheduled delete, or partitioning by date. Abandoned baskets are the commonest source of
  a table that quietly reaches a hundred million rows.
- Every remote session store is now on the request's critical path, with its own
  availability, latency and failure mode. Give it a timeout and a defined degradation
  (`timeouts-and-deadlines`); a session lookup with no timeout turns a store hiccup into a
  full outage.
- Session state that is only ever written and never read is common and invisible; audit it
  when a session grows. So is state written by one path and read by none after a refactor.
- Concurrency inside one session is real: two browser tabs, or a double-submit, mutate the
  same conversation. Server and database session state need the same protection as any
  other shared state (`offline-concurrency-control`).
- Rotation/invalidation must survive concurrent requests and replication: prevent a stale save
  from restoring an invalidated session. A version column alone does nothing without an atomic
  expected-version check. Enforce owner/tenant and expiry at access time, not only in cleanup.
- Deliver a per-item placement, authority/lifetime, failure and concurrency policy, plus tests
  for loss, outage, stale writers and mixed versions. Missing evidence remains a validation gap.

## References

- [Placing session state](references/state-placement.md) — the three classical placements
  and the modern variants compared on scalability, failover, security, latency and cost,
  with the per-item placement table, token design (size, expiry, revocation) and the
  external-store configuration decisions that actually matter. Read when choosing, or when
  auditing what a session currently holds.
- [Session failure modes](references/session-failure-modes.md) — what breaks on a rolling
  deploy, at the second replica, when the store is unavailable, when a token cannot be
  revoked, when two tabs edit one conversation, and when sessions grow without bound; each
  with its detection and its fix. Read when diagnosing session-related production
  behaviour, or before adding sticky routing.
