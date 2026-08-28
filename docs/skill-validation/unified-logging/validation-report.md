# Validation report — `unified-logging`

Independent adversarial validation. The validator did not write the skill.

**Execution environment for every `[RUN]` below:** Temurin OpenJDK **25.0.3+9-LTS**,
Windows 11 Pro 26200, x86-64, Git Bash. Source checks (`[SRC]`) are against pinned tags on
`raw.githubusercontent.com/openjdk/jdk`. JBS checks (`[JBS]`) via the REST API.

Counts: **1 BLOCKER · 3 MAJOR · 6 MINOR · 3 NIT.** Gate verdict: **FAIL**.

---

## BLOCKER

### B1 — `references/outputs-and-rotation.md:104-105`: the rotation command does not start a JVM

The file states:

> Three consecutive `java -Xlog:gc*:file=fc3.log:filecount=3 -version` runs left `fc3.log`,
> `fc3.log.0` and `fc3.log.1`.

`filecount=3` is in the **third** colon-separated field, which is _decorators_, not
output-options. `[RUN]`:

```
$ java -Xlog:gc*:file=fc3.log:filecount=3 -version
[0.002s][error][logging] Invalid decorator 'filecount=3'.
Invalid -Xlog option '-Xlog:gc*:file=fc3.log:filecount=3', see error log for details.
Error: Could not create the Java Virtual Machine.
$ echo $?
1
```

This is the skill's own failure mode one — a JVM that refuses to start — printed as the
evidence for its restart-archiving rule. It is also inherited verbatim from the research
brief §4.5, so the brief's `[MEASURED]` label on that line cannot be correct either.

**The conclusion it supports is right; only the command is wrong.** With the empty decorator
field, `[RUN]`:

```
$ for i in 1 2 3; do java -Xlog:gc*:file=fc3.log::filecount=3 -version; done
fc3.log  fc3.log.0  fc3.log.1
$ # after 6 runs
fc3.log  fc3.log.0  fc3.log.1  fc3.log.2       # capped at filecount+1 = 4 files
```

**Fix:** `java -Xlog:gc*:file=fc3.log::filecount=3 -version` (note the double colon). This is
the only malformed `-Xlog` invocation in the package — I extracted and inspected all 78
`-Xlog:` occurrences across `SKILL.md` and the five references; every other one is
syntactically valid.

---

## MAJOR

### M1 — `SKILL.md:94` (and the "Verified by execution" claim at :98): the fatal diagnostic is on **stdout**, not stderr

The failure-mode table's first row says the diagnostic is
`Invalid tag/level/decorator … on stderr`. Line 98 asserts "Verified by execution on Temurin
25.0.3". It was not. `[RUN]`:

```
$ java -Xlog:notatag -version 2>/dev/null          # stdout only
[0.002s][error][logging] Invalid tag 'notatag' in log selection.

$ java -Xlog:notatag -version 2>&1 1>/dev/null     # stderr only
Invalid -Xlog option '-Xlog:notatag', see error log for details.
Error: Could not create the Java Virtual Machine.
```

The line that names _which_ token is wrong — the only one with diagnostic value — is a UL
message routed to the default `stdout` output. stderr carries only the launcher's generic
refusal. Same split for `-Xlog:gc=verbose` and `-Xlog:gc::foobar` `[RUN]`.

This matters because the skill's central thesis is stream discipline ("the warning goes to
stdout, never into the file you named"). Getting the fatal case backwards tells an operator
whose container captures only stderr that they will see the tag name. They will not.

**Fix:** replace the Diagnostic cell with
`` `Invalid tag/level/decorator …` **on stdout**; the generic `Invalid -Xlog option …` and `Could not create the Java Virtual Machine` on stderr ``.
The row is then consistent with the rest of the table: _every_ UL diagnostic is on stdout.

### M2 — `references/outputs-and-rotation.md:13-20`: `%hn` is JDK 23+, presented unversioned

The placeholder table lists `%p`, `%t`, `%hn` with no version qualifier, in a skill whose
first workflow step is "pin the JDK version before writing a flag".

