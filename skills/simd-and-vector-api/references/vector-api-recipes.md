# Vector API recipes

## Compiling, running and confirming

```bash
javac --add-modules jdk.incubator.vector VectorAPILab.java
java  --add-modules jdk.incubator.vector VectorAPILab

# Capture the target compilation; decode the loop to prove the lowering
java --add-modules jdk.incubator.vector \
     -XX:+UnlockDiagnosticVMOptions -XX:+PrintAssembly \
     -XX:CompileCommand=print,*VectorAPILab.dotProductVector VectorAPILab

# Supporting diagnostic: which intrinsic candidates C2 accepted
java --add-modules jdk.incubator.vector \
     -XX:+UnlockDiagnosticVMOptions -XX:+PrintIntrinsics VectorAPILab
```

In assembly, identify packed lane-bearing operations such as `vaddps`, `vpaddd` or an FMA,
their register width, loads/stores, masks, loop backedge and tail. A `v` prefix or `xmm`
register alone can be a scalar VEX instruction and does not prove a vector loop.

The `CompileCommand` pattern must name the class and method actually under investigation. A
wrong name produces no output and no error—indistinguishable at a glance from "it did not
vectorise". Correlate compile id, C2 compiler and normal/OSR body with the measured fork;
`PrintIntrinsics` does not prove a particular final machine sequence.

## Species and lanes

| Species       | Width   | `float` / `int` | `double` / `long` | `byte` |
| ------------- | ------- | --------------- | ----------------- | ------ |
| `SPECIES_64`  | 64-bit  | 2               | 1                 | 8      |
| `SPECIES_128` | 128-bit | 4               | 2                 | 16     |
| `SPECIES_256` | 256-bit | 8               | 4                 | 32     |
| `SPECIES_512` | 512-bit | 16              | 8                 | 64     |

The three core abstractions: `VectorSpecies<E>` pairs an element type with a `VectorShape`
and so fixes the lane count; `Vector<E>` (`FloatVector`, `IntVector`, `DoubleVector`, …) is
the immutable vector value; `VectorMask<E>` is a per-lane boolean used for comparison,
blend, partial load/store and masked tails.

`SPECIES_PREFERRED` chooses the platform's preferred shape common to all lane types and is
the default for portable, shape-invariant algorithms. `ofLargestShape(elementType)` may be
wider for one element type but can complicate reinterpretation. A fixed species gives a
deterministic abstract shape, not deterministic machine code: official API notes warn it
may run slowly or fail on platforms that do not support it well.

## Loop shape: explicit scalar tail

```java
static final VectorSpecies<Float> FSPECIES = FloatVector.SPECIES_PREFERRED;

static void addArraysVector(float[] a, float[] b, float[] c) {
    if (a.length != b.length || a.length != c.length) {
        throw new IllegalArgumentException("length mismatch");
    }
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
    if (a.length != b.length || a.length != c.length) {
        throw new IllegalArgumentException("length mismatch");
    }
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
mask)` takes three. Inactive lanes are loaded as zero and masked stores leave corresponding
elements unchanged according to the API contract. Lowering varies: it may use native mask
registers, masked instructions, blends, scalar code or stubs depending on operation, ISA and
JDK. Measure the exact tail strategy and input-size distribution.

## Reduction with FMA

```java
static float dotProductVector(float[] a, float[] b) {
    if (a.length != b.length) throw new IllegalArgumentException("length mismatch");
    int bound = FSPECIES.loopBound(a.length);
    FloatVector accumulator = FloatVector.zero(FSPECIES);
    int i = 0;
    for (; i < bound; i += FSPECIES.length()) {
        FloatVector va = FloatVector.fromArray(FSPECIES, a, i);
        FloatVector vb = FloatVector.fromArray(FSPECIES, b, i);
        accumulator = va.fma(vb, accumulator);      // fused semantics; verify lowering
    }
    float sum = accumulator.reduceLanes(VectorOperators.ADD);
    for (; i < a.length; i++) sum += a[i] * b[i];
    return sum;
}
```

This reduction intentionally changes grouping relative to a left-to-right scalar sum, and
FMA uses one rounding rather than separate multiply/add rounding. Expect last-bit differences,
NaN/signed-zero subtleties, and platform-dependent reproducibility unless the contract defines
a tolerance. Keep a strict scalar oracle when exact ordering is required; do not call it a
drop-in replacement solely because ordinary inputs look equal.

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
@Fork(3)
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

Use parameters around lane boundaries (`0`, `1`, `L-1`, `L`, `L+1`, several multiples and
production percentiles), initialize data outside the benchmark, verify outputs separately,
and inspect confidence intervals rather than one ratio. A benchmark returning an aggregate
or consuming the output prevents dead-code elimination; it does not by itself make the
workload representative.

Run the benchmark jar with the module flag too:
`java --add-modules jdk.incubator.vector -jar benchmarks.jar VectorBenchmark`.

## Off-heap alignment

Array alignment is not controllable from Java, and the JVM's object alignment is already
sufficient for common SIMD accesses. For explicit alignment in off-heap buffers shared with
native code, the mechanism is the FFM API — final since JDK 22, no `--add-modules`:

```java
try (Arena arena = Arena.ofConfined()) {
    MemorySegment data = arena.allocate(Math.multiplyExact(count, Float.BYTES), 32);
    // fromMemorySegment/intoMemorySegment still need bounds, lifetime and byte-order policy.
}
```

Alignment is an allocation property here; assigning 32-byte alignment to each four-byte
element layout is not the same thing. Do not assume aligned allocation guarantees aligned
sub-slices or a faster lowering. Compare aligned and deliberately misaligned offsets on each
supported JDK/CPU, and keep segment lifetime/thread-confinement rules separate from SIMD.

## Semantic test matrix

For every vector kernel, compare the scalar oracle and vector implementation over:

- zero length, shorter-than-one-vector, every remainder and large inputs;
- equal arrays, distinct arrays and allowed overlap/in-place cases;
- integer min/max and overflow; floating NaN, infinities, subnormals and signed zero;
- masked inactive lanes and sentinel values outside the active range;
- heap arrays and segments with boundary/misalignment cases, if both are supported;
- each supported JDK vendor/version and CPU architecture.

Use exact equality for integral semantics. For floating point, define whether the contract is
bitwise, ULP-bounded, relative/absolute tolerance, or a domain-specific error budget before
choosing reassociation or FMA.

## Primary references

- [JEP 508: Vector API (Tenth Incubator)](https://openjdk.org/jeps/508)
- [JDK 25 Vector API package](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/package-summary.html)
- [JDK 25 VectorSpecies](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/VectorSpecies.html)
- [JDK 25 FloatVector](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/FloatVector.html)
- [JEP 454: Foreign Function & Memory API](https://openjdk.org/jeps/454)
