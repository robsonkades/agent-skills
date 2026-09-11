# Worked example: notifications crossed with delivery channels

Two axes. Notification kinds — `Alert`, `Digest`, `Receipt` — differ in how they are composed:
an alert is one line with a severity, a digest batches events over a window, a receipt renders a
document. Channels — email, SMS, push — differ in how bytes leave the process.

Partial Java 17 sketches: domain types, imports and provider implementations are omitted.
JUnit-shaped examples describe contract cases, not executed tests or standalone source files.

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
     * Submits a rendered message. A receipt confirms provider acceptance, not recipient delivery.
     * Implementations are safe for concurrent use, honor the remaining deadline across retries,
     * and stop initiating work when it expires. Local termination does not cancel a remote effect.
     *
     * @throws DeliveryRejected      permanent — bad address, payload too large
     * @throws DeliveryUnavailable   temporary failure; effect may be unknown after transmission
     */
    DeliveryReceipt deliver(RenderedMessage message, Deadline deadline);

    /** Per-input results in input order: accepted, rejected, unknown or not attempted.
     *  Preserve successful prefixes and IDs; a transport failure must not erase partial progress.
     *  Batch limits and chunking share the original deadline.
     */
    List<DeliveryOutcome> deliverAll(List<RenderedMessage> messages, Deadline deadline);

    /** Immutable snapshot of advertised capabilities, not a reservation.
     *  deliver/deliverAll must enforce current per-message constraints before the effect;
     *  if an effect may already have occurred, preserve the unknown/partial outcome.
     */
    Set<MessageFeature> supported();
}
```

```java
public sealed interface Notification permits Alert, Digest, Receipt {
    RenderedMessage render();
}

public final class Notifier {
    private final Channel channel;

    public Notifier(Channel channel) {
        this.channel = java.util.Objects.requireNonNull(channel, "channel");
    }

    public DeliveryReceipt send(Notification notification, Deadline deadline) {
        return channel.deliver(notification.render(), deadline);
    }
}
```

Three notification kinds plus three channels: six variation types instead of nine combined
variants, plus the shared interfaces and wiring. Variation grows by addition; digest windowing
exists once. Total type count alone is not the benefit.

## What the remote channel forced into the interface

Email and SMS were both HTTP-backed from the start, which is why `deliver` already carries a
`Deadline` and a documented transient/permanent split. Push was added later and delivers in
batches of up to 500 — which is why `deliverAll` exists rather than being discovered when a
digest run issued 40 000 individual calls.

Two lessons that generalise:

- **Bulk behavior needs a contract.** A sequential default can hide round trips and lose partial
  success when item N throws. Each implementation must preserve outcomes, bound batching and
  document whether acceptance is atomic. Retry unknown outcomes only with established provider
  idempotency/deduplication semantics, scope and retention; reusing an ID alone proves nothing.
- **`supported()` exists because of the holes.** A `Receipt` renders a PDF attachment, which SMS
  cannot carry. The first version checked `if (channel instanceof SmsChannel)` inside `Notifier`
  — the leak that ends a bridge. Capability sets replaced it.

## Handling the illegal combination

```java
public DeliveryReceipt send(Notification notification, Deadline deadline) {
    var message = notification.render();
    var supported = channel.supported();
    if (!supported.containsAll(message.requiredFeatures())) {
        throw new ChannelCannotCarry(message.requiredFeatures(), supported);
    }
    return channel.deliver(message, deadline);
}
```

This is the runtime option, and it is the weaker of the two: an illegal pair can be constructed
and only fails when a message is sent. It was chosen here because channel preference is user
configuration that changes at runtime, so the pairing cannot be fixed at wiring time.
The snapshot is an early rejection/diagnostic aid; it can become stale before delivery. The
backend must enforce the actual request's constraints, and rejection is definitive only when
no effect could have occurred. The caller does not acquire authority from this precheck.

Where the pairing _is_ static, prefer making it uncompilable:

```java
interface AttachmentChannel extends Channel { }          // email, push — not SMS

record ReceiptNotifier(AttachmentChannel channel) { }    // SmsChannel does not fit
```

The type excludes channels without attachment support; it does not prove that a particular
payload fits current size/configuration limits or reserve capacity for a later call.

## The contract test

```java
abstract class ChannelContractTest {
    protected abstract Channel channel();

    @Test void reports_a_receipt_with_the_provider_message_id() { ... }

    @Test void rejects_an_oversized_payload_as_DeliveryRejected() { ... }

    @Test void surfaces_a_provider_outage_as_DeliveryUnavailable() { ... }

    @Test void honors_remaining_deadline_and_stops_new_attempts() { /* controlled transport/clock */ }

    @Test void is_safe_for_concurrent_use() { /* verify IDs, payload isolation, outcomes and cleanup */ }
}
```

Run the contract against each real backend or controlled provider harness. For a 200 ms deadline,
a 500 ms outer test timeout is only a harness guard: explicitly assert deadline propagation,
attempt scheduling, returned timeout outcome and local cleanup. Preemptive test interruption does
not prove that provider work stopped. Inject loss after provider acceptance and failure at batch
item N; require preserved earlier outcomes and unknown-effect reporting. No execution is claimed
for these sketches. See [JUnit timeout limitations](https://docs.junit.org/5.11.4/user-guide/index.html#writing-tests-assertions).

## Result

```text
Before                     After
─────────────────────────  ────────────────────────────────────
9 combined variants        6 variation types, plus shared scaffolding
digest logic ×3            digest logic ×1
channel choice via type    channel injected; configurable per user
"SMS cannot do receipts"   advertised capability prefilter plus
                            authoritative delivery validation
  handled nowhere
adding a channel: 3 files  adding a channel: 1 file + it inherits
                             the contract test
```

The one thing that got worse: reading `Notifier.send` no longer tells you what happens on the
wire. That is the trade every bridge makes, and it is acceptable here because the channel is
chosen by configuration rather than by the code path — which is exactly the condition under
which moving a dispatch out of sight pays (`gof-pattern-thinking`).