`[SRC]` — `src/hotspot/share/logging/logFileOutput.cpp`, occurrences of
`HostnameFilenamePlaceholder`:

| tag         | occurrences                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| `jdk-21+35` | **0**                                                                       |
| `jdk-22+36` | **0**                                                                       |
| `jdk-23+37` | 6                                                                           |
| `jdk-24+36` | 6                                                                           |
| `jdk-25+36` | 6 (`const char* const LogFileOutput::HostnameFilenamePlaceholder = "%hn";`) |

Corroborated by JDK 21's own help string `[SRC, logConfiguration.cpp:606]`:
`"If the filename contains %%p and/or %%t, they will expand to the JVM's PID and startup timestamp, respectively."`
— no `%hn`. JDK 25's help `[RUN]` adds `%hn`.

The failure is silent: on JDK 21, `file=gc-%hn.log` creates a file literally named
`gc-%hn.log`. No warning, exit 0. On JDK 25 `[RUN]` it correctly produced `h-Kades.log`.

**Fix:** mark the `%hn` row **JDK 23+**, and add a sentence: on JDK 21/22 the token is not
substituted and appears literally in the filename.

### M3 — `SKILL.md:57-60`: the mandated verification `grep` returns a false negative on any multi-tag-set output

Step 5 makes this the load-bearing assertion:

> the file is non-empty **and** contains the tag-set — `grep '\[gc,age\]' gc.log`, not `wc -l`.

UL pads the `tags` decoration to the width of the widest tag-set written to that output.
`[RUN]`, `-Xlog:gc*` over an allocation workload:

```
[0.006s][info][gc,init] CardTable entry size: 512
[0.006s][info][gc     ] Using G1
```

so `grep '\[gc\]' gc.log` returns **0** on a file that plainly contains six `gc` lines. The
literal `gc,age` example happens to work only because that output carries a single tag-set
(verified: `grep -c '\[gc,age\]' age_dbg.log` → 5).

This is compounded by `references/selection-syntax.md:14-16`, which correctly recommends the
wildcard as the discovery step and then says to read the tag-sets out of the `tags`
decoration — the exact combination that trips the padding.

**Fix:** `grep -E '\[gc,age *\]' gc.log`, plus one sentence stating that the tags field is
space-padded to the widest tag-set on that output, so an unanchored fixed-string grep can
report a false empty.

---

## MINOR

### N1 — description exceeds Claude Code's display budget

`node packages/cli/bin/agent-skills.mjs validate skills/unified-logging` `[RUN]`:

```
! description  Description is 1089 characters; Claude Code shows roughly the first 1024
✓ Valid, with 1 warning
```

Cutting at 1024 lands mid-word in `jvm-class-lo|ading`, dropping the
`startup-cds-crac-leyden` and `structured-logging` hand-offs. Those are the two boundary
statements the selector most needs and never sees.

**Fix:** trim ~70 characters — the `code-cache-segments` and `jvm-class-loading` clauses can
be folded, since neither is a likely mis-route for an `-Xlog` question.

### N2 — the skill is not in `registry/skills.yaml`

`grep -c "unified-logging" registry/skills.yaml` → **0**. Per `CLAUDE.md`, any edit under
`skills/` requires `npm run registry:build`; `npm run verify` fails without it.

**Fix:** run `npm run registry:build`.

### N3 — duplicated facts between body and references (anti-patterns.md: "One home per fact")

Each of these has two or three homes and will diverge:

