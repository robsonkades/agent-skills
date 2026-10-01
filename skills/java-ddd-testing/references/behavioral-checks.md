# Behavioral checks and trustworthy fakes

Read for domain/application tests or when a passing fake may conceal a missing write.
The scenarios below are test designs, not an executable suite or verified application
behavior. Map their names and operations to the project's real contracts.

## Domain: identity, values and transitions

Keep `OrderTest` beside the domain package it exercises. Construct real domain objects;
Spring, persistence entities and infrastructure gateways add no evidence for a local rule.

For an invariant-preserving `Order.submit()` with draft/submitted states, use independent
cases:

| Given and action                                | Expected business evidence                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Eligible draft; submit once                     | Submitted state, stable business ID, defined audit change and one new `OrderSubmitted` event if the model emits events              |
| Ineligible draft; submit                        | Defined error/result, original fields and audit data, no new event                                                                  |
| Already submitted; submit again                 | Explicit retry policy: rejection or idempotent success, with no duplicate success event unless the contract explicitly requires one |
| Submitted order; attempt a protected child edit | Rejection before changing child contents, totals, audit data or pending events                                                      |

Capture immutable before-values. Keeping `before = order` or retaining its mutable child
list creates an alias, not an observation of the previous state. If setup already emits
events, compare event count/content before and after the command rather than incorrectly
asserting the entire event buffer is empty.

Test each meaningful boundary: zero versus one item, exact maximum versus one above it,
crossing a period boundary, mismatched currency, or an operation after cancellation. Use
only boundaries in the actual rule. For notifications, assert expected codes/fields and
all independent errors that should accumulate; assert ordering or exact text only if
contractual. Deferred validation may permit a candidate to be incomplete: test the agreed
acceptance boundary, including that invalid candidates cannot be committed or published.

For value objects and typed IDs:

- Equal independently constructed values must compare equally and have equal hash codes;
  exercise `HashSet` membership or a map lookup with the independently constructed key.
- Check distinct values and the domain's normalization policy. Do not assume `10.0` and
  `10.00` mean the same money representation, or that differently cased business keys
  are interchangeable; establish the policy first.
- Check reflexivity, symmetry, transitivity and null handling when equality is custom.
  Unequal values need not have different hash codes. The Java contract supports these
  assertions, not a requirement for collision-free hashes.
  [Java 17 Object contract](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Object.html#equals(java.lang.Object)>)
- Mutate an input array/list after construction and an exposed collection after retrieval;
  neither should change an immutable value or bypass root authority. Also inspect contained
  objects: `List.copyOf` prevents structural changes but does not freeze mutable elements.
  [Java 17 unmodifiable lists](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/List.html#unmodifiable)
- For entities, distinguish identity from state equality. Two snapshots with the same ID
  can have different business state; assert mapped fields directly in round-trip tests.

For a pure domain service, supply real entities/values and assert its domain result for
both accepted and rejected inputs. Do not move use-case transaction, authorization or
port orchestration tests into that service to make the test easier to construct.

## Application: outcomes through ports

In `DefaultSubmitOrderUseCaseTest`, construct the use case directly with appropriate
controlled ports. Keep domain rules real. A working in-memory gateway is useful for
state-based assertions; a stub is enough for a single failure response. A fake implements
behavior with shortcuts and is not a production database, consistent with
[Fowler's test-double distinction](https://martinfowler.com/bliki/TestDouble.html).

Cover the requested use-case policy:

- Successful command produces the contract output and the expected stored root snapshot.
- Malformed values, missing roots, invalid transitions and forbidden callers fail through
  the documented result/exception boundary without protected side effects.
- Tenant/ownership checks cannot be bypassed by guessed IDs or by another supported entry
  point. Include an adversarial caller from another tenant where the system is multi-tenant.
- A persistence conflict or port failure does not return success or publish an event
  claiming a committed transition. Use a controlled failure to test application handling;
  prove rollback separately against the actual transaction mechanism.
- If retries/idempotency are promised, a duplicate command has the agreed output and event
  count, and reuse of its key with a different payload is handled as specified.

Assert stored values via a fresh load, external requests via a recording port where
appropriate, and output fields directly. Avoid requiring `find -> validate -> update -> save`
as a mock call sequence; legitimate internal refactoring should preserve these outcomes.
Recorded absence of a protected outbound request is useful failure-path evidence.

## Prevent the fake from hiding the defect

For an explicit-save `OrderGateway`, store immutable snapshots of every relevant root and
child value. Rehydrate a new aggregate on each read; copy nested mutable data, not merely
the containing list. Preserve ID, audit data and stored version without generating events.
Do not share mutable instances with saved arguments, load results or saved return values.

Require these contract checks before trusting the fake:

1. Save draft A. Mutate A without a second save. A fresh read is still draft.
2. Load B, mutate B, and omit save. Another read is still draft. This catches the false
   green where a use case never persisted its transition.
3. Save changed B. A fresh read reflects the change and agrees with the gateway's returned
   version/output contract; mutating B again does not update the stored snapshot.
4. When save is configured to fail, the stored snapshot remains unchanged. A fake that
   writes then throws models a different failure and must say so.
5. When optimistic conflict behavior is part of the port, two stale snapshots exercise
   the defined application conflict path. Do not describe this as database race evidence.

These checks apply to detached, explicit-save ports. If the application intentionally
uses managed entities and a unit of work, changing a managed object can be persisted at
commit without `save()`. The fake must then track transaction-scoped state and expose
the real commit/rollback contract, or that scenario should use integration tests.
[Fowler's Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html)

Reuse small shared contract cases for fake and real adapters where their promises overlap;
run adapter-specific constraints and transactions separately. Do not reproduce an ORM or
SQL engine inside the fake. A sequential map cannot establish concurrent safety, natural-key
uniqueness across transactions, constraint timing or durability.
