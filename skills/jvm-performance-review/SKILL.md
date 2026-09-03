---
name: jvm-performance-review
description: >
  Auditing JVM configuration evidence across the supplied command, effective runtime flags,
  target JDK build, container/cgroup envelope, workload lifecycle, and stated SLO. Classifies
  flags by support and origin, detects masking, duplicates and ergonomic interactions, prices
  heap/non-heap/CPU/startup trade-offs, and emits prioritized falsifiable findings rather than
  folklore flag lists. Use for JVM options, Kubernetes manifests, JDK upgrades, collector/heap
  proposals, or claims that a flag fixes latency. Symptom diagnosis, deep GC tuning, profiler
  selection, and unified-log construction have separate owners.
---

# JVM performance review

## Purpose

Review what the JVM was asked to do, what it actually did, under which resource envelope, and
which production objective that configuration serves. Static options are intent; effective flags,
runtime events, and cgroup state are execution evidence.

The deliverable is a prioritized set of bounded findings with provenance, mechanism, consequence,
confidence, and a confirming/falsifying observation. It is not a reusable “best flags” block.

## Ownership boundary

- This skill owns configuration review, flag lifecycle/origin, runtime reconciliation, and change
  evidence requirements.
- `java-performance` owns symptom triage.
- `jvm-gc-tuning` and collector-internals skills own heap/collector decisions.
- `container-awareness` owns deep JVM/cgroup behavior.
- `unified-logging`, `jfr-and-async-profiler`, and `gc-log-analysis` own evidence configuration and
  interpretation.
- `jdk-upgrade-impact` owns the broader upgrade program.

## Review contract

```text
decision/request and owner:
SLO/SLI, load, business-work denominator and lifecycle:
target JDK vendor/version/build/architecture and fleet range:
launcher/image/manifest/options sources and precedence:
effective command line and runtime flag snapshot:
collector, heap, compressed-reference/header and compiler state:
cgroup v1/v2 paths, effective CPU/memory/cpuset and Kubernetes request/limit:
workload evidence: latency/throughput/errors, GC/JFR/log/OS evidence:
deployment, startup, shutdown, OOM and rollback constraints:
```

Missing evidence lowers confidence or changes the next action; it does not justify guessing a flag.

## Evidence precedence and provenance

Use all layers because each answers a different question:

| Layer                                    | Shows                                      | Can miss/mislead                                               |
| ---------------------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| source manifest/env/launcher             | declared intent                            | entrypoint expansion, quoting, admission mutation, later flags |
| process command line / `VM.command_line` | arguments received                         | ergonomic changes and runtime-manageable values                |
| `VM.flags -all` / flag origin            | effective values and origin                | application/workload state and some external resource changes  |
| startup logs/JFR/runtime info            | selected collector, heap/runtime decisions | incomplete settings/window                                     |
| cgroup/proc/Kubernetes status            | enforced resources and failure state       | JVM's interpretation without correlation                       |
| workload metrics/traces                  | outcome                                    | configuration cause without runtime evidence                   |

Typical read-only commands, subject to target support and attach policy:

```bash
java -version
jcmd <pid> VM.command_line
jcmd <pid> VM.flags -all
jcmd <pid> VM.info
```

Discover commands with `jcmd <pid> help`; impact and output vary by JDK. Preserve exact output,
timestamp, PID start time, container identity, and JDK build. `VM.flags` does not universally
“outrank” every source: it complements command-line provenance and resource/workload evidence.

## Workflow

1. **Pin builds and deployment variants.** Audit each materially distinct JDK/vendor/architecture,
   not only the newest developer machine.
2. **Resolve option composition.** Expand launcher scripts, env variables, image defaults,
   `JAVA_TOOL_OPTIONS`, `JDK_JAVA_OPTIONS`, service managers, and orchestration mutations. Detect
   duplicates and ordering.
3. **Check masking and startup behavior.** Treat `IgnoreUnrecognizedVMOptions` as a material risk,
   then test questionable options on the exact build without masking in a disposable preflight.
4. **Classify support and origin.** Live/product, diagnostic/experimental, deprecated, obsolete/
   ignored, expired/unrecognized, vendor-specific, or unknown. Runtime/source verification beats a
   copied lifecycle table.
5. **Reconcile effective runtime state.** Collector, heap min/initial/max, CPU count, GC/compiler
   threads, compressed references/headers, code cache, native tracking, logging, and manageability.
