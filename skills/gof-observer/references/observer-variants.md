# Observer variants and lifecycle

Java 17 partial snippets: import java.util collections and CopyOnWriteArrayList; listener,
event, failure-recorder and domain types are omitted. Framework rows describe documented defaults,
not every configuration. Check the deployed versions and enabled infrastructure.

## The listener leak

```java
class PriceFeed {
    private final List<PriceListener> listeners = new CopyOnWriteArrayList<>();
    void register(PriceListener l) { listeners.add(l); }        // and nothing removes it
}

class OrderScreen {
    OrderScreen(PriceFeed feed) {
        feed.register(this::onPrice);      // the feed now strongly retains the screen
    }
}
```

The subject outlives the listener and holds a strong reference to it, so the listener — and
everything it references — remains reachable while that registration and subject remain reachable. In a server this is a slow heap growth correlated
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
   eligible for collection at an unspecified time, so the listener silently stops firing and nothing indicates why.
   Use only when callers understand and test the requirement to retain their own strong reference.

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

**Ordering** is not chosen by the pattern. This CopyOnWriteArrayList loop visits its captured
array in list order; that does not serialize concurrent publish calls. If listeners must
run in a particular order, the honest options are to make the order explicit (an ordered list at
the composition root, or `@Order`), or to admit the flow is a sequence and write it as one. What
needs care is framework discovery order, which can change with scanning, lazy initialization and
configuration. Snapshot removal does not revoke pending callbacks. Closing a subscription usually
removes future membership only; stronger quiescence needs explicit coordination and self-close rules.
CopyOnWriteArrayList protects registry iteration, not listener state, event mutability or callback serialization.
Reject null registrations and define duplicate registration/removal identity.

**Errors.** Three policies, each right somewhere:

| Policy                         | Right when                                 | Consequence                                   |
| ------------------------------ | ------------------------------------------ | --------------------------------------------- |
| Propagate (fail the publisher) | The listener is essential to the operation | One listener can break an unrelated feature   |
| Isolate and record             | Listeners are independent side effects     | Failures need a metric, or they are invisible |
| Isolate and retry              | The work must not be lost                  | You need durability; this is really a queue   |

The loop isolates RuntimeException only, not Error. failures.record must be bounded and reliable;
if it throws, this loop also aborts. Test that failure or explicitly define a fallback policy.

Whichever is chosen, **record it**. A `catch (Exception e) { log.warn(...) }` with no counter is
how a listener stops working for three weeks unnoticed (`slo-and-alerting`).

**Reentrancy.** A listener that causes the subject to publish again produces nested notification —
observers see events in an order that does not match the state changes, and a listener may observe
the subject mid-update. Guards: queue events published during notification and drain afterwards,
and bound the queue/drain work. Completing the state transition before notification prevents partial
state exposure but does not prevent nested delivery or reversed observation order.

## Prefer notification outside locks

```java
synchronized void setPrice(Price p) {
    this.price = p;
    for (Listener l : listeners) l.on(p);      // holding the monitor
}
```

Any listener that acquires another lock creates a lock-ordering dependency the subject cannot see,
and re-acquiring the same non-reentrant lock may deadlock. Java synchronized is reentrant;
a callback does not necessarily recurse unless it causes another notification. It also means an arbitrarily slow listener holds the subject's lock.

```java
void setPrice(Price p) {
    List<Listener> snapshot;
    synchronized (this) { this.price = p; snapshot = List.copyOf(listeners); }
    for (Listener l : snapshot) l.on(p);                            // outside the lock
}
```

The copy captures membership here; assigning snapshot = listeners would only alias the registry,
whose CopyOnWriteArrayList iterator is captured later. Coordinate registration with this monitor
if it must be atomic with the state update. Price must be immutable; concurrent publishers can
still deliver transitions out of order after unlock. Use a bounded serialized dispatcher or explicit
sequence handling when required. Exceptionally required atomic callbacks need documented lock,
reentrancy and latency constraints.

## Spring's event phases

| Mechanism                                                | Runs                                     | Transaction                                         |
| -------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| `@EventListener`                                         | Synchronous with default multicaster     | Caller context if present                           |
| `@TransactionalEventListener(BEFORE_COMMIT)`             | Before commit                            | The publisher's — writes participate                |
| `@TransactionalEventListener(AFTER_COMMIT)` (default)    | After commit                             | Resources may remain bound; no further commit there |
| `@TransactionalEventListener(AFTER_ROLLBACK/COMPLETION)` | After outcome                            | Resources may remain bound; no further commit there |
| `@Async @EventListener`                                  | Executor when async interception enabled | No automatic transfer of thread-bound transaction   |

Without a transaction, transactional listeners are skipped unless fallbackExecution is enabled.
Reactive transaction support (Spring 6.1+) requires the transaction context in the event source;
thread-bound assumptions do not apply unchanged.

Two failures worth naming:

- **AFTER_COMMIT writes.** The original transaction has finished, but resources may still be
  accessible. Further changes there are not committed; use an effective new transaction boundary
  for durable database writes. Annotation self-invocation is not sufficient (`event-driven-architecture`).
- **Async context.** Security context, MDC and ThreadLocals are not automatically guaranteed;
  inspect configured context propagation and avoid leaking one request into another
  (`scoped-values`, `structured-logging`).

