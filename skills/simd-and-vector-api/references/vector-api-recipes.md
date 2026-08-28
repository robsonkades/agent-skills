# Vector API recipes

## Compiling, running and confirming

```bash
javac --add-modules jdk.incubator.vector VectorAPILab.java
java  --add-modules jdk.incubator.vector VectorAPILab

# Confirm the intrinsics actually became vector instructions
java --add-modules jdk.incubator.vector \
     -XX:+UnlockDiagnosticVMOptions -XX:+PrintAssembly \
     -XX:CompileCommand=print,*VectorAPILab.dotProductVector VectorAPILab

# Which intrinsic candidates C2 substituted — useful when the method is too
# large to scan the assembly for one vector operation
java --add-modules jdk.incubator.vector \
     -XX:+UnlockDiagnosticVMOptions -XX:+PrintIntrinsics VectorAPILab
```

What to look for in the assembly: `ymm` (AVX2, 256-bit) or `zmm` (AVX-512, 512-bit)
registers, and mnemonics such as `vmovups`, `vaddps`, `vpaddd`, `vfmadd231ps`.

The `CompileCommand` pattern must name the class and method actually under investigation. A
wrong name produces no output and no error — indistinguishable at a glance from "it did not
vectorise". Warm up enough to reach C2; tier 1–3 code proves nothing.

## Species and lanes

| Species                 | Width   | `float` / `int` | `double` / `long` | `byte` |
| ----------------------- | ------- | --------------- | ----------------- | ------ |
| `SPECIES_64`            | 64-bit  | 2               | 1                 | 8      |
| `SPECIES_128` (SSE2)    | 128-bit | 4               | 2                 | 16     |
| `SPECIES_256` (AVX2)    | 256-bit | 8               | 4                 | 32     |
| `SPECIES_512` (AVX-512) | 512-bit | 16              | 8                 | 64     |

The three core abstractions: `VectorSpecies<E>` pairs an element type with a `VectorShape`
and so fixes the lane count; `Vector<E>` (`FloatVector`, `IntVector`, `DoubleVector`, …) is
the immutable vector value; `VectorMask<E>` is a per-lane boolean used for comparison,
blend, partial load/store and masked tails.

`SPECIES_PREFERRED` resolves at run time to the widest width the current CPU supports — the
default choice for a library or service on a heterogeneous fleet. A fixed species gives
deterministic width in exchange for wasted capacity on wider hardware and a silent scalar
fallback on narrower hardware.

## Loop shape: explicit scalar tail

```java
static final VectorSpecies<Float> FSPECIES = FloatVector.SPECIES_PREFERRED;

static void addArraysVector(float[] a, float[] b, float[] c) {
    int length = a.length;
    int upperBound = FSPECIES.loopBound(length);
    int i = 0;
    for (; i < upperBound; i += FSPECIES.length()) {
        FloatVector va = FloatVector.fromArray(FSPECIES, a, i);
        FloatVector vb = FloatVector.fromArray(FSPECIES, b, i);
        va.add(vb).intoArray(c, i);
    }
    for (; i < length; i++) {          // 0 to LANES-1 remaining elements
        c[i] = a[i] + b[i];
    }
}
```

## Loop shape: masked tail

```java
static void addArraysVectorMasked(float[] a, float[] b, float[] c) {
    int length = a.length;
    for (int i = 0; i < length; i += FSPECIES.length()) {
        VectorMask<Float> mask = FSPECIES.indexInRange(i, length);
        FloatVector va = FloatVector.fromArray(FSPECIES, a, i, mask);
        FloatVector vb = FloatVector.fromArray(FSPECIES, b, i, mask);
        va.add(vb).intoArray(c, i, mask);
    }
}
```

`fromArray(species, array, offset, mask)` takes four arguments; `intoArray(array, offset,
mask)` takes three. AVX2 emulates masks through `blend`; AVX-512 has native mask registers,
so the relative cost of masked operations differs by hardware generation — measure it.

## Reduction with FMA

```java
static float dotProductVector(float[] a, float[] b) {
    int bound = FSPECIES.loopBound(a.length);
    FloatVector accumulator = FloatVector.zero(FSPECIES);
    int i = 0;
    for (; i < bound; i += FSPECIES.length()) {
        FloatVector va = FloatVector.fromArray(FSPECIES, a, i);
        FloatVector vb = FloatVector.fromArray(FSPECIES, b, i);
        accumulator = va.fma(vb, accumulator);      // one vfmadd231ps
    }
    float sum = accumulator.reduceLanes(VectorOperators.ADD);
    for (; i < a.length; i++) sum += a[i] * b[i];
    return sum;
}
```

## Conditional count via mask

```java
static int countAboveVector(float[] data, float threshold) {
    FloatVector vthreshold = FloatVector.broadcast(FSPECIES, threshold);
    int bound = FSPECIES.loopBound(data.length);
    int count = 0;
    int i = 0;
    for (; i < bound; i += FSPECIES.length()) {
        FloatVector v = FloatVector.fromArray(FSPECIES, data, i);
        count += v.compare(VectorOperators.GT, vthreshold).trueCount();
    }
    for (; i < data.length; i++) if (data[i] > threshold) count++;
    return count;
}
```

## Measuring

```java
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@State(Scope.Thread)
@Warmup(iterations = 5, time = 1)
@Measurement(iterations = 5, time = 1)
@Fork(1)
public class VectorBenchmark {

    @Param({"1024", "65536", "1048576"})
    int size;

    @Benchmark
    public float dotProductVector() {          // returned — JMH consumes it
        return VectorAPILab.dotProductVector(a, b);
    }

    @Benchmark
    public void addVectorized(Blackhole bh) {  // void — Blackhole required
        VectorAPILab.addArraysVector(a, b, out);
        bh.consume(out);
    }
}
```

Run the benchmark jar with the module flag too:
`java --add-modules jdk.incubator.vector -jar benchmarks.jar VectorBenchmark`.

## Off-heap alignment

Array alignment is not controllable from Java, and the JVM's object alignment is already
sufficient for common SIMD accesses. For explicit alignment in off-heap buffers shared with
native code, the mechanism is the FFM API — final since JDK 22, no `--add-modules`:

```java
MemoryLayout layout = MemoryLayout.sequenceLayout(
    count, ValueLayout.JAVA_FLOAT.withByteAlignment(32));  // 32 bytes = AVX2 width
```
