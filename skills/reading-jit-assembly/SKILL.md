---
name: reading-jit-assembly
description: >
  Reading the machine code HotSpot actually emitted: installing hsdis, driving
  -XX:+PrintAssembly and JMH perfasm, telling the verified entry point and prologue from the
  method body, and confirming or refuting a hypothesis about an optimisation from the
  instructions themselves. Use when a claim about an optimisation needs proof at the
  instruction level, when PrintAssembly prints hex bytes instead of mnemonics, when
  PrintOptoAssembly on a product JDK unexpectedly prints only banner lines, when the capture must come
  from a running JVM, when a load has no cmp/test before it and someone concludes the null
  check was eliminated, when an assembly excerpt from a blog is in the other operand order,
  or when unexplained runtime calls appear between the expected logic. Does not cover the
  compiler phases that produced the code (c2-sea-of-nodes), what the compiler decided to
  inline or compile (compilation-and-inlining-logs), vectorisation as a subject
  (simd-and-vector-api), or benchmark construction (jmh-advanced).
---

# Reading JIT Assembly

## Purpose

Turn a belief about an optimisation into evidence. The failure this skill prevents is the
confident wrong reading: an excerpt captured in AT&T syntax but interpreted with Intel
operand order, so source and destination are inverted in every two-operand instruction —
which produces no crash and no exception, only a wrong conclusion that then drives a code
change.

Reading assembly answers **what the code does**. It does not answer where time is spent;
only sampling correlated to instructions (`perfasm`) does that. And it is the last level,
not the first: which tier, whether a call inlined and whether an allocation survived are
answered a level up, and a listing cannot show code the compiler removed. Keep the
questions apart, and never conclude from a static reading alone that an instruction is the
bottleneck.

## Workflow

1. **Decide whether assembly is the right level.** Tier, inlining and escape questions are
   `-XX:+PrintCompilation`, `-XX:+PrintInlining` and allocation profiling; "where is the
   time" is `perfasm` or a profiler. Open a listing for instruction-level questions only —
   was a bounds check hoisted, a lock inflated, a loop vectorised, a barrier emitted. The
   table is in `references/hsdis-setup-and-flags.md`.
2. **Verify hsdis is actually loaded** before trusting any output. Without the plugin the
   JVM does not fail: it logs `[warning][os] Loading hsdis library failed` once, at the
   first method printed, and continues with the abstract disassembler — hex words instead
   of mnemonics while retaining useful HotSpot annotations (`{poll}`, `{runtime_call …}`,
   `;*iaload`). Structure and annotated relocations can remain readable without hsdis;
   decoded operand semantics do not.
3. **Narrow the capture to one method** with `-XX:CompileCommand=print,Class::method`
   (needs no unlock), a `CompileCommandFile`, or `jcmd <PID> Compiler.directives_add` on a
   running JVM — which affects only compilations that start after it lands, and prints to
   the JVM's stdout. Global `PrintAssembly` prints stubs, the interpreter and every C1
   method; `-version` alone is hundreds of lines.
4. **Confirm the compiler, compilation kind, and build.** `Compiled method (c2)` identifies
   C2 output; level 4 is the usual fully profiled tier under the default tiered policy, not a
   promise that the nmethod will remain current. A `%` marks OSR, whose entry state and loop
   shape can differ from a normal compilation. Graal/JVMCI, C1, debug builds, architecture,
   collector, compact headers, compressed pointers, and CPU feature flags all change the
   listing. Record them with the capture.
5. **Confirm the syntax convention before reading a single operand.** Many x86 captures use
   AT&T (`src, dst`), while Intel uses `dst, src`; backend choice and build-time/runtime
   `PrintAssemblyOptions` can select the form. Identify it from register/immediate/memory
   notation and record it. Never infer syntax from the JDK vendor or a blog's style.
