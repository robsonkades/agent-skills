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
byte-array/buffer view: (byte[] or ByteBuffer, int byteOffset) -> primitive
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

### Byte views depend on the runtime and backing storage

JDK 23 removed stronger access modes for byte-array views and heap-buffer views. These methods
still exist: compiling for Java 17 does not restore their former behavior on a newer runtime.
Inspect the factory, runtime, backing storage and byte offset; an offset is not an element index.

| Factory/coordinate on JDK 23+                | Access condition                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `byteArrayViewVarHandle`                     | Only plain `get/set`; stronger modes throw `UnsupportedOperationException`                                        |
| `byteBufferViewVarHandle` with a heap buffer | Only plain `get/set`; stronger modes throw `IllegalStateException`                                                |
| The same buffer handle with a direct buffer  | Stronger modes require an aligned address and support for the carrier/mode; also check bounds and read-only state |

`isAccessModeSupported` can be true for the buffer handle while a particular heap or misaligned
coordinate fails. Test representative coordinates as well as inspecting support. For an `int`
direct-buffer view, byte offsets 0 and 1 on a suitably aligned buffer exercise different alignment
conditions. Retain the publication contract: choose suitable typed storage, aligned direct storage
with its lifecycle cost, or another synchronized design. Catching an access exception and switching
to plain reads/writes loses the required ordering. For a retained older runtime, use its own factory
contract rather than retroactively imposing the JDK 23 restrictions.

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
the expected comparison), not the domain object's `equals`. Field and array handles for `float`
and `double` compare raw bits. Consequently, `+0.0f` does not match expected `-0.0f`, although Java
`==` says they are equal. Conversely, matching NaN representations can permit an update although
Java `==` says the witness and expected values differ.

For these handles, check a float compare-and-exchange witness with
`Float.floatToRawIntBits(witness) == Float.floatToRawIntBits(expected)`; use
`Double.doubleToRawLongBits` for double. `floatToIntBits`/`doubleToLongBits` canonicalize NaNs and
can hide distinct representations, as can boxed equality. Preserve the API's caveat that NaN
representations can change on some platforms; test the values actually carried through the
operation. A failed signed-zero match and a successful same-representation NaN match are useful
checks for a wrapper that returns a derived success flag. Do not reread the variable to infer
whether an earlier update succeeded: another writer may already have changed it.

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
- [JDK 23 removal of aligned heap-view access modes](https://www.oracle.com/java/technologies/javase/23-relnote-issues.html#JDK-8318966)
- [Java 17 factories](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/invoke/MethodHandles.html) — older aligned-access contract; inspect the actual target runtime.
- [Field VarHandle lookup](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/MethodHandles.Lookup.html) — floating-point comparison and representation caveats.
- [Float bit conversions](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Float.html) — raw versus canonical NaN representation; double provides corresponding conversions.
- [Foreign memory layouts](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/MemoryLayout.html)
