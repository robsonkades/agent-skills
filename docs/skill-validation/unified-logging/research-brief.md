# Research brief: HotSpot Unified Logging (`-Xlog`) — framework ownership

Scope: JDK 21 LTS → JDK 25 LTS, with JDK 26 diffs noted. Prepared 2026-08-27.

## Evidence classes used in this brief

- **[DOC]** — primary vendor documentation (Oracle `java`/`jcmd` man pages, JEP pages).
- **[SRC]** — OpenJDK source at a specific tag on github.com/openjdk/jdk.
- **[JBS]** — OpenJDK bug system (bugs.openjdk.org), authoritative for "which release".
- **[MEASURED]** — I ran it. Environment stated inline. All local runs used:
  Temurin **OpenJDK 25.0.3+9-LTS**, Windows 11 Pro 26200, x86-64, no JVM flags beyond
  those shown. This is a **single-machine, single-JDK** observation — it establishes
  JDK 25 behaviour, and does **not** by itself establish JDK 21 behaviour.
- **[MECHANISM]** — reasoning from the source that I did not execute. Labelled as such.

No blog sources are cited anywhere in this brief. Every claim below is [DOC], [SRC],
[JBS] or [MEASURED].

---

## 1. `-Xlog` selection syntax

### 1.1 The grammar

```
-Xlog[:[what][:[output][:[decorators][:output-options[,...]]]]]
-Xlog:directive
```

where `what` (the man page also calls it _selections_ / _tag-selection_) is:

```
tag1[+tag2...][*][=level][,...]
```

Source: Oracle JDK 25 `java` man page, "Logging with the JVM Unified Logging Framework"
— https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html [DOC]

Confirmed verbatim by the JVM itself:

```
-Xlog Usage: -Xlog[:[selections][:[output][:[decorators][:output-options]]]]
	 where 'selections' are combinations of tags and levels of the form tag1[+tag2...][*][=level][,...]
	 NOTE: Unless wildcard (*) is specified, only log messages tagged with exactly the tags specified will be matched.
```

(`java -Xlog:help -version`, JDK 25.0.3) [MEASURED]

### 1.2 Defaults when a part is omitted

| Omitted part                 | Default                                             |
| ---------------------------- | --------------------------------------------------- |
| `what` / whole option        | tag-set `all`, level `info`                         |
| `output`                     | `stdout`                                            |
| `decorators`                 | `uptime, level, tags`                               |
| `level` (within a selection) | `info`                                              |
| `output-options`             | `filecount=5, filesize=20M`, `foldmultilines=false` |

Sources: man page §"Description", §"-Xlog Output", §"Decorations" [DOC]; defaults
`DefaultFileCount = 5`, `DefaultFileSize = 20 * M` in
https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/share/logging/logFileOutput.hpp
(lines 43–44) [SRC].

Two distinct "defaults" that are easy to conflate:

- **`-Xlog` with nothing else** ⇒ `-Xlog:all=info:stdout:uptime,level,tags` [DOC, man page
  §"-Xlog Usage Examples"].
- **The JVM's baseline configuration when `-Xlog` is not passed at all** ⇒
  `-Xlog:all=warning:stdout:uptime,level,tags` [DOC, man page §"Default Configuration"].
  Confirmed at runtime: `jcmd <pid> VM.log list` on a JVM started with no logging flags
  prints `#0: stdout all=warning uptime,level,tags foldmultilines=false` [MEASURED].

This baseline stays in effect alongside any `-Xlog` you add, _unless_ you passed
`-Xlog:disable` first — see §5.

### 1.3 Level semantics: "up to"

A level in a selection is a **threshold**, not an exact match: `=debug` selects debug and
everything more severe. `-Xlog:help` states "up to 'debug' level" [MEASURED].

Empirical: `-Xlog:gc=debug:file=g3.log:level,tags` over an allocation workload produced
24 `debug` lines **and** 22 `info` lines in the same file [MEASURED].

Available levels, in order: `off, trace, debug, info, warning, error`
— `-Xlog:help` [MEASURED]; man page §"-Xlog Tags and Levels" [DOC].
(JEP 158 also lists a `develop` level; it exists only in non-product builds and is not
selectable from a released JDK — https://openjdk.org/jeps/158 [DOC].)

### 1.4 The three forms — the distinction that gets gotten wrong

Every log call site in HotSpot is tagged with a **tag-set**: an unordered set of 1–5 tags
(`LogTag::MaxTags = 5`,
https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/share/logging/logTag.hpp) [SRC].
A selection is matched against whole tag-sets, never against individual messages' text.

**`gc+age` — exact tag-set match.** Matches only call sites whose tag-set is _exactly_
`{gc, age}`. A site tagged `{gc, age, ergo}` does **not** match.

> "-Xlog:gc+ref=debug — Logs messages tagged with both gc and ref tags... Messages tagged
> only with one of the two tags won't be logged."
> — man page §"-Xlog Usage Examples" [DOC]

> "-Xlog:gc+meta=trace — Logs messages tagged with exactly the gc and meta tags"
> — man page §"Complex -Xlog Usage Examples" [DOC]

**`gc*` — wildcard / superset match.** Matches every tag-set that _contains_ `gc`, with any
number of additional tags.

> "The asterisk * in a tag set definition denotes a wildcard tag match. Matching with a
> wildcard selects all tag sets that contain at least the specified tags. Without the
> wildcard, only exact matches of the specified tag sets are selected."
> — man page §"tag[+...] all" [DOC]

The wildcard binds to the whole preceding tag _combination_, not to one tag:
`gc+class*` = "at least `gc` and `class`" [DOC, §"Complex -Xlog Usage Examples"].

Measured breadth difference on the same workload (allocation loop, `-Xmx256m`, JDK 25.0.3):
`-Xlog:gc` → 22 lines; `-Xlog:gc*` → 325 lines [MEASURED].

**`gc,safepoint` — two independent selections.** The comma separates selections; each is
evaluated on its own. It is a _union of two exact matches_, and specifically does **not**
include the intersection.

> "-Xlog:gc,safepoint — Logs messages tagged either with the gc or safepoint tags... Messages
> tagged with both gc and safepoint won't be logged."
> — man page §"-Xlog Usage Examples" [DOC], repeated verbatim by `-Xlog:help` [MEASURED]

Each selection carries its own level: `-Xlog:gc*=info,safepoint*=off` [DOC].

**Summary table** (the shape the skill should teach):

| Written        | Reads as                           | `{gc}` | `{gc,age}` | `{gc,age,ergo}` | `{safepoint}` | `{gc,safepoint}` |
| -------------- | ---------------------------------- | ------ | ---------- | --------------- | ------------- | ---------------- |
| `gc`           | exact `{gc}`                       | yes    | no         | no              | no            | no               |
| `gc+age`       | exact `{gc,age}`                   | no     | yes        | no              | no            | no               |
| `gc*`          | superset of `{gc}`                 | yes    | yes        | yes             | no            | yes              |
| `gc,safepoint` | exact `{gc}` ∪ exact `{safepoint}` | yes    | no         | no              | yes           | **no**           |

### 1.5 Composing multiple `-Xlog` arguments

The man page says: "Applies multiple arguments in the order that they appear on the command
line. Multiple -Xlog arguments for the same output override each other in their given order."
[DOC] That statement is true but under-specifies the merge. Measured behaviour on JDK 25.0.3:

- **Disjoint selections to the same output _merge_.**
  `-Xlog:gc:file=o3.log -Xlog:safepoint:file=o3.log` → 43 lines: 22 gc + 21 safepoint
  [MEASURED].
- **Overlapping selections _override_, last wins.**
  `-Xlog:gc=debug:file=v1.log -Xlog:gc=off:file=v1.log` → 0 lines.
  Reversed order → 46 lines [MEASURED].
- **A later `off` carves a hole out of an earlier wildcard.**
  `-Xlog:gc*=debug -Xlog:gc+heap=off` to one file → 3196 lines, of which 0 are `gc,heap`
  [MEASURED].
- **Decorators are a property of the output, not of the selection — the last spec wins for
  everything already routed there.**
  `-Xlog:gc:file=v4.log:uptime -Xlog:safepoint:file=v4.log:pid,tid` → _gc_ lines are printed
  with `pid,tid`, having silently lost `uptime` [MEASURED]. See trap §9.2.

Mechanism for the merge/override split: `LogConfiguration::configure_output` walks every
tag-set; a tag-set the new selection does not mention (`LogLevel::NotMentioned`) keeps its
previously configured level for that output —
https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/share/logging/logConfiguration.cpp
lines ~250–280 [SRC].

Excess options are dropped with a warning: `log_warning(logging)("Ignoring excess -Xlog
options: \"%s\"", str)` (same file, line 426) [SRC].

---

## 2. The JEPs

### 2.1 JEP 158 — verbatim header

- **Number/title**: JEP 158: Unified JVM Logging
- **Type**: Feature · **Scope**: Implementation
- **Status**: `Closed / Delivered`
- **Release**: **9**
- **Component**: hotspot / svc · **Issue**: 8046148
- Authors Staffan Larsen, Fredrik Arvidsson, Marcus Larsson; Owner Marcus Larsson.

Source: https://openjdk.org/jeps/158 [DOC] (fetched 2026-08-27 via curl; WebFetch gets 403).

Content worth carrying into the skill: JEP 158 is where tags, tag-sets, levels, decorations,
the three output types, size+count rotation, and "configurable dynamically at runtime via
jcmd or MBeans" are all specified as goals. It explicitly states the default configuration is
"all messages using warning and error level are output to stderr" — **note this differs from
today's shipped default, which is stdout** (§1.2). The JEP text was not updated; the man page
and `VM.log list` are authoritative for current behaviour.

### 2.2 JEP 271 — verbatim header

- **Number/title**: JEP 271: Unified GC Logging
- **Type**: Feature · **Scope**: JDK
- **Status**: `Closed / Delivered`
- **Release**: **9**
- **Component**: hotspot / gc · **Issue**: 8059805
- Author Jon Masamitsu; Owner Bengt Rutisson.

Source: https://openjdk.org/jeps/271 [DOC].

Design rule stated in JEP 271 that explains the whole `gc` vs `gc*` split: `-Xlog:gc` at info
is deliberately reserved for **one line per GC** (the old `PrintGC`); everything else must
combine `gc` with additional tags, so `-Xlog:gc*` is the `PrintGCDetails` analogue. JEP 271
also declares a non-goal: "It is not a goal to ensure that current GC log parsers work without
change on the new GC logs." [DOC]

### 2.3 Asynchronous unified logging — **there is no JEP**

I searched the complete JEP index at https://openjdk.org/jeps/0 [DOC] (all Process,
Informational, In-flight, Submitted, Draft, Delivered and Withdrawn JEPs). **No JEP for
asynchronous unified logging exists** — not delivered, not draft, not withdrawn. The only
logging JEPs in the index are 158 and 271.

