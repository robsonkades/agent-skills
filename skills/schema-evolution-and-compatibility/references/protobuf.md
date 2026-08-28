# Protobuf

Coordinates. Runtime `com.google.protobuf:protobuf-java:4.32.0` — **every _verified_ transcript below
was run on 4.32.0** and on no other version. `4.36.0` is the newest on Central and resolves, but no
behaviour here was re-measured on it. Code generation `io.github.ascopes:protobuf-maven-plugin:3.1.0`
(the ubiquitous `org.xolstice.maven.plugins:protobuf-maven-plugin:0.6.1` was last released in 2018
and needs a `protoc` artefact or binary). Everything below uses `DynamicMessage` over
programmatically built descriptors, so the results are the runtime's rather than a generated class's.

**Check before pairing versions with a Confluent serialiser.** Current Confluent documentation states
that `kafka-protobuf-serializer` works with Protobuf v3 and that "Google Protobuf v.4 is currently
not supported", while protobuf-java has been on 4.x since 2024. That combination was **not tested**
here — it is either stale documentation or a real constraint, and it decides whether any 4.x pin
works in a Confluent stack at all.

## The field number is the identity

Nothing else on the wire identifies a field; names exist only in the `.proto` and in the JSON
mapping. "Changing field numbers for any existing field is not safe." `reserved` is what makes
removal safe:

```proto
message User {
  reserved 2, 15, 9 to 11;      // "Reserved ranges are inclusive."
  reserved "email", "nickname"; // "(affects TextProto/JSON parsing)"
}
```

Reserve the **number** to stop the wire-level catastrophe and the **name** to stop the JSON-level
one. Both, every time, in the commit that deletes the field.

## Safe, unsafe and lossy, verbatim from the language guide

**Wire-safe**: "Adding new fields is safe"; "Removing fields is safe"; "Adding additional values to
an enum is safe"; "Changing a single explicit presence field or extension into a member of a **new**
`oneof` is safe"; "Changing a `oneof` which contains only one field to an explicit presence field is
safe".

**Wire-unsafe**: "Changing field numbers for any existing field is not safe"; "Moving fields into an
existing `oneof` is not safe".

**Wire-compatible but information-losing**: `int32`, `uint32`, `int64`, `uint64` and `bool` are
mutually compatible; `sint32` ↔ `sint64` are compatible with each other but **not** with the other
integer types; `string` ↔ `bytes` "if bytes are valid UTF-8"; `fixed32` ↔ `sfixed32`; `fixed64` ↔
`sfixed64`; `map<K,V>` ↔ the corresponding `repeated` message field (quoted from the spec, not
tested here).

Confluent's derived rules add three of its own: a field number may be reused by a new field **of the
same type** but not of a different type; `enum` is interchangeable with `int32`/`uint32`/`int64`/
`uint64` on the same field; and singular ↔ repeated is compatible **for string, bytes and message
fields only** — "Note that this is not generally safe for numeric types, including bool and enum.
Repeated fields of numeric types can be serialized in the packed format, which will not be parsed
correctly when a singular field is expected." Both halves verified:

```text
repeated string ["a","b"]  read as singular string  -> "b"        (last wins)
packed repeated int32 [1,2] = 0a 02 01 02
                           read as singular int32   -> unset (0), bytes in unknownFields[1]
```

The numeric case fails silently and completely: the reader sees `0` and no exception.

## Presence: the "did they send 0 or nothing?" bug class

> **Optional fields**: "the field is set, and contains a value that was explicitly set or parsed from
> the wire. It will be serialized to the wire" or "the field is unset, and will return the default
> value. It will not be serialized to the wire."
> **Implicit fields** (non-message): "the field is set to the default (zero) value. It will not be
> serialized to the wire. In fact, you cannot determine whether the default … value was set or parsed
> from the wire or not provided at all."

Verified:

```text
implicit int32:  explicit 0 -> 0 bytes on the wire, hasField() = false
proto3 optional: explicit 0 -> 2 bytes (08 00), hasField(explicit 0) = true, hasField(absent) = false
```