## The three levels, chosen deliberately

```text
In-process Observer
  sequential synchronous publisher latency includes visited listeners and dispatcher work
  a listener failure is the publisher's problem unless isolated
  nothing survives a crash
  → right for: cache invalidation, UI updates, in-module reactions

Reactive Streams demand protocol (Flow.Publisher, Reactor, RxJava Flowable)
  backpressure: the consumer asks for n
  cancellation is first class
  an error terminates that subscription
  → right for: streams the consumer cannot outrun, in one process

Distributed pub/sub (Kafka, RabbitMQ, SNS/SQS)
  delivery and ordering depend on broker, topology and acknowledgement policy
  when redelivery is possible, consumers need duplicate handling
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

| Mechanism                                    | Synchronous?                       | Ordering                                    | A listener throws                                      |
| -------------------------------------------- | ---------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| `List<Listener>` / `CopyOnWriteArrayList`    | yes                                | the order you define                        | propagates and aborts the rest unless you catch        |
| `PropertyChangeSupport`                      | yes                                | do not rely on unspecified public ordering  | propagates                                             |
| Guava `EventBus`                             | yes (AsyncEventBus differs)        | unspecified                                 | caught and logged by default, custom handler optional  |
| Spring `@EventListener`                      | synchronous by default             | @Order for invocation, not async completion | propagates with default multicaster/error policy       |
| Spring `@TransactionalEventListener`         | yes, at the chosen phase           | unspecified unless `@Order`                 | after commit, cannot roll the commit back              |
| Spring Modulith `@ApplicationModuleListener` | **no** — `@Async` + `REQUIRES_NEW` | none                                        | logged; the publication stays incomplete and retryable |
| `SubmissionPublisher`                        | asynchronous                       | per subscriber                              | onNext exception cancels affected subscription         |

Flow is an interface contract and does not require asynchronous execution. SubmissionPublisher
uses an executor and per-subscriber buffers: submit can block uninterruptibly; offer supports a
bounded/drop policy. Account for rejection, shutdown and subscribers that never request.
Modulith retry tracking additionally requires the publication registry and persistent store configured.

Three of these need further context.

**Guava EventBus (33.4.8).** Maintainers discourage new uses in favor of dependency injection
or reactive alternatives; this is documentation guidance, not an @Deprecated annotation.
Reflection-based subscriber discovery needs care with optimizers. Existing uses need a concrete
migration reason and tests, not an automatic rewrite.

**PropertyChangeSupport is in java.desktop.** It provides JavaBeans property notification,
including suppression when old/new values are equal and non-null. The module dependency matters
for minimized runtime images, but does not require a graphical display or justify replacing an
existing JavaBeans integration. Property names remain strings.

**Spring Modulith's Event Publication Registry** is the durable option, and it is an outbox: it
writes a log entry per transactional listener **inside the publisher's own transaction**, and marks
the entry complete when that listener succeeds. With persistent storage and an operated resubmission policy it supports retriable delivery with
completion tracking — not ordering, not exactly-once, and it does not make a listener idempotent
for you (`idempotency`, `distributed-transactions-and-sagas`). Republishing outstanding events on
restart is opt-in (`spring.modulith.events.republish-outstanding-events-on-restart`).

## When an in-process bus stops paying

Choose a bus when independently evolving subscribers or an explicit module/lifecycle boundary
justify indirect control flow. Compare direct calls and an explicit workflow when consequences
are fixed or depend on each other's results. Team/module counts and change-frequency thresholds
are not guarantees of value. One current subscriber can still be a valid boundary.

Check change amplification and how easily maintainers trace an event through its subscribers.
Publisher edits may reflect an evolving event contract rather than prove the design worthless.
Use observed debugging delays to improve subscriber introspection and tracing.

Two affordances worth building before you need them:

- **A dispatch-depth counter** with a limit chosen for the documented call graph. Synchronous reentrancy is a
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
void unregistering_excludes_the_listener_from_later_snapshots() {
    var listener = new CountingListener();
    var subscription = subject.subscribe(listener);

    subscription.close();
    subject.publish(anEvent());

    assertThat(listener.count()).isZero();
}
```

The second test proves future notification behavior only. Add a deterministic captured-snapshot
case showing whether removal permits a final callback, plus concurrent publish and self-close cases.
For retention, inspect strong references from the subject, outstanding snapshots and subscription
handles. System.gc() is a request, so failure to observe collection is inconclusive; heap evidence
and bounded soak tests are more useful than a flaky GC assertion (heap-dump-analysis).

Primary sources: [CopyOnWriteArrayList](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/CopyOnWriteArrayList.html),
[SubmissionPublisher](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/SubmissionPublisher.html),
[PropertyChangeSupport](https://docs.oracle.com/en/java/javase/21/docs/api/java.desktop/java/beans/PropertyChangeSupport.html),
[Spring transaction events](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/event/TransactionalEventListener.html),
[Guava EventBus](https://guava.dev/releases/33.4.8-jre/api/docs/com/google/common/eventbus/EventBus.html),
and [Spring Modulith publication registry](https://docs.spring.io/spring-modulith/reference/events.html).
Spring references checked against Framework 7.0.9 and Modulith 2.1.1; verify deployed versions.