Asynchronous UL shipped as a **plain RFE, not a JEP**:

- **JDK-8229517 — "Support for optional asynchronous/buffered logging"**
- **Status**: Resolved / Fixed
- **Fix Version: JDK 17** (released 2021-09-14)

Source: https://bugs.openjdk.org/browse/JDK-8229517 [JBS] (fetched via the JBS REST API).

Follow-on, and a **hard JDK 21 vs JDK 25 difference**:

- **JDK-8323807 — "Async UL: Add a stalling mode to async UL" — Fix Version: JDK 25**
  https://bugs.openjdk.org/browse/JDK-8323807 [JBS]
- Release note: **JDK-8377827 — "Release Note: Enhanced Support for Asynchronous JVM Logs
  Through `-Xlog:async:stall` Option" — Fix Version: JDK 25**
  https://bugs.openjdk.org/browse/JDK-8377827 [JBS]

Corroborated in source: `logConfiguration.cpp` at `jdk-17+35` and `jdk-21+35` prints only
`-Xlog:async` in help and contains **zero** occurrences of "stall"; the same is true at
`jdk-22+36`, `jdk-23+37` and `jdk-24+36`. `jdk-25+36` documents `-Xlog:async[:[mode]]` with
`drop`/`stall` [SRC, all six tags checked].

**Practical consequence for the skill: `-Xlog:async:drop` and `-Xlog:async:stall` are
JDK 25+ spellings. On JDK 21 the only valid form is bare `-Xlog:async`, and its behaviour
is drop-only.** (Whether JDK 21 _rejects_ `-Xlog:async:drop` or silently ignores the suffix
is listed in UNRESOLVED — I have no JDK 21 to run and did not find a definitive statement.)

---

## 3. The tag list — and the `jit` vs `compilation` question

### 3.1 Authoritative extraction

Two independent authorities, cross-checked and in agreement:

1. `LOG_TAG_LIST` in `src/hotspot/share/logging/logTag.hpp` [SRC]
2. `java -Xlog:help` on a real product JDK 25.0.3 [MEASURED]

Tag counts (from `LOG_TAG_LIST`, _including_ `NOT_PRODUCT`/`DEBUG_ONLY` entries):

| JDK | tag         | tags in `LOG_TAG_LIST` |
| --- | ----------- | ---------------------- |
| 21  | `jdk-21+35` | 176                    |
| 25  | `jdk-25+36` | 188                    |
| 26  | `jdk-26+35` | 191                    |

A **product** build exposes fewer: `-Xlog:help` on Temurin 25.0.3 lists **179** tags
[MEASURED]. The difference is the eight entries wrapped in `NOT_PRODUCT(...)` /
`DEBUG_ONLY(...)`: `codestrings, deathtest, downcall, foreign, generate, heapsampling, test,
upcall` [SRC]. **The skill must say "use `-Xlog:help` on the JDK you actually run", because
the header file over-counts relative to a shipped JDK.**

### 3.2 Full JDK 25 product tag list (verbatim from `-Xlog:help`, Temurin 25.0.3) [MEASURED]

```
add, age, alloc, annotation, aot, arguments, array, attach, barrier, blocks, bot, breakpoint,
bytecode, cause, cds, census, class, classhisto, cleanup, codecache, compaction, compilation,
condy, constantpool, constraints, container, continuations, coops, cpu, cset, data,
datacreation, dcmd, decoder, defaultmethods, deoptimization, dependencies, director, dump,
dynamic, ergo, event, exceptions, exit, fastlock, finalizer, fingerprint, free, freelist, gc,
handshake, hashtables, heap, heapdump, humongous, ihop, iklass, indy, init, inlinecache,
inlining, install, interpreter, itables, jfr, jit, jmethod, jni, jvmci, jvmti, lambda, library,
link, liveness, load, loader, logging, malloc, map, mark, marking, membername, memops, metadata,
metaspace, methodcomparator, methodhandles, methodtrace, mirror, mmu, module, monitorinflation,
monitormismatch, monitortable, native, nestmates, nmethod, nmt, normalize, numa, objecttagging,
obsolete, oldobject, oom, oopmap, oops, oopstorage, os, owner, page, pagesize, parser, patch,
path, perf, periodic, phases, plab, placeholders, preempt, preorder, preview, promotion,
ptrqueue, purge, record, redefine, ref, refine, region, reloc, remset, resolve, safepoint,
sampling, scavenge, sealed, setting, smr, stackbarrier, stackmap, stacktrace, stackwalk, start,
startup, startuptime, state, stats, streaming, stringdedup, stringtable, stubs, subclass,
survivor, suspend, sweep, symboltable, system, table, task, thread, throttle, timer, tlab,
tracking, training, trimnative, unload, unmap, unshareable, update, valuebasedclasses,
verification, verify, vmmutex, vmoperation, vmthread, vtables, vtablestubs
```

Source file for JDK 25:
https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/share/logging/logTag.hpp [SRC]

### 3.3 Version deltas

**JDK 21 → JDK 25 — added (13):**
`aot, array, cause, deathtest*, heapdump, inlinecache, jmethod, link, methodtrace,
monitortable, native, training, trimnative` (`*` = debug-only, not in a product build)

