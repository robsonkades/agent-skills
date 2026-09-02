# javap, the class file, and the verifier

Every output fragment below is from Temurin 25.0.3 (`javac 25.0.3`, class file 69.0).

## Invocations

```bash
javac -g -parameters MyClass.java           # -g: LocalVariableTable; -parameters: MethodParameters
javap MyClass                               # signatures only
javap -c MyClass                            # with bytecode
javap -c -p MyClass                         # include private members
javap -c -l MyClass                         # plus LineNumberTable and LocalVariableTable
javap -v MyClass                            # constant pool + all attributes (-v = -verbose)
javap -s MyClass                            # descriptors next to each member
javap -constants MyClass                    # static final constant values
javap -sysinfo MyClass                      # path, size, SHA-256 — which file was actually read
javap -c -classpath myapp.jar com.example.MyClass
javap -c --module java.base java.lang.String
```

`-v` implies `-c`, `-l` and `-s` but not `-p`: private members still need `-p`.
`javap -c -p -v` is the one invocation that shows everything.

## An annotated JDK 25 disassembly

```
public class MyClass
  minor version: 0
  major version: 69        <- JDK 25 (69 = 25 + 44)
  flags: (0x0021) ACC_PUBLIC, ACC_SUPER
  this_class: #5           // MyClass
  super_class: #6          // java/lang/Object
Constant pool:
   #1 = Methodref  #6.#20  // java/lang/Object."<init>":()V

public int add(int, int);
  descriptor: (II)I
  Code:
    stack=2, locals=3, args_size=3   <- max_stack, max_locals (locals includes 'this')
    0: iload_1     <- parameter 'a'; local 0 is 'this' in an instance method
    1: iload_2     <- parameter 'b'
    2: iadd
    3: ireturn
    LocalVariableTable:
      Slot  Name   Signature
         0  this   LMyClass;
         1  a      I
         2  b      I
    MethodParameters:
      Name   Flags
      a
      b
```

The first parameter of an **instance** method is slot **1**, because slot 0 is always `this`.
In a `static` method there is no `this` and the first parameter is slot **0**. `long` and
`double` take two slots. Read the `LocalVariableTable` rather than counting; this is the most
common error when reading bytecode from memory.

Two attributes carry parameter names and they come from different flags. `LocalVariableTable`
(JVMS 4.7.13) is debug information from `-g`, present only for methods with a body, and
stripped by any "no debug info" build. `MethodParameters` (JVMS 4.7.24) comes from
`-parameters`, exists for abstract and interface methods too, and is what
`java.lang.reflect.Parameter::getName` reads. A framework that resolves names reflectively
(Spring Framework 6.1 removed its `LocalVariableTable` fallback — not verified here) sees
`arg0` when the build forgot `-parameters`, and `javap -v` settles which attribute is present
in seconds.

## major_version

```
major_version = JDK version + 44
```

| JDK    | major_version |
| ------ | ------------- |
| 8      | 52            |
| 11     | 55            |
| 17     | 61            |
| 21     | 65            |
| 24     | 68            |
| **25** | **69**        |

JVMS SE 25 §4.1 supports class files with major versions 45 through 69 — full backward
compatibility, no forward compatibility. Running a patched version-70 file on 25 gives the
exact message:

```
UnsupportedClassVersionError: Lab has been compiled by a more recent version of the Java
Runtime (class file version 70.0), this version of the Java Runtime only recognizes class
file versions up to 69.0
```

Both numbers are in the message, which is already the diagnosis. Below 45 is a different
message (`was compiled with an invalid major version`) and means a corrupt file.

`minor_version` is 0 for almost every class file. The exception is `0xFFFF` (65535), reserved
to mean "this file depends on preview features of the feature release named by
`major_version`". Such a file loads only on exactly that release, and only with
`--enable-preview` at runtime too:

```bash
javac --release 25 --enable-preview Main.java
java --enable-preview Main
# without the runtime flag:
# UnsupportedClassVersionError: Preview features are not enabled for Main
#   (class file version 69.65535). Try running with '--enable-preview'
```

The marker is set by **use**, not by the flag: compiling a class that touches nothing preview
with `--enable-preview` leaves `minor version: 0`, while a plain reference to a preview API
(`StructuredTaskScope.class` on 25) sets 65535 with no preview syntax at all. Both verified.

## The structure

