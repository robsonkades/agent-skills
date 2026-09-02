# JOL operating procedure

Read at step 5, **before** the first JOL run — not after the first stack trace. Two of the
four failure modes below are hit on the very first attempt at the most likely subject of a
modern layout question, which is a record.

**Environment.** `org.openjdk.jol:jol-core:0.17` — the newest version published to Maven
Central, so none of this is stale. Run against Temurin **25.0.3+9** (Windows x64) and
**26.0.2+10** (Linux x64) `[executed]`.

On every currently-shipping JDK, **JOL is the only way to read a field layout**.
`-XX:+PrintFieldLayout` is a `develop` flag: the JVM refuses to start with it, with or
without `-XX:+UnlockDiagnosticVMOptions` `[executed]` —

```text
Error: VM option 'PrintFieldLayout' is develop and is available only in debug version of VM.
Improperly specified VM option 'PrintFieldLayout'
Error: Could not create the Java Virtual Machine.
```

— it does not appear in `-XX:+PrintFlagsFinal` even with both unlock flags, and `-Xlog:help`
on 25.0.3 lists no `fieldlayout` or `layout` tag `[executed]`. It is promoted to a diagnostic
product flag on `openjdk/jdk` master (JDK 28-dev) `[source-only]`, which has shipped nowhere.

## 1. The invocation that works

```bash
java -cp "yourclasses:jol-core-0.17.jar" \
     -Djol.magicFieldOffset=true \
     --add-opens java.base/java.util=ALL-UNNAMED \
     YourMain
```

On Windows use `;` as the classpath separator. Every element of that line is load-bearing:

| Element                                 | Without it                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `-Djol.magicFieldOffset=true`           | JOL throws on the first **record** (§2.1)                                     |
| `--add-opens java.base/java.util=…`     | Reflecting into JDK internals (e.g. `HashMap.table` to reach a `Node`) throws |
| Real `.class` files on disk             | `toPrintable()` cannot find the class (§2.3)                                  |
| The flags under test, recorded verbatim | The listing is unusable (§3)                                                  |

To measure the **shape decision**, add `-Xmx` large enough for the population and use
`GraphLayout`:

```java
ClassLayout.parseInstance(obj).instanceSize();   // shallow — this object only
ClassLayout.parseInstance(obj).toPrintable();    // shallow — offsets, holes, field names
GraphLayout.parseInstance(obj).totalSize();      // deep — everything reachable
GraphLayout.parseInstance(obj).toFootprint();    // deep — broken down by class
```

## 2. The four ways it fails

### 2.1 `parseClass` on a record throws — the single most likely first move

```java
ClassLayout.parseClass(MyRecord.class)     // without -Djol.magicFieldOffset=true
```

```text
java.lang.RuntimeException: Cannot get the field offset, try with -Djol.magicFieldOffset=true
  at org.openjdk.jol.vm.HotspotUnsafe.fieldOffset(HotspotUnsafe.java:533)
Caused by: java.lang.UnsupportedOperationException: can't get field offset on a record class:
  private final int Rec$P.x
  at jdk.unsupported/sun.misc.Unsafe.objectFieldOffset(Unsafe.java:903)
```

`[executed]`, 25.0.3. `sun.misc.Unsafe.objectFieldOffset` refuses on record components, so
`parseClass` cannot lay a record out. **Fix:** `-Djol.magicFieldOffset=true`. With it, the
listing is produced correctly and matches `Instrumentation.getObjectSize` exactly `[executed]`.

Note the asymmetry that makes this confusing to debug: `parseInstance` on a record _instance_
works without the property, so the same class succeeds or fails depending on which API you
reached for. Set the property always.

### 2.2 `-javaagent:jol-core.jar` refuses to start the JVM

```text
Failed to find Premain-Class manifest attribute in .../jol-core-0.17.jar
Error occurred during initialization of VM
agent library failed Agent_OnLoad: instrument
```

`[executed]`, 25.0.3. `jol-core` is a library, not an agent jar — it has no `Premain-Class`.
This is the natural response to JOL's own warning, printed on **every** run without an agent:

```text
# WARNING: Unable to get Instrumentation. Dynamic Attach failed. You may add this JAR as
# -javaagent manually, or supply -Djdk.attach.allowAttachSelf
```

The warning is telling you that JOL is **simulating** the layout from `Unsafe` field offsets
rather than asking the VM. The fix is `-Djdk.attach.allowAttachSelf=true`, or the agent in §4
— not passing `jol-core` as an agent.

On Linux JOL additionally prints `Unable to attach Serviceability Agent` and then
`Compressed references base/shifts are guessed by the experiment! … computed addresses are
just guesses, and ARE NOT RELIABLE` `[executed]`, 21.0.12 and 26.0.2 in Docker. That warning
is about **addresses**, not sizes: every `instanceSize()` on those runs matched the Windows
figures exactly. Do not discard a size measurement because of it, and do not trust an address
from it.

### 2.3 `toPrintable()` cannot find a class launched from source

```java
System.out.println(ClassLayout.parseInstance(obj).toPrintable());
```

```text
java.lang.IllegalArgumentException: Class is not found: Layout$AllTypes.
  at org.openjdk.jol.info.ClassLayout.toPrintable(ClassLayout.java:289)
```

