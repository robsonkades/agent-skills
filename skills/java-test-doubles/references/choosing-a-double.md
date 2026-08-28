# Choosing a double

Every listing here was compiled and executed on JDK 25 with Jupiter 6.1.3, Mockito 5.23 and
AssertJ 3.27; the three tests shown pass.

## The taxonomy, in terms of what each proves

| Double | What it is                               | What a passing test then proves                         | Cost when the design changes         |
| ------ | ---------------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| Dummy  | A value passed but never used            | Nothing about the collaborator                          | None                                 |
| Stub   | Canned answers to queries                | The code handles _that_ answer                          | Breaks when the query signature does |
| Fake   | A working implementation, simplified     | The code works against realistic behaviour              | Breaks when the interface does       |
| Spy    | The real object, some calls recorded     | Whatever the real object proves, plus the recorded call | Fragile — half real, half not        |
| Mock   | An object programmed with expected calls | The code made those calls in that shape                 | Breaks on every refactoring of _how_ |

The distinction that matters in practice is narrower than the taxonomy: **a stub or fake lets
you assert on a result; a mock makes you assert on a call.** Assertions on results survive
refactoring. Assertions on calls do not.

## The default: the real thing

```java
private final InMemoryOrderRepository orders = new InMemoryOrderRepository();
```

```java
final class InMemoryOrderRepository implements OrderRepository {
    private final Map<String, Order> byId = new LinkedHashMap<>();

    @Override public Optional<Order> findById(String id) { return Optional.ofNullable(byId.get(id)); }
    @Override public void save(Order order) { byId.put(order.id(), order); }
}
```

Ten lines, written once per port, reused by every test in the module. Compare with the mock
equivalent: `when(orders.findById("ord-1")).thenReturn(Optional.of(order))` — repeated in every
test, and silently wrong the day the service saves before it reads, because a mock has no
memory that a save happened.

Keep the fake in test sources next to the port. When the port gains a method, the compiler
finds the fake; a mock just returns `null` and the test fails somewhere else.

## Mock only what the fake cannot be

```java
@ExtendWith(MockitoExtension.class)
class CheckoutServiceTest {

    private final InMemoryOrderRepository orders = new InMemoryOrderRepository();

    @Mock PaymentGateway gateway;   // external, charges real money, must produce failures on demand
    @Mock AuditLog audit;           // a pure command — the call *is* the outcome

    @Test
    void returnsTheGatewayReferenceForAKnownOrder() {
        orders.save(new Order("ord-1", new BigDecimal("42.00")));
        when(gateway.charge("ord-1", new BigDecimal("42.00"))).thenReturn("ref-9");

        CheckoutService service = new CheckoutService(orders, gateway, audit);

        assertThat(service.checkout("ord-1")).isEqualTo("ref-9");
    }
```

Note what is _not_ verified: that `findById` was called. It obviously was — the test got the
right answer. Verifying it adds a second way for the test to break and no way for a defect to
be caught.

## Verify only when the call is the outcome

```java
    @Test
    void recordsTheChargeInTheAuditLog() {
        orders.save(new Order("ord-1", new BigDecimal("42.00")));
        when(gateway.charge(any(), any())).thenReturn("ref-9");

        new CheckoutService(orders, gateway, audit).checkout("ord-1");

        verify(audit).recordCharge("ord-1", "ref-9");
    }
```

Writing to the audit log is the entire observable effect; there is no value to assert on. This
is the case `verify` exists for.

Here `any()` is honest: the test is about the audit record, and the exact charge arguments are
another test's subject. Using real values in the assertion (`"ord-1"`, `"ref-9"`) keeps the
`verify` itself specific.

## Asserting a negative

```java
    @Test
    void rejectsAnUnknownOrderWithoutCharging() {
        CheckoutService service = new CheckoutService(orders, gateway, audit);

        assertThatThrownBy(() -> service.checkout("ord-404"))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("ord-404");

        verifyNoInteractions(gateway);
    }
```

`verifyNoInteractions` earns its place: "we did not charge the card" is a real requirement with
no observable value. This is the one `verify` family that is not a change detector, because it
asserts an absence the design must maintain.

## Keeping a fake honest

A fake drifts: it accepts an id the real repository rejects, or returns rows the real query
would not. Two defences, in order of cost:

1. **One integration test per query**, against the real engine, asserting the same behaviour
   the fake implements. The fake is then a documented simplification, not a guess.
2. **A shared contract test**: an abstract JUnit class with the behaviour every implementation
   must satisfy, extended once by the fake and once by the real adapter (the latter tagged so
   it runs only where the engine is available). Worth it when the port has several
   implementations or a long life.

Without one of these, a fake is a mock with extra steps — you still encoded your belief about
the collaborator, you just spread it over more lines.

## When a double is not justified

- The collaborator is a pure function or a value object → construct it.
- The collaborator is fast, deterministic and yours → use it; the test then covers both, and
  that is a feature (java-testing-strategy calls this a sociable unit test).
- You are mocking the class under test's own private behaviour via a spy → the class has two
  responsibilities; split it (java-cohesion-coupling).
- You are mocking a library type → wrap it first (java-dependency-inversion).