6. **Reconcile resources.** Effective cgroup paths/limits/current/events, cpuset, quota/period,
   Kubernetes request/limit/QoS, node topology, and OOM/throttle history.
7. **Price every non-default or explicit-default choice.** CPU, memory/headroom, startup/readiness,
   peak throughput, latency/tail, observability, failure semantics, portability, and operational
   complexity where relevant.
8. **Connect the change to an objective and falsifier.** Select the cheapest adequate measurement;
   use several when hypotheses cannot be separated by one artifact.
9. **Emit findings and an experiment/rollback.** Do not edit production configuration merely to
   make the option list shorter.

## Flag lifecycle and origin

Lifecycle is release-, vendor-, build-, and sometimes platform-specific. The same spelling can be
accepted with effect, accepted with warning, accepted but ignored, or rejected. Experimental/
diagnostic flags may require unlock options; vendor builds can add/remove behavior.

`-XX:+IgnoreUnrecognizedVMOptions` only masks unrecognized options; it does not make every
recognized option ineffective. Its presence means static review cannot prove that unknown-looking
options took effect. Verify each suspicious token on the exact build with masking removed in a
safe startup preflight and compare effective values/origins.

An explicit value equal to today's default is not automatically harmful and does not universally
disable JVM adaptation. It can document intent, pin behavior across releases, alter flag origin or
ergonomic interactions, or merely add noise. Report the specific consequence rather than “explicit
default is always a finding.” See `references/flag-lifecycle.md`.

## Configuration interactions

Review options as a constraint system, not independent rows:

- `-Xmx`, RAM percentages, container memory, compressed-reference range, collector structures,
  direct/native memory, stacks, metaspace, code cache, page cache, and OOM policy share process/
  cgroup capacity.
- detected/overridden active processors influence GC, JIT, common-pool and virtual-thread scheduler
  ergonomics, while quota also controls how much CPU can actually run per period.
- collector selection and defaults vary by JDK/resource envelope; always read effective collector.
- fixed initial heap and pre-touch shift commitment/page-fault cost into startup and change RSS,
  NUMA placement, readiness and rollout concurrency.
- compilation-level, code-cache, AOT/CDS, and startup flags trade startup resources against later
  throughput/latency differently by workload and JDK.
- logging/profiling flags consume CPU/storage and may be essential recovery controls rather than
  “overhead to remove.”

Avoid hard-coded thresholds such as “31 GB always preserves compressed oops” or “one CPU always
selects collector X.” Object alignment, heap base, collector, platform, JDK and later releases can
change the result. Inspect effective heap configuration on the exact target.

## Change gate

Before recommending a performance-affecting change, require:

```text
observed problem and workload window
mechanism supported by current evidence
objective and guardrails
candidate versus status quo/default
expected direction and minimum useful effect
experiment unit, rollout cohort, duration and confounders
abort/rollback criteria
validation evidence and inconclusive outcome
```

A production emergency may justify a reversible risk-reduction change with incomplete evidence.
Label it mitigation, bound blast radius, preserve evidence, and do not retroactively call it a
validated optimization.

## Priority model

Prioritize by realized risk, not flag aesthetics:

| Priority | Finding class                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| P0       | immediate data/security/safety risk or fleet-wide startup outage                                                     |
| P1       | startup failure, OOM/kill risk, silent unsupported option, or configuration/runtime mismatch likely causing incident |
| P2       | material SLO/capacity/reliability trade-off unsupported by evidence; bad resource interaction                        |
| P3       | upgrade fragility, unnecessary pinning, observability/recovery gap, or uncertain expensive choice                    |
| P4       | hygiene/documentation issue with no demonstrated runtime consequence                                                 |

Severity, likelihood, exposure, detectability, and reversibility should be stated separately when a
single priority would hide uncertainty.

## Finding template

```text
Finding / priority:
Evidence and provenance:
Observation (fact):
Mechanism / inference:
Production consequence and affected objective:
JDK/vendor/platform scope:
Confidence and uncertainty:
Confirms:
Falsifies or narrows:
Recommendation / experiment:
Guardrails, abort and rollback:
Owner and follow-up evidence:
```

Example:

