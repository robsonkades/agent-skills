# Dispatch, and what each abstraction compiles to

Every disassembly fragment below is `javac 25.0.3` output (`-g -parameters`, no other flags)
read with `javap -c -p -v` on Temurin 25.0.3. Older javac releases emit different shapes for
the same source; the release that changed each one is named where it matters.

## The invoke family

```
invokestatic    #9   // static method — no dispatch
invokespecial   #8   // constructors, super.m(), and private methods in class files < 55
invokevirtual   #7   // dynamic dispatch on the receiver's runtime type
invokeinterface #10  // dispatch through an interface type
invokedynamic   #11  // lambda, method reference, string concat, pattern switch, record methods
```

`invokestatic` and `invokespecial` resolve to a single concrete method — a direct call.
`invokevirtual` and `invokeinterface` resolve to an entry point that depends on the receiver's
runtime type, which is where inline caching applies.

Since class file 55 (JDK 11, JEP 181 nestmates) javac emits `invokevirtual` for a private
instance method of a class and `invokeinterface` for a private interface method; verified:
`callsPrivate` compiles to `invokevirtual #13 // Method privateHelper:(I)I`. The JVM still
binds a private method non-virtually (JVMS 5.4.3.3 selection never overrides a private
method), so nothing changes at runtime — but a reader who expects `invokespecial` for every
private call will misclassify a site, and a tool that rewrites private calls to
`invokespecial` produces a class the verifier accepts on 55+ only within the same nest.

## Dispatch state is implementation and tier specific

Do not model every virtual call as one universal four-state cache. HotSpot has interpreter
dispatch/caches, profiling data, compiled guarded calls and shared virtual/interface stubs;
their transitions and type-width limits are internal policies that change by tier and release.
A monomorphic profile may let a compiler guard one receiver class, inline the target and
deoptimize if the assumption fails. A polymorphic site may inline selected hot types. A broad
or incomplete profile may retain indirect dispatch. “Megamorphic” therefore does not prove
that every execution performs one particular lookup or that the CPU cannot predict it.

Treat receiver diversity as a call-site hypothesis. Confirm it with compilation/inlining logs,
deoptimization evidence and, only when material, assembly/profile data. Prefer redesign only
when the measured site contributes meaningfully to the objective; stable specialization can
help, but type switches can increase coupling and become slower as the hierarchy evolves.

## Branch and switch instructions

```
ifeq / ifne      // branch on top-of-stack == / != 0
if_icmpeq        // branch on two ints equal
goto             // unconditional
tableswitch      // dense integer-key table encoding
lookupswitch     // sorted key/offset-pair encoding
```

The choice is made by javac from a size/cost heuristic, not simply density: in the tested JDK
25 output, two contiguous cases used `lookupswitch` and three used `tableswitch`. The JVMS
defines bytecode semantics and encodings, not steady-state complexity after JIT lowering; do
not infer nanosecond cost or generated machine-code strategy from the opcode alone.

## What javac desugars, and what it does not

javac primarily lowers language constructs and performs limited folding/simplification; its
exact output is release-dependent. HotSpot then applies tier-, profile- and release-specific
policies to that bytecode. A tested build reported a 35-byte cold-site inline threshold and an
8,000-byte huge-method policy, but neither number is a Java contract and hot paths can follow
different policies. Use the table to find candidate code growth, then confirm the deployed
compiler's decision.

