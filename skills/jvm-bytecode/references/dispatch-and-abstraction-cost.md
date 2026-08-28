# Dispatch, and what each abstraction compiles to

## The invoke family

```
invokestatic    #9   // static method — no dispatch
invokespecial   #8   // constructors, super, private methods — no dispatch
invokevirtual   #7   // dynamic dispatch on the receiver's runtime type
invokeinterface #10  // dispatch through an interface type
invokedynamic   #11  // lambda, method reference, string concat, pattern switch
```

`invokestatic` and `invokespecial` resolve to a single concrete method at link time — a direct
call. `invokevirtual` and `invokeinterface` resolve to an entry point that depends on the
receiver's runtime type, which is where inline caching applies.

## The four stages of an inline cache

1. **Unlinked** — the first execution has no cache; a full vtable lookup on the receiver's real
   type.
2. **Monomorphic** — the site is rewritten to point straight at the resolved method, guarded by
   a fast klass-pointer check (`if klass == X, jump to X.method`). If the guard always holds,
   the JIT can inline the body and remove the call entirely.
3. **Bimorphic** — a second concrete type appears; the guard becomes a two-way check. Still
   inlinable on both arms, but the branch remains.
4. **Megamorphic** — above a small number of distinct types, HotSpot gives up on the polymorphic
   cache and falls back to a real vtable/itable lookup: indexed, uninlinable, and with a branch
   the processor cannot predict, on every call.

The type profile driving that decision is collected by the interpreter and by C1, which count
the concrete klasses seen per call site. Megamorphic cost is therefore a property of code
shape, not of the language: reduce the number of concrete types reaching a hot site — for
example by specialising the hot path — rather than avoiding polymorphism as a policy.

## Branch and switch instructions

```
ifeq / ifne      // branch on top-of-stack == / != 0
if_icmpeq        // branch on two ints equal
goto             // unconditional
tableswitch      // contiguous case range — O(1), indexed
lookupswitch     // sparse cases — O(log n), binary search
```

The choice between `tableswitch` and `lookupswitch` is made by `javac` from case density, not
by the runtime.

## invokedynamic and lambdas

```java
Runnable r = () -> System.out.println("hello");
```

```
invokedynamic #1, 0   // "run":()Ljava/lang/Runnable;
                      // #1 -> BootstrapMethods -> LambdaMetafactory.metafactory
```

On the first execution the JVM calls `LambdaMetafactory.metafactory`, which generates a class
implementing the target functional interface. The result is cached in a real `CallSite`; every
later execution of that site reuses the linked handle. Since JDK 15 (JEP 371) that generated
class is a **hidden class**, created through `MethodHandles.Lookup::defineHiddenClass` rather
than the old `Unsafe::defineAnonymousClass`. Consequences worth knowing when auditing:

- Not discoverable by name — no `Class.forName`, absent from `getDeclaredClasses`, not
  resolvable through another class's constant pool by simple name. Only the `Class` object
  returned at definition reaches it.
- The name in stack traces changed shape: `MyClass$$Lambda$1` (a sequential suffix) became
  `MyClass$$Lambda/0x0000000800c0c440` — a hex suffix derived from the runtime identity of the
  class object, not a stable index across runs.
- Its own lifecycle: it can be created as a `ClassOption.NESTMATE` to join the nest of the
  class that defined it, and depending on the creation options it can be collected independently
  of its defining `ClassLoader`, unlike a normal class which needs the whole loader to become
  unreachable.

```java
int x = 42;
Supplier<Integer> capturing    = () -> x;    // generally a new instance per creation
Supplier<Integer> nonCapturing = () -> 42;   // generally one reused instance
```

Captured locals (and `this`) are passed as extra arguments to the synthetic method `javac`
generates. "Generally" is load-bearing: this is a `LambdaMetafactory` decision, not a JVMS
guarantee. Measure with `-prof gc`.

## Records, sealed types and pattern switch

- **Records** (JEP 395, final in JDK 16) compile to a `final` class with one private field per
  component, a canonical constructor, generated `equals`/`hashCode`/`toString`, and a `Record`
  attribute (JVMS 4.7.30) listing the components. Without that attribute reflection could not
  enumerate `RecordComponent[]`.
- **Sealed types** (JEP 409, final in JDK 17) add a `PermittedSubclasses` attribute (JVMS
  4.7.31) listing the only permitted subtypes. The **verifier enforces it at load time** — the
  restriction is a JVM one, not only a compiler one.
