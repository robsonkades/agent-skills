# Object layout and @Contended mechanics

## Where false sharing appears inside the runtime

**Adjacent object fields.** Declared fields are compacted by HotSpot's object layout; two
`long` fields of one instance, written frequently by different threads, typically land on
the same cache line.

**Primitive arrays.** A `long[]` is 8 bytes per element, so 8 elements per 64-byte line.

```java
long[] counters = new long[N_THREADS];
// Thread i writes counters[i].
// counters[0] .. counters[7] are all on the SAME 64-byte cache line.
// Zero logically shared data; 100% physical contention.
```

**Adjacent heap objects.** Two small objects allocated in sequence — common in Eden, where
TLAB allocation is a sequential bump pointer — can end up on the same line or on
neighbouring ones when each is smaller than 64 bytes.

The cost is the difference between an L1 access (~4 cycles) and an inter-core
invalidation/fetch round trip (~60–300 cycles): one to two orders of magnitude. Those are
architecture-literature figures, not measurements of any particular system.

## The object header

Every Java object carries a header before its fields:

- **Mark word**: historically 8 bytes — hash code, lock information, GC age, state bits.
- **Klass pointer**: 4 bytes with `UseCompressedClassPointers` (on by default; deprecated
  in JDK 25 and obsolete from JDK 27, where it is always on) or 8 bytes without. This is a
  different flag from `UseCompressedOops` and has no relationship to the ~32 GB heap
  threshold — conflating the two is the usual reason a hand-computed layout disagrees with
  JOL.

| Configuration                                                            | Header size                                                    | First field offset |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------ |
| JDK ≤ 26 default (`UseCompactObjectHeaders=false`)                       | 12 bytes (compressed class pointers) / 16 bytes (uncompressed) | 12 or 16           |
| **JDK 27 default** (JEP 534), or `-XX:+UseCompactObjectHeaders` on 24–26 | 8 bytes                                                        | 8                  |

Compact Object Headers (JEP 519) is product on JDK 25, **off by default**. When enabled,
mark word and klass pointer fuse into a single 64-bit word regardless of compressed oops.

A smaller header does not eliminate false sharing — the fields a thread writes still
compete for the same line. What changes is adjacency density: more payload fits in the same
heap space, more small objects fit per line, and the chance that two independent
sequentially-allocated objects share a line rises slightly.

JEP 519 does not change `@Contended` itself — padding is still applied relative to the
annotated field, not to the start of the object. Only the offset at which regular field
layout begins moves.

## `@Contended`

`jdk.internal.vm.annotation.Contended`, native JVM support since JDK 8 (JEP 142 — Reduce
Cache Contention on Specified Fields), inserts padding around the annotated field:

```java
import jdk.internal.vm.annotation.Contended;

class PaddedCounter {
    @Contended
    volatile long value;   // the JVM pads before and after this field
}
```

`-XX:ContendedPaddingWidth` defaults to **128 bytes** on JDK 25 — twice a 64-byte line.
The 2× margin is not arbitrary: it also covers the adjacent-line prefetcher that many Intel
microarchitectures use, which fetches the neighbouring 64-byte line. Padding of exactly 64
bytes could still suffer indirect contention through prefetch on those CPUs.

## The two flags, and how each fails

```bash
# 1. Compile: javac must RESOLVE jdk.internal.vm.annotation.Contended, which lives
#    in a package that is not exported by default. --add-opens does NOT do this:
#    "opens" enables deep reflection at run time, it does not expose the type for
#    normal compilation and linking. The correct flag is --add-exports:
javac --add-exports java.base/jdk.internal.vm.annotation=ALL-UNNAMED \
      PaddedCounter.java

# 2. Run: the same export is needed for the class loader to resolve the type,
#    AND the JVM must be willing to honour the annotation outside java.base:
java  --add-exports java.base/jdk.internal.vm.annotation=ALL-UNNAMED \
      -XX:-RestrictContended \
      PaddedCounter
```

`-XX:RestrictContended` defaults to **`true`** on JDK 25. With the default, the JVM applies
`@Contended` only inside `java.base`; on an application class the annotation is **silently
ignored** — no warning, no error, no observable bytecode difference. The padding is simply
not inserted, and a benchmark "comparing with and without `@Contended`" is unknowingly
comparing two identical layouts.

This is the quietest failure in the whole area: compiling and running with `--add-exports`
correctly but forgetting `-XX:-RestrictContended` produces a program that compiles, runs,
throws nothing, and does not apply the padding the code promises. Put both flags in the
JMH `@Fork` arguments so they cannot be forgotten at run time.

## Verified internal usages

Two, and only two, are relevant:

1. **`java.util.concurrent.atomic.Striped64.Cell`** — the cell used by `LongAdder`,
   `LongAccumulator`, `DoubleAdder` and `DoubleAccumulator` to spread concurrent increments
   across cache lines.
2. **`java.util.concurrent.ForkJoinPool.WorkQueue`** — the fields `top`, `phase`,
   `stackPred`, `source`, `nsteals` and `parking`. These are exactly the state fields most
   written during fork/join/steal: the queue owner writes `top` on every fork and join,
   thieves read and write `source` and `phase` on every steal attempt, and since the pool
   keeps an array of `WorkQueue`s, two neighbouring queues in that array would be natural
   candidates to share a line without the annotation.

It does **not** appear on `AtomicLong` internals or on `Thread.threadLocalRandomSeed`,
contrary to widely repeated claims. The source of `Striped64.java` and `ForkJoinPool.java`
in `openjdk/jdk` is the definitive reference for any version — check it before citing a
field as annotated, rather than reasoning from what would make sense.

## `Striped64.Cell` as the reference design

```java
// Faithful to the real Striped64.java pattern, simplified: omits part of the
// cell-array rehash/expansion mechanism.
@jdk.internal.vm.annotation.Contended
static final class Cell {
    volatile long value;
    Cell(long x) { value = x; }
    // internal CAS via VarHandle/Unsafe — omitted here.
}
```

Each `Cell` occupies its own cache line by construction — zero false sharing between cells
by design, not by accident. That is the structural reason `LongAdder` beats `AtomicLong`
under high contention: `AtomicLong` has a **single** variable disputed by CAS across all
threads (real data contention, with zero false sharing since there is only one variable);
`LongAdder` removes the data contention by distributing the work, and uses `@Contended` so
that distribution does not recreate the problem one level down, with adjacent cells sharing
a line.

## Why manual padding is fragile

```java
long p1, p2, p3, p4, p5, p6, p7;
volatile long value;
```

The common but **incorrect** explanation is that the JIT sees `p1..p7` are never read or
written and eliminates them as dead code. That confuses layers: dead-code elimination is not
something C1/C2 do to _instance fields_ — they optimise code, not a class's storage layout —
and the JIT does not decide an object's memory layout at all.

The real mechanism is HotSpot's field layout (JEP 142). Declared fields are reordered at
class load, grouped by size (longs and doubles first, then ints and floats, then shorts and
chars, then bytes and booleans, then references) to minimise alignment padding, sometimes
interleaving superclass fields. That reordering **does not preserve declaration order**, and
there is no contractual guarantee that `p1..p7` remain physically adjacent to `value`. The
padding "disappears" functionally not because it was removed, but because it was never
guaranteed to be where the author assumed.

`@Contended` is a **layout directive** interpreted by HotSpot's own layout algorithm, so it
does not suffer this repositioning — the positioning _is_ the mechanism that implements it.

JEP 142 and Aleksey Shipilëv's field-layout writing ("JVM Anatomy Quarks") are the
references here. Do not attribute to JIT optimisation what is a class-loader decision.