```
ClassFile {
    u4 magic;              // always 0xCAFEBABE
    u2 minor_version;  u2 major_version;
    u2 constant_pool_count;  cp_info constant_pool[...];
    u2 access_flags;  u2 this_class;  u2 super_class;
    u2 interfaces_count;  u2 interfaces[...];
    u2 fields_count;      field_info  fields[...];
    u2 methods_count;     method_info methods[...];
    u2 attributes_count;  attribute_info attributes[...];
}
```

Every count is a `u2`, which is where the 65535 limits come from — and `code_length` inside
the `Code` attribute is limited to 65535 by JVMS 4.7.3 even though it is stored as a `u4`. The
limits, the javac errors they produce and the JIT's own smaller limit are in
`limits-and-failure-catalogue.md`.

## The constant pool

The constant pool holds every literal, class name, method name, type descriptor and
field/method reference, indexed by position. `invokevirtual #7` carries an index, never a
name. Resolution — turning `#7` into a real pointer — happens lazily on first execution of
that point, and is then cached in HotSpot's constant pool cache (a runtime structure, not part
of the file). Consequence: **loading a class does not resolve the symbols it references.** A
class can load successfully while referencing symbols that will never exist, as long as the
code path using them never runs. Verified shape: `A` compiled against `B.m()` and `B.n()`,
`B` recompiled without `m`, `A` prints the result of `n()` and then throws
`NoSuchMethodError: 'int B.m()'` — at the call, not at load.

Entry kinds as `javap -v` prints them (JVMS 4.4):

| Tag | `javap -v` form                                                             | Introduced by            |
| --- | --------------------------------------------------------------------------- | ------------------------ |
| 1   | `Utf8               java/lang/Object`                                       | everything               |
| 3–6 | `Integer`, `Float`, `Long`, `Double` — `long`/`double` occupy two indices   | `ldc`, `ldc2_w`          |
| 7   | `Class              #4            // java/lang/Object`                      | `new`, `checkcast`, …    |
| 8   | `String             #12           // hello`                                 | `ldc`                    |
| 9   | `Fieldref           #8.#9         // Lab.lock:Ljava/lang/Object;`           | `getfield`, `putstatic`  |
| 10  | `Methodref          #2.#3         // java/lang/Object."<init>":()V`         | `invokevirtual`, …       |
| 11  | `InterfaceMethodref #33.#34       // java/util/List.iterator:…`             | `invokeinterface`        |
| 12  | `NameAndType        #5:#6         // "<init>":()V`                          | the refs above           |
| 15  | `MethodHandle       6:#280        // REF_invokeStatic Lab.lambda$…:()V`     | bootstrap arguments      |
| 16  | `MethodType         #6            //  ()V`                                  | bootstrap arguments      |
| 17  | `Dynamic` — `ldc` of a bootstrap-computed constant (JEP 309, class file 55) | rare from javac          |
| 18  | `InvokeDynamic      #0:#18        // #0:run:()Ljava/lang/Runnable;`         | `invokedynamic`          |
| 19  | `Module`, 20 `Package`                                                      | `module-info.class` only |

The `MethodHandle` and `MethodType` entries are how a lambda's implementation method and a
record's component getters reach their bootstrap: `#0` in an `InvokeDynamic` entry indexes the
`BootstrapMethods` attribute (JVMS 4.7.23), whose arguments are these constants.
`REF_invokeStatic` (kind 6), `REF_getField` (1), `REF_invokeVirtual` (5) and
`REF_newInvokeSpecial` (8) are the reference kinds (JVMS 5.4.3.5). `CONSTANT_Dynamic` is the same mechanism for a constant rather
than a call site; javac does not emit it for ordinary source, so its presence marks generated
or hand-built bytecode.

## Descriptors versus Signature

```
I int   J long   D double  F float
Z boolean  B byte  C char  S short   V void (return only)

Ljava/lang/String;   String            [I   int[]
[[I  int[][]                          [Ljava/lang/String;  String[]

(Ljava/lang/String;I)V   void m(String, int)
(II)Ljava/lang/String;   String m(int, int)
```

| Aspect                   | Descriptor                                | Signature attribute                 |
| ------------------------ | ----------------------------------------- | ----------------------------------- |
| Always present?          | Yes, on every field and method            | Only when generics are involved     |
| Relation to type erasure | It _is_ the erased form                   | Carries the original generic type   |
| Used by                  | Verifier, resolution, the invoke\* family | Reflection, static analysis tooling |
| Location                 | Part of `method_info` / `field_info`      | Separate attribute (JVMS 4.7.9)     |