Message-typed fields always have presence, `optional` or not, because a submessage's absence is
representable. Generated shapes:

| Declaration                   | Accessors                                                      | `hasX()`                 |
| ----------------------------- | -------------------------------------------------------------- | ------------------------ |
| `int32 n = 1;` (implicit)     | `getN()`, `setN()`, `clearN()`                                 | **no**                   |
| `optional int32 n = 1;`       | the above plus `hasN()`                                        | yes                      |
| `Address a = 1;` (message)    | `getA()`, `hasA()`, `setA()`, `clearA()`, `mergeA()`           | yes, always              |
| `repeated string t = 1;`      | `getTList()`, `getTCount()`, `getT(i)`, `addT()`, …            | n/a (`getTCount() == 0`) |
| `Status s = 1;` (proto3 enum) | `getS()` — may be `UNRECOGNIZED` — and **`getSValue()`** → int | no                       |

Adding `optional` to an existing implicit field only adds `hasN()` for readers and is wire-identical
for every non-zero value. It changes serialisation of the zero value, which is the point.

## Type changes that corrupt, and how quietly — verified

Writer value `300` (or `"hi"`), reader descriptor differing only in that field's type. The declared
promotions first, then nine type changes:

```text
int32  -> int64    bytes=08 ac 02        -> value=300      unknown=[]   (clean, the declared promotion)
int32(-1) -> int64 bytes=08 ff...01      -> value=-1       unknown=[]   (clean; 10-byte varint)

int32  -> sint32   bytes=08 ac 02        -> value=150      unknown=[]
int32  -> uint32   bytes=08 ac 02        -> value=300      unknown=[]
int32  -> bool     bytes=08 ac 02        -> value=true     unknown=[]
sint32 -> int32    bytes=08 d8 04        -> value=600      unknown=[]
fixed32 -> float   bytes=0d 2c 01 00 00  -> value=4.2E-43  unknown=[]
string -> bytes    bytes=0a 02 68 69     -> value="hi"     unknown=[]

fixed32 -> int32   bytes=0d 2c 01 00 00  -> value=0        unknown=[1]
int32  -> string   bytes=08 ac 02        -> value=""       unknown=[1]
int32  -> double   bytes=08 ac 02        -> value=0.0      unknown=[1]
```

**Two distinct failures, and the dangerous one is the quiet one.** Nothing throws in either case.

- **Same wire type, different interpretation** — the middle block. The reader gets a **plausible
  wrong value**: zigzag decoding turns `int32(300)` into `sint32` 150, and the same bytes read as
  `float` become 4.2E-43. `unknownFields` is **empty**, so the unknown-field metric is blind to it.
  `int32`↔`uint32`↔`bool` and `string`↔`bytes` are the sanctioned members of this set and are not
  bugs; `int32`↔`sint32` and `fixed32`↔`float` are the same mechanism used by accident. The only
  defence for either is a golden-bytes assertion on the decoded **value**.
- **Different wire type** — the last block. The typed accessor returns the zero value and the bytes
  land in `unknownFields`, so a consumer that changed `int32 amount = 3` to `string amount = 3` reads
  every message as `""`, logs nothing, and _is_ visible to the metric.

## Reusing a field number — verified

Field 5 was `string email`; it is deleted, and later 5 is reused for `Address address`. Both are wire
type 2, so the parser attempts the reinterpretation:

```text
payload "\nabc"           inner = 0a 61 62 63      -> InvalidProtocolBufferException: While parsing a
                                                      protocol message, the input ended unexpectedly
payload "\n\u0003abc"     inner = 0a 03 61 62 63   -> address { street: "abc" }  <-- valid, wrong data
payload "bob@example.com" inner = 62 6f 62 40 ...  -> InvalidProtocolBufferException
```

