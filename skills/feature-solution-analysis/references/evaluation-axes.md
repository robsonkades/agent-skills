# Evaluation axes

## Deriving candidates from project findings

Start from the feature's outcome and the responsibility that must change, not a list of products.
Reuse applicable context findings; inspect gaps along the relevant caller, state owner and
completion/failure path. An extension point, configured worker or retained record can suggest a
reuse option. Check its contract and availability to this feature before calling it feasible:
a class name or a use in another module does not establish the required behavior here. A failed
or incomplete search leaves a bounded evidence gap, not proof that reuse is impossible.

Turn those findings into complete candidates by asking where the changed responsibility can
live: with its existing owner, through another available capability, or across a new boundary
when the requirements justify one. These are prompts, not required options. State what each
candidate retains and changes, and the evidence or unresolved premise behind that mechanism.
Consolidate variants with no material difference on this feature's obligations; retain different
technologies when their contracts, operating burden or transition costs actually separate them.
Do not manufacture a fixed number of alternatives or extend the sweep across unrelated systems.

Before favoring a candidate, challenge the premise carrying its advantage. Locate the artifact
that can establish it: for example, the selected runtime implementation and recovery contract
behind "reuse gives us durable jobs". Check that premise rather than benchmarking a property
both options already satisfy. If the premise fails, update the affected candidate or add a
credible alternative; do not silently price a missing mechanism at zero. A new component is a
proposal until its feasibility is established, even if a similar component works elsewhere.

### A reuse option changes when the obligation changes

In this synthetic example, the feature needs accepted work to remain recoverable after a process
restart. The existing worker has a handler extension point, but its selected implementation keeps
pending work only in process memory and has no reconstruction path. The extension point alone
does not make unchanged reuse feasible. Compare a complete extension that adds recoverable work
state with a complete option that delegates that responsibility elsewhere; include acceptance,
recovery and duplicate-effect handling wherever the chosen mechanism requires them. Calling both
options "background processing" hides the difference. Changing executor wrappers does not supply
the missing recovery mechanism.

If the authorized obligation instead permits losing pending work on restart, the original reuse
candidate may become feasible, subject to the other unchanged constraints. That change removes
one elimination; it does not prove reuse wins every remaining comparison or authorize weakening
the original requirement. If the worker's recovery behavior is unknown, inspect its wiring,
implementation and relevant tests first; keep feasibility conditional if they cannot establish it.
These cases illustrate option construction, not measured reliability or a required architecture.

## Choosing the axes

Do not evaluate every option on every axis. Pick the axes on which the options **actually
differ** and which this feature is **sensitive to**, and say why each was picked. Keep shared mandatory
obligations as feasibility checks even when they do not distinguish options. Axis count is not a
quality test; retain what can change feasibility or the recommendation.

An axis qualifies when both are true:

1. The options produce different outcomes on it.
2. A requirement, a constraint or a named risk makes that difference matter here.

## The axis list

| Axis             | The question it answers                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Correctness      | Can this option satisfy the behaviour at all, including the edge cases?                          |
| Complexity       | How much must someone understand to change it safely six months from now?                        |
| Reuse            | Does it extend something that exists, or add a parallel mechanism?                               |
| Performance      | Against the stated target — not in general                                                       |
| Scalability      | What happens at the volume that was actually named                                               |
| Reliability      | Which failures it survives, and which it converts into data loss                                 |
| Failure modes    | How it fails, how loudly, and who finds out                                                      |
| Security         | What surface it adds, what it exposes, what it must be trusted with                              |
| Observability    | Can an operator tell it is working, and diagnose it when it is not?                              |
| Testability      | Can required contracts be tested at appropriate levels with credible fixtures and failure cases? |
| Operational cost | What has to be run, monitored, patched and paged on                                              |
| Compatibility    | What existing callers, consumers or stored data have to tolerate                                 |
| Migration cost   | What must happen to existing data or in-flight work                                              |
| Reversibility    | What undoing it costs once it is in production with data behind it                               |
| Extensibility    | Only when a specific expected extension is named, with who expects it                            |
| Money            | What material spending difference follows, under which workload and pricing assumptions?         |

Evaluate material spending even when its budget or accountable owner is unresolved. Record
those gaps separately from the cost estimate and technical feasibility; missing authority is
neither zero cost nor evidence that the option cannot work. Reuse existing spending delegation,
and keep any commitment outside it conditional on the specific missing authorization.

## Operational effort and reversal

