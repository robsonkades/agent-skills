# Observer variants and lifecycle

## The listener leak

```java
class PriceFeed {
    private final List<PriceListener> listeners = new CopyOnWriteArrayList<>();
    void register(PriceListener l) { listeners.add(l); }        // and nothing removes it
}

class OrderScreen {
    OrderScreen(PriceFeed feed) {
        feed.register(this::onPrice);      // the screen is now unreachable-but-alive
    }
}
```

The subject outlives the listener and holds a strong reference to it, so the listener — and
everything it references — is never collected. In a server this is a slow heap growth correlated
with sessions, requests or open documents; in a heap dump the subject's listener list is the
dominant retainer.

Lambdas make it worse in a specific way: `feed.register(this::onPrice)` creates an object with no
other referent, so the caller cannot later pass "the same listener" to `unregister`. Keep the
reference if you intend to remove it:

```java
private final PriceListener listener = this::onPrice;
void close() { feed.unregister(listener); }
```

Options, in order of reliability:

1. **Explicit lifecycle.** Registration is paired with deregistration in a `close()`,
   `@PreDestroy`, or the framework's own lifecycle. The owner is named. Boring and correct.
2. **Scoped registration.** `try (var subscription = feed.subscribe(this::onPrice)) { ... }` —
   the subscription object is `AutoCloseable` and removal cannot be forgotten. This is the design
   to prefer for new code.
3. **Weak references.** Tempting and treacherous: a lambda listener with no other referent is
   collected almost immediately, so the listener silently stops firing and nothing indicates why.
   Use only with a documented requirement that callers retain their own reference — which is a
   contract nobody reads.

## Ordering, errors, reentrancy

```java
private final List<Listener> listeners = new CopyOnWriteArrayList<>();

void publish(Event event) {
    for (Listener listener : listeners) {          // snapshot iteration: safe to modify during
        try {
            listener.on(event);
        } catch (RuntimeException e) {
            failures.record(listener, event, e);    // policy: isolate and record
        }
    }
}
```

**Ordering** is unspecified in the classical pattern and in most implementations. If listeners must
run in a particular order, the honest options are to make the order explicit (an ordered list at
the composition root, or `@Order`), or to admit the flow is a sequence and write it as one. What
does not work is relying on registration order, which changes with class-path scanning, lazy
initialisation and configuration.

**Errors.** Three policies, each right somewhere:

| Policy                         | Right when                                 | Consequence                                   |
| ------------------------------ | ------------------------------------------ | --------------------------------------------- |
| Propagate (fail the publisher) | The listener is essential to the operation | One listener can break an unrelated feature   |
| Isolate and record             | Listeners are independent side effects     | Failures need a metric, or they are invisible |
| Isolate and retry              | The work must not be lost                  | You need durability; this is really a queue   |

Whichever is chosen, **record it**. A `catch (Exception e) { log.warn(...) }` with no counter is
how a listener stops working for three weeks unnoticed (`slo-and-alerting`).

**Reentrancy.** A listener that causes the subject to publish again produces nested notification —
observers see events in an order that does not match the state changes, and a listener may observe
the subject mid-update. Guards: queue events published during notification and drain afterwards,
or make the subject's state transition complete before any notification is sent.

## Never notify under a lock

```java
synchronized void setPrice(Price p) {
    this.price = p;
    for (Listener l : listeners) l.on(p);      // holding the monitor
}
```

Any listener that acquires another lock creates a lock-ordering dependency the subject cannot see,
and a listener that calls back into the subject deadlocks immediately on a non-reentrant lock or
recurses on a reentrant one. It also means an arbitrarily slow listener holds the subject's lock.

```java
void setPrice(Price p) {
    List<Listener> snapshot;
    synchronized (this) { this.price = p; snapshot = listeners; }   // CopyOnWrite: no copy needed
    for (Listener l : snapshot) l.on(p);                            // outside the lock
}
```

The rule generalises beyond this pattern: **do not call unknown code while holding a lock.**

