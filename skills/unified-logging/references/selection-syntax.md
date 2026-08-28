# Selection syntax and finding the right tag-set

Read when choosing what to log, or when a selection produced nothing, too much, or the
wrong thing.

## From "I want to see X" to a tag-set

1. `java -Xlog:help` on the target JDK. It prints the syntax, the tags, the levels and the
   decorators that this binary actually has. It exits after printing unless `-version` is
   also present.
2. Grep that list for the subsystem word. Tags are HotSpot's internal vocabulary, not the
   domain's: heap regions are `region`, native memory tracking is `nmt`, monitor inflation
   is `monitorinflation`.
3. Start with the wildcard — `-Xlog:<tag>*=debug` on stdout with a representative workload
   — and read which tag-sets actually appear in the `tags` decoration. That list is the
   menu of exact selections available to you.
4. Narrow to the exact tag-sets you need. The wildcard is a discovery tool; shipping it at
   `debug` or `trace` is a volume decision, not a selection decision.

The tag-set printed in the `tags` decoration is authoritative — it is the set the call
site was compiled with, so it is directly usable as a selection.

**The header file over-counts.** `LOG_TAG_LIST` in
`src/hotspot/share/logging/logTag.hpp` held 176 tags at `jdk-21+35`, 188 at `jdk-25+36`
and 191 at `jdk-26+35`, but a product build exposes fewer: `-Xlog:help` on Temurin 25.0.3
lists 179. The difference is entries wrapped in `NOT_PRODUCT(...)` / `DEBUG_ONLY(...)` —
on JDK 25 those are `codestrings, deathtest, downcall, foreign, generate, heapsampling,
test, upcall`. Never source a tag list from the header, from another JDK, or from recall.

## Tag deltas between releases

- **JDK 21 → 25, added:** `aot, array, cause, heapdump, inlinecache, jmethod, link,
methodtrace, monitortable, native, training, trimnative` (plus `deathtest`, debug-only).
- **JDK 21 → 25, removed:** `protectiondomain`.
- **JDK 25 → 26, added:** `asan, package, vmatree`. Removed: none.

Computed by diffing `LOG_TAG_LIST` at the `jdk-21+35`, `jdk-25+36` and `jdk-26+35` tags.
A selection using `aot`, `training` or `methodtrace` therefore fails to start a JDK 21.

## Composing multiple `-Xlog` arguments

The man page says multiple arguments for the same output "override each other in their
given order". That under-specifies it. Measured on Temurin 25.0.3, one output per case:

| Case                                                             | Result                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| Disjoint selections, same file (`gc` then `safepoint`)           | **merge** — both appear                                   |
| Overlapping selections, same file (`gc=debug` then `gc=off`)     | **override, last wins** — zero lines; reversed order logs |
| Wildcard then an `off` for a subset (`gc*=debug`, `gc+heap=off`) | the `off` carves a hole out of the wildcard               |
| Different decorators, same file                                  | last argument's decorators apply to **everything** there  |

The mechanism: `LogConfiguration::configure_output` walks every tag-set, and a tag-set the
new selection does not mention keeps whatever level it already had for that output. So
"merge" and "override" are the same rule seen from two sides — only mentioned tag-sets are
rewritten.

Excess options past the fourth colon-separated field are dropped with
`Ignoring excess -Xlog options`. Read stdout for it.

## The `jit` versus `compilation` case

Worth working through, because it demonstrates three separate traps at once.

**Both tags have existed continuously since at least JDK 17**, at `jdk-17+35`,
`jdk-21+35`, `jdk-25+36` and `master`. Neither was ever renamed to the other; text
claiming a rename is wrong.

**Neither tag alone is what you want.** On Temurin 25.0.3:

| Selection                  | Result                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `-Xlog:jit`                | warning, no output: `No tag set matches selection: jit. Did you mean … jit* jit+thread jit+inlining jit+compilation` |
| `-Xlog:compilation`        | accepted, **no warning**, zero lines — a `{compilation}` tag-set is registered somewhere but did not fire            |
| `-Xlog:jit*=trace`         | 89 lines: `jit,compilation` 48 · `jit,inlining` 39 · `jit,thread` 2                                                  |
| `-Xlog:compilation*=trace` | 126 lines: `compilation,codecache` 78 · `jit,compilation` 48                                                         |

`jit*` and `compilation*` are both valid and are different sets, overlapping only on
`jit+compilation`. `jit*` reaches inlining and compiler threads; `compilation*` reaches
code-cache accounting. Pick by the question, not by preference.

**The level differs by release.** The two `compileTask.cpp` call sites that emit one line
per compilation are `LogTarget(Debug, jit, compilation)` at `jdk-21+35` and
`LogTarget(Info, jit, compilation)` at `jdk-25+36`, lifted by
[JDK-8356259](https://bugs.openjdk.org/browse/JDK-8356259), fix version JDK 25.

| Command                       | JDK 21                            | JDK 25                   |
| ----------------------------- | --------------------------------- | ------------------------ |
| `-Xlog:jit+compilation`       | **silent** — sites are at `debug` | one line per compilation |
| `-Xlog:jit+compilation=debug` | works                             | works                    |

This is exactly failure mode three from the body: on JDK 21 the tag-set is real, the
spelling is right, the JVM is happy, and the file is empty. `=debug` is the portable
spelling across both.

## Why `gc` and `gc*` differ so much

JEP 271 reserves `-Xlog:gc` at info for one line per collection — the `PrintGC` analogue —
and requires everything else to combine `gc` with further tags, making `-Xlog:gc*` the
`PrintGCDetails` analogue. Measured breadth on one allocation workload with `-Xmx256m` on
Temurin 25.0.3: `-Xlog:gc` produced 22 lines, `-Xlog:gc*` produced 325.

JEP 271 also states a non-goal worth quoting to anyone porting a parser: "It is not a goal
to ensure that current GC log parsers work without change on the new GC logs."