| Fact                                       | Body               | Reference                                                          |
| ------------------------------------------ | ------------------ | ------------------------------------------------------------------ |
| decorators are an output property          | `SKILL.md:120-121` | `outputs-and-rotation.md:54-57`                                    |
| `pid,uptime` ≡ `uptime,pid` byte-identical | `SKILL.md:122-123` | `outputs-and-rotation.md:26-28`                                    |
| `filecount=0` truncates on startup         | `SKILL.md:113-116` | `outputs-and-rotation.md:91-96`                                    |
| restart consumes a rotation slot           | `SKILL.md:117-119` | `outputs-and-rotation.md:102-106`                                  |
| `%p`/`%t` in the filename                  | `SKILL.md:118-119` | `outputs-and-rotation.md:13-22`                                    |
| async is restart-only                      | `SKILL.md:124-125` | `runtime-reconfiguration.md:69-72` **and** `async-and-cost.md:132` |
| no citable published overhead benchmark    | `SKILL.md:126-129` | `async-and-cost.md:72-75`                                          |
| `-Xlog:jit` alone matches nothing          | `SKILL.md:51`      | `selection-syntax.md:72`                                           |
| legacy flags split three ways              | `SKILL.md:130-136` | `legacy-flags.md:8-32`                                             |

**Fix:** in the body keep only the one-line rule and the routing condition; delete the
supporting detail that the reference already owns.

### N4 — `references/runtime-reconfiguration.md:10-24` presents a paraphrase as command output

The fenced block follows `jcmd <pid> help VM.log` and reads as a transcript, but it is not
what the command prints. `[RUN]` on JDK 25.0.3 the real output includes
`Syntax : VM.log [options]`, the line
`Options: (options must be specified using the <key> or <key>=<value> syntax)`, and every
option ends `(STRING, no default value)` / `(BOOLEAN, no default value)`. The skill's version
has been reworded and shortened.

**Fix:** either paste the real output or drop the fence and present it as a summary table.

### N5 — `references/runtime-reconfiguration.md:33` shows an incomplete baseline

The "JVM started with no logging flags" example shows only `#0`. `[RUN]` `VM.log list` on
such a JVM prints two lines:

```
 #0: stdout all=warning uptime,level,tags foldmultilines=false
 #1: stderr all=off uptime,level,tags foldmultilines=false
```

Showing both makes the body's rule about the warning baseline concrete, and prepares the
reader for the "`stdout`/`stderr` can be silenced but never removed" limit stated 44 lines
later.

### N6 — conditionally-relevant material in the body

House gate: "The body contains nothing that is only conditionally relevant." `SKILL.md:130-136`
(the pre-JDK-9 flag classification) is relevant only when a legacy flag is present — which is
precisely the routing condition already stated for `legacy-flags.md` at `SKILL.md:159-162`.
Same shape for the async restart-only rule at `:124-125`. Body is 144 lines excluding
frontmatter, well under the 500-line gate, so this is about attention, not length.

---

## NIT

### T1 — `SKILL.md:75-80`, the `{gc,safepoint}` column is hypothetical

No `gc,safepoint` tag-set appeared in any run. `[RUN]`, `-Xlog:gc*=trace` over an allocation
workload, distinct tag-sets observed: `gc`, `gc,phases`, `gc,heap`, `gc,init`, `gc,metaspace`,
`gc,task`, `gc,start`, `gc,exit`, `gc,cpu`. The column is structurally correct and the
`gc,safepoint` **row** is the one the man page itself uses, so the teaching holds — but the
`{gc,age,ergo}` column already carries the superset lesson against a set that is at least
plausible. Consider a footnote that the column is illustrative.

### T2 — `references/outputs-and-rotation.md:111-112`, the FIFO special case is missing one condition

The skill says "if the target is a FIFO or named pipe and `filecount` was left at its default".
`[SRC, jdk-25+36 logFileOutput.cpp:203-205]` the guard is
`if (file_exist && _is_default_file_count && is_fifo_file(_file_name))` — the pipe must
already exist. Off by one condition; harmless in practice.

### T3 — unquoted `gc*` in shell examples

`selection-syntax.md:14,100` and `outputs-and-rotation.md:104` write `-Xlog:gc*` bare. Under a
POSIX shell the whole word is the glob pattern, so a match is very unlikely, but a skill that
mandates running its own commands is safer quoting the selection.

---

## What I checked that held up

Recording these so the report is a confidence signal, not only a fault list. Everything below
was independently reproduced.

**Tag and flag reality**

