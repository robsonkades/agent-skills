# Iterator, Stream and Spliterator

## Side by side

| Property                   | `Iterator<T>`     | `Stream<T>`                       | `Spliterator<T>`           |
| -------------------------- | ----------------- | --------------------------------- | -------------------------- |
| Who drives                 | The caller        | The pipeline                      | Either                     |
| Laziness                   | Inherent          | Yes, with operation fusion        | Inherent                   |
| Reusable                   | No                | No — one terminal operation       | No                         |
| Can pause and resume       | **Yes**           | No                                | Yes (`tryAdvance`)         |
| Two traversals interleaved | **Yes**           | No                                | Yes                        |
| Removal during traversal   | `remove()`        | No                                | No                         |
| Parallelism                | No                | Yes                               | The mechanism for it       |
| Needs closing              | Sometimes, ad hoc | `AutoCloseable`; required for I/O | Depends on the source      |
| Cost to implement          | Moderate          | Free once you have a Spliterator  | Moderate — but yields both |

The two rows in bold are the only ones that make a hand-written `Iterator` the right answer:
traversals the caller must control, and algorithms that advance two sequences in step (merge
join, diff, zip with early termination).

## Implement Spliterator, get everything

```java
final class PageSpliterator<T> extends Spliterators.AbstractSpliterator<T> {

    private final PageFetcher<T> fetcher;
    private Iterator<T> current = Collections.emptyIterator();
    private Cursor next = Cursor.start();

    PageSpliterator(PageFetcher<T> fetcher) {
        super(Long.MAX_VALUE, ORDERED | NONNULL);      // not SIZED: the total is unknown
        this.fetcher = fetcher;
    }

    @Override
    public boolean tryAdvance(Consumer<? super T> action) {
        while (!current.hasNext()) {
            if (next == Cursor.END) return false;
            var page = fetcher.fetch(next);
            current = page.items().iterator();
            next = page.nextCursor();
        }
        action.accept(current.next());
        return true;
    }
}
```

```java
Stream<T> stream = StreamSupport.stream(new PageSpliterator<>(fetcher), false);
Iterator<T> it = Spliterators.iterator(new PageSpliterator<>(fetcher));
```

One implementation, both abstractions, and the stream gets laziness and short-circuiting for
free — `stream.limit(10)` fetches one page, not all of them.

## Characteristics, and why lying is expensive

| Characteristic | Promise                                             | What the pipeline does with it                             |
| -------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| `SIZED`        | `estimateSize()` is exact                           | Pre-sizes arrays and collectors; enables `count()` elision |
| `SUBSIZED`     | Every split is also `SIZED`                         | Balanced parallel decomposition                            |
| `ORDERED`      | Encounter order is meaningful                       | Preserves order; makes `findFirst` and `skip` meaningful   |
| `DISTINCT`     | No two elements are `equals`                        | `distinct()` becomes a no-op                               |
| `SORTED`       | Elements come out sorted by the reported comparator | `sorted()` becomes a no-op                                 |
| `NONNULL`      | No element is null                                  | Skips null checks                                          |
| `IMMUTABLE`    | The source cannot change during traversal           | No need for fail-fast checks                               |
| `CONCURRENT`   | The source may be modified safely during traversal  | Different traversal strategy                               |

These are optimisations that change **results**, not just speed. A spliterator declaring
`DISTINCT` over a source with duplicates makes `distinct()` do nothing, and the duplicates
survive. Declaring `SORTED` incorrectly makes `sorted()` a no-op and the output is unsorted.
Declare only what is true.

`estimateSize()` returning `Long.MAX_VALUE` is the honest answer for an unknown-length source;
it disables sizing optimisations and nothing breaks.

## trySplit

`AbstractSpliterator` provides a batching `trySplit` that works for array-like sources. Return
`null` when the source cannot be split usefully — a paged remote API, a linked list, a socket.
Returning a badly balanced split is worse than refusing: the parallel pipeline pays coordination
cost for no parallelism.

```java
@Override
public Spliterator<T> trySplit() {
    return null;      // pages arrive sequentially; splitting would fetch out of order
}
```

## Fail-fast, weakly consistent, snapshot

| Semantics             | Sources                                       | Guarantee                                                           |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| **Fail-fast**         | `ArrayList`, `HashMap`, most of `java.util`   | Throws `ConcurrentModificationException` on a **best-effort** basis |
| **Weakly consistent** | `ConcurrentHashMap`, `ConcurrentLinkedQueue`  | Never throws; may or may not reflect changes made after creation    |
| **Snapshot**          | `CopyOnWriteArrayList`, `CopyOnWriteArraySet` | Exactly the state at creation; writes copy the array                |

Three consequences worth stating plainly:

- **Fail-fast is a debugging aid, not a concurrency control.** The `modCount` check is unsynchronised;
  a concurrent modification may go undetected and the traversal then silently skips or repeats
  elements. Never write code whose correctness depends on the exception being thrown.
- **Weakly consistent means `size()` and iteration can disagree.** Aggregating over a concurrent
  map while it is being written gives a number that was never simultaneously true. If that matters,
  the design needs a snapshot or a lock, not a different iterator.
- **Snapshot costs a copy per write.** Right for listener lists (many reads, rare writes), wrong
  for anything write-heavy.

The common single-threaded `ConcurrentModificationException` is not a concurrency problem at all —
it is a structural change inside a for-each over the same collection. The fix is
`Iterator.remove()` or `Collection.removeIf`.

## Closing

```java
try (Stream<String> lines = Files.lines(path)) {
    return lines.filter(...).toList();
}
```

`Files.lines`, `Files.walk`, `Files.find`, JDBC result-set streams and Spring Data's
`Stream<Entity>` queries all hold a resource. Not closing them leaks file descriptors or database
connections until the pool is exhausted, and the failure appears far away as a connection timeout.

Two rules for authors: if your stream holds a resource, register the closer with
`Stream.onClose(...)` so `close()` actually releases it, and say so in the Javadoc — callers cannot
tell from the type. For Spring Data, a `Stream`-returning repository method requires an open
transaction and a `try-with-resources`; without both it fails or leaks
(`repository-pattern`).

## When a hand-written Iterator is right

```java
// merging two sorted sequences — neither can be a Stream, because both must be advanced
// under the algorithm's control
while (a.hasNext() && b.hasNext()) {
    if (compare(peekA, peekB) <= 0) emit(advance(a)); else emit(advance(b));
}
```

Streams have no cursor the caller can hold. Merge, diff, zip-with-early-exit and any algorithm
that decides which sequence to advance need `Iterator`. Everything else is better served by a
`Spliterator` plus the stream derived from it.

One contract detail that hand-written iterators routinely break: **`hasNext()` must be
side-effect-free and repeatable.** An implementation that consumes an element in `hasNext()`
works with the enhanced `for` and fails for any caller that checks twice.
