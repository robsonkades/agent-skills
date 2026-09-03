# hsdis setup and print flags

Everything marked "verified" was run on Temurin 25.0.3 (`25.0.3+9-LTS`, x86-64, Windows) —
messages are quoted exactly. hsdis itself was not installed on that host; claims about the
decoded output come from the JDK source (`src/utils/hsdis/README.md`,
`src/hotspot/share/compiler/disassembler.cpp`) and are marked as such.

## When assembly is the right level

| Question                                                      | Answer it with                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Which tier is the method in; does it get recompiled           | `-XX:+PrintCompilation` (tier column, `made not entrant: <reason>`)     |
| Did the hot call site inline, and if not, which limit refused | `-XX:+PrintInlining` on the tier-4 tree                                 |
| Did this allocation disappear                                 | Assembly plus allocation profile and compiler evidence                  |
| Where in the method the cycles go                             | JMH `-prof perfasm`, or a sampling profiler with `DebugNonSafepoints`   |
| Is the bounds check inside the loop or hoisted above it       | **Assembly**                                                            |
| Was the loop vectorised, and to which width                   | **Assembly** (lane-bearing opcode, register width and loop control)     |
| Is the lock taken on the fast path or inflated                | **Assembly** (lock-stack push vs `ObjectMonitor` CAS), then lock events |
| Which barrier did the GC emit around this store               | **Assembly**                                                            |
| Is the branch a `jCC` or a `cmov`; is the null check implicit | **Assembly**                                                            |

The first three are `compilation-and-inlining-logs`, allocation profiling and
`c2-sea-of-nodes`. A listing cannot directly show a removed operation: absence is useful
only after confirming inlining, compilation id, all normal and slow paths, and a matching
allocation profile. Open assembly for an instruction-level question after the level above
has been read.

## Building hsdis (JDK 18+ process)

hsdis is HotSpot's pluggable native disassembler. OpenJDK source supports building it, while
binary distributions vary: check the vendor image/package before building anything. The
binutils backend has distribution implications; OpenJDK's README says such a build may not
be distributable. Since JDK 18 (JDK-8275128), build it through the JDK's normal
`configure`/`make` flow from the checkout root:

```bash
git clone https://github.com/openjdk/jdk.git && cd jdk
bash configure --with-hsdis=capstone      # BSD-licensed backend; --with-capstone=<path>
                                          # if capstone is not where pkg-config finds it
make build-hsdis
make install-hsdis                        # copies the library into the JDK image this
                                          # tree builds — read the path it prints
```

Backends per the README: `--with-hsdis=capstone` (recommended), `--with-hsdis=llvm`
(`--with-llvm=<LLVM home>` when `llvm-config` is not on `PATH`; on Windows the LLVM DLLs must
be on `PATH` or in the JDK's `bin`), `--with-hsdis=binutils` (`--with-binutils-src=<dir>` or
`--with-binutils=<dir>`, `--with-binutils=system` on Linux; on Windows it needs a mingw
toolchain, not Visual Studio). `make BINUTILS=…` inside `src/utils/hsdis` is the pre-JDK 18
process and no longer exists.

## Where the JVM looks, and what it says

The file is `hsdis-<arch>.<suffix>`: `hsdis-amd64.so`, `hsdis-aarch64.so`, `hsdis-amd64.dll`,
`hsdis-aarch64.dylib` (`"hsdis-" HOTSPOT_LIB_ARCH JNI_LIB_SUFFIX` in `disassembler.cpp`).
Search order, from the same file:

```
1. <home>/lib/<vm>/libhsdis-<arch>.so   (compatibility name)
2. <home>/lib/<vm>/hsdis-<arch>.so      e.g. $JAVA_HOME/lib/server/hsdis-amd64.so
3. <home>/lib/hsdis-<arch>.so
4. hsdis-<arch>.so                      via the system library path (LD_LIBRARY_PATH, PATH)
```

`<vm>` is the directory that holds `libjvm`—commonly `server` in modern HotSpot images.
Install into the search location for the actual image, not a guessed global JDK. A native
plugin executes inside the JVM process: prefer a vendor artifact or reproducible build from
trusted source, verify architecture and dependency loading, and never copy an untrusted
binary into a production runtime. ABI/backend mismatch may fail loading or decoding; treat
any warning or malformed output as an invalid capture rather than trying to interpret it.

Success prints `Loaded disassembler from <path>` (source, not verified here). Failure,
verified on 25.0.3, is a single unified-logging line at the first method printed:

```
[0.024s][warning][os] Loading hsdis library failed
```

and the listing continues. This tested `PrintAssembly` run also announced a side effect:

```
OpenJDK 64-Bit Server VM warning: PrintAssembly is enabled; turning on DebugNonSafepoints to gain additional output
```