**Operational cost.** The difference between using a technology and running one. An option that
adds a broker, a cache or a scheduler adds an upgrade path, a failure mode, an alert and a
person who has to know about it. Price that, not just the API.

**Reversibility.** Inspect callers, data, deployments and operational commitments, and distinguish
an estimate from a tested rollback. An interface may contain code changes but does not establish
reversal cost. Persisted data may require migration, compensation or a forward fix; the schema
name alone does not prove reversibility or irreversibility. State the conditions and validation.

## Comparing feature costs on the same basis

When cost could separate the options, state the workload, useful outcome, time horizon and
included costs before comparing totals. Separate one-time adoption/transition work, recurring
usage/support and material exit costs. A setup estimate and a monthly bill are not comparable
totals. Include work shifted to consumers or operators: a smaller server change that needs
manual completion every day may not be the simplest complete solution.

For reuse, distinguish added consumption, support and capacity needs from unchanged shared
costs. An existing service is not automatically free, and charging its entire existing cost
to only the reuse option can also mislead. State the allocation basis and avoid counting the
same work twice. Keep effort in hours or another stated unit unless a supported conversion
to money is available; do not invent labor rates. The
[FinOps Foundation's unit-economics guidance](https://www.finops.org/framework/capabilities/unit-economics/)
supports explicit unit definitions, assumptions and included costs.

If a plausible demand range or feature lifetime reverses the preference, show the relevant
threshold or scenarios and the source of that uncertainty. Ask for the missing forecast only
if it can change the choice; if all supported scenarios favor the same feasible option, do not
delay for an immaterial precision gain. A corrected forecast updates the cost comparison, not
the accepted behavior, spending authority or an unrelated feasibility result. Use the general
sensitivity method from `architecture-trade-off-analysis` when a more involved model is needed.

## Writing a comparison that is not generic

The test: **would this paragraph read identically at a different company?** If yes, it is a
description of the technology, not an analysis of this choice.

Wrong:

> Kafka offers high throughput, durability and replay. A database table is simpler but does not
> scale as well.

Right:

> In this hypothetical feature, the named volume is 4,000 events a day, but peak arrival rate,
> payload size and handler time are still unknown, so capacity is not established. The accepted
> replay requirement needs retained input and a controlled reprocessing path for either option,
> including duplicate-effect handling. Compare the existing table's retention/recovery facilities
> with the log's configured retention and replay facilities, and measure the material capacity gap.
> The broker is not currently operated by this team, so its adoption and support costs also matter.

The second one can be argued with, which is the point.

## Checking the consumer outcome and the transition

Suppose an export currently returns the completed file. An alternative responds with a job ID
in 50 ms and makes the file available 30 seconds later. These hypothetical times measure different
outcomes. HTTP `202 Accepted` indicates accepted, incomplete processing; it does not establish
successful completion ([RFC 9110, section 15.3.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.3)).

If the accepted requirement is a completed file within two seconds, acknowledgement latency
does not meet it. If the accepted contract instead permits later completion, compare complete
solutions for that contract: result discovery, retained access, failure visibility and consumer
effort where material. Do not require a particular polling or notification mechanism without
evidence. If the meaning of "fast export" is unknown, inspect acceptance criteria and callers,
then ask the focused outcome question before ranking options on latency.

Likewise, a new storage representation may meet every steady-state target but fail a required
rolling release because deployed readers cannot understand it. Include a credible compatible
transition as part of the candidate and its cost, or record the candidate as conditional or
eliminated under that release constraint. An authorized coordinated cutover could change the
comparison. Do not treat incompatibility during deployment as a small scoring penalty, or expand
this comparison into a migration implementation plan.

These are feature-level applications of mandatory criteria, schedule and lifecycle consequences;
the general comparison method remains with `architecture-trade-off-analysis`. The
[NASA Systems Engineering Handbook, decision analysis](https://www.nasa.gov/reference/6-8-decision-analysis/)
supports evaluating these criteria and reducing uncertainty when it could change the recommendation.
Its organizational approval and reporting processes are not requirements for this repository.

## Recording an elimination

Elimination on a constraint is not a judgement and should not be dressed as one:

```text
Eliminated   Managed queue service
Because      the user named cloud services as prohibited for this system (round 2)
Evaluated    constraint only; no comparative preference established
Reopen if    an authorized revision lifts that prohibition; then compare delivery,
             retention, recovery and operating costs under the same requirements.
```

Record an earlier supported comparison if one exists, with its conditions and evidence.
Elimination alone does not establish that an option would otherwise win, or that the selected
option is second best. A changed constraint reopens evaluation, not automatic acceptance.
