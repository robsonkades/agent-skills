# Proving ordering, and measuring what it costs

Two tools carry almost all the value: one to _see_ the barrier C2 actually emitted, one to
_prove_ under stress that removing it breaks the program.

## Barriers by architecture

| Barrier    | x86 (TSO)                                                                                                                 | aarch64 (weakly ordered)                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| LoadLoad   | Implicit — the hardware does not reorder loads with each other                                                            | Needs a dedicated instruction                                                                |
| StoreStore | Implicit — the hardware does not reorder stores with each other                                                           | Needs a dedicated instruction                                                                |
| LoadStore  | Implicit                                                                                                                  | Needs a dedicated instruction                                                                |
| StoreLoad  | **Not implicit** — the one reordering the hardware permits; forbidding it needs a `lock`-prefixed instruction or `mfence` | Also not implicit, but covered by the same `dmb` / `stlr`+`ldar` that covers the other three |

```
x86-64 (C2), setVolatile:
    movl   $1, 0x10(%rsi)        ; the store itself
    lock addl $0x0, (%rsp)       ; StoreLoad barrier — drains the store buffer

x86-64 (C2), setRelease:
    movl   $1, 0x10(%rsi)        ; the store itself, no extra instruction.
                                 ; StoreStore is already implicit under TSO; the
                                 ; "barrier" here is a constraint on the JIT, not
                                 ; a CPU instruction.

aarch64 (C2), setVolatile and setRelease — the same instruction in both cases:
    stlr   w1, [x2]              ; store-release carries the barrier itself
```

That is what "free release on x86" really means: the restriction is entirely at compiler
level — C2 may not move the store, or any earlier program-order access, past it. Once C2
honours that while emitting code, x86 delivers StoreStore for nothing at runtime. The cost
is paid at compile time as one lost optimisation, not at run time. On aarch64 the same
compiler restriction still applies _and_ the hardware needs `stlr` as well.

## Seeing the emitted barrier

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintAssembly \
     -XX:CompileCommand=print,*AccessModeBenchmark.volatileSet \
     -XX:CompileCommand=print,*AccessModeBenchmark.releaseSet \
     -cp target/benchmarks.jar org.openjdk.jmh.Main AccessModeBenchmark
```

What to look for:

- `volatileSet`: a `lock`-prefixed instruction (`lock addl`, `lock xadd` or similar) or
  `mfence` **after** the `mov` that stores the value.
- `releaseSet`: **only** the `mov`. A `lock` here means something in the build or the JIT is
  not compiling the mode that was requested.
- On aarch64: `stlr` in both. The _absence_ of a difference is the expected result, not a
  measurement failure.

Tiered compilation can hand you C1 output — less optimised, sometimes with more
conservative barriers — before C2 takes over. Force `-XX:-TieredCompilation` or warm the
method thoroughly before capturing, or you will compare C1 against C2 and draw the wrong
conclusion about relative cost.

## Proving the ordering with jcstress

```java
@JCStressTest
@Outcome(id = "-1", expect = ACCEPTABLE, desc = "version not yet seen — legal")
@Outcome(id = "42", expect = ACCEPTABLE, desc = "correct publication")
@Outcome(id = "0",  expect = FORBIDDEN,
         desc = "version advanced but data not yet visible — breaks the release/acquire chain")
@State
public class SafePublicationOrdering {

    int data;
    int version;

