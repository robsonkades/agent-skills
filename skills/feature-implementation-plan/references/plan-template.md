# Plan template

Every section appears. A section with nothing in it reads `none, because <reason>`.

```markdown
# <Feature name>

Depth class: Significant
Dossier: docs/features/<slug>/
Updated: 2026-09-04

## Summary

<Three sentences: what becomes possible, for whom, by what mechanism.>

## Scope

In scope: <Required and Recommended items, by identifier>
Out of scope: <each item, its reason, and who excluded it>

## Decisions

| ID  | Decision | Provenance | Record |
| --- | -------- | ---------- | ------ |

## Architecture

<The shape of the change in five lines. What is new, what it plugs into, the direction
of the dependencies.>

## Impact

<The impact map, or a pointer to it in analysis.md if it is long.>

## Resources

| ID  | Resource | Depends on | Files | Validation | Status |
| --- | -------- | ---------- | ----- | ---------- | ------ |

## Execution order

R-01 -> R-03 -> R-02 -> R-05
Forced: R-03 needs R-01's column. R-02 and R-05 are independent of each other.

## Schema changes

<Each object, the migration that makes it, whether existing rows are rewritten, and
the compatibility window: what old code does against the new schema.>

## API and contract changes

<Each endpoint or message, whether it is additive, and what existing callers or
consumers must tolerate.>

## Messaging changes

<Topics, payloads, ordering, delivery guarantee, consumers affected.>

## Configuration changes

<Each key: default, per-environment values, whether the application starts without it.>

## Security changes

<Authentication, authorisation rules, what data becomes reachable and by whom.>

## Observability changes

<Metrics with their names, log fields, spans, and the alert that would catch the HIGH
risks in the register.>

## Testing strategy

| Resource | Level | Against | Must establish |
| -------- | ----- | ------- | -------------- |

## Migration strategy

<Ordered steps, including backfill and how it is batched, and what runs while it does.>

## Deployment strategy

<Order of deployment across components; whether a flag gates it; whether old and new
run at the same time.>

## Rollback strategy

<What is done at each stage if it goes wrong. Explicitly: what cannot be rolled back
once it has run, and what the alternative is.>

## Risks

| ID  | Risk | Impact | Detection | Mitigation | Fallback |
| --- | ---- | ------ | --------- | ---------- | -------- |

## Dependencies and blockers

<External work, other teams, unanswered questions, and what each holds up.>

## Acceptance criteria

| ID  | Given / When / Then | Verified by |
| --- | ------------------- | ----------- |

## Amendments

2026-09-05 R-06 added. Implementing R-02 showed the consumer needs an idempotency
key to satisfy K-02; the risk register assumed the handler was idempotent
and it is not.
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
Good   Given an order in NEW, when dispatch is requested, then a dispatch event is
       published exactly once and the order moves to DISPATCHING within 2 seconds.
Good   Given a duplicate dispatch request with the same idempotency key, when it is
       received, then no second event is published and the response is the original
       dispatch id.
```

Each one names its verification: a test identifier, a manual step, or a metric.
