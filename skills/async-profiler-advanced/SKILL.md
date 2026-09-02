---
name: async-profiler-advanced
description: >
  async-profiler beyond `-e cpu`: the perf_events, ctimer and itimer engines and what each
  can and cannot see, the wall engine's thread coverage, hardware PMU counters, multi-event
  JFR output, `jfrconv` conversions and native differentials, and reading broken or
  truncated stacks. Use when a flame graph is empty or dominated by idle, when `-t` is
  believed to control which threads are sampled, when `perf_event_open` is blocked in a
  container, when `--cap-add=SYS_PTRACE` did not fix profiling, when `[unknown_Java]` frames
  appear, when a differential flame graph comes out entirely one colour, when a runbook
  still says `profiler.sh`, or when combining CPU, alloc and lock in one recording. Does not
  cover choosing which profile to take or the capability ladder for granting access
  (jfr-and-async-profiler), reading the resulting graph and its differentials
  (flame-graph-analysis), or configuring the JFR engine itself (jfr-advanced).
---

# Async-Profiler Advanced

## Purpose

Choose the sampling engine that can answer the question in the environment you actually
have, and know what the answer omits. The engines differ in where the signal comes from,
how fairly it reaches threads, whether kernel frames survive, and which syscalls the
container allows — not in whether they suffer safepoint bias. All of them avoid it, by
construction.

The failure this prevents is the mental model that reads an engine flag as something it
is not: concluding that `-e wall` without `-t` does not see blocked threads (it does),
that `SYS_PTRACE` unblocks `perf_events` (it does not — different mechanism), or that a
narrow frame in a few-thousand-sample profile is a finding.

## Workflow

1. **Characterise the symptom before choosing an engine.** High CPU → `cpu` (or `ctimer`
   where `perf_events` is unavailable). High latency with low CPU → `wall -t`. Frequent
   GC → `alloc`. Suspected contention → `lock`. Suspected JNI contention →
   `--nativelock`.
2. **Confirm the tool.** `asprof -v`; the 3.x series and later ship the single native
   `asprof` binary. A runbook naming `profiler.sh` is describing a pre-3.0 distribution.
3. **Pick the engine by what the environment permits**, then record what that costs.
   `ctimer` gives up kernel stacks and jiffy-level resolution; `itimer` additionally gives
   up fair per-thread signal distribution.
4. **Always pass `-t` when the application has more than one thread role.** It appends a
   thread frame to each stack — a labelling operation. Without it, "60% in `park`" cannot
   be attributed to the idle HTTP pool or to the starved processing pool.
5. **Profile for at least 60 seconds under representative load**, longer for intermittent
   patterns, with only one profiling session per JVM.
6. **Record multiple events in one JFR file** when the question spans engines, then split
   with `jfrconv`. HTML and collapsed hold one event type per session.
7. **Check the sample count of a frame before making any quantitative claim about it**,
   and confirm the direction against a business metric. A flame graph shows where, not
   how much.

## Rules

- `-e wall` samples **all** threads — running, sleeping and blocked — by definition of the
  mode. `-t` does not change who is sampled, only how the output is grouped.
- `cpu`, `itimer`, `ctimer` and `wall` all avoid safepoint bias. Never explain a
  difference between them by invoking it; the real differences are signal origin,
  per-thread fairness, kernel stacks and resolution.
- `-e cpu` is the only engine that returns kernel stacks, and the only one that consumes
  a file descriptor (plus an 8 kB mmap) per thread. When `perf_event_open` fails it falls
  back **silently** to `ctimer`, then to `wall` (`Profiler::selectEngine`): a CPU profile
  with no kernel frames on a host that should have them is the tell.
- `kernel.perf_event_paranoid` governs unprivileged `perf_event_open`: ≤ 1 kernel stacks,
  2 (upstream default) user-space only, 3 (Debian/Ubuntu patch) nothing. async-profiler
  does not retry user-only on its own — pass `--all-user` at 2, `--fdtransfer` or `-e
ctimer` at 3. `CAP_PERFMON` (5.8+) or `CAP_SYS_ADMIN` bypasses the sysctl; a container's
  seccomp profile can still return `EPERM` before the capability is consulted, and
  `kptr_restrict ≠ 0` leaves kernel frames unsymbolised. The layer table is in
  `references/engines-and-events.md`.
- Attach goes through HotSpot's Unix socket at `/tmp/.java_pid<PID>` and is accepted only
  from the target's own uid/gid (`asprof` switches credentials when run as root). It never
  touches `perf_events`, so `--cap-add=SYS_PTRACE` fixes no `perf_events` failure and
  `CAP_PERFMON` fixes no attach failure.
- A differential without normalisation is an artefact: use `difffolded.pl -n`, or
  `jfrconv --diff`, which normalises internally. Red grew, blue shrank, yellow is new.
- No differential survives different load or different warm-up between the two
  collections. Same generator, same intensity, same duration, same warm-up.
- `asprof -o` (what to write at session end) and `jfrconv -o` (conversion output format)
  are separate option namespaces. Convert an existing `.jfr` with `jfrconv`.
- JFR is the only output format that carries multiple event types in one recording.
- Start the target JVM with `-XX:+UnlockDiagnosticVMOptions -XX:+DebugNonSafepoints`
  whenever the agent is not loaded at boot via `-agentpath`, or attribution of small
  inlined methods degrades.
- `[unknown_Java]` frames, missing per-frame compilation level, and native frames that
  precede the Java frames being unrecoverable are limitations of `AsyncGetCallTrace`, not
  bugs in async-profiler. JEP 435, which proposed a replacement API, is Closed/Withdrawn
  and is not in any released JDK. Since 4.2 the default stack walker is the VMStructs one
  (`--cstack vm`) wherever the JDK exposes `gHotSpotVMStructs`; `--cstack vmx` is the one
  mode that recovers native frames _before_ the first Java frame, and `--cstack dwarf`
  is for native code built without frame pointers.
- `--jfrsync <config>` starts a JFR recording with the given settings in the same file as
  the profiler's samples (implies `-o jfr`): GC, safepoint, socket and lock events on the
  same timeline as the stacks. Use it instead of running JFR and `asprof` side by side.
- `--trace` and `--nativemem` are instrumentation, not sampling: their overhead scales
  with call or allocation frequency, not with wall time. Scope them narrowly and briefly.
- `--loop` file patterns must contain `%t` or `%n`, or each iteration silently overwrites
  the previous file.
- Prefer one hardware PMU event per session. Requesting more simultaneous counters than
  the microarchitecture has registers forces kernel time-multiplexing and inflates the
  variance of every estimate.

## References

- [Sampling engines, coverage and events](references/engines-and-events.md) — the
  `cpu`/`itimer`/`ctimer` comparison, expected sample counts per engine, the container
  access layers (`perf_event_paranoid`, seccomp, capabilities, `kptr_restrict`) with the
  exact fix for each, the error-message troubleshooting table, and the thread-state to
  JFR-event mapping. Read when choosing an engine, when `asprof` prints an error, or when
  a profile shows a wait you need to trace to code.
- [Session recipes, output formats and conversion](references/output-and-conversion.md) —
  `asprof` invocations for each mode, multi-event recordings, `jfrconv` conversions and
  native differentials, continuous looping, and diagnosing broken stacks. Read when
  running a session or converting its output.
