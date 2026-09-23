# Iterator, Stream and Spliterator

## Side by side

| Property                   | `Iterator<T>`       | `Stream<T>`                       | `Spliterator<T>`           |
| -------------------------- | ------------------- | --------------------------------- | -------------------------- |
| Who drives                 | The caller          | The pipeline                      | Either                     |
| Laziness                   | Source-dependent    | Yes, with operation fusion        | Source-dependent           |
| Reusable                   | No                  | No — one terminal operation       | No                         |
| Can pause and resume       | **Yes**             | No                                | Yes (`tryAdvance`)         |
| Two traversals interleaved | **Yes**             | No                                | Yes                        |
| Removal during traversal   | Optional `remove()` | No                                | No                         |
| Parallelism                | No                  | Yes                               | The mechanism for it       |
| Needs closing              | Sometimes, ad hoc   | `AutoCloseable`; required for I/O | Depends on the source      |
| Cost to implement          | Moderate            | Free once you have a Spliterator  | Moderate — but yields both |

Caller-controlled traversal and advancing two sequences in step are common Iterator use cases.
An existing pull protocol or removal contract can also justify it; do not add Spliterator merely
to match a preferred shape. Iteration need not compute lazily: the source may already be buffered.

## Adapting a traversal

Use `StreamSupport.stream(spliterator, false)` or `Spliterators.iterator(spliterator)`.
These adapters do not invent resource ownership or cancellation. For a bounded remote example,
read [the worked example](worked-example.md); it overrides batching `trySplit` to avoid prefetch.
A sequential `limit(10)` needs as many pages as provide ten events, potentially more with empty
pages or filtering. It does not universally imply one fetch.

For repeated or interleaved passes, provide a fresh traversal with independent cursor state when
the source supports it. A one-shot iterator cannot be made repeatable just by returning it from
`Iterable.iterator()`. Reopening a remote traversal may observe a different dataset.

## Characteristics, and why lying is expensive

| Characteristic | Promise                                                   | What the pipeline does with it                             |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| `SIZED`        | Exact before traversal/splitting absent structural change | Pre-sizes arrays and collectors; enables `count()` elision |
| `SUBSIZED`     | Every descendant is SIZED and SUBSIZED                    | Exact sizing of descendant splits, not balance             |
| `ORDERED`      | Encounter order is meaningful                             | Preserves order; makes `findFirst` and `skip` meaningful   |
| `DISTINCT`     | No two elements are `equals`                              | `distinct()` becomes a no-op                               |
| `SORTED`       | Elements come out sorted by the reported comparator       | May avoid sorting when order/comparator permit             |
| `NONNULL`      | No element is null                                        | Allows clients to rely on non-null elements                |
| `IMMUTABLE`    | The source cannot change during traversal                 | No need for fail-fast checks                               |
| `CONCURRENT`   | The source may be modified safely during traversal        | Different traversal strategy                               |

These are optimisations that change **results**, not just speed. A spliterator declaring
`DISTINCT` over a source with duplicates makes `distinct()` do nothing, and the duplicates
survive. A false `SORTED` claim can cause necessary sorting to be skipped; this depends on the
source comparator and requested sort. A reverse-sorted source with its correct comparator may
still need sorting for natural-order `sorted()`.
Declare only what is true. SORTED also requires ORDERED and a compatible getComparator();
IMMUTABLE describes structural interference, not deep immutability of element objects.

`estimateSize()` can return `Long.MAX_VALUE` for an unknown-length source; do not declare
`SIZED` when the count is unknown. Sizing optimisations follow characteristics. If `SIZED`
is still set, `getExactSizeIfKnown()` returns the estimate, including `Long.MAX_VALUE`, and
`count()` may trust that false size without traversing. The sentinel alone does not remove
a sizing claim; see the [Java 17 Spliterator contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/Spliterator.html).

## trySplit

`AbstractSpliterator` implements batching through repeated `tryAdvance`, buffering consumed
elements into arrays. It can therefore fetch remote pages during splitting. Override it with
`null` when this prefetch is unsuitable. Linked structures can batch too; splitting cost, balance
and workload determine benefit. `SUBSIZED` promises sized descendants, not balanced partitions.
See the [Java 17 Spliterator contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/Spliterator.html).

```java
@Override
public Spliterator<T> trySplit() {
    return null;      // deliberately suppress batching/prefetch
}
```

## Fail-fast, weakly consistent, snapshot

| Semantics             | Sources                                       | Guarantee                                                           |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| **Fail-fast**         | `ArrayList`, `HashMap`, most of `java.util`   | Throws `ConcurrentModificationException` on a **best-effort** basis |
| **Weakly consistent** | `ConcurrentHashMap`, `ConcurrentLinkedQueue`  | No ConcurrentModificationException; may reflect later changes       |
| **Snapshot**          | `CopyOnWriteArrayList`, `CopyOnWriteArraySet` | Structural state at creation; updates may copy the array            |

Three consequences worth stating plainly:

- **Fail-fast is a debugging aid, not a concurrency control.** The `modCount` check is unsynchronised;
  a concurrent modification may go undetected and the traversal then silently skips or repeats
  elements. Never write code whose correctness depends on the exception being thrown.
- **Weakly consistent means `size()` and iteration can disagree.** Aggregating over a concurrent
  map while it is being written may give a number that was never simultaneously true. If that matters,
  the design needs a snapshot or a lock, not a different iterator.
- **Snapshot has an update-copy cost.** Listener lists with many reads and rare writes often fit.
  Assess actual size, update pattern and latency/allocation cost before replacing an adequate
  copy-on-write collection; a read/write ratio alone does not decide it.

The common single-threaded `ConcurrentModificationException` is not a concurrency problem at all —
it is a structural change inside a for-each over the same collection. The fix is
`Iterator.remove()` if supported, or supported `Collection.removeIf` outside that traversal.

## Closing

```java
try (Stream<String> lines = Files.lines(path)) {
    return lines.filter(...).toList();
}
```

`Files.lines`, `Files.walk` and `Files.find` hold open resources. JDBC/Spring Data streams may
retain a cursor or connection depending on their implementation and execution mode; a stream over
materialized values need not. Identify acquisition and owner before prescribing cleanup. Leaks
can exhaust descriptors or a connection pool far from the original traversal.

Two rules for authors: if your stream holds a resource, register the closer with
`Stream.onClose(...)` so `close()` actually releases it, and say so in the Javadoc — callers cannot
tell from the type. Terminal operations do not call close automatically. Establish cleanup even
if constructing the stream fails after acquiring the resource. For Spring Data JPA streaming,
check the repository/provider transaction and cursor requirements for the project version;
consume within the required scope and close it (`repository-pattern`).

## When a hand-written Iterator is right

```java
// partial merge loop: obtain cursors, buffer heads, and handle remaining tails separately
while (a.hasNext() && b.hasNext()) {
    if (compare(peekA, peekB) <= 0) emit(advance(a)); else emit(advance(b));
}
```

`Stream.iterator()` supplies a cursor as a terminal escape hatch; keep and close the original
resource-backed stream. The same stream cannot then run another terminal operation. See
[BaseStream 17](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/stream/BaseStream.html).

Repeated `hasNext()` must not discard the next element. Prefetching and caching it is legitimate
and may perform I/O; document blocking/failure behavior. An adapter can return that cached element
later without advancing the source again, so a source deadline check is not a deadline check on
every caller `next()` or consumer callback. `remove()` is optional, and exhaustion
requires `next()` to throw `NoSuchElementException`; see [Iterator 17](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/Iterator.html).
