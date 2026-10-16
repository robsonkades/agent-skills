# Choosing a double

The examples describe JDK 25, Jupiter 6.1.3, Mockito 5.23 and AssertJ 3.27 APIs. They are partial
snippets requiring imports, domain/port definitions and test setup; no reproducible harness is
bundled here. Compile and execute adapted examples against the project's pinned dependencies.

## The taxonomy, in terms of what each proves

| Double | What it is                                                  | What a passing test then proves                       | Cost when the design changes                           |
| ------ | ----------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Dummy  | A value passed but never used                               | Nothing about the collaborator                        | None                                                   |
| Stub   | Canned answers or failures                                  | The code handles that configured outcome              | Setup may change with the relied-on call contract      |
| Fake   | A working implementation, simplified                        | Behavior under the fake's implemented semantics       | Contract/semantic changes may require maintenance      |
| Spy    | Real behavior with recorded calls and optional substitution | The exercised real behavior and recorded interactions | Mixed real/stubbed behavior needs care                 |
| Mock   | An object programmed with expected calls                    | The code made those calls in that shape               | Over-specific assertions pin incidental implementation |

These names describe roles in a test, not just creation APIs. A Mockito mock used only for
canned answers acts as a stub; a fake can also record interactions. Choose result/state or
call assertions from the behavior promised by the test. Creating an object with `mock()` does
not create an obligation to verify every call; interaction assertions need their own contract.

## Locate what the double replaces

Follow the relevant path from test setup through the subject's call to the collaborator and
its real implementation. Read the port contract and adapter where they establish outcomes,
effects or ownership needed by this scenario. Check that the subject actually receives the
configured instance; an unused double does not control the path. Keep this inspection local
to the claimed behavior, not an inventory of every transitive dependency.

For example, a consumer test stubbing a storage port to throw `StoreUnavailable` can verify
the consumer's response to that outcome. It cannot verify that the real storage adapter maps
an I/O failure to `StoreUnavailable`: that adapter has been removed. To check that mapping,
keep the adapter real and control an appropriate lower boundary with the failure the adapter
actually receives. Conversely, a consumer-only fallback test need not simulate that lower
protocol. The intended claim changes the useful substitution point, not a preference for mocks
or fakes. Reuse an existing seam; this does not require a new wrapper or mocking framework.

If relevant adapter or provider evidence is unavailable, name which modeled outcome or effect
remains unverified. Do not infer the production failure type or its timing merely from what the
test currently stubs.

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

## Failure injection

Use the port's documented outcome and effect semantics, not just a convenient exception class.
A canned exception is enough when the test only promises error translation or a specified
rejection path. Recovery across calls may need a small stateful answer or fake that represents
what happened before the error became visible to the consumer:

- **Rejected before any effect:** record no change, then return/throw the specified rejection.
- **Effect applied, acknowledgement lost:** record the effect first, then expose the specified
  timeout/unknown outcome. A retry must encounter that existing state under the real contract.

For a gateway contract with idempotent requests, test the same operation identity and payload
across attempts, and one recorded effect after a lost response. Checking only invocation count
does not prove the modeled effect count. If the port has no such guarantee, do not add automatic
deduplication to the fake to make a retry test pass; model duplicates or the contract's recovery
path. If failure is explicitly guaranteed to precede the effect, that particular scenario does
not need a post-effect model. If timing is unknown, retain both possibilities or ask for the
missing guarantee before claiming safe retry behavior. Keep the model limited to this test's
claim and verify its material assumptions against the provider/adapter; it is not provider proof.

## Keeping a fake honest

A fake drifts: it accepts an id the real repository rejects, or returns rows the real query
would not. Two ways to check the material assumptions:

1. **Representative real-adapter checks** for the relevant query, write and constraint
   semantics. Reuse existing evidence; one passing query does not cover every fake assumption.
2. **A shared contract test**: run the same required behavior against the fake and real adapter,
   using the project's fixture convention; an abstract JUnit class with two subclasses is one
   option. Tags label tests; configure runner/build filters and an engine-equipped CI job to
   execute the real-adapter cases. Confirm discovered/executed/skipped counts; a green fake-only
   run is not a shared contract pass. Worth it when the port has several implementations or a long life.

Use equivalent logical starting state, inputs and operation sequences for each implementation.
Derive expected outcomes from the applicable port/provider contract, not from the fake's code;
compare the results, failures and state effects the consumer relies on. Do not normalize away
contractual ordering, copying or failure timing just to make implementations agree. If they
disagree, isolate fake drift, a real-adapter defect or an unresolved contract before changing
either expectation. Preserve the failing case and name which consumer tests depend on the disputed
assumption; matching two implementations is not itself proof that either satisfies the contract.

Without real-boundary evidence, the fake can still test consumer behavior, but its agreement
with the real collaborator remains an assumption. Record the material gap instead of presenting
fake success as integration proof.

An HTTP stub server is also a double. Running the real client against it can check serialization,
headers and response handling, but self-authored request/response fixtures can agree with a wrong
client. Tie fixtures to a versioned provider specification and applicable provider verification
or sandbox evidence. Schema conformance covers shape, not every business or failure semantic;
name the remaining gap. Reuse suitable existing checks without requiring a new contract-testing
framework or a live provider call from every unit test.

## Before adding or rejecting a double

- The collaborator is a cheap pure function or value object → normally use the real instance.
- The collaborator is fast and deterministic, with no needed isolation → use it; the test
  covers the exercised behavior of both (java-testing-strategy calls this a sociable unit test).
- A spy suppresses a real method → inspect why. It may expose misplaced responsibility or be
  an adequate constrained test seam; the spy alone proves neither (java-cohesion-coupling).
- A library type is mocked → compare its existing public seam with an owned consumer adapter;
  a wrapper needs an actual boundary benefit (java-dependency-inversion).

## Sources for boundary checks

- [RFC 9110, idempotent methods](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2) — communication failure can hide an applied request; retry safety depends on method/application semantics or evidence that it was not applied. This supports distinguishing effect from acknowledgement in HTTP-facing doubles.
- [JUnit 6.1.3 tagging and filtering](https://docs.junit.org/6.1.3/writing-tests/tagging-and-filtering.html) — tags are inputs to discovery/execution filters, not an environment availability check.
- [Pact provider verification](https://docs.pact.io/provider) — consumer assumptions need provider-side verification; stubbing above request extraction/validation can hide contract defects. This is an evidence distinction, not a requirement to adopt Pact.