| Source construct                                  | Bytecode on javac 25 (verified)                                                                                                                                                                                       | Size / cost note                                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `"a=" + a + " b=" + b`                            | One `invokedynamic … makeConcatWithConstants` with recipe `a= b=` in `BootstrapMethods` (JEP 280, since JDK 9)                                                                                                        | 8 bytes; no `StringBuilder` anywhere                                                         |
| `s = s + p + ","` in a loop                       | One `makeConcatWithConstants` per iteration — still no `StringBuilder`, so grepping for it finds nothing                                                                                                              | The quadratic copy is inside the linked handle; grep `makeConcatWithConstants` inside a loop |
| `synchronized (lock) { … }`                       | `monitorenter`, body, `monitorexit`, `goto`; plus a handler `any` covering the body that does `monitorexit; athrow`, and a second `any` entry covering the handler itself                                             | 28 bytes for a one-line body; two `Exception table` rows are the tell                        |
| `synchronized void m()`                           | No monitor instructions: `flags: (0x0020) ACC_SYNCHRONIZED`, the interpreter and JIT lock around the body                                                                                                             | 11 bytes for the same body; invisible in `-c`, visible in `-v`                               |
| `try { return 1; } finally { c.close(); }`        | In this javac 25 shape, the `finally` body is duplicated on normal and exceptional paths                                                                                                                              | Duplication varies with exits/control flow; nested cleanup can expand sharply                |
| `try (c) { return 1; }`                           | Null check, `close()` on the normal path, a `Throwable` handler that calls `close()` again inside its own handler feeding `Throwable.addSuppressed`; no `$closeResource` helper on 25                                 | 38 bytes here; above one tested cold threshold, not proof that it cannot inline              |
| `switch (enumInSameNest)`                         | `invokevirtual ordinal()` then `lookupswitch`/`tableswitch` on the ordinal directly                                                                                                                                   |                                                                                              |
| `switch (enumFromAnotherClass)`                   | `getstatic Sw$1.$SwitchMap$Top:[I`, `ordinal()`, `iaload`, then the switch — a synthetic `Sw$1` class maps ordinals so a recompiled enum does not break the caller                                                    | One extra class per switching class; an `iaload` per dispatch                                |
| `switch (string)`                                 | `hashCode()`, `lookupswitch` on the hash, `equals()` per candidate to guard collisions, then a second `lookupswitch`/`tableswitch` on a synthetic index                                                               | 94 bytes for two cases                                                                       |
| `switch (sealed)` with type patterns              | `Objects.requireNonNull`, `invokedynamic typeSwitch(LShape;I)I` (`SwitchBootstraps`), `lookupswitch` over the returned index, `checkcast` per arm — and a synthetic `default` that throws `MatchException` (JDK 21+)  | 93 bytes for two arms; the `MatchException` arm exists even when the switch is exhaustive    |
| `case Circle(double r)` record pattern            | Same `typeSwitch`, then `checkcast` and accessor `invokevirtual r()` per component                                                                                                                                    | 143 bytes for two arms                                                                       |
| `assert x > 0 : "x"`                              | `getstatic $assertionsDisabled`, `ifne` skip, `new AssertionError`; the field is set in `<clinit>` from `Class.desiredAssertionStatus()`                                                                              | Branch exists in bytecode; compiled code may fold the stable condition                       |
| `Integer i; i++`                                  | `intValue`, `iadd`, `Integer.valueOf`; values outside the configured cache may require a wrapper                                                                                                                      | Actual allocation may still be removed by escape analysis                                    |
| `for (Integer x : list) s += x`                   | `iterator()`, `hasNext()`, `next()`, `checkcast Integer`, `intValue` per element                                                                                                                                      |                                                                                              |
| `inner.read()` touching the outer's private field | Plain `getfield Lab.counter` — `NestHost`/`NestMembers` attributes (JEP 181) replaced the `access$000` synthetic accessors of class files < 55                                                                        | No accessor call to inline any more                                                          |
| `record Circle(double r)`                         | `final class … extends java.lang.Record`, a `Record` attribute, and `toString`/`hashCode`/`equals` each a single `invokedynamic` bootstrapped by `ObjectMethods.bootstrap` with a `REF_getField` handle per component | Three dynamic call sites; inspect bootstrap data and runtime linkage                         |
| `obj instanceof String s`                         | `instanceof`, `ifeq`, `aload`, `checkcast`, `astore` — **identical** to `instanceof` followed by an explicit cast                                                                                                     | The pattern form is not a bytecode optimisation; prefer it for the scope rule, not the cost  |

The last row corrects a widespread claim: on javac 25 both forms are 19 bytes with one
`instanceof` and one `checkcast`, and C2 folds the `checkcast` after the `instanceof` in either
case. The reason to prefer the pattern is the flow-scoped binding, not the instruction count.

## invokedynamic and lambdas

```java
Runnable r = () -> System.out.println("hello");
```

```
invokedynamic #17,  0   // InvokeDynamic #0:run:()Ljava/lang/Runnable;
BootstrapMethods:
  0: REF_invokeStatic java/lang/invoke/LambdaMetafactory.metafactory:(…)Ljava/lang/invoke/CallSite;
    Method arguments:
      #278 ()V                                              // erased interface method type
      #279 REF_invokeStatic Lab.lambda$nonCapturing$0:()V   // the body, a private static method
      #278 ()V                                              // instantiated method type
```