```text
Finding / priority: P1 — memory headroom is unproven
Evidence: pod limit 4 GiB; effective MaxHeapSize 4 GiB; no NMT, native/RSS peak, or cgroup events.
Observation: maximum Java heap equals the cgroup memory limit.
Inference: heap plus native/non-heap/file-backed resident memory can exceed the limit.
Consequence: cgroup kill can occur without a Java heap OOME/heap-dump path.
Scope: this image/JDK/pod class; runtime values captured at T.
Confidence: high for zero configured headroom; unknown peak non-heap demand and kill likelihood.
Confirms: memory.current approaches memory.max; memory.events increments; RSS decomposition.
Narrows/falsifies urgency: measured peak total remains below limit with declared rollout margin.
Recommendation: measure peak heap/live set and non-heap/native/RSS across lifecycle; size a canary
with explicit headroom derived from those distributions, then load/failure-test OOM behavior.
Rollback: restore prior heap/limit if latency, GC, rejection, or memory guardrail regresses.
```

## Troubleshooting tree

```text
option appears in manifest but not effective
  -> quoting/env/entrypoint/admission? inspect received command
  -> duplicate/later override or ergonomic constraint? inspect origin/effective state
  -> obsolete/unrecognized/masked/vendor-specific? exact-build startup preflight

pod OOMKilled with no Java OOME
  -> cgroup limit/event and process RSS peak
  -> heap commitment/live set versus native/metaspace/code/stacks/direct/mappings/page cache
  -> rollout concurrency/sidecar/other process and kernel accounting

latency changed after “same” JDK config
  -> JDK build/default/flag lifecycle changed
  -> effective CPU/cgroup/collector/heap/compiler state differs
  -> workload/deployment/lifecycle changed
  -> collect causal timing evidence before another flag change

startup slower after pre-touch/fixed heap
  -> expected commitment/page/NUMA cost versus CPU quota and memory bandwidth
  -> readiness/rollout and RSS policy interaction
  -> compare startup and steady-state objectives; keep only if trade is favorable
```

## Anti-patterns

| Anti-pattern                           | Why dangerous                                      | Better alternative                                   | Narrow exception                                |
| -------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Copy a “production flags” block        | versions/workloads/resources differ                | minimal config plus evidence-backed explicit choices | identical certified appliance image/workload    |
| Recommend flags from symptom text      | skips mechanism                                    | cheapest discriminating evidence and branch table    | reversible emergency mitigation, labeled        |
| Trust static manifest                  | misses composition/effective ergonomics            | reconcile command, flags, runtime and cgroup         | pre-deployment review with explicit uncertainty |
| Remove all explicit defaults           | may erase compatibility intent/interaction         | explain origin and consequence per flag              | mechanical cleanup after exact-build tests      |
| Set heap as fixed percentage only      | ignores native/live-set distributions              | lifecycle headroom model and canary                  | homogeneous, measured fleet policy              |
| Increase/decrease GC threads blindly   | trades pause/CPU/progress                          | collector evidence under quota/load                  | bounded incident experiment                     |
| Treat successful startup as validation | ignored/masked options and bad SLO behavior remain | effective snapshot plus workload/failure test        | syntax-only preflight                           |

## Definition of done

- [ ] Exact target builds/platforms and all option sources are pinned.
- [ ] Received command, duplicates, masking, support lifecycle, and effective origins are reconciled.
- [ ] Collector/heap/CPU/compiler/header/code-cache state and cgroup envelope are captured.
- [ ] Memory, CPU, startup, SLO, failure, deployment, and observability trade-offs are evaluated.
- [ ] Every material finding separates fact from inference and has confidence plus falsifier.
- [ ] Recommendations include measurement, practical threshold, guardrails, rollback, and owner.
- [ ] Claims are scoped; runtime discovery replaces stale default/lifecycle assumptions.

## References

- [Flag lifecycle and effective-state protocol](references/flag-lifecycle.md)
- [Flag cost and ergonomic interactions](references/flag-cost-and-defaults.md)
- [Container and memory arithmetic](references/container-arithmetic.md)
- [Evidence selection for common requests](references/missing-measurements.md)
- [JDK 25 `java` command documentation](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
- [JDK 25 `jcmd` command documentation](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [HotSpot VM options source](https://github.com/openjdk/jdk/tree/master/src/hotspot/share/runtime)
- [Java Virtual Machine specifications](https://docs.oracle.com/javase/specs/)
