# The connection graph and macro expansion

Source names below were read from the `jdk-25-ga` tag of `openjdk/jdk`
(`src/hotspot/share/opto/escape.{hpp,cpp}`, `macro.cpp`, `compile.cpp`, `callnode.{hpp,cpp}`,
`ci/bcEscapeAnalyzer.cpp`, `runtime/deoptimization.cpp`). Behaviour marked "measured" was
confirmed on Temurin 25.0.3; the numbers are in `diagnosing-elimination.md`.

## Nodes and edges

C2 does not decide NoEscape / ArgEscape / GlobalEscape by inspecting the code. It builds a
graph over the ideal graph — after parsing and after the inlining that happened during it —
and propagates "what can this reference point to" until it reaches a fixed point. The
algorithm is the one in Choi, Gupta, Serrano, Sreedhar and Midkiff, "Escape Analysis for Java"
(OOPSLA 1999), in its flow-insensitive variant; the C2 implementation is class
`ConnectionGraph` over `PointsToNode`.

| Element             | Represents                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JavaObject node** | An allocation site, a boxing call's result, or an "unknown" object standing for anything that entered across the method boundary — a parameter, or the return of a call with no summary |
| **LocalVar node**   | An SSA value that may point at one or more JavaObjects — locals, projections, casts, Phis                                                                                               |
| **Field node**      | A field (or array element at a known offset) of a JavaObject, tracked as its own node, so what it can contain is separate from the object containing it                                 |
| **Arraycopy node**  | An `arraycopy` intrinsic, so a copy between arrays can be modelled without making both escape                                                                                           |
| **PointsTo edge**   | LocalVar/Field to JavaObject: this value may point at this object                                                                                                                       |
| **Deferred edge**   | LocalVar/Field to LocalVar/Field: propagates the PointsTo set between values — a Phi at a control-flow merge is one of these per input                                                  |
| **Field edge**      | JavaObject to Field: this object has this field                                                                                                                                         |

The enumerations are `PointsToNode::NodeType { JavaObject, LocalVar, Field, Arraycopy }` and
`EscapeState { NoEscape, ArgEscape, GlobalEscape }` in `escape.hpp`.

## From parse to state

```
Parse: bytecode -> sea of nodes (parse-time inlining already resolved)
  |
  v  Each `new` becomes an AllocateNode / AllocateArrayNode (a macro node)
  |
  ConnectionGraph::compute_escape (escape.cpp)
  v  1. One PointsToNode per relevant ideal node; a JavaObject per allocation
  v  2. Edges from every use: stores, loads, Phis, casts, call arguments
  v     - inlined callee: already part of the graph
  v     - non-inlined callee with a BCEA summary: per-argument verdict
  v     - anything else: argument marked GlobalEscape
  v  3. Propagate escape states and PointsTo sets to a fixed point
  v     (at most 20 iterations and EscapeAnalysisTimeout seconds; over either,
  v      <connectionGraph_bailout> and the method is compiled without EA)
  v  4. Adjust "scalar replaceable" on NoEscape objects (the NSR reasons)
  v  5. Decide which Phis over allocations are reducible (ReduceAllocationMerges)
  v  6. Split memory slices per non-escaping object (split_unique_types), mark
  |     locks on non-escaping objects, fold pointer compares (OptimizePtrCompare)
  v
  PhaseMacroExpand::eliminate_macro_nodes  -- removes what step 4 approved
  v
  igvn.optimize(); repeat from compute_escape while something was removed
                   and candidates remain (iterative EA, compile.cpp)
```

| State        | Definition                                                                                                                   | Scalar replacement                    | Lock elision |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------ |
| NoEscape     | Not reachable outside the method or the thread by any edge                                                                   | **Yes**, if also "scalar replaceable" | Yes          |
| ArgEscape    | Reachable by a called method that was not inlined; no edge reaches a static field, a return or a thread                      | **No — never**                        | Yes          |
| GlobalEscape | Reachable from a static field, a field of an escaping object, the method's return, another thread, or a call with no summary | No                                    | No           |

Two things the table hides. NoEscape is necessary, not sufficient: step 4 can still refuse
scalar replacement (non-constant array index, too many fields, identity hash, mixed unsafe
access — the full list is the table in `diagnosing-elimination.md`), and such an object keeps
its allocation while its lock still elides. And an object's **fields** carry their own escape
state: a callee that reads the argument but stores something into one of its fields leaves the
argument ArgEscape and marks its fields GlobalEscape (`set_fields_escape_state`), which is what
stops the analysis from reasoning about what the fields contain.

