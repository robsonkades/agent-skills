# The PrintCompilation format

```bash
java -XX:+PrintCompilation -jar app.jar                      # product flag, writes to stdout
java -Xlog:jit+compilation:file=jit.log -jar app.jar         # same lines through unified logging
```

Every line quoted here was produced on Temurin 25.0.3; the format is `CompileTask::print_impl`
in `compileTask.cpp`. Re-run a small lab on the runtime you are reading before a script
depends on a column.

## The columns

```
timestamp   compile_id   flags   tier   Class::method (bytes)   [status]
```

| #   | Column                  | Meaning                                                                                                          |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | `timestamp`             | Milliseconds since JVM start, **unpadded** — the column widens after 10 s, 100 s, and so on                      |
| 2   | `compile_id`            | Sequential task id, `%4d` — widens past four digits on any JVM that compiles more than 9999 methods              |
| 3   | `flags`                 | **Five fixed character positions**, each a space when it does not apply; the field emits no token when all blank |
| 4   | `tier`                  | `0` to `4` (`0` is a native wrapper); `-` when unknown; **the column is absent** under `-XX:-TieredCompilation`  |
| 5   | `Class::method (bytes)` | `@ N` before the size marks OSR at bci N; a native wrapper prints `(native)` instead of a byte count             |
| 6   | status                  | Only when applicable: `made not entrant: <reason>`, `COMPILE SKIPPED: <reason>`, `(static)` on a native wrapper  |

Real lines from one run:

```
50   17       3       Lab::hot (44 bytes)
54   36       4       Lab::hot (44 bytes)
56   17       3       Lab::hot (44 bytes)   made not entrant: not used
50   21  s    3       Lab::sync (4 bytes)
50   25   !   3       Lab::handler (8 bytes)
49   16     n 0       java.lang.System::arraycopy (native)   (static)
62   38 %     3       Lab::main @ 68 (296 bytes)
65   40 %     4       Lab::main @ 68 (296 bytes)
68   38 %     3       Lab::main @ 68 (296 bytes)   made not entrant: OSR invalidation of lower level
220   40 %     4       Lab::main @ 68 (296 bytes)   made not entrant: uncommon trap
```

The first three lines show one common tiered path in this run: tier 3 compiled as task 17,
tier 4 as task 36, then the tier-3 code retired. They are not the only legal path: trivial,
profiling, queue-pressure, OSR, failure, and policy decisions can use other tier sequences. A
status line repeats the **original** compile id and tier of the code being retired, not the id
of its replacement.

## The five flag positions

| Position | Character | Meaning                                                                        |
| -------- | --------- | ------------------------------------------------------------------------------ |
| 1        | `%`       | OSR — entry is mid-method, at the `@ bci` printed after the name               |
| 2        | `s`       | `synchronized` method                                                          |
| 3        | `!`       | Method has an exception handler                                                |
| 4        | `b`       | Blocking (synchronous) compilation — `-Xbatch`, or `BackgroundCompilation` off |
| 5        | `n`       | Native method wrapper (JNI); always tier `0` and `(native)`                    |

Several can be set at once (`% !` is an OSR compilation of a method with a handler). None of
them is the tier, and the tier is never encoded in them.

## Status suffixes on JDK 25

| Suffix                                                                      | Meaning                                                                                                 | Worth a look?      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------ |
| `made not entrant: not used`                                                | Often a higher tier replaced this code; confirm the successor compilation                               | Usually low signal |
| `made not entrant: OSR invalidation of lower level`                         | Often retirement of lower-level OSR code; confirm the successor                                         | Usually low signal |
| `made not entrant: uncommon trap`                                           | A speculation failed; recurring on one method is a deoptimisation loop                                  | Yes                |
| `made not entrant: marked for deoptimization`                               | Invalidated from outside — class loading broke a dependency, `RedefineClasses`, a directive             | Yes                |
| `COMPILE SKIPPED: <reason> (retry at different tier)`                       | That compilation bailed out and policy may retry at another tier                                        | Yes                |
| `made not compilable on level N  C::m (bytes)   excluded by CompileCommand` | `exclude` from a `CompileCommand` or a directive; printed once per level, with `### Excluding compile:` | Yes, deliberately  |