`DebugNonSafepoints` asks the compiler for additional debug mappings away from safepoints.
That improves source attribution but changes compilation metadata and can affect code-cache
footprint or compilation conditions. Use the same diagnostic flags in compared forks; do
not assume a diagnostic capture is bit-identical to the undecorated production run.

## What is printed without hsdis

The fallback is the **abstract disassembler** (JDK 13, JDK-8213084): nmethod framing,
HotSpot-supplied annotations and instruction bytes as hex words instead of decoded
mnemonics. Verified excerpt:

```
[MachCode]
[Verified Entry Point]
  # {method} {0x000001fc99400508} 'get' '([II)I' in 'JitLab'
  # parm0:    rdx:rdx   = '[I'
  # parm1:    r8        = int
  #           [sp+0x30]  (sp of caller)
  0x000001fc87bb1480: 8984 2400 | 80ff ff55 | 4883 ec20 | 4181 7f20 | 0100 0000 | 0f85 6800

  0x000001fc87bb14ac: ;   {poll_return}
  0x000001fc87bb14ac: 5d49 3b67 | 280f 8735 | 0000 00c3 | 488b ea44 | 8904 24ba | e4ff ffff

  0x000001fc87bb14c4: ;   {runtime_call UncommonTrapBlob}
  0x000001fc87bb14c4: 6666 90e8

  0x000001fc87bb14c8: ; ImmutableOopMap {rbp=Oop }
                      ;*iaload {reexecute=0 rethrow=0 return_oop=0}
                      ; - JitLab::get@2 (line 5)
```

What this can still answer: the section layout, argument registers, which bytecodes map to
which address range (`;*iaload … (line 5)`), and annotated relocations such as `{poll}`, `{poll_return}`,
`{runtime_call …}`, `{metadata(…)}`, `{oop(…)}`, ZGC `{barrier format=N}` — and therefore
whether an annotated safepoint poll, uncommon trap, runtime call or GC barrier relocation is
present. What it cannot answer reliably is decoded operand semantics—register allocation,
vector width, `cmov` versus branch, or placement of a compare relative to a loop.
Decoding the words by hand is possible for a few instructions and is how the catalogue in
`pattern-catalogue.md` was verified; it is not a workflow.

## The printers on a product JDK

| Flag                     | Class           | On a product JDK (verified 25.0.3)                                                                               |
| ------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `-XX:+PrintAssembly`     | `diagnostic`    | Works. hsdis mnemonics when the plugin loads, abstract hex listing when it does not                              |
| `-XX:+PrintOptoAssembly` | `C2 diagnostic` | Accepted but printed only the banner in this tested build; detailed printer code is excluded from product builds |
| `-XX:+PrintIdeal`        | `develop`       | Refused: `Error: VM option 'PrintIdeal' is develop and is available only in debug version of VM.`                |

For a normal product build, use `PrintAssembly` for machine code and verify behavior on the
exact vendor/version. Detailed C2 IR views generally require a `fastdebug` build
(`--with-debug-level=fastdebug`) and answer a different question. Do not transfer a flag
matrix or screenshot between JDK lines without checking `PrintFlagsFinal` and startup
behavior.

## Flag classes

`-XX:+PrintFlagsFinal` prints the class in braces; the unlock must precede the flag on the
command line. Verified on 25.0.3:

| Flag                                                                                                                                                                                                                                                                                               | Class           | Needs                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------- |
| `PrintAssembly`, `PrintAssemblyOptions`, `PrintNMethods`, `PrintNativeNMethods`, `PrintStubCode`, `PrintInterpreter`, `PrintSignatureHandlers`, `PrintAdapterHandlers`, `PrintInlining`, `CompilerDirectivesFile`, `CompilerDirectivesPrint`, `TraceDeoptimization`                                | `diagnostic`    | `-XX:+UnlockDiagnosticVMOptions`                         |
| `PrintOptoAssembly`, `PrintIntrinsics`                                                                                                                                                                                                                                                             | `C2 diagnostic` | the unlock, and a debug build to print anything          |
| `ImplicitNullChecks` (default `true`)                                                                                                                                                                                                                                                              | `pd diagnostic` | the unlock to turn it **off**                            |
| `UseObjectMonitorTable` (default `false`)                                                                                                                                                                                                                                                          | `diagnostic`    | the unlock                                               |
| `PrintCompilation`, `CompileCommandFile`, `UseSuperWord`, `LoopMaxUnroll`, `MaxVectorSize`, `UseCountedLoopSafepoints`, `ReduceInitialCardMarks`, `UseTLAB`, `LockingMode` (=`2`), `UseCompactObjectHeaders` (=`false`), `UseCompressedClassPointers`, `RangeCheckElimination`, `UseLoopPredicate` | `product`       | nothing                                                  |
| `UseAVX` (=`2` on the test host), `UseSSE`                                                                                                                                                                                                                                                         | `ARCH product`  | nothing; value is CPU-derived                            |
| `PrintIdeal`, `VerifyOops`, `PrintEscapeAnalysis`                                                                                                                                                                                                                                                  | `develop`       | a debug build — absent from `PrintFlagsFinal` on product |

