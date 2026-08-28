# Profilers, hsdis and the command line

## Command line anatomy

```bash
java -jar benchmarks.jar ".*HashMap.*" \
    -f 3 -wi 5 -i 10 \
    -bm avgt -tu us \
    -rf json -rff results.json
```

| Flag         | Meaning                                       | Default when omitted                  |
| ------------ | --------------------------------------------- | ------------------------------------- |
| `-f`         | number of forks                               | `Defaults.MEASUREMENT_FORKS` = 5      |
| `-wi`        | warmup iterations                             | `Defaults.WARMUP_ITERATIONS` = 5      |
| `-i`         | measurement iterations                        | `Defaults.MEASUREMENT_ITERATIONS` = 5 |
| `-bm`        | mode: `thrpt`, `avgt`, `sample`, `ss`, `all`  | whatever `@BenchmarkMode` declares    |
| `-tu`        | output time unit                              | whatever `@OutputTimeUnit` declares   |
| `-rf`/`-rff` | exported result format and file               | none — stdout only                    |
| `-jvm`       | path to an alternative `java` binary          | the JVM running the harness           |
| `-v EXTRA`   | verbose output, prints `Score ±(99.9%) Error` | normal                                |

## Reading the standard output

```
Benchmark                 (size)  Mode  Cnt    Score    Error  Units
MyBench.binarySearch          10  avgt    5    0.042 ±  0.003  us/op
MyBench.binarySearch         100  avgt    5    0.089 ±  0.011  us/op
MyBench.binarySearch        1000  avgt    5    0.142 ±  0.009  us/op
MyBench.binarySearch       10000  avgt    5    0.198 ±  0.017  us/op
                                                │        │
                                                │        └─ 99.9% Student's-t CI
                                                └─ mean across forks and iterations
```

(Illustrative numbers — run the benchmark to get real ones.)

`Cnt` is the number of aggregated samples (iterations × forks) behind `Score` and `Error`.
The `(size)` column is the `@Param` value; each row is one combination, never an average
across them.

Check the shape before accepting the value: here a 1000× growth in `size` produces roughly
1.7× the time, which is consistent with the logarithmic complexity binary search should
have. A number that does not match its analytical expectation is a finding, not a result.

## The `-prof` catalogue

| Profiler   | Platform                       | What it shows                                                                       | Prerequisite                                                                     |
| ---------- | ------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `gc`       | any                            | allocation and GC activity normalised per operation                                 | none                                                                             |
| `stack`    | any                            | simple stack sampling from JMH's own sampler — not a replacement for async-profiler | none                                                                             |
| `perfnorm` | Linux                          | hardware counters per operation (`cycles/op`, `instructions/op`, `cache-misses/op`) | Linux `perf` installed, `perf_event_paranoid` permissive                         |
| `perfasm`  | Linux, macOS                   | JIT-emitted assembly annotated with per-instruction execution frequency             | hsdis for the architecture and JDK in use                                        |
| `xperfasm` | **Windows**                    | the functional equivalent of `perfasm`, sampling through ETW/Xperf                  | hsdis plus the Windows Performance Toolkit                                       |
| `jfr`      | any                            | writes a `.jfr` during the run for later analysis                                   | none — JFR ships with the JDK                                                    |
| `async`    | Linux, macOS (partial Windows) | async-profiler wired into JMH's warmup/measurement cycle — CPU, alloc or lock       | async-profiler JAR and native library on the classpath; **not bundled with JMH** |

`xperfasm` is not "perfasm with more detail". It exists because `perf_events` does not
exist on Windows. Running it on a Linux server fails for lack of Xperf/ETW.

Check availability before committing to a twenty-minute measurement:

```bash
java -jar benchmarks.jar -prof list
```

## hsdis

`perfasm`, `xperfasm` and the JVM's own `-XX:+PrintAssembly` all depend on the HotSpot
disassembler plugin, which translates JIT-emitted machine code into readable assembly. It
does not ship with the JDK, for licensing reasons — it depends on binutils.

The source lives in the OpenJDK repository itself:

```
https://github.com/openjdk/jdk/tree/master/src/utils/hsdis
```

It is **not** in `AdoptOpenJDK/jitwatch`; that reference circulates in outdated material
and points at a repository which does not contain the code.

Build per that directory's README, against a binutils toolchain matching the target
architecture and the exact JDK version. Building against the wrong one produces a library
that loads and then emits unreadable assembly or fails silently. Place the resulting
`hsdis-<arch>.so`/`.dll`/`.dylib` where the JVM finds it — typically the library directory
of the JDK running the benchmark.

The failure mode to watch for: without a working hsdis, `perfasm` does not abort the
benchmark. The numeric result still prints, just without annotation, which is easy to miss.

## Triaging annotated assembly

Three patterns carry most of the diagnostic value when scanning `perfasm`/`xperfasm`
output, before any deeper reading:

- `xmm`/`ymm` registers — automatic vectorisation (SIMD) happened.
- An unexpected `call` inside a hot loop that should have been fully inlined.
- CAS instructions (`lock cmpxchg` on x86-64) revealing implicit synchronisation — a
  monitor or an `AtomicX` — that the source does not make obvious.

The frequency annotation beside each instruction localises time inside the compiled
method at a granularity no stack sampler offers.

## CI export

```bash
java -jar benchmarks.jar -rf json -rff results.json
```

Exporting JSON and comparing against a stored baseline is the raw material for a
regression gate. The gate's design — statistical tolerance, what fails the build, how the
baseline is versioned — is a separate concern.
