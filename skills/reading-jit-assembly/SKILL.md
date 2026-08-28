---
name: reading-jit-assembly
description: >
  Reading the machine code HotSpot actually emitted: installing hsdis, driving
  -XX:+PrintAssembly and JMH perfasm, telling the verified entry point and prologue from the
  method body, and confirming or refuting a hypothesis about an optimisation from the
  instructions themselves. Use when a claim about an optimisation needs proof at the
  instruction level, when PrintAssembly prints hex bytes instead of mnemonics, when a
  command fails because UnlockDiagnosticVMOptions is missing, when a load has no cmp/test
  before it and someone concludes the null check was eliminated, when an assembly excerpt
  from a blog is in the other operand order, or when unexplained runtime calls appear
  between the expected logic. Does not cover the compiler phases that produced the code
  (c2-sea-of-nodes), what the compiler decided to inline or compile
  (compilation-and-inlining-logs), vectorisation as a subject (simd-and-vector-api), or
  benchmark construction (jmh-advanced).
---

# Reading JIT Assembly

## Purpose

Turn a belief about an optimisation into evidence. The failure this skill prevents is the
confident wrong reading: an excerpt captured in AT&T syntax but interpreted with Intel
operand order, so source and destination are inverted in every two-operand instruction —
which produces no crash and no exception, only a wrong conclusion that then drives a code
change.

Reading assembly answers **what the code does**. It does not answer where time is spent;
only sampling correlated to instructions (`perfasm`) does that. Keep the two questions
apart, and never conclude from a static reading alone that an instruction is the
bottleneck.

## Workflow

1. **Verify hsdis is actually loaded** before trusting any output. Run
   `java -XX:+UnlockDiagnosticVMOptions -XX:+PrintAssembly -version 2>&1 | head -5`.
   Without the plugin, the JVM does **not** fail — it prints addresses and hex bytes with
   no mnemonics, which is easy to miss.
2. **Narrow the capture to one method** with `-XX:CompileCommand=print,Class::method`, a
   `CompileCommandFile`, or a live `jcmd <PID> Compiler.directives_add`. Global
   `PrintAssembly` is unreadable.
3. **Confirm the tier and the build.** `Compiled method (c2)` at tier 4 is the final
   optimised code; tiers 1–3 are C1 and prove nothing about C2's output. A debug/fastdebug
   build inflates the listing with `VerifyOops` calls that do not exist in production.
4. **Confirm the syntax convention before reading a single operand.** hsdis prints AT&T by
   default (`src, dst`); Intel (`dst, src`) only appears with
   `-XX:PrintAssemblyOptions=intel`. Third-party material is usually Intel.
5. **Locate the structure before interpreting instructions.** Find `[Verified Entry Point]`
   (stack banging, `push %rbp`, `sub $imm,%rsp` — frame setup) and `[Code]` (the body).
   Read the `# parm0:` / `# parmN:` header comments for where arguments actually landed;
   Java-to-Java calls do not use the System V C convention.
6. **Classify each finding against the signal table**, and for a load with no visible
   `cmp`/`test`, use the three-way null-check test — explicit, implicit, or eliminated.
   See `references/reading-the-output.md`.
7. **Correlate with `perfasm` before naming a bottleneck**, and confirm any cycle-cost
   claim with `perf stat -e branch-misses,cycles` on the real host.

## Rules

- Never run `-XX:+PrintAssembly` (or `PrintOptoAssembly`) without
  `-XX:+UnlockDiagnosticVMOptions`. The JVM refuses the diagnostic flag and the process
  fails to start — it never gets far enough to tell you whether hsdis is installed.
- State the syntax convention of every excerpt you quote or read. In AT&T the destination
  is the **last** operand: `mov 0x8(%rbx),%eax` writes into `eax`.
- Absence of `cmp`/`test` before a load is **not** proof the JIT proved non-nullity. Three
  cases share that appearance; the `; implicit exception` comment is the discriminator, and
  the implicit path (`-XX:+ImplicitNullChecks`, default `true`) is the common one for
  references arriving from outside the method.
- Attribute comments correctly: hsdis produces mnemonics only. Every annotation
  (`; implicit exception`, `; {poll}`, symbolic method references) comes from HotSpot's own
  printer walking the nmethod's relocations, not from the decoder.
- Unexplained runtime calls interleaved with recognisable logic are almost always
  `VerifyOops`. It is a `develop` flag: it exists only in debug/fastdebug builds, never in
  a Temurin or Oracle product JDK. Never compare instruction counts across build types.
- `PrintIdeal` is `develop` and does not exist in a product JDK. `PrintOptoAssembly`, which
  looks like its sibling, is `product`+`diagnostic` and works anywhere with
  `UnlockDiagnosticVMOptions`. Do not treat them as a pair.
- Build hsdis with `bash configure --with-hsdis=capstone` from the **root** of the JDK
  checkout. `make BINUTILS=...` inside `src/utils/hsdis` has not been the process since the
  JDK 21 rewrite, and no Linux distribution `-devel` package ships hsdis.
- `UseAVX=1` already uses 256-bit `ymm`; its real restriction is that it is floating-point
  only — integer stays on SSE2 until `UseAVX=2`. Confirm the host's actual value with
  `-XX:+PrintFlagsFinal | grep UseAVX` before expecting a vector width.
- Quote misprediction and safepoint-poll costs as order of magnitude, never as a constant.
  Measure with `perf stat` if a decision depends on the number.
- A safepoint poll (`test %reg,offset(%rip)`) in every loop and every method return is
  expected structure, not a defect. Do not report it as overhead.
- Cite `psy-lob-saw.blogspot.com` for Nitsan Wakart's material (it is a blog, not a book),
  and `github.com/AdoptOpenJDK/jitwatch` for JITWatch.

## References

- [hsdis setup and print flags](references/hsdis-setup-and-flags.md) — the current build
  recipe, the flag matrix for the three printers, method-scoped compile commands and live
  directives, and the perfasm invocation. Read before the first capture in an environment,
  or when output arrives as hex bytes without mnemonics.
- [Reading the output](references/reading-the-output.md) — the AT&T/Intel conversion table,
  the anatomy of a printed compilation, the optimisation-signal table, and the three-way
  null-check decision procedure. Read while interpreting a captured listing.
