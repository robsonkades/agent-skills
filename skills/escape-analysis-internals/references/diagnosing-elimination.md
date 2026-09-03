# Diagnosing an elimination that did not happen

Everything marked "measured" below was run on Temurin 25.0.3 (`25.0.3+9-LTS`, product build,
x86_64, G1, default tiered compilation) with a small harness that reads
`ThreadMXBean.getThreadAllocatedBytes` around a hot loop after warm-up. Source names are from
the `jdk-25-ga` tag of `openjdk/jdk`.

## Procedure

```
Suspicion: this object should be eliminated and is not
  |
  1. Measure: gc.alloc.rate.norm (JMH -prof gc) or bytes/op from getThreadAllocatedBytes.
     |-- ~0 ......... go to 1b before concluding anything
     +-- full size .. continue at 2
  |
  1b. Control: rerun with -XX:-DoEscapeAnalysis.
     |-- still ~0 ... the allocation had no surviving use and was yanked without EA
     |                (macro.cpp "NotUsed" path). The test says nothing about EA. Fix the
     |                harness: keep the object live across a call or return it.
     +-- full size .. EA is doing the work. Stop, or continue only to attribute cost.
  |
  2. Ask the compiler: -XX:+UnlockDiagnosticVMOptions -XX:+LogCompilation -XX:LogFile=c2.xml
     Inside the method's tier-4 <task>: is there an <eliminate_allocation> for the class?
     |-- yes ........ eliminated. Whatever is allocating is a different site (or tier 3
     |                code still running - check PrintCompilation).
     +-- no ......... continue at 3
  |
  3. -XX:+PrintInlining, tier-4 tree: a refusal on the chain that carries the object?
     |-- yes -> 3a. Callee bytecode size (javap -c -p) against MaxBCEAEstimateSize (150)
     |          |-- fits, reads but never stores the argument
     |          |     -> ArgEscape via BCEA: still allocates, a lock on it elides
     |          +-- does not fit, stores it, or passes it on
     |                -> GlobalEscape: allocates AND keeps real synchronisation
     +-- no, everything inlined
                -> 3b. Match the shape against the "why did this allocation survive"
                       table below, then trace the edge (connection-graph.md).
  |
  4. Fix the cause, never the symptom. Repeat 1 and 2 on the same load.
```

## Why did this allocation survive

Left column: what the code looks like. Middle: the reason C2 records (the `NOT_PRODUCT`
string in `escape.cpp` / `macro.cpp`, visible only on a debug build under
`-XX:+PrintEscapeAnalysis` or `-XX:+PrintEliminateAllocations`). Right: what was measured
on 25.0.3 for a 24-byte `Point(int, int)` unless stated.

