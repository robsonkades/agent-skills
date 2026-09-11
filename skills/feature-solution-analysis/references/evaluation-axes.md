# Evaluation axes

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
| Money            | Only when the difference is material and someone owns the budget                                 |

## Two axes that are usually decisive and usually skipped

**Operational cost.** The difference between using a technology and running one. An option that
adds a broker, a cache or a scheduler adds an upgrade path, a failure mode, an alert and a
person who has to know about it. Price that, not just the API.

**Reversibility.** Inspect callers, data, deployments and operational commitments, and distinguish
an estimate from a tested rollback. An interface may contain code changes but does not establish
reversal cost. Persisted data may require migration, compensation or a forward fix; the schema
name alone does not prove reversibility or irreversibility. State the conditions and validation.

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
