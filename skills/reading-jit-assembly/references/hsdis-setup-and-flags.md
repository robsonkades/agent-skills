# hsdis setup and print flags

## Building hsdis (JDK 21+ process)

hsdis is the HotSpot disassembler plugin. Without it `PrintAssembly` emits addresses and hex
bytes only — no mnemonics, no error. It is not shipped with any JDK, and no Linux
distribution `-devel` package contains it; the licensing history of the decoder backends is
why. Building from source is the supported path on every platform.

```bash
git clone https://github.com/openjdk/jdk.git
cd jdk

# From the ROOT of the checkout — not from src/utils/hsdis
bash configure --with-hsdis=capstone   # recommended since JDK 21: BSD-licensed,
                                       # no separate binutils installation
make build-hsdis
make install-hsdis                     # prints the path it installed to — read it
```

Alternative backends: `--with-hsdis=binutils` (GPL, needs the system `binutils-dev`) and
`--with-hsdis=llvm`. Platform troubleshooting lives in `src/utils/hsdis/README.md` in the
same checkout.

To use the plugin with an already-installed JDK (a downloaded Temurin, say), copy the built
library into that installation's native library directory — `$JAVA_HOME/lib/server/` on
Linux, the equivalent elsewhere. The local build is still required; there is no official
prebuilt package. Unofficial third-party builds exist and are fine for a one-off experiment,
but their provenance is not verifiable.

Verification — **both** flags are required, or the JVM refuses to start and never reaches the
point of testing whether hsdis is present:

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintAssembly -version 2>&1 | head -5
```

## The three printers

| Flag                     | Stage shown                                        | Via hsdis | Needs a debug build         |
| ------------------------ | -------------------------------------------------- | --------- | --------------------------- |
| `-XX:+PrintIdeal`        | Sea of Nodes IR, before instruction selection      | No        | **Yes** — `develop` flag    |
| `-XX:+PrintOptoAssembly` | C2 IR after instruction selection, C2's own format | No        | No — `product`+`diagnostic` |
| `-XX:+PrintAssembly`     | Final native code, decoded byte by byte            | Yes       | No — `diagnostic`           |

A JDK downloaded from any public distribution is a `product` build. `PrintAssembly` and
`PrintOptoAssembly` both work there with `UnlockDiagnosticVMOptions`; `PrintIdeal` is not even
recognised, because its implementation is compiled out of the product binary
(`c2_globals.hpp` declares it `develop`). Using it means building OpenJDK with
`--with-debug-level=fastdebug`.

`PrintOptoAssembly` still uses C2's internal node nomenclature, not real mnemonics — it is a
compiler-debugging view, not an application-reading one.

## Scoping the capture

```bash
# One method
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintAssembly \
     -XX:CompileCommand=print,ClassName::methodName -jar app.jar

# Via a directives file
echo "print HotMethod::compute" > compile_commands.txt
java -XX:CompileCommandFile=compile_commands.txt -jar app.jar

# See a method in isolation
java -XX:CompileCommand=dontinline,HotMethod::compute -jar app.jar

# C2 directly, no tiering (CompileThreshold is only honoured with tiering off)
java -XX:-TieredCompilation -jar app.jar

# Intel syntax instead of the AT&T default
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintAssembly \
     -XX:PrintAssemblyOptions=intel -jar app.jar
```

Options accepted by `PrintAssemblyOptions` are passed through fairly raw to the decoding
backend and vary between `capstone` and `binutils` and between versions. `intel` is the
stable, widely documented one; use `PrintAssemblyOptions=help`, where the build supports it,
before relying on any other option name.

Attaching to a running JVM, scoped to one match, without restarting it:

```bash
jcmd <PID> Compiler.directives_add directives.json
jcmd <PID> Compiler.directives_clear
```

```json
[
  {
    "match": "com/myapp/Service.process(*)",
    "c2": { "PrintAssembly": true }
  }
]
```

## perfasm

```bash
java -jar benchmarks.jar SumArrayBenchmark -prof perfasm \
     -jvmArgs="-XX:+UnlockDiagnosticVMOptions"
```

`perfasm` (Linux) merges the JIT's assembly with `perf` samples and reports how many samples
landed on each instruction. It is the only reliable way to know **where** time is spent
rather than inferring it from reading the code.

## Vector width on the host

```bash
java -XX:+PrintFlagsFinal -version | grep UseAVX
```

| `UseAVX` | Instruction set | Register | Width   | Note                                            |
| -------- | --------------- | -------- | ------- | ----------------------------------------------- |
| `0`      | SSE2            | `xmm`    | 128-bit | Baseline on all x86-64                          |
| `1`      | AVX             | `ymm`    | 256-bit | **Floating point only** — integer stays on SSE2 |
| `2`      | AVX2            | `ymm`    | 256-bit | Integer included; `gather` available            |
| `3`      | AVX-512         | `zmm`    | 512-bit | Not every AVX2-capable CPU has it               |

The default is derived from the detected CPU, not fixed by the JDK. For A/B comparison:
`-XX:-UseSuperWord` forces scalar code (auto-vectorisation defaults to on), and
`-XX:LoopMaxUnroll=16` permits more unrolling.