| Shape                                                                                       | Mechanism                                                                                                                           | Measured                                                                   |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Passed to a call that was not inlined, callee only reads it                                 | ArgEscape (BCEA `is_arg_stack`). Allocation stays, lock elides                                                                      | 24 bytes/op; lock cost 3.8 ns vs 15.4 ns with `-EliminateLocks`            |
| Passed to a non-inlined callee whose bytecode exceeds `MaxBCEAEstimateSize`                 | No summary: GlobalEscape. Lock is not elided either                                                                                 | 236-byte callee: 17.7 ns/op; `MaxBCEAEstimateSize=400`: 5.6 ns             |
| Stored to a static, a field of an escaping object, returned, or handed to another thread    | GlobalEscape                                                                                                                        | full size                                                                  |
| Rare branch whose store remained in the compiled graph                                      | Flow-insensitive classification can make the object escape on every path; frequency is not the decision by itself                   | Lab: 24 bytes/op when branch was observed about 1 in 1M calls              |
| Branch compiled as an uncommon trap, with store absent from optimized graph                 | EA does not see that store; firing the trap can rematerialize the object and change successor compilation                           | Lab: 0 bytes/op before trap; `REALLOC OBJECTS` when it fired               |
| `a ? new P() : new P()` then reads through the merge                                        | Reducible merge (`ReduceAllocationMerges`, JDK 22+, JDK-8287061)                                                                    | 0 bytes/op; 24 with `-XX:-ReduceAllocationMerges`                          |
| `a ? new P() : null`, null-checked, then read                                               | Reducible: `Phi -> CmpP` against a constant and `CastPP -> AddP -> Load` are supported users                                        | 0 bytes/op                                                                 |
| Merge whose only users are safepoints (debug info)                                          | Reducible — this was the original JDK-8287061 case                                                                                  | 0 bytes/op; 24 with the flag off                                           |
| Merge used by anything else: a call argument, a store, a klass load, a non-constant compare | "One of the uses is: ..." / "Call has non_debug_use()" — Phi not reducible, every input allocates                                   | full size                                                                  |
| Merge of **arrays**                                                                         | `can_reduce_phi_check_inputs`: "Don't handle arrays"                                                                                | full size                                                                  |
| `obj.hashCode()` not overridden, `System.identityHashCode(obj)`                             | The identity-hash intrinsic reads the mark word — an access a scalar-replaced object cannot serve. No `eliminate_allocation` logged | 24 bytes/op                                                                |
| Array read or written at a non-constant index                                               | "has field with unknown offset" / "is stored at unknown offset"                                                                     | `int[4]`, `a[i & 3]`: 32 bytes/op                                          |
| Array longer than `EliminateAllocationArraySizeLimit` (64), kept live                       | "has a length that is too big"                                                                                                      | `int[65]`: 280 bytes/op; 0 with the limit raised to 128                    |
| Array with non-constant length                                                              | "has a non-constant length"                                                                                                         | full size                                                                  |
| Instance with more than `EliminateAllocationFieldsLimit` (512, diagnostic) fields           | "has too many fields"                                                                                                               | 600 `int` fields: 2416 bytes/op; 0 with the limit at 1024                  |
| Subclass of `Thread` or `Reference`, class with a finalizer, or not instantiable            | Forced GlobalEscape at graph construction (`escape.cpp`, `add_call_node`)                                                           | full size                                                                  |
| Result of `multianewarray`, or of a call that is not a boxing method                        | "is result of multinewarray" / "is result of call" — not scalar replaceable                                                         | full size                                                                  |
| Used as base of a mixed or unsafe access, or in a `LoadStore` (CAS / `VarHandle` atomic)    | "is used as base of mixed unsafe access" / "is used in LoadStore or mismatched access"                                              | full size                                                                  |
| Stored into a field of an object that is itself not scalar replaceable                      | "is stored into field with NSR base" — the container decides for its content                                                        | full size                                                                  |
| `Integer.valueOf(i)` consumed by `intValue()` in the same compilation                       | Boxing late-inline (`Compile::inline_boxing_calls`) plus `LoadNode::eliminate_autobox`; the box is then unused and yanked           | 0 bytes/op; 16 with `-XX:-DoEscapeAnalysis`                                |
| The same box stored into a collection                                                       | Escapes through the store                                                                                                           | 16 bytes/op                                                                |
| Explicit `new StringBuilder().append(..).toString()` chain, fully inlined                   | `OptimizeStringConcat` (`stringopts.cpp`) replaces the chain and its buffer with one `String` construction                          | 31.6 bytes/op; 63.6 with `-XX:-OptimizeStringConcat`                       |
| `"a" + i` compiled by javac 9+ (`invokedynamic`)                                            | Not a `StringBuilder` chain; `OptimizeStringConcat` does not apply and does not need to                                             | 31.6 bytes/op either way                                                   |
| for-each over a monomorphic `ArrayList`, body inlined                                       | `ArrayList$Itr` is NoEscape; its `cursor` updates become Phis on the field value, which is fine                                     | 0 bytes/op                                                                 |
| Capturing lambda, call site and `apply`/`get` inlined                                       | The hidden-class instance is an ordinary allocation; NoEscape once the functional call inlines                                      | 0 bytes/op                                                                 |
| `Optional.of(x).map(f).orElse(d)`, all inlined                                              | Same; breaks when `map`'s internal `apply` site is megamorphic across the process (profile is per bytecode, not per caller)         | 0 bytes/op in isolation                                                    |
| EA bailed out: `<connectionGraph_bailout reason='reached time limit'>` in the log           | On this build, timeout/iteration limit caused retry without EA                                                                      | EA-dependent eliminations are lost; unrelated dead-code removal may remain |

Field-value merges are not object merges. An object whose _fields_ take different values on
different paths (a loop counter in an iterator, a conditional assignment) is scalar replaced
with a Phi per field. The limit is a Phi whose inputs are the _object references_.

## Flags on the JDK 25 baseline

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintFlagsFinal -version \
  | grep -E "EscapeAnalysis|EliminateAllocation|EliminateLocks|EliminateNestedLocks|ReduceAllocationMerges|MaxBCEA|EliminateAutoBox|AggressiveUnboxing|OptimizeStringConcat"
