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
                        Server keeps nothing. Costs bandwidth on every
                        request, and the data is visible and tamperable
                        unless signed or encrypted.

Server session state    the server holds it between requests, keyed by an
                        identifier the client returns. Cheapest to program,
                        and it is what makes an instance non-disposable —
                        the reason sticky routing and replication exist.

Database session state  the conversation's state is rows in the database,
                        tied to a session key. Survives everything,
                        including a total restart. Costs a write per step
                        and needs cleanup for abandoned conversations.
```

An external store (Redis, a session grid) is server session state that has been moved out
of the process. It buys disposability and costs a network hop and a new dependency on the
request path.

## Workflow

1. **Inventory what is actually in the session**, item by item. Most sessions hold four
   distinct kinds of thing and each wants a different placement — see the decision rules.
2. **Establish the state's lifetime and value.** Lost on restart: annoying, or a lost
   transaction? Must it survive a week? Must it be auditable?
3. **Establish its size and change rate.** Kilobytes changing every request behave very
   differently from a 40-byte identifier that never changes.
4. **Place each item**, not the session as a whole. The usual outcome is: identity in a
   token, workflow state in the database, preferences in a cookie, and derived data
   recomputed or cached.
5. **Decide the failure behaviour** for whatever is remote: if the session store is down,
   does the request fail, or degrade to an anonymous experience?
6. **Decide expiry and cleanup at design time.** Abandoned conversations accumulate;
   without a TTL or a sweeper, the store grows without bound.

## Decision rules

```text
Identity and authorisation claims (who, roles, tenant)
        → signed token in the client, short-lived, with a refresh path.
          Add a revocation check only where revocation latency matters,
          and accept that this reintroduces a lookup.

Small preferences and UI state (locale, theme, last tab)
        → client, in a cookie. No server involvement, survives restarts.

In-progress workflow whose loss costs the user real work
(multi-step application, long form, basket that must survive days)
        → database session state. It is the only placement that survives a
          restart, a deploy and a browser change, and it is auditable.

Short conversation state, small, no business value if lost
(a wizard completed in two minutes)
        → server session state, external store, short TTL. Sticky routing
          is acceptable here and nowhere else.

Data derived from other state (totals, permissions computed from roles)
        → do not store it at all. Recompute, or cache with a TTL
          (caching-strategies). Sessions rot mainly by accumulating this.

Anything security-sensitive the client must not see or change
        → never client-side, even signed. Signing prevents tampering,
          not reading; encryption adds key management to every replica.

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
- Sticky sessions are a routing workaround for a placement decision, and they degrade
  precisely when it matters: a deploy, a scale-in, or an instance failure drops exactly the
  conversations that were in progress. Acceptable for cheap, short-lived state; not for
  anything the user would be upset to lose.
- Session replication between application instances is the option that looks cheapest and
  ages worst: N× memory, chattier as the cluster grows, serialisation coupling between
  versions, and split-brain during a rolling deploy. Prefer an external store or the
  database.
- A signed token is not revocable by construction. Anything that must be revoked promptly
  (a fired employee, a stolen device) needs a lookup — a short expiry plus refresh, or a
  revocation list. Decide which, and state the resulting revocation latency.
- Token size is paid on every request, in every hop, in every log. Claims accumulate; a
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