    private static final VarHandle VERSION_VH;
    static {
        try {
            VERSION_VH = MethodHandles.lookup()
                .findVarHandle(SafePublicationOrdering.class, "version", int.class);
        } catch (ReflectiveOperationException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @Actor
    public void writer() {
        data = 42;
        VERSION_VH.setRelease(this, 1);   // swap for VERSION_VH.set(this, 1) to observe outcome 0
    }

    @Actor
    public void reader(I_Result r) {
        int v = (int) VERSION_VH.getAcquire(this);
        r.r1 = (v == 1) ? data : -1;
    }
}
```

```bash
mvn -q clean verify
java -jar target/jcstress.jar -t SafePublicationOrdering
```

As written, outcome `0` must never appear, on either architecture. Downgrading the write to
plain `set` reproduces the defect, and jcstress reports the forbidden outcome as observed —
most readily on aarch64.

Replacing `getAcquire` with `getOpaque` on the reader side also brings outcome `0` back:
opaque guarantees atomicity and progress of the `version` read itself, not ordering with
respect to `data`.

Enumerate the reachable outcomes on paper before marking anything `FORBIDDEN`. Forbidding a
result that is genuinely reachable makes the test fail on correct code, and the usual
reaction — relaxing the test — destroys the point of having it.

### Why -XX:+StressGCM is not this tool

`-XX:+StressGCM` randomises Global Code Motion: the C2 phase that decides in what order to
schedule instructions _inside a single compiled method_. It does not simulate inter-thread
reordering, does not touch the hardware, and verifies nothing about the memory model. Using
it to "expose memory-ordering races" is shaking the binary and hoping — it may perturb
timing by accident, but it proves nothing about a happens-before chain.

### The store-buffering gap, empirically

```
int x, y;   // VarHandle acquire/release on both fields, in both actors
Actor 1: X_VH.setRelease(this, 1); r1 = (int) Y_VH.getAcquire(this);
Actor 2: Y_VH.setRelease(this, 1); r2 = (int) X_VH.getAcquire(this);
```

With volatile on both sides, `(0,0)` is `FORBIDDEN`. With acquire/release as above, `(0,0)`
stays `ACCEPTABLE_INTERESTING` — there is no total order between the two variables, only a
happens-before chain within each one. Writing this test is how you confirm the gap is real
rather than theoretical.

## Measuring the cost

```java
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@State(Scope.Benchmark)
public class AccessModeBenchmark {

    int field = 0;
    static final VarHandle VH;   // findVarHandle in a static initialiser

    // READS — comparable with each other
    @Benchmark public int plainGet()    { return (int) VH.get(this); }
    @Benchmark public int opaqueGet()   { return (int) VH.getOpaque(this); }
    @Benchmark public int acquireGet()  { return (int) VH.getAcquire(this); }
    @Benchmark public int volatileGet() { return (int) VH.getVolatile(this); }

    // WRITES — comparable with each other, but NOT with the reads above
    @Benchmark public void plainSet()    { VH.set(this, 1); }
    @Benchmark public void releaseSet()  { VH.setRelease(this, 1); }
    @Benchmark public void volatileSet() { VH.setVolatile(this, 1); }
}
```

```bash
java -jar target/benchmarks.jar AccessModeBenchmark -prof perfasm
```

Expected _shape_ of the result — measure the numbers yourself:

- x86: `plainGet` is about `opaqueGet` is about `acquireGet` is about `volatileGet`; none
  pays a hardware barrier.
- x86: `plainSet` and `releaseSet` match, both just the `mov`. `volatileSet` sits visibly
  above both, and `-prof perfasm` shows the `lock`/`mfence` responsible.
- aarch64: the write asymmetry disappears; `releaseSet` and `volatileSet` converge on `stlr`.

Never compare a read against a write in the same list. They are different operations with
different barrier costs, and mixing them answers neither question.

## Code review checklist

- Each `VarHandle`-accessed field has exactly one documented read mode and one write mode —
  not plain on one path and acquire/release on another by accident.
- No field is declared `volatile` _and_ accessed via `setRelease`/`getAcquire`/`getVolatile`/
  `setVolatile`.
- Producer-to-consumer publication uses `setRelease` on the write and `getAcquire` on the
  read, with the data written before the anchor and read after it on both sides.
- Where more than one writer is possible, the code either documents the single-writer
  assumption or serialises writers with CAS or a lock.
- A `compareAndExchange*` result is not treated as a boolean.
- Where the algorithm needs a total order across different variables, the code uses volatile
  mode, not acquire/release.
- Any claimed gain of acquire/release over volatile was measured with JMH on the target
  architecture, not taken from a third-party cycle table.
- Every ordering-critical pattern has a jcstress test with the forbidden outcome enumerated.

## Incident checklist

- Does the symptom appear only on aarch64 (Graviton, Apple Silicon) and never on x86?
  Suspect a missing acquire/release or volatile that TSO was masking.
- Does `-XX:+PrintAssembly` confirm which barrier C2 actually emitted — present or absent
  where the architecture table predicts?
- Was the suspect pattern reduced to a jcstress test that reproduced the forbidden outcome,
  before the fix was signed off?
- Is there more than one concurrent writer on a field designed for a single writer?
- Remember JFR shows contention, not races. An ordering bug can generate no contention at all.
