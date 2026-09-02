# Evaluation axes

## Choosing the axes

Do not evaluate every option on every axis. Pick the axes on which the options **actually
differ** and which this feature is **sensitive to**, and say why each was picked. Three or four
axes is a normal number; twelve means the table is decoration.

An axis qualifies when both are true:

1. The options produce different outcomes on it.
2. A requirement, a constraint or a named risk makes that difference matter here.

## The axis list

| Axis             | The question it answers                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| Correctness      | Can this option satisfy the behaviour at all, including the edge cases?   |
| Complexity       | How much must someone understand to change it safely six months from now? |
| Reuse            | Does it extend something that exists, or add a parallel mechanism?        |
| Performance      | Against the stated target — not in general                                |
| Scalability      | What happens at the volume that was actually named                        |
| Reliability      | Which failures it survives, and which it converts into data loss          |
| Failure modes    | How it fails, how loudly, and who finds out                               |
| Security         | What surface it adds, what it exposes, what it must be trusted with       |
| Observability    | Can an operator tell it is working, and diagnose it when it is not?       |
| Testability      | Can the behaviour be tested without the whole system running?             |
| Operational cost | What has to be run, monitored, patched and paged on                       |
| Compatibility    | What existing callers, consumers or stored data have to tolerate          |
| Migration cost   | What must happen to existing data or in-flight work                       |
| Reversibility    | What undoing it costs once it is in production with data behind it        |
| Extensibility    | Only when a specific expected extension is named, with who expects it     |
| Money            | Only when the difference is material and someone owns the budget          |

## Two axes that are usually decisive and usually skipped

**Operational cost.** The difference between using a technology and running one. An option that
adds a broker, a cache or a scheduler adds an upgrade path, a failure mode, an alert and a
person who has to know about it. Price that, not just the API.

**Reversibility.** Almost every other axis is an estimate; this one is close to a fact, and it is
the correct tiebreak. An option contained behind one interface, with no persisted state and no
published contract, can be undone in an afternoon. An option that changes a schema and starts
accumulating rows cannot be undone at all — it can only be migrated away from.

## Writing a comparison that is not generic

The test: **would this paragraph read identically at a different company?** If yes, it is a
description of the technology, not an analysis of this choice.

Wrong:

> Kafka offers high throughput, durability and replay. A database table is simpler but does not
> scale as well.

Right:

> The named volume is 4,000 events a day, which either option absorbs without effort, so
> throughput does not separate them. Replay does: the requirement to reprocess a day of events
> after a downstream fix is satisfied by the log natively and by the table only if we keep
> processed rows and add a reprocessing path — about a day of work and a second code path to
> maintain. Against that, the broker is not currently operated by this team.

The second one can be argued with, which is the point.

## Recording an elimination

Elimination on a constraint is not a judgement and should not be dressed as one:

```text
Eliminated   Managed queue service
Because      the user named cloud services as prohibited for this system (round 2)
Note         it would otherwise have been the recommendation; if that constraint is
             lifted, re-open this choice.
```

The note is worth writing. It is the only way a later reader learns that the chosen option was
second best under a constraint that may no longer hold.
