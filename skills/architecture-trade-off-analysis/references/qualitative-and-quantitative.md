# Qualitative and quantitative analysis

Read when building a comparable option set, choosing evidence, reviewing a scorecard or
designing an experiment. Qualitative reasoning, numerical models and measurements can
support the same decision; they are not mutually exclusive verdicts.

## Target compatibility

The analysis method has no Java runtime baseline and includes no executable Java example.
For a Java-dependent candidate, inspect the target project's compiler release, toolchains,
resolved dependencies, CI and runtime images before marking compatibility as passed.
Distinguish the author's or prototype's JDK from the supported deployment environment.
Check version-specific primary documentation for API, framework and JVM requirements,
including preview/incubator status and flags where relevant. Missing evidence remains
unknown. An upgrade can be a separately costed candidate if in scope; this skill does not
authorize changing JDKs, dependencies or runtime flags to make an alternative feasible.

## Comparable options and coverage

Define each candidate at the decision boundary: behavior offered, components required,
ownership/deployment, state and failure handling. Comparing a queue product with an entire
integration platform is not automatically forbidden, but compare the **complete solutions**
needed to meet the same requirement, including missing capabilities and their costs.

Keep three different tests separate:

| Test          | Question                                                                 | Adjustment                                                                    |
| ------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Comparability | Do candidates solve the same scoped problem under the same obligations?  | Complete missing pieces or separate decisions at different abstraction levels |
| Distinctness  | Are these competing alternatives or compatible dimensions of one design? | Remove duplicates; model viable combinations or stages explicitly             |
| Coverage      | Is a credible feasible alternative missing that could affect selection?  | Include it or explain the exclusion; do not claim exhaustive market coverage  |

“Mutually exclusive” means nonoverlapping alternatives, not simply items of the same
category. “Collectively exhaustive” is a coverage aspiration within a defined space.
MECE language does not require every branded product, a mandatory hybrid, or a predetermined
vendor. A hybrid can be a distinct complete alternative even though it shares components
with others. Check current product capability only where it could affect this decision.

## Build criteria before rating

Split **mandatory obligations** from **preferences**. Record a source and acceptance test
for each obligation; unknown compliance is not a pass. Keep constraints visible even if all
surviving options meet them. Lack of differentiation is not lack of importance.

For each ranking criterion, define direction, scope and evidence. For example:

- “Release independence” can mean whether a specific change requires another team's
  coordinated release; identify the change and compatibility assumptions.
- “Operating cost” needs a workload, time horizon and included resources; migration,
  parallel operation, recovery, support and exit costs may matter as much as steady state.
- “Latency” needs the operation, start/end events, percentile, load and treatment of failures.

Do not count the same benefit repeatedly under synonyms such as agility, deployability
and time-to-market without explaining their distinct value. Correlated observations are
not themselves proof of duplicate value or causality. Preserve the mechanism explaining
why a design improves one outcome while worsening another.

A qualitative cell should carry an observation or reason, not just “High.” If using words,
anchor them: for the stated change, “independent” means no coordinated consumer release,
“coordinated” means at least one is required, and “unknown” means evidence is missing.
Prefer uncertainty over rating an unknown candidate as average or bad.

Inspect dominance among feasible options: if one is no worse on all material criteria and
better on at least one, do not invent a downside to force a trade-off. Check uncertain
values and omitted costs before calling it dominant. If neither dominates, expose the
preference question; several independent questions may remain, not one artificial binary.

## When weighted scoring is defensible

Do not convert Low/Medium/High to 1/2/3 and assume equal value intervals. A weighted model
can be useful when the decision-maker agrees on value scales, weights and allowed
compensation; it expresses preferences rather than objective architectural truth.

For an additive model, establish meaningful within-criterion value differences and
justify combining them. Weights should reflect the value of a defined swing over each
criterion's range, not an unqualified claim that “security is twice as important.”
Avoid counting one benefit twice. Test preference independence; correlated performance
alone neither proves nor disproves it. If preferences depend strongly on combinations,
use explicit scenarios or a more suitable model.

