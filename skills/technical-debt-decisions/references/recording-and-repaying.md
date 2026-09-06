# Recording and repaying

## The record

Six useful fields; reuse existing issue/decision records. Add evidence or acceptance details
only when the risk warrants them. Review can happen during routine planning too.

```
WHAT      Exports reject more than 50,000 rows, with measured byte/runtime guardrails.
WHY       Async export job was 4 days; the pilot date was fixed.
COST      Support handles the occasional request manually (~1/month so far).
TRIGGER   Before onboarding a tenant needing larger exports, or at the pilot review.
UNDO      Validate bounded async export, migrate callers, then lift MAX_EXPORT_ROWS.
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
  `// Capped at 50,000 rows; async export is BILL-4471`. This is the version that reaches the
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

Give the trigger an observer and response: an existing metric, onboarding check, scheduled
review or justified alert. A date with an owner and review action is valid; inventing an alert
or a ten-minute estimate is unnecessary. A trigger nobody observes is unreliable.

## Estimating carrying cost

Prioritise by what the debt costs to carry, not by how much it bothers you. Three sources,
roughly in order of reliability:

1. **Time added to changes that touch it.** If every change in this module takes an extra half
   day of care, that is measurable from the history and is the strongest argument available.
2. **Incidents or defects attributable to it.** Price severity, frequency, detection and recovery;
   one incident does not imply a universal priority over accumulated delivery delay.
3. **Blocked work.** Estimate the opportunity cost of the attributable delay using the value
   and timing of the blocked capability; days of delay alone are not a monetary cost.

Missing numbers leave carrying cost unknown. Use ranges and supporting examples; history alone
does not isolate the delay caused by debt from scope, staffing or workload changes. Include
security/support exposure, recovery and lost options. Compare expected avoided cost over a
stated horizon against repayment effort, migration risk and displaced work; do not manufacture
precision or double-count the same incident as both lost delivery and support cost.

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
place. It can support continued operation, but dual paths, state synchronization and cutover
introduce risk; it is neither inherently safe nor the only online migration approach
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

That record also needs the assessed exposure/recovery risks and revisit condition below;
without them, it is insufficient evidence for declining repayment.

This is better than leaving it open for ever, because an unrepaid backlog item is
indistinguishable from a forgotten one, and a backlog full of forgotten items is why nobody
reads the backlog.

Closing rather than deferring requires evidence that repayment is not worthwhile under the
accepted risk/horizon, including exposure and recovery burden, plus a revisit condition.
Low change frequency and passing tests alone do not establish low risk; missing evidence is
not a reason to declare the cost zero.

## For an agent

- Report the shortcut you took in the summary of your work, not only in a code comment. "I
  implemented the cap rather than the async job; here is what that does not support" is
  information the user can act on; discovering it later is not.
- Do not take a shortcut that touches the never-tradeable list to satisfy a request for speed.
  Say what it would cost and offer the smaller scope instead (engineering-communication).
- Stay within authorized scope, including necessary prerequisite fixes and explicitly delegated
  cleanup. Record unrelated opportunities without expanding the task; keep behavioral changes
  reviewable (java-refactoring, coding-agent-discipline).

## Primary reference

- [Fowler: Technical Debt](https://martinfowler.com/bliki/TechnicalDebt.html) — carrying cost, repayment and uncertainty in effort estimates.