`"\n\u0003abc"` is `field 1, wire type 2, length 3, "abc"` — a perfectly well-formed `Address`. The
four-byte `"\nabc"` is not: `0a` selects field 1 / wire type 2 and the **next** byte is read as the
length, so `0x61` = 97 overruns the two remaining bytes and it throws. The length byte has to be
physically present, which is why the payload that survives is five bytes, not four. Which outcome you
get therefore depends on the _content_ of the old value, and is decided per record — which is why
a test suite built on synthetic data passes.

## Unknown fields: dropped in 3.0, restored in 3.5.0

> "Unknown fields are now preserved in proto3 for most of the language implementations for proto3 by
> default." Java: "Proto3 messages are now preserving unknown fields by default. If you'd like to
> drop unknown fields, please use the DiscardUnknownFieldsParser API." — v3.5.0 release notes.

Verified byte-identical on 4.32.0:

```text
new bytes      = 08 05 12 05 68 65 6c 6c 6f      (field 1 = 5, field 2 = "hello")
parsed by an OLD descriptor holding only field 1, then re-serialised:
old round trip = 08 05 12 05 68 65 6c 6c 6f      identical = true, unknown = [2]
after DiscardUnknownFieldsParser = 08 05         (field 2 gone)
```

So a proxy, enricher or router that parses and re-emits does not destroy fields it does not know —
on ≥ 3.5. Two exceptions on any version: unknown fields are lost if you "Serialize a proto to JSON",
or if you copy field-by-field instead of using "message-oriented APIs, such as `CopyFrom()` and
`MergeFrom()`". Proto2 has always preserved them, so the 3.0–3.4 gap is a proto3-only story.

## Enums

> "In languages that support open enum types with values outside the range of specified symbols, such
> as C++ and Go, the unknown enum value is simply stored as its underlying integer representation. In
> languages with closed enum types such as Java, a case in the enum is used to represent an
> unrecognized value."

That case is `UNRECOGNIZED`, generated only for an open (proto3) enum. From
`protocolbuffers/protobuf` `v32.0` `src/google/protobuf/compiler/java/full/enum.cc`:

```cpp
// line 118
printer->Print("${$UNRECOGNIZED$}$(-1),\n", ...);
// lines 171-189, getNumber()
"  if (this == UNRECOGNIZED) {\n"
"    throw new java.lang.IllegalArgumentException(\n"
"        \"Can't get the number of an unknown enum value.\");\n"
// lines 255-268, getValueDescriptor()
"  if (this == UNRECOGNIZED) {\n"
"    throw new java.lang.IllegalStateException(\n"
```

`forNumber(int)` returns `null` for an unknown number. The raw number survives the wire regardless:
verified, a `DynamicMessage` parse of enum number 9 against a two-symbol enum yields
`UNKNOWN_ENUM_VALUE_Status_9` and re-serialises to the identical `08 09`. The Java generated-code
guide does not document `getNumber()`'s behaviour for `UNRECOGNIZED`; the codegen source above is the
only primary statement of it.

Also from the spec: the first defined enum value "must be 0", conventionally
`ENUM_TYPE_NAME_UNSPECIFIED`.

## `oneof` and proto2 `required`

Only two `oneof` transitions are safe: a single explicit-presence field into a **new** `oneof`, and a
one-field `oneof` back into an explicit-presence field. Everything else is a minefield — "Moving
fields into an existing `oneof` is not safe"; "You may lose some of your information (some fields
will be cleared) after the message is serialized and parsed". The mechanism is that setting one
member clears the others, so two independently settable fields become mutually exclusive and a
message that legitimately had both loses one on the next round trip. Splitting and merging oneofs
have the same problem.

Proto2 `required` is a one-way door in both directions: you cannot add it (old writers omit the
field) and you cannot remove it (old readers reject messages lacking it). "**Required Is
Forever** — Required fields should be treated as permanent, immutable elements of the message
definition." The guide also notes that an unrecognised enum value is treated as _missing_, which then
fails the required check. The only exit is a new field number declared `optional`, dual-write,
migrate, and eventually a new message type; enforce the requirement in the application layer instead.
