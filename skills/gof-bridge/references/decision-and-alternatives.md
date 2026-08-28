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

1. **Do both axes have ≥2 members today?** If not, there is one axis and the answer is a field
   or a Strategy.
2. **Are they independent — is every cell meaningful?** If cells are illegal, see below.
3. **Will both keep growing?** If one axis is closed and small, a sealed set with an exhaustive
   `switch` may beat a second hierarchy.

Only "yes, yes, yes" justifies Bridge. Two of three usually justifies composition without the
second hierarchy, which is the same code with a less imposing name.

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

The second commonest is Bridge/Adapter, and the discriminator is authorship and timing. Bridge is
planned; Adapter is retrofitted. A bridge whose implementors are all adapters over foreign
libraries is a normal and healthy combination — JDBC is precisely that.

## When the matrix has holes

Some combinations are meaningless: a `StreamingReport` cannot be delivered over `SmsChannel`; an
`EncryptedStore` cannot use a backend with no random access.

Do not solve this with a runtime check inside the abstraction — that makes an illegal object
constructible, and the failure appears far from the wiring that caused it. Two better options:

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

The second is better when the capability is stable and few; the first when the rule is policy
that may change. Either way, the constraint lives where the pair is formed, not inside the
abstraction.

If most cells are holes, there is no bridge: the axes are not independent, and the design wants
an explicit closed set of the combinations that exist.

## Designing the implementor interface

The interface must be usable by its **worst** implementation, not its most convenient one. Three
rules, each learned by breaking them:

**Granularity.** An interface with `boolean exists(Key)`, `byte[] read(Key)`, `void write(Key,
byte[])` is fine over a local file system and catastrophic over object storage when the
abstraction loops over ten thousand keys. If any backend may be remote, the interface needs a
bulk operation from the start; adding one later means every caller must be revisited
(`rpc-and-api-contracts`).

**Failure.** A method that returns `void` and "cannot fail" locally will fail remotely. Decide up
front whether failure is an exception (with a documented transient/permanent split) or a result
type, and keep it uniform across backends (`java-exception-design`).

**Time.** A local backend returns in microseconds; a remote one may not return. Either the
interface carries a deadline parameter, or every implementation is required to bound itself and
say so. Silence on this point is how one slow backend exhausts a caller's thread pool
(`timeouts-and-deadlines`).

A useful discipline: write the remote backend's signature first, then check the local one is
still natural. The reverse order produces an interface that must be broken later.

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
  (`Backend.durability(Durability)`, with a documented no-op).
- Move the decision to construction: the caller who knows it is S3 configures it when wiring.
- Accept that this abstraction has one backend after all, and delete the interface.

Choosing the first without checking that other backends can implement it honestly is how an
implementor interface acquires methods that half its implementations throw from — the beginning
of the same erosion.

## The contract test

Backends drift unless one test enforces the interface's promises against all of them:

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

This is one of the few places where an inheritance-based test base class is clearly right: the
subclasses supply a value and inherit a specification, and adding a promise to the contract makes
every non-conforming backend fail at once. Without it, the abstraction's guarantees hold only for
the backend that was in front of the developer.
