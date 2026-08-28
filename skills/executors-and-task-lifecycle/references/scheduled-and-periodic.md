# Scheduled and periodic tasks

## Fixed rate versus fixed delay

```java
// Period measured from each start: executions try to keep to a timetable.
scheduler.scheduleAtFixedRate(this::poll, 0, 10, TimeUnit.SECONDS);

// Delay measured from each end: executions keep a gap, and the timetable drifts.
scheduler.scheduleWithFixedDelay(this::poll, 0, 10, TimeUnit.SECONDS);
```

| Question                                 | `scheduleAtFixedRate`                      | `scheduleWithFixedDelay` |
| ---------------------------------------- | ------------------------------------------ | ------------------------ |
| Interval measured from                   | start of previous run                      | end of previous run      |
| Run takes longer than the period         | next run starts immediately; runs bunch up | gap is always honoured   |
| Recovers a missed timetable              | yes — that is what it is for               | no                       |
| Safe for a job whose duration is unknown | no                                         | yes                      |

Neither overlaps on a single scheduler thread. That is a property of the scheduler having
one thread, not a guarantee about the task — a second scheduler thread, a second replica,
or a manual trigger all break it. If two concurrent executions would corrupt something, the
mutual exclusion has to be written down: a lock, a database row, a lease.

## The trap that stops a job forever

```java
// The exception is stored in a ScheduledFuture nobody holds.
// The task is silently unscheduled and never runs again. Nothing is logged.
scheduler.scheduleAtFixedRate(() -> reconcile(), 0, 1, TimeUnit.MINUTES);
```

One transient failure — a database blip at 03:00 — and the reconciliation job is dead until
the next deploy. The symptom arrives days later as missing data, with no error to correlate.

```java
scheduler.scheduleAtFixedRate(() -> {
    try {
        reconcile();
    } catch (Throwable t) {                 // Throwable, not Exception: an Error kills it too
        log.error("reconcile failed; the schedule survives", t);
    }
}, 0, 1, TimeUnit.MINUTES);
```

Wrap the body, catch `Throwable`, log, return normally. Then add the metric that proves it
ran: a "last successful run" gauge, alarmed on staleness. A counter of failures does not
detect a job that stopped being scheduled — only a freshness signal does.

## Drift, and what a period does not promise

`scheduleAtFixedRate` schedules against `System.nanoTime`, so it does not skew with wall
clock changes, and equally it does not align to wall-clock boundaries. "Every hour" means
"3600 s after the last start", not "on the hour". A job that must run at a specific local
time needs a calendar scheduler (`cron`, Quartz, `@Scheduled(cron=…)`), and then also needs
a decision about DST — a cron time that does not exist on the spring-forward day, and one
that occurs twice in autumn.

## Starving the scheduler

`ScheduledThreadPoolExecutor` is a **core-size-only** pool: `maximumPoolSize` is ignored
because its `DelayedWorkQueue` is unbounded and never refuses. A pool of one thread with
five jobs on it means the slowest job sets the punctuality of the other four.

Split by duration, not by domain: fast heartbeat-style schedules on their own scheduler,
anything that performs I/O on another, anything that can take minutes on a worker executor
triggered by a scheduled task rather than running inside it.

```java
// The scheduler decides WHEN. It should not be the thing that decides HOW LONG.
scheduler.scheduleWithFixedDelay(
        () -> workers.execute(this::rebuildIndex), 0, 5, TimeUnit.MINUTES);
```

## Virtual threads and schedulers

`Executors.newScheduledThreadPool` has no virtual-thread equivalent, and it does not need
one: a scheduler thread should be idle, and idleness is exactly what a platform thread is
cheap at. Keep the scheduler on platform threads and dispatch the _work_ to virtual threads,
as above. `SimpleAsyncTaskScheduler` in Spring (used when `spring.threads.virtual.enabled`
is true) does start each execution on a new virtual thread — which also means it no longer
serialises executions the way a single-threaded scheduler did.

## What a scheduler does not do

- It does not guarantee a job runs **once across replicas**. Two pods run it twice. That
  needs a lease (`ShedLock`, an advisory lock, a database row with an expiry).
- It does not survive a restart with its state. A missed window during a deploy is simply
  missed, unless the job is written to catch up from persisted state.
- It does not bound how long the task runs. Only the task can do that, with its own
  timeouts on every I/O call it makes.

## Reviewer checklist

- [ ] Every periodic body wrapped in `try/catch (Throwable)` so a throw cannot unschedule it
- [ ] A freshness metric ("seconds since last success") exists and is alarmed
- [ ] Fixed-rate versus fixed-delay chosen from the duration behaviour, not by habit
- [ ] No job relies on single-threaded scheduling for mutual exclusion
- [ ] Long or I/O-heavy work dispatched off the scheduler thread
- [ ] Multi-replica jobs hold a lease with a realistic maximum hold time
- [ ] Cron-style schedules have a stated DST behaviour