- **Pattern matching for `switch`** (JEP 441, final in JDK 21), over an exhaustively covered
  sealed hierarchy, compiles without an implicit error `default`: exhaustiveness is proved
  statically from `PermittedSubclasses`. The generated code combines `instanceof`/`checkcast`
  with a `typeSwitch` from `SwitchBootstraps`, itself via `invokedynamic` — not a classic
  `tableswitch`/`lookupswitch` over an integer.

Prefer the pattern forms over the older shapes, which cost an extra instruction:

```java
if (obj instanceof String) { String s = (String) obj; ... }  // redundant second checkcast
if (obj instanceof String s) { ... }                          // one checkcast
```

## Choosing an abstraction

| Abstraction                                    | Bytecode                                                | After JIT                                                                                                                                         | Prefer when                                |
| ---------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Direct method (`invokestatic`/`invokespecial`) | No dispatch                                             | Trivially inlinable when small                                                                                                                    | The abstraction is not needed              |
| Interface with few implementors                | `invokeinterface`                                       | Good while the site stays monomorphic or bimorphic in practice                                                                                    | Polymorphic APIs with low type cardinality |
| Non-capturing lambda                           | `invokedynamic`, generally one reused instance          | Generally equivalent to a method call                                                                                                             | Stateless callbacks                        |
| Capturing lambda                               | `invokedynamic` plus possible per-invocation allocation | Depends on escape analysis removing the allocation                                                                                                | Avoid creating in hot loops unmeasured     |
| Reflection (`Method.invoke`)                   | Indirect call with an access check                      | Slower than a direct call; improves past the `MethodAccessor` inflation threshold (historically 15 invocations), still boxes arguments and return | Outside hot paths                          |
| `MethodHandle`                                 | `invokedynamic` / `invokeExact`                         | Can approach a direct call when held `static final` so the JIT treats it as a constant                                                            | Low-overhead alternative to reflection     |

"Reflection is 10-100x slower" is meaningless without a stated baseline: against an already
inlined `invokevirtual`, on the same JDK, at the same call site, after enough warm-up for the
generated `MethodAccessor` to have taken over. Compared cold, or against a call the JIT could
not inline anyway, the gap can be far smaller. Measure the scenario in question with JMH.

```java
Method m = MyClass.class.getDeclaredMethod("process", int.class);
m.invoke(obj, 42);                       // 42 is boxed into the Object[] internally

MethodHandle mh = MethodHandles.lookup()
    .findVirtual(MyClass.class, "process", MethodType.methodType(void.class, int.class));
mh.invokeExact(obj, 42);                 // obj must be statically typed MyClass:
                                         // invokeExact demands exact static type match

VarHandle vh = MethodHandles.lookup()
    .findVarHandle(MyClass.class, "value", int.class);
int val = (int) vh.getVolatile(obj);     // explicit memory-ordering mode
```

## Finding hidden cost in a disassembly

```bash
javap -c MyClass | grep "Integer.valueOf\|Integer.intValue"   # implicit boxing
javap -c MyClass | grep -A2 "StringBuilder"                   # concat inside a loop
javap -c MyClass | grep -E "tableswitch|lookupswitch"         # which switch form javac chose
```

## Where the bytecode stops answering

The JIT compiles against a **runtime type profile**. Bytecode records only the declared type,
so it cannot tell you whether a speculation held or was invalidated. That question belongs to
the compilation logs, but two corrections are worth carrying across:

```bash
# -XX:+TraceDeoptimization is a DIAGNOSTIC flag: without -XX:+UnlockDiagnosticVMOptions
# the JVM refuses the command line.
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintCompilation -XX:+TraceDeoptimization MyApp

# Cleaner in production — unified logging, no diagnostic flags:
java -Xlog:deoptimization=info:file=deopt.log:time,uptime MyApp

# Or via JFR, correlated with the rest of the recording:
jfr print --events jdk.Deoptimization rec.jfr
```

`-XX:+PrintDeoptimizationInfo` is not a valid HotSpot product flag and produces
"Unrecognized VM option". Check any suspicious flag with
`java -XX:+PrintFlagsFinal -version | grep -i <term>` before it reaches a runbook. Rule out
cold warm-up — process uptime, compilation tier at the start of the window — before concluding
that deoptimisation is the cause.

## Producing your own cost numbers

```bash
java -jar benchmarks.jar BytecodeCostBenchmark -prof perfasm -f 1 -wi 5 -i 5
```

`perfasm` (which needs hsdis for the JDK in use) annotates the real x86/aarch64 assembly C2
generated, with the share of time samples per instruction. That is the only legitimate basis
for "instruction X costs about Y", because the number then arrives with hardware, JDK and
workload attached. Use `-prof gc` when the question is allocation and `-prof perfnorm` for
hardware counters.
