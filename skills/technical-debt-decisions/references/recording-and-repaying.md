# Recording and repaying

## The record

Six fields. Anything longer does not get written under pressure, which is the only time it
matters.

```
WHAT      Exports are capped at 12 months of data.
WHY       Async export job was 4 days; the pilot date was fixed.
COST      Support handles the occasional request manually (~1/month so far).
TRIGGER   A tenant above the cap is onboarded, or complaints exceed one a week.
UNDO      Remove EXPORT_MONTHS_CAP, implement AsyncExportJob (see spike branch).
OWNER     Billing team.
```

**UNDO** is the field people leave out and the one that decides whether repayment ever happens.
Written at the moment of the decision, it takes thirty seconds because you are holding the whole
design in your head. Reconstructed a year later it is an afternoon of archaeology, which is
usually enough friction to prevent it starting.

## Where the record lives

It needs to be found by two different people: the one planning work, and the one reading the
code.

- **A ticket** in the normal backlog, tagged, so it competes for time like everything else. A
  separate "tech debt board" is a place things go to be not prioritised.
- **A comment at the site**, pointing at the ticket:
  `// Capped at 12 months; async export is BILL-4471`. This is the version that reaches the
  person who is about to build on the shortcut, and it is why the comment must name the ticket
  rather than saying "temporary".
- **A decision record**, when the shortcut shaped an architectural boundary
  (architecture-decision-making).

Avoid `// TODO` and `// FIXME` as the only record. They are searchable but commonly unowned,
untriggered and disconnected from prioritization across repositories. A
`TODO` with a ticket reference is fine; a bare one is a wish.

## Triggers that actually fire

A trigger must be an event someone will observe without looking for it.

| Weak trigger            | Strong trigger                                        |
| ----------------------- | ----------------------------------------------------- |
| "When we have time"     | "Before the second tenant is onboarded"               |
| "Next quarter"          | "When this endpoint exceeds 100 rps" (with the alert) |
| "Soon"                  | "At the next change to this table's schema"           |
| "Before it's a problem" | "When support tickets about it exceed one a week"     |

Where the trigger is a threshold, create the alert at the same time. A trigger nobody can
observe is the same as no trigger, and building the observation is usually ten minutes.

## Estimating carrying cost

Prioritise by what the debt costs to carry, not by how much it bothers you. Three sources,
roughly in order of reliability:

1. **Time added to changes that touch it.** If every change in this module takes an extra half
   day of care, that is measurable from the history and is the strongest argument available.
2. **Incidents or defects attributable to it.** Price severity, frequency, detection and recovery;
   one incident does not imply a universal priority over accumulated delivery delay.
3. **Blocked work.** Debt that prevents a feature from being built has a cost equal to that
   feature's delay, which is often the largest number and the one nobody computes.

If none of the three produces a number, the debt may be costing nothing. That is a real
finding, and it belongs in the next section rather than in a backlog.

## Repayment strategies

**Opportunistic** — improve it when you are already changing that code. Cheapest, because the
context is loaded and the tests are already being run. Bounded by the diff a reviewer can hold
in their head; the moment it stops being reviewable it has become a project and needs to be
one (code-review).

**Scheduled** — a named piece of work with an estimate, competing with features. Correct when
the debt is too large for opportunistic repayment and its carrying cost is demonstrable.
Requires a real argument in the business's terms, which the carrying-cost numbers provide
(engineering-communication).

**Strangled** — build the replacement alongside, route traffic incrementally, remove the old
path when nothing uses it. Correct for debt that is load-bearing and cannot be modified in
place. Slow, safe, and the only approach that keeps working while you do it
(architecture-refactoring-paths).

**Never** — see below.

A focused remediation sprint can be appropriate for a migration deadline, systemic vulnerability,
reliability target or concentrated dependency upgrade. It does not replace fixing the flow that
creates recurring debt; measure whether ordinary work is generating debt faster than it is repaid
(`quality-gates`, `code-review`).

## Deciding not to repay

A legitimate and under-used outcome. Close the ticket with the reason:

> Not repaying. The module has not changed in 20 months, it is behind a stable interface, its
> tests pass, and no planned work touches it. If it needs a change, the first task will be to
> add characterisation tests — noted in the module's README.

This is better than leaving it open for ever, because an unrepaid backlog item is
indistinguishable from a forgotten one, and a backlog full of forgotten items is why nobody
reads the backlog.

The condition for closing rather than deferring: the debt is contained, it is not growing, and
nothing planned goes near it. If any of those is false, it is deferred, not declined.

## For an agent

- Report the shortcut you took in the summary of your work, not only in a code comment. "I
  implemented the cap rather than the async job; here is what that does not support" is
  information the user can act on; discovering it later is not.
- Do not take a shortcut that touches the never-tradeable list to satisfy a request for speed.
  Say what it would cost and offer the smaller scope instead (engineering-communication).
- Do not repay debt you were not asked to repay. Noticing it and mentioning it is useful;
  expanding the change to fix it makes the diff unreviewable and mixes behaviour changes into a
  refactoring (java-refactoring, coding-agent-discipline).
