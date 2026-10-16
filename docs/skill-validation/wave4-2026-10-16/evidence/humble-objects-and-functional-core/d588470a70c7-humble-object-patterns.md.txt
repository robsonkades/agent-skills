# Applying the Pattern to Real Components

Each section below is one recurring hard-to-test component, what the decision inside it
usually is, and what the component looks like once the decision has left.

These are partial Java 21 sketches: imports, domain types and framework wiring are omitted.
Inspect the project's actual framework version and preserve its current transaction and
security behavior. Extract decision branches when useful; remaining boundary branches still
need tests for mapping, effect ordering and failure handling.

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

The controller becomes humble; its status/representation mapping still deserves coverage:

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

The non-null `view` switch is exhaustive; adding a fifth outcome exposes the missing case
when this source is recompiled. `Order`, `Viewer` and `lineViews` must read stable data without
lazy I/O; detach the required snapshot in the shell where ORM entities would violate that.

**Payoff:** the shown visibility and shaping rules can be tested directly on `OrderPresenter`.
The shell still needs relevant binding, authenticated-viewer construction, security, status,
serialization and transaction checks. The omitted `problem(...)` and view mappings must retain
the established response bodies; serializing the new records is not automatically wire
compatible. Moving a method also requires checking actual framework interception; in Spring
proxy mode, a self-invoked `@Transactional` method does not start a transaction through the proxy
(`architecture-testing`, `enterprise-transactions`).

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
public record ExpiryPlan(List<String> accountIds) {
    public ExpiryPlan { accountIds = List.copyOf(accountIds); }
}

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
    plan.accountIds().forEach(id -> expiryService.expireIfEligibleAndRecordEvent(id, now));
    // Each service call atomically rechecks eligibility, changes state and writes an outbox event.
}
```

One candidate list avoids independently selecting expiry and notification candidates, but
it does not prevent drift between the planning predicate, query and authoritative eligibility
check. Keep those contracts aligned; the winning expiry transition determines whether a
notification event is written. The query is also explicit: `dueForReview` rather than
`findAll`, because the policy's inputs expose what it actually needs
(`architecture-and-performance`).

**The limit to be honest about:** the shell still owns the hard part, and this shell is not yet
complete without the service contract shown above. Multiple replicas or retries can process
the same candidate; a conditional update/unique transition in the database can select one
winner without requiring a cluster-wide lock. Eligibility may change after planning, so
recheck the relevant state/version atomically with expiry. Commit its durable outbox event
in that same transaction; writing to a remote queue after the update is not equivalent.
Only the winning transition emits an event. An outbox dispatcher can redeliver, so downstream
notification handling still needs the appropriate idempotency contract (`idempotency`,
`enterprise-transactions`). A single plan list alone guarantees neither effect atomicity nor
notification delivery.

**Note the scaling limit.** `plan()` takes a `List`; assess actual candidate size, object
footprint and query/memory budget. Batch only when partial progress and recovery are allowed,
or keep selection/set-based effects in the database and isolate only useful per-record rules.
Do not materialize an unbounded result to preserve purity.

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
        if (!SUPPORTED_VERSIONS.contains(envelope.schemaVersion())) {
            return new ConsumeDecision.DeadLetter(envelope.messageId(), "unsupported version");
        }
        return new ConsumeDecision.Process(parse(envelope));
    }
}
```

`SUPPORTED_VERSIONS` is an explicit immutable set; numeric ordering is not a compatibility
contract. `parse` is a bounded, deterministic domain decoder omitted here; map malformed
payloads to the declared poison-message outcome rather than assuming every supported-version
payload parses. The `alreadySeen` snapshot is only a decision input, not a deduplication lock:
the shell must atomically claim the scoped message identity with the business write and
validate the payload/key relationship. Concurrent deliveries can both observe absence.
Duplicate classification, poison-message routing and schema support can be tested as data-in/data-out
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

