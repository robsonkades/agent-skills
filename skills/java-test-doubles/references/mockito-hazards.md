# Mockito hazards

API context: Mockito 5.23 with `mockito-junit-jupiter`, JDK 25. Snippets omit imports and domain
types; expected failures below must be reproduced in the project's actual test setup.

## Strict stubs, and what the failure means

`MockitoExtension` applies `Strictness.STRICT_STUBS` by default. In an otherwise successful
test, an unused non-lenient stub is reported during cleanup:

```java
@ExtendWith(MockitoExtension.class)
class StrictStubsTest {
    @Mock PaymentGateway gateway;

    @Test
    void stubThatIsNeverCalled() {
        when(gateway.charge("ord-1", new BigDecimal("42.00"))).thenReturn("ref-9");
        assertThat(1 + 1).isEqualTo(2);
    }
}
```

Expected result with the extension and default strictness: the test fails with

```
org.mockito.exceptions.misusing.UnnecessaryStubbingException:
Please remove unnecessary stubbings or use 'lenient' strictness.
```

Investigate the setup and intended assertion. Possible explanations include:

- the test never reached the code path it claims to test — the important case;
- the argument matchers do not match what the code actually passes, so the real call fell
  through to the default answer (`null`, `0`, empty) and the test passed for the wrong reason;
- the stub is redundant or left over from a change; that alone does not prove the test is weak.

Prefer removing unnecessary setup or fixing the missed case. A deliberately optional/shared
stub may justify per-stubbing `lenient()` when restructuring costs more than it clarifies;
document why and keep the behavior assertion. Whole-test/class leniency disables more checks.
In Mockito 5.23, an existing test failure or reported mismatch suppresses the additional
unused-stub exception, so absence of that exception is not proof every stub was used.

Strict stubs can also produce `PotentialStubbingProblem` for an unmatched invocation. This is
a heuristic, not a guarantee for every wrong argument: Mockito 5.23 looks for unused,
non-lenient stubbings with the same method name from a different source file. A same-file call
or a previously used stub can instead fall through to the default answer. Check matchers and
actual equality (for example, `BigDecimal.equals` includes scale). For repeated stubbing where
`when` is mistaken for a real invocation, use `doReturn`/`willReturn`; deliberate unmatched
calls may instead justify narrow leniency. Inspect the installed version's behavior and keep
an assertion that detects the relevant wrong outcome.

## Spies and partial mocks

`spy(realObject)` calls the real method for anything not stubbed. Consequences that
surprise people:

- `when(spy.method()).thenReturn(x)` **executes the real method** while stubbing it. If it
  throws or has side effects, they happen. Use `doReturn(x).when(spy).method()` for spies.
- Stubbing one method of an object while the rest runs for real means the test exercises a
  partly substituted configuration; state explicitly what the real calls still establish.
- `spy(instance)` copies instance state rather than forwarding all calls to the original.
  Mutable referenced objects can still be shared; do not assume later changes to the original
  and spy are synchronized, or confuse which instance owns a real side effect/resource.

A spy can be a constrained seam while getting a legacy class under test
(java-legacy-code-testing), or record calls while exercising useful real behavior. Prefer simpler
real collaborators or explicit seams when they help, but require actual responsibility and
compatibility evidence before demanding a class split.

## Static and constructor mocking

Since Mockito 5 the inline mock maker is the default, so `mockStatic`, `mockConstruction`, and
mocking `final` classes and methods are supported. Inline mocking requires instrumentation;
check the runtime/mock-maker and Mockito's explicit Java-agent setup for modern JDKs rather
than assuming dynamic attachment works. Do not relax JVM policy to make a test pass.

A static call is a dependency that does not appear in the constructor, cannot be substituted by
a caller, and is invisible in the type's signature. `mockStatic` makes it testable without
making it visible — and it must be closed (`try (var mocked = mockStatic(X.class))`), or it
leaks into the next test in the same thread and produces failures far from the cause.

Static and construction mocks are thread-scoped; they do not automatically affect work on an
executor thread. Close both scopes deterministically and test asynchronous behavior through
an injectable seam rather than assuming the scoped mock propagates.

Compare an existing injectable seam, a useful instance-side port, and a scoped static or
construction mock under the current change/compatibility constraints. Instrumentation may be
adequate for owned or third-party code even when wrapping is technically possible; no production
redesign is required merely to avoid it. Keep thread scope, real side effects and cleanup explicit.

For `Instant.now()` or `LocalDate.now()`, prefer an existing `Clock` seam when time control
matters. Introduce one when its benefit fits the actual caller/compatibility contract; do not
break exported constructors or replace an adequate scoped harness just to enforce injection.
Preserve the required time-zone and clock semantics (java-test-design).

## `verify` patterns that become change detectors

