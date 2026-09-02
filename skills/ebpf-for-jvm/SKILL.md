---
name: ebpf-for-jvm
description: >
  Observing a JVM from the kernel with eBPF and bpftrace: syscall and futex latency, block
  I/O, run queue latency, page faults, JVM USDT probes, and correlating kernel-side evidence
  with JVM-side evidence. Use when JFR and a CPU profile show a healthy runtime but p99 is
  bad, when threads are RUNNABLE yet not scheduled, when a bpftrace script returns an empty
  histogram under known contention, when a script filters `sched:*` tracepoints by
  `args->pid`, when a USDT probe listed by `tplist` never fires, or when someone is about to
  run `profiler.sh`. Does not cover host metrics and incident commands that need no eBPF
  (linux-for-jvm), running a single JVM-side profile (jfr-and-async-profiler), or always-on
  collection (continuous-profiling).
---

# eBPF For JVM

## Purpose

Decide whether the missing latency is outside the JVM, and get kernel-side evidence
without producing a number that is silently wrong. JFR instruments what the JVM knows
about; async-profiler samples the stack. Neither sees run queue latency, kernel-side I/O
decomposition or page faults — so when both report a healthy runtime and p99 is still
bad, the remaining question is one only the kernel can answer.

The failure this prevents is the bpftrace script that compiles, runs, exits cleanly and
reports the wrong thing: an empty futex histogram under heavy contention because the
private-flag bit was not masked, or a scheduler histogram covering one thread because a
raw tracepoint field was treated as a process id. Neither produces an error message.

## Workflow

1. **Exhaust the JVM-side view first.** Reach for eBPF only once JFR shows no GC pause,
   no monitor contention and no slow I/O in the relevant band, and the CPU profile is
   unremarkable. eBPF complements those tools; it does not replace them.
2. **Inspect the probe before writing a filter.** `bpftrace -lv 'tracepoint:sched:sched_switch'`
   confirms the field exists and what type it has on this kernel build. Fields differ
   between kernels; a filter written from memory is a guess.
3. **Choose the scope deliberately.** Builtin `pid` is already the process (tgid) and is
   safe. Raw tracepoint fields are not — decide per probe whether you need the whole
   process or one thread, and build the TID map when it is the whole process.
4. **Prove the script on a synthetic load.** Run it against a test PID producing known
   contention and confirm the output is not empty before pointing it at production.
5. **Run scoped, with a stop plan.** Always filter by PID, keep the collection window
   short, and be ready to kill the `bpftrace` process if the observed overhead exceeds
   what you budgeted.
6. **Interpret each signal to a next step**, then correlate with the JVM-side evidence
   without adding the two together — see `references/signal-interpretation.md`.

## Rules

- Never run a probe without a PID filter. An unfiltered `tracepoint:syscalls:*` traces
  every process on the host, including the ones you were not asked to slow down.
- Filter `FUTEX_WAIT` as `(args->op & 0x7f) == 0`. `args->op == 0` never matches a real
  Java lock: glibc uses `FUTEX_WAIT_PRIVATE` (128), so the histogram comes back empty
  under heavy contention with no error.
- On `sched:sched_wakeup` and `sched:sched_switch`, `args->pid`, `args->next_pid` and
  `args->prev_pid` are **TIDs**. Filtering them by `$1` captures only the thread whose
  TID equals the PID — typically the main thread — and discards the pool. Populate a map
  from `/proc/$PID/task` in `BEGIN` and filter against it.
- The bpftrace builtins are already translated: `pid` is the kernel `tgid` (the user-space
  PID), `tid` is the kernel `pid`. The trap is in raw `args.` fields only (`args->` is
  the legacy alias of `args.`; both are accepted).
- Never apply `ksym()` to a syscall number. It resolves kernel memory addresses; for
  `args->id` on `raw_syscalls:sys_enter`, aggregate the raw number and decode offline
  (`ausyscall x86_64 202`).