## Spring's event phases

| Mechanism                                                | Runs                      | Transaction                             |
| -------------------------------------------------------- | ------------------------- | --------------------------------------- |
| `@EventListener`                                         | Synchronously, at publish | The publisher's                         |
| `@TransactionalEventListener(BEFORE_COMMIT)`             | Before commit             | The publisher's — writes participate    |
| `@TransactionalEventListener(AFTER_COMMIT)` (default)    | After commit              | **None** — a write needs `REQUIRES_NEW` |
| `@TransactionalEventListener(AFTER_ROLLBACK/COMPLETION)` | After the outcome         | None                                    |
| `@Async @EventListener`                                  | On the executor           | None; the publisher's context is gone   |

Two failures worth naming:

- **`AFTER_COMMIT` listener that writes without `REQUIRES_NEW`.** There is no active transaction,
  so the write is silently discarded or fails depending on configuration — one of the most
  commonly reported "the listener ran but nothing was saved" bugs (`event-driven-architecture`).
- **`@Async` listener assuming request context.** Security context, MDC and `ThreadLocal`s do not
  follow, so the listener runs unauthenticated and its logs lose correlation
  (`scoped-values`, `structured-logging`).

## The three levels, chosen deliberately

```text
In-process Observer
  publisher latency = sum of listeners
  a listener failure is the publisher's problem unless isolated
  nothing survives a crash
  → right for: cache invalidation, UI updates, in-module reactions

Reactive Stream (Flow.Publisher, Reactor, RxJava)
  backpressure: the consumer asks for n
  cancellation is first class
  an error terminates that subscription
  → right for: streams the consumer cannot outrun, in one process

Distributed pub/sub (Kafka, RabbitMQ, SNS/SQS)
  at-least-once → consumers must be idempotent
  ordering only within a partition
  consumer failures are invisible to the publisher; retries and DLQ
  the event is a versioned contract other teams depend on
  → right for: another service must react
```

The migration between levels is where the mistakes happen. Moving a synchronous listener to a
broker changes six properties at once, and the code that reads identically before and after is the
part that hides it. Treat it as a design change with its own review
(`event-driven-architecture`).

## Choosing the in-process mechanism

One level down from the three above: having decided the notification stays in this JVM, which
implementation. The columns that decide are almost never the API.

| Mechanism                                    | Synchronous?                       | Ordering                    | A listener throws                                      |
| -------------------------------------------- | ---------------------------------- | --------------------------- | ------------------------------------------------------ |
| `List<Listener>` / `CopyOnWriteArrayList`    | yes                                | the order you define        | propagates and aborts the rest unless you catch        |
| `PropertyChangeSupport`                      | yes                                | registration order          | propagates                                             |
| Guava `EventBus`                             | yes (`AsyncEventBus` for async)    | unspecified                 | **swallowed** unless a `SubscriberExceptionHandler`    |
| Spring `@EventListener`                      | yes, on the publishing thread      | unspecified unless `@Order` | propagates to `publishEvent(...)`, aborts the rest     |
| Spring `@TransactionalEventListener`         | yes, at the chosen phase           | unspecified unless `@Order` | after commit, cannot roll the commit back              |
| Spring Modulith `@ApplicationModuleListener` | **no** — `@Async` + `REQUIRES_NEW` | none                        | logged; the publication stays incomplete and retryable |
| `Flow` / `SubmissionPublisher`               | no                                 | per subscriber              | that subscriber is **cancelled**                       |

Three of these need a verdict rather than a row.

**Guava `EventBus`: its own maintainers recommend against it.** From the Guava wiki, reproduced
in the class javadoc:

> "We recommend against using `EventBus`. It was designed many years ago, and newer libraries
> offer better ways to decouple components and react to events."
>
> "To decouple components, we recommend a dependency-injection framework. … For server code,
> common options include Guice and Spring."