| Pattern                                  | Problem                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `verify(repo).findById(id)`              | Usually duplicates result evidence; check for a call-count contract.                                           |
| `verifyNoMoreInteractions(everything)`   | Fails when an unrelated, harmless call is added. Pins the implementation.                                      |
| `verify(x, times(1))` everywhere         | `times(1)` is the default; stating it adds noise, not strength.                                                |
| `verify(x).method(any(), any(), any())`  | Ignores argument values. Valid for an argument-independent call contract; insufficient for a payload contract. |
| `InOrder` across unrelated collaborators | Pins an ordering that is not part of any requirement.                                                          |

`InOrder` is justified when the order _is_ the requirement — write to the outbox before
publishing, release the lock after the commit. Then say so in the test name.
It verifies mocked call order, not a real durable commit or completion of asynchronous effects;
those need the appropriate real-boundary evidence.

## Argument captors versus state

```java
ArgumentCaptor<Order> captor = ArgumentCaptor.forClass(Order.class);
verify(repository).save(captor.capture());
assertThat(captor.getValue().total()).isEqualTo(new BigDecimal("42.00"));
```

For an immutable `Order` (or one unchanged since the call), this checks the supplied total.
With a fake repository, the corresponding state assertion reads:

```java
assertThat(orders.findById("ord-1")).get().extracting(Order::total)
        .isEqualTo(new BigDecimal("42.00"));
```

The second checks the fake's stored state; the first checks what was supplied to `save`.
Neither establishes real persistence. Use a captor when the outgoing payload is the contract
and inspecting it helps — for example, a message sent through a broker port. Assert only the
contractual fields when other fields are incidental. Whole-object equality is appropriate
when `equals` represents exactly the required value contract; a captor may then be unnecessary
because `verify(repository).save(expectedOrder)` already compares using `equals`.

Mockito 5.23 captors retain argument references, not snapshots. If the same mutable object is
changed after `save`, `getValue()` observes that changed state; repeated calls with the same
instance can make `getAllValues()` appear to contain identical final states. For call-time
evidence, use immutable payloads or record the required values in a `doAnswer` callback or
recording fake **during the invocation**, then assert those recorded values after execution.
Copy the mutable parts that the assertion depends on: `List.copyOf` fixes list membership but
does not copy mutable elements. Keep this recorder small; it does not simulate persistence.
Check it with a case that sends an incorrect value and then mutates the original to the
expected value — the call-time assertion must still fail.

## Spring Boot

- `@MockitoBean` / `@MockitoSpyBean` are Spring Framework 6.2 annotations that replace or wrap a
  bean in the test `ApplicationContext`. Spring Boot deprecated `@MockBean` and `@SpyBean` in 3.4
  for removal in Boot 4; verify the actual Boot/Framework combination before migrating imports.
- Distinct effective context keys do not share one cached context. Bean override definitions
  and properties contribute to that key; different method-level stubbing answers alone do not.
  Forks, cache eviction and `@DirtiesContext` can cause additional loads. Use cache statistics
  and suite timings to determine the actual cost instead of inferring it from class count.
- Cache reuse depends on the complete context key. Qualifiers, including fallback field names,
  can distinguish bean overrides; use consistent names when targeting the same bean and measure
  actual cache misses. Check replacement versus creation and singleton/spy constraints when
  migrating annotations; an import-only rewrite can change the test's meaning.
- A mocked bean is still a mocked boundary and still owes the verification described in
  java-testing-strategy. `@MockitoBean` on the repository does not remove the need for one test
  proving the query works.

## Primary references

- [Mockito 5.23 API and agent setup](https://www.javadoc.io/static/org.mockito/mockito-core/5.23.0/org.mockito/org/mockito/Mockito.html) — verify the corresponding section for the installed version.
- [Mockito 5.23 argument-mismatch diagnostics](https://www.javadoc.io/static/org.mockito/mockito-core/5.23.0/org.mockito/org/mockito/exceptions/misusing/PotentialStubbingProblem.html) — intentional varying arguments and stubbing API trade-offs.
- [Mockito 5.23 ArgumentCaptor](https://github.com/mockito/mockito/blob/v5.23.0/mockito-core/src/main/java/org/mockito/ArgumentCaptor.java) and [CapturingMatcher implementation](https://github.com/mockito/mockito/blob/v5.23.0/mockito-core/src/main/java/org/mockito/internal/matchers/CapturingMatcher.java) — equality matching, last/all captured values and reference retention.
- [JDK 25 List.copyOf](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/List.html#copyOf(java.util.Collection)>) — unmodifiable lists can still contain mutable elements.
- [Spring bean overrides and context reuse](https://docs.spring.io/spring-framework/reference/testing/annotations/integration-spring/annotation-mockitobean.html)
- [Spring context-cache key and lifecycle](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/ctx-management/caching.html)
