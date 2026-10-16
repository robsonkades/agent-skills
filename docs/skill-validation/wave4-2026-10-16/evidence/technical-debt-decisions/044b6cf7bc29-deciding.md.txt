# Deciding

## The quadrant

Fowler's two axes — deliberate or inadvertent, prudent or reckless — help ask how debt arose
and what response might help. They do not establish intent, competence or preventability from
the resulting design alone. Keep unknown history unknown. These examples illustrate the axes;
they are not quotations or observations about a particular team.

|                 | **Prudent**                                                         | **Reckless**          |
| --------------- | ------------------------------------------------------------------- | --------------------- |
| **Deliberate**  | "We ship without the async job to make the pilot; here's the plan." | "No time for design." |
| **Inadvertent** | "Now that it's built, we can see the boundary was wrong."           | "What's a layer?"     |

- **Deliberate/prudent** is an intentional trade whose expected benefit justifies its cost and
  accepted risk. Manage it through an adequate record and review; repayment is not inevitable.
  The other quadrants can still describe debt, regardless of whether taking it was sensible.
- **Inadvertent/prudent** can arise through learning despite sound practice. A clearer design
  does not prove that this particular debt was unavoidable or make repayment worthwhile by
  itself. Compare carrying cost with repair effort and risk before refactoring (java-refactoring).
- **Deliberate/reckless** may buy speed while underestimating consequences. Address both
  the resulting debt and the decision conditions that produced it.
- **Inadvertent/reckless** may indicate a skills, review or decision-process gap. Investigate
  that cause rather than inferring it from unfamiliar code; address confirmed recurrence risks
  alongside any justified repair.

Use the axes when origin matters to prevention. The current cost, obligations and available
options still determine whether to repair, contain or retain the design.

## Constraints delivery pressure does not waive

Apply actual obligations and their established exception process. Existing delegated authority
remains valid; risk acceptance cannot override a requirement that permits no exception.

These shortcuts can transfer harm beyond the team or undermine detection/recovery. Assess the
actual consequence; neither a debt label nor a record makes an impermissible trade acceptable.

| Do not silently trade                                            | Risk                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Correctness of money or of a legal record                        | Errors can compound; detection and reconciliation may be difficult       |
| Authorisation on a newly reachable path                          | Exposes data/actions; later audit does not substitute for access control |
| Silent data loss                                                 | Missing data may escape detection and exceed recovery objectives         |
| An irreversible migration with no tested recovery or forward-fix | Failure can exceed the recovery objectives when reversal is impossible   |
| Secrets in logs, traces or error responses                       | Retention means it is already distributed by the time you notice         |
| Removing the only effective evidence for a high-risk change      | It leaves the accepted behavior or control unverified                    |

Performance, documentation and edge cases may be tradeable when they are not tied to an SLO,
safety/legal obligation, accessibility commitment or resource-exhaustion failure. Classify the
consequence, not the engineering label; treating everything as non-negotiable dilutes real controls.

## Containment checklist

Select controls for the actual limitation and expected lifetime. An adequate local guard may
be enough; multiple entry points or a staged migration can be valid when their contracts stay
bounded. Check the cost of containment rather than assuming undo will be cheap:

- [ ] Its affected callers and state are known; use an existing boundary where useful.
- [ ] Relevant entry points enforce the same limit, or their deliberate differences are explicit.
- [ ] It is visible in the code — a named limit (`MAX_EXPORT_ROWS`), not an omission
      a reader must notice.
- [ ] Unsupported cases follow an explicit rejection, fallback or result contract. Do not mask
      failure as success; a valid empty result need not become an exception.
- [ ] Nothing new will be built on it before it is repaid, or if it will be, that is part of the
      decision.
- [ ] The current limitation has appropriate evidence, such as boundary tests or an operational
      check, so a later change can verify which contract is being replaced.

A test documenting "only supports one currency" can show the next person what changes when
the limit is lifted. Preserve deliberately supported behavior rather than blessing a defect.