- A probe appearing in `tplist -l libjvm.so` is not a probe that fires. Lifecycle probes
  (`vm__init__*`, `thread__start`/`stop`, `class__loaded`, `gc__begin`/`end`,
  `compiled__method__load`) emit unconditionally; `monitor__*`, `method__entry`/`return`
  and `object__alloc` are gated by `-XX:+DTraceMonitorProbes`, `-XX:+DTraceMethodProbes`
  and `-XX:+DTraceAllocProbes` (product flags, JDK 25). **`-XX:+ExtendedDTraceProbes` no
  longer exists** — deprecated in JDK 19 (JDK-8279629), obsoleted in JDK 20
  (JDK-8279913); JDK 25 refuses to start with it (`Unrecognized VM option`).
- `DTraceMethodProbes` routes every method entry and exit through a runtime call and
  `DTraceAllocProbes` every allocation; neither is a production flag. Scope them to a
  reproduction JVM.
- USDT availability is a property of the **build** (`--enable-dtrace`, which needs
  `sys/sdt.h` at build time) — not of the JDK version. `readelf -n libjvm.so | grep -c
stapsdt` on the production binary is the test; zero means no `usdt:` probe will ever
  attach.
- Use `asprof` (and `jfrconv` for format conversion). `profiler.sh` was removed in
  async-profiler 3.0; a command copied from older material will simply not exist.
- `perf` cannot unwind through JIT frames with DWARF: compiled Java code carries no
  `.eh_frame`, so `--call-graph dwarf` stops at the first Java frame regardless of what
  the native libraries emit. Through JIT code only `--call-graph fp` works, and only with
  `-XX:+PreserveFramePointer` at JVM start (it costs C2 one allocatable register —
  measure the throughput cost before enabling it fleet-wide). `asprof --cstack vm` walks
  JIT frames from the JVM's own frame layout and needs neither.
- The perf map is in the JDK: `jcmd <pid> Compiler.perfmap` (JDK 17+, Linux only) writes
  `/tmp/perf-<pid>.map`; `-XX:+DumpPerfMapAtExit` (diagnostic, Linux) writes it at exit.
  The map is a snapshot — dump it immediately before `perf script`, or methods recompiled
  after the dump show as hex addresses. `perf-map-agent` is no longer needed.
- A run-queue histogram that records only `sched_wakeup → sched_switch` misses
  preemption: a thread switched out while still `TASK_RUNNING` re-enters the queue
  without a wakeup. Under CPU saturation or CFS throttling that is most of the latency.
  Handle `prev_state == TASK_RUNNING` and `sched_wakeup_new` as bpftrace's own
  `runqlat.bt` does.
- Never add a kernel-side duration to a JVM-side one. A 5 ms `jdk.SocketRead` decomposes
  into syscall overhead, TCP stack, scheduler wait and `memcpy`; bpftrace, JFR, `ss` and
  `perf stat` measure different quantities.
- Label eBPF overhead as an estimate unless you measured it in this environment with and
  without the script running. "Under 1%" is a widely cited figure, not a measurement.
- bpftrace histogram buckets are non-overlapping powers of two. Overlapping buckets in a
  reported result mean the output was transcribed wrong, not that the kernel produced it.
- async-profiler samples stacks through `AsyncGetCallTrace` and `perf_events`, not JVMTI;
  JVMTI covers only auxiliary events such as class loading and thread start.

## References

- [bpftrace recipes](references/bpftrace-recipes.md) — runnable, correctly filtered
  scripts for syscall counts, read/write latency, futex contention, run queue latency
  including preemption, block I/O and page faults, the USDT flags that exist on JDK 25,
  and mixed kernel+JIT flame graphs with the JDK's own perf map. Read before writing any
  script, and copy from here rather than from memory.
- [Signal interpretation](references/signal-interpretation.md) — the PID/TID and futex
  bitmask tables, the USDT activation table, environment and container prerequisites
  (capabilities, tracefs, BTF), and a signal to probable-cause to next-step table. Read
  when a script is ready to run against a real PID, or when reading its output.