`List<String> getNames()` has descriptor `()Ljava/util/List;` — the element type survives only
in `Signature`. Two methods that differ only in a generic parameter have the same descriptor,
which is why javac refuses them as a name clash: the class file could not hold both.

## What the verifier checks

Verification is the first step of linking (JVMS 5.4: verification, preparation, resolution)
and proves statically that the bytecode cannot violate type safety in any possible execution
— including bytecode produced by a tool or crafted maliciously. Specifically:

1. **Structure** — magic number, consistent counts, constant pool indices in range. Failures
   here are `ClassFormatError`, raised at load rather than at link.
2. **Per-instruction typing** — `iadd` requires two `int` on the stack, not an `int` and a
   reference.
3. **Stack consistency** — never negative, never above `max_stack`, and the same shape at every
   point where control paths converge.
4. **Branch validity** — jumps land on an instruction boundary, never inside a multi-byte one.
5. **Return consistency** — every returning path yields the declared type.
6. **Initialisation before use** — an object cannot be used before its constructor completes.
7. **`protected` access** — subclasses in another package cannot reach `protected` members of
   instances that are not of their own type or a subtype.

Type merging at a branch join is a lattice join, climbing superclasses to the common ancestor:

```
if (c) { /* stack: [String]  */ } else { /* stack: [Integer] */ }
        /* after the merge:  [Object] */
```

That is why a `checkcast` follows a merge before a `String` method is called. The join only
constrains the verifier; C2 computes its own types from the flow and the type profile, so the
merge is not a lost optimisation.

Since class file 50 (Java 6) the verifier uses the **`StackMapTable`** attribute (JVMS 4.7.4,
4.10.1) — precomputed snapshots of stack and local types at every branch target, written by
`javac` or by any competent bytecode generator — instead of full data-flow analysis at load
time. From version 51 the attribute is mandatory and there is no fallback verifier. What it
looks like:

```
StackMapTable: number_of_entries = 2
  frame_type = 253 /* append */
    offset_delta = 10
    locals = [ class java/lang/String, class java/util/Iterator ]
  frame_type = 250 /* chop */
    offset_delta = 29
```

A method with no branches has no `StackMapTable` at all (straight-line code needs no frame),
so its absence is a bug only when the code has a branch target. And what the two classic
generator failures look like, reproduced by editing a method with the Class-File API:

```
VerifyError: Expecting a stackmap frame at branch target 12      <- frames dropped
  Location: Lab.<clinit>()V @5: ifne
  Reason:   Expected stackmap frame at this location.

VerifyError: Bad type on operand stack                           <- frames stale or
  Location: Lab.constFold()I @4: ireturn                             instruction wrong
  Reason:   Type null (current frame, stack[0]) is not assignable to integer
  Current Frame: bci: @4 ...
```

`Exception Details` names the method, the `bci` and the instruction; `Current Frame` is the
verifier's view of the stack there. `-Xlog:verification` adds `Verifying class Lab with new
format` and `Verification for Lab failed` around it. The verification flags, and why turning
verification off is not a fix, are in `limits-and-failure-catalogue.md`.

## Diagnosing a VerifyError after instrumentation

1. Run `javap -v` on the **rejected** class — the instrumented one, not the original — and
   check whether the `StackMapTable` exists and its `offset_delta` chain lands on every branch
   target in `Code`.
2. If the class was generated at runtime, dump it (below) before you can disassemble it.
3. Pin the exact version of the bytecode library in use and confirm it declares support for the
   target JDK's major version — the catalogue lists the exact messages an old ASM, Byte Buddy
   or JaCoCo produces on 69.

The fix is nearly always on the generator's side:

```java
ClassWriter cw = new ClassWriter(ClassWriter.COMPUTE_FRAMES | ClassWriter.COMPUTE_MAXS);
```

Frames must be recomputed from the final bytecode, not copied from the original.
`COMPUTE_FRAMES` has its own trap: to merge two reference types it calls
`ClassWriter::getCommonSuperClass`, whose default implementation loads both classes with
`Class.forName` through the `ClassWriter`'s loader. Inside a `ClassFileTransformer` that
means loading classes during class loading — `ClassCircularityError`, `LinkageError`, or a
class defined by the wrong loader. Override `getCommonSuperClass` to answer from the class
hierarchy without loading, or use the Class-File API, which answers from a
`ClassHierarchyResolver` you supply.

## Dumping classes generated at runtime

```bash
java -Djdk.invoke.LambdaMetafactory.dumpProxyClassFiles=true MyApplication
#   -> ./DUMP_LAMBDA_PROXY_CLASS_FILES/MyClass$$Lambda.0x0000000019040438.class
javap -c -p 'DUMP_LAMBDA_PROXY_CLASS_FILES/MyClass$$Lambda.0x0000000019040438.class'

