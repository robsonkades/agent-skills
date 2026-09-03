# Production patterns and decisions

What deoptimisation looks like on a fleet rather than in a lab, and which of the levers is
worth pulling. Runtime facts are from Temurin 25.0.3 unless marked.

## The post-deploy timeline

A fresh JVM produces every kind of event in the first minutes, and all of it is the design
working:

| Window          | What the logs show                                                                     | Why                                                               |
| --------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| First seconds   | `made not entrant: not used`, `OSR invalidation of lower level`                        | Tier 3 code retired by tier 4. Not a deoptimisation               |
| First minutes   | `unstable_if` / `unloaded` / `uninitialized`, one per bci, across many methods         | Branches and classes first reached under real traffic             |
| As types arrive | `class_check` in bursts of up to four per site, then `made not entrant: uncommon trap` | Sites profiled monomorphic during start-up meet their second type |
| As classes load | `marked for deoptimization` across several methods at once                             | A lazily loaded class violated a CHA dependency                   |
| Steady state    | A floor: sporadic traps in rarely-run code, nothing at a fixed site                    | The profile now covers the behaviour                              |

The metric is the **rate per site** — method and bci — and its decay to a floor, not the
total. Two numbers describe a healthy JVM: time to reach the floor, and the floor itself. A
floor dominated by one site with `action=none`, or a floor that steps up at every request
pattern change, is a finding; forty sites trapping once each in minute one is not. Time to
floor is a warm-up criterion that belongs next to the compilation-rate plateau
`jit-compilation` uses for traffic gating.

Every replica goes through this independently. Deploying to twenty replicas at once is
twenty simultaneous warm-ups; a rolling deploy spreads them, and a replica gated on its own
floor takes traffic when it is ready rather than after a fixed sleep.

## What a restart clears, and what it does not

A restart discards every `MethodData`: trap history, decompile counts, `not compilable`
marks, the per-site `none` state. Every speculation is available again — and every cause is
still there, so a method that took two hundred decompilations to reach the `none` storm will
take them again. The AOT cache (JEP 483, JDK 24; JEP 515 method profiling, JDK 25) carries
class loading and, on 25, a start-up profile; whether it carries trap history is not
verified here. Treat a restart as evidence collection with a clean slate, never as the fix.

## Where runtime class loading comes from

Any of these adds an implementor to a hierarchy that C2 had assumed closed, and each
addition flushes every nmethod holding that assumption at once:

| Source                                                                        | Evidence in `-Xlog:class+load`                      | Note                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lazy first use of a second implementation under traffic                       | Ordinary class load, seconds to minutes after start | The common case; warm-up that touches it fixes it                                                                                                                                                |
| A second lambda or method reference for a functional interface                | `X$$Lambda/0x…  source: X`                          | Each lambda body is its own hidden class. A second lambda for an interface with one implementor is a `unique_concrete_method` failure and a `marked for deoptimization` burst (executed, 25.0.3) |
| Dynamic proxies, CGLIB / ByteBuddy subclasses, MapStruct-style generated code | `jdk.proxy…`, `…$$SpringCGLIB$$…`, `…$ByteBuddy$…`  | Generated on first use of a bean or an endpoint; a warm-up that hits every endpoint loads them                                                                                                   |
| Serialisation and templating accessors generated per type                     | `…$Accessor`, `…$Serializer`, engine-specific names | Per type first seen on the wire; steady-state generation means steady-state invalidation                                                                                                         |
| Scripting engines, rule engines, per-tenant class loaders                     | Continuous                                          | The hierarchy never stops changing; cache the generated classes or isolate them behind a megamorphic boundary                                                                                    |
| Plugins loaded on demand                                                      | A burst on plugin activation                        | Accept once, or load at start-up                                                                                                                                                                 |

Correlate by time: the `class+load` line for the `dependee` sits immediately before the
`Failed dependency` block. When the dependee is a generated class, the fix is on the
generating side.

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

Neither produces `jdk.Deoptimization` events. The JFR-only view of an agent problem is a
latency spike with no compiler evidence, which is why the compilation log matters.

## Feature flags and configuration in the hot path

