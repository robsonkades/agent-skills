# Eliciting and prioritizing drivers

## Turn a concern into a question, not an automatic mapping

| Concern supplied              | Candidate question                                                               | Evidence that distinguishes the need                                              |
| ----------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Acquiring regional businesses | Which protocols, data meanings or workflows must interoperate?                   | Integration inventory, deadlines and representative incompatible exchanges        |
| Slow delivery                 | Is the delay in changing code, testing, deployment or approvals?                 | Change lead-time breakdown and failed-change examples                             |
| On-sale bursts                | Must capacity adjust during the burst, or can known demand be provisioned ahead? | Arrival ramp, headroom, provisioning lag and user-visible targets                 |
| “Never lose an order”         | What constitutes accepted, durable and recoverable?                              | Acknowledgement contract, failure cases, recovery and reconciliation requirements |
| Customer dissatisfaction      | Which journey fails, for whom and under what conditions?                         | Support evidence, failed requests, abandonment or accessibility findings          |

These are prompts, not derived requirements. Broad concerns often produce several candidates;
the business owner confirms the relevant outcomes, and the architect explains the structural
implications. If stakeholders cannot agree, record their competing scenarios and decision owner.
Do not manufacture consensus from a vote or an arbitrary score.

When a stakeholder names a mechanism such as microservices or Kafka, ask which outcome
it is intended to achieve and whether its use is actually mandated. A preference for
microservices may express a need for independent release schedules; confirm that scenario
without assuming the mechanism delivers it. Keep verified platform constraints, including
supported Java/framework versions, separately visible with their source and owner. Driver
elicitation does not authorize changing them. This method has no Java-version prerequisite.
SEI's [ATAM report](https://sei.cmu.edu/documents/629/2000_005_001_13706.pdf), sections 8.4–8.5,
distinguishes architectural approaches from the quality scenarios they aim to satisfy;
comparison of those approaches belongs to `architecture-trade-off-analysis`.

Check baseline security, maintainability, observability and feasibility concerns even when nobody
mentions them. Also inspect domain-specific obligations; a four-item prompt is not proof of
coverage or implementation. A critical baseline concern may itself become a driver.

## Keep the worksheet's two levels distinct

[Mark Richards' worksheet, revised March 2024](https://www.developertoarchitect.com/downloads/architecture-characteristics-worksheet.pdf)
asks for at most seven drivers, highlights three without ordering them, and records candidates
outside the seven separately. It also allows implicit concerns to become drivers.

Thus, four through seven are still drivers, not rejected requirements. If using this format,
keep the complete selected set alongside the highlighted three. Fewer than three justified
drivers is acceptable; do not invent extras to fill a form.

This skill treats the numbers as a facilitation heuristic, not an empirical limit on architecture.
When more concerns are consequential, check duplicates and scope, then document the justified
exception or use scenario prioritization. Do not split an actual coupled system merely to meet
a numerical cap. Mandatory obligations survive any shortlist and cannot be voted away.

## Re-check names against scenarios

For each candidate, write enough of the situation to distinguish acceptable from unacceptable:
who/what causes the stimulus, what happens, under which conditions, what is affected, the required
response and how to assess it. A target can be pending; identify who must supply or validate it.
Use `requirements-and-acceptance` when the underlying requirement is ambiguous.

A numerical target can still admit incompatible interpretations. Refine only the dimensions
that change this decision; preserve agreed details instead of asking stakeholders to repeat them.

| Scenario shape                               | Clarification that changes acceptance                                                                                                                                                 | Unsupported shortcut to avoid                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Confirmation within two seconds              | Where the clock starts; acknowledgement versus completed/durable work; eligible operations and workload; required statistic and observation window; treatment of timeouts and retries | Substituting mean server processing time for a user-visible completion target, or silently inventing p99                                         |
| Recovery within a stated time                | Named failure and affected scope; clock origin; required usable state and tolerated data loss                                                                                         | Resetting the clock at detection, equating process restart with recovered business service, or assuming one target covers node and regional loss |
| Add a capability within a stated effort/time | Representative change; affected scope and preserved contracts; whether analysis, tests, deployment and approvals count; effort versus elapsed time and team assumptions               | Treating coding time or lines changed as proof of end-to-end changeability                                                                       |

An unresolved dimension is a targeted evidence request, not permission to change the goal.
For example, retain a supplied two-second limit while marking its statistic as pending; do
not claim a mean-only measurement satisfies it. If the owner actually specifies a mean,
preserve that interpretation rather than imposing a different target. These are scenario
refinement checks, not a request to implement SLOs or pick architecture mechanisms.

[SEI's ATAM report](https://sei.cmu.edu/documents/629/2000_005_001_13706.pdf), sections 5.3 and 8.5,
uses scenario refinement and assesses importance and perceived difficulty/risk, often coarsely
as high/medium/low. These are separate dimensions: high importance with low risk is not a waiver;
high risk can justify investigation before a design commitment. The report describes a case
where refinement exposed additional attributes. It does not establish that every re-check must
change the list or that exactly three is optimal.

For this skill, use that as a lightweight re-check, not a claim to have performed ATAM. If a
fourth concern emerges, compare all affected scenarios together. It may join the retained drivers,
change the top focus, expose a baseline obligation or remain pending evidence. Record the reason;
do not force a swap solely to preserve three slots.

Prioritize the concrete scenarios before collapsing them into a driver label. Planned releases,
node failure and regional recovery can all concern availability/reliability while having
different obligations, urgency and uncertainty. Preserve those distinctions in the summary;
a low-priority scenario cannot dilute another mandatory scenario through an average score.
Likewise, a scenario that spans several qualities is one requirement with several implications,
not several independent votes. This follows the scenario-level refinement in
[SEI's ATAM overview](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/).

When there is no architecture yet, continue elicitation: SEI's
[Quality Attribute Workshop](https://www.sei.cmu.edu/library/quality-attribute-workshop-collection/)
explicitly supports that situation. Stakeholder agreement establishes a desired outcome,
not its technical feasibility. Mark difficulty/feasibility unknown where the available
evidence cannot support it; identify the analysis or experiment needed without selecting a
design here. A prioritized scenario list is not evidence that an architecture meets it.

## Make deferral reviewable

Use distinct dispositions:

- **Driving:** materially shapes design choices here; identify any top focus.
- **Baseline/mandatory:** still required, even if not receiving special design attention.
- **Pending evidence:** plausible need with an owner and a next check.
- **Others Considered:** not currently selected, with a reason and trigger to revisit.

An item can be mandatory and driving; these describe obligation and design importance,
respectively. Avoid double counting it as two priorities. Deferral is not permission to violate
an existing requirement.

Illustrative record using supplied, hypothetical context:

```text
Scope: order acceptance; reporting projection evaluated separately.
Evidence: product owner requires confirmation only after durable acceptance.
Driver: integrity/durability of accepted orders.
Scenario: process fails after acknowledgement; accepted orders remain recoverable.
Target: no loss of acknowledged orders in the agreed single-process-failure scenario.
Validation owner: storage lead; recovery test plan pending.

Retained concern: reporting freshness.
Evidence: reporting owner accepts up to 15 minutes delay after healthy operation resumes.
Decision: not in the top focus; freshness target remains required.
Open question: maximum tolerated delay during an outage; no answer recorded yet.
```

The reporting allowance does not authorize lost accepted orders, unlimited drift, or a saga.
Selecting an implementation and resolving interactions belong to
`architecture-trade-off-analysis`; recording acceptance belongs to
`architecture-decision-making`.
