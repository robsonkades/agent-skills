# The connection graph and macro expansion

## Nodes and edges

C2 does not decide NoEscape / ArgEscape / GlobalEscape by inspecting the code. It builds a
graph during the parse — after inlining has already happened — and propagates "what can this
reference point to" until it reaches a fixed point.

| Element             | Represents                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JavaObject node** | An allocation site (`new`), or an "unknown" object standing for anything that entered across the method boundary — a parameter, or the return of a call with no summary |
| **LocalVar node**   | An SSA value that may point at one or more JavaObjects — locals, expression results                                                                                     |
| **Field node**      | A field of a JavaObject, tracked as its own node, so what it can contain is separate from the object containing it                                                      |
| **PointsTo edge**   | LocalVar/Field to JavaObject: this value may point at this object                                                                                                       |
| **Deferred edge**   | LocalVar to LocalVar: propagates the PointsTo set between values — required for phis at control-flow merges                                                             |
| **Field edge**      | JavaObject to Field: this object has this field                                                                                                                         |

The implementation lives around `src/hotspot/share/opto/escape.hpp` / `escape.cpp` (class
`ConnectionGraph`, type `PointsToNode`). The names have been stable for several releases but
should be confirmed against the baseline's own tree before being quoted as exact.

## From parse to state

```
Parse: bytecode -> sea of nodes (inlining already resolved)
  |
  v  Each `new` becomes an AllocateNode (a macro node) + a JavaObject node
  v  Each use of the object emits edges: PointsTo, Deferred, Field
  v  Propagate to a fixed point - a BCEA summary enters here as one more edge
  |
  +-- Does any edge reach an escape sink?
      (static field, return, another thread, or a callee with no summary -
       neither inlined nor BCEA-analysable)
      |
      +-- reaches nothing ............................ NoEscape
      +-- only leaves the method boundary,
      |   never the thread ........................... ArgEscape
      +-- reaches static field / return / thread ..... GlobalEscape
```

| State        | Definition                                                                                              | Scalar replacement | Lock elision |
| ------------ | ------------------------------------------------------------------------------------------------------- | ------------------ | ------------ |
| NoEscape     | Not reachable outside the method or the thread by any edge                                              | **Yes**            | Yes          |
| ArgEscape    | Reachable by a called method that was not inlined; no edge reaches a static field, a return or a thread | **No — never**     | Yes          |
| GlobalEscape | Reachable from a static field, a field that already escapes, the method's return, or another thread     | No                 | No           |

## Bytecode escape analysis

When a callee misses the inlining criteria — too large, explicitly `dontinline`, recursive
past the limit — C2 does not have to treat every argument as GlobalEscape. For callees small
enough, it runs a light local analysis over the callee's **bytecode**, producing a
per-argument escape summary: this parameter is read but never stored in a field, never
returned, never passed to a call that cannot be summarised. The summary attaches to the
caller's connection graph as one more edge, without copying the callee's body into it.

`-XX:MaxBCEAEstimateSize` governs it:

|              | Common wrong description | Correct                                                                                                                 |
| ------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| What it caps | "object size for EA"     | Bytecode bytes of the **non-inlined callee** C2 is willing to analyse via BCEA                                          |
| Raising it   | no coherent effect       | Extends EA to larger callees without inlining them — more objects reach ArgEscape instead of a pessimistic GlobalEscape |
| Default      | 150                      | **150 bytes of callee bytecode**                                                                                        |

The inlining thresholds that decide whether EA sees the callee the other way — through
inlining — are `-XX:MaxInlineSize` (35 bytecode bytes, always inline) and
`-XX:FreqInlineSize` (325, inline if hot). `-XX:MaxInlineLevel` caps nesting depth; confirm
its default with `-XX:+PrintFlagsFinal` on the baseline rather than assuming, as it can vary
between releases.

## Macro expansion

Allocations (`AllocateNode`, `AllocateArrayNode`), locks (`LockNode`, `UnlockNode`) and a few
other composite operations enter C2's graph as **macro nodes** — high-level operations not
yet lowered to the instructions implementing them. They stay that way through every earlier
optimisation phase, because expanding early would lose the chance to remove them entirely.

`PhaseMacroExpand` runs late, before matching and register allocation, and resolves each
remaining macro node:

| Escape state | The AllocateNode                                                                                                           | The LockNode, if any                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| NoEscape     | **Removed from the graph.** No allocation instruction is emitted — this is what scalar replacement means in generated code | Removed — lock elision                                                                  |
| ArgEscape    | Expanded: fast path (TLAB bump) plus slow path (runtime call when the TLAB has no room)                                    | Removed — lock elision, since the object did not escape the thread                      |
| GlobalEscape | Expanded: fast path plus slow path, same as ArgEscape                                                                      | Expanded to a real monitor enter/exit sequence, or merged with adjacent lock coarsening |

There is no partial expansion, which is the mechanical reason `gc.alloc.rate.norm` is
essentially binary. It is also directly observable in the assembly: the presence of an
allocation runtime call means the node was expanded, its absence means it was removed.

## Rematerialisation

When C2 eliminates an `AllocateNode`, it cannot simply forget the object would logically have
existed — any safepoint inside the method, including those accompanying non-inlined calls,
may need a consistent state for the interpreter if a deoptimisation fires there. For each
safepoint within the eliminated object's live range, C2 attaches a **rematerialisation
descriptor**: the object's class, its field layout, and for each field which value (register,
constant, other scalar) represents it _at that specific program point_.

On deoptimisation:

1. The JVM finds every rematerialisation descriptor active at that safepoint.
2. For each, it allocates a real heap object of the described type and layout.
3. It populates the fields from the values the descriptor captured.
4. It replaces every reference to the virtual object, in the frame rebuilt for the
   interpreter, with the reference to the newly created real object.

The cost is proportional to the number of scalar-replaced objects live at that point, not to
the number of deoptimisations. A method eliminating a chain of nested objects pays one
allocation per object in the chain, all at once, at the moment allocation is least wanted.
This is not an argument against scalar replacement — the alternative pays allocation on
_every_ execution — but it is a reason not to price recurring deoptimisation as
recompilation alone.

The descriptor structure is usually referred to in C2 material as something in the
`SafePointScalarObjectNode` / `ObjectValue` family; confirm the exact names in
`src/hotspot/share/opto/` and `src/hotspot/share/runtime/deoptimization.cpp` on the baseline
before quoting them.

## How Graal differs

C2 decides an object's escape state **once, for the whole method's connection graph**. Graal
represents each candidate allocation as a **virtual object** — a description, inside the
compilation graph, of the object's current field state, with no real allocation. Field reads
and writes while the object stays virtual resolve directly against that state.

The difference appears at a control-flow branch. When a use forces materialisation — a store
into a real field, a return to the caller, a call that cannot be summarised, an identity
comparison, a real monitor enter — Graal inserts a materialisation node **at exactly that
point in the graph**, not retroactively across the method. Paths that do not pass through it
keep the object virtual.

Graal's partial escape analysis also runs iteratively, interleaved with inlining decisions,
rather than once after inlining has settled, so the decision to inline a callee can account
for the objects that would become virtual inside it.

Primary reference: Stadler, Würthinger, Mössenböck — "Partial Escape Analysis and Scalar
Replacement for Java" (CGO 2014). Note that the Graal compiler left the JDK with JEP 410;
`-XX:+UseJVMCICompiler` on a standard OpenJDK 25 finds no compiler at all, so experimenting
with partial EA requires the GraalVM distribution.