| Flag storage                                          | What C2 does                                                                          | Cost after the first flip                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `static final boolean`                                | Constant-folds; the dead side is never compiled                                       | Cannot flip without a restart — no cost, no runtime control                                                                             |
| `volatile` / `AtomicBoolean` / config lookup          | A real load and a branch; the untaken side is an `unstable_if` trap until first taken | One trap per bci, then both sides compiled. The cost is the lost folding, not recurring deoptimisation                                  |
| Flag that selects a **strategy object** at a hot site | Receiver-type profile can evolve from monomorphic to polymorphic/megamorphic          | Additional types can invalidate guarded inlining; the eventual inline shape depends on profile width, frequency and compiler heuristics |

The first row is a build-time decision, the second is cheap, the third is the one that turns
a "harmless" flag into a lost inline tree on the hot path. Put the strategy choice one level
up, so that each strategy's hot loop is a separate compiled method with its own monomorphic
sites.

## Act or accept

| Signal                                                        | Accept when                                    | Act when                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Burst of any reason in the first minutes after start          | The rate reaches a floor and stays there       | The same burst repeats after every deploy at a site whose types are known: warm it up    |
| `marked for deoptimization` on class load                     | The class loads once per process               | It recurs in steady state: the hierarchy is being changed by generated code              |
| `class_check` → bimorphic → virtual call at one site          | The site is not on the latency-critical path   | It is, and profiling shows the lost inline: narrow the static type or peel the hot type  |
| `action=none` at a steady rate on one site                    | Rate and service cost are negligible           | It consumes meaningful CPU/latency: explain the decompilation history and unstable input |
| `made not compilable on level 4`                              | Method is cold or C1 meets the SLO             | It is hot and the tier loss is measurable; diagnose before considering source changes    |
| `jdk.Deoptimization` + `jdk.CompilationFailure` on one method | Events are isolated and operationally harmless | The same hot method repeatedly fails/storms; inspect failure text and generated bytecode |

## The levers and their trade-offs

| Lever                                                                     | Buys                                                                                               | Costs                                                                                                |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Warm-up traffic exercising every type and branch                          | No deoptimisation under production load                                                            | A bimorphic or megamorphic profile where a monomorphic one was possible — predictability over peak   |
| Loading generated classes at start-up                                     | One CHA burst before traffic instead of many under it                                              | Start-up time; every generated class, not just the ones this deploy needs                            |
| Narrowing the static type at a hot call site                              | No guard, no dependency, full inlining                                                             | The design loses a seam; a `final` on the implementation alone buys nothing                          |
| Peeling a hot receiver type into its own site                             | The hot type inlines; the rest stays virtual                                                       | Code that exists for the compiler; document why                                                      |
| `-XX:CompileCommand=dontinline,C::m` on a large trapping callee           | Smaller blast radius per deoptimisation; cheaper rematerialisation                                 | The call boundary blocks escape analysis across it                                                   |
| `-XX:CompileCommand=exclude,C::m` on a storming method                    | Stops the storm immediately                                                                        | The method is **interpreted**, slower than the tier-1 fallback the cutoff would give                 |
| `-XX:-UseTypeSpeculation`                                                 | Isolates `speculate_*` traps in an experiment                                                      | Process-wide loss of a C2 optimisation; not a production setting                                     |
| Raising `PerMethodRecompilationCutoff` / `PerBytecodeRecompilationCutoff` | More attempts before the tested HotSpot build gives up; useful only in a bounded causal experiment | More compilation/deoptimisation work and delayed fallback; it does not make unstable inputs converge |
| Restart                                                                   | A clean MDO and a clean baseline for evidence                                                      | Nothing is fixed; the storm rebuilds                                                                 |

## Authoritative sources

- [JDK 25 HotSpot `deoptimization.cpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/deoptimization.cpp)
- [JDK 25 HotSpot `dependencies.cpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/code/dependencies.cpp)
- [JDK 25 Instrumentation API](https://docs.oracle.com/en/java/javase/25/docs/api/java.instrument/java/lang/instrument/Instrumentation.html)
- [JDK 25 JVM TI specification](https://docs.oracle.com/en/java/javase/25/docs/specs/jvmti.html)
