# Worked example: notification dispatch decoupled from its transport

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

- The edge `shop.orders → shop.smtp` points from policy to mechanism. If the
  business adds SMS or webhook notification, or the mail relay changes, the _order
  policy_ recompiles and redeploys.
- `new SmtpClient(...)` inside the class hides the dependency and hardcodes the
  endpoint; no test can run `confirm` without a mail server or bytecode-level
  mocking of `SmtpClient`.
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

A DI framework can replace this method; it cannot improve on its clarity for one
object graph. Adopt one when graph size or scoping demands it, not to enable the
pattern.

## The double that proves the seam

```java
final class RecordingSender implements ConfirmationSender {
    final List<Confirmation> sent = new ArrayList<>();
    @Override public void send(Confirmation c) { sent.add(c); }
}
```

The test constructs `new OrderConfirmer(new RecordingSender())` and asserts on
`sent` — outcomes, not interaction scripts. No framework, no network.

## Trade-offs

- Three types now exist where one did: port, adapter, root. Navigation from
  `confirm` to actual SMTP takes one extra jump. This is the price; it is paid
  because the seam is real.
- `Confirmation` duplicates shape the SMTP message also has. That duplication is
  the decoupling — collapsing them would re-leak transport vocabulary into policy.
- The composition root becomes a coupling hotspot by design. It is the one file
  allowed to know everything; keep logic out of it.

## Verification

- `shop.orders` compiles with `shop.smtp` absent from the classpath or module
  graph (`jdeps` shows no edge; under JPMS the policy module has no `requires`).
- The policy test suite runs with the recording double only.
- Adding a second transport (SMS) touches a new adapter and one line of the
  composition root — no change in `shop.orders`.
