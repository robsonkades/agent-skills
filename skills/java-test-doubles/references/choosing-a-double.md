# Choosing a double

The examples describe JDK 25, Jupiter 6.1.3, Mockito 5.23 and AssertJ 3.27 APIs. They are partial
snippets requiring imports, domain/port definitions and test setup; no reproducible harness is
bundled here. Compile and execute adapted examples against the project's pinned dependencies.

## The taxonomy, in terms of what each proves

| Double | What it is                                                  | What a passing test then proves                       | Cost when the design changes                           |
| ------ | ----------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Dummy  | A value passed but never used                               | Nothing about the collaborator                        | None                                                   |
| Stub   | Canned answers to queries                                   | The code handles _that_ answer                        | Breaks when the query signature does                   |
| Fake   | A working implementation, simplified                        | Behavior under the fake's implemented semantics       | Contract/semantic changes may require maintenance      |
| Spy    | Real behavior with recorded calls and optional substitution | The exercised real behavior and recorded interactions | Mixed real/stubbed behavior needs care                 |
| Mock   | An object programmed with expected calls                    | The code made those calls in that shape               | Over-specific assertions pin incidental implementation |

The distinction that matters in practice is narrower than the taxonomy: **a stub or fake lets
you assert on a result; a mock makes you assert on a call.** Assertions on results survive
refactoring more readily. Call assertions remain useful when they express a stable contract.

## A stateful fake

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

A small implementation can be reused where tests need these state transitions. The stub
`when(orders.findById("ord-1")).thenReturn(Optional.of(order))` can be correct for one known
answer, but does not itself model a preceding save. Choose according to the scenario; avoid
growing the fake merely because the real collaborator is stateful.

Keep the fake in test sources next to the port. Adding a required abstract method makes an
incomplete concrete fake fail compilation; adding a default method need not. A mock uses its
configured default answer for unstubbed calls — often zero, null or an empty value — which may
conceal missing setup or be exactly what the test intends.

This fake stores object references and overwrites duplicate ids. It models neither database
copy/isolation semantics nor constraints, transactions or query behavior. Prefer immutable
values and encode only required port semantics; test duplicate ids, missing values and mutation
where those matter against both implementations. Do not grow a miniature database in the fake.

## Mix doubles according to the scenario

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

Note what is _not_ verified: that `findById` was called. The result assertion does not prove
that interaction occurred, but this test promises the returned reference, not a repository
call count. Keep a separate interaction assertion only when it protects a relevant contract.

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

`verifyNoInteractions` is appropriate if no gateway use at all is allowed. If the requirement
only forbids charging, prefer `verify(gateway, never()).charge(any(), any())` so a harmless
gateway query does not break the test. Neither assertion proves the external provider's behavior.

## Keeping a fake honest

A fake drifts: it accepts an id the real repository rejects, or returns rows the real query
would not. Two defences, in order of cost:

1. **Representative real-adapter checks** for the relevant query, write and constraint
   semantics. Reuse existing evidence; one passing query does not cover every fake assumption.
2. **A shared contract test**: an abstract JUnit class with the behaviour every implementation
   must satisfy, extended once by the fake and once by the real adapter (the latter tagged so
   it runs only where the engine is available). Worth it when the port has several
   implementations or a long life.

Without real-boundary evidence, the fake can still test consumer behavior, but its agreement
with the real collaborator remains an assumption. Record the material gap instead of presenting
fake success as integration proof.

## Before adding or rejecting a double

- The collaborator is a cheap pure function or value object → normally use the real instance.
- The collaborator is fast and deterministic, with no needed isolation → use it; the test
  covers the exercised behavior of both (java-testing-strategy calls this a sociable unit test).
- A spy suppresses a real method → inspect why. It may expose misplaced responsibility or be
  an adequate constrained test seam; the spy alone proves neither (java-cohesion-coupling).
- A library type is mocked → compare its existing public seam with an owned consumer adapter;
  a wrapper needs an actual boundary benefit (java-dependency-inversion).