Some classes are GlobalEscape before any edge exists: subclasses of `Thread` and of
`Reference`, classes with a finalizer, and classes that cannot be instantiated
(`add_call_node`). A `new Thread(...)` is never a candidate.

### Flow insensitivity, precisely

The connection graph's escape classification has no path-specific state. A store that remains in
the compiled graph can therefore mark the object escaping for all paths, even when that path is
rare. In the 25.0.3 lab, a branch observed roughly once per million calls remained represented and
the site measured 24 bytes/op; that frequency is an observation, not a compiler threshold.

But “anywhere in the compiled graph” is narrower than “anywhere in source”. C2 may replace a
profiled unlikely branch with an uncommon trap, keeping its store out of the optimized graph. In
the lab, a never-observed branch produced that shape and 0 bytes/op; when it fired, deoptimization
rematerialized the logical object and execution continued in less-optimized code. Subsequent
recompilation depends on updated profile and policy—do not assume the branch is always included or
the allocation survives forever. Inspect the trap and successor compilation. Moving construction
inside the escaping branch is a candidate transformation, not a rule.

## Bytecode escape analysis

When a callee misses the inlining criteria, C2 does not have to treat every argument as
GlobalEscape. `BCEscapeAnalyzer` (`ci/bcEscapeAnalyzer.cpp`) runs an abstract interpretation
over the callee's **bytecode** and records per argument whether it is only ever used locally
(`is_arg_local`), may reach the stack of a further call but never the heap (`is_arg_stack`),
or is returned (`is_arg_returned`). The result is cached on the `MethodData`.

The consumer is `process_call_arguments` in `escape.cpp`, and its logic is worth quoting
because it bounds what the summary can ever buy:

```
if (!call_analyzer->is_arg_stack(k))      -> GlobalEscape
else                                      -> ArgEscape
     if (!call_analyzer->is_arg_local(k)) -> fields of the argument: GlobalEscape
if (call_analyzer->is_arg_returned(k))    -> the call's result may alias the argument
```

Every argument to a non-inlined call is therefore at least ArgEscape. No summary, however
precise, produces NoEscape across a call boundary: only inlining does. The summary is refused
outright (`clear_escape_info`, everything GlobalEscape) when the callee's bytecode exceeds
`MaxBCEAEstimateSize` or the nesting exceeds `MaxBCEAEstimateLevel`.

|              | Common wrong description | Correct                                                                                                                          |
| ------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| What it caps | "object size for EA"     | Bytecode bytes of the **non-inlined callee** BCEA is willing to analyse (`method()->code_size() > MaxBCEAEstimateSize`)          |
| Raising it   | no coherent effect       | Extends the summary to larger callees without inlining them — more objects reach ArgEscape instead of a pessimistic GlobalEscape |
| Default      | 150                      | **150 bytes of callee bytecode**; `MaxBCEAEstimateLevel` 5 bounds the call depth the summary follows                             |

Measured: a 236-byte callee that only reads its argument leaves a lock on that argument real
(17.7 ns/op); `-XX:MaxBCEAEstimateSize=400` elides it (5.6 ns/op) and the allocation stays.

The inlining thresholds that decide whether EA sees the callee the other way — through
inlining — are `MaxInlineSize` (35), `FreqInlineSize` (325), `InlineSmallCode` (2500 bytes of
machine code) and `MaxInlineLevel` (15 on 25.0.3); their refusal strings are listed in
`c2-sea-of-nodes`.

## Merges: what `ReduceAllocationMerges` lifted

A Phi whose inputs are two allocations (`a ? new P() : new P()`, or `new P()` on one side and
`null` on the other) used to make both inputs "merged with another object" and not scalar
replaceable, regardless of escape state — the object identity at the merge could not be
represented as scalars. JDK 22 introduced reducible merges (JDK-8287061, "Support for
rematerializing scalar replaced objects participating in allocation merges", under the
umbrella JDK-8289943; nullable merges followed in JDK-8316991). The mechanism
(`can_reduce_phi` in `escape.cpp`) keeps the Phi but records, at each safepoint, which input
was live through a `SafePointScalarMergeNode` (`callnode.hpp`), and splits field loads through
the Phi so each input can be scalar replaced on its own.

The Phi is reducible only when every one of its users is one of these shapes:

- a safepoint (debug info only — a call that uses the value as an argument blocks it);
- a `CmpP`/`CmpN` against a **constant**, typically the null check;
- `AddP -> Load` — a field load, but not a klass load (so no virtual dispatch on the merged
  value, no `getClass()`), and the load must be splittable through the Phi;
- a `CastPP` to an instance type, whose control is trivial or guarded by such a compare,
  itself followed only by the above.

Anything else — a store of the merged value, an `==` against another object, a call argument,
an array on either side (`can_reduce_phi_check_inputs`: "Don't handle arrays") — leaves the
merge irreducible and every input allocates. Measured: a field load through the merge is
0 bytes/op on 25.0.3 and 24 bytes/op with `-XX:-ReduceAllocationMerges`; the flag is
diagnostic and needs the unlock even to turn off.

Distinguish a Phi of field values from a Phi of object references. C2 can often represent the
former as one scalar Phi per field; the latter needs the reducible-allocation-merge machinery and
its restricted user shapes.

## Macro expansion and the three exits

Allocations (`AllocateNode`, `AllocateArrayNode`), locks (`LockNode`, `UnlockNode`) and a few
other composite operations enter C2's graph as **macro nodes** — high-level operations not yet
lowered to the instructions implementing them. They stay that way through the earlier
optimisation phases, because expanding early would lose the chance to remove them entirely.

`PhaseMacroExpand::eliminate_macro_nodes` runs inside the EA loop and once more at the start
of expansion; `expand_macro_nodes` then lowers whatever is left, before matching and register
allocation. An `AllocateNode` leaves through one of three doors:

| Door               | Condition (`macro.cpp`)                                                                                                    | Result                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Scalar replacement | `eliminate_allocate_node`: `EliminateAllocations`, `_is_non_escaping`, and `_is_scalar_replaceable` (or an unused box)     | Node removed; each field becomes an SSA value; `<eliminate_allocation>` logged; a `SafePointScalarObjectNode` per safepoint in range |
| **Unused, yanked** | `expand_allocate_common`: `result_cast() == nullptr` and a constant non-negative size — no escape analysis involved at all | Node removed (`yank_alloc_node`); a debug build prints `NotUsed`; nothing logged                                                     |
| Expansion          | Everything else                                                                                                            | Fast path (TLAB bump, inline) plus slow path (`_new_instance_Java` / `_new_array_Java`) — the object exists                          |

The second door is why "0 bytes/op" is not proof of escape analysis. An object whose every
field load folded into the constructor's stores has no use left; C2 discards it with
`-XX:-DoEscapeAnalysis` and `-XX:-EliminateAllocations` alike (measured: 0 bytes/op under
both; 24 bytes/op once the object is kept live across a call). A benchmark that builds an
object and immediately consumes its fields is measuring this door, not EA.

There is no partial expansion through the third door. That, plus the first two, is the
mechanical reason `gc.alloc.rate.norm` behaves as a binary signal per allocation site.

For locks the doors are analogous. `EliminateLocks` removes a `LockNode`/`UnlockNode` pair
whose object is NoEscape or ArgEscape (`can_eliminate_lock`, kind `NonEscObj`);
`EliminateNestedLocks` removes an inner pair on an object an enclosing inlined region already
holds (`Nested`); lock coarsening (`AbstractLockNode::Ideal`, `Coarsened`) merges an unlock
immediately followed by a lock on the same object into one region — the transformation that
turns consecutive inlined `StringBuffer.append` calls into one critical section, at the price
of a slightly longer hold. Coarsening does not cross loop iterations.

## Boxing and string concatenation, the two special cases

`Integer.valueOf` and friends are not ordinary calls under `EliminateAutoBox`. The call is
parked as a **late boxing inline** (`Compile::inline_boxing_calls`) and its result is a
JavaObject that is refused scalar replacement only when the fact that it "can be loaded from
boxing cache" is observable; `AggressiveUnboxing` then folds an `intValue()` load through the
box (`LoadNode::eliminate_autobox`, `memnode.cpp`), after which the box has no use and leaves
by the second door. Measured: `Integer.valueOf(i + 1000).intValue()` is 0 bytes/op, 16
bytes/op with `-XX:-DoEscapeAnalysis`, and 16 bytes/op when the box is stored into a list. A
box that is rematerialised on deoptimisation is an `AutoBoxObjectValue`, so the cache identity
(`Integer.valueOf(1) == Integer.valueOf(1)`) is preserved even then.