This table illustrates one hypothetical provider contract, not universal HTTP semantics.
HTTP 409 means a conflict, not necessarily a duplicate payment. `RetryableFailure` is a
candidate classification, never permission to repeat a charge: the shell must establish
provider idempotency or reconcile an unknown outcome, enforce attempt/deadline budgets and
apply bounded backoff. A 5xx or transport failure can follow a committed effect. `parse` and
`retryAfter` are omitted; define malformed/oversized body handling and invalid header policy.
For HTTP-date Retry-After, pass the sampled current time; do not read the clock in the core.

This is the highest-value application of the pattern in a distributed system, because the
classification is the part that is both easy to get wrong and expensive to get wrong: treating
a permanent failure as retryable produces a retry storm (`cascading-failures`), and treating a
retryable one as permanent loses work.

Pure classification permits direct tests of statuses, headers and malformed bodies with
explicit inputs. Retain transport tests for how the real client supplies those inputs.

**Still needed at the shell:** the actual timeout, connection reuse and the failure paths of
the client itself. Those get an integration test against a stub that can hang and reset
(`architecture-testing`).

## Resilience policy

Retry and breaker policy can contain pure transition functions, but a complete breaker
also needs atomic admission, a bounded measurement window and effect lifecycle handling.
Use the maintained implementation already selected by the project; extract a policy only
when it clarifies a real decision or supports a review (`circuit-breakers`).

A bounded pure kernel can decide whether a **closed-state window** warrants opening:

```java
public static boolean shouldOpen(int calls, int failures, int minimumCalls,
                                 double failureRateThreshold) {
    if (calls < 0 || failures < 0 || failures > calls || minimumCalls < 1
            || !Double.isFinite(failureRateThreshold)
            || failureRateThreshold <= 0 || failureRateThreshold > 1) {
        throw new IllegalArgumentException("invalid window or threshold");
    }
    return calls >= minimumCalls && (double) failures / calls >= failureRateThreshold;
}
```

This is only a count-window threshold example, not an admission algorithm. Consecutive-failure
and rate policies detect different failure shapes; choose the actual library's policy from
traffic evidence, not from an assertion that one is universally correct.

The shell/library must transition OPEN to HALF_OPEN **and reserve a probe atomically** before
performing the call. A boolean `permits` check followed by a later increment can admit an
unbounded burst. Match completions to the admitted generation/token, release reservations
on all terminal paths, and prevent stale completions from reopening/closing a newer epoch.
A lock, serialized owner or a correct CAS loop can enforce the state contract; simply placing
state in an `AtomicReference` cannot. Retries of a CAS computation must not duplicate effects.

Test the pure window boundaries without sleeping. Separately test admission races, stale
completions, cancellation and the chosen time source through the actual implementation.

## When a component resists extraction

If the decision cannot be pulled out, the usual cause is one of four, and each has a
different answer:

| Symptom                                                     | Cause                                                       | Answer                                                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| The decision needs to fetch mid-way, based on what it found | A pure split may need staged inputs                         | Compare bounded fetch or decide/act rounds with a testable effectful Humble Object; preserve query cost and consistency.      |
| The decision needs to write mid-way to be correct           | It is not one decision; a transaction boundary is inside it | Preserve the atomic read/write or conflict check; sequencing outcomes alone is not a transaction (`enterprise-transactions`). |
| Purity requires loading far too much data                   | The boundary is misplaced                                   | Push selection into the query; the core decides over the result (`architecture-and-performance`).                             |
| The "decision" is a single `if` on a field                  | Judge the rule's significance, not branch count             | Extract if it isolates a consequential rule; otherwise leave it.                                                              |

Branch count is not a proxy for significance: a single authorization check can justify
direct tests, while a forwarding method may gain nothing from another abstraction.

## Sources

- [HTTP semantics, RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html) — idempotency (§9.2.2), Retry-After (§10.2.3), and conflict status (§15.5.10).
- [Spring transaction annotation semantics](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html) — proxy interception versus self-invocation; inspect the target framework version and advice mode.
