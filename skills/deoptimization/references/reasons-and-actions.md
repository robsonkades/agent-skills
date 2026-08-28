# Reasons, actions and mitigations

## Reasons — why the trap fired

These names come from HotSpot's internal `DeoptReason` enum, not from the JVM specification.
Another implementation is under no obligation to use them. Treat them as diagnostic
vocabulary and confirm any name a script depends on against a real collection.

| Reason                  | Trigger                                                                         | Expected temporal signature                                        |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `class_check`           | Actual type differs from the type speculated at the call site                   | Single burst (dependency) or recurring (per-invocation guard)      |
| `null_check`            | A null where profiling said "never null"                                        | Usually isolated — a real upstream event introduced it             |
| `range_check`           | Array access outside bounds, with the check speculatively eliminated            | Rare where bounds were already stable                              |
| `div0_check`            | Division by zero where profiling said "never zero"                              | Very rare                                                          |
| `unstable_if`           | A branch taken differently from the profile C2 used to eliminate the other side | Recurring if the condition genuinely oscillates                    |
| `speculate_class_check` | A type inferred from profiling (not CHA) turned out wrong                       | Like `class_check`, from a weaker assumption                       |
| `intrinsic`             | An intrinsic could not be applied under current conditions                      | Rare; libraries with intrinsics such as `Arrays`, `String`, crypto |

## Actions — what the JVM does next

| Action                | What happens                                                                                                     | Relative cost                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `reinterpret`         | The frame is rebuilt in the interpreter for this thread; the nmethod survives and other threads keep using it    | Cheapest — a point reversal                         |
| `make_not_entrant`    | Frame rebuilt and the nmethod refuses new invocations; threads already inside finish; recompilation is scheduled | Scheduling cost, amortised at the next traffic peak |
| `make_not_compilable` | The method is permanently excluded from compilation; every future execution is interpreted                       | High and permanent until restart                    |

## The two routes into a class-loading deoptimisation

They look alike in a log and call for different fixes.

**Per-invocation guard.** The compiled code carries an uncommon trap that a real invocation
hits with an unexpected type. Spread out over time, one method at a time, and it requires the
new type to actually be used.

**CHA dependency invalidation.** C2 compiled a call site assuming an interface had a single
concrete implementor, and registered a dependency: this code is valid while the hierarchy
keeps this shape. Loading any class that violates it — even if never instantiated or
invoked — makes the JVM sweep registered dependencies and invalidate every nmethod that
depended on it. No application bytecode runs to trigger this; the class linkage event is the
trigger. The signature is a simultaneous burst across several unrelated methods.

`RedefineClasses` via JVMTI is broader still: it invalidates every nmethod referencing the
redefined class, including any method that inlined it, because the class identity itself
changed rather than one assumption about it.

## The lifecycle, and where it can end

```
C2 compiles M under assumption S (guard/uncommon trap embedded,
or a dependency registered with no guard at all)
   |
   |-- S still holds ---------------------------------> stays compiled
   |
   +-- guard fails, OR a new class is loaded
          -> uncommon trap fires
          -> reason recorded
          -> action:
               reinterpret       -> frame rebuilt, nmethod survives
               make_not_entrant  -> nmethod invalidated, recompile scheduled
          -> reprofiled in the interpreter
          -> recompiled
               profile stabilised           -> back to compiled, done
               same point deoptimises again -> recompilation cutoff reached?
                    no  -> round again
                    yes -> make_not_compilable, permanently interpreted
```

Two things the prose hides and the cycle makes obvious: there are two entry points at the
top, and `make_not_compilable` is only reachable after repeated laps through the same point —
never on the first pass. A CHA dependency invalidated once at boot cannot reach it on its own;
a recurring `unstable_if` can.

## Frame reconstruction, and why scalar replacement makes it dearer

1. A thread executes the compiled nmethod containing the trap for assumption S.
2. S stops holding: the trap is hit, or the class loader invalidates the dependency.
3. The JVM captures the execution state at that exact point — the program counter inside
   compiled code, the registers needed to reconstruct Java locals, and the state of objects
   eliminated by scalar replacement, which must now be rematerialised on the heap.
4. Equivalent interpreted frames are rebuilt from that state.
5. The thread continues in the interpreter from the deoptimisation point.
6. The method is reprofiled; once the new profile suffices, C2 recompiles.

Step 3 is why recurring deoptimisation in a method with many eliminated allocations costs
more than recompilation CPU alone: every scalar-replaced object gets created for real, when
on the happy path it would never have existed.

## Mitigations, in order of preference

| Strategy                                                     | Effect                                                                          | When                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `final` types at critical-path call sites                    | A new implementation can never appear, so the CHA dependency cannot be violated | Whenever the design allows                                                |
| Warm-up exercising every expected concrete type              | The first encounter with a type does not happen under production traffic        | When the types are known up front, e.g. registered Spring implementations |
| Accept the single deploy-time deoptimisation                 | No code change                                                                  | When the new class loads only at boot, not in steady state                |
| Isolate the problem call site into its own method            | Limits the recompilation blast radius                                           | When the affected method is large and expensive to recompile              |
| Split an oscillating branch into separately compiled methods | Each side is compiled and reprofiled independently                              | For genuine `unstable_if`                                                 |

```java
// Each branch in its own method, dispatched from a check one level up
if (featureEnabled) {
    processWithFeature(data);
} else {
    processDefault(data);
}
```

Raising a recompilation cutoff is absent from this table on purpose. It changes when the JVM
gives up, not whether the method converges.