java -Dnet.bytebuddy.dump=/tmp/bytebuddy MyApplication      # Byte Buddy (not verified here)
```

The lambda property is a boolean on JDK 25 and the directory is fixed. The old
`-Djdk.internal.lambda.dumpProxyClasses=<dir>` **produces nothing** on 25 — no warning, no
files (verified); a runbook still carrying it dumps nothing and nobody notices. When the
rename happened is not verified here.

A dump is the first tool to reach for whenever the question is "what did this framework
actually generate", because without one you only ever see the effect — runtime behaviour, or
a `VerifyError` — never the cause. The lambda dump works precisely because it writes the bytes
before the hidden class is defined; afterwards the class is not discoverable by name, only
visible as `Lab$$Lambda/0x0000000012040438 source: Lab` in `-Xlog:class+load`.

## Reading and rewriting class files: the Class-File API and ASM

Since JDK 24 the JDK ships its own class-file library, `java.lang.classfile` (JEP 484, final
in 24; previewed in 22 and 23 under JEPs 457 and 466). javac, jlink and `jdk.jshell` use it,
so it reads and writes every class file version the running JDK does — the coupling that
breaks every third-party library on each release does not exist for it. Verified on 25:

```java
import java.lang.classfile.*;
import java.lang.classfile.attribute.*;
import java.lang.classfile.instruction.*;

ClassModel cm = ClassFile.of().parse(Files.readAllBytes(path));
cm.majorVersion();                                            // 69
for (MethodModel m : cm.methods()) {
    int codeLength = m.findAttribute(Attributes.code())
                      .map(CodeAttribute::codeLength).orElse(0);     // the 64 KB / 8000 numbers
    boolean frames = m.findAttribute(Attributes.code())
                      .flatMap(c -> c.findAttribute(Attributes.stackMapTable())).isPresent();
}

// Rewrite: insert a nop before every return; stack maps are regenerated by default.
byte[] out = ClassFile.of().transformClass(cm,
    ClassTransform.transformingMethodBodies((cb, e) -> {
        if (e instanceof ReturnInstruction) cb.nop();
        cb.with(e);
    }));
```

Two behaviours matter for diagnosis. A method body the transform does not touch is copied
verbatim, original `StackMapTable` included; only rebuilt bodies get regenerated frames.
`ClassFile.StackMapsOption.DROP_STACK_MAPS` on a rebuilt body is how the
`Expecting a stackmap frame` error above was produced — the option exists for generators that
target class file 49 and below, and is wrong for anything javac emits today. Frame generation
needs the class hierarchy to merge reference types; supply
`ClassFile.ClassHierarchyResolverOption` when the classes are not loadable from the system
loader.

ASM remains the library most agents embed, and its version is coupled to the class file
version: `ClassReader` throws `IllegalArgumentException: Unsupported class file major
version 69` from any release older than the one that added 69 (9.7.1 refuses, 9.8 reads;
verified). `Opcodes.ASM9` is still the API level in 9.8 and 9.9 — the constant does not change,
the supported version does, so an agent can compile against a current API and still ship an
ASM that refuses the runtime's class files.

```java
ClassReader cr = new ClassReader(bytes);
ClassWriter cw = new ClassWriter(cr, ClassWriter.COMPUTE_FRAMES | ClassWriter.COMPUTE_MAXS);
ClassVisitor cv = new ClassVisitor(Opcodes.ASM9, cw) { /* visitMethod, ... */ };
cr.accept(cv, ClassReader.EXPAND_FRAMES);
```

With `COMPUTE_FRAMES` the frames the reader visits are ignored and recomputed from the final
code, which is the point; `EXPAND_FRAMES` makes the reader deliver them uncompressed for any
visitor that reads them on the way. A writer built **without** `COMPUTE_FRAMES` copies the
original frames through — correct only if no instruction moved. Inserting code under that
configuration is the stale-frame `VerifyError`.
