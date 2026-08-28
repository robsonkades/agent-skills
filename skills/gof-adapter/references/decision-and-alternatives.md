# Classifying, writing and removing an adapter

## Object adapter versus class adapter

```java
// Object adapter — the only one to use in ordinary Java
public final class StripeGateway implements PaymentGateway {
    private final StripeClient stripe;                 // adaptee held, not inherited
    @Override public Authorisation authorise(Payment p) { ... }
}

// Class adapter — avoid
public final class StripeGateway extends StripeClient implements PaymentGateway { ... }
```

The class adapter spends Java's single inheritance slot, exposes every public method of the
adaptee through your port's type (so callers can bypass the port), cannot be swapped for another
adaptee, and cannot wrap an adaptee obtained from a factory. Its only advantage — overriding
adaptee behaviour — is better served by composition plus a decorator.

## Adapter against its four lookalikes

| Pattern       | Interface after                  | Purpose                                         | Tell                                                          |
| ------------- | -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| **Adapter**   | **Different** from the adaptee's | Make an incompatible type usable                | The wrapped type's interface is not the wrapper's             |
| **Decorator** | **Same** as the wrapped type's   | Add behaviour, stackably                        | You could wrap it twice and it would still make sense         |
| **Proxy**     | **Same** as the subject's        | Control access — lazily, remotely, protectively | The caller believes it holds the real thing                   |
| **Facade**    | **New**, coarser                 | Simplify a subsystem you own                    | It calls several collaborators, not one                       |
| **ACL**       | New, domain-shaped               | Keep a foreign _model_ out of the domain        | An architectural layer, usually built from adapters + mappers |

The single most reliable discriminator is the first column. Same interface in and out means
Decorator or Proxy; different interface means Adapter or Facade; several collaborators behind it
means Facade.

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

1. **Never let the foreign exception escape.** Callers that catch `StripeCardException` are
   coupled to Stripe, and swapping the provider becomes a change to the domain.
2. **Preserve the cause.** `new PaymentDeclined(id, reason)` without `e` destroys the only
   diagnostic that matters at 3 a.m.
3. **Classify transient versus permanent at the adapter.** This is the only place that knows;
   retry policy above it depends on the classification, and a retried card decline is both
   useless and, with some providers, chargeable (`retries-and-backoff`,
   `java-exception-design`).
4. **Do not translate an error into a value silently.** Returning `Optional.empty()` for a
   connection failure makes an outage indistinguishable from a negative result.

## Mechanical adapter or translator with rules?

An adapter is mechanical: field-to-field, name-to-name, error-to-error. The moment it _decides_,
it has taken on domain responsibility in a layer where nobody looks for it.

| In the adapter                                            | Verdict                                               |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `dto.amount()` → `Money.of(dto.amount(), dto.currency())` | Mechanical — fine                                     |
| `if (dto.status() == null) status = ACTIVE`               | A default, i.e. a policy — move it in                 |
| Mapping a foreign enum onto your own, exhaustively        | Mechanical — fine, if unknown values fail loudly      |
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

Whichever is chosen, the unknown value must be logged with the raw text, or diagnosis after the
fact is impossible (`structured-logging`).

## Removing a passthrough adapter

A wrapper whose every method is `return delegate.same()` should usually go. The safe order:

1. **Confirm there is no translation** — no renaming that carries meaning, no error mapping, no
   model change. Renaming alone can be worth keeping if the vendor's names are actively
   misleading, but say so in a comment.
2. **Check whether the port bounds a foreign model.** For an _external_ dependency, a
   one-implementation port still earns its place: it stops the vendor's types spreading and it
   gives tests a seam. For an internal type it does not.
3. **Inline it at the call sites** and let the compiler find them.
4. **Delete the interface last**, after the implementations are gone, not before.

If step 2 says keep it, add the one sentence explaining why — otherwise the next reviewer will
repeat this analysis and possibly reach the opposite conclusion.
