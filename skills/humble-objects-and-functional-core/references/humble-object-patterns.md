# Applying the Pattern to Real Components

Each section below is one recurring hard-to-test component, what the decision inside it
usually is, and what the component looks like once the decision has left.

The test in every case is the same: **after the extraction, is there still a branch in the
framework component that a reviewer would want covered?** If yes, the extraction stopped too
early.

## Controller and presenter

The decision hidden in a controller is rarely the business rule — that has usually already
moved to a service. It is the **response shaping**: which status code, which representation,
what to do with an empty result, how to render an error.

```java
// Before: the decision is entangled with the framework's response mechanics.
@GetMapping("/orders/{id}")
ResponseEntity<?> get(@PathVariable String id,
                      @RequestParam(defaultValue = "false") boolean detailed) {
    Optional<Order> order = orders.find(id);
    if (order.isEmpty()) {
        return ResponseEntity.status(404).body(Map.of("error", "not found"));
    }
    Order found = order.get();
    if (found.status() == Status.DRAFT && !currentUser().isOwner(found)) {
        return ResponseEntity.status(403).body(Map.of("error", "forbidden"));
    }
    return ResponseEntity.ok(detailed ? DetailView.of(found) : SummaryView.of(found));
}
```

The presenter is the humble-object form: a pure function from the outcome to a
representation. Note that it does not know `ResponseEntity` exists.

```java
public sealed interface OrderView {
    record NotFound(String id) implements OrderView { }
    record Forbidden(String reason) implements OrderView { }
    record Summary(String id, String status, BigDecimal total) implements OrderView { }
    record Detailed(String id, String status, BigDecimal total, List<LineView> lines)
            implements OrderView { }
}
```

```java
public final class OrderPresenter {
    public OrderView present(String id, Optional<Order> order, Viewer viewer, boolean detailed) {
        if (order.isEmpty()) {
            return new OrderView.NotFound(id);
        }
        Order found = order.get();
        if (found.status() == Status.DRAFT && !viewer.owns(found)) {
            return new OrderView.Forbidden("draft orders are visible to their owner only");
        }
        return detailed
                ? new OrderView.Detailed(found.id(), found.status().name(), found.total(),
                                         lineViews(found))
                : new OrderView.Summary(found.id(), found.status().name(), found.total());
    }
}
```

The controller becomes humble — no branch a reviewer would ask about:

```java
@GetMapping("/orders/{id}")
ResponseEntity<?> get(@PathVariable String id,
                      @RequestParam(defaultValue = "false") boolean detailed) {
    OrderView view = presenter.present(id, orders.find(id), viewerOf(currentUser()), detailed);
    return switch (view) {
        case OrderView.NotFound v  -> ResponseEntity.status(404).body(problem(v));
        case OrderView.Forbidden v -> ResponseEntity.status(403).body(problem(v));
        case OrderView.Summary v   -> ResponseEntity.ok(v);
        case OrderView.Detailed v  -> ResponseEntity.ok(v);
    };
}
```

The `switch` is exhaustive over a sealed type, so adding a fifth outcome is a compile error
here rather than a silently missing case at runtime.

**Payoff:** every rule about who sees what and in which shape is now a plain test over
`OrderPresenter`, with no web layer. The remaining controller test asserts binding and status
mapping only, which is what `architecture-testing` calls a boundary test.

**When not to do this:** a controller with no branch — bind, delegate, return — is already
humble. Adding a presenter to it produces a class that only renames fields
(`enterprise-architecture-smells`).

## Scheduled job

The decision inside a scheduled method is _what work is due_. The effect is _doing it_. These
are almost always fused, which is why "does this job pick the right records at month end" is
usually verified by changing the system clock.

```java
// Before: the selection rule is unreachable without a scheduler and a database.
@Scheduled(cron = "0 0 3 * * *")
void expireTrials() {
    for (Account a : accounts.findAll()) {
        if (a.trialEndsAt().isBefore(Instant.now()) && !a.hasPaymentMethod()) {
            accounts.expire(a.id());
            mailer.send(a.email(), "trial-expired");
        }
    }
}
```

Extract the selection as a pure function of the accounts and the time:

```java
/** One list, so the selection cannot drift between the two effects. */
public record ExpiryPlan(List<String> accountIds) { }

public final class TrialExpiryPolicy {
    public ExpiryPlan plan(List<Account> accounts, Instant now) {
        return new ExpiryPlan(accounts.stream()
                .filter(a -> a.trialEndsAt().isBefore(now))
                .filter(a -> !a.hasPaymentMethod())
                .map(Account::id)
                .toList());
    }
}
```

```java
@Scheduled(cron = "0 0 3 * * *")
void expireTrials() {
    Instant now = clock.instant();                       // read once
    ExpiryPlan plan = policy.plan(accounts.dueForReview(now), now);
    plan.accountIds().forEach(id -> {
        accounts.expire(id);
        notifications.enqueueTrialExpired(id);           // same unit of work as the expiry
    });
}
```

Two things changed beyond testability. The rule is stated once, so the "and not already
expired" clause someone adds next month cannot be applied to the expiry and forgotten for the
notification — note that this only holds because the plan is **one** list; two independently
populated fields would permit exactly the drift the sentence claims is now impossible. And the
query is explicit: `dueForReview` rather than `findAll`, because writing the policy signature
forced the question of what it actually needs (`architecture-and-performance`).

**The limit to be honest about:** the shell still owns the hard part, and this shell is not yet
correct. With more than one replica the cron fires on every instance and sends the notification
N times — it needs a distributed lock or single-runner election. And a crash between expiring
an account and notifying it loses the notification permanently, because the next run's
`dueForReview` no longer selects it. That is why the notification is enqueued in the same unit
of work as the expiry rather than sent from the loop: the effect has to be driven off the
expiry's own durable record, not off an in-memory plan (`idempotency`,
`distributed-locks-and-leases`).

**Note the scaling limit.** `plan()` takes a `List`, which assumes the candidate set fits in
memory. That is fine for thousands and wrong for millions. At that scale keep the policy pure
but apply it per batch, or express the selection as a query and let the core decide only the
per-record edge cases — do not load a million rows to preserve a pattern.

## Message listener

A listener's decisions are _is this message for me_, _is it a duplicate_, and _what does it
mean_. Its effects are acknowledgement, database writes and outbound publishes. Fusing them
is why consumer tests need a broker.

```java
public sealed interface ConsumeDecision {
    record Process(OrderCommand command) implements ConsumeDecision { }
    record SkipDuplicate(String messageId) implements ConsumeDecision { }
    record DeadLetter(String messageId, String reason) implements ConsumeDecision { }
}
```

```java
public final class OrderMessagePolicy {
    public ConsumeDecision decide(Envelope envelope, Set<String> alreadySeen) {
        if (alreadySeen.contains(envelope.messageId())) {
            return new ConsumeDecision.SkipDuplicate(envelope.messageId());
        }
        if (envelope.schemaVersion() > SUPPORTED_VERSION) {
            return new ConsumeDecision.DeadLetter(envelope.messageId(), "unsupported version");
        }
        return new ConsumeDecision.Process(parse(envelope));
    }
}
```

The listener performs, and nothing else. Duplicate handling, poison-message routing and
version negotiation are now tested as data-in/data-out
(`idempotency`, `poison-messages-and-dlq`, `delivery-semantics`).

**The limit to be honest about:** the shell still owns the hard part — acknowledgement
ordering, transaction boundaries, and what happens if the process dies between the write and
the ack. This pattern makes the _policy_ testable; it does not make at-least-once delivery
go away, and the shell still needs an integration test that kills it mid-flight
(`distributed-systems-testing`).

## Gateway to a remote system

The decision is _how to interpret the response_: which failures are retryable, which are
permanent, what a partial success means. The effect is the call.

```java
public sealed interface CallOutcome {
    record Success(Payment payment) implements CallOutcome { }
    record RetryableFailure(Duration retryAfter, String cause) implements CallOutcome { }
    record PermanentFailure(String code, String cause) implements CallOutcome { }
}
```

```java
public final class PaymentResponseInterpreter {
    public CallOutcome interpret(int status, Map<String, String> headers, String body) {
        return switch (status) {
            case 200 -> new CallOutcome.Success(parse(body));
            case 409 -> new CallOutcome.PermanentFailure("duplicate", body);
            case 429 -> new CallOutcome.RetryableFailure(retryAfter(headers), "throttled");
            case 500, 502, 503, 504 -> new CallOutcome.RetryableFailure(
                    Duration.ofMillis(200), "upstream " + status);
            default -> new CallOutcome.PermanentFailure("unexpected-" + status, body);
        };
    }
}
```

