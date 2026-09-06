# Bias and the evidence base

Read when an advocate, prior investment, case study, vendor benchmark or contested scorecard
is influencing the comparison. Review the argument, not the advocate's motives. The
counter-moves below are practical safeguards, not guarantees of unbiased reasoning.

## Observable warning signs and counter-moves

| Warning sign                                              | Risk to the comparison     | Counter-move                                                                                                                        |
| --------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| First proposal becomes the only baseline                  | Anchoring                  | Enumerate credible alternatives before detailed advocacy; preserve reasons for exclusions                                           |
| “We already paid for it” decides selection                | Escalation of commitment   | Compare future incremental costs and benefits; exclude irrecoverable spend but include remaining exit, contract and migration costs |
| “Company X chose it” replaces local requirements          | Bandwagon / transfer error | Identify shared and differing workload, organization, versions and constraints                                                      |
| Only confirming experiments are proposed                  | Confirmation bias          | State plausible falsifying observations and decision rules before collecting results                                                |
| Expert-only capabilities score as easy to operate         | Knowledge gap              | Evaluate staffing, training, recovery and support with the team responsible for production                                          |
| Migration assumes no dual running, incidents or learning  | Optimism                   | Include those costs as estimates/ranges and identify which assumptions could change selection                                       |
| The prototype author rates their option without challenge | Ownership attachment       | Seek independent scrutiny where available; otherwise explicitly test its weakest assumption                                         |
| A simple low-impact criterion consumes the discussion     | Displaced attention        | Recenter on constraints and uncertainties that can change the decision                                                              |
| One familiar tool is proposed for unrelated problems      | Narrow search              | Ask what scope it covers and what credible alternative differs; do not require an invented losing scenario                          |

Do not discard valid vendor or advocate evidence solely because of its source. Inspect the
methods, full results, incentives and applicability. Conversely, independent evidence can
still be irrelevant to the workload or semantics. A credible fact can support the wrong
conclusion when the question changes.

## Preserve dissent without manufacturing balance

Ask each advocate to state the strongest case for another feasible alternative and the
conditions under which their preference would change. An independently dominant option
does not need a fictitious disadvantage, and a violated hard constraint is not just another
side to “balance.”

If stakeholders differ on preferences, show how their stated priorities affect the result.
Do not average away disagreement about obligations or authority. If an input is disputed,
show the conditional branches and the evidence that could settle it. “It depends” is useful
only when those dependencies and actions are explicit.

Historical familiarity and existing operational competence are forward-looking assets.
Sunk-cost discipline does not mean pretending a trained team, reusable component or binding
contract has no remaining value. Keep irrecoverable spend separate from actual future
transition cost.

## Evidence ladder for a recommendation

- **Local observation:** cite the trace, change history, configuration, measurement or
  stakeholder requirement and its scope/date.
- **Model or inference:** state the mechanism and assumptions connecting it to an option's
  predicted behavior. A plausible causal story is not an observed outcome.
- **External example:** identify the original author's conditions and explain what transfers;
  use it as a hypothesis source when those conditions differ.
- **Recommendation:** identify the deciding evidence and preference, accepted costs and
  what would justify reconsideration. Avoid confidence labels without reasons.

For a vendor benchmark or migration story, check the exact version, workload, completion
semantics, resources, failure handling and costs included. Read the primary report if it
is available. If only a summary can be consulted, state that limit rather than repeating
its numbers as independently verified. Do not extrapolate a historical database finding
to current defaults or a single system's cost reduction to an entire architectural style.

A higher deployment count or more pages per service is an observation. It might reflect
coupling or operational burden, but also demand, reporting changes, service criticality
or release practices. Normalize against relevant work and inspect mechanisms before
proposing ownership changes. No estate-wide “twice the median” threshold is established here.

## What the research consulted supports

Borowa, Zalewski and Kijas's
[architectural technical-debt study](https://arxiv.org/abs/2309.14175)
uses architect interviews to examine bias and debt. It supports investigating bias in
decision processes; it is not a population prevalence estimate or proof that a particular
counter-move always works.

Borowa, Rebouças de Almeida and Wiese's
[debiasing experiment](https://arxiv.org/abs/2502.04011)
reports 16 students and 20 practitioners, with improved argumentation and reductions in
studied biases after a workshop. Its reported practitioner/student difference is specific
to that experiment; it does not show that seniority generally increases bias or that this
skill improves delivered-system outcomes.

For this revision, the authors' abstracts were consulted for these limited claims, not a
reanalysis of the underlying data. No counts of individual bias occurrences or broad causal
effect sizes are inferred from them.

## Method limits

Scenario-based evaluation, structured decision models and controlled measurement address
different questions. The primary SEI, NASA and multi-criteria guidance linked in
`qualitative-and-quantitative.md` supports using explicit criteria, assumptions and
uncertainty; it does not demonstrate the performance of this skill.

No system-outcome study or paired agent evaluation was executed for this revision. This is
a limitation of the evidence supplied here, not a claim that no such study exists anywhere.
Book quotations and edition-specific claims from the previous revision were not independently
verified against full book texts and are not retained as executable rules or asserted proof.
The worked example is this package's illustration, not an empirical result or a reproduction
of the authors' case.

Do not infer that qualitative judgment is inherently rigorous, that a numerical total is
objective, or that formal methods are necessarily useless or prohibitively expensive.
Choose the smallest analysis that can answer the consequential uncertainty and expose what
it still cannot establish.
