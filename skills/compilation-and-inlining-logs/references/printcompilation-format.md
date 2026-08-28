# The PrintCompilation format

```bash
java -XX:+PrintCompilation -jar app.jar
```

A product flag — no diagnostic unlock needed, and no unified-logging tag exists as an
alternative.

## Six columns, in this order

```
timestamp   compile_id   flags   tier   Class::method (bytes)   [extra status]
```

| #   | Column                  | Meaning                                                                             |
| --- | ----------------------- | ----------------------------------------------------------------------------------- |
| 1   | `timestamp`             | Milliseconds since JVM start                                                        |
| 2   | `compile_id`            | Sequential id of the compilation task                                               |
| 3   | `flags`                 | Zero or more attribute characters; **blank when none apply**, but the column exists |
| 4   | `tier`                  | Compilation level, 1 to 4                                                           |
| 5   | `Class::method (bytes)` | Method and its bytecode size; `@ N` before the size marks OSR at offset N           |
| 6   | extra status            | Only when applicable: `made not entrant`, `made zombie`                             |

Minimal line:

```
    81    68        3   Main::calculate (9 bytes)
```

Timestamp 81, compile id 68, no flags, **tier 3** — C1 with full profiling — method
`Main::calculate`, 9 bytecode bytes.

## Flag characters

| Flag    | Meaning                                                                    |
| ------- | -------------------------------------------------------------------------- |
| (blank) | No special attribute                                                       |
| `%`     | OSR — entry is mid-method, not at the start                                |
| `s`     | `synchronized` method                                                      |
| `!`     | Method has an exception handler                                            |
| `b`     | Blocking (synchronous) compilation — uncommon outside startup or `-Xbatch` |
| `n`     | Native method wrapper (JNI)                                                |

Several non-empty columns at once:

```
   456   312     b    4   com.myapp.Service::process (145 bytes)
   457   313          4   java.util.HashMap::get (56 bytes)
   458   311     n    1   java.lang.System::arraycopy (0 bytes)
   460   315   % !    4   com.myapp.HotLoop::compute @ 42 (200 bytes)
   475   316          3   com.myapp.HotLoop::compute (200 bytes)   made zombie
```

## Status values

```
    81    68        3   Main::calculate (9 bytes)
   103    71        4   Main::calculate (9 bytes)
   104    68            Main::calculate (9 bytes)   made not entrant
```

The normal `0→3→4` path, followed by the tier-3 version being retired. `made not entrant`
means threads already executing the old code finish in it, but no new invocation enters.
`made zombie` is the later state: no live activation remains on any thread's stack, so the
sweeper can reclaim it. Every zombie was not-entrant first; not every not-entrant becomes a
zombie quickly.

Diagnosing _why_ a method keeps cycling through these states belongs to the deoptimization
skill; here they are just the sixth column.

## Without tiered compilation

Under `-XX:-TieredCompilation`, `PrintCompilation` prints **no tier column at all** — lines
go back to timestamp, compile id, flags and method. This is the structural absence of the
column, not a second way of reading it, because there are no levels to report: everything
goes straight to C2. Expecting a tier column here, or expecting flags to encode the tier
under the default, are the two symmetric misreadings.

## Filtering without breaking

```bash
# By package
java -XX:+PrintCompilation -jar app.jar 2>&1 | grep "com.myapp"

# Tier 4 only — tier is the 4th field, not the 3rd
java -XX:+PrintCompilation -jar app.jar 2>&1 | awk '$4 == 4 && /com.myapp/'

# Invalidations
java -XX:+PrintCompilation -jar app.jar 2>&1 | grep -E "made not entrant|made zombie"
```

`grep -v " [123] "` depends on exact field widths and breaks silently the moment a compile id
reaches five digits. Field-indexed `awk` is more robust, but note the blank flags column does
not emit its own token, so verify the index against real output from your build before a
script depends on it. An extraction command that has never been run against real output is a
hypothesis, and an empty result from one is indistinguishable from "nothing happened".

## Quick inventory of adjacent commands

```bash
jstat -compiler <pid>
# Compiled Failed Invalid   Time   FailedType FailedMethod

jcmd <pid> Compiler.queue       # compilations currently queued
jcmd <pid> Compiler.codecache   # code cache occupancy by segment
```