Resolution invokes `LambdaMetafactory.metafactory`, which commonly defines a class implementing
the target functional interface, and installs a linked `CallSite`. Concurrent bootstrap
invocations and failure caching follow JVMS 5.4.3.6, so “the bootstrap runs exactly once” is
not a safe operational invariant. Since JDK 15 (JEP 371) that generated
class is a **hidden class**, created through `MethodHandles.Lookup::defineHiddenClass` rather
than the old `Unsafe::defineAnonymousClass`. Consequences worth knowing when auditing:

- Not discoverable by name — no `Class.forName`, absent from `getDeclaredClasses`, not
  resolvable through another class's constant pool by simple name. Only the `Class` object
  returned at definition reaches it.
- The name in stack traces changed shape: `MyClass$$Lambda$1` (a sequential suffix) became
  `MyClass$$Lambda/0x0000000012040438` — a hex suffix derived from the runtime identity of the
  class object, not a stable index across runs. `-Xlog:class+load` prints it as
  `Lab$$Lambda/0x0000000012040438 source: Lab`.
- `LambdaMetafactory` defines its proxies with `ClassOption.NESTMATE` (so the body can be a
  private method of the host) and `ClassOption.STRONG` (JEP 371), so a lambda class lives as
  long as its defining loader like any ordinary class. Hidden classes defined **without**
  `STRONG` — `MethodHandle` lambda forms, some framework proxies — are unloaded when their
  `Class` object becomes unreachable, independently of the loader.

```java
int x = 42;
Supplier<Integer> capturing    = () -> x;    // generally a new instance per creation
Supplier<Integer> nonCapturing = () -> 42;   // generally one reused instance
```

Captured locals (and `this`) are passed as extra arguments to the synthetic method `javac`
generates (`lambda$capturing$0:(I)Ljava/lang/Integer;` above). "Generally" is load-bearing:
this is a `LambdaMetafactory` decision, not a JVMS guarantee. Measure with `-prof gc`.

## Records, sealed types and pattern switch

- **Records** (JEP 395, final in JDK 16) compile to a `final` class extending
  `java.lang.Record` with one `private final` field per component, a canonical constructor, a
  `Record` attribute (JVMS 4.7.30) listing the components, and `equals`/`hashCode`/`toString`
  implemented as `invokedynamic` sites bootstrapped by `java.lang.runtime.ObjectMethods`.
  Without the attribute reflection could not enumerate `RecordComponent[]`; without the
  bootstrap there is no method body to read, which is why a record's `toString` cost cannot be
  judged from `javap`.
- **Sealed types** (JEP 409, final in JDK 17) add a `PermittedSubclasses` attribute (JVMS
  4.7.31) listing the only permitted subtypes. The JVM enforces it when a subclass is
  **derived** (JVMS 5.3.5): a class naming a sealed supertype that does not permit it fails
  with `IncompatibleClassChangeError` at load. That is class derivation, not the verifier, and
  it is a JVM restriction, not only a compiler one.
- **Pattern matching for `switch`** (JEP 441, final in JDK 21) over a sealed hierarchy uses
  `invokedynamic typeSwitch` from `SwitchBootstraps` and a `lookupswitch` over the index it
  returns — not a classic switch over an integer. Exhaustiveness is proved statically from
  `PermittedSubclasses`, yet javac **still emits** a `default` arm that throws
  `MatchException` (verified: `new MatchException(null, null); athrow`), because a permitted
  subclass added and compiled separately would otherwise fall through. A `MatchException` in
  production usually indicates binary evolution or an inconsistent runtime class path/module
  path; distinguish stale artifacts from generated/adversarial class files before remediation.

## Choosing an abstraction

| Abstraction                                    | Bytecode                                                | After JIT                                                                                                              | Prefer when                             |
| ---------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Direct method (`invokestatic`/`invokespecial`) | No receiver dispatch                                    | Often easy to inline, subject to size, tier, profile and compiler policy                                               | No polymorphic substitution is required |
| Interface call                                 | `invokeinterface`                                       | Can inline profiled targets or retain indirect dispatch; implementor count alone does not determine one site's profile | Substitution improves design            |
| Non-capturing lambda                           | `invokedynamic`, commonly one reused instance           | Can optimize toward a direct call when linkage/profile are visible                                                     | Stateless callbacks                     |
| Capturing lambda                               | `invokedynamic` plus possible per-invocation allocation | Depends on escape analysis removing the allocation                                                                     | Avoid creating in hot loops unmeasured  |
| Reflection (`Method.invoke`)                   | Source call is ordinary invocation of reflection API    | JDK 18+ uses method handles internally; access, adaptation and varargs/boxing costs depend on usage                    | Dynamic metadata-driven integration     |
| `MethodHandle.invokeExact`                     | Signature-polymorphic `invokevirtual` in class file     | A stable/constant handle and exact types can expose the target to optimization; mutable/adapted chains cost more       | Typed dynamic linkage                   |

