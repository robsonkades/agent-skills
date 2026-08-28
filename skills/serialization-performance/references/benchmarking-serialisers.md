# Benchmarking and profiling serialisers

## Which tool answers which question

| Question                                              | Tool           | Event or flag                                                   |
| ----------------------------------------------------- | -------------- | --------------------------------------------------------------- |
| Where is CPU going during serialise/deserialise?      | async-profiler | `-e cpu`                                                        |
| How many bytes are allocated per operation?           | JMH            | `-prof gc`, metric `gc.alloc.rate.norm`                         |
| Which types are allocated under real production load? | JFR            | `jdk.ObjectAllocationSample`                                    |
| Is the format causing measurable GC pressure in prod? | JFR            | `jdk.GCPhasePause` correlated with `jdk.ObjectAllocationSample` |

## The harness

```java
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.MICROSECONDS)
@Warmup(iterations = 5, time = 1)
@Measurement(iterations = 5, time = 1)
@Fork(value = 2, jvmArgsAppend = {"-Xms512m", "-Xmx512m", "-XX:+AlwaysPreTouch"})
@State(Scope.Thread)
public class SerializationBenchmark {

    static final ObjectMapper JSON_MAPPER = new ObjectMapper();
    static final ThreadLocal<Kryo> KRYO = ThreadLocal.withInitial(() -> { /* registered */ });

    OrderPojo sampleOrder;
    byte[] jsonBytes;
    byte[] kryoBytes;

    @Setup
    public void setup() throws Exception {
        sampleOrder = createSampleOrder();
        jsonBytes = JSON_MAPPER.writeValueAsBytes(sampleOrder);
        try (Output out = new Output(512, -1)) {
            KRYO.get().writeObject(out, sampleOrder);
            kryoBytes = out.toBytes();
        }
    }

    @Benchmark public byte[] jsonSerialize() throws Exception { … }
    @Benchmark public OrderPojo jsonDeserialize() throws Exception { … }
    @Benchmark public byte[] kryoSerialize() { … }
    @Benchmark public OrderPojo kryoDeserialize() { … }
}
```

Four separately named methods, not two round-trip ones: a round-trip figure hides which
direction is expensive, and the two directions rarely move together between formats.

```bash
java -jar target/benchmarks.jar SerializationBenchmark -prof gc -rf json -rff results.json
```

Read two numbers from the output, not one:

- **`gc.alloc.rate.norm`** — bytes allocated per operation. This is the comparable figure across
  formats, and the one a time-only comparison silently omits.
- **`gc.count`** — collections triggered during measurement. With a fixed heap and
  `-XX:+AlwaysPreTouch` this should be zero or near it. A high value means part of the measured
  time is collection pause, and the timing comparison is not valid.

## Attributing the cost in a running system

```bash
java -XX:StartFlightRecording=filename=serialization.jfr,settings=profile -jar app.jar
jfr print --events jdk.ObjectAllocationSample serialization.jfr | head -100
```

`jdk.ObjectAllocationSample` (low-overhead sampling, in `profile.jfc` since JDK 16, and the modern
replacement for the `ObjectAllocationInNewTLAB`/`OutsideTLAB` pair) answers "which types does this
pipeline allocate" without guessing. Aggregating by `objectClass` and summing `weight` through
`jdk.jfr.consumer.RecordingFile` lets two formats be compared in the _same_ process under the
_same_ load — the only comparison that removes environment as a variable.

```bash
asprof -d 30 -e cpu   -f flame.html     <pid>
asprof -d 30 -e alloc -f alloc-flame.html <pid>
```

Frames worth looking for: `ObjectMapper.readValue`, `Kryo.readObject`/`writeObject`,
`CodedInputStream.readXxx`. `ObjectMapper.readValue` dominating sampled CPU in a high-rate
consumer is the finding that justifies a migration; anything less is intuition.

Expected patterns when comparing, to be confirmed against your own payload rather than assumed:
unpooled, unregistered Kryo tends to show `byte[]` from unreused `Output`/`Input` buffers plus
extra `String`s for class names; Protobuf tends to concentrate allocation in `CodedOutputStream`
and generated builder objects.

## Taking allocation out of the hot path

Protobuf — reuse the working buffer, and prefer writing straight to the stream:

```java
private final byte[] BUFFER = new byte[64 * 1024];

byte[] serialize(Order order) {
    int size = order.getSerializedSize();
    if (size > BUFFER.length) return order.toByteArray();   // fallback
    CodedOutputStream cos = CodedOutputStream.newInstance(BUFFER, 0, size);
    order.writeTo(cos);
    return Arrays.copyOf(BUFFER, size);   // still allocates the result, not the workspace
}

void serializeToStream(Order order, OutputStream out) throws IOException {
    order.writeTo(out);                   // no intermediate array at all
}
```

Kryo — pool the instances, since they are not thread-safe and are expensive to rebuild:

```java
KryoPool kryoPool = new KryoPool.Builder(() -> {
    Kryo kryo = new Kryo();
    kryo.register(Order.class, 10);
    kryo.register(ArrayList.class, 11);
    kryo.setReferences(false);            // no reference tracking — faster, if the graph is a tree
    kryo.setRegistrationRequired(true);   // no silent reflection fallback
    return kryo;
}).softReferences().build();

public byte[] serialize(Object obj) {
    Kryo kryo = kryoPool.borrow();
    try {
        Output output = new Output(256, -1);
        kryo.writeClassAndObject(output, obj);
        return output.toBytes();
    } finally {
        kryoPool.release(kryo);
    }
}
```

`setReferences(false)` is safe only when the object graph has no shared or cyclic references;
turning it off on a graph that has them changes the data, not just the speed.

## Before publishing a number

- [ ] JMH, never a hand-written loop around `System.nanoTime()`.
- [ ] Each `@Benchmark` unambiguously named as round-trip or single-direction.
- [ ] `-prof gc` run, and `gc.alloc.rate.norm` reported next to the time.
- [ ] Fixed heap plus `-XX:+AlwaysPreTouch` in the forks, and `gc.count` near zero.
- [ ] The payload is the real one, at a realistic size — not a three-field sample standing in for
      a production message.
- [ ] Wire size reported alongside CPU: a format that wins on CPU and doubles the bytes may lose
      once the network is in the picture.