```

| Flag                                    | Class         | Default | What it actually controls                                                                                                 |
| --------------------------------------- | ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `-XX:+DoEscapeAnalysis`                 | C2 product    | `true`  | Whether the connection graph is built at all. Also gates boxing elimination and the iterative EA loop                     |
| `-XX:+EliminateAllocations`             | C2 product    | `true`  | Scalar replacement — keeps the analysis, changes only macro elimination. Also a precondition for `ReduceAllocationMerges` |
| `-XX:+EliminateLocks`                   | C2 product    | `true`  | Lock elision on NoEscape and ArgEscape objects, and lock coarsening                                                       |
| `-XX:+EliminateNestedLocks`             | C2 product    | `true`  | Removes an inner lock on an object already locked by an enclosing (inlined) region                                        |
| `-XX:+ReduceAllocationMerges`           | C2 diagnostic | `true`  | Scalar replacement across reducible Phis (JDK 22+). Needs the unlock even to turn off                                     |
| `-XX:EliminateAllocationArraySizeLimit` | C2 product    | 64      | Largest **constant length** array eligible for scalar replacement                                                         |
| `-XX:EliminateAllocationFieldsLimit`    | C2 diagnostic | 512     | Most non-static fields an instance may have and still be scalar replaced                                                  |
| `-XX:MaxBCEAEstimateSize`               | product       | 150     | **Bytecode bytes of the non-inlined callee** BCEA is willing to summarise                                                 |
| `-XX:MaxBCEAEstimateLevel`              | product       | 5       | How many nested non-inlined calls BCEA follows before giving up                                                           |
| `-XX:EscapeAnalysisTimeout`             | C2 product    | 20 s    | Wall-clock budget for building the graph; over it, the method is compiled without EA                                      |
| `-XX:+EliminateAutoBox`                 | C2 product    | `true`  | Treats `valueOf` on the box classes as a late-inlined allocation that can be eliminated                                   |
| `-XX:+AggressiveUnboxing`               | C2 diagnostic | `true`  | Folds the unboxing load through the box (`LoadNode::eliminate_autobox`)                                                   |
| `-XX:+OptimizeStringConcat`             | C2 product    | `true`  | Collapses inlined `StringBuilder` chains into a direct `String` construction                                              |
| `-XX:+PrintEscapeAnalysis`              | **develop**   | —       | Escape state per node. A product JVM refuses to start: `is develop and is available only in debug version of VM`          |
| `-XX:+PrintEliminateAllocations`        | **develop**   | —       | Per-allocation verdict, including the `NotUsed` yank. Same refusal                                                        |
| `-XX:+PrintEliminateLocks`              | **develop**   | —       | Per-lock verdict. Same refusal                                                                                            |
| `-XX:+TraceReduceAllocationMerges`      | **develop**   | —       | Why a Phi was or was not reducible. Same refusal                                                                          |

Turning a product boolean off is a lab comparison technique, not a production setting. Treat all
EA limits—including `EliminateAllocationArraySizeLimit`, the diagnostic
`EliminateAllocationFieldsLimit`, and BCEA limits—as implementation experiments rather than
recommended fleet tuning. Change one only after a compiler log identifies the exact refusal and a
representative benchmark accounts for compile time, register pressure, code/debug-info size,
deoptimization, allocation, and workload latency. Prefer fixing object lifetime or hot/cold shape
when that improves the design independently of one HotSpot release.

## CompileCommand: what does not exist

`PrintEscapeAnalysis` is not a `CompileCommand` option — the option list is closed
(`-XX:CompileCommand=help` prints it) and it is not there in any form. Both spellings are
rejected at startup on 25.0.3, and the JVM does not start:

```
$ java -XX:CompileCommand=option,Lab::foo,PrintEscapeAnalysis -version
CompileCommand: An error occurred during parsing
Error: Unrecognized option 'PrintEscapeAnalysis'

$ java -XX:CompileCommand=PrintEscapeAnalysis,*Lab.foo -version
CompileCommand: An error occurred during parsing
Error: Unrecognized option 'PrintEscapeAnalysis'
```

There is no per-method form even on a debug build: the flag is global. Narrow the output there
with `-XX:CompileCommand=compileonly,Class::method` instead. On the examined product build, either
invalid command prevents startup; confirm option availability with `CompileCommand=help` on the
target runtime.

`CompileCommand` options inherit the class of the flag they scope. `PrintInlining` needs
`-XX:+UnlockDiagnosticVMOptions` before it (`is diagnostic and must be enabled via ...`), and
these work on a product build:

```bash
-XX:CompileCommand=dontinline,lab.Bench::readWithoutStoring   # force an inlining boundary
-XX:CompileCommand=inline,lab.Bench::helper                     # remove one
-XX:CompileCommand=compileonly,lab.Bench::target                # shrink any global print
```

## LogCompilation: the product-build verdict

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+LogCompilation -XX:LogFile=c2.xml ...
grep -n "eliminate_allocation\|eliminate_lock\|connectionGraph_bailout" c2.xml
```