6. **Locate sections before interpreting instructions.** Find the entry points, prologue,
   main code, uncommon paths, exception/deoptimisation handlers, and stubs. Treat the exact
   prologue in the catalogue as a JDK 25/x86-64 example, not an ABI. Read `# parmN:` instead
   of assuming registers, and follow branch targets before deciding which instructions are
   on the normal path.
7. **Classify each finding against the pattern catalogue** — safepoint poll, bounds check
   and uncommon trap, TLAB allocation, card mark or ZGC barrier, lock fast path — and for a
   load with no visible `cmp`/`test`, use the three-way null-check test. See
   `references/pattern-catalogue.md` and `references/reading-the-output.md`.
8. **Triangulate the conclusion.** Keep the full listing, compilation/inlining log, exact VM
   flags, workload and profile from the same fork. Use `perfasm` or another address-aware
   sampler before naming a hot instruction; use suitable hardware counters only after
   checking event support, multiplexing and sample count on the target host.

## Rules

- Global `-XX:+PrintAssembly` and `-XX:+PrintOptoAssembly` are `diagnostic`: without
  `-XX:+UnlockDiagnosticVMOptions` **before** them the JVM prints `Error: VM option
'PrintAssembly' is diagnostic and must be enabled via -XX:+UnlockDiagnosticVMOptions.`
  and exits. `-XX:CompileCommand=print,…` and a `jcmd Compiler.directives_add` file with
  `"PrintAssembly": true` need no unlock; `-XX:CompilerDirectivesFile` does.
- On the tested Temurin 25.0.3 product build, `-XX:+PrintOptoAssembly` was accepted but only
  emitted a C2 banner because the detailed node printer is excluded from product builds;
  `PrintIdeal` was rejected as a `develop` flag. Recheck the flag class and output on the
  exact JDK. For ordinary product builds, `PrintAssembly` is the useful machine-code view;
  compiler-IR printers generally require a debug/fastdebug build.
- State the syntax convention of every excerpt you quote or read. In AT&T the destination
  is the **last** operand: `mov 0x8(%rbx),%eax` writes into `eax`.
- Absence of `cmp`/`test` before a load is **not** proof the JIT proved non-nullity. Three
  cases share that appearance; the `; implicit exception` comment is the discriminator, and
  the implicit path (`ImplicitNullChecks`, `pd diagnostic`, default `true`) is the common one
  for references arriving from outside the method.
- Attribute comments correctly: hsdis produces mnemonics only. Every annotation
  (`; implicit exception`, `; {poll}`, `;*iaload`, `{runtime_call …}`) comes from HotSpot's
  own printer walking the nmethod's relocations, not from the decoder — which is why they
  survive when hsdis is absent.
- Classify an "unexplained" call by HotSpot's relocation comment and control-flow position.
  Entry barriers, uncommon traps, safepoint blobs, allocation/locking slow paths and GC
  barrier stubs are legitimate candidates. `VerifyOops` is a debug-build possibility, not a
  generic explanation. Never compare instruction counts across build types or count cold
  stubs as if they execute on every invocation.
- Safepoint-poll placement and encoding depend on compiler, loop shape, platform and JDK.
  The catalogue records two forms observed on JDK 25/x86-64 and the older global-page form;
  the `{poll}`/`{poll_return}` annotation is stronger evidence than memorised offsets.
- In the documented JDK 25/x86-64 C2 configuration, `%r15` carries `JavaThread` and `%r12`
  participates in compressed-oop addressing. These are HotSpot register-allocation
  conventions, not Java or x86 ABI guarantees. Read header comments and generated-code
  sources before transferring the mapping to another compiler, port, or pointer mode.
- Object layout in operands: default header 12 bytes (klass at `0x8`, array length at `0xc`,
  `int[]` data at `0x10`); with `-XX:+UseCompactObjectHeaders` (JEP 519, product in JDK 25,
  default `false`) the header is 8 bytes, those become `0x8`/`0xc`, and the header is one
  64-bit store. Check the flag before reading a displacement as a field.
