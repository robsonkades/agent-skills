# javap, the class file, and the verifier

## Invocations

```bash
javac -g MyClass.java                       # keep debug info: local variable names
javap MyClass                               # signatures only
javap -c MyClass                            # with bytecode
javap -c -p MyClass                         # include private members
javap -v MyClass                            # constant pool + all attributes (-v = -verbose)
javap -c -classpath myapp.jar com.example.MyClass
```

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
```

The first parameter of an **instance** method is slot **1**, because slot 0 is always `this`.
In a `static` method there is no `this` and the first parameter is slot **0**. Read the
`LocalVariableTable` rather than counting; this is the most common error when reading
bytecode from memory.

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

JVMS SE 25 supports class files with major versions 45 through 69 — full backward
compatibility, no forward compatibility. A version-69 class file on a JDK 21 runtime throws
`UnsupportedClassVersionError`, and the message carries both numbers
(`class file version 69.0, this version of the Java Runtime only recognizes class file
versions up to 65.0`), which is already the diagnosis.

`minor_version` is 0 for almost every class file. The exception is `0xFFFF`, reserved to mean
"this file depends on preview features of the feature release named by `major_version`". Such
a file loads only on exactly that release, and only with `--enable-preview` at runtime too:

```bash
javac --release 25 --enable-preview Main.java
java --enable-preview Main
```

Depending on a preview **API** sets the marker even when no preview syntax was used.

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

The constant pool holds every literal, class name, method name, type descriptor and
field/method reference, indexed by position. `invokevirtual #7` carries an index, never a
name. Resolution — turning `#7` into a real pointer — happens lazily on first execution of
that point, and is then cached in HotSpot's constant pool cache (a runtime structure, not part
of the file). Consequence: **loading a class does not resolve the symbols it references.** A
class can load successfully while referencing symbols that will never exist, as long as the
code path using them never runs.

## Descriptors versus Signature

```
I int   J long   D double  F float
Z boolean  B byte  C char  S short   V void (return only)

Ljava/lang/String;   String            [I   int[]
[[I  int[][]                          [Ljava/lang/String;  String[]

(Ljava/lang/String;I)V   void m(String, int)
(II)Ljava/lang/String;   String m(int, int)
```

| Aspect                   | Descriptor                                         | Signature attribute                 |
| ------------------------ | -------------------------------------------------- | ----------------------------------- |
| Always present?          | Yes, on every field and method                     | Only when generics are involved     |
| Relation to type erasure | It _is_ the erased form                            | Carries the original generic type   |
| Used by                  | Verifier, overload resolution, the invoke\* family | Reflection, static analysis tooling |
| Location                 | Part of `method_info` / `field_info`               | Separate attribute (JVMS 4.7.9)     |

`List<String> getNames()` has descriptor `()Ljava/util/List;` — the element type survives only
in `Signature`.

## What the verifier checks

The verifier runs during linking, between loading and preparation, and proves statically that
the bytecode cannot violate type safety in any possible execution — including bytecode
produced by a tool or crafted maliciously. Specifically:

1. **Structure** — magic number, consistent counts, constant pool indices in range.
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

Safe, but it discards type information the source compiler had and the JIT will not recover.

Since Java 6 (major version 50) the verifier uses the **`StackMapTable`** attribute —
precomputed snapshots of stack and local types at every branch target, written by `javac` or by
any competent bytecode generator — instead of full data-flow analysis at load time.

## Diagnosing a VerifyError after instrumentation

1. Run `javap -v` on the **rejected** class — the instrumented one, not the original — and
   check whether the `StackMapTable` exists and is consistent with the code.
2. If the class was generated at runtime, dump it (below) before you can disassemble it.
3. Pin the exact version of the bytecode library in use and confirm it declares support for the
   target JDK's major version.

The fix is nearly always on the generator's side:

```java
ClassWriter cw = new ClassWriter(ClassWriter.COMPUTE_FRAMES | ClassWriter.COMPUTE_MAXS);
```

Frames must be recomputed from the final bytecode, not copied from the original.

## Dumping classes generated at runtime

```bash
java -Djdk.internal.lambda.dumpProxyClasses=/tmp/lambdas MyApplication
java -Dnet.bytebuddy.dump=/tmp/bytebuddy MyApplication

javap -c /tmp/lambdas/MyClass\$\$Lambda*.class
```

Both system properties still apply on the JDK 25 baseline. They are the first tool to reach for
whenever the question is "what did this framework actually generate", because without a dump
you only ever see the effect — runtime behaviour, or a `VerifyError` — never the cause. The
lambda dump works precisely because it writes the bytes before the hidden class is defined; a
hidden class is not discoverable by name afterwards.

## Reading a class with ASM

```java
ClassReader cr = new ClassReader("com.example.MyClass");
ClassWriter cw = new ClassWriter(ClassWriter.COMPUTE_FRAMES | ClassWriter.COMPUTE_MAXS);
ClassVisitor cv = new ClassVisitor(Opcodes.ASM9, cw) { /* visitMethod, ... */ };
cr.accept(cv, ClassReader.EXPAND_FRAMES);
```

`Opcodes.ASM9` remains the stable, recommended API level in current ASM releases (9.7+); minor
versions add recognition of newer class file major versions without renaming the constant.