Real output, 25.0.3, from the tier-4 task of a method whose `Point` was scalar replaced and
whose `Object` monitor was elided:

```xml
<eliminate_allocation type='1389'>
<jvms bci='0' method='1387'/>
</eliminate_allocation>
<eliminate_lock compile_id='90' lock_id='78' class='lock' kind='NonEscObj' box_id='76' obj_id='43' bad_id='-1' stamp='0.033'>
<jvms bci='11' method='1387'/>
</eliminate_lock>
<eliminate_lock compile_id='90' lock_id='97' class='unlock' kind='NonEscObj' ... >
```

Reading it:

- `type='1389'` and `method='1387'` are ids **scoped to the enclosing `<task>`**; resolve them
  against the `<klass id='1389' name='...'/>` and `<method id='1387' .../>` lines of the same
  task, not the first match in the file.
- `<jvms bci=.../>` is the allocation's bytecode index in that method — the `new`, so two
  allocations of the same class in one method are distinguishable.
- `kind='NonEscObj'` is EA-driven elision; the other kinds `AbstractLockNode` logs are
  `Coarsened` and `Nested` (`callnode.cpp`, `_kind_names`).
- A reducible merge logs one `<eliminate_allocation>` per input allocation, so a
  `a ? new P() : new P()` that worked shows two entries with different `bci`.
- `<connectionGraph_bailout reason='reached time limit'>` (or `iterations limit`) means EA
  gave up on the whole method; expect every allocation in it to survive.
- An absent element is a verdict too, **provided the task is tier 4** (`level='4'` on the
  `<task>` line) and the allocation was still in the graph. An allocation yanked as unused never
  reaches this code and logs nothing.

The same file feeds JITWatch; the format is the subject of `compilation-and-inlining-logs`.

## What the emitted code can and cannot show

- `-XX:+PrintOptoAssembly` is accepted as a diagnostic flag on the product build and prints
  **nothing**: `PhaseOutput::dump_asm_on` is compiled only `#ifndef PRODUCT` (`output.cpp`).
  Measured: 29 lines of output for a whole run, none of them C2's.
- `-XX:+PrintAssembly` without hsdis prints `Loading hsdis library failed`, then hex dumps with
  unnamed `{runtime_call}` relocations — the allocation stub is not identifiable. With hsdis
  the slow path is the call to `OptoRuntime`'s `_new_instance_Java` / `_new_array_Java`
  (`opto/runtime.cpp`); its absence in the method body is the removal (not verified here —
  no hsdis on the test machine).
- Neither is needed. `<eliminate_allocation>` is the compiler's own statement, and the
  allocation profile is the runtime's.

## JFR allocation events

```bash
jcmd <PID> JFR.start duration=60s settings=profile filename=/tmp/alloc.jfr
jfr view allocation-by-class /tmp/alloc.jfr
jfr print --events jdk.ObjectAllocationSample --stack-depth 8 /tmp/alloc.jfr | grep -B2 -A12 "Lab\$Point"
```

| Event                             | `default.jfc`        | `profile.jfc`        | Correct use                                                                                      |
| --------------------------------- | -------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| `jdk.ObjectAllocationSample`      | **enabled**, `150/s` | **enabled**, `300/s` | The production source for "who is allocating", including for inferring that EA failed            |
| `jdk.ObjectAllocationInNewTLAB`   | `enabled=false`      | `enabled=false`      | Off in **both** stock files since JDK 16 (JDK-8257602). Enable explicitly or its zero is nothing |
| `jdk.ObjectAllocationOutsideTLAB` | `enabled=false`      | `enabled=false`      | Same                                                                                             |

These values were read from `$JAVA_HOME/lib/jfr/{default,profile}.jfc` on 25.0.3. Inspect the
files bundled with the target runtime. On that build, `settings=profile`
does **not** turn the TLAB events on; to have them:

```bash
-XX:StartFlightRecording:settings=profile,jdk.ObjectAllocationInNewTLAB#enabled=true,filename=alloc.jfr
```

Two readings that go wrong:

- A few samples of the type from early in the recording are the interpreter and C1 running
  before tier 4, not an EA failure. Measured: 120 `Point` samples for the escaping variant
  against 1 for the eliminated one over the same 20 M calls. Judge the steady-state rate, or
  filter by start time.
