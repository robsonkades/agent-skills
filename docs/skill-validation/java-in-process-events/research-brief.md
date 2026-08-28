# Research brief — `java-in-process-events`

Scope of the proposed skill: the **in-process** event / observer decision inside one JVM.
When publishing a fact beats calling a collaborator, what the decoupling costs
(traceability, ordering, reentrancy, error propagation, transaction boundaries), and how to
keep the result debuggable. **Not** cross-service eventing — that is `event-driven-architecture`.

Researched 2026-08-27. Every API claim below carries the source it was verified against;
anything not verified is marked `UNVERIFIED:`.

---

## 1. Canonical sources

### 1.1 Fowler — _What do you mean by "Event-Driven"?_ (2017-02-07)

<https://martinfowler.com/articles/201701-event-driven.html>

Fowler's central move is to refuse "event-driven" as a single thing and split it into four
patterns that share only a word. Verified verbatim from the article:

- **Event Notification** — a system sends event messages to notify others of a domain change;
  the source "doesn't really care much about the response". The warning attached to it, which
  is the load-bearing quote for this skill:

  > "it can be hard to see such a flow as it's not explicit in any program text. Often the only
  > way to figure out this flow is from monitoring a live system."

  and

  > the danger is creating "nicely decoupled systems with event notification, without realizing
  > that you're losing sight of that larger-scale flow, and thus set yourself up for trouble in
  > future years."

- **Event-Carried State Transfer** — recipients keep their own copies so they need not query
  the source; buys latency and resilience, costs the receiver a replica to maintain.
- **Event Sourcing** — "whenever we make a change to the state of a system, we record that state
  change as an event, and we can confidently rebuild the system state by reprocessing the events
  at any time in the future."
- **CQRS** — "separate data structures for reading and writing information"; not inherently
  event-based.

**Use for this skill:** the flow-invisibility quote is the honest cost of in-process events, and
it applies _more_ strongly in-process than across services, because in-process there is usually
no correlation id, no broker UI and no per-hop log line to reconstruct the flow from. Fowler's
four-way split also gives the skill its negative scope: only Event Notification is in play
in-process; ECST and Event Sourcing are other skills (`event-sourcing`).

### 1.2 Fowler — _Domain Event_ (eaaDev, 2005)

<https://martinfowler.com/eaaDev/DomainEvent.html>

Verified: definition is "Captures the memory of something interesting which affects the domain."
Key points confirmed on the page:

- The pattern funnels inputs from many sources (UI, messaging, database) into one event stream
  that is logged persistently; an event processor reads the log and reacts.
- It distinguishes immutable **source data** (what the event is about — the charge amount and
  vendor) from mutable **processing data** (what the system did with it — which statement it
  appeared on).
- Corrections are separate **Retroactive Event** objects; source data never changes.
- Two time points matter per event: when the thing occurred versus when the system noticed it.
- Domain Event is "particularly important as a necessary pattern for Event Sourcing, which
  organizes a system so that all updates are made through Domain Event."

**Use for this skill:** the past-tense-fact framing, the immutability of source data, and the
occurred-at/noticed-at distinction (which becomes the `occurredAt` field in the examples). Note
honestly that Fowler's Domain Event is a _persisted log_ pattern; most Java in-process event
buses implement only the notification half of it and get none of the audit or replay value —
that is a real gap the skill should name rather than paper over.

### 1.3 GoF — _Design Patterns_ (1994), Observer, "Consequences"

Verified indirectly: multiple secondary sources reproduce the consequence list, and the
`gof-pattern-thinking` skill in this repo already summarises it. The specific consequence:

> **Unexpected updates.** Because observers have no knowledge of each other's presence, they can
> be blind to the ultimate cost of changing the subject. A seemingly innocuous operation on the
> subject may cause a cascade of updates to observers and their dependent objects. Moreover,
> dependency criteria that aren't well-defined or maintained usually lead to spurious updates,
> which can be hard to track down.
>
> This problem is aggravated by the fact that the simple update protocol provides no details on
> what changed in the subject. Without additional protocol to help observers discover what
> changed, they may be forced to work hard to deduce the changes.

`UNVERIFIED:` the exact page (commonly cited as _Design Patterns_, pp. 293–303, Consequences item
5 on p. 297). Could not fetch a primary scan; the wording above matches every secondary
reproduction found (w3sdesign, TU Darmstadt lecture notes, cs.smu.ca notes) but should be
checked against a physical copy before quoting with a page number in the shipped skill. The
_substance_ — "no knowledge of each other's presence", "cascade of updates", "spurious updates
… hard to track down", "no details on what changed" — is reproduced consistently and can be
cited without a page.

Other GoF Observer consequences worth carrying: abstract coupling between subject and observer;
support for broadcast communication (the subject doesn't specify the receiver, so adding and
removing observers is free); and the note that a series of incremental changes can produce
successive/repeated updates whose cost may require explicit change management.

### 1.4 Vernon — _Implementing Domain-Driven Design_ (2013), ch. 8 "Domain Events"