- `-Xlog:help` on Temurin 25.0.3 lists exactly **179** tags — matches `selection-syntax.md:25`.
  None of the eight `NOT_PRODUCT`/`DEBUG_ONLY` tags (`codestrings, deathtest, downcall,
foreign, generate, heapsampling, test, upcall`) nor `protectiondomain` appears. `[RUN]`
- `LOG_TAG_LIST` counts **176 / 188 / 191** at `jdk-21+35` / `jdk-25+36` / `jdk-26+35` —
  exact match to `selection-syntax.md:24-25`. `[SRC]`
- Tag deltas reproduced by diffing the three tags: 21→25 added
  `aot array cause deathtest heapdump inlinecache jmethod link methodtrace monitortable native
training trimnative`, removed `protectiondomain`; 25→26 added `asan package vmatree`, removed
  none. Exactly `selection-syntax.md:32-35`. `[SRC]`
- `jit` and `compilation` both exist; neither renamed. `LogTarget(Debug, jit, compilation)` at
  `jdk-21+35:453,461` → `LogTarget(Info, jit, compilation)` at `jdk-25+36:454,462`. `[SRC]`
  JDK-8356259 resolution Fixed, fix version **25**. `[JBS]`
- `-Xlog:jit+compilation` on JDK 25 → 8 lines at `[info][jit,compilation]`; `-Xlog:jit` alone →
  `No tag set matches selection: jit. Did you mean … jit* jit+thread jit+inlining
jit+compilation`; `-Xlog:compilation` alone → accepted, **no** warning, 0 lines;
  `jit*=trace` → `jit,compilation` + `jit,thread`; `compilation*=trace` → `compilation,codecache`
  - `jit,compilation`. Every row of `selection-syntax.md:70-75` is directionally exact. `[RUN]`
- JBS fix versions all confirmed: JDK-8229517 → **17**, JDK-8323807 → **25**, JDK-8377827 →
  **25**, JDK-8172285 → **10**, JDK-8257429 → **16**, JDK-8198720 → **12**. `[JBS]`
- `logConfiguration.cpp` at `jdk-21+35` prints only `-Xlog:async` (line 631) with zero
  occurrences of "stall"; JDK 25 accepts `-Xlog:async`, `:drop`, `:stall` (exit 0 each) and
  rejects `:bogus`. `async-and-cost.md:20-27` is correct. `[SRC + RUN]`
- Every row of the legacy-flag table in `legacy-flags.md:12-24` reproduced by execution,
  including the three deprecation strings verbatim, all eight removals exiting 1, and
  `PrintInlining`'s `The unlock option must precede 'PrintInlining'`. `[RUN]`

**Causality and selection semantics**

- Level is a threshold: `-Xlog:gc=debug` produced 8 debug **and** 1 info line in one file. `[RUN]`
- `gc,safepoint` is a union of exact matches: output contained only `[gc]` and `[safepoint]`,
  never a combined set. `gc*` breadth vs `gc`: 101 vs 6 lines on the same workload. `[RUN]`
- All three failure modes reproduced exactly: unknown tag → exit 1; `gc+jit=trace:file=…` →
  exit 0, warning on stdout with five suggestions, **0-byte** file; `gc+age` at info → 0 lines,
  at debug → 5 lines, **no warning either way**. `[RUN]`
- Decorator override across two `-Xlog` arguments to one file: gc lines emerged as
  `[88228][322624] …`, having silently lost `uptime`. `[RUN]`

**Rotation, jcmd, async**

- `DefaultFileCount = 5`, `DefaultFileSize = 20 * M`, `MaxRotationFileCount = 1000` at
  `jdk-25+36 logFileOutput.hpp:43,44,48`. `[SRC]`
- Suffix zero-padding to the digit width of `filecount - 1`: `filecount=12` produced
  `p12.log`, `p12.log.00`, `p12.log.01`. `filecount=0` over two runs left one file, no
  archives. `[RUN]`
