# Instrument Selection

## Semantic checklist

Before choosing an API:

- What event or state transition is observed?
- Is the value monotonic within its identity lifetime?
- Is the question total, rate, current level, duration, distribution or in-progress age?
- What reset/restart/temporality semantics apply?
- Must populations aggregate across instances/time?
- What happens when observation or callback fails?

## Patterns

| Need                         | Pattern                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| request/logical outcome rate | monotonic counter by bounded outcome                                     |
| in-flight work               | increment/decrement instrument with finally-path cleanup                 |
| queue depth                  | gauge plus enqueue/dequeue/rejection counters and queue-age distribution |
| completed latency/size       | histogram/summary selected from aggregation needs                        |
| long-running task            | active count, start age and completion distribution                      |
| resource demand              | cumulative CPU/bytes/operations counter divided by useful work           |
| last successful event        | timestamp gauge plus age computed at query time                          |
| individual slow request      | trace/log linked by exemplar                                             |

Gauge of “last duration” loses the distribution. Counter of a current level loses
decrements. Timer of only completed work hides currently stuck operations unless paired
with active/age signals.

## RED, USE and business signals

RED is a serving-entry checklist:

- rate by logical outcome;
- errors/rejections/cancellation with explicit classification;
- duration distribution with outcome/censoring semantics.

USE is resource-oriented:

- utilization relative to a defined capacity;
- saturation such as queue age, runnable delay, pressure or throttling;
- resource errors/exhaustion.

For resources with no fixed denominator, expose demand/pressure rather than an invented
utilization percentage. Business metrics should represent one authoritative state
transition and map external reason strings to bounded classes.

## Distribution decision

Prefer:

- native histogram when end-to-end support, accuracy and cost are verified;
- classic histogram for aggregatable populations with carefully selected SLO/range buckets;
- client quantiles/summary only when local preselected quantiles and windows are acceptable
  and cross-instance aggregation is unnecessary;
- raw event sampling when distribution attribution needs dimensions unsuitable for labels.

Pair completed distributions with timeout/cancellation counters and in-progress age so the
slowest work is not censored away.