## Three worked decisions

These are illustrative scenarios. Their costs, frequencies, approvals and signals are premises
to establish in a real decision, not measured results to copy into another project.

### A deadline

> The export must ship Thursday. The asynchronous job for large exports is four days of work.

**Traded:** exports exceeding 50,000 rows within the accepted pilot scope.

**Constraint check:** passes only if the pilot's accepted scope permits rejecting large
exports and no required user journey or obligation depends on them. Do not assume acceptance
merely because rejection preserves data and authorization.

**Contained:** a validated cap of 50,000 exported rows plus measured payload/field-byte and
query/runtime limits. Reject oversize requests before expensive materialization; never silently
truncate. A 12-month range alone does not bound rows. Name the limit in the error and test
boundary behavior.

**Recorded:** trigger is "before onboarding a tenant needing exports above the cap, or at the
scheduled pilot review". Cost of
carrying is an estimated support burden to verify during the pilot. Owner named.

**Why this can be prudent:** the accepted limitation is visible, safely bounded and testable,
and buys a delivery benefit that exceeds its expected cost under the stated assumptions.

The reckless version of the same decision: ship it uncapped, let large exports time out with a
504, and plan to "look at performance later". A timeout can arrive after substantial resource
use without a safe bound. Compare actual containment cost and delivery benefit; do not assume
the capped and uncapped choices save the same four days.

### An incident

> Checkout is failing. Evidence identifies an effective connection-pool default as the cause,
> and a property correction is a bounded mitigation. A configuration test and a pool-saturation
> metric are proposed follow-up controls.

**Order:** under actual incident authority, verify effective configuration and use the bounded
mitigation if supported. Confirm checkout and available operational signals recover; do not
claim a proposed metric already exists. If the cause is only suspected, investigate it rather
than treating this scenario as proof. Mitigation can also introduce temporary debt.

**Remaining evidence:** determine which configuration intent, limits and failure coverage remain
unverified; the proposed test/metric is justified only if it addresses a real gap. An explicit
property need not change with a library default; inspect actual binding and deployment
precedence before predicting recurrence.

**Recorded during handoff or follow-up**, while context remains available: confirmed gaps, owner,
and a review/repair condition appropriate to current exposure. "Before the next dependency
upgrade of this client" fits only if waiting is acceptable. This belongs in the post-incident
summary (engineering-communication); a record, test or metric cannot guarantee no recurrence.

### A spike becoming production

> The spike works. Shipping it is two days; rebuilding it properly is six.

Working prototype code can look finished before its production requirements have been assessed.

Spike code answers a limited question. Inspect the production properties actually established;
missing tests/error paths/configuration are possible, not facts implied by the label. Shipping
without assessing those gaps can create reckless debt.

Before shipping, assess its actual production requirements and the evidence for them:

- the applicable constraints above, including authorization and validation; prototype origin
  alone does not establish that these are absent;
- tests for the behaviour it actually needs to have, which is also how you find out what it
  does;
- hardcoded values named and moved to configuration, or documented as deliberate;
- explicit error/result contracts that do not hide failure as a valid empty result.

Estimate this minimum from the actual risk; do not inherit the example's day count. If essential
authorization, correctness and failure evidence cannot be supplied, shipping requires any
applicable permitted exception from the actual authority; non-exceptionable requirements remain
binding. Otherwise the honest statement is “this is not ready to ship.”

## The question that settles most of these

> If this shortcut is still in place in a year, what will it have cost, and will anyone know
> why it is there?

A bounded, recorded shortcut can be legitimate when its benefit, accepted risks and obligations
justify it over the relevant horizon. Growing cost is a reason to reassess options, not proof
that every such trade was invalid. Unknown cost or missing authority must remain explicit.

## Primary reference

- [Fowler's Technical Debt Quadrant](https://martinfowler.com/bliki/TechnicalDebtQuadrant.html) — deliberate/inadvertent and prudent/reckless describe how debt arises.
