# Worked example: a paged remote API as a Stream

A partner API returns audit events in pages of up to 500, addressed by an opaque cursor. Callers
want to process "all events since T" without knowing about pages.

This is the case where iteration's uniform interface hides the most: latency per page, possible
server-side cursor state, and consistency while the underlying data changes.

Partial Java 17 example, with domain types/imports and HTTP adapter omitted. Assume immutable
value cursors, at most 500 non-null events per page, and a fetcher that enforces the remaining
monotonic deadline in its transport and bounds response bytes. It closes each response before
returning; cursors here are stateless tokens, not server resources. Exceptions are unchecked.

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
    public AuditPage {
        items = List.copyOf(items);
        nextCursor = Objects.requireNonNull(nextCursor);
        if (items.size() > 500) throw new IllegalArgumentException("oversized page");
    }
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
        this.fetcher = Objects.requireNonNull(fetcher);
        this.next = Objects.requireNonNull(from);
        this.deadline = Objects.requireNonNull(deadline);
        if (maxEvents < 0) throw new IllegalArgumentException("negative event budget");
        this.maxEvents = maxEvents;
    }

    @Override
    public boolean tryAdvance(Consumer<? super AuditEvent> action) {
        Objects.requireNonNull(action);
        if (!page.hasNext() && next.equals(Cursor.END)) return false;
        checkBudget();
        if (emitted >= maxEvents) {
            throw new IllegalStateException("event budget reached; completeness unconfirmed");
        }
        while (!page.hasNext()) {
            if (next.equals(Cursor.END)) return false;
            checkBudget();
            var fetched = fetcher.fetch(next, deadline);        // one network call
            checkBudget();
            if (next.equals(fetched.nextCursor())) {
                throw new IllegalStateException("cursor did not advance");
            }
            page = fetched.items().iterator();
            next = fetched.nextCursor();
        }
        emitted++;
        action.accept(page.next());
        return true;
    }

    private void checkBudget() {
        if (Thread.currentThread().isInterrupted()) throw new CancellationException();
        if (deadline.hasExpired()) throw new AuditDeadline(next, emitted);
    }

    @Override
    public Spliterator<AuditEvent> trySplit() {
        return null;    // deliberately avoid batching/prefetch of the cursor chain
    }
}
```

Four deliberate decisions:

- **`Long.MAX_VALUE` as the estimate, and no `SIZED`.** The total is genuinely unknown. Claiming a
  size would be a lie the pipeline acts on.
- **`trySplit` returns `null`.** Fetching the cursor chain is sequential. Batching fetched events
  for parallel processing is possible, but adds buffering/prefetch and is intentionally omitted.
- **A hard `maxEvents` bound on source events.** Filtering may emit fewer downstream results.
  An unbounded remote walk is an unbounded commitment; a partner
  whose data grows tenfold should not silently truncate a full walk. At the cap, throw unless
  exhaustion is already known; a further empty terminal page might exist, but completeness is
  then unconfirmed. An explicit caller `limit(n)` requests a prefix instead.
- **Deadline/interruption checks include buffered events and fetch boundaries.** The transport
  must enforce the remaining budget during a blocking call; these checks cannot interrupt it
  themselves. Immediately non-advancing cursors fail; longer cycles or empty progressing pages
  remain deadline-bound. These checks do not bound time inside the consumer's callback or undo
  effects it has already performed.

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

## Verify cursor semantics

The API offers both `?page=N` and `?after=<cursor>`. The cursor form is used, because with offset
paging:

```text
page 1: events 1..500        (an event is inserted before event 200)
page 2: skip first 500       → old event 500 is returned again
```

Insertions before the offset can repeat items; deletions before it can skip items.
For an audit walk that decides what has been processed, silently skipping events is the worst
available failure. An opaque cursor is not proof of keyset or snapshot semantics: verify the
provider contract. With a stable unique keyset ordering, earlier insertions do not shift offsets,
but newly inserted rows behind the last key are missed and key updates can skip/repeat rows.
Complete audit export may require a snapshot/high-water mark and reconciliation policy.

Where only offset paging exists, the mitigation is to state the semantics explicitly ("may skip or
repeat items if the source changes during the walk"). Idempotency handles repeats, not missing
events; reconcile or use a provider snapshot when completeness is required. When processing
repeated events has external effects, `idempotency` owns that effect contract; ordinary traversal
alone does not require a deduplication mechanism.

## Closing and cancellation

Under the stateless-cursor and closed-response assumptions above, this spliterator owns no
persistent resource — but the caller still uses
try-with-resources, because the return type is a `Stream` and callers should not have to know
which streams are resource-backed. If a later implementation spills pages to a temporary file,
attach an unchecked cleanup adapter (handling any IOException) before returning the stream:

```java
return StreamSupport.stream(spliterator, false).onClose(spillFile::deleteUnchecked);
```

Registering the closer with `onClose` is what makes `close()` mean anything. A stream that holds a
resource and does not register a closer leaks whether or not the caller writes try-with-resources.
Terminal operations and short-circuiting do not automatically close a stream. Closing is not
in-flight cancellation: concurrent close/traversal needs a separately designed protocol. Here
interruption is cooperative at traversal boundaries; transport cancellation belongs to the fetcher.

## Tests

Illustrative JUnit/AssertJ cases require the project's test dependencies and fixture helpers.
Use try-with-resources in each stream test. Also test null action even after exhaustion, null
page items, repeated/empty cursors, budget failure versus exact final-page exhaustion, interruption,
buffered-event deadline expiry and sequential/parallel result equality on separate fresh sources.

```java
@Test
void stops_fetching_once_the_limit_is_reached() {
    var fetches = new AtomicInteger();
    var client = clientOverPages(fetches, pagesOf(500, 500, 500));

    try (var events = client.eventsSince(EPOCH, generous())) {
        assertThat(events.limit(10).toList()).hasSize(10);
    }
    assertThat(fetches).hasValue(1);          // laziness, asserted rather than assumed
}

@Test
void an_expired_deadline_fails_rather_than_looking_like_the_end() {
    var client = clientOverPages(new AtomicInteger(), pagesOf(500));
    var expired = Deadline.in(Duration.ZERO);

    assertThatThrownBy(() -> {
        try (var events = client.eventsSince(EPOCH, expired)) { events.count(); }
    })
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

- **Returning `List<AuditEvent>` from a "fetch all" method.** Valid for an explicitly bounded
  dataset, but buffers all results; this use case needs incremental processing.
- **A hand-written `Iterator`.** It would have given the same laziness with none of the stream
  operations, and `Spliterators.iterator(...)` produces one from the spliterator anyway if a caller
  needs it.
- **Parallel page fetching.** The next cursor is unavailable until the current fetch completes.
  An API offering independent partitions could support bounded concurrency, but that is a
  different contract requiring consistency, ordering and partner-load controls.
