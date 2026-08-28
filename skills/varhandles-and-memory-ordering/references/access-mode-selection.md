# Choosing an access mode

## From access pattern to mode

```
1. WHAT IS THE READ/WRITE PATTERN?
   - One writer, many readers, data handed off .......... setRelease / getAcquire
   - One writer, many readers, no associated data
     (only the flag matters) ........................... a plain volatile field
   - Multiple concurrent writers to the same field ..... CAS (compareAndSet, or the
                                                          Acquire/Release variants inside
                                                          a retry loop)
   - High-contention counter, read occasionally ........ LongAdder
   - Two different variables, each thread reads what
     the other wrote, neither may miss it .............. volatile on both sides —
                                                          NOT acquire/release

2. DOES THE ALGORITHM NEED A TOTAL ORDER ACROSS DIFFERENT VARIABLES?
   - No  (only the release-to-acquire chain of one variable matters) -> acquire/release
   - Yes (Dekker-like, store buffering) ................ volatile / getVolatile / setVolatile

3. IS THERE MORE THAN ONE POSSIBLE WRITER?
   - No, and the pattern assumes it (Seqlock) .......... document the assumption explicitly
   - Yes ............................................... serialise writers with CAS or a lock
                                                          before applying release/acquire

4. VALIDATE
   - jcstress on the chosen pattern, forbidden outcome enumerated — not visual inspection
```

## Situation to mode

| Situation                                                           | Mode                                                                             | Why                                                                                                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Config flag, rare write, frequent read, no associated data          | plain `volatile` field                                                           | Simplicity wins — the cost difference does not repay the `VarHandle` indirection when nothing else is being published                       |
| Publishing a data structure (table, snapshot), producer to consumer | `setRelease` / `getAcquire`                                                      | Exactly the case that does not need volatile's StoreLoad barrier                                                                            |
| Counter incremented by many threads, read rarely                    | `LongAdder`                                                                      | Not an access-mode question at all — it is read-modify-write atomicity                                                                      |
| CAS in a lock-free structure, low contention                        | `compareAndSet` (volatile mode)                                                  | Simplicity; the cost difference only shows up in high-frequency retry loops                                                                 |
| CAS in a high-frequency retry loop (ring buffer, Disruptor-like)    | `compareAndExchangeAcquire`/`Release`, or `weakCompareAndSetRelease` in the loop | Avoids paying StoreLoad on every attempt                                                                                                    |
| Two variables, total order required between threads                 | `volatile` on both                                                               | acquire/release leaves the store-buffering `(0,0)` outcome legal                                                                            |
| Reading data already published and immutable from that point on     | plain                                                                            | After the `getAcquire` on the anchor the data is already inside the happens-before chain; re-reading with a barrier is cost without benefit |

## The API surface, with the return types people get wrong

```java
int state;   // deliberately NOT volatile — the VarHandle owns the ordering

VarHandle vh = MethodHandles.lookup().findVarHandle(MyClass.class, "state", int.class);

// READS
int xPlain    = (int) vh.get(obj);          // no ordering guarantee
int xOpaque   = (int) vh.getOpaque(obj);    // atomic, no ordering
int xAcquire  = (int) vh.getAcquire(obj);   // acquire
int xVolatile = (int) vh.getVolatile(obj);  // same semantics as a volatile field

// WRITES
vh.set(obj, 42);          // plain
vh.setOpaque(obj, 42);    // opaque
vh.setRelease(obj, 42);   // release
vh.setVolatile(obj, 42);  // same semantics as a volatile field

// CAS — compareAndSet reports success directly
boolean ok = vh.compareAndSet(obj, expected, newVal);

// compareAndExchange* returns the WITNESSED value, not a boolean.
// Success is witness == expected. Assigning this to a boolean does not compile.
int witness = (int) vh.compareAndExchangeAcquire(obj, expected, newVal);
boolean okAcquire = witness == expected;

// FETCH-AND-OP, one variant per ordering
int prevVolatile = (int) vh.getAndAdd(obj, 1);
int prevAcquire  = (int) vh.getAndAddAcquire(obj, 1);
int prevRelease  = (int) vh.getAndAddRelease(obj, 1);
```

`compareAndSet` returning a boolean while `compareAndExchange*` returns the witnessed value
is not an inconsistency to work around — the exchange variants follow the C-style CAS
convention. It is simply worth checking at each call site.

## Publication template

```java
class SafePublication {
    private int[] data;
    private int version;   // deliberately not volatile

    private static final VarHandle VERSION_VH;
    static {
        try {
            VERSION_VH = MethodHandles.lookup()
                .findVarHandle(SafePublication.class, "version", int.class);
        } catch (ReflectiveOperationException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    // single writer — see the assumption note below
    void publish(int[] newData) {
        this.data = newData;                       // plain write, carried by the release
        VERSION_VH.setRelease(this, version + 1);  // release: publishes data with version
    }

    int[] tryConsume(int lastSeen) {
        int current = (int) VERSION_VH.getAcquire(this);  // acquire: anchors visibility
        if (current == lastSeen) return null;
        return this.data;                                  // plain read, safe below the acquire
    }
}
```

The release drags everything the writer did before it; the acquire anchors everything the
reader does after it. That is the whole contract, and it is why the data write must precede
the release and the data read must follow the acquire.

`publish` is not safe for concurrent callers — a read-then-write of `version` is not atomic
across writers. Either document the single-writer assumption at the method, or serialise
writers with CAS.

## Double-checked locking, if you insist

With a `VarHandle` the correct pair is `setRelease` on the reference write and `getAcquire`
on **both** reads; plain `set`/`get` reproduces the original bug that made the pattern need
`volatile` in the first place. But there is no performance argument for it: the hot path is
a single read, and reads cost the same in acquire and volatile mode on x86. The gain from
acquire/release appears on frequent **writes**, not on a read-dominated pattern. Prefer the
static holder idiom for this specific case.