"Reflection is 10-100x slower" is meaningless without a stated baseline: against an already
inlined `invokevirtual`, on the same JDK, at the same call site, after warm-up. Compared cold,
or against a call the JIT could not inline anyway, the gap can be far smaller. Measure the
scenario in question with JMH. The per-operation cost model, and why a runbook that still sets
`sun.reflect.inflationThreshold` describes a JVM that no longer exists, are
`java-reflection-and-method-handles`' subject.

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
javap -c -p MyClass | grep -E "Integer.valueOf|Integer.intValue|Long.valueOf"   # implicit boxing
javap -c -p MyClass | grep -B3 "makeConcatWithConstants" | grep -E "goto|if"    # concat inside a loop
javap -c -p MyClass | grep -E "tableswitch|lookupswitch|typeSwitch"             # which switch form javac chose
javap -c -p MyClass | grep -cE "monitorenter"                                    # synchronized blocks (methods: -v, ACC_SYNCHRONIZED)
javap -v -p MyClass | grep -E "^  [a-z].*\(|stack=.*locals="                     # per-method max_stack/max_locals; code_length needs the Class-File API
```

`grep StringBuilder` finds concatenation only in class files compiled by JDK 8 or with
`-XDstringConcat=inline` (verified: that flag brings the five `StringBuilder` calls back). On
anything built by a current javac the loop-concatenation smell is a `makeConcatWithConstants`
site between a backward `goto` and its target.

## Where the bytecode stops answering

The JIT compiles against a **runtime type profile**. Bytecode records only the declared type,
so it cannot tell you whether a speculation held or was invalidated. That question belongs to
the compilation logs, but two corrections are worth carrying across:

```bash
# -XX:+TraceDeoptimization is a DIAGNOSTIC flag: without -XX:+UnlockDiagnosticVMOptions
# the JVM refuses the command line (verified: "must be enabled via -XX:+UnlockDiagnosticVMOptions").
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintCompilation -XX:+TraceDeoptimization MyApp

# Cleaner in production — unified logging, no diagnostic flags:
java -Xlog:deoptimization=info:file=deopt.log:time,uptime MyApp

# Or via JFR, correlated with the rest of the recording:
jfr print --events jdk.Deoptimization rec.jfr
```

`-XX:+PrintDeoptimizationInfo` is not a HotSpot flag: `Unrecognized VM option
'PrintDeoptimizationInfo'`, with the JVM suggesting `PrintDeoptimizationDetails` — itself a
debug-build flag. Check any suspicious flag with
`java -XX:+PrintFlagsFinal -version | grep -i <term>` before it reaches a runbook. Rule out
cold warm-up — process uptime, compilation tier at the start of the window — before concluding
that deoptimisation is the cause.

## Producing your own cost numbers

```bash
java -jar benchmarks.jar BytecodeCostBenchmark -prof perfasm -f 1 -wi 5 -i 5
```

`perfasm` (which needs compatible disassembly support) can annotate generated assembly with
sample locations. Use it as one link in an evidence chain: a representative benchmark,
compiler logs, enough samples, counter multiplexing checks and the deployed architecture/JDK.
Use `-prof gc` for allocation hypotheses and suitable hardware counters for stalls/branches;
validate any optimization on the production objective, especially tail latency and throughput.

## Primary references

- [JVMS 25, instruction set](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-6.html)
- [JVMS 25, method and dynamic-call-site resolution](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-5.html#jvms-5.4.3)
- [JEP 181: Nest-Based Access Control](https://openjdk.org/jeps/181)
- [JEP 280: Indify String Concatenation](https://openjdk.org/jeps/280)
- [JEP 371: Hidden Classes](https://openjdk.org/jeps/371)
- [JEP 416: Reimplement Core Reflection with Method Handles](https://openjdk.org/jeps/416)
- [JEP 441: Pattern Matching for `switch`](https://openjdk.org/jeps/441)
