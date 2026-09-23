# Plan template

Select sections warranted by the feature depth; a Light plan can be a few inline entries. Established
inapplicability may read `none, because <reason>`; missing evidence is an explicit unknown/blocker,
not N/A. Reuse authoritative artifacts and links rather than copying their full contents.

```markdown
# <Feature name>

Input revisions: <Product + Engineering | Tech Feature>
Depth: Light | Standard | Deep
Persistence: Inline | Dossier
Dossier: <existing authorized location, or N/A for Inline>
Repository baseline: <revision and relevant working-tree changes>
Status: draft | ready for <phase and scope/resources>, with gate reference
Updated: <actual date>

## Summary

<Three sentences: what becomes possible, for whom, by what mechanism.>

## Scope

In scope: <accepted scope items, by identifier; priority alone does not include an item>
Out of scope: <each item, its reason, and who excluded it>

## Decisions

| ID  | Decision | Provenance | Owner | Status | Record |
| --- | -------- | ---------- | ----- | ------ | ------ |

## Architecture

<The shape of the change in five lines. What is new, what it plugs into, the direction
of the dependencies.>

## Impact

<The impact map, or a pointer to it in analysis.md if it is long.>

## Resources

| ID  | Resource | Trace | Dependencies/gates | Files | Planned evidence | Owner/progress link |
| --- | -------- | ----- | ------------------ | ----- | ---------------- | ------------------- |

## Execution order

Forced integration/release: RES-03 needs RES-01's column applied and its migration checks passed.
Ready initially: RES-01, RES-02, RES-05, subject to ownership/shared-file constraints.
RES-03 may also be implemented now if its accepted contract and adequate fixture already exist;
otherwise name the missing implementation input. Its integration/release gate remains pending.
RES-02 and RES-05 have no dependency on that chain. Label scheduling preferences separately.

## Schema changes

<Each object, the migration that makes it, whether existing rows are rewritten, and
the compatibility window: what old code does against the new schema.>

## API and contract changes

<Each CT-* with authoritative specification/version, owner, compatibility window,
and what existing callers or consumers must tolerate.>

## Messaging changes

<Topics, payloads, ordering, delivery guarantee, consumers affected.>

## Configuration changes

<Each key: default, per-environment values, whether the application starts without it.>

## Security changes

<Authentication, authorisation rules, what data becomes reachable and by whom.>

## Observability changes

<Accepted metric, log and span changes; detection or reconciliation controls linked to RISK-*.
Carry their owner, response and planned validation. Preserve missing detection as unresolved
work or an explicitly accepted gap; do not invent an alert or imply coverage is verified.>

## Testing strategy

| Resource | Level | Against | Must establish |
| -------- | ----- | ------- | -------------- |

## Migration strategy

<Ordered steps, including backfill and how it is batched, and what runs while it does.
For material steps, link accepted prerequisites, success/stop conditions and responsible role;
identify what must be checked after failure or interruption before resuming.>

## Deployment strategy

<Order of deployment across components; whether a flag gates it; whether old and new
run at the same time. Carry the accepted evidence and conditions for progressing, pausing or
invoking recovery at each material stage; preserve unknown criteria as stage-specific blockers.>

## Rollback strategy

<What is done at each stage if it goes wrong. Explicitly: what cannot be rolled back
once it has run, and what the alternative is. Name the applicable recovery owner/runbook and
the checks that establish the resulting data/application state before traffic or work resumes.>

## Risks

| ID  | Risk | Impact | Detection | Mitigation | Fallback | GAP |
| --- | ---- | ------ | --------- | ---------- | -------- | --- |

## Dependencies and blockers

<External work, other teams, unanswered questions, and what each holds up.>

## Acceptance criteria

| ID       | Type               | Criterion    | Trace          | Verified by |
| -------- | ------------------ | ------------ | -------------- | ----------- |
| BAC/TC-* | business/technical | <observable> | <OBJ/BR/ED/CT> | EV-*        |

## Amendments

<date/revision> RES-06 added within accepted scope to implement TC-02 duplicate-effect
handling; RES-02 depends on it. Update the current resource graph and risk record, and
reference the applicable decision/readiness evidence rather than leaving only this note.
```

## Notes on three sections that are usually wrong

**Compatibility window.** The question is not whether the migration works. It is what the
currently deployed code does against the new schema, and what the new code does against rows
written before it. Write both.

**Rollback.** Most plans say "revert". Check it: a migration that has run, a message that has
been consumed, an event that has been published and an email that has been sent are not
reverted by a code rollback. State the real answer, including "not reversible after this
point", which is a legitimate answer that changes how carefully the preceding step is checked.

**Acceptance criteria.** They are checkable statements, not goals.

```text
Bad    The dispatch process is reliable.
Bad    Performance is acceptable.
Good   Given an order in NEW, when dispatch is accepted, then one durable dispatch intent
       and DISPATCHING state commit atomically within the accepted latency criterion.
Good   Given a duplicate dispatch request with the same idempotency key, when it is
       received, then no second logical dispatch intent is created and the original dispatch
       id is returned; relay/redelivery duplicates do not repeat the consumer's business effect.
```

Each one names its verification: a test identifier, a manual step, or a metric.
These are illustrative criteria to trace to an accepted contract, not new requirements to insert.
Define the durability/latency boundary, relay recovery and eventual completion separately when
needed; one logical intent does not imply one broker delivery. The outbox relay can republish after
a crash ([Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html)).