Keep hard constraints outside compensation. Show sensitivity to plausible weights, input
ranges and uncertain estimates; disclose rank reversals and stakeholder disagreement.
A narrow total-score lead with unstable ranking is not a robust winner.
See the [UK multi-criteria analysis manual, sections 5.4 and 6.2](https://assets.publishing.service.gov.uk/media/5a790545e5274a2acd18b975/1132618.pdf).
This is a conditional alternative to ordinal comparison, not a requirement to score every ADR.

## Decide whether more evidence is worth obtaining

Name the uncertain input and the range of plausible answers. Ask which answers would
change feasibility, selection or a material risk response. Compare the expected usefulness
of resolving it with collection effort, delay and lost options. A narrow feasibility
experiment may suffice; building two complete production systems is not the default.

If no plausible result changes the decision, skip the experiment as selection evidence
unless it answers a separate operational validation need. If material uncertainty cannot
be reduced in time, retain conditional branches or choose an evidenced reversible action;
do not relabel a guess as quantitative analysis.
[NASA's decision-analysis guidance](https://www.nasa.gov/reference/6-8-decision-analysis/)
ties effort to uncertainty, decision sensitivity and information cost, and allows closely
ranked alternatives to be reported to the decision-maker.

Numbers need not come only from newly built prototypes. Existing telemetry, documented
pricing with a workload model, capacity bounds and calibrated simulations can help.
Label model inputs and validity limits; a precise calculation from uncertain assumptions
is still uncertain. Detailed workload/benchmark engineering is outside this skill.

## Minimum experiment contract

Before running a comparison, specify:

1. **Decision rule:** hypothesis, metric and threshold/range that changes the recommendation.
   Distinguish success acknowledgement, completed work and failure rate.
2. **Population:** representative workload and payload mix, concurrency/arrival process,
   data size, warm/cold state, dependencies and failure/recovery scenarios.
3. **Comparable treatment:** equivalent required semantics, resource/cost basis and
   implementation maturity. If one prototype lacks durability or error handling, the speed
   difference does not establish a production advantage.
4. **Execution and uncertainty:** versions/configuration, measurement window, repeated
   observations where necessary, variation and known confounders. Do not claim confidence
   intervals or statistical significance without an appropriate method.
5. **Interpretation:** raw evidence/artifacts, results against the decision rule, what remains
   unmeasured and what can be generalized. A broken harness or inadequate measurement can
   leave the question inconclusive. A valid observation that a candidate violates the
   requirement is adverse evidence for that configuration and scenario; do not discard it
   merely because the candidate failed. Establish whether the candidate or the experiment
   failed before deciding what the result supports.

Equal hardware can answer a latency question at fixed resources; equal service objectives
can answer a cost question. State which comparison is intended. For asynchronous designs,
include queue delay, completion rate and backlog/recovery cost as well as submission time.
Use bounded representative environments; record unavailable tooling or data instead of
inventing an executed result.

A prototype is not dishonest merely because it is incomplete. It is useful when the
mechanism tested is valid for the question and omitted costs/behavior remain explicit.
Vendor measurements are evidence to inspect, not automatically invalid or transferable:
compare their configurations, semantics and workload with yours.

## Scenarios and stopping

Include important normal operations, change cases, failure/recovery and growth boundaries.
A user story or incident can supply a scenario; make stimulus, context, expected response
and acceptance measure explicit. Apply equivalent scenarios to each candidate and trace
state transitions and dependencies rather than assigning generic topology ratings.

SEI's [ATAM report](https://www.sei.cmu.edu/documents/629/2000_005_001_13706.pdf) uses
quality-attribute scenarios to expose architectural risks, sensitivity points and tradeoff
points. A design parameter affecting one response is a sensitivity point; one affecting
multiple qualities can expose a tradeoff. This skill uses those concepts for focused
comparison; it does not claim that completing a small matrix constitutes a full ATAM.

Seek plausible disconfirmation, not a guaranteed inversion. Stop when material scenarios
are covered and additional investigation is unlikely to alter the decision enough to
justify its cost. If the choice remains sensitive, say to what. Fixing one architectural
dimension can constrain later choices, so carry those consequences forward and revisit
the earlier choice if the resulting combination is infeasible.