Confirmed: chapter 8 is Domain Events (O'Reilly TOC, ISBN 978-0321834577).

`UNVERIFIED:` the following are stated from knowledge of the book and could not be verified
against a fetchable primary source; verify before quoting in the shipped skill:

- Vernon's reference implementation is a static `DomainEventPublisher` holding subscribers in a
  `ThreadLocal`, so subscribers run **on the publishing thread, inside the same transaction**.
- Aggregates publish events from inside their own behaviour methods, immediately after the state
  change that the event describes.
- Publishing to the messaging infrastructure is deliberately _not_ done by the aggregate; a
  subscriber writes to an event store, and a separate component forwards from the store — i.e.
  the outbox, which belongs to `distributed-transactions-and-sagas` here.
- He names the causal-consistency rule for the events an aggregate raises: the event carries the
  aggregate's identity and the values that changed, not the aggregate itself.

The point of citing Vernon at all in this skill is the _publication site_ disagreement in §3.3:
Vernon publishes from inside the aggregate; the collect-and-drain camp does not.

### 1.5 Urma & Warburton — _Real-World Software Development_ (O'Reilly, 2019), ch. 7

Verified: chapter 6 is **Twootr** ("build out the core of a simple Twootr system … think
outside-in … use test doubles to isolate and test interactions"); chapter 7 is **Extending
Twootr** — "the final project-based chapter … explains the Dependency Inversion Principle and
introduces bigger picture architectural choices such as event-driven and hexagonal
architectures. This chapter can help you extend your knowledge of automated testing by covering
test doubles, such as stubs and mocks, and also functional programming techniques."
(O'Reilly catalogue copy, <https://www.oreilly.com/library/view/real-world-software-development/9781491967164/ch07.html>
— page itself 403s to WebFetch, description obtained via search index.)

**Verified from the book's own source repository**
(<https://github.com/Iteratr-Learning/Real-World-Software-Development>, `master`):

- The Twootr observer seam is a hand-rolled one-method push interface:

  ```java
  // src/main/java/com/iteratrlearning/shu_book/chapter_06/ReceiverEndPoint.java
  public interface ReceiverEndPoint {
      void onTwoot(Twoot twoot);
  }
  ```

- `User` holds the listener in a **mutable field** on a long-lived entity and null-checks it as
  the "is logged on" test:

  ```java
  private ReceiverEndPoint receiverEndPoint;

  boolean receiveTwoot(final Twoot twoot) {
      if (isLoggedOn()) {
          receiverEndPoint.onTwoot(twoot);
          lastSeenPosition = twoot.getPosition();
          return true;
      }
      return false;
  }

  boolean isLoggedOn() { return receiverEndPoint != null; }
  ```

- `Twoot` is a hand-written final class with explicit `Objects.requireNonNull`, getters,
  `equals`/`hashCode` on id — 60 lines of what is now a record.

**What is outdated (mark in the skill):**

| Element in the book                                                | Status                                                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `pom.xml` `<source>12</source> <target>12</target>`                | **superseded** — the suite baseline is Java 21                                                  |
| `junit:junit:4.11`                                                 | **superseded** — JUnit 5.11+; no `@RunWith`                                                     |
| `org.mockito:mockito-core:2.21.0`                                  | **superseded** — Mockito 5.x, strict stubs by default                                           |
| Hand-written value class `Twoot` (60 lines)                        | **superseded by records** (JEP 395)                                                             |
| Event type hierarchies expressed as interfaces + `instanceof`      | **superseded by sealed types + pattern matching for switch** (JEP 409, 441)                     |
| `ReceiverEndPoint` as a single-method observer interface           | **still current** — this is the right shape, and is exactly what §6b collapses back to          |
| Outside-in design, DIP at the port, test doubles for the push side | **still current** — the design reasoning holds                                                  |
| `null` listener field as login state                               | **never was current** — it is the lapsed-listener/leak shape (`java-reference-types-and-leaks`) |

The book's chapter 7 discussion of event-driven architecture is _within one process_ and does
not address transactions, reentrancy or async context propagation at all — the three things
that actually bite in a Spring application. That gap is most of the value this skill adds over
the book.

### 1.6 Secondary, useful for the disagreement section

- **Stonebraker, "Event-driven Programming is Usually a Poor Architecture" (DBOS blog,
  2026-04-29)** — <https://www.dbos.dev/blog/goto-considered-harmful-2026>. Explicitly frames
  event-driven as Dijkstra's `goto`. Verified quotes: "the flow of control and the business
  logic is obscured"; "In an event driven architecture, this is difficult to code, because each
  event handler is independent of the others, and it is difficult to perform global operations";
  "This is obviously a challenge in an event-driven architecture. If every handler is writing a
  log, one must trek through multiple logs looking for the error." Concession: event-driven is
  fine for "independent, non-durable, non-atomic applications". Cite as a _position_, not as
  fact — the author is selling a workflow product.
- **Comartin, "Debugging Event-Driven Systems: 5 Problems Teams Create" (CodeOpinion)** —
  <https://codeopinion.com/debugging-event-driven-systems-5-problems-teams-create/>. Verified
  quotes: teams "were forcing everything to be an event and everything to be asynchronous";
  events as "throwing a note into a room and hoping somebody reads it"; "It does not all need to
  be events… Some things are naturally synchronous, like queries."

---

## 2. Verified API reality

Baseline: **Java 21 LTS** (`java.base` unless stated). Spring numbers verified against
`docs.spring.io/.../current/` on 2026-08-27, which served **Spring Framework 7.0.9**.

### 2.1 Hand-rolled `List<Listener>`

No API to verify — it is `java.util`. The design facts that matter:

- `java.util.List` is not thread-safe. A registry mutated while being iterated throws
  `ConcurrentModificationException`; the standard fix is
  `java.util.concurrent.CopyOnWriteArrayList` (`java.base`, since 1.5), whose iterator is a
  snapshot and never throws CME. That snapshot semantics also _decides the reentrancy
  question_: a listener registering during dispatch is not seen by the in-flight dispatch.
- A subject holding a strong reference to a short-lived listener is the lapsed-listener leak;
  the fix is an explicit deregistration handle, not weak references. Owned in this repo by
  `java-reference-types-and-leaks` (`references/leak-patterns.md` §2) — the skill must point
  there, not restate it.

### 2.2 `java.beans.PropertyChangeSupport`

Verified against the Java 21 javadoc
(<https://docs.oracle.com/en/java/javase/21/docs/api/java.desktop/java/beans/PropertyChangeSupport.html>).

- **Module: `java.desktop`.** This is the disqualifier for most server-side use — a headless
  service that adds `requires java.desktop` to pull in a listener list has taken an AWT/Swing
  module dependency for an `ArrayList`.
- Constructor: `public PropertyChangeSupport(Object sourceBean)`.
- Methods (exact):
  ```java
  public void addPropertyChangeListener(PropertyChangeListener listener)
  public void addPropertyChangeListener(String propertyName, PropertyChangeListener listener)
  public void removePropertyChangeListener(PropertyChangeListener listener)
  public void removePropertyChangeListener(String propertyName, PropertyChangeListener listener)
  public PropertyChangeListener[] getPropertyChangeListeners()
  public PropertyChangeListener[] getPropertyChangeListeners(String propertyName)
  public void firePropertyChange(String propertyName, Object oldValue, Object newValue)
  public void firePropertyChange(String propertyName, int oldValue, int newValue)
  public void firePropertyChange(String propertyName, boolean oldValue, boolean newValue)
  public void firePropertyChange(PropertyChangeEvent event)
  public void fireIndexedPropertyChange(String propertyName, int index, Object oldValue, Object newValue)
  public void fireIndexedPropertyChange(String propertyName, int index, int oldValue, int newValue)
  public void fireIndexedPropertyChange(String propertyName, int index, boolean oldValue, boolean newValue)
  public boolean hasListeners(String propertyName)
  ```
- Silent-suppression trap, verbatim: **"No event is fired if old and new values are equal and
  non-null."** (int/boolean overloads: "No event is fired if old and new values are equal.")
  A caller that expects a notification on every `set` gets none when the value is unchanged, and
  gets one when `oldValue` is `null` even if `newValue` is also `null`… no — `null`/`null` is
  equal and non-null fails, so `firePropertyChange(p, null, null)` **does** fire. This
  asymmetry is a real defect source.
- Properties are addressed by **`String` name**, so a rename is not a compile error.

**Verdict for the skill:** legacy, JavaBeans/Swing-shaped, wrong module for a server. Mention
only to say "if you find it in server code, it is almost certainly a hand-rolled listener list
wearing an AWT dependency."

### 2.3 Guava `EventBus` — **actively discouraged by its own maintainers**

Verified against both the current javadoc
(<https://guava.dev/releases/snapshot-jre/api/docs/com/google/common/eventbus/EventBus.html>)
and the wiki page (<https://github.com/google/guava/wiki/EventBusExplained>).

**Verbatim, from the Guava wiki and reproduced in the class javadoc:**

> "We recommend against using `EventBus`. It was designed many years ago, and newer libraries
> offer better ways to decouple components and react to events."
>
> "To decouple components, we recommend a dependency-injection framework. … For server code,
> common options include Guice and Spring. To react to events, we recommend a reactive-streams
> framework like RxJava … or Project Reactor."

It is **not** annotated `@Deprecated` — the discouragement is documentation-level only, so no
compiler warning fires. This distinction matters and the skill should state it precisely: _not
deprecated, but the maintainers recommend against it in new code._

Drawbacks the Guava wiki itself lists (verified on that page): obscures producer–subscriber
relationships and complicates debugging; breaks with code optimisers such as R8 and ProGuard
(reflection over `@Subscribe`); cannot coordinate multiple events; no backpressure or
resilience; limited threading control and monitoring; **does not propagate exceptions**; poor
integration with RxJava and coroutines; suboptimal performance on Android.

API surface (verified from javadoc):

```java
public EventBus()
public EventBus(String identifier)
public EventBus(SubscriberExceptionHandler exceptionHandler)
public void register(Object object)
public void unregister(Object object)
public void post(Object event)
public String identifier()
```

Plus `com.google.common.eventbus.AsyncEventBus` (subclass taking an `Executor`),
`@Subscribe`, `@AllowConcurrentEvents`, `DeadEvent` (posted when an event has no subscriber),
`SubscriberExceptionHandler`, `SubscriberExceptionContext`.
`UNVERIFIED:` exact current Guava release number — the javadoc index served 33.4.x/33.5.x-jre
at the time of research; state the line, not a point release, in the shipped skill.

**Verdict:** the strongest single citation in the whole brief. When the library that popularised
the in-process event bus in Java tells you to use dependency injection instead, that is the
skill's thesis handed over by the opposition.

### 2.4 Spring `ApplicationEventPublisher` / `@EventListener`

Verified against Spring Framework 7.0.9 javadoc (`docs.spring.io/spring-framework/docs/current`).

`org.springframework.context.ApplicationEventPublisher`:

```java
default void publishEvent(ApplicationEvent event)   // since 1.1.1
void publishEvent(Object event)                     // since 4.2  (arbitrary POJO/record)
```

Verbatim caveat in the javadoc: **"Such an event publication step is effectively a hand-off to
the multicaster and does not imply synchronous/asynchronous execution or even immediate
execution at all."** The _contract_ therefore promises nothing about timing.

The _default implementation_ does, and that is what people actually rely on.
`org.springframework.context.event.SimpleApplicationEventMulticaster`, verbatim:

> "By default, all listeners are invoked in the calling thread. This allows the danger of a
> rogue listener blocking the entire application, but adds minimal overhead."

> `setTaskExecutor(...)`: "Default is equivalent to `SyncTaskExecutor`, executing all listeners
> synchronously in the calling thread. Consider specifying an asynchronous task executor here to
> not block the caller until all listeners have been executed. **However, note that asynchronous
> execution will not participate in the caller's thread context (class loader, transaction
> context) unless the `TaskExecutor` explicitly supports this.**"

> `setErrorHandler(...)`: "Default is none, with a listener exception stopping the current
> multicast and getting propagated to the publisher of the current event. If a task executor is
> specified, each individual listener exception will get propagated to the executor but won't
> necessarily stop execution of other listeners."

That last sentence is the entire error-propagation section of the skill in one quote: **a
synchronous listener's exception aborts the remaining listeners and surfaces at
`publishEvent(...)`, i.e. inside the publisher's transaction.**

`org.springframework.context.event.EventListener` attributes (verified, Framework 7.0.x):

| Attribute          | Type            | Default |
| ------------------ | --------------- | ------- |
| `value`            | `Class<?>[]`    | `{}`    |
| `classes`          | `Class<?>[]`    | `{}`    |
| `condition`        | `String` (SpEL) | `""`    |
| `defaultExecution` | `boolean`       | `true`  |
| `id`               | `String`        | `""`    |

Verbatim from the `@EventListener` javadoc:

- Ordering: "It is also possible to define the order in which listeners for a certain event are
  to be invoked. To do so, add Spring's common `@Order` annotation alongside this event listener
  annotation." — i.e. **ordering exists but only if you declare it**; the default order is
  unspecified and must never be relied on.
- Chaining: "Annotated methods may have a non-`void` return type. When they do, the result of
  the method invocation is sent as a new event. If the return type is either an array or a
  collection, each element is sent as a new individual event." — the accidental-cascade
  mechanism.
- Checked exceptions: "any checked exceptions thrown from an event listener will be wrapped in
  an `UndeclaredThrowableException` since the event publisher can only handle runtime
  exceptions."
- Async: **"If an asynchronous event listener throws an exception, it is not propagated to the
  caller."** and "Asynchronous event listener methods cannot publish a subsequent event by
  returning a value. If you need to publish another event as the result of the processing,
  inject an `ApplicationEventPublisher` to publish the event manually."
- `defaultExecution` (Framework 7.0): per the javadoc it "indicates whether the event should be
  handled by default, without any special pre-conditions such as an active transaction… declared
  for overriding in composed annotations such as `TransactionalEventListener`."
  `UNVERIFIED:` precise semantics beyond that sentence, and whether it deprecates
  `TransactionalEventListener.fallbackExecution`. Do not present the two as interchangeable.

### 2.5 `@TransactionalEventListener` and `TransactionPhase`

Verified against Spring Framework 7.0.x javadoc.

`org.springframework.transaction.event.TransactionalEventListener` attributes:

| Attribute           | Type               | Default        |
| ------------------- | ------------------ | -------------- |
| `phase`             | `TransactionPhase` | `AFTER_COMMIT` |
| `value` / `classes` | `Class<?>[]`       | `{}`           |
| `condition`         | `String`           | `""`           |
| `fallbackExecution` | `boolean`          | `false`        |
| `id`                | `String`           | `""`           |

`org.springframework.transaction.event.TransactionPhase` — **all four constants confirmed**:

| Constant           | Javadoc                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BEFORE_COMMIT`    | "Handle the event before transaction commit."                                                                                                                                                                 |
| `AFTER_COMMIT`     | "Handle the event after the commit has completed successfully." Specialisation of `AFTER_COMPLETION`; runs in the same sequence as `AFTER_COMPLETION`, **not** in `TransactionSynchronization.afterCommit()`. |
| `AFTER_ROLLBACK`   | "Handle the event if the transaction has rolled back." Specialisation of `AFTER_COMPLETION`.                                                                                                                  |
| `AFTER_COMPLETION` | "Handle the event after the transaction has completed." Use the two specialisations for finer grain.                                                                                                          |

Two verbatim warnings that carry the field failure modes:

> "If the event is not published within an active transaction, the event is discarded unless the
> `fallbackExecution()` flag is explicitly set."

> "**WARNING:** if the `TransactionPhase` is set to `AFTER_COMMIT` (the default),
> `AFTER_ROLLBACK`, or `AFTER_COMPLETION`, the transaction will have been committed or rolled
> back already, but the transactional resources might still be active and accessible. As a
> consequence, any data access code triggered at this point will still 'participate' in the
> original transaction, but **changes will not be committed to the transactional resource**."

Those two produce, respectively, the _listener never ran and nothing said so_ failure and the
_listener wrote to the database and the write vanished_ failure. Both are first-class content
for §4. (Combining with `@Transactional(propagation = REQUIRES_NEW)` is the standard fix;
`UNVERIFIED:` no verbatim javadoc sentence prescribing it was located — the Spring Modulith docs
imply it via `@ApplicationModuleListener`, see §2.6.)

### 2.6 Spring Modulith — Event Publication Registry

Verified against <https://docs.spring.io/spring-modulith/reference/events.html>, which served
**Spring Modulith 2.1.1**.

**Artifacts (verified):**

- core: `org.springframework.modulith:spring-modulith-events-core`
- API for managing publications: `org.springframework.modulith:spring-modulith-events-api`
- starters by backend: `spring-modulith-starter-jpa`, `-jdbc`, `-mongodb`, `-neo4j`

**What it actually guarantees (verified quotes):**

> "hooks into the core event publication mechanism of Spring Framework. On event publication, it
> finds out about the transactional event listeners that will get the event delivered and writes
> entries for each of them … into an event publication log **as part of the original business
> transaction**."

> "Each transactional event listener is wrapped into an aspect that marks that log entry as
> completed if the execution of the listener succeeds. In case the listener fails, the log entry
> stays untouched so that retry mechanisms can be deployed."

So: **at-least-once delivery per listener, with completion tracking, durable in the publisher's
own transaction.** It does _not_ give ordering, does not give exactly-once, and does not make a
listener idempotent for you. Republication on restart is opt-in:
`spring.modulith.events.republish-outstanding-events-on-restart`.

Other verified surface:

- `@ApplicationModuleListener` — documented as equivalent to
  `@Async @Transactional(propagation = Propagation.REQUIRES_NEW) @TransactionalEventListener`.
- `CompletedEventPublications`, `IncompleteEventPublications`, `FailedEventPublications`
  (since 2.0, with `resubmit(ResubmissionOptions)`).
- `EventPublication.Status`: `PUBLISHED`, `PROCESSING`, `COMPLETED`, `FAILED`, `RESUBMITTED`.
- Staleness monitor (since 2.0) marks publications stuck in `PUBLISHED`/`PROCESSING`/
  `RESUBMITTED` as `FAILED` after a configured duration.
- Properties: `spring.modulith.events.registry-trigger-annotation`,
  `…completion-mode` (`UPDATE` default / `DELETE` / `ARCHIVE`), `…staleness.*`.
- Test support: `@ApplicationModuleTest` with an injected `AssertablePublishedEvents`.

**Why Modulith exists, in its own words** (this is the honest statement of what a plain
`@TransactionalEventListener(AFTER_COMMIT)` costs):

> "This now effectively decouples the original transaction from the execution of the listener.
> While this avoids the expansion of the original business transaction, it also creates a risk:
> if the listener fails for whatever reason, the event publication is lost, unless each listener
> actually implements its own safety net. Even worse, that doesn't even fully work, as the
> system might fail before the method is even invoked."

**Modulith's stance on events between modules** (verified verbatim):

> "To keep application modules as decoupled as possible from each other, their primary means of
> interaction should be event publication and consumption. This avoids the originating module to
> know about all potentially interested parties, which is a key aspect to enable application
> module integration testing."

and, on the direct-call alternative:

> "The `complete(…)` method creates functional gravity in the sense that it attracts related
> functionality and thus interaction with Spring beans defined in other application modules.
> This especially makes the component harder to test as we need to have instances available of
> those depended on beans just to create an instance of `OrderManagement`. It also means that we
> will have to touch the class whenever we would like to integrate further functionality with
> the business event order completion."

Note what Modulith does **not** claim: nothing in `fundamentals.html` frames the modular
monolith as a stepping stone to microservices. It is presented as a durable architecture, not a
transitional one. Do not attribute the stepping-stone claim to Modulith.

### 2.7 `java.util.concurrent.Flow` / reactive-streams

Verified against Java 21 javadoc.

- `java.util.concurrent.Flow` — since **Java 9**, `java.base`. Nested interfaces
  `Flow.Publisher<T>` (`subscribe(Flow.Subscriber<? super T>)`),
  `Flow.Subscriber<T>` (`onSubscribe(Flow.Subscription)`, `onNext(T)`, `onError(Throwable)`,
  `onComplete()`), `Flow.Subscription` (`request(long)`, `cancel()`),
  `Flow.Processor<T,R>`; static `Flow.defaultBufferSize()`.
  **The JDK ships the interfaces and exactly one implementation. There is no bus, no dispatcher,
  no `@Subscribe`.**
- `java.util.concurrent.SubmissionPublisher<T>` — since Java 9, `java.base`, implements
  `Flow.Publisher<T>` and `AutoCloseable`:
  ```java
  public SubmissionPublisher()
  public SubmissionPublisher(Executor executor, int maxBufferCapacity)
  public SubmissionPublisher(Executor executor, int maxBufferCapacity,
                             BiConsumer<? super Flow.Subscriber<? super T>, ? super Throwable> handler)
  public int submit(T item)
  public int offer(T item, BiPredicate<Flow.Subscriber<? super T>, ? super T> onDrop)
  public int offer(T item, long timeout, TimeUnit unit,
                   BiPredicate<Flow.Subscriber<? super T>, ? super T> onDrop)
  public void subscribe(Flow.Subscriber<? super T> subscriber)
  public CompletableFuture<Void> consume(Consumer<? super T> consumer)
  public void close()
  public void closeExceptionally(Throwable error)
  public int estimateMaximumLag()
  public int getNumberOfSubscribers()
  ```
  Verbatim: "Method `submit` blocks until resources are available. This is simplest, but least
  responsive. The `offer` methods may drop items (either immediately or with bounded timeout),
  but provide an opportunity to interpose a handler and then retry." And: "If any Subscriber
  method throws an exception, its subscription is cancelled." — **a throwing subscriber silently
  unsubscribes itself**, which is a distinct and nastier failure mode than Spring's.

**Verdict for the skill:** `Flow` is the right answer when the problem is a _stream with
backpressure_ (rates differ, the consumer can fall behind, dropping or blocking is a real
decision). It is the wrong answer when the problem is "three things must happen after an order
is placed" — you get an async boundary and a demand protocol you did not need. Related repo
skills: `reactive-backpressure`, `reactive-and-virtual-thread-selection`.

### 2.8 Summary of mechanisms

| Mechanism                                    | Since / version                           | Sync by default?                   | Ordering                            | Listener exception                                  |
| -------------------------------------------- | ----------------------------------------- | ---------------------------------- | ----------------------------------- | --------------------------------------------------- |
| `List<Listener>` hand-rolled                 | —                                         | yes                                | declaration order (yours to define) | propagates; aborts remaining unless you catch       |
| `CopyOnWriteArrayList<Listener>`             | Java 1.5                                  | yes                                | snapshot at dispatch                | same                                                |
| `PropertyChangeSupport`                      | Java 1.1, module `java.desktop`           | yes                                | registration order                  | propagates                                          |
| Guava `EventBus`                             | Guava 10+, **discouraged by maintainers** | yes (`AsyncEventBus` for async)    | unspecified                         | swallowed unless `SubscriberExceptionHandler`       |
| Spring `@EventListener`                      | Framework 4.2                             | yes (calling thread)               | unspecified unless `@Order`         | propagates to `publishEvent(...)`, aborts remaining |
| Spring `@TransactionalEventListener`         | Framework 4.2                             | yes, at a phase                    | unspecified unless `@Order`         | after commit: cannot roll the commit back           |
| Spring Modulith `@ApplicationModuleListener` | Modulith 1.0+ (2.1.1 current)             | **no** — `@Async` + `REQUIRES_NEW` | none                                | logged, publication stays incomplete, retryable     |
| `Flow` / `SubmissionPublisher`               | Java 9                                    | no                                 | per-subscriber                      | subscriber is **cancelled**                         |

---

## 3. Live disagreements (present both sides; do not resolve by fiat)

### 3.1 Decoupling versus "goto with extra steps"

- **For:** Modulith's "functional gravity" argument (§2.6) — the publisher stops accumulating
  collaborators, becomes constructible in a test without four stubs, and stops being edited
  every time a new consequence is added. GoF's "abstract coupling" and broadcast communication.
- **Against:** Stonebraker's `goto` framing (§1.6); Fowler's flow-invisibility warning (§1.1);
  Guava's own list, which leads with "obscures producer–subscriber relationships, complicating
  debugging" (§2.3).
- **The honest synthesis for the skill:** the decoupling is real and the cost is real, and they
  are paid by _different people_. The publisher's author is paid; the person debugging a
  production incident six months later pays. That asymmetry is why in-process event buses are
  over-adopted, and it is the thing the skill should say out loud.

### 3.2 Synchronous versus asynchronous listeners

- Synchronous keeps one stack trace, one transaction, one thread's context, and lets the
  publisher's error handling work. It also means "decoupled" is a lie at runtime: the publisher
  is blocked by every listener, and a slow listener is a slow publisher
  (Spring's own words: "the danger of a rogue listener blocking the entire application").
- Asynchronous gives real temporal decoupling and costs: no exception propagation (Spring
  verbatim: "If an asynchronous event listener throws an exception, it is not propagated to the
  caller"), no transaction context, no security/tenant context ("asynchronous execution will not
  participate in the caller's thread context (class loader, transaction context) unless the
  `TaskExecutor` explicitly supports this"), a thread pool to size, and a lost event on crash
  unless something like Modulith's registry is durable.
- **Under-argued middle position worth stating:** synchronous-but-after-commit
  (`@TransactionalEventListener(AFTER_COMMIT)` with no `@Async`) is not a compromise, it is a
  third thing with its own trap — the listener runs on the publisher's thread _after_ the
  commit, so it still blocks the caller, and its own database writes are silently discarded
  (§2.5 WARNING).

### 3.3 Where a domain event is published from

- **Inside the aggregate** (Vernon, §1.4): the event is raised at the exact line that made it
  true, so it cannot drift from the state change. Cost: the aggregate needs a publisher — in
  Vernon's version a static/`ThreadLocal` one, which is a hidden global and is hostile to
  parallel tests.
- **Collected on the aggregate, drained by the application service**: the aggregate exposes
  `List<Object> domainEvents()` / `clearDomainEvents()`; the service publishes after
  `repository.save(...)`. This is Spring Data's `@DomainEvents` / `@AfterDomainEventPublication`
  mechanism (`UNVERIFIED:` exact javadoc wording and module — Spring Data Commons
  `org.springframework.data.domain.DomainEvents`; verify before shipping). Cost: two places to
  look, and an event can be collected and never drained if the service forgets.
- **Published by the application service only** (no aggregate involvement): simplest, and the
  event is guaranteed to be published exactly where the transaction is demarcated. Cost: the
  event's truth is asserted by the service, not by the code that changed the state, so the two
  can drift.
- The neighbouring skills that own the aggregate side of this in the _other_ repo
  (`ddd-domain-events`, `C:\git\java-skills`) take the collect-and-drain position. Note it; do
  not re-litigate aggregate design here.

### 3.4 Is an in-process bus a stepping stone to services, or a trap?

- **Stepping stone:** the modular monolith argument — an event boundary between modules is the
  cheapest rehearsal of a service boundary; when a module is extracted, the publish site does
  not change, only the transport.
- **Trap:** an in-process event has synchronous, ordered, transactional, exactly-once,
  same-type-object semantics that a broker will not give you. Code written against those
  implicit guarantees breaks on extraction in ways the compiler cannot see: the listener that
  assumed it ran before the response was returned; the listener that mutated a shared entity;
  the handler that was idempotent only because it never ran twice. Extraction is _not_ a
  transport swap; it is a re-derivation of every guarantee.
- **Modulith's actual position** (§2.6): it does not claim the stepping stone. Its argument is
  testability and coupling _now_. The event publication registry exists precisely because the
  in-process guarantee (same transaction) is what people lose when they go async — which is
  evidence for the trap side, not the stepping-stone side.

### 3.5 One more, worth including

**Does an in-process event need a durable log at all?** Modulith says yes for anything
`@Async`/`AFTER_COMMIT`. The counter-position: if the listener's work is recoverable by a
scheduled reconciliation (a nightly "orders confirmed but not invoiced" query), the registry is
infrastructure you do not need. State the deciding question: _if this listener never runs, does
anything ever notice?_ If the answer is "a report", you have your safety net already.

---

## 4. Field failure modes (concrete)

1. **The flow exists in no single file.** `OrderPlaced` is published in one class and consumed in
   four across three packages. A new developer greps for `OrderPlaced`, finds the record and the
   publish site, and does not find the handler because it takes the type as a supertype or via
   a generic `Consumer<DomainEvent>`. _Detection:_ ask a developer who has not seen the code to
   list, from the source alone, everything that happens when an order is placed, and time them.
   _Mitigation:_ a per-module test that asserts the exact listener set for each event type; an
   `@EventListener` naming convention (`On<Event>` classes); a doc-comment on the event record
   listing its consumers, kept honest by the test.

2. **A listener throws and the publisher's transaction rolls back — or silently does not.**
   Verified mechanics: with the default `SimpleApplicationEventMulticaster` and no error handler,
   "a listener exception stop[s] the current multicast and get[s] propagated to the publisher of
   the current event" — so a synchronous listener throwing inside `@Transactional` rolls the
   publisher back. Set a `TaskExecutor`, and the same exception now goes to the executor and the
   transaction commits. **The same code, the same listener, opposite outcomes, decided by a
   config property.** Checked exceptions arrive wrapped in `UndeclaredThrowableException`, so a
   `catch (SomeCheckedException e)` around `publishEvent` does not fire.

3. **Ordering assumed between two listeners.** `AuditListener` and `EmailListener` both handle
   `OrderPlaced`; the email body reads a row the audit listener writes. Nothing in Spring's
   contract orders them — the javadoc offers `@Order` as an opt-in, and says nothing about the
   default. It happens to work because of classpath scan order, and breaks on a JDK upgrade, a
   package rename, or a jar reorder. _Rule:_ if two listeners must be ordered, they are one
   listener, or one step of a use case that should not have been an event.

4. **Reentrancy — a listener publishes an event that re-enters the same handler.**
   `OrderUpdated` → `RecalculateTotals` handler → saves the order → publishes `OrderUpdated`.
   Synchronous dispatch means this is a recursive call on one stack; the symptom is
   `StackOverflowError` with a repeating frame cycle, not a hang. The subtler version terminates
   after 200 iterations because a value converges, and is only visible as latency. Spring's
   "non-`void` return type … is sent as a new event" makes this reachable _by accident_: a
   listener refactored to return the entity it saved has just created a publish site.
   _Mitigation:_ a dispatch-depth counter that throws above a small bound (2 or 3) in tests; a
   rule that a listener may not publish an event of a type in its own ancestry.

5. **Event published inside a transaction that then rolls back — but the email is already sent.**
   Plain `@EventListener` (not transactional) fires at `publishEvent(...)`, i.e. before the
   commit. The listener sends the email; the transaction then fails on a constraint violation.
   The order does not exist and the customer has been thanked for it. The fix
   (`@TransactionalEventListener`) has the mirror failure: **"If the event is not published
   within an active transaction, the event is discarded unless the `fallbackExecution()` flag is
   explicitly set."** Move one caller outside a transaction and the listener silently stops
   running, with no log line, no exception, and a green test suite if the test was `@Transactional`.

6. **`AFTER_COMMIT` listener writes to the database and the write disappears.** Verified verbatim
   above: "any data access code triggered at this point will still 'participate' in the original
   transaction, but changes will not be committed to the transactional resource." No exception,
   no warning, no row. Requires `@Transactional(propagation = REQUIRES_NEW)` on the listener.

7. **Async listener loses the security/tenant context.** Spring, verbatim: asynchronous execution
   "will not participate in the caller's thread context (class loader, transaction context)
   unless the `TaskExecutor` explicitly supports this." In practice: `SecurityContextHolder`
   empty, MDC empty (no correlation id in the handler's logs — which is exactly when you need
   it), tenant `ThreadLocal` null so the handler queries the wrong schema or throws. Repo
   neighbours: `scoped-values` (the modern replacement for the `ThreadLocal` being lost),
   `executors-and-task-lifecycle`, `structured-logging`.

8. **An event named as a command.** `SendWelcomeEmail` published to a bus with exactly one
   subscriber. The name is imperative, the recipient is known, the publisher needs it to
   succeed. This is a method call with a reflective dispatch, a lost stack frame and a lost
   return value. `event-driven-architecture` owns this at service granularity; in-process it is
   worse, because there is not even a network boundary to justify the indirection.

9. **Events between two classes in the same package.** Both are `package-private`, both are
   edited in the same commit every time, both ship in the same jar. The event bought nothing:
   there is no independent deployment, no unknown consumer set, no temporal decoupling
   (synchronous), and no test isolation gain (the test still needs the listener registered or
   the assertion is vacuous).

10. **Useless stack traces.** Every frame between the business call and the failure is
    `SimpleApplicationEventMulticaster.multicastEvent` → `ApplicationListenerMethodAdapter`
    → reflection → proxy. The trace shows _the dispatcher_, not the caller's intent; the
    publisher's own frame is present but the _reason_ the listener ran is not, and with `@Async`
    even the publisher's frame is gone. Reproducing requires knowing which listener, which is
    what you were trying to find out.

11. **The lapsed listener.** A long-lived subject holds a request-scoped listener; heap grows in
    proportion to requests. Verified shape in the Urma & Warburton `User.receiverEndPoint` field
    (§1.5). Owned here by `java-reference-types-and-leaks` — cross-reference, do not restate.

12. **The vacuous test.** `verify(publisher).publishEvent(any(OrderPlaced.class))` passes; nothing
    asserts that a listener exists, that it is registered, or that it does anything. The team
    believes the flow is tested. This is the in-process analogue of Comartin's "throwing a note
    into a room and hoping somebody reads it", and it is the strongest single argument for
    Modulith's `AssertablePublishedEvents` plus a separate listener test.

---

## 5. Decision framework material

### 5.1 The three-column table

|                              | **Direct call**                                                              | **In-process event**                                                                                              | **Cross-service event**                                           |
| ---------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Coupling removed             | none                                                                         | publisher→consumer _type_ dependency                                                                              | type + temporal + deployment                                      |
| Coupling added               | compile-time dependency on the collaborator                                  | a shared event type both sides import; an implicit contract nobody can enumerate                                  | a wire schema with unknown consumers and a compatibility window   |
| Flow visibility              | complete — one file, one stack                                               | publish site is greppable, handler set is not                                                                     | reconstructable only from correlated logs                         |
| Stack trace                  | intact                                                                       | dispatcher frames; caller intent lost                                                                             | absent                                                            |
| Transaction                  | one, obviously                                                               | one, or one-and-a-half, depending on phase and executor                                                           | none — needs an outbox                                            |
| Ordering                     | the order you wrote                                                          | unspecified unless `@Order`                                                                                       | per-partition only                                                |
| Error propagation            | exceptions work                                                              | depends on sync/async and error handler; async swallows                                                           | dead letter queue                                                 |
| Failure on crash             | atomic with the caller                                                       | event lost unless a durable registry                                                                              | broker-durable                                                    |
| Adding a 4th consequence     | edit the publisher                                                           | add a class                                                                                                       | add a subscriber                                                  |
| Testability of the publisher | needs all collaborators (stubbed)                                            | needs a publisher double only                                                                                     | needs a publisher double only                                     |
| **Deciding question**        | _Does the caller need the result to finish its own work?_ → yes: direct call | _Is the set of consequences open, and does the publisher genuinely not care whether they succeeded?_ → yes: event | _Do the two sides deploy and fail independently?_ → yes only then |

### 5.2 The `IF … THEN` block (draft for the skill body)

```text
IF the caller needs the outcome to complete its own work or to answer its caller
   THEN direct call. An event with a return value is a method call with worse tooling.

IF exactly one consequence exists, it is known, and it must succeed
   THEN direct call, inside the same transaction.

IF the consequence is optional, its failure is not the caller's problem, and it can be
   retried or reconciled later
   THEN event — and make it explicit which of those three is true.

IF two or more independently-owned modules must react and the publisher must not import them
   THEN event, synchronous, with the listener set asserted by a test.

IF the publisher must not be blocked and the consequence must survive a crash
   THEN event + a durable publication log (Spring Modulith event publication registry),
   not @Async alone.

IF the two components are in the same package, ship in the same jar, and change together
   THEN direct call. Always.

IF ordering between two handlers matters
   THEN it is one handler, or one use case. Not two events.

IF the handler must run before the response is returned to the user
   THEN direct call. An AFTER_COMMIT listener does not, and an @Async one certainly does not.
```

### 5.3 The expiry condition — when an in-process bus stops paying

The skill must give a number, not "it depends". Proposed thresholds, framed as a _conjunction_
(all three must fail before you introduce a bus):

```text
An in-process event bus pays for itself only when ALL of:
  - 3 or more modules react to the same fact, OR the reacting set demonstrably changes
    (a new consumer added at least twice in the last year);
  - 2 or more teams own the reacting modules, so the publisher's author cannot simply edit
    the consumer;
  - the publisher is edited for a new consequence more than ~3 times a year.

Below that: direct calls, and an ordinary refactor when the count crosses.
Specifically it does NOT pay when:
  - one module, one team, one consumer — no matter how "clean" it looks;
  - the modules are in one Maven module and one package;
  - the reason given is "so we can extract services later" with no dated plan;
  - every listener is synchronous and @Order-ed — you have written a method call.
```

Verification signals that the choice was right (for the skill's §5 requirement):

- **Change amplification:** adding a fourth consequence touches 1 new file and 0 existing ones.
  If it touches the publisher too, the event bought nothing.
- **Test difficulty:** the publisher's unit test constructs it with one collaborator fewer per
  event introduced. If the test still needs the listeners, the decoupling is nominal.
- **Time to answer "what happens when X?"** measured on a developer who has not seen the code.
  If it exceeds a couple of minutes, the flow-invisibility cost has come due.
- **Incident MTTR** for a bug in a listener: if the first 20 minutes go to finding which listener
  ran, the trace/log design is missing, not the events.

---

## 6. Before/after material

**Versions:** Java 21 LTS (`javac --release 21`), `java.base` only, no dependencies. Spring
variant: Spring Framework 6.2.x / 7.0.x (`ApplicationEventPublisher` since 4.2,
`@TransactionalEventListener` since 4.2), Spring Boot 3.5.x / 4.x. Spring Modulith 2.1.1 where
named. Tests: JUnit 5.11+, AssertJ 3.26+, Mockito 5.x.

### 6a. Direct calls → event publication

**Before** — `PlaceOrder` names every consequence:

```java
package shop.ordering;

import java.time.Clock;
import java.time.Instant;

public final class PlaceOrder {

    private final Orders orders;
    private final Inventory inventory;
    private final Invoicing invoicing;
    private final Notifications notifications;
    private final Clock clock;

    public PlaceOrder(Orders orders, Inventory inventory, Invoicing invoicing,
                      Notifications notifications, Clock clock) {
        this.orders = orders;
        this.inventory = inventory;
        this.invoicing = invoicing;
        this.notifications = notifications;
        this.clock = clock;
    }

    public OrderId place(Basket basket) {
        Instant now = Instant.now(clock);
        Order order = Order.from(basket, now);
        orders.save(order);

        inventory.reserve(order.id(), order.lines());        // consequence 1
        invoicing.raise(order.id(), order.total());          // consequence 2
        notifications.orderPlaced(order.customerId(), order.id());  // consequence 3
        return order.id();
    }
}
```

Pain: four constructor arguments before the clock; a fifth consequence edits this class and its
test; the unit test needs three stubs to exercise one line of business logic.

**After** — one publisher, framework-neutral:

```java
package shop.events;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/** Synchronous, ordered by registration, single-threaded. Deliberately boring. */
public final class EventBus {

    @FunctionalInterface
    public interface Registration extends AutoCloseable {
        @Override void close();
    }

    private final Map<Class<?>, List<Consumer<Object>>> handlers = new LinkedHashMap<>();

    public <E> Registration subscribe(Class<E> type, Consumer<? super E> handler) {
        @SuppressWarnings("unchecked")
        Consumer<Object> erased = (Consumer<Object>) (Consumer<?>) handler;
        handlers.computeIfAbsent(type, t -> new ArrayList<>()).add(erased);
        return () -> handlers.getOrDefault(type, List.of()).remove(erased);
    }

    public void publish(Object event) {
        for (Consumer<Object> handler : List.copyOf(handlers.getOrDefault(event.getClass(), List.of()))) {
            handler.accept(event);
        }
    }

    /** Diagnostic affordance: the thing a bus normally hides. */
    public List<Class<?>> subscribedTypes() {
        return List.copyOf(handlers.keySet());
    }

    public int subscriberCount(Class<?> type) {
        return handlers.getOrDefault(type, List.of()).size();
    }
}
```

```java
package shop.ordering;

import java.time.Instant;

public record OrderPlaced(OrderId orderId, CustomerId customerId,
                          Money total, Instant occurredAt) { }
```

```java
package shop.ordering;

import java.time.Clock;
import java.time.Instant;
import shop.events.EventBus;

public final class PlaceOrder {

    private final Orders orders;
    private final EventBus events;
    private final Clock clock;

    public PlaceOrder(Orders orders, EventBus events, Clock clock) {
        this.orders = orders;
        this.events = events;
        this.clock = clock;
    }

    public OrderId place(Basket basket) {
        Instant now = Instant.now(clock);
        Order order = Order.from(basket, now);
        orders.save(order);
        events.publish(new OrderPlaced(order.id(), order.customerId(), order.total(), now));
        return order.id();
    }
}
```

**What became cheap (state it):** a fourth consequence — loyalty points — is a new class and a
new `subscribe` line in the composition root. `PlaceOrder` is not opened, not recompiled in
anger, and its test does not change.

**What was lost (state it just as plainly):**

- The list of consequences is now in the composition root, not in `PlaceOrder`. Reading
  `place(...)` no longer tells you what placing an order does.
- The stack trace of a failure in invoicing now runs
  `Invoicing.raise ← lambda$…$0 ← EventBus.publish ← PlaceOrder.place`. The `lambda$…$0` frame
  names nothing.
- `inventory.reserve` used to fail the whole `place` call. It still does — `publish` is
  synchronous — but that is now an accident of the bus implementation rather than a decision.
  Swap in an executor and the behaviour silently inverts (§4.2).
- `subscribedTypes()` / `subscriberCount(...)` above exist only because the bus otherwise makes
  the wiring unobservable; a bus without them is strictly harder to debug than the "before".

**Spring variant (short note, not a second example):** replace `EventBus` with
`ApplicationEventPublisher` and `events.publish(...)` with `events.publishEvent(...)`; each
consequence becomes `@Component class ReserveStockOnOrderPlaced { @EventListener void on(OrderPlaced e) {…} }`.
Because the publisher is `@Transactional`, plain `@EventListener` runs _before_ the commit —
which is what you want for `Inventory` (must be atomic with the order) and wrong for
`Notifications` (must not send an email for an order that rolls back). That split — same event,
two different phases — is the concrete lesson: `@EventListener` for the in-transaction
consequence, `@TransactionalEventListener(phase = AFTER_COMMIT)` for the external one, and
`@Transactional(propagation = REQUIRES_NEW)` on any `AFTER_COMMIT` listener that writes to the
database (§2.5 WARNING).

### 6b. Over-eventified flow → direct call

**Before** — two collaborators in one package, talking through the bus:

```java
package shop.pricing;

import shop.events.EventBus;

public record PriceRecalculationRequested(CartId cartId) { }

public final class CartUpdater {
    private final Carts carts;
    private final EventBus events;

    public CartUpdater(Carts carts, EventBus events) {
        this.carts = carts;
        this.events = events;
    }

    public void addLine(CartId cartId, Sku sku, int quantity) {
        Cart cart = carts.byId(cartId);
        cart.add(sku, quantity);
        carts.save(cart);
        events.publish(new PriceRecalculationRequested(cartId));   // the only publish site
    }
}

final class RecalculatePricesOnCartChange {                        // the only subscriber
    private final PricingEngine pricing;

    RecalculatePricesOnCartChange(PricingEngine pricing, EventBus events) {
        this.pricing = pricing;
        events.subscribe(PriceRecalculationRequested.class, e -> pricing.recalculate(e.cartId()));
    }
}
```

Every property that would justify the event is absent: one publisher, one subscriber, both
package-private, both in `shop.pricing`, dispatch is synchronous and in the same transaction,
and the event name is imperative (`…Requested`) — a command, not a fact.

**After:**

```java
package shop.pricing;

public final class CartUpdater {
    private final Carts carts;
    private final PricingEngine pricing;

    public CartUpdater(Carts carts, PricingEngine pricing) {
        this.carts = carts;
        this.pricing = pricing;
    }

    public void addLine(CartId cartId, Sku sku, int quantity) {
        Cart cart = carts.byId(cartId);
        cart.add(sku, quantity);
        carts.save(cart);
        pricing.recalculate(cartId);
    }
}
```

Removed: one record, one subscriber class, one composition-root wiring line, one reflective
dispatch, and the question "what listens to `PriceRecalculationRequested`?". The constructor
argument count is unchanged (`EventBus` was swapped for `PricingEngine`), which is the tell:
**the event never reduced coupling, it renamed it.**

---

## 7. Over-application counter-example (for the mandatory §4 gate)

Build one flow that shows all four failure shapes at once — a checkout implemented as a six-hop
chain, every hop synchronous and `@Order`-ed:

```text
CheckoutRequested   -> CartValidated
CartValidated       -> StockReserved
StockReserved       -> PaymentAuthorised
PaymentAuthorised   -> OrderCreated
OrderCreated        -> InvoiceRaised
InvoiceRaised       -> ConfirmationSent
```

What to say about it:

- **It is one use case.** Six handler classes, six event records, six composition-root lines, one
  transaction, one thread, and a total ordering enforced by `@Order` annotations that a reviewer
  must read in six files to reconstruct. This is a method with six statements, spelled across
  twelve types.
- **The stack trace at the failure** (payment declines) is fourteen frames of multicaster and
  reflection, and does not contain the word `checkout`.
- **Every hop is a command in past-tense clothing.** `CartValidated` is published so that stock
  gets reserved; nothing else consumes it; if the stock handler is not registered, checkout
  silently stops at hop 2 with a 200 response.
- **The chain is reentrancy-prone by construction.** Any handler that returns a value publishes
  another event (Spring, verified §2.4). One refactor from `void` to a return type inserts a
  seventh hop nobody intended.
- **The "we can extract services later" claim is false here.** The chain relies on synchronous,
  ordered, same-transaction, all-or-nothing semantics. Extract any hop and you need retries,
  idempotency, compensation and a saga — i.e. everything the in-process version got for free and
  the design never acknowledged.
- **The collapse:** one `Checkout` application service with six statements, each delegating to a
  collaborator, in a transaction. Keep exactly one event — `OrderPlaced`, published
  `AFTER_COMMIT` — for the genuinely optional, genuinely open-ended consequences (confirmation
  email, analytics, loyalty). Twelve types become seven, and the flow is readable in one file.

---

## 8. Boundary check

`ls skills/` returns **208** directories (verified). Neighbours read and compared:

| Neighbour                                                                                              | What it owns                                                                                                                                                                         | Overlap                                                                                                                    | Resolution                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event-driven-architecture`                                                                            | Cross-service: event vs command vs request/response, choreography vs orchestration, schema registry, fat/thin payloads, FaaS placement, distributed monolith. Body read in full.     | The _naming_ rule (imperative name = command) and the _flow-invisibility_ theme are shared themes, at service granularity. | Keep both. In-process skill cites it and does not restate broker, schema or deployment concerns. The in-process skill owns transactions, reentrancy, stack traces, dispatch order, context propagation — **none of which appear in `event-driven-architecture`.** |
| `delivery-semantics`                                                                                   | at-most/at-least/effectively-once, ack placement, Kafka transactions                                                                                                                 | none — in-process dispatch has no ack                                                                                      | exclude by name                                                                                                                                                                                                                                                   |
| `idempotency`                                                                                          | repeat-safe handlers, dedup stores, idempotency keys                                                                                                                                 | none in-process (a synchronous listener runs once)                                                                         | exclude by name                                                                                                                                                                                                                                                   |
| `message-ordering-and-partitioning`                                                                    | ordering as a per-partition property, keys, rebalances                                                                                                                               | conceptual only; `@Order` is a different mechanism                                                                         | exclude by name                                                                                                                                                                                                                                                   |
| `distributed-transactions-and-sagas`                                                                   | dual-write, outbox, compensations                                                                                                                                                    | the outbox — which is what Modulith's registry _is_.                                                                       | The in-process skill may name the registry as the durable option and route the outbox reasoning there.                                                                                                                                                            |
| `event-sourcing`                                                                                       | events as source of truth, projections, stream versions                                                                                                                              | none — in-process notification stores nothing                                                                              | exclude by name                                                                                                                                                                                                                                                   |
| `java-tell-dont-ask`                                                                                   | decision ownership; service reads getters, decides, writes back                                                                                                                      | adjacent: "who decides" vs "who is told"                                                                                   | exclude by name; the in-process skill answers _how the telling is delivered_, not who decides                                                                                                                                                                     |
| `layering-and-boundaries`                                                                              | where boundaries go, dependency direction                                                                                                                                            | adjacent                                                                                                                   | exclude by name                                                                                                                                                                                                                                                   |
| `domain-logic-organization`                                                                            | Transaction Script / Domain Model / Table Module                                                                                                                                     | adjacent                                                                                                                   | not an exclusion candidate; may be cross-referenced                                                                                                                                                                                                               |
| `service-layer-design`                                                                                 | what an application service owns; `references/service-boundaries.md` **already uses `ApplicationEventPublisher.publishEvent(...)` in its exemplar** but never analyses the decision  | small, and the right direction: it assumes the event, this skill justifies it                                              | cross-reference both ways                                                                                                                                                                                                                                         |
| `java-reference-types-and-leaks`                                                                       | listener/callback registries as a leak class (`references/leak-patterns.md` §2, `reachability-and-cleaners.md`)                                                                      | the lapsed listener                                                                                                        | **owned there.** Cross-reference, do not restate                                                                                                                                                                                                                  |
| `gof-pattern-thinking`                                                                                 | pattern selection; `references/pattern-inventory.md` classifies Observer as High risk / Interaction, and routes to a skill named **`gof-observer` that does not exist in this repo** | this is the gap                                                                                                            | see verdict                                                                                                                                                                                                                                                       |
| `completablefuture-composition`, `executors-and-task-lifecycle`, `scoped-values`, `structured-logging` | async mechanics, context propagation, MDC                                                                                                                                            | the async-listener context loss                                                                                            | route, do not restate                                                                                                                                                                                                                                             |
| `reactive-backpressure`, `reactive-and-virtual-thread-selection`                                       | demand protocols                                                                                                                                                                     | `Flow` as the alternative                                                                                                  | route                                                                                                                                                                                                                                                             |

**Different repo — `C:\git\java-skills\.claude\skills\` (NOT in this registry):**

- `spring-application-events` — Portuguese-language, Spring-specific mechanics:
  `ApplicationEventPublisher`, `@EventListener`, `@TransactionalEventListener` phases, `@Async`,
  `@ApplicationModuleListener`. Substantial content overlap with §2.4–2.6 of this brief.
- `ddd-domain-events` — Portuguese, aggregate capture, outbox, integration-event contracts.

Neither is installed in `agent-skills`, neither appears in `registry/skills.yaml`, and the two
repos have no dependency relationship. They are prior art to _avoid re-deriving_, not
neighbours to exclude in the frontmatter (§2 of the suite spec requires the named neighbour to
exist **in this repo**).

### Verdict — is the remainder thin?

**No. There is a genuine, well-shaped gap, and it is larger than expected.**

The decisive finding: **`gof-observer` does not exist in this repo**, yet
`gof-pattern-thinking/references/pattern-inventory.md` routes to it and classifies Observer as
one of the six High-risk patterns, with this note:

> "**Observer** — synchronous by default, unordered by contract, and a listener held by a
> long-lived subject is the classic Java memory leak. It is also the pattern most often confused
> with distributed pub/sub, which shares none of its guarantees."

That paragraph is a commission for exactly this skill. Nothing in the 208 skills currently
answers _should these two in-process components exchange an event or a call_, and nothing covers
the in-process-specific mechanics: dispatch order, reentrancy, listener exceptions aborting the
multicast, transaction phase, `AFTER_COMMIT` writes silently discarded, async context loss, and
the stack trace made useless by the dispatcher.

What is **left for this skill**, stated precisely:

1. The **direct call vs in-process event** decision, with the expiry condition (§5.3). Unclaimed.
2. **Dispatch semantics inside one JVM** — synchronous by default, unspecified order, exception
   propagation aborting the multicast, reentrancy, the `List`/`CopyOnWriteArrayList` snapshot
   question. Unclaimed.
3. **The transaction/event interaction** — the four `TransactionPhase` constants, the discarded
   event with no active transaction, the discarded write after commit. Present only as one-line
   mentions in `caching-strategies` and `consistency-models`; unowned as a topic.
4. **Debuggability as a first-class cost** — the flow in no single file, the dispatcher stack
   trace, and the affordances that mitigate them (asserted listener sets, dispatch-depth guards,
   subscriber introspection). Unclaimed.
5. **Naming and the command-in-event-clothing test at in-process granularity**, distinct from
   `event-driven-architecture`'s service-granularity version.
6. **Mechanism selection** — hand-rolled list, `PropertyChangeSupport`, Guava `EventBus` (with
   the maintainers' own recommendation against it), Spring, Modulith registry, `Flow`.

Two boundary risks the author must manage:

- **Do not become a Spring skill.** The suite is framework-neutral by default; Spring is one
  section, not the spine. The plain-Java `EventBus` example must lead.
- **Do not restate the lapsed-listener leak** — `java-reference-types-and-leaks` owns it, and
  duplication there would be the most likely review failure.

Suggested frontmatter exclusion tail (all names verified present in this repo):

> Does not cover events between services or a broker (`event-driven-architecture`), delivery
> guarantees (`delivery-semantics`), repeat-safe handlers (`idempotency`), the outbox and
> compensation (`distributed-transactions-and-sagas`), events as the source of truth
> (`event-sourcing`), listener registries as a leak class (`java-reference-types-and-leaks`),
> whether a pattern is warranted at all (`gof-pattern-thinking`), or which layer the publisher
> belongs to (`layering-and-boundaries`, `service-layer-design`).

---

## Sources

- <https://martinfowler.com/articles/201701-event-driven.html>
- <https://martinfowler.com/eaaDev/DomainEvent.html>
- <https://github.com/google/guava/wiki/EventBusExplained>
- <https://guava.dev/releases/snapshot-jre/api/docs/com/google/common/eventbus/EventBus.html>
- <https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/context/ApplicationEventPublisher.html>
- <https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/context/event/EventListener.html>
- <https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/context/event/SimpleApplicationEventMulticaster.html>
- <https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/event/TransactionalEventListener.html>
- <https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/event/TransactionPhase.html>
- <https://docs.spring.io/spring-modulith/reference/events.html>
- <https://docs.spring.io/spring-modulith/reference/fundamentals.html>
- <https://docs.oracle.com/en/java/javase/21/docs/api/java.desktop/java/beans/PropertyChangeSupport.html>
- <https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/SubmissionPublisher.html>
- <https://github.com/Iteratr-Learning/Real-World-Software-Development>
- <https://www.oreilly.com/library/view/real-world-software-development/9781491967164/ch07.html>
- <https://www.dbos.dev/blog/goto-considered-harmful-2026>
- <https://codeopinion.com/debugging-event-driven-systems-5-problems-teams-create/>