The text after `made not entrant:` is whatever the caller passes to
`nmethod::make_not_entrant` (`nmethod.cpp`); the four above are the ones a production log
shows. Older releases print `made not entrant` with no reason (not verified here).

**`made zombie` no longer exists.** The sweeper thread and the zombie state were removed in
JDK 20 (JDK-8290025); a not-entrant nmethod is unloaded by the GC once no frame references it.
A runbook that greps for `made zombie` finds nothing on JDK 20+, while the term remains
relevant to older lines such as JDK 17. What that changed for code-cache reclamation belongs to
`code-cache-segments`.

A bailout followed by tier 1, from a run with `-XX:MaxNodeLimit=1000`:

```
25   31       4       Lab::big (1015 bytes)
25   31       4       Lab::big (1015 bytes)   COMPILE SKIPPED: out of nodes parsing method (retry at different tier)
25   34       1       Lab::big (1015 bytes)
```

Tier 1 is C1 without profiling. In this run it followed a failed C2 compilation because the
policy requested a retry at a different tier; whether a later C2 attempt occurs depends on the
failure and policy state. The same failure can appear as `jdk.CompilationFailure` in JFR
(`failureMessage = "out of nodes parsing method"`). Diagnosing _why_ a method keeps cycling through
`uncommon trap` belongs to `deoptimization`; here the suffix is just the sixth column.

## The unified-logging form

```
[0.026s][info][jit,compilation]   19       3       Lab::medium (86 bytes)
[0.026s][info][jit,compilation]   31       4       Lab::medium (86 bytes)
[0.026s][info][jit,compilation]   19       3       Lab::medium (86 bytes)   made not entrant: not used
```

`-Xlog:jit+compilation` prints through `CompileTask::print_ul` at **info** level in the short
form: **no timestamp column** — the `uptime` decoration replaces it — and otherwise the same
fields, including the status suffixes. `debug` and `trace` add nothing for this tag set, and
`jit*` adds only two `jit,thread` lines. Plain `-Xlog:jit` selects nothing:

```
[0.004s][warning][logging] No tag set matches selection: jit. Did you mean any of the following? jit* jit+thread jit+inlining jit+compilation
```

What the unified form buys in production is a file sink with rotation, and a switch that
does not need a restart:

```bash
-Xlog:jit+compilation:file=/var/log/app/jit.log:uptime,tags:filecount=5,filesize=20m
jcmd <pid> VM.log what=jit+compilation output=/var/log/app/jit.log    # enable on a live JVM
jcmd <pid> VM.log what=jit+compilation=off output=/var/log/app/jit.log
```

Rotation and decoration syntax is `unified-logging`'s subject. `PrintCompilation` itself is not
a manageable flag and cannot be switched on after start-up.

## Without tiered compilation

Under `-XX:-TieredCompilation` the tier column is not printed at all — the condition is
literally `if (TieredCompilation)` in `print_impl`:

```
31    9             Lab::hot (44 bytes)
34   13  s          Lab::sync (4 bytes)
36   14 %           Lab::main @ 68 (296 bytes)
202    9             Lab::hot (44 bytes)   made not entrant: uncommon trap
```

On this server HotSpot build, ordinary Java compilation is C2, so there are no levels to report.
Compiler-only builds, JVMCI selection, and vendor runtimes must be identified separately.
Expecting a tier column here, or expecting the flags to encode the tier under the default, are
the two symmetric misreadings.

## Filtering without breaking

Field-index filtering is wrong for most lines, because a blank flag field emits no token:

```bash
awk '$4 == 4' jit.txt | wc -l                                  # 6  — only lines with exactly one flag
grep -cE '^ *[0-9]+ +[0-9]+ [ %s!bn]{5} 4 ' jit.txt           # 21 — every tier-4 line
```

The structural pattern follows the printf format — timestamp, spaces, id, one space, five
flag characters, one space, the tier — and survives a five-digit id and an eight-digit
timestamp (checked with a synthetic line). Portable extraction into tab-separated fields:

