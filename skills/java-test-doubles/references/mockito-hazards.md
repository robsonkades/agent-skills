# Mockito hazards

Behaviour below was verified on Mockito 5.23 with `mockito-junit-jupiter`, JDK 25.

## Strict stubs, and what the failure means

`MockitoExtension` applies `Strictness.STRICT_STUBS` by default. A stub that is never used
fails the test:

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

Verified result: the test fails with

```
org.mockito.exceptions.misusing.UnnecessaryStubbingException:
Please remove unnecessary stubbings or use 'lenient' strictness.
```

Read it as a finding, not an obstacle. It means one of:

- the test never reached the code path it claims to test — the important case;
- the argument matchers do not match what the code actually passes, so the real call fell
  through to the default answer (`null`, `0`, empty) and the test passed for the wrong reason;
- the stub is left over from a change and the test is now weaker than it looks.

`lenient()` and `@MockitoSettings(strictness = LENIENT)` remove the message and keep all three
defects. The only defensible use is a shared `@BeforeEach` stub that a minority of tests in the
class do not use — and that is usually a sign the class should be split with `@Nested`.

Strict stubs also produce `PotentialStubbingProblem` when a stubbed method is called with
arguments no stub matches. That is the same signal arriving earlier, and it is the most
common way an `equals`-mismatch (a `BigDecimal` scale, a rebuilt DTO) is caught.

## Spies and partial mocks

`spy(realObject)` calls the real method for anything not stubbed. Two consequences that
surprise people:

- `when(spy.method()).thenReturn(x)` **executes the real method** while stubbing it. If it
  throws or has side effects, they happen. Use `doReturn(x).when(spy).method()` for spies.
- Stubbing one method of an object while the rest runs for real means the test exercises a
  configuration that never exists in production.

A spy is defensible as a temporary tool while getting a legacy class under test
(java-legacy-code-testing). As a design choice it says the class does two things and you wanted only
one of them — split it instead.

## Static and constructor mocking

Since Mockito 5 the inline mock maker is the default, so `mockStatic`, `mockConstruction`, and
mocking `final` classes and methods all work without extra configuration. The technical barrier
is gone; the design argument is not.

A static call is a dependency that does not appear in the constructor, cannot be substituted by
a caller, and is invisible in the type's signature. `mockStatic` makes it testable without
making it visible — and it must be closed (`try (var mocked = mockStatic(X.class))`), or it
leaks into the next test in the same thread and produces failures far from the cause.

Prefer, in order: inject the dependency; wrap the static call in a small instance-side port;
mock statically only for third-party code you cannot wrap and cannot avoid.

`Instant.now()` and `LocalDate.now()` are the usual motivation. Inject a `Clock` instead — it
is one constructor parameter and it fixes production reasoning as well as the test
(java-test-design).

## `verify` patterns that become change detectors

| Pattern                                  | Problem                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `verify(repo).findById(id)`              | Asserts a query. The returned value already proves it happened.           |
| `verifyNoMoreInteractions(everything)`   | Fails when an unrelated, harmless call is added. Pins the implementation. |
| `verify(x, times(1))` everywhere         | `times(1)` is the default; stating it adds noise, not strength.           |
| `verify(x).method(any(), any(), any())`  | Asserts "something was called". Use real values, or drop the verify.      |
| `InOrder` across unrelated collaborators | Pins an ordering that is not part of any requirement.                     |

`InOrder` is justified when the order _is_ the requirement — write to the outbox before
publishing, release the lock after the commit. Then say so in the test name.

## Argument captors versus state

```java
ArgumentCaptor<Order> captor = ArgumentCaptor.forClass(Order.class);
verify(repository).save(captor.capture());
assertThat(captor.getValue().total()).isEqualTo(new BigDecimal("42.00"));
```

This works, and with a fake repository the same assertion reads:

```java
assertThat(orders.findById("ord-1")).get().extracting(Order::total)
        .isEqualTo(new BigDecimal("42.00"));
```

The second asserts the outcome; the first asserts the mechanism by which the outcome was
requested. Reach for a captor when there is no fake — typically for a message published to an
external broker — and assert on the captured payload's fields, not on the whole object with
`equals`, which drags in every unrelated field.

## Spring Boot

- `@MockitoBean` / `@MockitoSpyBean` replace a bean in the test's application context
  (Boot 3.4+). `@MockBean` and `@SpyBean` were deprecated in 3.4 and **removed in Boot 4**.
- Every distinct combination of mocked beans and properties creates a **new cached application
  context**. Ten test classes each mocking a different bean means ten context startups; this is
  usually the largest single cost in a slow Spring test suite.
- A mocked bean is still a mocked boundary and still owes the verification described in
  java-testing-strategy. `@MockitoBean` on the repository does not remove the need for one test
  proving the query works.