- All four `jcmd VM.log` recipes executed successfully against a live JVM, including the exact
  `output=file=rt.log what=gc*=debug decorators=… output_options=filecount=3,filesize=1m` form,
  `rotate` (→ `rt.log` + `rt.log.0`), and `what=all=off`. `async=true` failed with the exact
  quoted text: `java.lang.IllegalArgumentException: Unknown argument 'async' in diagnostic
command.` `[RUN]`
- `-Xlog:disable` set `#0` and `#1` to `all=off`; without it, the `all=warning` baseline
  coexists with an added file output (`#0: stdout all=warning` alongside `#2: file=b.log`). `[RUN]`
- `AsyncLogBufferSize` `{product}`, default `2097152`, range `[102400 … 52428800]`. `[RUN]`
- Drop reproduced at the minimum buffer: 12 in-band notices, verbatim format matching the
  skill's quote including the empty tags field —
  `[0.248s][warning][                     ]    346 messages dropped due to async logging`.
  `stall` on the same workload: 0 drops, more lines, longer wall time. `[RUN]`

**Measurement discipline** — the body quotes **no** percentage; `SKILL.md:126-129` forbids it
explicitly. The single overhead figure lives in `async-and-cost.md:70-95` under the heading
"One measurement, and how to read it", opens with "This is a single-machine, single-JDK
observation, not a benchmark", carries JDK build, OS, arch, heap, disk, workload, message rate,
run count and method, and closes by naming what it does not establish. This is the standard the
checklist asked for and the skill meets it.

**Scope hygiene** — `gc-log-analysis`'s description now explicitly cedes "-Xlog syntax itself —
proving a selection emits anything, rotation, async logging and migrating pre-JDK-9 flags" to
this skill, and this skill's description reciprocates. No contradiction found between the two,
nor with `safepoints` (whose `-Xlog:safepoint` commands are all well-formed 4-field forms and
whose `PrintSafepointStatistics` history agrees with `legacy-flags.md`). One soft overlap
remains: `gc-log-analysis/SKILL.md:46` still prescribes
`-Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m` — a rotation
configuration — which the boundary says belongs here. It is a defensible domain default rather
than a contradiction, so it is not filed as a finding, but the two skills should not both grow
rotation advice.

**Cargo-cult sweep** — clean. No JDK 8-era advice, and no flag set offered as a good default to
copy: `async-and-cost.md:125-130` gives a situational decision table, not a paste-in line. The
body's step 6 explicitly defers the production shape until after two verification steps.

**Two of the brief's UNRESOLVED items I was able to close** (both in the skill's favour):