**JDK 21 → JDK 25 — removed (1):** `protectiondomain`

**JDK 25 → JDK 26 — added (3):** `asan, package, vmatree`

**JDK 25 → JDK 26 — removed:** none

Computed by diffing `LOG_TAG_LIST` at `jdk-21+35`, `jdk-25+36`, `jdk-26+35` [SRC].
Note for the sibling skills: `aot` and `training` (JDK 25) are the Leyden/AOT-cache tags,
relevant to `startup-cds-crac-leyden`; `methodtrace` (JDK 25) belongs to JEP 520.

### 3.4 **RESOLVED: `jit` vs `compilation` — both exist; neither is a rename**

This settles the defect between the two existing skills.

**Both tags have existed continuously since at least JDK 17.** `LOG_TAG(jit)` and
`LOG_TAG(compilation)` are both present in `LOG_TAG_LIST` at `jdk-17+35`, `jdk-21+35`,
`jdk-25+36` and `master` [SRC, all four tags checked]. **No rename ever happened in any
release.** Any skill text asserting a rename is wrong.

The tag that matters is neither on its own — it is the **two-tag tag-set `jit+compilation`**:

```cpp
// src/hotspot/share/compiler/compileTask.cpp
LogTarget(Info, jit, compilation) lt;   // jdk-25+36, lines 454 and 462
LogTarget(Debug, jit, inlining) lt;     // jdk-25+36, line 474
```

https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/share/compiler/compileTask.cpp [SRC]

**Level changed between JDK 21 and JDK 25 — this is the real trap.** At `jdk-21+35` the same
two call sites are `LogTarget(Debug, jit, compilation)` [SRC]. They were lifted to `Info` by:

- **JDK-8356259 — "Lift basic `-Xlog:jit*` logging to \"info\" level" — Fix Version: JDK 25**,
  Resolved/Fixed. Its description is worth quoting to the skill author verbatim:
  > "We have unified logging for JIT activity: `-Xlog:jit+compilation`, `-Xlog:jit+inlining`,
  > etc. These serve as convenient replacements for `-XX:+PrintCompilation`,
  > `-XX:+PrintInlining`, etc. ... However, all useful messages are on \"debug\" level, which
  > is inconvenient and surprising."
  > https://bugs.openjdk.org/browse/JDK-8356259 [JBS]

So:

| Command                       | JDK 21                          | JDK 25                      |
| ----------------------------- | ------------------------------- | --------------------------- |
| `-Xlog:jit+compilation`       | **silent** (sites are at debug) | works, one line per compile |
| `-Xlog:jit+compilation=debug` | works                           | works                       |

JDK 25 measurement: `-Xlog:jit+compilation:file=jitc.log java -version` → 12 lines,
e.g. `[0.017s][info][jit,compilation]    3       3       java.lang.String::charAt (25 bytes)`
[MEASURED].

**What each spelling actually selects** (JDK 25.0.3, allocation workload) [MEASURED]:

| Selection                          | Result                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `-Xlog:jit` (exact, alone)         | **warning, no output** — "No tag set matches selection: jit. Did you mean any of the following? jit* jit+thread jit+inlining jit+compilation" |
| `-Xlog:compilation` (exact, alone) | accepted, **no warning**, zero lines in these runs (a `{compilation}` tag-set is registered but did not fire)                                 |
| `-Xlog:jit*=trace`                 | 89 lines: `jit,compilation` 48 · `jit,inlining` 39 · `jit,thread` 2                                                                           |
| `-Xlog:compilation*=trace`         | 126 lines: **`compilation,codecache` 78** · `jit,compilation` 48                                                                              |

**Both `-Xlog:jit*` and `-Xlog:compilation*` are valid, and they are different sets that
overlap only on `jit+compilation`.** `jit*` reaches inlining and compiler threads;
`compilation*` reaches code-cache accounting. Neither skill is "wrong" — they are answering
different questions, and the new `unified-logging` skill should say so explicitly rather than
picking a winner. For "what did the JIT compile", the precise selection is
`-Xlog:jit+compilation` (JDK 25+) / `-Xlog:jit+compilation=debug` (JDK 21).

---

## 4. Levels, decorators, outputs, rotation

### 4.1 Levels

`off, trace, debug, info, warning, error` — man page §"-Xlog Tags and Levels" [DOC];
`-Xlog:help` [MEASURED]. Threshold semantics, see §1.3.

### 4.2 Decorators — full list

Prepended, **always in the order below regardless of the order you write them**
(man page: "The order of the output is always the same as listed in the table") [DOC].

| Decorator      | Short | Prints                                        |
| -------------- | ----- | --------------------------------------------- |
| `time`         | `t`   | Current date+time, ISO-8601                   |
| `utctime`      | `utc` | Same, in UTC                                  |
| `uptime`       | `u`   | Seconds+millis since JVM start, e.g. `6.567s` |
| `timemillis`   | `tm`  | `System.currentTimeMillis()` value            |
| `uptimemillis` | `um`  | Millis since JVM start                        |
| `timenanos`    | `tn`  | `System.nanoTime()` value                     |
| `uptimenanos`  | `un`  | Nanos since JVM start                         |
| `hostname`     | `hn`  | Host name                                     |
| `pid`          | `p`   | Process id                                    |
| `tid`          | `ti`  | Thread id                                     |
| `level`        | `l`   | Message level                                 |
| `tags`         | `tg`  | Message tag-set                               |

Sources: man page §"Decorations" table [DOC]; identical list emitted by `-Xlog:help` and by
`jcmd VM.log list` [MEASURED].

Default: `uptime, level, tags`. `none` turns all decorations off. Both [DOC] + [MEASURED].
Decorators attach to the **output**, not the selection (§1.5, and trap §9.2).

### 4.3 Outputs

- `stdout` (default)
- `stderr`
- `file=<filename>`

Filename placeholders, expanded at JVM start: `%p` → PID, `%t` → startup timestamp,
`%hn` → host name. Man page §"-Xlog Output" [DOC], `-Xlog:help` [MEASURED].
`%p`/`%t` are the correct answer to "several JVMs on one host clobber each other's log".

`stdout` and `stderr` are outputs `#0` and `#1` and **cannot be removed** — only
reconfigured (`if (!enabled && idx > 1) { delete_output(idx); }`,
`logConfiguration.cpp` ~line 293) [SRC], confirmed by `VM.log list` always showing `#0`/`#1`
[MEASURED].

### 4.4 Output options