- `PrintAssembly` may enable `DebugNonSafepoints` and report that side effect. A
  `{post_call_nop}` is metadata-supporting code, not application logic; it still occupies
  code-cache and front-end bandwidth, so call it negligible only after measurement.
- For current OpenJDK source, build hsdis from the checkout root with
  `bash configure --with-hsdis=<backend>` and `make build-hsdis`; the JDK 18 change replaced
  the old standalone build. Prefer a vendor-supplied plugin when the distribution provides
  one, otherwise build against a matching source line and verify library provenance.
- `UseAVX`, `MaxVectorSize` and `UseSuperWord` are capability/policy inputs, not proof of the
  emitted width. Decode the actual lane-bearing opcode and register width. A VEX prefix or
  an `xmm` register alone does not prove a vector loop, and scalar unrolling is not a failed
  vectorisation diagnosis.
- Do not attach a fixed cycle cost to an instruction. Latency/throughput tables omit cache,
  coherence, speculation, frequency, port pressure and surrounding dependencies. Measure
  the hot region and compare whole-workload results before recommending source changes.

## Decision record

For every assembly-backed recommendation, record:

- hypothesis and source-level construct;
- JDK vendor/build, compiler and tier, normal versus OSR compilation;
- OS/architecture/microarchitecture, GC and relevant VM flags;
- exact method descriptor and compile id, plus evidence the nmethod was current while sampled;
- complete listing with syntax, not a cropped happy path;
- sampled event, event count, kernel permissions and multiplexing status;
- alternative explanation considered, source change proposed, and before/after workload result.

Reject the conclusion when the capture comes from another JDK/CPU configuration, the method
was deoptimised or replaced during sampling, only a cold stub was inspected, the listing is
truncated, or the benchmark changed compilation shape relative to production.

## Troubleshooting

| Symptom                                  | Distinguish with                                                           | Likely action                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Hex words, no mnemonics                  | hsdis load warning; `PrintAssemblyOptions=help`                            | install/build a matching trusted hsdis, or use annotations only   |
| No target method                         | compile log, descriptor and tier; live directive timestamp                 | fix match syntax or restart before the target compiles            |
| Two different bodies                     | compile id, `%` OSR marker, `made not entrant`, address range              | select the nmethod sampled during the measurement                 |
| Samples map to unknown/native            | saved assembly log, symbols, perf permissions and code-cache reuse warning | repair capture/symbolization; do not attribute to Java source yet |
| Expected optimisation absent             | inlining log, guards/traps, aliasing, CPU flags and representative profile | diagnose at compiler-IR/profile level before editing Java         |
| Faster microbenchmark, unchanged service | end-to-end profile, tails, allocation/GC and CPU counters                  | keep only changes that survive production-shaped validation       |

- Cite `psy-lob-saw.blogspot.com` for Nitsan Wakart's material (it is a blog, not a book),
  and `github.com/AdoptOpenJDK/jitwatch` for JITWatch.

## References

- [hsdis setup and print flags](references/hsdis-setup-and-flags.md) — when assembly is the
  right level, the JDK 18+ build recipe and the library search path, what a product JDK
  prints for each printer, the unlock matrix for scoped and live captures, the verified
  `PrintAssemblyOptions` list, and the perfasm invocation with what it adds. Read before
  the first capture in an environment, or when output arrives as hex bytes.
- [Reading the output](references/reading-the-output.md) — the AT&T/Intel conversion table,
  the JDK 25 anatomy of a printed compilation, the optimisation-signal table, and the
  three-way null-check decision procedure. Read while interpreting a captured listing.
- [Pattern catalogue](references/pattern-catalogue.md) — the runtime's own code decoded on
  Temurin 25.0.3: entry barrier, safepoint polls, bounds check and uncommon trap, TLAB
  allocation, Serial/G1 card marks, lightweight and inflated locking, ZGC load and store
  barriers, compact-header offsets, and the release in which each shape changed. Read when a
  sequence in the listing is not the method's own logic.
