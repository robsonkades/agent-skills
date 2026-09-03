# Scheduled and periodic tasks

## Semantics

| Operation      | Schedule basis                      | If execution exceeds period/delay                                  | Failure                                     |
| -------------- | ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| one-shot delay | relative delay                      | n/a                                                                | Future completes exceptionally              |
| fixed rate     | intended initial/period cadence     | same task does not overlap; later runs may start late/back-to-back | later executions suppressed after exception |
| fixed delay    | delay after one execution completes | cadence stretches with runtime                                     | later executions suppressed after exception |

These are local in-memory executor semantics. They do not provide durability, exactly-once,
cluster-wide singleton execution, calendar/cron/time-zone semantics or catch-up after process death.

## Failure policy wrapper

Choose explicitly:

```text
transient known failure -> bounded retry/backoff if idempotent and next schedule policy defined
permanent/config failure -> disable and alert
state corruption/fatal error -> fail executor/process according to safety policy
overrun -> skip/coalesce/queue/catch up, with maximum lag
```

Observe the `ScheduledFuture` and task transitions. Catch only what policy can safely handle; a
catch-`Throwable` loop can keep corrupt work running forever.

## Drift and time

Relative-delay scheduling is not a complete civil-time scheduler. Test wall-clock jumps, suspend/
resume, long GC/CPU throttle, missed windows and daylight-saving/time-zone rule changes for calendar
jobs. Store intended fire time/idempotency key when business semantics require it.

## Pool behavior

`ScheduledThreadPoolExecutor` primarily uses core pool size and a delayed work queue; inspect exact
JDK behavior. Long/blocking jobs can delay unrelated schedules. Separate criticality/blocking
classes or dispatch due jobs to an owned bounded executor, while preserving rejection and duplicate
semantics.

Remove-on-cancel policy can reduce retention of cancelled delayed tasks but changes queue work;
verify exact API/settings and measure high-churn schedules.

## Multi-replica jobs

Every replica normally schedules its own local task. If only one cluster execution is required, use
a durable scheduler/lease/partition assignment with fencing and idempotency. A local non-overlap
guarantee is not distributed exclusion.

## Observability

Measure intended fire time, actual start, lag, duration, terminal status, consecutive failures,
skipped/coalesced/missed count, next due time, active replica/lease token and shutdown drain. Alert on
absence using expected schedule plus tolerance; success-only logs cannot detect a dead schedule.

## Tests

- exception/fatal classification and future observation;
- task longer than rate/delay and scheduler pool starvation;
- cancellation before/during run and shutdown policies;
- clock/time-zone/DST/suspend and missed execution;
- process restart and retained/durable work;
- multiple replicas, lease loss/fencing and duplicate execution;
- rejection by downstream executor and backpressure;
- context cleanup between periodic invocations.

## Authoritative references

- [`ScheduledExecutorService`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ScheduledExecutorService.html)
- [`ScheduledThreadPoolExecutor`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ScheduledThreadPoolExecutor.html)