```bash
# timestamp \t id \t [flags] \t tier \t rest
sed -E 's/^ *([0-9]+) +([0-9]+) (.....) ([0-9-]) +(.*)$/\1\t\2\t[\3]\t\4\t\5/' jit.txt \
  | awk -F'\t' '$4 == 4 && $5 ~ /com\.myapp/'

# Tier-4 lines in the unified-logging form
grep -E '\]\[jit,compilation\] +[0-9]+ [ %s!bn]{5} 4 ' jit.log

# Invalidations worth reading
grep -E 'made not entrant: (uncommon trap|marked for deoptimization)|COMPILE SKIPPED' jit.txt
```

An extraction command that has never been run against real output is a hypothesis, and an
empty result from one is indistinguishable from "nothing happened". Under load, lines from
several compiler threads interleave; a `### Excluding compile:` banner was split by another
line mid-word in the lab run, so never assume two related lines are adjacent.

## What tier is it in right now

No start-up flag is needed to answer "did this method reach tier 4" on a live JVM:

```bash
jcmd <pid> Compiler.codelist | grep 'com.myapp.Service.process'
```

```
35 4 0 Lab.hot(I[LLab$Shape;)I [0x0000018f431c2888, 0x0000018f431c2980 - 0x0000018f431c2de0]
17 3 1 Lab.hot(I[LLab$Shape;)I [0x0000018f3b612588, 0x0000018f3b612680 - 0x0000018f3b612a90]
```

Columns are compile id, tier, state (`0` in use, `1` not entrant), the method in descriptor
form — `Class.method(descriptor)`, **not** `Class::method` — and code addresses. A method with
only a live tier-3 entry has no listed tier-4 nmethod. No entry means “no currently listed
nmethod”, not necessarily “ordinary Java bytecode is interpreted”: the method may be uninvoked,
native, intrinsic, excluded, unloaded, or retired. The command is documented as medium impact;
use it as a one-off rather than a poll.

Adjacent one-line answers:

```bash
jstat -compiler <pid>          # Compiled Failed Invalid Time FailedType FailedMethod
jcmd <pid> Compiler.queue      # what is waiting — a long C2 queue explains tier 2 and "stuck at 3"
jcmd <pid> Compiler.codecache  # occupancy per code heap
```

## Why is it stuck at tier 3

`-XX:+PrintTieredEvents` (product on the examined JDK 25 build) prints tier-policy events and
the counters they saw:

```
0.027817: [call level=3 [Lab.hot(I[LLab$Shape;)I] @-1 queues=0,0 rate=12.800000 k=1.00,1.00 total=1280,0 mdo=1024(0),0(0) max levels=3,0 compilable=c1,c1-osr,c2,c2-osr status=idle mtd: null]
0.026170: [compile level=3 [Lab.hot(I[LLab$Shape;)I] @-1 queues=0,0 rate=n/a k=1.00,1.00]
```

`total` is invocations and back-edges, `k` is the load-feedback scaling applied to the
thresholds (above `1.00` when a queue is congested), and `compilable=` shows whether a bailout
has marked the method not compilable for C2. Its high volume makes it a bounded diagnostic-session
tool; do not enable it persistently without measuring the output and logging-path impact.

## Version boundary for huge methods

`DontCompileHugeMethods=true` and `HugeMethodLimit=8000` describe current OpenJDK defaults, not a
JVMS rule. JDK-8366118 documents that JDK 17–25 do not respect the guard under
`-XX:-TieredCompilation`; the fix is in JDK 26. Therefore, “absent from compilation output because
it is huge” is a hypothesis: confirm runtime version, tiered mode, flag value, bytecode size, and
whether the method was invoked.

## Primary references

- [HotSpot `compileTask.cpp`](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/compiler/compileTask.cpp)
- [JDK diagnostic commands](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [JDK-8290025: remove the sweeper](https://bugs.openjdk.org/browse/JDK-8290025)
- [JDK-8366118: huge-method guard in non-tiered mode](https://bugs.openjdk.org/browse/JDK-8366118)