`[executed]`, 25.0.3, when the program was launched with the single-file source launcher
(`java -cp jol.jar Layout.java`). `toPrintable` reads the class **file** to recover field
names, and a source-launched class has no file on the classpath. `instanceSize()` still works;
only the printable listing fails. **Fix:** `javac -d classes` first and run from `classes`.

### 2.4 A boxed population inside the `Integer` cache measures nothing

Not an exception — a silently wrong answer, and the most dangerous of the four. `Integer[1000]`
filled from `-128..127` measures the array plus almost nothing, because `Integer.valueOf`
returns shared instances and `GraphLayout` counts each object once. Every boxed figure in this
skill uses values above 100,000 for that reason. Populate with values outside the cache or the
footprint answer is meaningless.

## 3. A listing without its command line is unusable

The same class is 32 bytes or 24; the same array is 24 bytes or 16 — on one JVM, decided by
one flag. **And `-Xmx` is one of the deciders**: at 32 GB of heap and above ergonomics turns
compressed oops off, a reference becomes 8 bytes, and any class holding one changes size
without a single flag being touched. Always capture the heap size alongside the flags:

```text
java -version                                        -> the build, verbatim
java -XX:+PrintFlagsFinal -version | grep -E \
  'UseCompactObjectHeaders|UseCompressedOops|UseCompressedClassPointers|ObjectAlignmentInBytes|MaxHeapSize'
java <same flags> -Xlog:gc+init -version | grep 'Compressed Oops'   -> Enabled (32-bit) / Disabled
```

Read `UseCompressedOops` by value, not by origin: past the 32 GB boundary it prints
`false {default}` — ergonomics turned it off and left no `{ergonomic}` tag `[executed]`,
25.0.3. The `gc+init` line is unambiguous and is the one to paste
(`production-footprint-checks.md` §2).

JOL prints its own VM report, which is the cheapest self-documenting form — paste it above
any listing you hand to someone else:

```text
# VM mode: 64 bits                          # Lilliput VM detected (experimental)   <- COH on
# Compressed references (oops): 3-bit shift # Compressed references (oops): disabled <- 32 GB+
# Object alignment: 8 bytes
# Field sizes:          4, ...              # Field sizes:          8, ...   <- ref is 8 bytes
# Array base offsets:  16, 16, ... 16       # Array base offsets: 12, ... 12, 16, 16 <- COH on
```

`Lilliput VM detected` and the `12,…,12,16,16` base-offset row are the two tells that compact
object headers are in force. Their absence, with the flag on the command line, is one of the
two silent-disable conditions — `compact-object-headers.md` §4. The **first entry of each row**
is the tell for oop size: `Field sizes` starting `4` means every reference-holding figure in
the listing is a compressed-oops figure, and under compact headers the first `Array base
offsets` entry reads `12` while oops are on and `16` once they are off — at which point
`Object[]` has stopped shrinking entirely.

## 4. Cross-check JOL rather than trusting it

Without an agent, JOL **derives** instance size from `Unsafe` field offsets; it does not ask
the VM. JOL 0.17 predates JEP 519 and labels the compact mode "experimental". That is reason
enough to verify before publishing a number that a design decision rests on.

`Instrumentation.getObjectSize` asks the VM directly. The whole cross-check is two files:

```java
// SizeAgent.java  -> package sizeagent;
package sizeagent;
import java.lang.instrument.Instrumentation;
public final class SizeAgent {
    private static volatile Instrumentation inst;
    public static void premain(String args, Instrumentation i) { inst = i; }
    public static long sizeOf(Object o) {
        Instrumentation i = inst;
        if (i == null) throw new IllegalStateException("pass -javaagent:sizeagent.jar");
        return i.getObjectSize(o);
    }
}
```

```bash
javac -d agentclasses SizeAgent.java
printf 'Premain-Class: sizeagent.SizeAgent\n' > manifest.txt
jar cfm sizeagent.jar manifest.txt -C agentclasses .
java -javaagent:sizeagent.jar -cp "classes:sizeagent.jar" YourMain
```

`[executed]`, 25.0.3, both header modes: **44 objects — 12 classes and all 32 array sizes —
and the two mechanisms agreed on every one.** That is 44 data points, not a proof; it is
enough to publish a number and cheap enough that there is no excuse for not doing it.

`getObjectSize` is shallow, like `ClassLayout`. There is no deep equivalent — for a deep
figure `GraphLayout.totalSize()` is the only tool, and it inherits whatever accuracy the
shallow layouter has.

## 5. What JOL does not measure

- **Native memory behind a heap wrapper.** `ClassLayout.parseInstance(directByteBuffer)`
  returns the size of the wrapper object, not the megabyte it points at. `off-heap-memory`
  owns that, and states it correctly.
- **Retained size, dominator trees, or anything from a `.hprof`.** That is
  `heap-dump-analysis`. `GraphLayout.totalSize()` is _reachable_ size from one root, which
  double-counts nothing but shares everything — two roots holding the same object each report
  it.
- **Anything about time.** No number produced by JOL is a throughput or latency measurement.
- **A JVM you cannot attach to.** For a population already running in production,
  `jcmd <pid> GC.class_histogram` gives the JVM's own shallow sizes in the JVM's own header
  mode, and `production-footprint-checks.md` §1 covers it and what a heap dump cannot say.
