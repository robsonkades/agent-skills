# Production patterns and decisions

What deoptimisation looks like on a fleet rather than in a lab, and which of the levers is
worth pulling. Runtime facts are from Temurin 25.0.3 unless marked.

## The post-deploy timeline

A fresh JVM commonly produces the following startup patterns. Their timing alone does not
establish that they are harmless; check persistence and service impact:

| Window          | What the logs show                                                                     | Why                                                               |
| --------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| First seconds   | `made not entrant: not used`, `OSR invalidation of lower level`                        | Often replacement by a higher tier; confirm successor compilation |
| First minutes   | `unstable_if` / `unloaded` / `uninitialized`, one per bci, across many methods         | Branches and classes first reached under real traffic             |
| As types arrive | `class_check` in bursts of up to four per site, then `made not entrant: uncommon trap` | Sites profiled monomorphic during start-up meet their second type |
| As classes load | `marked for deoptimization` across several methods at once                             | A lazily loaded class violated a CHA dependency                   |
| Steady state    | A floor: sporadic traps in rarely-run code, nothing at a fixed site                    | The profile now covers the behaviour                              |

The metric is the **rate per site** — method and bci — and its decay to a floor, not the
total. Time to reach the floor and the floor itself are useful only with continued
representative demand and startup/steady-state service outcomes. A floor dominated by one
site with `action=none`, or one that steps up with request changes, warrants inspecting its
history and cost; forty sites trapping once may still matter to a cold-start SLO. Time to
floor is one warm-up signal alongside service readiness and the compilation-rate plateau
`jit-compilation` uses for traffic gating.

Every replica goes through this independently. Deploying to twenty replicas at once is
twenty simultaneous warm-ups; a rolling deploy can spread them. A quiet idle replica is not
necessarily ready: gate on representative warm-up and the service criteria, not event silence.

## What a restart clears, and what it does not

A restart destroys the old process's live code and profiling state, but does not guarantee
an empty starting profile or the same compilation trajectory. An enabled AOT cache can
restore training profiles on JDK 25 (JEP 515); which trap history survives is not verified
here. Record actual cache use, inputs and compiler settings before comparing runs. A restart
may be an authorized temporary recovery action, with cold-start cost and lost evidence; it
does not establish that the cause of recurring deoptimisation was corrected.

## Where runtime class loading comes from

These can introduce classes. Invalidation requires a new class to violate a dependency that
compiled code actually registered; repeated generation does not imply repeated invalidation of
an assumption already abandoned. MapStruct-style code is generally generated at build time,
though its loading can still be lazy:

| Source                                                                        | Evidence in `-Xlog:class+load`                      | Note                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lazy first use of a second implementation under traffic                       | Ordinary class load, seconds to minutes after start | Targeted representative warm-up may move this transition before traffic                                                                                                                          |
| A second lambda or method reference for a functional interface                | `X$$Lambda/0x…  source: X`                          | Each lambda body is its own hidden class. A second lambda for an interface with one implementor is a `unique_concrete_method` failure and a `marked for deoptimization` burst (executed, 25.0.3) |
| Dynamic proxies, CGLIB / ByteBuddy subclasses, MapStruct-style generated code | `jdk.proxy…`, `…$$SpringCGLIB$$…`, `…$ByteBuddy$…`  | Generation and loading times differ by tool; exercise the actual lazy paths implicated by evidence                                                                                               |
| Serialisation and templating accessors generated per type                     | `…$Accessor`, `…$Serializer`, engine-specific names | New types can trigger generation; recurrence matters only where newly violated compiled dependencies remain                                                                                      |
| Scripting engines, rule engines, per-tenant class loaders                     | Potentially continuous                              | Confirm affected dependencies first; class reuse or call-site isolation must preserve class-loader/tenant lifetime and required extensibility                                                    |
| Plugins loaded on demand                                                      | A burst on plugin activation                        | Accept once, or load at start-up                                                                                                                                                                 |

Correlate the failed dependency's context and dependee with class loading; timestamps alone
are insufficient and concurrent records can interleave. A generated dependee identifies a
path to inspect, not proof that all generation must be removed or all generated classes retained.

## Agents

Two different mechanisms hide behind "the APM agent causes deoptimisation":

- **Retransformation.** An agent that instruments through `retransformClasses` /
  `redefineClasses` invalidates every nmethod with an `evol_method` dependency on the class
  — every caller and every method that inlined it — inside a global safepoint named
  `RedefineClasses`. Attaching an agent late, or an agent that re-instruments on
  configuration change, produces a process-wide burst that `-Xlog:safepoint` names.
- **Class loading.** An agent that loads helper or proxy classes into application
  hierarchies produces ordinary CHA invalidations at call sites unrelated to what it
  observes. The `dependee` in `-Xlog:dependencies=debug` names the agent's class.

Neither path produces the baseline `jdk.Deoptimization` trap event. Other JFR events may
provide context; compilation and dependency logs distinguish the actual invalidation.

