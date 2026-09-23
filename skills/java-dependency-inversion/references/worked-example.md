# Worked example: notification dispatch decoupled from its transport

These are partial Java 17-compatible snippets, not a complete mail application. `Order`
is an existing domain type with the shown accessors; `SmtpClient` and `SmtpMessage` are
illustrative vendor placeholders, not supplied dependencies. Public types belong in their
own named files; the recording double also needs `java.util.List` and `ArrayList` imports.

## Before

Order confirmation policy, welded to SMTP:

```java
package shop.orders;

import shop.smtp.SmtpClient;      // policy imports the mechanism
import shop.smtp.SmtpMessage;

public final class OrderConfirmer {

    private final SmtpClient smtp = new SmtpClient("mail.internal", 587);

    public void confirm(Order order) {
        var body = "Order %s confirmed, total %s"
                .formatted(order.id(), order.total());
        smtp.send(new SmtpMessage(order.customerEmail(), "Order confirmed", body));
    }
}
```

## Analysis

- The edge `shop.orders → shop.smtp` points from policy to mechanism. If the mail relay, SDK or
  SMTP representation changes, the _order policy_ recompiles and redeploys. Adding SMS is a
  separate product decision: this contract currently contains an email destination, so a truly
  multi-channel policy may honestly require its own contract change.
- `new SmtpClient(...)` inside the class hides the dependency and hardcodes the
  endpoint; under the assumed directly connecting client, a test needs a mail server or
  interception. Inspect the actual client's existing test hooks before concluding a new
  seam is necessary.
- The seam test passes on two counts: the mail relay is a system boundary, and the
  policy needs a test double that cannot otherwise be built. Inversion is
  justified — this is not an interface-for-its-own-sake case.

## After

The port lives with the policy, in the policy's vocabulary — it speaks of
confirmations, not of SMTP. Three files in `shop.orders`:

```java
package shop.orders;

public record Confirmation(String recipient, String orderId, String summary) {}
```

```java
package shop.orders;

public interface ConfirmationSender {
    void send(Confirmation confirmation);
}
```

```java
package shop.orders;

public final class OrderConfirmer {

    private final ConfirmationSender sender;

    public OrderConfirmer(ConfirmationSender sender) {
        this.sender = sender;
    }

    public void confirm(Order order) {
        sender.send(new Confirmation(
                order.customerEmail(),
                order.id(),
                "Order %s confirmed, total %s".formatted(order.id(), order.total())));
    }
}
```

The adapter owns every SMTP detail and depends _on_ the policy:

```java
package shop.smtp;

import shop.orders.Confirmation;
import shop.orders.ConfirmationSender;

public final class SmtpConfirmationSender implements ConfirmationSender {

    private final SmtpClient client;

    public SmtpConfirmationSender(SmtpClient client) {
        this.client = client;
    }

    @Override
    public void send(Confirmation c) {
        client.send(new SmtpMessage(c.recipient(), "Order confirmed", c.summary()));
    }
}
```

The composition root is plain Java — the only place that knows both sides:

```java
package shop.app;

public final class Main {
    public static void main(String[] args) {
        var sender = new shop.smtp.SmtpConfirmationSender(
                new shop.smtp.SmtpClient("mail.internal", 587));
        var confirmer = new shop.orders.OrderConfirmer(sender);
        // hand `confirmer` to whatever drives the application
    }
}
```

A DI framework can replace this method and add lifecycle, scopes, conditional assembly and
diagnostics; for one tiny graph it may not improve clarity. Adopt one for demonstrated graph and
lifecycle needs, not merely to enable constructor injection.

This sketch also changes the public constructor from `OrderConfirmer()` to
`OrderConfirmer(ConfirmationSender)`. Update owned callers; published consumers may need a
compatible facade or a staged migration. Keep the actual isolated policy boundary explicit
if a legacy entry point still assembles transport. Compiling the policy alone does not prove
that previously compiled clients or reflective wiring can still construct it.

## The double that proves the seam

```java
final class RecordingSender implements ConfirmationSender {
    final List<Confirmation> sent = new ArrayList<>();
    @Override public void send(Confirmation c) { sent.add(c); }
}
```

The test constructs `new OrderConfirmer(new RecordingSender())` and asserts on
`sent` — outcomes, not interaction scripts. No framework, no network. This `ArrayList` double
is for sequential tests; it establishes no concurrent-use guarantee for the production adapter.

For this sketch, `send` is synchronous and `OrderConfirmer` does not catch failures. A
throwing double should demonstrate propagation with no policy retry or success signal.
Before implementing the adapter, define the policy-level failure type and map actual SDK
exceptions there; neither this placeholder adapter nor the double verifies that mapping.
Returning normally is evidence of the adapter's configured handoff, not proof that a customer
received mail. The composition root owns the shared client's shutdown if that API requires
closing; a borrowed client must not be closed after each call by policy code.
If the application calls `confirm` concurrently, verify that the adapter and client support
sharing or preserve their required confinement. Moving construction to the root does not grant
thread safety, and a synchronous `send` call does not serialize calls from different threads.

## Trade-offs

- Three types now exist where one did: port, adapter, root. Navigation from
  `confirm` to actual SMTP takes one extra jump. This is the price; it is paid
  because the seam is real.
- `Confirmation` duplicates shape the SMTP message also has. That duplication is
  the decoupling — collapsing them would re-leak transport vocabulary into policy.
- The composition root becomes a coupling hotspot by design. It is the one file
  allowed to know everything; keep logic out of it.
- `send` is an external effect. This port says nothing about retry, deduplication, transaction
  boundaries or an ambiguous SMTP outcome. If confirmation state and notification must be
  reliable together, establish the required atomicity, delivery and recovery contract and
  what the existing participants already guarantee before selecting a mechanism such as an
  outbox. Use `idempotency` when replay must not repeat effects; dependency inversion itself
  supplies none of those guarantees.

## Verification

- `shop.orders` compiles from source into fresh output with `shop.smtp` absent from the
  classpath/module path; `jdeps` separately confirms no class-file edge. Under JPMS it reads
  only `java.base` in this sketch. Do not reuse stale generated sources or compiled classes
  as proof that the policy can be built independently.
- The policy test suite runs with the recording double only.
- A throwing double checks the declared failure behavior. Adapter tests separately check
  recipient/subject/body translation and vendor-failure mapping; run a wiring/integration
  check with an isolated transport before claiming the full notification path works.
- Replacing one email transport with another touches a new adapter and the composition root, not
  `shop.orders`. Adding SMS changes only adapters **only if** the policy contract was already
  channel-neutral and carried a valid phone destination; this example deliberately is not.