Without the unlock, verified:

```
Error: VM option 'PrintAssembly' is diagnostic and must be enabled via -XX:+UnlockDiagnosticVMOptions.
Error: The unlock option must precede 'PrintAssembly'.
Improperly specified VM option 'PrintAssembly'
Error: Could not create the Java Virtual Machine.
```

## Scoping the capture

Global `PrintAssembly` prints the interpreter and stubs, every C1 compilation and every C2
one: `java -XX:+UnlockDiagnosticVMOptions -XX:+PrintAssembly -version` alone is 769 lines
on 25.0.3, and a one-method program with `print,JitLab::*` was 4,346. Scope to one method.
Which mechanisms need the unlock differs, and this is verified:

| Mechanism                                         | Unlock needed | Applies to                                                |
| ------------------------------------------------- | ------------- | --------------------------------------------------------- |
| `-XX:+PrintAssembly`                              | yes           | every compilation                                         |
| `-XX:CompileCommand=print,Class::method`          | **no**        | every tier's compilation of the match (C1 first, then C2) |
| `-XX:CompileCommandFile=file` with a `print` line | **no**        | same                                                      |
| `-XX:CompilerDirectivesFile=file.json`            | yes           | compilations matching the directive                       |
| `jcmd <PID> Compiler.directives_add file.json`    | **no**        | compilations that start **after** the directive is added  |

```bash
# One method, both tiers; confirm with "Compiled method (c2)" which listing is C2's
java -XX:CompileCommand=print,ClassName::methodName -jar app.jar
# prints: CompileCommand: print ClassName.methodName bool print = true

# Method in isolation (its callees are calls, not inlined bodies)
java -XX:CompileCommand=dontinline,ClassName::methodName \
     -XX:CompileCommand=print,ClassName::methodName -jar app.jar

# Intel syntax
java -XX:+UnlockDiagnosticVMOptions -XX:PrintAssemblyOptions=intel \
     -XX:CompileCommand=print,ClassName::methodName -jar app.jar
```

Live, on a JVM that was started without any diagnostic flag:

```bash
jcmd <PID> Compiler.directives_add directives.json   # "1 compiler directives added"
jcmd <PID> Compiler.directives_print                 # shows PrintAssembly:true on the c2 block
jcmd <PID> Compiler.directives_remove                # pops the last one; directives_clear drops all
```

```json
[{ "match": "com/myapp/Service.process(*)", "c2": { "PrintAssembly": true } }]
```

Three facts about the tested live path: the listing goes to the **JVM's
stdout**, not to the `jcmd` client; the directive matches only compilations that start
after it is added, so a method already compiled may print nothing until a later compilation;
and the `DebugNonSafepoints` warning is printed at
`directives_add` time (`c2: printing of assembly code is enabled; turning on
DebugNonSafepoints`). If the method is hot and stable, the honest options are a restart
with `CompileCommand=print`, or a `-prof perfasm` run on a benchmark that reproduces the
shape. Avoid changing compilation policy merely to simplify the listing: disabling tiered
compilation changes warmup and can change the generated code being investigated.

## PrintAssemblyOptions

`-XX:PrintAssemblyOptions=help` works with or without hsdis. HotSpot's own options,
verified on 25.0.3 with their defaults:

```
print-raw / print-raw-xml     test the plugin by requesting raw output
show-pc            ON         show-offset        OFF        show-bytes         OFF
show-data-hex      ON         show-data-int      OFF        show-data-float    OFF
show-structs       ON         show-comment       ON         show-block-comment ON
align-instr        ON
```

Anything else in the comma-separated list is passed to the plugin. `intel` (and, depending
on backend, `att`) are x86 decoder options; build-time
`--with-print-assembly-options=<value>` can also set a default. JMH adds
`-XX:PrintAssemblyOptions=intel` for `intelSyntax=true`. Availability and accepted spelling
therefore depend on the hsdis backend/build. Identify syntax from the actual notation rather
than assuming a universal default. `show-bytes` is useful when comparing decoded output to a
byte dump.

## perfasm

```bash
java -jar benchmarks.jar SumArrayBenchmark -prof perfasm
java -jar benchmarks.jar SumArrayBenchmark -prof perfasm:intelSyntax=true,saveLog=true
java -jar benchmarks.jar -prof perfasm:help
```