- `jdk.ObjectAllocationSample` is throttled sampling weighted by bytes. It cannot prove absence
  of a small allocation; in the lab `gc.alloc.rate.norm` or `getThreadAllocatedBytes` remains
  the primary metric.

## Lock elision, measured

Same harness, `synchronized (o) { counter += i; }` on a fresh `Object`:

| Variant                                              | Escape state | Allocation | Time       | `-XX:-EliminateLocks` |
| ---------------------------------------------------- | ------------ | ---------- | ---------- | --------------------- |
| Object never leaves the method                       | NoEscape     | 0 bytes    | 2.6 ns/op  | 14.7 ns/op            |
| Passed to a 20-byte non-inlined callee that reads it | ArgEscape    | 16 bytes   | 3.8 ns/op  | 15.4 ns/op            |
| Passed to a 236-byte non-inlined callee              | GlobalEscape | 16 bytes   | 17.7 ns/op | 15.3 ns/op            |
| Stored to a static                                   | GlobalEscape | 16 bytes   | 14.9 ns/op | 15.3 ns/op            |

The third row is the `MaxBCEAEstimateSize` claim in numbers: the callee only reads the object,
but at 236 bytecode bytes BCEA does not summarise it, the object is GlobalEscape, and the
monitor is real. With `-XX:MaxBCEAEstimateSize=400` the same row measures 5.6 ns/op and still
16 bytes. Raising the flag bought lock elision and nothing else.

## Rematerialisation, observed

`-XX:+TraceDeoptimization` (diagnostic, product build) prints the reallocation when a trap
fires inside a method holding scalar-replaced objects:

```
REALLOC OBJECTS in thread 0x00000206e9fd2930
     object <0x0000000623563e48> of type 'Lab$Point' allocated (24 bytes)
DEOPT PACKING thread=0x00000206e9fd2930 vframeArray=...
   Virtual frames (innermost/newest first):
      VFrame 0 - Lab.rareNever(I)I - ifge @ bci=13
```

`-Xlog:deoptimization=debug` gives the reason and site (`Lab.rareNever(I)I trap_bci=13
unstable_if reinterpret`) without the object list. In production correlate the JFR
`jdk.Deoptimization` event with allocation samples rather than tracing.

## Checklists

**Baseline**

- [ ] `DoEscapeAnalysis`, `EliminateAllocations`, `EliminateLocks`, `ReduceAllocationMerges`
      confirmed `true` on the exact runtime
- [ ] No `CompileCommand` naming `PrintEscapeAnalysis` anywhere — the JVM would not have started
- [ ] For JFR: the event actually used is `jdk.ObjectAllocationSample`, or the TLAB event was
      enabled by name; a zero from a disabled event is not evidence

**A "0 bytes/op" result**

- [ ] Reproduced with `-XX:-DoEscapeAnalysis`? Then the object was unused, not eliminated, and
      the benchmark must keep it live across a call or return it
- [ ] `<eliminate_allocation>` present in the tier-4 task for that class and `bci`

**An ArgEscape that BCEA should have classified**

- [ ] `-XX:+PrintInlining` tier-4 tree confirms the refusal for the relevant callee
- [ ] Callee bytecode size from `javap -c -p`, compared with `MaxBCEAEstimateSize` (150)
- [ ] Callee neither stores, returns nor forwards the argument to a call it cannot summarise
- [ ] Time measured with and without `-XX:-EliminateLocks` to confirm the gain is lock elision
- [ ] Expectation recorded: lock elision, **not** removing the allocation

**A merge**

- [ ] Every use of the merged value is a field load, a null compare, a safepoint or a cast to
      an instance type — anything else (a call, a store, `==` against a non-constant) blocks it
- [ ] Not an array
- [ ] `-XX:-ReduceAllocationMerges` reproduces the allocation, proving the merge is the site

**Deoptimisation in a method with aggressive scalar replacement**

- [ ] Correlated with `jdk.Deoptimization` or `-Xlog:deoptimization`, not with JMH
- [ ] Number of objects per `REALLOC OBJECTS` block read from `-XX:+TraceDeoptimization` on a
      test run, or from `<eliminate_allocation>` counts in the log
- [ ] Rematerialisation counted as an additional cost per event, not dismissed as recompilation

**Before publishing any number**

- [ ] Allocation measured, not inferred; baseline taken on the same load
- [ ] Any figure from a composite or third-party case labelled as such

## Primary references

- [HotSpot escape analysis source](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/opto/escape.cpp)
- [HotSpot macro expansion source](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/opto/macro.cpp)
- [JDK-8257602: allocation sampling events](https://bugs.openjdk.org/browse/JDK-8257602)
- [JDK Flight Recorder command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