It is **not** annotated `@Deprecated`, so nothing warns at compile time — the discouragement is
documentation-level only, and that is exactly why it keeps appearing in new code. The drawbacks
Guava itself lists are the ones this file has been describing: it obscures the producer-subscriber
relationship and complicates debugging, does not propagate exceptions, gives no backpressure or
threading control, and breaks under R8/ProGuard because `@Subscribe` is found reflectively.

**`PropertyChangeSupport` is in `java.desktop`.** A headless service that adds
`requires java.desktop` has taken an AWT and Swing module dependency to get an `ArrayList` of
listeners. It also addresses properties by `String` name, so a rename is not a compile error, and
it silently fires nothing when the old and new values are equal and non-null. If you find it in
server code it is a hand-rolled listener list wearing a module dependency.

**Spring Modulith's Event Publication Registry** is the durable option, and it is an outbox: it
writes a log entry per transactional listener **inside the publisher's own transaction**, and marks
the entry complete when that listener succeeds. So it gives at-least-once per listener with
completion tracking — not ordering, not exactly-once, and it does not make a listener idempotent
for you (`idempotency`, `distributed-transactions-and-sagas`). Republishing outstanding events on
restart is opt-in (`spring.modulith.events.republish-outstanding-events-on-restart`).

## When an in-process bus stops paying

A bus is worth its flow-invisibility cost only when **all three** hold:

- three or more modules react to the same fact, or the reacting set demonstrably changes — a new
  consumer added at least twice in the last year;
- two or more teams own the reacting modules, so the publisher's author cannot simply edit the
  consumer;
- the publisher is edited for a new consequence more than about three times a year.

It specifically does not pay when there is one module, one team and one consumer, however clean it
looks; when everything is in one Maven module and one package; when the stated reason is "so we can
extract services later" with no dated plan; or when every listener is synchronous and `@Order`-ed,
because that is a method call written the long way.

Signals that the choice was right, after the fact:

- **Change amplification.** Adding a fourth consequence touches one new file and no existing ones.
  If it touches the publisher too, the event bought nothing.
- **Time to answer "what happens when X?"** for a developer who has not seen the code. More than a
  couple of minutes means the flow-invisibility cost has come due.
- **Incident MTTR.** If the first twenty minutes go to working out which listener ran, what is
  missing is the trace and log design, not the events (`distributed-tracing-design`,
  `structured-logging`).

Two affordances worth building before you need them:

- **A dispatch-depth counter** that throws above two or three in tests. Synchronous reentrancy is a
  recursive call on one stack; the loud version is a `StackOverflowError` with a repeating frame
  cycle, and the quiet version terminates after a couple of hundred iterations because a value
  converges, showing up only as latency. In Spring this is reachable **by accident**: a listener
  whose return type stops being `void` has just become a publish site, because a non-null return
  value is published as a new event.
- **Subscriber introspection** — a way to ask, at runtime or in a test, which listeners are
  registered for a type. Every frame between the business call and a listener failure belongs to
  the dispatcher, so the stack trace names the multicaster and the reflection layer but not the
  reason the listener ran. With `@Async` even the publisher's frame is gone.

## Testing the two things nobody tests

```java
@Test
void a_failing_listener_does_not_prevent_the_others() {
    subject.register(e -> { throw new IllegalStateException("boom"); });
    var seen = new ArrayList<Event>();
    subject.register(seen::add);

    subject.publish(anEvent());

    assertThat(seen).hasSize(1);
    assertThat(failures.count()).isEqualTo(1);       // isolated AND recorded
}

@Test
void unregistering_stops_notification_and_releases_the_listener() {
    var listener = new CountingListener();
    var subscription = subject.subscribe(listener);

    subscription.close();
    subject.publish(anEvent());

    assertThat(listener.count()).isZero();
}
```

The second is a proxy for the leak test. Where a genuine retention test is warranted — a subject
that lives for the process — a `WeakReference` to the listener plus `System.gc()` in a dedicated
test is imperfect but catches the obvious case; heap analysis in a soak test catches the rest
(`heap-dump-analysis`).