- UNRESOLVED #9, the JDK 21 decorator list: `DECORATOR_LIST` at `jdk-21+35
logDecorators.hpp:44-55` is **identical** to JDK 25 — all twelve decorators, same
  abbreviations. `outputs-and-rotation.md:49-50`'s hedge is now unnecessary but harmless. `[SRC]`
- The `VM.log` option set is unchanged between JDK 21 and 25 (`_output, _output_options, _what,
_decorators, _disable, _list, _rotate` at both tags, `logDiagnosticCommand.hpp`), so
  `runtime-reconfiguration.md` generalises safely to JDK 21. `[SRC]`

**Correctly left unresolved.** The skill states nothing the brief marks unresolved. Every
UNRESOLVED item is either hedged in the same words the brief recommended
(`legacy-flags.md:43-46` refuses to name a removal release; `async-and-cost.md:29-31` refuses
to state JDK 21's `:drop` behaviour; `selection-syntax.md:73` records `{compilation}` as
registered-but-not-fired) or omitted. No unresolved item is asserted as fact — the highest-risk
class of defect for this skill is absent.

---

## Validated range and residual uncertainty

**Validated by execution against:** Temurin OpenJDK **25.0.3+9-LTS** on Windows 11 x86-64.

**Validated by pinned source only (not executed):** `jdk-17+35`, `jdk-21+35`, `jdk-22+36`,
`jdk-23+37`, `jdk-24+36`, `jdk-25+36`, `jdk-26+35`.

**Could not verify:**

1. **Any JDK 21 or 26 runtime behaviour.** No such binary here. Every JDK 21 claim in the
   skill — the `jit+compilation` silence, `%hn` absence, `-Xlog:async` spellings, legacy-flag
   aliasing — rests on source at `jdk-21+35`, which is strong but is not execution. The
   diagnostic _wording_ on JDK 21 (does it print the same "No tag set matches selection"
   suggestion list?) remains unverified, as the skill itself says at `SKILL.md:98-99`.
2. **Whether JDK 21 rejects or ignores `-Xlog:async:drop`.** Still open, and the skill
   correctly declines to answer it.
3. **The exact removal release for the GC print flags.** Confirmed gone on JDK 25 by
   execution; the obsoleting JBS issue was not located, and the skill correctly refuses to
   name one.
4. **Third-party GC log parser breakage** from non-default decorators — labelled a mechanism
   in the skill, and I did not test any parser either.
5. **The `VM.log` stall against a saturated async buffer** — labelled a mechanism in the
   skill; not measured.
6. **The JMX/MBean path** for `VM.log` — labelled unconfirmed in the skill; not exercised.
7. **Whether a `{gc,safepoint}` tag-set exists anywhere in HotSpot.** It did not appear in any
   run; I did not exhaustively search the source. See T1.

The three MAJORs and the BLOCKER are all in the JDK 21–25 range the skill claims, and all four
are single-line or single-clause edits.

---

# Iteration 2 — re-validation

Fixes applied by the coordinator (not the author). Re-verified by execution on the same
environment: Temurin OpenJDK **25.0.3+9-LTS**, Windows 11 Pro 26200, x86-64.

Counts: **0 BLOCKER · 0 MAJOR · 4 MINOR · 4 NIT.** Gate verdict: **PASS**.

## The four gating fixes — each confirmed correct and complete

**B1 (was BLOCKER) — CLOSED.** `references/outputs-and-rotation.md:109` now reads
`java -Xlog:gc*:file=fc3.log::filecount=3 -version`. `[RUN]` three consecutive invocations of
that exact string: `exit=0 exit=0 exit=0`, leaving `fc3.log`, `fc3.log.0`, `fc3.log.1` —
precisely the result the surrounding prose claims.

_Completeness check, as asked._ I re-extracted every `-Xlog:` occurrence carrying a `file=`
across `SKILL.md` and all five references. Four remain, and no other has the field error:

| Location                      | Form                            | Verdict                                                               |
| ----------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| `outputs-and-rotation.md:109` | `gc*:file=fc3.log::filecount=3` | fixed, 4-field, runs                                                  |
| `outputs-and-rotation.md:52`  | `gc=debug:file=gc.txt:none`     | `none` is a decorator — correct, and it is the man page's own example |
| `async-and-cost.md:86,87`     | `gc*=trace:file=…`              | elided path in a results table, not a runnable line                   |

**M1 (was MAJOR) — CLOSED.** `SKILL.md:96` now reads
`` `[error][logging] Invalid tag/level/decorator …` **on stdout**; stderr gets only the
launcher's generic `Invalid -Xlog option …` ``. `[RUN]` with the table's own example token:

```
$ java -Xlog:gcc -version 2>/dev/null     # stdout
[0.002s][error][logging] Invalid tag 'gcc' in log selection.
$ java -Xlog:gcc -version 2>&1 1>/dev/null  # stderr
Invalid -Xlog option '-Xlog:gcc', see error log for details.
Error: Could not create the Java Virtual Machine.
```

The row is now consistent with the other two: every UL diagnostic is on stdout.

**M2 (was MAJOR) — CLOSED.** `outputs-and-rotation.md:21-24` carries the version note below
the table. Placement is fine and arguably better than a cell: it sits between the table and
the `file=gc-%p-%t.log` recommendation, so a reader reaching the recommendation has passed
the caveat. It also states the failure shape correctly — not an error, the token is left
literal — and adds that `%p`/`%t` are available throughout, which the table alone did not say.
`[RUN]` on 25: `file=g-%p-%t.log` → `g-396900-2026-08-27_23-35-34.log`. The JDK 21/22 absence
remains source-only (`jdk-21+35`, `jdk-22+36`), unchanged from iteration 1.

**M3 (was MAJOR) — CLOSED, and the coordinator's specific worry is unfounded.**
`SKILL.md:55-62` now mandates `grep -E '\[gc,age[ ]*\]' gc.log` with the padding rule
explained. `[ ]*` matches **zero** occurrences, so it degrades correctly on an unpadded
output. `[RUN]`, single-tag-set file (`-Xlog:gc+age=debug`, lines read `[gc,age]` with no
padding):

```
grep -E '\[gc,age[ ]*\]' -> 5      # the skill's literal command
grep    '\[gc,age\]'     -> 5      # old form, same answer here
```

`[RUN]`, padded file (`-Xlog:gc*`):

```
grep -E '\[gc[ ]*\]'     -> 6
grep    '\[gc\]'         -> 0      # the false negative the fix exists to prevent
grep -E '\[gc,init[ ]*\]' -> 16
```

So the new form is a strict improvement: identical on unpadded output, correct on padded.

## No regressions found

I re-read the edited step 5 and the whole rotation reference against iteration 1.

- Step 5's other obligations survive intact: non-empty **and** contains the tag-set, never
  `wc -l`, and the "this is the only step that catches a real tag-set at a level where
  nothing fires" rationale. The added clause does not displace anything.
- Rotation reference: the `filecount=0` / `filesize=0` table, the truncation source citation,
  the archiving bullets, the FIFO case and the design consequence are all byte-identical to
  the versions I validated in iteration 1. Only the one command changed.
- `node packages/cli/bin/agent-skills.mjs validate skills/unified-logging` → `✓ Valid — no
issues found` (iteration 1: one warning).

## Iteration-1 minors now also closed

- **N1** — description is **997** characters, under the 1024 display budget, with every
  hand-off retained (`gc-log-analysis`, `pause-attribution`, `compilation-and-inlining-logs`,
  `deoptimization`, `code-cache-segments`, `jvm-class-loading`, `startup-cds-crac-leyden`,
  `structured-logging`). No boundary was lost to the trim.
- **N2** — `grep -c unified-logging registry/skills.yaml` → **4**. Registry rebuilt.

## Still open — none gating

- **N3 (MINOR)** — body↔reference duplication, nine facts, unchanged. `async` restart-only
  still has three homes.
- **N4 (MINOR)** — `runtime-reconfiguration.md:10-24` still presents a paraphrase of
  `jcmd help VM.log` inside a fence that reads as a transcript.
- **N5 (MINOR)** — the baseline example at `runtime-reconfiguration.md:33` still shows only
  `#0`; the real listing also has `#1: stderr all=off`.
