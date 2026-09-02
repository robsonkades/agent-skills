# Sources, orientations and broken graphs

## What the sampler counted

A width is a share of _samples_, and the sampler decides which moments become samples.
Read the source before reading the graph. Verified against JDK 25.0.3 `jfr metadata` and
the stock `.jfc` files.

| Source                                   | What one sample is                                                                                  | A width means                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| JFR `jdk.ExecutionSample`                | a thread executing Java code at the tick (20 ms `default.jfc`, 10 ms `profile.jfc`)                 | share of _Java-running_ time, not CPU    |
| JFR `jdk.NativeMethodSample`             | a thread in native code, **executing or waiting**, at a 20 ms tick                                  | native _and blocked-in-native_ time      |
| JFR `jdk.CPUTimeSample` (JEP 509)        | a thread after `throttle` of consumed CPU time (`10ms` in `profile.jfc`, or a rate such as `500/s`) | CPU, native frames attributed to callers |
| async-profiler `cpu` / `ctimer`/`itimer` | an on-CPU thread per timer tick (`perf_events`, or a timer without kernel stacks)                   | CPU                                      |
| async-profiler `wall`                    | every sampled thread per tick, whatever its state                                                   | elapsed time, idle included              |
| async-profiler `alloc`                   | a TLAB retirement or an outside-TLAB allocation                                                     | bytes allocated, not time                |
| async-profiler `lock`                    | a contended monitor or `j.u.c` acquisition above `--lock`                                           | time spent waiting for that lock         |

Consequences that are misread most often:

- A graph built from `jdk.ExecutionSample` plus `jdk.NativeMethodSample` — JMC's default and
  `jfr view hot-methods` — shows a thread blocked in `SocketInputStream.read` or `epoll_wait`
  as a wide frame. It is wide because the thread was _there_, not because it burned CPU.
- `jdk.ExecutionSample` does not check whether the OS had the thread scheduled. On a host
  with more runnable Java threads than cores it approaches a wall profile of the runnable
  threads. `jdk.CPUTimeSample` is the only JFR source that is CPU-proportional; it is off in
  both stock profiles and Linux-only (JEP 509). Convert it with `jfrconv --cpu-time`.
- A CPU graph of the whole process includes GC and compiler threads. `G1 Conc#0` or
  `C2 CompilerThread` at 30 % is a finding about allocation or warm-up (`jvm-gc-tuning`,
  `jit-compilation`), not about the code under them — and they vanish when the graph is
  filtered to application threads.

## Orientations

| Orientation                   | How                                                     | Question it answers                                                      |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| Standard (root at the bottom) | default                                                 | which _paths_ are expensive; where responsibility accumulates            |
| Reversed / bottom-up          | `asprof -r`, `jfrconv -r`, `flamegraph.pl --reverse`    | which _leaf_ is hot summed across all callers, and who those callers are |
| Icicle                        | `flamegraph.pl --inverted`; `jfrconv -r` defaults to it | the same numbers as the graph it flips; a rendering preference           |

Reverse when the search in the standard graph finds one method — `Arrays.copyOf`,
`String.format`, a `HashMap.resize` — scattered under dozens of paths. The reversed graph
puts that method at the base with its callers stacked above, ranked by share. It is the
self-time sum done by the tool instead of by eye.

## Reading an off-CPU graph

Produce it from a wall-clock recording at conversion time: `jfrconv -s sleeping` keeps the
samples where the thread was not runnable, `-s runnable` keeps the rest. Then:

1. **Drop the idle threads first.** A pool thread parked on its queue for the whole window
   is 100 % `park` and 0 % information. Split by thread (`-t`), or include only threads that
   carried requests (`-I 'http-nio.*'`), before reading any width.
2. **Read the frame directly below the wait**, not the wait: `park` ← `ConcurrentBag.borrow`
   is the connection pool; `park` ← `LinkedBlockingQueue.take` is an executor starved of
   work — the opposite problem; `SocketRead` ← a client class is a downstream service, and
   the host is in the JFR event (`jfr view socket-reads-by-host`).
3. **Expect the off-CPU total to exceed the request time.** Threads overlap. Convert a width
   to latency only for one thread, or via the request-scoped span it belongs to.

## When the graph itself looks wrong

| Symptom                                                                             | Likely cause                                                                                        | Check                                                                               |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Almost everything is `LockSupport.park` / `epoll_wait`                              | wall-clock graph of a mostly idle pool                                                              | filter to active threads; or you wanted the CPU graph                               |
| Base is many unrelated frames, no `Thread.run` or `main`                            | JFR `stackdepth` truncation (default 64, leaf end kept)                                             | `truncated: true` in `jfr print --json`; restart with a higher depth (jfr-advanced) |
| Large `[unknown_Java]`, `[not_walkable_Java]`                                       | stack walking failed: attach during a safepoint-heavy phase, missing debug info, unsupported engine | share of error frames; engine choice is async-profiler-advanced                     |
| Wide `Interpreter` or `I2C/C2I adapters` frame                                      | profile taken before warm-up, or a method that never compiles                                       | `jfr view compiler-statistics`, `-prof comp`; re-profile once compilation plateaus  |
| Wide `G1 Conc*`, `ZWorker*`, `C2 CompilerThread*`                                   | whole-process CPU graph; allocation or compilation load is the finding                              | allocation graph; `jfr view gc-cpu-time`, `thread-cpu-load`                         |
| A hot method with no children and a plausible name (`vtable stub`, `SafepointBlob`) | JVM stub; time is charged to the caller that reached it                                             | look one frame up; a wide safepoint stub is `safepoints`                            |
| Two runs of the same build differ in shape                                          | different inlining decisions per JVM start; the widths moved, the work did not                      | compare with `-n`/`--diff` and by self-time of leaves, not by tree shape            |
| Every frame is one colour in a differential                                         | totals not normalised                                                                               | `difffolded.pl -n`, `jfrconv --diff`                                                |
| A method shows 100 % of one thread, 0 % of others                                   | that thread is a dedicated worker (timer, scheduler); its width is not the request path             | `-t` and read the request threads                                                   |

The first two rows account for most "the profile is useless" verdicts, and neither is a
property of the code.
