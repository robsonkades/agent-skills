# Deciding

## The quadrant

Fowler's two axes — deliberate or inadvertent, prudent or reckless — matter because each
quadrant needs a different response, and treating them alike is why debt conversations go
nowhere.

|                 | **Prudent**                                                         | **Reckless**          |
| --------------- | ------------------------------------------------------------------- | --------------------- |
| **Deliberate**  | "We ship without the async job to make the pilot; here's the plan." | "No time for design." |
| **Inadvertent** | "Now that it's built, we can see the boundary was wrong."           | "What's a layer?"     |

- **Deliberate/prudent** is debt intentionally incurred and easiest to manage: record, trigger,
  repay. The other quadrants can still describe technical debt; the labels explain how it arose and
  what prevention is needed, not whether its future cost exists.
- **Inadvertent/prudent** is learning, and it is unavoidable — you could not have known before
  building it. Do not apologise for it; refactor when the better boundary is clear
  (java-refactoring).
- **Deliberate/reckless** may buy speed while underestimating consequences. Address both
  the resulting debt and the decision conditions that produced it.
- **Inadvertent/reckless** is a skills or review gap. The fix is upstream — pairing, review,
  gates — not a cleanup sprint that will regenerate it.

The practical value: when someone says "we have a lot of technical debt", ask which quadrant.
The answer determines whether you need a plan, a refactoring, a conversation, or a gate.

## Constraints delivery pressure does not waive

Apply actual obligations and their established exception process. Existing delegated authority
remains valid; risk acceptance cannot override a requirement that permits no exception.

Each of these is on the list because the cost of the shortcut is not paid by the team that took
it, or because it cannot be detected once taken.

| Never traded                                                     | Because                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Correctness of money or of a legal record                        | The error compounds silently and reconciliation may be impossible      |
| Authorisation on a newly reachable path                          | You cannot detect what was accessed afterwards without an audit log    |
| Silent data loss                                                 | Nobody reports what they never saw was missing                         |
| An irreversible migration with no tested recovery or forward-fix | Failure can exceed the recovery objectives when reversal is impossible |
| Secrets in logs, traces or error responses                       | Retention means it is already distributed by the time you notice       |
| Removing the only effective evidence for a high-risk change      | It leaves the accepted behavior or control unverified                  |

Performance, documentation and edge cases may be tradeable when they are not tied to an SLO,
safety/legal obligation, accessibility commitment or resource-exhaustion failure. Classify the
consequence, not the engineering label; treating everything as non-negotiable dilutes real controls.

## Containment checklist

Before taking a shortcut, make it cheap to undo:

- [ ] It lives behind one interface or in one module, not spread across callers.
- [ ] It has one entry point, so the future change has one place to happen.
- [ ] It is visible in the code — a named limit (`MAX_EXPORT_ROWS`), not an omission
      a reader must notice.
- [ ] It fails loudly outside its intended range, rather than silently doing the wrong thing —
      throw on the unsupported case rather than guessing.
- [ ] Nothing new will be built on it before it is repaid, or if it will be, that is part of the
      decision.
- [ ] There is a test asserting the _current, limited_ behaviour, so repaying it is verifiable.

The last one is counter-intuitive and it is the one that makes repayment possible: a test
documenting "only supports one currency" tells the next person exactly what changes when the
limit is lifted.

## Three worked decisions

### A deadline

> The export must ship Thursday. The asynchronous job for large exports is four days of work.

**Traded:** support for customers above ~50,000 orders.

**Constraint check:** passes only if the pilot's accepted scope permits rejecting large
exports and no required user journey or obligation depends on them. Do not assume acceptance
merely because rejection preserves data and authorization.

**Contained:** a validated cap of 50,000 exported rows plus measured payload/field-byte and
query/runtime limits. Reject oversize requests before expensive materialization; never silently
truncate. A 12-month range alone does not bound rows. Name the limit in the error and test
boundary behavior.

**Recorded:** trigger is "before onboarding a tenant needing exports above the cap, or at the
scheduled pilot review". Cost of
carrying is a support ticket now and then. Owner named.

**Why this can be prudent:** the accepted limitation is visible, safely bounded and testable,
and buys a delivery benefit that exceeds its expected cost under the stated assumptions.

The reckless version of the same decision: ship it uncapped, let large exports time out with a
504, and plan to "look at performance later". Same four days saved; the failure is silent from
the code's point of view, arrives as a mystery, and there is no line to delete when it is fixed.

### An incident

> Checkout is failing. The cause is a connection pool default. The fix is one property, but the
> proper fix is a configuration test and a pool-saturation metric.

**Order:** mitigate now — set the property, deploy, confirm the metric recovers. That is not
debt, that is incident response.

**Debt taken:** configuration intent and failure coverage remain unverified. An explicit
property need not change with a library default; inspect actual binding and deployment
precedence before predicting recurrence.

**Recorded during handoff or follow-up**, while context remains available: the config test and the metric, with a
trigger of "before the next dependency upgrade of this client". This is the "remaining" section
of the post-incident summary (engineering-communication), and it is the part that stops the
incident recurring.

### A spike becoming production

> The spike works. Shipping it is two days; rebuilding it properly is six.

The most dangerous of the three, because the code exists and looks finished.

Spike code answers a limited question. Inspect the production properties actually established;
missing tests/error paths/configuration are possible, not facts implied by the label. Shipping
without assessing those gaps can create reckless debt.

If it must ship, the minimum before it does:

- the never-tradeable list, checked line by line — spikes routinely skip authorisation and
  validation entirely;
- tests for the behaviour it actually needs to have, which is also how you find out what it
  does;
- hardcoded values named and moved to configuration, or documented as deliberate;
- error paths that fail loudly rather than returning empty results.

Estimate this minimum from the actual risk; do not inherit the example's day count. If essential
authorization, correctness and failure evidence cannot be supplied or explicitly accepted by the
authorized owner, the honest statement is “this is not ready to ship.”

## The question that settles most of these

> If this shortcut is still in place in a year, what will it have cost, and will anyone know
> why it is there?

A shortcut whose cost is bounded and whose reason is recorded is a legitimate trade. One whose
cost grows and whose reason will be lost is not a trade at any deadline — it is a transfer of
the cost to people who did not agree to it.

## Primary reference

- [Fowler's Technical Debt Quadrant](https://martinfowler.com/bliki/TechnicalDebtQuadrant.html) — deliberate/inadvertent and prudent/reckless describe how debt arises.