- **N6 (MINOR)** — conditionally-relevant material still in the body (`SKILL.md:130-136`).
- **T1, T2, T3 (NIT)** — hypothetical `{gc,safepoint}` column, FIFO missing the `file_exist`
  condition, unquoted `gc*` in shell examples. All unchanged.
- **T4 (NIT, new, discovered while verifying M3)** — `SKILL.md:58-59` says UL "pads the tags
  field to the width of the widest tag-set on that output". The padding is actually the widest
  tag-set **written so far**, and it widens mid-file. `[RUN]` one `gc*` log contains both
  `|gc     |` (width 7, before `gc,metaspace` had been emitted) and `|gc          |` (width 12,
  after). This makes the fix _more_ necessary, not less, and `[ ]*` handles both. Optional
  precision edit: "to the widest tag-set written to that output so far — the width can grow
  part-way through a file."

## Verdict

Zero BLOCKER, zero MAJOR. **Gate PASSES.** The four remaining minors are house-standard
economy issues, not correctness; none would produce a wrong JVM configuration. The validated
range and the residual-uncertainty list from iteration 1 are unchanged: executed against
Temurin 25.0.3, source-verified at `jdk-17+35` through `jdk-26+35`, with all JDK 21 and JDK 26
_runtime_ behaviour still unverified by execution.
