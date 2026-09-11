# Access-mode selection and API matrix

## Decision tree

An existing-handle or dynamic-coordinate question can justify API analysis without an optimization
benchmark. Retain an adequate stronger mode; weaken only for a stated objective with sufficient
ordering proof.

```text
Can volatile/Atomic*/lock/concurrent utility express the contract clearly?
  yes -> prefer it unless coordinates/interoperability or a justified optimization need lower-level control
  no  -> identify exact variable, coordinates and supported modes

Only one-direction publication through one carrier?
  -> release write + acquire read may suffice if the read observes the intended publication
Need coherent polling of one variable without carrying other data?
  -> opaque may suffice under a written outcome proof
Need volatile total-order semantics across synchronization actions/variables?
  -> volatile access
Need atomic conditional/update operation?
  -> choose CAS/exchange/RMW variant and success/failure ordering explicitly
```

Plain access is appropriate after another proven synchronization edge or under confinement. Do not
add acquire to every data field after acquiring one publication anchor.

## Access families

| Family             | Methods                                                      | Important result/semantics                              |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------- |
| reads              | `get`, `getOpaque`, `getAcquire`, `getVolatile`              | variable value with increasing ordering strength        |
| writes             | `set`, `setOpaque`, `setRelease`, `setVolatile`              | write with selected order                               |
| conditional update | `compareAndSet`, `weakCompareAndSet*`, `compareAndExchange*` | boolean versus witness; spurious weak failure           |
| exchange           | `getAndSet*`                                                 | previous value with asymmetric acquire/release variants |
| numeric            | `getAndAdd*`                                                 | supported numeric types/modes only                      |
| bitwise            | `getAndBitwiseAnd/Or/Xor*`                                   | supported boolean/integral types and modes              |
| fences             | acquire/release/full/load-load/store-store                   | ordering constraint without variable access             |

Read exact method documentation. Acquire/release update variants are asymmetric: the read and write
sides do not both receive the strongest mode named.

## Coordinates and types

Examples of coordinate shapes:

```text
instance field: (DeclaringClass) -> T
static field: () -> T
array element: (T[], int) -> T
memory layout: (MemorySegment, long, ...open path coordinates) -> carrier
```

Call-site types are checked dynamically because access methods are signature-polymorphic. Default
invoke behavior can adapt types as MethodHandle.asType permits; exact behavior cannot. For example,
an int-field handle can return a boxed Object with default behavior, but that return descriptor
fails under withInvokeExactBehavior. Generic wrappers must deliberately select their contract.
Validate alignment, byte order, segment
lifetime/thread access and supported modes for foreign-memory handles under their owning APIs.
These layout coordinates use Java 25's final FFM API, not earlier incubator signatures. A successful
CAS does not extend an arena lifetime or prove exclusive ownership; closure/reclamation and ABA
remain separate protocol obligations.

## Mixed access ledger

For each variable in a shared-state protocol, record the relevant paths. This ledger is not a
mandatory new artifact for an isolated invocation-type explanation:

| Code path          | Read/write/update | Mode | Required relation | Test |
| ------------------ | ----------------- | ---- | ----------------- | ---- |
| initialization     |                   |      |                   |      |
| normal publisher   |                   |      |                   |      |
| normal consumer    |                   |      |                   |      |
| reset/reuse        |                   |      |                   |      |
| error/cancel/close |                   |      |                   |      |
| diagnostic/admin   |                   |      |                   |      |

Direct Java volatile access, VarHandle mode, Unsafe/native/foreign access, serialization/reflection
and field declaration can coexist. The proof must cover actual access paths. An unaccounted path
leaves the safety argument unresolved; missing evidence alone is not an observed unsafe execution.

## Comparison operations

For reference variables, expected/witness comparison follows VarHandle method semantics (`==` for
the expected comparison). For floating values and bitwise behavior, read the exact API wording and
test NaN/zero representations if relevant. Never infer equality semantics from a domain object's
`equals`.

CAS selection questions:

```text
Does success publish prior data? -> release or volatile success side
Does success consume observed data? -> acquire or volatile read side
Does failure need acquire observation of witness/current state?
Can spurious failure be retried safely and observably?
Is witness required to avoid another read?
Can expected value recur (ABA), wrap, or be reclaimed/reused?
```

## Authoritative references

- [Java 25 `VarHandle`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/VarHandle.html)
- [`MethodHandles` VarHandle factories](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/MethodHandles.html)
- [Foreign memory layouts](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/MemoryLayout.html)