## Feature flags and configuration in the hot path

| Flag storage                                          | What C2 does                                                                 | Cost after the first flip                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `static final boolean`                                | Constant-folds; the dead side is never compiled                              | Cannot flip without a restart — no cost, no runtime control                                                                             |
| `volatile` / `AtomicBoolean` / config lookup          | A load and branch; an unprofiled side may use an `unstable_if` trap          | Commonly converges to compiled branches with retained profiling; event counts are not bounded to one per bci                            |
| Flag that selects a **strategy object** at a hot site | Receiver-type profile can evolve from monomorphic to polymorphic/megamorphic | Additional types can invalidate guarded inlining; the eventual inline shape depends on profile width, frequency and compiler heuristics |

Only a constant-expression `static final boolean` is a Java compile-time constant; a value
initialized from configuration is fixed at class initialization and may be folded by HotSpot.
The mutable-flag row describes a common convergence pattern, not an exactly-one-event guarantee.
The cost of the second row depends on the access path; the third can turn
a "harmless" flag into a lost inline tree on the hot path. Moving the choice outside a hot
loop can give strategies separate sites, but a source-level helper is not necessarily a compiled
boundary: C2 can inline it again. Inspect the resulting inline shape and service cost before
keeping such a change; preserve required runtime switching and API contracts.

## Act or accept

| Signal                                                        | Accept when                                                    | Act when                                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Burst of any reason in the first minutes after start          | Rate settles under representative demand and startup SLOs pass | Repeated first-use cost harms the SLO: compare targeted warm-up with accepting its cost      |
| `marked for deoptimization` on class load                     | Bounded transitions meet service criteria                      | Recurring cost matters: confirm the changing dependency and its source before choosing a fix |
| `class_check` → bimorphic → virtual call at one site          | The site is not on the latency-critical path                   | It is, and profiling shows the lost inline: narrow the static type or peel the hot type      |
| `action=none` at a steady rate on one site                    | Rate and service cost are negligible                           | It consumes meaningful CPU/latency: explain the decompilation history and unstable input     |
| `made not compilable on level 4`                              | Method is cold or C1 meets the SLO                             | It is hot and the tier loss is measurable; diagnose before considering source changes        |
| `jdk.Deoptimization` + `jdk.CompilationFailure` on one method | Events are isolated and operationally harmless                 | The same hot method repeatedly fails/storms; inspect failure text and generated bytecode     |

## The levers and their trade-offs

| Lever                                                                     | Buys                                                                                                   | Costs                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Warm-up traffic exercising expected types and branches                    | Can reduce known first-use transitions under production load                                           | Startup work and profile changes; no guarantee against later invalidation                             |
| Loading known implicated classes at start-up                              | May move those dependency transitions before traffic                                                   | Startup time, retained classes and profile changes; future classes can still invalidate code          |
| Narrowing the static type at a hot call site                              | May remove receiver-type speculation if C2 did not already infer the target; inlining still has limits | The design loses a seam; inspect generated code and preserve required polymorphism                    |
| Peeling a hot receiver type into its own site                             | May retain useful guarded inlining; verify the compiled shape                                          | Extra dispatch/code and maintenance; keep only a measured benefit consistent with the API             |
| `-XX:CompileCommand=dontinline,C::m` on a large trapping callee           | Can separate callers' compiled frames from this callee's traps; measure actual reconstruction cost     | Lost inlining and escape analysis across that boundary                                                |
| Startup `-XX:CompileCommand=exclude,C::m` on a storming method            | Prevents compilation of that method; a bounded diagnostic control, not a repair                        | Interpreted execution and lost optimisations can cost more than the traps; measure the actual outcome |
| `-XX:-UseTypeSpeculation`                                                 | Isolates `speculate_*` traps in an experiment                                                          | Process-wide loss of a C2 optimisation; not a production setting                                      |
| Raising `PerMethodRecompilationCutoff` / `PerBytecodeRecompilationCutoff` | More attempts before the tested HotSpot build gives up; useful only in a bounded causal experiment     | More compilation/deoptimisation work and delayed fallback; it does not make unstable inputs converge  |
| Restart                                                                   | Replaces the process; can provide temporary recovery within the incident policy                        | Lost evidence and cold-start work; imported profiles and unchanged causes can affect recurrence       |

## Authoritative sources

- [JDK 25 HotSpot `deoptimization.cpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/deoptimization.cpp)
- [JDK 25 HotSpot `dependencies.cpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/code/dependencies.cpp)
- [JDK 25 Instrumentation API](https://docs.oracle.com/en/java/javase/25/docs/api/java.instrument/java/lang/instrument/Instrumentation.html)
- [JDK 25 JVM TI specification](https://docs.oracle.com/en/java/javase/25/docs/specs/jvmti.html)
- [JDK 25 release notes: Ahead-of-Time Method Profiling](https://www.oracle.com/java/technologies/javase/25-relnote-issues.html) — training profiles can be available at startup; no claim here about retention of specific trap state.