`OptimizeStringConcat` (`stringopts.cpp`, class `StringConcat`) is a separate pass over
inlined `StringBuilder`/`StringBuffer` chains ending in `toString()`: it computes the final
length and builds the `String` directly, removing the builder and its growable buffer.
Measured: an explicit three-`append` chain is 31.6 bytes/op (the result `String` and its
`byte[]`) and 63.6 bytes/op with the flag off. `"a" + i` compiled by javac 9+ is an
`invokedynamic` and never enters this pass — its allocation is the same 31.6 bytes/op either
way. The pass bails out if any intermediate builder escapes or the chain is not fully inlined.

## Rematerialisation

When C2 eliminates an `AllocateNode`, it cannot forget the object would logically have
existed — any safepoint inside the object's live range, including the ones that accompany
non-inlined calls, may need a consistent interpreter state if a deoptimisation fires there.
For each such safepoint C2 attaches a `SafePointScalarObjectNode` (`callnode.hpp`): the
object's class, its field count, and for each field which value — register, constant, other
scalar — represents it _at that program point_. It is emitted into the debug info as an
`ObjectValue`; for a reducible merge, a `SafePointScalarMergeNode` records which input was
selected.

On deoptimisation (`Deoptimization::rematerialize_objects`, `realloc_objects`,
`deoptimization.cpp`):

1. `objects_to_rematerialize` collects every `ObjectValue` in the deoptimising frame.
2. `realloc_objects` allocates a real heap object per descriptor. An OOM here is a real
   `OutOfMemoryError` at a point the source never allocates
   (`out_of_memory_error_realloc_objects`).
3. `reassign_fields` populates each field from the captured values.
4. Every reference to the virtual object in the interpreter frame being built is replaced by
   the real one.

Per-event cost grows with the count and shape of scalar-replaced objects live at that safepoint;
total cost is approximately that work multiplied by event frequency, plus frame reconstruction,
recompilation, and later GC. A method eliminating a chain of nested objects can allocate several
objects together when it deoptimizes.
This is not an argument against scalar replacement — the alternative pays allocation on
_every_ execution — but it is a reason not to price recurring deoptimisation as recompilation
alone. `-XX:+TraceDeoptimization` (diagnostic, works on the product build) prints
`REALLOC OBJECTS` with one line per object and its size; the deoptimisation reasons themselves
are the subject of `deoptimization`.

## How Graal differs

C2 assigns one path-insensitive escape state per object in each analysis iteration over the whole
compiled graph. Graal
represents each candidate allocation as a **virtual object** — a description, inside the
compilation graph, of the object's current field state, with no real allocation. Field reads
and writes while the object stays virtual resolve directly against that state.

The difference appears at a control-flow branch. When a use forces materialisation — a store
into a real field, a return to the caller, a call that cannot be summarized, an identity
comparison, a real monitor enter — Graal can insert materialization on the affected control-flow
path rather than forcing the allocation for all paths. Paths that do not pass through it
keep the object virtual. `ReduceAllocationMerges` narrows the gap for one shape (a merge read
through field loads) but is not flow-sensitivity: a rarely taken escaping store still costs C2
every path.

Graal's partial escape analysis also runs iteratively, interleaved with inlining decisions,
rather than after parse-time inlining has settled, so the decision to inline a callee can
account for the objects that would become virtual inside it. C2's iterative EA loop
(`compile.cpp`) re-runs the analysis after eliminations, and incremental inlining can feed it
new candidates, but the inlining decision itself does not consult EA.

Primary references: Stadler, Würthinger, Mössenböck — "Partial Escape Analysis and Scalar
Replacement for Java" (CGO 2014); Kotzmann & Mössenböck — "Escape Analysis in the Context of
Dynamic Compilation and Deoptimization" (VEE 2005), the source of the rematerialisation
design. The Graal compiler left the JDK with JEP 410; `-XX:+UseJVMCICompiler` on OpenJDK 25
finds no compiler, so experimenting with partial EA requires the GraalVM distribution and is
the subject of `graalvm-jit`.

Source links:

- [HotSpot `escape.cpp`](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/opto/escape.cpp)
- [HotSpot `macro.cpp`](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/opto/macro.cpp)
- [JDK-8287061: allocation merge rematerialization](https://bugs.openjdk.org/browse/JDK-8287061)
- [JDK-8316991: nullable allocation merges](https://bugs.openjdk.org/browse/JDK-8316991)
- [JEP 410: Remove the Experimental AOT and JIT Compiler](https://openjdk.org/jeps/410)
