# Deciding on Bridge

## The N×M test

Write the two axes as a grid and fill in the class names that exist or would exist.

```text
                 S3        LocalFile    SFTP
Encrypted    EncryptedS3  EncryptedFile  EncryptedSftp
Plain        PlainS3      PlainFile      PlainSftp
Compressed   ...          ...            ...
```

Three questions decide it:

1. **Which members and independent change pressures are evidenced?** Multiple members make
   the split visible; a concrete public-provider boundary may matter with one implementation.
   Without a second responsibility or boundary need, a field or Strategy is enough.
2. **Are they independent — is every cell meaningful?** If cells are illegal, see below.
3. **Will both keep growing?** If one axis is closed and small, a sealed set with an exhaustive
   `switch` may beat a second hierarchy.

These are evidence prompts, not mandatory counts. A concrete public boundary can justify one
current provider, a closed abstraction set can vary independently, and sparse legal combinations
can be encoded explicitly. Compare simpler composition rather than inventing future variants.

## Bridge against its neighbours

| Question                                                                     | Answer                    |
| ---------------------------------------------------------------------------- | ------------------------- |
| Both sides designed together, both hierarchies open                          | Bridge                    |
| One side already exists and is not yours; you are fitting it to an interface | Adapter (`gof-adapter`)   |
| One varying behaviour, no hierarchy on the abstraction side                  | Strategy (`gof-strategy`) |
| Several products that must come from the same family                         | Abstract Factory          |
| Same interface in and out, behaviour added                                   | Decorator                 |
| A hierarchy of things that contain each other                                | Composite                 |

The commonest confusion is Bridge/Strategy, and the discriminator is whether the _abstraction_
has variants of its own. `Notification` with `Alert`, `Digest` and `Receipt` subtypes, each
delivered over any `Channel`, is a bridge. One `Notification` class holding a `Channel` is
Strategy — and that is fine; it does not need a grander name.

Bridge/Adapter differ in intent, not authorship or timing. Bridge separates evolving roles;
Adapter translates an existing interface. Introducing a bridge while refactoring existing code
and implementing its backend ports with adapters is a normal combination.

## When the matrix has holes

Some combinations are meaningless under a particular contract: a report stream cannot fit a
single SMS payload, or an encrypted random-update store may require capabilities absent from an
append-only backend. Encryption alone does not require random access; name the actual operation.

Reject static illegal pairings at construction where possible. When legality depends on each
message or current configuration, validate before the side effect and keep authoritative validation
in the backend as needed; an earlier capability snapshot may be stale. Static options include:

```java
// 1. Enumerate the legal pairs at the composition root
static Notification alert(Severity s) {
    return new Alert(s.isCritical() ? sms : email);      // only legal channels reachable
}

// 2. Type the capability, so illegal pairs do not compile
interface Channel {}
interface StreamingChannel extends Channel { OutputStream open(); }

record StreamingReport(StreamingChannel channel) { }     // SmsChannel cannot be passed
```

The second is useful when capabilities are stable and few; the first when policy may change.
Static pair constraints belong where the pair is formed; per-input or changing constraints
still need validation at the operation that can enforce them.

If constraints dominate the matrix, compare an explicit set of named legal combinations.
Sparsity alone does not invalidate a useful separation; price its capability and validation cost.

## Designing the implementor interface

Design from required consumer operations and the costs/failures of the backends that must support
them. Preserve useful capabilities rather than reducing every provider to the weakest one:

**Granularity.** An interface with `boolean exists(Key)`, `byte[] read(Key)`, `void write(Key,
byte[])` can produce expensive repeated calls when the abstraction loops over ten thousand
remote keys. Inspect actual call patterns and available measurements; an adequate single lookup
does not need a batch API merely because it is remote. When batching is justified, define size,
partial-result and deadline semantics rather than assuming a loop is equivalent
(`rpc-and-api-contracts`).

**Failure.** A method that returns `void` and "cannot fail" locally will fail remotely. Decide up
front whether failure is an exception (with a documented transient/permanent split) or a result
type, and keep it uniform across backends (`java-exception-design`).

**Time.** Both local and remote work can block. Name the deadline/cancellation owner and what is
bounded: admission, new attempts, caller wait or actual local work. A deadline parameter or injected
policy can carry the contract; a timeout alone does not establish cleanup or undo a remote effect
(`timeouts-and-deadlines`).

Exercise ordinary and advanced consumer calls against the materially different backends before
committing the interface. Starting with a costly remote path can reveal missing constraints, but
does not replace the consumer contract or force every capability onto every implementation.

## The leak that ends a bridge

```java
// the abstraction reaching around its own interface
if (backend instanceof S3Backend s3) {
    s3.setStorageClass(GLACIER);          // now the abstraction knows a backend
}
```

Once this appears, adding a backend means editing the abstraction, which is the exact cost the
bridge was paying indirection to avoid. The fix is one of:

- Add the concept to the interface, if every backend can meaningfully answer it
  (`Backend.durability(Durability)`, only if the promised durability can actually be met).
- Move the decision to construction: the caller who knows it is S3 configures it when wiring.
- Expose a separate capability contract to consumers that need it, with explicit unsupported cases.
- Reconsider the boundary if it has no independent role; do not delete it merely because one
  backend has an extra operation.

Choosing the first without checking that other backends can implement it honestly is how an
implementor interface acquires methods that half its implementations throw from — the beginning
of the same erosion.

## The contract test

Backends drift unless one test enforces the interface's promises against all of them:

This sketch assumes shared, thread-safe backends that bound their own execution. A confined/session
contract instead needs affinity and ownership tests; a caller-owned deadline needs propagation and
attempt/lifetime checks. Test the declared promises, not a stronger contract borrowed from this example.

```java
abstract class ChannelContractTest {
    protected abstract Channel channel();

    @Test void delivers_and_reports_the_message_id() { ... }
    @Test void rejects_an_oversized_payload_with_PayloadTooLarge() { ... }
    @Test void is_safe_for_concurrent_use() { ... }
    @Test void bounds_its_own_execution_time() { ... }
}

class EmailChannelTest extends ChannelContractTest { ... }
class SmsChannelTest   extends ChannelContractTest { ... }
```

An inherited test specification or a parameterized contract fixture can share these checks. Use the
project's conventions and exercise relevant pair interactions as well; reused assertions do not
establish all cross-product behavior or prove a real provider from a fake.