This is the highest-value application of the pattern in a distributed system, because the
classification is the part that is both easy to get wrong and expensive to get wrong: treating
a permanent failure as retryable produces a retry storm (`cascading-failures`), and treating a
retryable one as permanent loses work.

Tested as a pure function, every status, every header shape and every malformed body is a
one-line test. Tested through the gateway, each requires a stub server.

**Still needed at the shell:** the actual timeout, connection reuse and the failure paths of
the client itself. Those get an integration test against a stub that can hang and reset
(`architecture-testing`).

## Resilience policy

Retry, backoff and circuit-breaker state are state machines, and a state machine is the
purest thing in a codebase — yet they are routinely written inline around the call, where the
only way to observe a state transition is to make the dependency fail on schedule.

```java
public enum BreakerStatus { CLOSED, OPEN, HALF_OPEN }

public record BreakerState(BreakerStatus status, int calls, int failures,
                           Instant openedAt, int probesInFlight) { }

public final class BreakerPolicy {
    private final double failureRateThreshold;   // e.g. 0.5
    private final int minimumCalls;              // e.g. 20 — below this, never trip
    private final Duration openDuration;
    private final int probesWhenHalfOpen;        // e.g. 3 — not the whole request stream

    // constructor omitted

    public BreakerState onOutcome(BreakerState current, boolean failed, Instant now) {
        int calls = current.calls() + 1;
        int failures = current.failures() + (failed ? 1 : 0);
        boolean trip = calls >= minimumCalls
                && (double) failures / calls >= failureRateThreshold;
        return trip
                ? new BreakerState(BreakerStatus.OPEN, calls, failures, now, 0)
                : new BreakerState(current.status(), calls, failures, current.openedAt(), 0);
    }

    public boolean permits(BreakerState current, Instant now) {
        return switch (current.status()) {
            case CLOSED -> true;
            case OPEN -> now.isAfter(current.openedAt().plus(openDuration));
            case HALF_OPEN -> current.probesInFlight() < probesWhenHalfOpen;
        };
    }
}
```

Two things in that sketch are the point, and both are places hand-rolled breakers go wrong:
it trips on a **failure rate over a minimum number of calls**, not on a consecutive-failure
count — a count trips on a brief blip and never trips under a partial failure that is the
common case; and **half-open admits a bounded number of probes**, because reopening to the
full request stream is a thundering herd aimed at the instance that just recovered
(`circuit-breakers`).

Transitions, thresholds and the half-open probe are now tested by advancing an `Instant`
variable. No sleeping, no flakiness, no dependency.

**The state is pure; holding it is not.** `BreakerState` is shared across concurrent requests,
so the shell must apply the returned state atomically — a compare-and-set on an
`AtomicReference`, not a read-modify-write — or concurrent failures overwrite each other and
the breaker under-counts exactly when load is highest. Purity buys a testable transition
function; it does not buy safe publication (`java-memory-model`).

**Use the library.** This is worth extracting when you are _reasoning about or reviewing_
breaker behaviour, not as a reason to hand-roll one — a mature implementation handles that
atomicity, the sliding window, slow-call rate and metrics, none of which the sketch above does
(`circuit-breakers`).

## When a component resists extraction

If the decision cannot be pulled out, the usual cause is one of four, and each has a
different answer:

| Symptom                                                     | Cause                                                       | Answer                                                                                            |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| The decision needs to fetch mid-way, based on what it found | The shell's query is too narrow                             | Widen the fetch, or split into two decide/act rounds. Do not pass the repository in.              |
| The decision needs to write mid-way to be correct           | It is not one decision; a transaction boundary is inside it | Model it as a sequence of outcomes the shell applies in order (`enterprise-transactions`).        |
| Purity requires loading far too much data                   | The boundary is misplaced                                   | Push selection into the query; the core decides over the result (`architecture-and-performance`). |
| The "decision" is a single `if` on a field                  | There is nothing to extract                                 | Leave it. Not every component has a core.                                                         |

The last row is the one most often ignored, and it is the reason this technique acquires a
bad reputation: applied to components with no decision, it produces a class per method and no
test that anyone needed.
