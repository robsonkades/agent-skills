# Worked example: notifications crossed with delivery channels

Two axes. Notification kinds — `Alert`, `Digest`, `Receipt` — differ in how they are composed:
an alert is one line with a severity, a digest batches events over a window, a receipt renders a
document. Channels — email, SMS, push — differ in how bytes leave the process.

## Before — the product

```java
abstract class Notification { abstract void send(); }

class EmailAlert   extends Notification { ... }
class SmsAlert     extends Notification { ... }
class PushAlert    extends Notification { ... }
class EmailDigest  extends Notification { ... }
class SmsDigest    extends Notification { ... }
class PushDigest   extends Notification { ... }
class EmailReceipt extends Notification { ... }
class SmsReceipt   extends Notification { ... }
class PushReceipt  extends Notification { ... }
```

Nine classes for six concepts, and the composition logic for a digest is duplicated three times
— so a fix to digest windowing is three edits, and the SMS one will be forgotten. Adding
WhatsApp is three new classes; adding a fourth notification kind is another four.

## After — the bridge

```java
public interface Channel {
    /**
     * Delivers a rendered message. Implementations must be safe for concurrent use and must
     * return or throw within the supplied deadline.
     *
     * @throws DeliveryRejected      permanent — bad address, payload too large
     * @throws DeliveryUnavailable   transient — safe to retry with the same message id
     */
    DeliveryReceipt deliver(RenderedMessage message, Deadline deadline);

    /** Bulk form; the default is correct for local channels and wrong for remote ones. */
    default List<DeliveryReceipt> deliverAll(List<RenderedMessage> messages, Deadline deadline) {
        return messages.stream().map(m -> deliver(m, deadline)).toList();
    }

    Set<MessageFeature> supported();
}
```

```java
public sealed interface Notification permits Alert, Digest, Receipt {
    RenderedMessage render();
}

public final class Notifier {
    private final Channel channel;

    public DeliveryReceipt send(Notification notification, Deadline deadline) {
        return channel.deliver(notification.render(), deadline);
    }
}
```

Three notification kinds plus three channels: six types instead of nine, and the count now grows
by addition. Digest windowing exists once.

## What the remote channel forced into the interface

Email and SMS were both HTTP-backed from the start, which is why `deliver` already carries a
`Deadline` and a documented transient/permanent split. Push was added later and delivers in
batches of up to 500 — which is why `deliverAll` exists rather than being discovered when a
digest run issued 40 000 individual calls.

Two lessons that generalise:

- **The default `deliverAll` is a trap in the making.** It is correct for a channel whose
  per-call cost is negligible and quietly disastrous for one whose cost is a round trip. Keeping
  it as a `default` is a deliberate trade: convenience for new local channels, at the price of a
  remote channel author having to notice. Where every channel is remote, remove the default and
  make the bulk form abstract.
- **`supported()` exists because of the holes.** A `Receipt` renders a PDF attachment, which SMS
  cannot carry. The first version checked `if (channel instanceof SmsChannel)` inside `Notifier`
  — the leak that ends a bridge. Capability sets replaced it.

## Handling the illegal combination

```java
public DeliveryReceipt send(Notification notification, Deadline deadline) {
    var message = notification.render();
    if (!channel.supported().containsAll(message.requiredFeatures())) {
        throw new ChannelCannotCarry(message.requiredFeatures(), channel.supported());
    }
    return channel.deliver(message, deadline);
}
```

This is the runtime option, and it is the weaker of the two: an illegal pair can be constructed
and only fails when a message is sent. It was chosen here because channel preference is user
configuration that changes at runtime, so the pairing cannot be fixed at wiring time.

Where the pairing _is_ static, prefer making it uncompilable:

```java
interface AttachmentChannel extends Channel { }          // email, push — not SMS

record ReceiptNotifier(AttachmentChannel channel) { }    // SmsChannel does not fit
```

## The contract test

```java
abstract class ChannelContractTest {
    protected abstract Channel channel();

    @Test void reports_a_receipt_with_the_provider_message_id() { ... }

    @Test void rejects_an_oversized_payload_as_DeliveryRejected() { ... }

    @Test void surfaces_a_provider_outage_as_DeliveryUnavailable() { ... }

    @Test void returns_within_the_deadline() {
        var deadline = Deadline.in(Duration.ofMillis(200));
        assertTimeoutPreemptively(Duration.ofMillis(500), () -> channel().deliver(msg(), deadline));
    }

    @Test void is_safe_for_concurrent_use() { /* N threads, assert no exception, all delivered */ }
}
```

Every channel extends it. When `deliverAll` was added to the interface, one new test in the base
class made all three channels prove they batch correctly — including the two whose default
implementation did not, which is how the push channel's real batching got written before it was
needed in production.

## Result

```text
Before                     After
─────────────────────────  ────────────────────────────────────
9 classes, growing ×       6 types, growing +
digest logic ×3            digest logic ×1
channel choice via type    channel injected; configurable per user
"SMS cannot do receipts"   a capability set, checked in one place
  handled nowhere
adding a channel: 3 files  adding a channel: 1 file + it inherits
                             the contract test
```

The one thing that got worse: reading `Notifier.send` no longer tells you what happens on the
wire. That is the trade every bridge makes, and it is acceptable here because the channel is
chosen by configuration rather than by the code path — which is exactly the condition under
which moving a dispatch out of sight pays (`gof-pattern-thinking`).
