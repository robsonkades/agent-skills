# Classifying, writing and removing an adapter

## Object adapter versus class adapter

Partial structural sketches; names are illustrative, not real SDK declarations:

```java
// Object adapter — usual starting point
public final class StripeGateway implements PaymentGateway {
    private final StripeClient stripe;                 // adaptee held, not inherited
    @Override public Authorisation authorise(Payment p) { ... }
}

// Class adapter — requires inheritable adaptee and justified subclass hooks
public final class StripeGateway extends StripeClient implements PaymentGateway { ... }
```

The class adapter spends Java's single inheritance slot, exposes every public method of the
adaptee through the concrete subtype (not through a variable typed only as the port), and cannot
delegate to an arbitrary existing instance. Port implementations can still be swapped. Subclass
hooks/protected behavior may justify inheritance; evaluate those constraints instead of claiming
composition always reproduces them.

## Adapter against its four lookalikes

| Pattern       | Interface after                  | Purpose                                         | Tell                                                          |
| ------------- | -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| **Adapter**   | **Different** from the adaptee's | Make an incompatible type usable                | The wrapped type's interface is not the wrapper's             |
| **Decorator** | **Same** as the wrapped type's   | Add behaviour, stackably                        | You could wrap it twice and it would still make sense         |
| **Proxy**     | **Same** as the subject's        | Control access — lazily, remotely, protectively | The caller believes it holds the real thing                   |
| **Facade**    | **New**, coarser                 | Simplify subsystem use                          | Presents a simpler entry point to subsystem operations        |
| **ACL**       | New, domain-shaped               | Keep a foreign _model_ out of the domain        | An architectural layer, usually built from adapters + mappers |

Classify by intent and contract, using interface shape as a clue. Collaborator count alone does not
decide: an adapter can orchestrate several calls to satisfy its target, and a facade can simplify
one complex collaborator. Responsibilities may coexist and should be named explicitly.

An anti-corruption layer is not a fifth alternative. It is what a set of adapters and mappers is
called when it defends a bounded context, and its unit of work is the model, not the method
signature (`layering-and-boundaries`).

## Error translation — the duty adapters usually skip

```java
@Override
public Authorisation authorise(Payment payment) {
    try {
        var response = stripe.charges().create(toRequest(payment));
        return toAuthorisation(response);
    } catch (StripeCardException e) {
        throw new PaymentDeclined(payment.id(), declineReason(e.getCode()), e);   // permanent
    } catch (StripeRateLimitException | StripeConnectionException e) {
        throw new PaymentTemporarilyUnavailable(payment.id(), e);                 // transient
    } catch (StripeException e) {
        throw new PaymentGatewayFailure(payment.id(), e);                         // unknown
    }
}
```

Four rules:

1. **Honor the domain port's isolation contract.** Callers that catch `StripeCardException` are
   coupled to Stripe, and swapping the provider becomes a change to the domain.
2. **Preserve the cause.** `new PaymentDeclined(id, reason)` without `e` destroys the only
   diagnostic that matters at 3 a.m.
3. **Preserve failure semantics.** A connection failure can leave the remote outcome unknown.
   Distinguish definitive rejection, throttling, protocol failure and unknown outcome; provider
   semantics plus the operation/idempotency contract decide whether a retry is safe. A category
   named transient alone does not authorize it (`retries-and-backoff`, `java-exception-design`).
4. **Do not translate an error into a value silently.** Returning `Optional.empty()` for a
   connection failure makes an outage indistinguishable from a negative result.

## Mechanical adapter or translator with rules?

An adapter owns protocol interpretation, representation validation and semantic mapping. It should
not invent domain policy to fill missing provider data; some provider-specific decisions are necessary.

| In the adapter                                            | Verdict                                               |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `dto.amount()` → `Money.of(dto.amount(), dto.currency())` | Mechanical — fine                                     |
| `if (dto.status() == null) status = ACTIVE`               | A default, i.e. a policy — move it in                 |
| Mapping a foreign enum onto your own, exhaustively        | Translate with explicit unknown-value policy          |
| `if (amount > 10_000) requireApproval()`                  | Business rule — must not be here                      |
| Retrying on a timeout                                     | A policy; belongs in a decorator or the client config |
| Choosing between two endpoints by customer segment        | Routing policy — move it out or name it as such       |

The practical test: if the rule would still be true after replacing the vendor, it does not
belong in the vendor's adapter.

## Unknown values from a newer peer

An adapter mapping a closed enum will meet a value it does not know the day the provider adds
one. Three defensible answers, and one that is not:

```text
Fail the operation loudly              correct when acting on an unknown
                                       status could be harmful (payments)

Map to an explicit UNKNOWN variant     correct when the caller can defer;
                                       the domain must then handle it

Ignore the record and alert            correct for a stream where one
                                       unmappable item must not stop the rest

Map to a default like PENDING          not defensible — it invents a fact
```

Preserve bounded diagnostic context: provider/API version, field and safe correlation identifier.
Redact, truncate and escape untrusted values; raw payloads/status strings may contain sensitive data.
Skipping a record requires accepted loss/quarantine semantics, not merely an alert (`structured-logging`).

## Removing a passthrough adapter

A wrapper whose every method is `return delegate.same()` should usually go. The safe order:

1. **Confirm there is no translation** — no renaming that carries meaning, no error mapping, no
   model change. Renaming alone can be worth keeping if the vendor's names are actively
   misleading, but say so in a comment.
2. **Check whether the port bounds a foreign model.** For an _external_ dependency, a
   one-implementation port still earns its place: it stops the vendor's types spreading and it
   gives tests a seam. Internal ports can also enforce dependency direction, test isolation or
   independent release boundaries; inspect those responsibilities before deleting them.
3. **Inline it at the call sites** and let the compiler find them.
4. **Delete the interface last**, after the implementations are gone, not before.

If step 2 says keep it, add the one sentence explaining why — otherwise the next reviewer will
repeat this analysis and possibly reach the opposite conclusion.