| Option                       | Meaning                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `filecount=N`                | number of rotated files kept, **not counting the active file**                                                                              |
| `filesize=N[K\|M\|G]`        | target byte size that triggers rotation                                                                                                     |
| `foldmultilines=true\|false` | fold a multi-line event onto one line, `\n` escaped; existing `\` doubled so it is reversible. Safe for UTF-8; may corrupt Shift-JIS / BIG5 |

Man page §"output-options" [DOC]; `-Xlog:help` [MEASURED].

### 4.5 Rotation semantics — exact

Defaults: `filecount=5`, `filesize=20M` (`DefaultFileCount`, `DefaultFileSize` in
`logFileOutput.hpp`) [SRC]; man page: "Files are rotated by default with up to 5 rotated
files of target size 20 MB, unless configured otherwise." [DOC]
Upper bound: `MaxRotationFileCount = 1000` [SRC].

Naming: the active file keeps the configured name; rotated files get `.0`, `.1`, … zero-padded
to the digit width of `filecount - 1` (`jio_snprintf(_archive_name, ..., "%s.%0*u", ...)`,
`logFileOutput.cpp` line 326) [SRC]. Note the numbers **start at 0**, so `filecount=3` yields
`x.log`, `x.log.0`, `x.log.1`, `x.log.2` — four files on disk [SRC + MEASURED].

Size is approximate: "The target size of the files isn't guaranteed to be exact" [DOC]; JEP 158
is more precise — "The size can overflow at most the size of the last log message written."
[DOC]

**`filecount=0`** — rotation is **disabled entirely**:

> "filecount=.. — Number of files to keep in rotation (not counting the active file). If set
> to 0, log rotation is disabled. **This will cause existing log files to be overwritten.**"
> — `-Xlog:help` [MEASURED]

The source is explicit — the pre-existing file is _truncated_, not appended to:

```cpp
if (_file_count == 0 && is_regular_file(_file_name)) {
  log_trace(logging)("Truncating log file");
  os::ftruncate(os::get_fileno(_stream), 0);
}
```

`logFileOutput.cpp` lines 247–250 [SRC]

**`filesize=0`** is different from `filecount=0` and is the useful one:

> "filesize=.. — Target byte size for log rotation (supports K/M/G suffix). **If set to 0, log
> rotation will not trigger automatically, but can be performed manually (see the VM.log
> DCMD).**" — `-Xlog:help` [MEASURED]

So `filesize=0` + `filecount=N` = "never rotate on my own, but let me rotate on demand via
`jcmd`" — the right configuration for an operator-triggered capture.

**Rotation across a JVM restart.** This is decided at output initialisation:

```cpp
bool file_exist = os::file_exists(_file_name);
...
if (_file_count > 0 && file_exist) {
  _current_file = next_file_number(_file_name, ...);
  log_trace(logging)("Existing log file found, saving it as '%s.%0*u'", ...);
  archive();                 // rename existing file to name.N
  increment_file_count();
}
_stream = os::fopen(_file_name, FileOpenMode);
if (_file_count == 0 && is_regular_file(_file_name)) { ...ftruncate... }
```

`logFileOutput.cpp` lines 202–252 [SRC]

- **`filecount > 0`**: on every restart the previous log is **archived** (renamed to the next
  slot), and a fresh active file is opened. A restart therefore _consumes one rotation slot_.
  Measured: three consecutive `java -Xlog:gc*:file=fc3.log:filecount=3 -version` runs left
  `fc3.log`, `fc3.log.0`, `fc3.log.1`, each 1729 bytes [MEASURED].
- **`filecount = 0`**: on restart the previous log is **truncated and lost**. Measured: two
  consecutive runs with `filecount=0` left one 1729-byte file and no archives [MEASURED].
- `next_file_number` picks the slot by comparing file modification times
  (`os::compare_file_modified_times`, line 156) [SRC], so the oldest slot is reused.
- Special case: if the target is a **FIFO / named pipe** and `filecount` was left at its
  default, the JVM forces `_file_count = 0` to avoid rotating a pipe (lines 204–206) [SRC].

**Operational consequence to teach:** a crash-restart loop with `filecount=5` destroys the
evidence in five restarts. Either raise `filecount`, or put `%p`/`%t` in the filename so each
JVM gets its own file.

---

## 5. `-Xlog:help`, `-Xlog:disable`, and invalid input — the verify-before-you-ship story

### 5.1 `-Xlog:help`

"Prints -Xlog usage syntax and available tags, levels, and decorators along with example
command lines with explanations." [DOC] It exits after printing (with `-version` present the
JVM still starts). It is the _only_ correct source for the tag list of the JDK in front of you
(§3.1). Runtime equivalent: `jcmd <pid> VM.log list`, which prints the same three lists plus
the live configuration [MEASURED].

### 5.2 `-Xlog:disable`

"Turns off all logging and clears all configuration of the logging framework **including the
default configuration for warnings and errors**." [DOC]

That is the whole point of it: after `-Xlog:disable`, the `all=warning:stdout` baseline is gone,
so a JVM configured as `-Xlog:disable -Xlog:safepoint=trace:file=sp.log` emits _nothing_
outside `sp.log` — including nothing for JVM warnings and errors. Man page example:
"The default configuration doesn't apply, because the command line started with
-Xlog:disable." [DOC]

Measured on a running JVM: `jcmd <pid> VM.log disable` left `#0: stdout all=off` and `#1:
stderr all=off`, and removed every file output [MEASURED].

### 5.3 What the JVM does with bad input — **precise, and there are three different answers**

All measured on Temurin 25.0.3.

**(a) Unknown tag → fatal. The JVM refuses to start.**

```
$ java -Xlog:notatag -version
[0.002s][error][logging] Invalid tag 'notatag' in log selection.
Invalid -Xlog option '-Xlog:notatag', see error log for details.
Error: Could not create the Java Virtual Machine.
$ echo $?
1
```

Same for `-Xlog:notatag*` and for a near-miss typo such as `-Xlog:gcc` [MEASURED].
Source: `LogSelection::parse` returns `LogSelection::Invalid` on an unknown tag
(`logSelection.cpp` lines 136–143) [SRC].

**(b) Unknown level → fatal.** `-Xlog:gc=verbose` → `Invalid level 'verbose' in log
selection.`, exit 1 [MEASURED]. **(c) Unknown decorator → fatal.** `-Xlog:gc::foobar` →
`Invalid decorator 'foobar'.`, exit 1 [MEASURED].

**(d) All tags valid, but no tag-set matches → warning, JVM starts normally, exit 0.**

```
$ java -Xlog:gc+jit=trace -version
[0.002s][warning][logging] No tag set matches selection: gc+jit. Did you mean any of the
following? gc* gc+director gc+reloc gc+free gc+thread
openjdk version "25.0.3" ...
```

[MEASURED]. Source:

```cpp
if (_selections[i].tag_sets_selected() == 0) {
  out->print("No tag set matches selection:");
  ...
  _selections[i].suggest_similar_matching(out);
```

https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/share/logging/logSelectionList.cpp
lines 30–51, with `suggest_similar_matching` and `suggestion_cap = 5` in `logSelection.cpp`
lines 281–320 [SRC].

**The warning goes to _stdout_, not stderr, and never into the file you named.** Verified by
splitting the streams: with `2>/dev/null` the warning is still there; with `2>&1 1>/dev/null`
it is gone [MEASURED]. And the file itself is created empty:
`java -Xlog:gc+jit=trace:file=nonsense.log -version` → exit 0, `nonsense.log` = **0 bytes**
[MEASURED].

**(e) Selection matches real tag-sets, but nothing is ever logged at that level → no warning
at all, silent empty file, exit 0.** This is the nastiest case because even the diagnostic in
(d) does not fire. Measured: `-Xlog:gc+age` (default `info`) over a GC-heavy workload → **0
lines**; `-Xlog:gc+age=debug` over the same workload → **21 lines** [MEASURED]. The tag-set is
real, the tags are spelled right, the JVM is happy — the level was simply wrong.

**Verification workflow the skill should mandate**, derived from (a)–(e):

1. `java -Xlog:help` on _this_ JDK → confirm every tag you intend to use exists.
2. Run the exact flag with `-version` **on stdout, watching stdout**, before putting `file=`
   on it. That is the only step that surfaces the (d) warning and its suggestions.
3. Run a representative workload and assert the file is **non-empty and contains the tag-set
   you expected** (`grep '\[gc,age\]'`, not just `wc -l`). That is the only step that catches
   (e).
4. Then, and only then, ship the flag with `file=`, `filecount`, `filesize`.

Step 2 is load-bearing: adding `:file=` moves the _log_ to the file but leaves the
_configuration diagnostics_ on stdout, which in a containerised service is often discarded.

---

## 6. Runtime reconfiguration: `jcmd <pid> VM.log`

Full syntax as printed by `jcmd <pid> help VM.log` on JDK 25.0.3 [MEASURED]:

```
VM.log
Lists current log configuration, enables/disables/configures a log output, or rotates all logs.
Impact: Low: No impact
Syntax : VM.log [options]
Options: (options must be specified using the <key> or <key>=<value> syntax)
	output         : [optional] The name or index (#<index>) of output to configure. (STRING)
	output_options : [optional] Options for the output. (STRING)
	what           : [optional] Configures what tags to log. (STRING)
	decorators     : [optional] Configures which decorators to use. Use 'none' or an empty value to remove all. (STRING)
	disable        : [optional] Turns off all logging and clears the log configuration. (BOOLEAN)
	list           : [optional] Lists current log configuration. (BOOLEAN)
	rotate         : [optional] Rotates all logs. (BOOLEAN)
```

Man page: "Everything that can be specified on the command line can also be specified
dynamically with the VM.log command. As the diagnostic commands are automatically exposed as
MBeans, you can use JMX to change logging configuration at run time."
— https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html §"Controlling Logging at
Runtime" [DOC]. `jcmd` reference:
https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html [DOC]

**That "everything" claim is false in one specific way — see the limits below.**

### 6.1 Measured recipes (JDK 25.0.3, live JVM)

Add a rotating file output at runtime:

```
jcmd <pid> VM.log output=file=rt.log what=gc*=debug \
     decorators=uptime,level,tags output_options=filecount=3,filesize=1m
→ Command executed successfully
```

`VM.log list` then shows:

```
#2: file=rt.log all=off,gc*=debug uptime,level,tags foldmultilines=false,filecount=3,filesize=1024K,async=false (reconfigured)
```

[MEASURED]

Stop one output — **there is no per-output `disable`; you set it to `all=off`, which removes
the output and closes the file**:

```
jcmd <pid> "VM.log output=file=a.log what=all=off"
```

Measured: output `#2 file=a.log` disappeared from `VM.log list` entirely, while `#3 file=b.log`
survived — **and was renumbered to `#2`** [MEASURED]. Addressing by index (`output=#2`) works
too, but indices shift after any removal, so **address by name in scripts.**

Rotate on demand:

```
jcmd <pid> VM.log rotate    → Command executed successfully
```

Measured: `rt.log` (active) + `rt.log.0` (archived) [MEASURED]. Note `rotate` rotates **all**
outputs, not a named one. Source: `force_rotate()` no-ops when `_file_count == 0`
(`logFileOutput.cpp` lines 341–348) [SRC] — so `filecount=0` outputs cannot be rotated even
manually, whereas `filesize=0` + `filecount>0` can.

Kill everything: `jcmd <pid> VM.log disable` → both `stdout` and `stderr` go to `all=off` and
all file outputs are removed [MEASURED]. This is destructive and irreversible-by-accident: it
also discards the `all=warning` baseline. Restore with an explicit
`VM.log output=stdout what=all=warning`.

### 6.2 Limits

- **`async` cannot be set at runtime.** `jcmd <pid> VM.log async=true` →
  `java.lang.IllegalArgumentException: Unknown argument 'async' in diagnostic command.`
  [MEASURED]. `-Xlog:async` is a **command-line-only** decision; `VM.log list` reports it
  per-output as read-only state (`async=false`). Restarting is the only way to turn it on.
- **`decorators` is per output, not per selection** — same limitation as the command line
  (§1.5).
- `disable` is all-or-nothing; there is no "disable output #2" verb (use `what=all=off`).
- `rotate` is all-or-nothing across outputs.
- `stdout`/`stderr` (`#0`/`#1`) can be silenced but never removed [SRC, §4.3].
- Output indices are not stable across reconfiguration [MEASURED].
- Reconfiguration takes a `ConfigurationLock` and forces `AsyncLogWriter::flush()` before
  swapping decorators/outputs (`logConfiguration.cpp` lines ~282, ~314) [SRC] — so a
  `VM.log` call on a busy async logger blocks until the buffer drains. [MECHANISM — I did not
  measure the stall.]
- `jcmd` requires the attach mechanism: same user, and not blocked by
  `-XX:+DisableAttachMechanism`. [MECHANISM — standard `jcmd` constraint, not measured here.]

---

## 7. Cost

### 7.1 MEASURED — synchronous file vs asynchronous vs none

Environment: Temurin OpenJDK 25.0.3+9-LTS, Windows 11 Pro 26200, x86-64, `-Xmx512m`, local
NTFS disk. Workload: 40,000,000 × `new byte[64]` allocation loop (`Churn.java`), which drives
~46 young GCs. Logging selection `gc*=trace` produces ~40,800 log lines over the run
(≈50,000 messages/second — deliberately an extreme rate). Three runs each, wall-clock
milliseconds reported by the program itself.

| Configuration                        | Run 1 | Run 2 | Run 3 | vs baseline |
| ------------------------------------ | ----- | ----- | ----- | ----------- |
| no logging                           | 788   | 795   | 787   | —           |
| `-Xlog:gc*=trace:file=…` (sync)      | 1005  | 992   | 1013  | **+26%**    |
| `-Xlog:async -Xlog:gc*=trace:file=…` | 823   | 824   | 831   | **+5%**     |

Both logged configurations produced essentially the same content (40,869 vs 40,856 lines) and
**zero dropped messages at the default 2 MB buffer** [MEASURED].

Read this as an _upper bound on a pathological rate_, not as a production estimate. It says:
at ~50k msg/s, synchronous file logging cost ~26% of wall time on this machine, and async
recovered about four fifths of that. It says nothing about `-Xlog:gc` at info (22 lines for
the whole run), which is unmeasurable here.

### 7.2 MEASURED — async buffer overflow, drop vs stall

Same environment; buffer squeezed to the legal minimum `-XX:AsyncLogBufferSize=102400`:

| Mode                | Wall ms | Lines written     | "messages dropped" notices |
| ------------------- | ------- | ----------------- | -------------------------- |
| `-Xlog:async:drop`  | 811     | 27,772 of ~40,860 | **21**                     |
| `-Xlog:async:stall` | 893     | 40,867 (complete) | 0                          |

**Drops are reported, in-band, at `warning` level, into the affected output**, e.g.
`[0.047s][warning][                     ]    130 messages dropped due to async logging`
[MEASURED]. Source of that message:

```cpp
ss.print(UINT32_FORMAT_W(6) " messages dropped due to async logging", counter);
output->write_blocking(decorations, ss.freeze());
```

https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/share/logging/logAsyncWriter.cpp
lines ~248–256 [SRC]

Note the notice is emitted with an **empty tags decoration**, so a parser that keys on the tag
field will not attribute it to anything — but `grep "messages dropped"` finds it. **A log
analysis skill should check for this line before trusting counts derived from an async log.**

`AsyncLogBufferSize`: `{product}` flag, **default 2097152 (2 MiB)**, allowed range
**[102400 … 52428800]** i.e. 100 KiB … 50 MiB — verified by `-XX:+PrintFlagsFinal` and by the
range error message from `-XX:AsyncLogBufferSize=100` [MEASURED]. The budget is split in
half between two alternating buffers (`size_t size = AsyncLogBufferSize / 2;`,
`logAsyncWriter.cpp` line 222) [SRC] — so the effective in-flight capacity is half the flag.

### 7.3 DOC — what Oracle states about the mechanism

> "By default logging messages are output synchronously — each log message is written to the
> designated output when the logging call is made. ... In asynchronous logging mode, log sites
> enqueue all logging messages to an intermediate buffer and a standalone thread is responsible
> for flushing them to the corresponding outputs. The intermediate buffer is bounded. On buffer
> exhaustion the enqueuing message is either discarded (`async:drop`), or logging threads are
> stalled until the flushing thread catches up (`async:stall`). If no specific mode is chosen,
> then `async:drop` is chosen by default. **Log entry write operations are guaranteed to be
> non-blocking in the `async:drop` case.**"
> — man page §"-Xlog Output Mode" [DOC]

> "The option `-XX:AsyncLogBufferSize=N` specifies the memory budget in bytes for the
> intermediate buffer. The default value should be big enough to cater for most cases. Users
> can provide a custom value to trade memory overhead for log accuracy if they need to." [DOC]

### 7.4 MECHANISM — plausible but not measured here

Labelled explicitly so the skill does not present these as facts:

- **Synchronous output serialises across threads.** JEP 158's goal "Print line-at-a-time (no
  interleaving within same line)" implies a lock per output; in synchronous mode a thread that
  logs on a hot path holds it. [MECHANISM]
- **Synchronous file output can block on the filesystem.** `write_blocking` goes to a `FILE*`
  with no buffering guarantee against a slow or full disk; a stalled NFS/overlay mount blocks
  the _application_ thread, not a logger thread. In async mode only the flushing thread blocks.
  [MECHANISM — the `write_blocking` call site is in `logAsyncWriter.cpp` [SRC], but I did not
  measure a slow-disk scenario.]
- **`trace`/`debug` in production is a volume problem before it is a CPU problem.** The
  measured 40,800 lines came from a 800 ms run; the same selection over a day is
  multi-gigabyte, which interacts with §4.5 (rotation destroying the interesting window) and
  with log-shipping cost. [MECHANISM]
- **`-Xlog:async` costs a thread and up to `AsyncLogBufferSize` of native memory** (accounted
  under `mtLogging`, visible in NMT). [MECHANISM — from the allocation tag in the source [SRC];
  not measured.]
- **`stall` mode reintroduces application blocking by design** — it is bounded-latency-lost vs
  bounded-data-lost. The 893 ms vs 811 ms above is one data point of that trade at an extreme
  rate. [MEASURED for that point; general claim is MECHANISM.]

**No published, citable third-party benchmark of UL overhead was found in primary sources.**
JDK-8229517's discussion links a hotspot-dev mail thread but that thread's numbers are for
prototype patches on pre-JDK-17 builds and are not a usable citation. See UNRESOLVED.

---

## 8. Migration from pre-JDK-9 flags

### 8.1 MEASURED — what each legacy flag actually does on JDK 25.0.3

Every row below is `java <flag> -version` on Temurin 25.0.3, exit code and message captured.

| Legacy flag                      | JDK 25 behaviour                                                                                      | Exit             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------- |
| `-XX:+PrintGC`                   | **works, deprecated**: `[warning][gc] -XX:+PrintGC is deprecated. Will use -Xlog:gc instead.`         | 0                |
| `-XX:+PrintGCDetails`            | **works, deprecated**: `[warning][gc] -XX:+PrintGCDetails is deprecated. Will use -Xlog:gc* instead.` | 0                |
| `-Xloggc:x.log`                  | **works, deprecated**: `[warning][gc] -Xloggc is deprecated. Will use -Xlog:gc:x.log instead.`        | 0                |
| `-XX:+PrintCompilation`          | **works, not deprecated** — still a live `{product}` flag, _not_ routed through UL                    | 0                |
| `-XX:+PrintGCTimeStamps`         | **REMOVED**: `Unrecognized VM option 'PrintGCTimeStamps'`                                             | 1                |
| `-XX:+PrintTenuringDistribution` | **REMOVED**: `Unrecognized VM option`                                                                 | 1                |
| `-XX:+PrintReferenceGC`          | **REMOVED**: `Unrecognized VM option`                                                                 | 1                |
| `-XX:+PrintAdaptiveSizePolicy`   | **REMOVED**: `Unrecognized VM option`                                                                 | 1                |
| `-XX:+UseGCLogFileRotation`      | **REMOVED**: `Unrecognized VM option`                                                                 | 1                |
| `-XX:+TraceClassLoading`         | **REMOVED**: `Unrecognized VM option`                                                                 | 1                |
| `-XX:+PrintSafepointStatistics`  | **REMOVED**: `Unrecognized VM option`                                                                 | 1                |
| `-XX:+TraceSafepoint`            | **REMOVED**: `Unrecognized VM option`                                                                 | 1                |
| `-XX:+PrintInlining`             | **exists but is `diagnostic`** — needs `-XX:+UnlockDiagnosticVMOptions` first                         | 1 without unlock |

[MEASURED, all rows]

`PrintGC`, `PrintGCDetails` and `PrintCompilation` are confirmed live `{product}` flags by
`-XX:+PrintFlagsFinal` [MEASURED].

**The three survivors are identical in JDK 21, 25 and 26** — the deprecation-and-alias code is
byte-for-byte the same at `jdk-21+35`, `jdk-25+36` and `jdk-26+35`:

```cpp
} else if (match_option(option, "-Xloggc:", &tail)) {
  log_warning(gc)("-Xloggc is deprecated. Will use -Xlog:gc:%s instead.", tail);
...
if (PrintGCDetails) {
  log_warning(gc)("-XX:+PrintGCDetails is deprecated. Will use -Xlog:gc* instead.");
```

`src/hotspot/share/runtime/arguments.cpp` [SRC, three tags checked]. **So a JDK 21 → 25 → 26
upgrade does not change legacy-flag behaviour**; anything that was going to break already broke
before JDK 21.

### 8.2 DOC — the official mapping tables

**GC flags** — man page §"Convert GC Logging Flags to Xlog"
(https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html) [DOC]:

| Legacy GC flag                       | `-Xlog` equivalent            | Note (verbatim from the table)                 |
| ------------------------------------ | ----------------------------- | ---------------------------------------------- |
| `PrintGC`                            | `-Xlog:gc`                    | —                                              |
| `PrintGCDetails`                     | `-Xlog:gc*`                   | —                                              |
| `PrintGCTimeStamps`                  | _Not Applicable_              | "Time stamps are logged by the framework."     |
| `PrintGCDateStamps`                  | _Not Applicable_              | "Date stamps are logged by the framework."     |
| `PrintGCID`                          | _Not Applicable_              | "GC ID is now always logged."                  |
| `PrintGCCause`                       | _Not Applicable_              | "GC cause is now always logged."               |
| `PrintTenuringDistribution`          | `-Xlog:gc+age*=level`         | debug for the relevant info, trace for all     |
| `PrintAdaptiveSizePolicy`            | `-Xlog:gc+ergo*=level`        | debug for most, trace for all                  |
| `PrintHeapAtGC`                      | `-Xlog:gc+heap=trace`         | —                                              |
| `PrintReferenceGC`                   | `-Xlog:gc+ref*=debug`         | old flag only had effect with `PrintGCDetails` |
| `PrintGCApplicationStoppedTime`      | `-Xlog:safepoint`             | not separated from ConcurrentTime any more     |
| `PrintGCApplicationConcurrentTime`   | `-Xlog:safepoint`             | same tag as the above                          |
| `PrintGCTaskTimeStamps`              | `-Xlog:gc+task*=debug`        | —                                              |
| `PrintStringDeduplicationStatistics` | `-Xlog:gc+stringdedup*=debug` | —                                              |
| `G1PrintHeapRegions`                 | `-Xlog:gc+region=trace`       | —                                              |
| `GCLogFileSize`                      | _no configuration available_  | "Log rotation is handled by the framework."    |
| `NumberOfGCLogFiles`                 | _Not Applicable_              | "Log rotation is handled by the framework."    |
| `UseGCLogFileRotation`               | _Not Applicable_              | —                                              |

Correction to note in the skill: the Oracle table maps `GCLogFileSize`/`NumberOfGCLogFiles` to
"no configuration available", which is misleading — the actual replacements are the
`filesize=` / `filecount=` **output options** (§4.4). The table means "not a JVM flag any more".

**Runtime flags** — man page §"Convert Runtime Logging Flags to Xlog", prefaced with the
categorical statement:

> "**These legacy flags are no longer recognized and will cause an error if used directly.**
> Use their unified logging equivalent instead." [DOC]

| Legacy runtime flag         | `-Xlog` equivalent                              |
| --------------------------- | ----------------------------------------------- |
| `TraceClassLoading`         | `-Xlog:class+load=level` (info / debug)         |
| `TraceClassUnloading`       | `-Xlog:class+unload=level` (info / trace)       |
| `TraceClassLoadingPreorder` | `-Xlog:class+preorder=debug`                    |
| `TraceClassResolution`      | `-Xlog:class+resolve=debug`                     |
| `TraceClassInitialization`  | `-Xlog:class+init=info`                         |
| `TraceClassPaths`           | `-Xlog:class+path=info`                         |
| `TraceLoaderConstraints`    | `-Xlog:class+loader+constraints=info`           |
| `TraceClassLoaderData`      | `-Xlog:class+loader+data=level` (debug / trace) |
| `TraceExceptions`           | `-Xlog:exceptions=info`                         |
| `VerboseVerification`       | `-Xlog:verification=info`                       |
| `TraceSafepointCleanupTime` | `-Xlog:safepoint+cleanup=info`                  |
| `TraceSafepoint`            | `-Xlog:safepoint=debug`                         |
| `TraceMonitorInflation`     | `-Xlog:monitorinflation=debug`                  |
| `TraceRedefineClasses`      | `-Xlog:redefine+class*=level`                   |

Also documented: `-verbose:class` ≡ `-Xlog:class+load=info,class+unload=info` [DOC].

### 8.3 JBS — when each stopped working

| Flag family                                                                                                                                                    | Deprecated                             | Obsoleted (ignored + warning)        | Removed (JVM refuses)                                    | Source                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `TraceClassLoading`, `TraceClassUnloading`, `TraceExceptions` (the aliased `Trace*` set)                                                                       | JDK 9                                  | **JDK 16**                           | JDK 17                                                   | JDK-8256718 / JDK-8257118 "Obsolete the long term deprecated and aliased Trace flags", and release note **JDK-8257429** [JBS] |
| `PrintSafepointStatistics`, `PrintSafepointStatisticsTimeout`, `PrintSafepointStatisticsCount`                                                                 | **JDK 11** (JDK-8191421 / JDK-8191422) | **JDK 12** (JDK-8198720)             | JDK 13                                                   | https://bugs.openjdk.org/browse/JDK-8198720 [JBS]                                                                             |
| `PrintGC`, `PrintGCDetails`, `-Xloggc:`                                                                                                                        | JDK 9                                  | **still not obsoleted as of JDK 26** | —                                                        | `arguments.cpp` at `jdk-26+35` [SRC] + [MEASURED]                                                                             |
| `PrintGCTimeStamps`, `PrintTenuringDistribution`, `PrintReferenceGC`, `PrintAdaptiveSizePolicy`, `UseGCLogFileRotation`, `NumberOfGCLogFiles`, `GCLogFileSize` | JDK 9                                  | —                                    | **gone by JDK 21** (exact release UNRESOLVED, see below) | [MEASURED on 25; man page "no longer recognized" [DOC]]                                                                       |

JDK-8257429 release note, verbatim and worth quoting in the skill:

> "When Unified Logging was added in Java 9, a number of tracing flags were deprecated and
> mapped to their unified logging equivalent. **These flags are now obsolete and will no longer
> be converted automatically to enable unified logging.** To continue getting the same logging
> output, you must explicitly replace the use of these flags with their unified logging
> equivalent."
> — https://bugs.openjdk.org/browse/JDK-8257429 [JBS]

### 8.4 The `PrintCompilation` special case

`-XX:+PrintCompilation` is **not** a removed flag and **not** UL. It still exists as a product
flag on JDK 25 and writes its own format to stdout, bypassing the whole framework — no tags, no
decorators, no `file=`, no rotation, no async, not reconfigurable by `jcmd`. The UL replacement
is `-Xlog:jit+compilation` (§3.4), and JDK-8356259 states the intent explicitly: these
"serve as convenient replacements for `-XX:+PrintCompilation`, `-XX:+PrintInlining`, etc. ...
because UL can be forwarded to file, their format can be adjusted, and they can be handled
asynchronously." [JBS]

There is also an old completed RFE confirming the original intent: **JDK-8172285 "UL support for
PrintCompilation", Fix Version JDK 10, Resolved/Fixed**
— https://bugs.openjdk.org/browse/JDK-8172285 [JBS].

---

## 9. Known traps

Each trap below is stated with its evidence class, so the skill can teach the ones that are
verified and hedge the ones that are not.

### 9.1 The silent empty log — two different causes, only one of which warns

Covered in detail in §5.3(d) and §5.3(e). Restated because it is the single highest-value
thing the skill can teach:

- **Cause A — no tag-set matches.** `-Xlog:gc+jit=trace:file=x.log` → JVM starts, exit 0,
  `x.log` is **0 bytes**, and the only clue is a `[warning][logging] No tag set matches
selection` line **on stdout, which is not in your file** [MEASURED].
- **Cause B — tag-set matches, level too high, or the event never occurred.**
  `-Xlog:gc+age` at default info → 0 lines; `=debug` → 21 lines on the identical workload.
  **No warning at all** [MEASURED].

Both look identical on disk. The workflow in §5.3 separates them.

### 9.2 Decorators are an output property — a second `-Xlog` silently rewrites them

`-Xlog:gc:file=v4.log:uptime -Xlog:safepoint:file=v4.log:pid,tid` → the _gc_ lines are written
with `pid,tid` and no `uptime` [MEASURED]. Any downstream parser keyed on
`^\[\d+\.\d+s\]\[info\]\[gc\]` silently matches zero lines from that point on, and the log
still looks perfectly well-formed to a human.

Related, same family:

- `decorators=none` produces lines with no timestamp at all — unparseable by anything
  time-based, and the man page's own example `-Xlog:gc=debug:file=gc.txt:none` will hand you
  exactly that [DOC].
- Decorator **order is fixed by the framework**, not by the order you write them (§4.2) [DOC],
  so `pid,uptime` and `uptime,pid` produce byte-identical output — a parser author who assumes
  the flag order is the field order is wrong.
- Third-party GC log parsers generally expect the _default_ `uptime,level,tags`. Changing
  decorators to add `pid`/`hostname` for a log aggregator can break them. [MECHANISM — I did
  not test any specific parser.]

### 9.3 `filesize` rotating away the interesting window

Defaults are `filecount=5, filesize=20M` [SRC/DOC], i.e. 100 MB of history. A `gc*=debug` or
`safepoint=trace` selection on a busy JVM can exceed that in minutes, so by the time an
operator attaches, the incident is gone. Compounding factors, all verified:

- **Every JVM restart consumes a rotation slot** — the existing file is archived at startup
  (§4.5) [SRC + MEASURED]. Five restarts in a crash loop erase the history entirely.
- **`filecount=0` does not mean "keep everything"** — it means "no rotation, and truncate the
  existing file on startup" [MEASURED + `-Xlog:help`]. This is the most common
  misreading, and it destroys the previous run's log on every restart.
- **`filecount=0` also disables manual `VM.log rotate`** (`force_rotate` no-ops) [SRC].
- Mitigations to teach: `filesize=0` + `filecount>0` (never auto-rotate; rotate on demand via
  `jcmd`), and `file=gc-%p-%t.log` so restarts never collide [DOC].

### 9.4 stdout logging interleaves with application output

Demonstrated accidentally and then deliberately: running the benchmark with
`-Xlog:gc*=trace:stdout`, the program's own final `System.out.println` was buried among GC
trace lines, and a `tail -1` on the process output returned a **log line, not the program's
output** [MEASURED]:

```
[1.020s][trace][gc,marking           ]   Total concurrent time = ...
```

Consequences: any tool that parses application stdout (a CLI, a JSON-emitting job, a container
log shipper with a structured-JSON parser) is corrupted by UL on stdout. JEP 158 guarantees
only that individual _lines_ are not interleaved [DOC] — it guarantees nothing about
interleaving with the application's own writes.

Also note the asymmetry from §5.3: **UL's own configuration warnings go to stdout even when the
log itself goes to a file.** So "send logs to a file" does not fully separate the streams.

### 9.5 `debug`/`trace` in production

- Measured cost at an extreme rate: sync `gc*=trace` cost **+26%** wall time; async **+5%**
  (§7.1) [MEASURED]. Realistic production selections are far cheaper, but the shape is real.
- With async + a small buffer, **32% of messages were silently dropped** (27,772 of ~40,860)
  and the loss was reported only by 21 in-band `messages dropped due to async logging` lines
  (§7.2) [MEASURED]. **A log that is missing a third of its content while looking complete is
  worse than no log.** Any analysis skill must grep for that string.
- `stall` mode trades that for application blocking: 893 ms vs 811 ms in the same test
  [MEASURED].

### 9.6 Misc. traps worth a line each

- **`-Xlog:disable` removes the warning/error safety net.** After it, JVM warnings and errors
  are silent unless you re-enable them (§5.2) [DOC + MEASURED].
- **`jcmd VM.log` output indices renumber** after any output is removed — script by name, not
  by `#N` [MEASURED, §6.1].
- **`async` cannot be enabled at runtime** — it is a restart-only decision [MEASURED, §6.2].
- **`gc,safepoint` excludes messages tagged with both** — the union of two exact matches is not
  the same as `gc*,safepoint*` [DOC, §1.4].
- **A tag existing does not mean a tag-set exists.** `jit` is a real tag, yet `-Xlog:jit` alone
  matches nothing and warns [MEASURED, §3.4]. Teach "select tag-sets, not tags".
- **The header file's tag list over-counts a product build by 8 tags** (§3.1) — always confirm
  with `-Xlog:help` on the target JDK.
- **`-XX:+PrintCompilation` looks like it works and is not UL** — no file, no rotation, no
  `jcmd` control (§8.4) [MEASURED].
- **`-XX:+PrintInlining` requires `-XX:+UnlockDiagnosticVMOptions` _before_ it on the command
  line** — order matters, and the error message says so [MEASURED].
- **`foldmultilines=true` can corrupt non-UTF-8 output** (Shift-JIS, BIG5) [DOC, §4.4].
- **`AsyncLogBufferSize` is split in half** between two buffers, so effective in-flight capacity
  is half the number you set [SRC, §7.2].

---

## UNRESOLVED

Listed honestly; none of these should be filled in from recall.

1. **Exact removal release for the GC print flags.** I established that
   `PrintGCTimeStamps`, `PrintTenuringDistribution`, `PrintReferenceGC`,
   `PrintAdaptiveSizePolicy`, `UseGCLogFileRotation`, `NumberOfGCLogFiles` and `GCLogFileSize`
   are **fully gone on JDK 25** [MEASURED] and that the man page calls the runtime set "no
   longer recognized" [DOC]. I could **not** find the JBS issue that obsoleted/expired the GC
   ones, so I cannot name the release (deprecated JDK 9 is documented; obsoleted/expired is
   not). My JBS searches for `summary~"Obsolete" AND summary~"PrintGC"` and variants returned
   nothing. **Do not state a release number for these.** Safe wording for the skill: "removed
   before JDK 21; the JVM refuses to start."
2. **JDK 21 behaviour of `-Xlog:async:drop`.** JDK 25 accepts `drop`/`stall`; JDK 21's
   `logConfiguration.cpp` has no mode parsing at all [SRC]. Whether JDK 21 _rejects_
   `-Xlog:async:drop` as an invalid directive or silently ignores the suffix is **untested** —
   I have no JDK 21 installed. [MECHANISM says "rejects"; not verified.] Anything the skill
   says about JDK 21 async syntax should be limited to "bare `-Xlog:async` is the only form
   documented for JDK 21".
3. **All JDK 21-specific runtime behaviour in this brief.** Every `[MEASURED]` claim was made on
   Temurin 25.0.3. Where JDK 21 is asserted (the `jit+compilation` debug level, the absence of
   `stall`, the legacy-flag aliasing), the evidence is **source at `jdk-21+35`**, not
   execution. Cross-version claims about _diagnostic text_ (e.g. does JDK 21 print the same
   "No tag set matches selection" wording?) are **unverified**.
4. **JDK 26 runtime behaviour.** JDK 26 claims here rest entirely on `jdk-26+35` source [SRC].
   No JDK 26 binary was run. The only JDK 26 delta I found is three new tags
   (`asan`, `package`, `vmatree`); I did **not** exhaustively diff `logConfiguration.cpp`,
   `logFileOutput.cpp` or the man page for JDK 26, so **other behavioural changes may exist**.
   The JDK 26 `java` man page was not fetched.
5. **Published overhead benchmarks.** No primary-source, citable measurement of UL overhead
   exists that I could find. JDK-8229517 references a hotspot-dev mailing-list thread from
   August 2019, but its numbers describe prototype patches on pre-JDK-17 builds and are not
   usable as a citation. The numbers in §7 are **my own**, on one machine, one OS, one JDK —
   they should be presented in the skill as an illustration of shape, never as "UL costs N%".
6. **Async logging under `stall` and `jcmd VM.log` interaction.** `configure_output` forces
   `AsyncLogWriter::flush()` [SRC]; I did not measure how long a `VM.log` call blocks on a
   saturated async buffer. Flagged as MECHANISM in §6.2.
7. **Which tag-set is `{compilation}` alone.** `-Xlog:compilation` produced **no** "no tag set
   matches" warning, which per `logSelectionList.cpp` means a tag-set of exactly
   `{compilation}` is registered somewhere — yet it emitted zero lines in every run I did. I
   did not locate the call site. Minor, but it means "`-Xlog:compilation` alone is useless in
   practice" is [MEASURED] while "`-Xlog:compilation` alone matches nothing" would be **wrong**.
8. **MBean/JMX path for runtime reconfiguration.** The man page states diagnostic commands are
   "automatically exposed as MBeans" so JMX can drive UL [DOC]; I did not exercise the
   `DiagnosticCommand` MBean and cannot confirm the exact object name or signature.
9. **`hostname`/`utctime` decorator availability on JDK 21.** I verified the decorator list on
   JDK 25 by execution and on the man page, but my attempt to extract `DECORATOR_LIST` from
   `logDecorations.hpp` returned empty for all three tags (the macro is shaped differently than
   my grep assumed). The JDK 21 decorator list is therefore **unverified** — treat the table in
   §4.2 as JDK 25.

---

## Appendix: source URLs used

Primary documentation

- https://openjdk.org/jeps/158 — JEP 158, Unified JVM Logging
- https://openjdk.org/jeps/271 — JEP 271, Unified GC Logging
- https://openjdk.org/jeps/0 — complete JEP index (searched; no async-logging JEP exists)
- https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html — `-Xlog` reference
- https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html — `jcmd`
- https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html — JDK 21 counterpart (not
  differenced; see UNRESOLVED #3)

OpenJDK source (all at pinned tags)

- .../jdk-25+36/src/hotspot/share/logging/logTag.hpp — `LOG_TAG_LIST`
  (also fetched at `jdk-17+35`, `jdk-21+35`, `jdk-26+35`, `master`)
- .../jdk-25+36/src/hotspot/share/logging/logConfiguration.cpp — merge/override, help text
- .../jdk-25+36/src/hotspot/share/logging/logSelection.cpp — parsing, fuzzy suggestions
- .../jdk-25+36/src/hotspot/share/logging/logSelectionList.cpp — "No tag set matches selection"
- .../jdk-25+36/src/hotspot/share/logging/logFileOutput.cpp / .hpp — rotation, restart, defaults
- .../jdk-25+36/src/hotspot/share/logging/logAsyncWriter.cpp / .hpp — buffer, drop reporting
- .../jdk-25+36/src/hotspot/share/compiler/compileTask.cpp — `LogTarget(Info, jit, compilation)`
  (also fetched at `jdk-21+35`, showing `Debug`)
- .../{jdk-21+35,jdk-25+36,jdk-26+35}/src/hotspot/share/runtime/arguments.cpp — legacy aliases
  (base URL: https://github.com/openjdk/jdk/blob/<tag>/…, raw via raw.githubusercontent.com)

OpenJDK bug system

- https://bugs.openjdk.org/browse/JDK-8229517 — async UL, **JDK 17**
- https://bugs.openjdk.org/browse/JDK-8323807 — `async:stall`, **JDK 25**
- https://bugs.openjdk.org/browse/JDK-8377827 — release note for `async:stall`, **JDK 25**
- https://bugs.openjdk.org/browse/JDK-8356259 — lift `jit*` to info, **JDK 25**
- https://bugs.openjdk.org/browse/JDK-8172285 — UL support for PrintCompilation, **JDK 10**
- https://bugs.openjdk.org/browse/JDK-8257429 — release note, `Trace*` obsolete, **JDK 16**
- https://bugs.openjdk.org/browse/JDK-8256718 / JDK-8257118 — obsolete `Trace*`, **JDK 16**
- https://bugs.openjdk.org/browse/JDK-8198720 — obsolete `PrintSafepointStatistics*`, **JDK 12**
- https://bugs.openjdk.org/browse/JDK-8191421 / JDK-8191422 — deprecate the same, **JDK 11**