Do not pass `-jvmArgs="-XX:+UnlockDiagnosticVMOptions"`: `-jvmArgs` **replaces** the
benchmark's own `@Fork(jvmArgs…)`, and perfasm already adds what it needs. From
`AbstractPerfAsmProfiler` (JMH source): `-XX:+UnlockDiagnosticVMOptions -XX:+LogCompilation
-XX:LogFile=<tmp> -XX:+PrintAssembly`, plus `-XX:+PrintInterpreter` unless
`skipInterpreter=true`, plus `-XX:+PrintNMethods -XX:+PrintNativeNMethods
-XX:+PrintSignatureHandlers -XX:+PrintAdapterHandlers -XX:+PrintMethodHandleStubs
-XX:+PrintStubCode` unless `skipVMStubs=true`, and `-XX:PrintAssemblyOptions=intel` when
`intelSyntax=true`. Useful options: `hotThreshold` (default `0.10`, share of events a region
needs to be expanded), `top` (`20` regions), `printMargin` (`10` context lines),
`mergeMargin` (`32`), `saveLog=true` (keeps the annotated HotSpot log for reading offline —
the only way to read the whole method rather than the hot regions), `savePerf=true`,
`events=cycles,instructions` on Linux, `showCounts=raw|norm|percent_total`.

Output sections, in order: `Hottest code regions (>N% "cycles" events)` with one block per
region, then `Hottest Regions`, `Hottest Methods (after inlining)`, `Distribution by Source`
(compiled / interpreter / stubs / kernel / unknown). Read the region table before the
listing: a region tagged `<no assembly is recorded, native region>` or `… unknown region>`
means the time is in native code or in memory the parser could not map, not in a Java method.

Failure mode: JMH prints `ERROR: No address lines detected in assembly capture. Make sure
your JDK is properly configured to print generated assembly. The most probable cause for
this failure is that hsdis is not available, or resides at the wrong path within the JDK.`
when the HotSpot log carries no `0x…:` lines (source, not verified here). On a JDK 13+ that
falls back to the abstract disassembler the address lines exist, so the more likely
symptom is regions whose "assembly" is hex words — check for `Loading hsdis library failed`
in the saved log. `perfasm` is Linux `perf`; `xperfasm` is Windows ETW and `dtraceasm`
macOS; `jmh-advanced` owns the profiler matrix and the benchmark itself.

## Vector width on the host

```bash
java -XX:+PrintFlagsFinal -version | grep -E "UseAVX|MaxVectorSize|UseSuperWord"
```

| `UseAVX` | Highest AVX family HotSpot may use | What it permits, not guarantees                            |
| -------- | ---------------------------------- | ---------------------------------------------------------- |
| `0`      | no AVX-family generation           | legacy SSE may still use `xmm`                             |
| `1`      | AVX                                | VEX forms and eligible 256-bit floating-point operations   |
| `2`      | AVX2                               | eligible 256-bit integer operations and AVX2 features      |
| `3`      | AVX-512 family                     | eligible EVEX/`zmm` operations when CPU and policies allow |

`UseAVX` and `MaxVectorSize` set ceilings/policy; they do not prove that a loop uses that
width. The defaults are CPU- and build-derived, so a laptop capture says nothing about the
fleet. For a diagnostic A/B, `-XX:-UseSuperWord` disables that C2 auto-vectorisation pass,
but it does not make every operation scalar: intrinsics, library stubs and explicit Vector
API code can still contain vector instructions. `MaxVectorSize=16` caps eligible C2 vectors;
it does not guarantee `xmm` output. On AArch64, NEON/ASIMD commonly uses `v` registers;
optional SVE uses scalable `z` and predicate `p` registers. Verify port-specific flags on
the target build.

## Capture safety and reproducibility

- Prefer a canary, replica or production-shaped lab. Assembly output can be large, enables
  diagnostics and is written to process output unless redirected by the harness.
- Bound duration and log volume; verify that container logging, disk and stdout backpressure
  cannot destabilize the service.
- Record `java -version`, `-Xlog:flags=info` or the relevant `PrintFlagsFinal` subset, CPU
  model/features, GC, command line, benchmark commit and hsdis backend/build provenance.
- Treat absolute addresses, object metadata, symbol names and paths as operational data;
  follow the same access/retention controls as profiles and crash artifacts.

## Primary references

- [OpenJDK hsdis README](https://github.com/openjdk/jdk/blob/master/src/utils/hsdis/README.md)
- [HotSpot disassembler implementation](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/compiler/disassembler.cpp)
- [HotSpot compiler directives reference](https://docs.oracle.com/en/java/javase/25/vm/compiler-control.html)
- [JMH perfasm implementation](https://github.com/openjdk/jmh/blob/master/jmh-core/src/main/java/org/openjdk/jmh/profile/AbstractPerfAsmProfiler.java)
- [JDK-8275128: build hsdis using the normal build system](https://bugs.openjdk.org/browse/JDK-8275128)
