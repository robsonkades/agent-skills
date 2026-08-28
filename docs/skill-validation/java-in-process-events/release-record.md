# Release record — `java-in-process-events`

|                 |                                                                    |
| --------------- | ------------------------------------------------------------------ |
| **Status**      | **Not shipped.** Withdrawn before drafting, at the boundary check. |
| **Date**        | 2026-08-28                                                         |
| **Version**     | none — no `SKILL.md` was written                                   |
| **Disposition** | Residue ported into `gof-observer/references/observer-variants.md` |

## Why it was withdrawn

The research brief (2026-08-27) rated the gap **"genuine, well-shaped, and larger than expected"**,
and its decisive finding was a single fact:

> `gof-observer` does not exist in this repo, yet
> `gof-pattern-thinking/references/pattern-inventory.md` routes to it and classifies Observer as
> one of the six High-risk patterns.

That was true when the brief was written, against 208 skills. It is false now. `gof-observer`
exists — `SKILL.md` plus `references/observer-variants.md` and `references/worked-example.md` —
and it was verified, section by section, to already own five of the brief's six reserved items:

| Reserved for `java-in-process-events` (brief §8)                                                                                        | Owner found in the current tree                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| The direct-call versus in-process-event decision                                                                                        | `gof-observer` § "When it is not": _"There is one listener and it is known. Call it."_           |
| Dispatch semantics — synchrony, unspecified order, an exception aborting the multicast, reentrancy, the snapshot question               | `gof-observer` § "What people assume, and what holds" and § "Ordering, errors, reentrancy"       |
| The transaction interaction — the four `TransactionPhase` constants, the `AFTER_COMMIT` write silently discarded without `REQUIRES_NEW` | `observer-variants.md` § "Spring's event phases", with the full table and both named failures    |
| Async listener context loss (security context, MDC)                                                                                     | Same section                                                                                     |
| Mechanism selection across the three levels (in-process, reactive, distributed pub/sub)                                                 | `observer-variants.md` § "The three levels, chosen deliberately"                                 |
| Naming, and the command-in-event-clothing test                                                                                          | `event-driven-architecture` at service granularity; `gof-observer` § "When it is not" in-process |

What remained was one level finer than any of those: **which in-process mechanism**, the
debuggability affordances, and the expiry condition for a bus. That is a section in an existing
reference, not a 200-line skill. Building it would have repeated the `java-domain-modeling`
outcome from earlier in the same session — a package that is mostly routing, failing the suite's
own scope-hygiene gate.

## What was kept, and where it went

All of it went into `skills/gof-observer/references/observer-variants.md`, inserted between "The
three levels, chosen deliberately" and "Testing the two things nobody tests", so it reads as the
drill-down from the coarse choice that section already makes.

1. **The in-process mechanism table** — hand-rolled `List`/`CopyOnWriteArrayList`,
   `PropertyChangeSupport`, Guava `EventBus`, Spring `@EventListener` and
   `@TransactionalEventListener`, Modulith `@ApplicationModuleListener`, `Flow` — compared on the
   three columns that actually decide: synchrony, ordering, and what happens when a listener
   throws.
2. **Guava `EventBus`, with its maintainers' own recommendation against it**, quoted from the
   Guava wiki and class javadoc, together with the point that matters in practice: it is **not**
   `@Deprecated`, so nothing warns at compile time. This was the brief's strongest single
   citation.
3. **`PropertyChangeSupport`'s disqualifier** — it lives in `java.desktop`, so a headless service
   takes an AWT/Swing module dependency to get a listener list; plus `String`-named properties and
   the silent no-fire when old and new values are equal and non-null.
4. **Spring Modulith's Event Publication Registry** stated precisely: an outbox that writes a log
   entry per transactional listener inside the publisher's own transaction, giving at-least-once
   per listener with completion tracking — not ordering, not exactly-once, and not idempotency.
   Republication on restart is opt-in.
5. **The expiry condition** — the three-part conjunction that must all hold before a bus pays,
   the four cases where it specifically does not, and the after-the-fact signals (change
   amplification, time to answer "what happens when X?", incident MTTR).
6. **Two affordances**: a dispatch-depth counter for reentrancy — including the Spring trap where
   a listener whose return type stops being `void` silently becomes a publish site — and
   subscriber introspection, because every stack frame between the business call and a listener
   failure belongs to the dispatcher.

`gof-observer` is untracked and unreleased at 1.0.0, so no version bump was required.

## What was discarded, and why

- The whole body that would have been written: purpose, scope, workflow, decision rules,
  before/after, over-application. Every one of those would have restated `gof-observer`.
- The lapsed-listener leak material — `java-reference-types-and-leaks` and `gof-observer` own it,
  and the brief explicitly flagged duplicating it as the most likely review failure.
- The cross-service half — broker, delivery guarantees, schema, deployment — which was never in
  scope: `event-driven-architecture`, `delivery-semantics`, `idempotency`,
  `message-ordering-and-partitioning`, `distributed-transactions-and-sagas`, `event-sourcing`.

## Known limits of the disposition

- The port was **not** put through the full validation gate, because it is an addition to an
  existing package rather than a new one. Its claims are traceable to the brief's §2.2, §2.3, §2.6,
  §2.8, §4 and §5.3, all of which were source-verified there against the Java 21 javadoc, the Guava
  wiki and javadoc, and the Spring Modulith 2.1.1 reference documentation.
- One `UNVERIFIED:` from the brief is carried implicitly: the exact current Guava release line. The
  ported text names no Guava version, which is the brief's own recommendation.
- The brief's §6 before/after material (direct calls → event publication, and an over-eventified
  flow → direct call) was not ported. `gof-observer/references/worked-example.md` already carries a
  worked example, and a second one would have been the duplication this withdrawal exists to avoid.
