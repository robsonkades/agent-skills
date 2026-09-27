---
name: architecture-characteristics
description: >
  Derive and prioritize architectural quality drivers when requirements say only scalable
  or reliable, too many qualities are called top priority, stakeholders disagree on their
  meaning, or one list is applied across unrelated services. Define scope, sources,
  observable scenarios, baseline obligations and reasons for deferring candidates.
  Covers terminology and quality-model interpretation; excludes choosing design options
  (architecture-trade-off-analysis), recording ADRs (architecture-decision-making),
  coupling analysis (architecture-coupling-and-quanta) and operational SLO implementation.
---

# Architecture Characteristics

Produce a small, justified set of qualities that shape the design, with their meanings,
scope and priorities made explicit. A shortlist guides design attention; it is not a list
of the only requirements the system must satisfy.

## Workflow

1. **Establish scope and evidence.** Obtain the business operation/domain, affected users,
   critical failure/change situations, requirements and stakeholder concerns. Identify
   decision owners and known constraints. Reuse approved scenarios, contracts and prior decisions;
   distinguish their authority from observed conventions and new assumptions. Reopen only the
   affected scenarios when scope, obligations or evidence have changed. For an existing system,
   inspect relevant incidents, traffic, deployment/change history and dependency diagrams. For greenfield, label forecasts
   and assumptions; do not invent baseline measurements.
2. **Elicit candidates before ranking.** Read
   [eliciting-and-capping.md](references/eliciting-and-capping.md) when creating or revising a
   list or resolving stakeholder priorities. Link each candidate to an explicit requirement,
   a stakeholder concern or an inference from domain evidence. Check available evidence before
   asking for confirmation. Ask the responsible stakeholder only about unresolved meaning or
   priority that could change the result; continue with labeled provisional candidates meanwhile.
   A plausible inference is not an approved requirement.
3. **Test architectural relevance.** Ask what success condition the quality expresses, why
   it matters here, and what structural choice or risk it could influence. Keep domain rules
   and constraints visible even when they are not quality labels. A concern need not require
   extra components to matter: rejecting an unsafe structure is a structural consequence.
   Separate desired outcomes from proposed mechanisms; preserve verified technology/version
   mandates as constraints rather than ranking them as qualities.
4. **Make the names discriminating.** For each proposed driver, state a short scenario:
   stimulus, operating/failure conditions, affected operation and expected response with a
   measure or explicit unresolved target. A number alone does not define acceptance: preserve
   the observation boundary, eligible workload and relevant timing/statistical interpretation.
   Distinguish normal, surge and failure conditions when their obligations differ; a degraded
   response satisfies an obligation only within its agreed acceptance rules or authorized exception.
   Use the refinement checks in [eliciting-and-capping.md](references/eliciting-and-capping.md)
   when those details or priorities among scenarios are unclear. Read
   [definitions-and-composites.md](references/definitions-and-composites.md) for ambiguous
   pairs, composites or apparent consistency/availability conflicts. Do not fabricate a
   threshold to make a row look complete.
5. **Prioritize without deleting obligations.** Separate mandatory constraints and baseline
   quality requirements from the drivers receiving design attention. Compare business impact
   and difficulty/risk at scenario level before summarizing by quality name; record disagreements
   and unknown feasibility. A small top set is
   useful, but neither a fourth valid concern nor missing automation is grounds to discard it.
   Revisit the set when scenarios expose new needs.
6. **Check scope and hand off.** State whether each driver applies to a journey, domain,
   component or shared dependency. Multiple services do not establish independent quanta;
   use `architecture-coupling-and-quanta` if deployment/runtime coupling is unresolved.
   Preserve end-to-end and shared obligations across local lists. Hand off design-option
   comparison to `architecture-trade-off-analysis`.

## Rules that prevent false agreement

- A stakeholder's “reliability” can remain a useful umbrella if its required outcomes are
  named. Decompose enough to expose distinct decisions, without counting parent and children
  as independent votes or imposing a universal vocabulary.
- Not top priority does not mean unnecessary. Record retained baseline obligations, deferred
  candidates and rejected candidates distinctly, with reasons and reconsideration triggers.
- A measurement gap is a risk to resolve, not evidence that the concern is unimportant.
  Name the needed evidence, owner and next check. Continue provisional elicitation while
  withholding unsupported approval or exact ranking.
- Suspected conflicts require the same operation, environment and success definitions.
  Attribute names alone do not prove a trade-off; neither scalability nor elasticity mandates
  a particular consistency model.
- Scale the record to uncertainty and consequences, not headcount or number of deployables.
  One critical service can require careful elicitation; a small change may need only one row.
- When a quality standard or taxonomy is invoked, read
  [taxonomy-and-iso.md](references/taxonomy-and-iso.md). A checklist can reveal omissions but
  cannot choose priorities or waive a requirement.

## Minimum deliverable

For a small request: scope, candidate/driver, evidence, observable meaning, priority rationale
and unresolved question or next validation. For a full list, also identify the top focus,
other retained drivers, baseline constraints, and Others Considered with reasons and review
triggers. State who confirmed the priorities; label an unconfirmed list provisional.

Use `architecture-decision-making` for a durable decision record,
`architecture-fitness-functions` for defining checks, and `slo-and-alerting` for operational
targets. This skill supplies enough scenario detail to validate the selection, not a full test
harness or architecture evaluation.

For a handoff, pass the scoped scenarios, evidence, mandatory constraints, priority status and
unresolved questions. Request the specific missing result: boundary analysis, option comparison,
acceptance clarification or verification design. If the specialist is unavailable, provide this
context and the next evidence needed without claiming its analysis is complete. An already
approved list with no relevant change can be retained and handed off without another workshop.

Stop when the requested scope has traceable, distinguishable scenarios and justified dispositions,
or a provisional result identifies the consequential gaps, their owners and next checks. Agreement
on desired qualities is not evidence that the implementation satisfies them.

When evaluating the skill itself, use
[validation-cases.md](references/validation-cases.md). Written cases are not executed evidence.
