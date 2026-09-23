# Recording and repaying

## The record

Six useful fields; reuse existing issue/decision records. Add evidence or acceptance details
only when the risk warrants them. Review can happen during routine planning too. The example's
numbers are illustrative; use observed or explicitly estimated local values, or mark them unknown.

```
WHAT      Exports reject more than 50,000 rows, with measured byte/runtime guardrails.
WHY       Async export job was 4 days; the pilot date was fixed.
COST      Support handles the occasional request manually (~1/month so far).
TRIGGER   Before onboarding a tenant needing larger exports, or at the pilot review.
UNDO      Validate bounded async export, migrate callers, then lift MAX_EXPORT_ROWS.
OWNER     Billing team.
```

**UNDO** records the current removal/replacement idea and its uncertainty when repayment is an
option. Capturing known constraints while context is available can help later work, but a credible
plan may require investigation. Do not invent effort estimates or a repayment plan for a design
deliberately retained until retirement.

## Where the record lives

It needs to be found by two different people: the one planning work, and the one reading the
code.

- **An owned issue/record** in the team's actual prioritization process. An actively triaged
  maintenance board can work; an ignored main backlog cannot. Reuse an adequate existing record.
- **A pointer at the relevant site**, when a code reader needs it:
  `// Capped at 50,000 rows; async export is BILL-4471`. This is the version that reaches the
  person who is about to build on the shortcut. Use the team's discoverable record identifier
  rather than only saying "temporary"; not every small decision needs all three record forms.
- **A decision record**, when the shortcut shaped an architectural boundary
  (architecture-decision-making).

Avoid `// TODO` and `// FIXME` as the only record. They are searchable but commonly unowned,
untriggered and disconnected from prioritization across repositories. A
`TODO` with a ticket reference is fine; a bare one is a wish.

## Triggers that actually fire

A trigger needs an observer and agreed response; scheduled inspection or review can supply
both. It may initiate reassessment, retirement or repayment rather than require automatic repair.

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

Prioritise by what the debt costs to carry, not by how much it bothers you. Choose relevant
evidence rather than assuming a fixed reliability ranking among these sources:

1. **Time added to changes that touch it.** If every change in this module takes an extra half
   day of care, investigate examples and competing causes; history can support an estimate,
   not isolate a causal half-day by itself.
2. **Incidents or defects attributable to it.** Price severity, frequency, detection and recovery;
   one incident does not imply a universal priority over accumulated delivery delay.
3. **Blocked work.** Estimate the opportunity cost of the attributable delay using the value
   and timing of the blocked capability; days of delay alone are not a monetary cost.

Missing numbers leave carrying cost unknown. Use ranges and supporting examples; history alone
does not isolate the delay caused by debt from scope, staffing or workload changes. Include
security/support exposure, recovery and lost options. Compare expected avoided cost over a
stated horizon against repayment effort, migration risk and displaced work; do not manufacture
precision or double-count the same incident as both lost delivery and support cost.

On reassessment, compare options from now. A past delivery benefit or effort already spent
explains the history but does not itself justify retaining debt or finishing a rewrite.
Exclude unrecoverable past expenditure from the comparison; existing code, tests and knowledge
can still change remaining effort and risk. Include future abandonment/cleanup, migration,
parallel-running and opportunity costs where they differ between options. Do not charge the
original rewrite budget again or treat its spent portion as a benefit of continuing.

## Repayment strategies

**Opportunistic** — improve it within an authorized change when shared context and checks reduce
the added cost. Coupling, release risk or displaced work may make a separate repair cheaper.
Keep the change reviewable, splitting necessary work into coherent steps when useful (code-review).

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

Closing with a reason can be clearer than leaving an item with no disposition. An actively
reviewed deferred item can also be useful; distinguish accepted retention or deferral from
forgotten work through its recorded status and owner.

Closing rather than deferring requires evidence that repayment is not worthwhile under the
accepted risk/horizon, including exposure and recovery burden, plus a revisit condition.
Low change frequency and passing tests alone do not establish low risk; missing evidence is
not a reason to declare the cost zero.

## For an agent

- Report the shortcut you took in the summary of your work, not only in a code comment. "I
  implemented the cap rather than the async job; here is what that does not support" is
  information the user can act on; discovering it later is not.
- Do not bypass an applicable non-exceptionable control to satisfy a request for speed.
  Say what it would cost and offer the smaller scope instead (engineering-communication).
- Stay within authorized scope, including necessary prerequisite fixes and explicitly delegated
  cleanup. Record unrelated opportunities without expanding the task; keep behavioral changes
  reviewable (java-refactoring, coding-agent-discipline).

## Primary references

- [Fowler: Technical Debt](https://martinfowler.com/bliki/TechnicalDebt.html) — carrying cost, repayment and uncertainty in effort estimates.
- [HM Treasury: The Green Book (2026), sunk costs](https://www.gov.uk/government/publications/the-green-book-appraisal-and-evaluation-in-central-government/the-green-book-2026#sunk-costs) — the appraisal distinction between unrecoverable past spending and future opportunity costs; this does not import government approval procedures into a debt decision.
