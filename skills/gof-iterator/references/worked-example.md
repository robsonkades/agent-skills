# Worked example: a paged remote API as a Stream

A partner API returns audit events in pages of up to 500, addressed by an opaque cursor. Callers
want to process "all events since T" without knowing about pages.

This is the case where iteration's uniform interface hides the most: latency per page, server-side
cursor state, and consistency while the underlying data changes.

## The fetcher — the honest, unhidden layer

```java
public interface AuditPageFetcher {
    /**
     * @throws AuditUnavailable transient
     * @throws AuditDeadline    the caller's budget expired mid-walk
     */
    AuditPage fetch(Cursor cursor, Deadline deadline);
}

public record AuditPage(List<AuditEvent> items, Cursor nextCursor) {
    public boolean isLast() { return nextCursor.equals(Cursor.END); }
}
```

Keeping this interface visible matters. Anything built on top of it is a convenience; the failure
modes, the deadline and the page granularity live here, where a reviewer can see them
(`gof-proxy`).

## The Spliterator

```java
final class AuditSpliterator extends Spliterators.AbstractSpliterator<AuditEvent> {

    private final AuditPageFetcher fetcher;
    private final Deadline deadline;
    private final long maxEvents;

    private Iterator<AuditEvent> page = Collections.emptyIterator();
    private Cursor next;
    private long emitted;

    AuditSpliterator(AuditPageFetcher fetcher, Cursor from, Deadline deadline, long maxEvents) {
        super(Long.MAX_VALUE, ORDERED | NONNULL);     // size unknown; order is meaningful
        this.fetcher = fetcher;
        this.next = from;
        this.deadline = deadline;
        this.maxEvents = maxEvents;
    }

    @Override
    public boolean tryAdvance(Consumer<? super AuditEvent> action) {
        if (emitted >= maxEvents) return false;                 // bounded, always
        while (!page.hasNext()) {
            if (next.equals(Cursor.END)) return false;
            if (deadline.hasExpired()) throw new AuditDeadline(next, emitted);
            var fetched = fetcher.fetch(next, deadline);        // one network call
            page = fetched.items().iterator();
            next = fetched.nextCursor();
        }
        emitted++;
        action.accept(page.next());
        return true;
    }

    @Override
    public Spliterator<AuditEvent> trySplit() {
        return null;    // pages are sequential and cursor-chained; splitting is impossible
    }
}
```

Four deliberate decisions:

- **`Long.MAX_VALUE` as the estimate, and no `SIZED`.** The total is genuinely unknown. Claiming a
  size would be a lie the pipeline acts on.
- **`trySplit` returns `null`.** The cursor chain is inherently sequential. A split that guessed at
  offsets would fetch overlapping or missing ranges — wrong results, not slow ones.
- **A hard `maxEvents` bound.** An unbounded remote walk is an unbounded commitment; a partner
  whose data grows tenfold should not turn a five-minute job into a five-hour one silently.
- **The deadline is checked before each fetch and throws.** Returning `false` instead would look
  like a completed traversal, and the caller would conclude it had seen everything.

That last point is the one that separates a correct remote iterator from a dangerous one:
**exhaustion and abandonment must not be indistinguishable.**

## Exposing it

```java
public Stream<AuditEvent> eventsSince(Instant since, Deadline deadline) {
    var spliterator = new AuditSpliterator(fetcher, Cursor.from(since), deadline, MAX_EVENTS);
    return StreamSupport.stream(spliterator, false);
}
```

```java
// the caller
try (var events = auditClient.eventsSince(lastRun, Deadline.in(Duration.ofMinutes(5)))) {
    events.filter(AuditEvent::isSecurityRelevant)
          .forEach(this::record);
}
```

`limit`, `takeWhile` and `findFirst` now work as callers expect and stop fetching pages — laziness
is inherited from the spliterator, not implemented again.

## Keyset, not offset

The API offers both `?page=N` and `?after=<cursor>`. The cursor form is used, because with offset
paging:

```text
page 1: events 1..500        (an event is inserted before event 200)
page 2: offset 500..1000     → event 500 is now at 501; it is never returned
```

Items are skipped when rows are inserted ahead of the cursor and repeated when rows are deleted.
For an audit walk that decides what has been processed, silently skipping events is the worst
available failure. Keyset paging is stable under insertion because the cursor names a position in
the data, not a count.

Where only offset paging exists, the mitigation is to state the semantics explicitly ("may skip or
repeat items if the source changes during the walk") and make downstream processing idempotent.

## Closing and cancellation

This spliterator holds no resource, so nothing needs releasing — but the caller still uses
try-with-resources, because the return type is a `Stream` and callers should not have to know
which streams are resource-backed. When a later version cached pages in a temporary file, the
close became load-bearing and no caller had to change:

```java
return StreamSupport.stream(spliterator, false).onClose(spillFile::delete);
```

Registering the closer with `onClose` is what makes `close()` mean anything. A stream that holds a
resource and does not register a closer leaks whether or not the caller writes try-with-resources.

## Tests

```java
@Test
void stops_fetching_once_the_limit_is_reached() {
    var fetches = new AtomicInteger();
    var client = clientOverPages(fetches, pagesOf(500, 500, 500));

    var first = client.eventsSince(EPOCH, generous()).limit(10).toList();

    assertThat(first).hasSize(10);
    assertThat(fetches).hasValue(1);          // laziness, asserted rather than assumed
}

@Test
void an_expired_deadline_fails_rather_than_looking_like_the_end() {
    var client = clientOverPages(new AtomicInteger(), pagesOf(500));
    var expired = Deadline.in(Duration.ZERO);

    assertThatThrownBy(() -> client.eventsSince(EPOCH, expired).count())
            .isInstanceOf(AuditDeadline.class);
}

@Test
void reports_no_more_elements_after_exhaustion() {
    var it = Spliterators.iterator(new AuditSpliterator(single(event()), start(), generous(), 100));
    it.next();
    assertThat(it.hasNext()).isFalse();
    assertThatThrownBy(it::next).isInstanceOf(NoSuchElementException.class);
}
```

The second test is the one worth copying into any remote-iteration code. Every functional test
passes whether the traversal ends because there is no more data or because the caller ran out of
time; only an explicit test distinguishes them.

## What was rejected

- **Returning `List<AuditEvent>` from a "fetch all" method.** Simple, and it loads an unbounded
  remote dataset into heap. The bound would then live in the caller, or nowhere.
- **A hand-written `Iterator`.** It would have given the same laziness with none of the stream
  operations, and `Spliterators.iterator(...)` produces one from the spliterator anyway if a caller
  needs it.
- **A parallel stream over pages.** Cursor chaining makes it impossible, and even with offset
  paging it would multiply load on the partner's API while breaking order — the case where "the
  source is large" is not a reason to go parallel.
