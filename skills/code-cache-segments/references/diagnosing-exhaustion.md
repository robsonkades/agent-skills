# Diagnosing per-segment exhaustion

## Read all three CodeHeap lines

```
jcmd <pid> Compiler.codecache

CodeHeap 'non-profiled nmethods': size=119168Kb used=54732Kb  max_used=54732Kb  free=64436Kb
 bounds [0x00007f1a10000000, 0x00007f1a10358000, 0x00007f1a17420000]
CodeHeap 'profiled nmethods':     size=119168Kb used=118940Kb max_used=118940Kb free=228Kb
 bounds [0x00007f1a17420000, 0x00007f1a17690000, 0x00007f1a1e880000]
CodeHeap 'non-nmethods':          size=7488Kb  used=3102Kb   max_used=3102Kb   free=4386Kb
 bounds [0x00007f1a1e880000, 0x00007f1a1eb90000, 0x00007f1a1f2d0000]
CodeCache: size=245824Kb, used=176774Kb, max_used=176774Kb, free=69050Kb
 total_blobs=8214, nmethods=6890, adapters=411, full_count=0
Compilation: enabled, stopped_count=0, restarted_count=0
```

The consolidated line is 176774/245824, about 71.9% — unremarkable. `profiled nmethods` is
118940/119168, about 99.8% — exhausted — while `non-profiled` sits at under half. The JIT has
stopped promoting new methods into C1-with-profiling, the steady stream of new call patterns
stays interpreted, and CPU rises because interpreting costs an order of magnitude more than
running C1 code.

`Compilation: enabled` versus `disabled` is the single most direct line in the output. Read it
every time.

Three separate diagnoses hide behind "the code cache": one segment exhausted while the
aggregate looks fine, the cache genuinely full (a binary event with a log message), and
sustained pressure on one segment (gradual degradation with no message at all).

## jstat -compiler

```bash
jstat -compiler <pid>
```

```
Compiled Bailout  Invalid   Time   FailedType FailedMethod
    6431        7        2    18.42          1  java.util.regex.Pattern compile
```

| Column                        | Meaning                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Compiled`                    | Compilation tasks completed successfully since process start                                                                                    |
| `Bailout`                     | Compilations the compiler abandoned without producing code — method too large, an unsupported construct for that tier, or an internal heuristic |
| `Invalid`                     | Compilations invalidated after the fact — the second-order effect of deoptimisation                                                             |
| `Time`                        | Cumulative seconds spent compiling                                                                                                              |
| `FailedType` / `FailedMethod` | Tier and identity of the last bailout                                                                                                           |

There is no `Failed` column; the recurring misnaming comes from out-of-date material. A steadily
rising `Bailout` with a constant `FailedMethod` means that method is repeatedly submitted and
abandoned before producing code. It is not deoptimisation (that would be `Invalid`) and it is
not code cache pressure — a bailout allocates nothing in the CodeHeap. The method stays
interpreted for that tier, burning interpreter CPU, which is the lead to follow.

## Logging

```bash
java -Xlog:codecache=info:file=cc.log:time,uptime -jar app.jar

# The source of truth for subtags on your build
java -Xlog:help 2>&1 | grep -i codecache
```

Do not assume a subtag name by analogy with older material. Running the help query once is
cheaper than discovering mid-incident that a remembered tag does not exist.

## JFR events

| Event                        | Kind                   | Use                                                                                                                |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `jdk.CodeCacheStatistics`    | Periodic               | Time series of usage by `codeBlobType` — the continuous, low-overhead equivalent of reading the three `jcmd` lines |
| `jdk.CodeCacheFull`          | Point                  | Fires when one specific segment is exhausted; the event's `codeBlobType` names which                               |
| `jdk.CodeCacheConfiguration` | Once, at start         | The real ergonomic sizes per segment, and therefore whether `SegmentedCodeCache` ended up on or off                |
| `jdk.Compilation`            | Point, per compilation | Correlates CPU peaks with the tier being compiled                                                                  |

```bash
jcmd <pid> JFR.start settings=profile duration=300s filename=codecache.jfr
jfr print --events jdk.CodeCacheStatistics,jdk.CodeCacheFull,jdk.CodeCacheConfiguration codecache.jfr
```

## Continuous metrics

```
jvm_memory_used_bytes{area="nonheap", id="CodeHeap 'profiled nmethods'"}
jvm_memory_used_bytes{area="nonheap", id="CodeHeap 'non-profiled nmethods'"}
jvm_memory_used_bytes{area="nonheap", id="CodeHeap 'non-nmethods'"}
jvm_memory_max_bytes{area="nonheap",  id="CodeHeap 'profiled nmethods'"}
```

Micrometer and standard JMX already split these by `CodeHeap`. The granularity arrives free in
any Spring Boot Actuator stack; the failure is a dashboard summing the three series into one
"Code Cache total" line and discarding it.

## Internal versus external fragmentation

Every allocation occupies a whole number of allocation segments
(`-XX:CodeCacheSegmentSize`; read its default with `-XX:+PrintFlagsFinal` rather than quoting
one).

|                                 | Internal                                                                     | External                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Where the waste lives           | Inside an allocated block, between the code and the rounded segment boundary | Between allocated blocks, in non-contiguous free gaps                              |
| Cause                           | Allocation always rounds up                                                  | Variable-sized blocks freed in an order unrelated to size                          |
| Visible in `Compiler.codecache` | No — it adds to `used`                                                       | No — it adds to `free`, and the command never reports the largest contiguous block |
| Grows with                      | Number of small allocations (many trivial methods)                           | Repeated compile / deoptimise / sweep cycles over time                             |
| Mitigation                      | Little; it is the fixed cost of block allocation                             | Generous `ReservedCodeCacheSize`; in the worst churn cases, scheduled restart      |

```
CodeHeap 'non-profiled nmethods'

[ nmethod A ][ FREE 12 ][ nmethod B ][ FREE 3 ][ nmethod C ][ FREE 40 ]
   40 seg                  55 seg                 20 seg

aggregate free       = 12 + 3 + 40 = 55 segments
largest contiguous   = 40 segments

An allocation of 45 segments FAILS: not for lack of aggregate space, but
because no single block reaches 45. Compiler.codecache reports free=55 and
cannot distinguish this from one contiguous 55-segment block.
```

The allocator coalesces adjacent free blocks when it can, which mitigates but does not
eliminate this, since the order of freeing rarely puts free neighbours side by side. A heap
that receives 10,000 allocations and frees none does not fragment; it simply fills.

## Triage checklist

- [ ] All three `CodeHeap` lines read, plus the `Compilation:` line
- [ ] Segmentation confirmed on (three named heaps), or the ergonomic fallback recognised
- [ ] `jstat -compiler` recorded as part of the incident baseline
- [ ] Sampled at three points 30-60s apart, to separate stable exhaustion from thrashing
- [ ] Tier mix cross-referenced from `PrintCompilation` or `jdk.Compilation`
- [ ] Deoptimisation events cross-referenced when `non-profiled` is the pressured segment
- [ ] Any manual segment sizing checked to sum within `ReservedCodeCacheSize` before deploy
- [ ] After the fix: pressured segment stable under ~80% at the same load, and `Compilation:`
      still `enabled` across a sustained window
- [ ] If the fix was a restart, recorded explicitly as fragmentation mitigation, not a cure
