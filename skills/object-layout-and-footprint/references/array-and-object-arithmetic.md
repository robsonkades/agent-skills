# Array and object arithmetic

Read at step 2, whenever a size is being computed rather than measured.

**Environment for every executed figure on this page.** Temurin **25.0.3+9** (Windows x64),
**26.0.2+10** (Linux x64, `eclipse-temurin:26-jdk`) and **21.0.12+8** (Linux x64,
`eclipse-temurin:21-jdk`); JOL `org.openjdk.jol:jol-core:0.17`, `ClassLayout.instanceSize()`;
every value in the classic-header column reproduced identically on all three builds, and
every compact-header value on 25.0.3 and 26.0.2. All 32 array sizes in §3 were independently
confirmed by an `Instrumentation.getObjectSize` agent on 25.0.3 in both modes — the two
mechanisms never disagreed. JDK 21 has no compact-header mode at all: `-XX:+UseCompactObjectHeaders`
gives `Unrecognized VM option 'UseCompactObjectHeaders'` and the JVM refuses to start
`[executed]`. **JDK 27 is not installed and nothing here was executed on it.**

## 1. Header composition

Classic layout, the default on JDK 21, 25 and 26 `[executed]` — from
`ClassLayout.parseInstance(new byte[1]).toPrintable()` on 25.0.3:

```text
OFF  SZ   DESCRIPTION
  0   8   (object header: mark)
  8   4   (object header: class)     <- compressed klass pointer
 12   4   (array length)             <- arrays only; int, always 4 bytes
 16   1   byte [B.<elements>
 17   7   (object alignment gap)
Instance size: 24 bytes
```

Compact object headers `[executed]`, same class, same JVM, one flag:

```text
OFF  SZ   DESCRIPTION
  0   8   (object header: mark)      <- mark and klass fused into one word
  8   4   (array length)
 12   1   byte [B.<elements>
 13   3   (object alignment gap)
Instance size: 16 bytes
```

So: instance header **12 → 8**, and the array length field stays 4 bytes and simply moves.

`-XX:-UseCompressedClassPointers` widens the klass word to 8 bytes: header 16, array base
offsets **20** for ≤4-byte elements and **24** for 8-byte elements. It also emits
`Option UseCompressedClassPointers was deprecated in version 25.0` and
`CDS will be disabled` `[executed]`, and it forces compact headers off (see
`compact-object-headers.md` §4). It is not a configuration to design for; it is a
configuration to recognise in someone else's artefact — by these sizes, all `[executed]` on
25.0.3, JOL and `Instrumentation.getObjectSize` agreeing:

| Object         | Default | `-UseCompressedClassPointers` |
| -------------- | ------- | ----------------------------- |
| `new Object()` | 16      | 16                            |
| `Integer`      | 16      | **24**                        |
| `record Point` | 24      | 24                            |
| `byte[0]`      | 16      | **24**                        |
| `byte[1..4]`   | 24      | 24                            |
| `int[1]`       | 24      | 24                            |
| `long[1]`      | 24      | **32**                        |
| `Object[1]`    | 24      | 24                            |
| `AllTypes`     | 48      | **56**                        |

The tell is an empty array at 24 and `Integer` at 24 with compressed oops still on. The
flag's lifecycle is `jvm-performance-review`'s.

## 2. The base offsets, read off the VM rather than assumed

JOL's own VM report, 25.0.3 `[executed]`:

```text
default:  # Array base offsets:    16,   16,   16,   16,   16,   16,   16,   16,   16
+COH:     # Array base offsets:    12,   12,   12,   12,   12,   12,   12,   16,   16
                                  ref  bool  byte  char  shrt   int   flt   lng   dbl
```

Identical output on 26.0.2 `[executed]`. This single line is the whole compact-header array
asymmetry: **12 for every element of 4 bytes or less, 16 for every 8-byte element.** The four
bytes freed from the header are spent on a pad that keeps 8-byte elements 8-byte aligned.

**`ref` is only a 4-byte element while compressed oops are on.** At 32 GB and above it
is 8 bytes and `Object[]` moves into the second group. JOL's report at `-Xmx40g` with compact
headers `[executed]`, 25.0.3 and 26.0.2:

```text
# Compressed references (oops): disabled
# Field sizes:            8,    1,    1,    2,    2,    4,    4,    8,    8
# Array base offsets:    16,   12,   12,   12,   12,   12,   12,   16,   16
                        ref  bool  byte  char  shrt   int   flt   lng   dbl
```

So at 32 GB and above **`Object[]` behaves exactly like `long[]` and shrinks by nothing at any
length** — measured `Object[0..8]` = 16/24/32/40/48/56/64/72/80, identical in both header
modes. Every bolded `Object[n]` saving in §3 is a compressed-oops figure.

## 3. Per-length array sizes

`ClassLayout.instanceSize()`, both modes, **at `-Xmx6g` with compressed oops on**, reproduced
identically on 25.0.3 (Windows x64) and 26.0.2 (Linux x64), and cross-checked by
`Instrumentation.getObjectSize` on 25.0.3 `[executed]`. `dflt` is the JDK 21/25/26 default;
`COH` is the JDK 27 default. The three primitive columns hold at any heap size; the
`Object[n]` column holds only under compressed oops — see §2.

| n   | `byte[n]` dflt/COH | `int[n]` dflt/COH | `long[n]` dflt/COH | `Object[n]` dflt/COH |
| --- | ------------------ | ----------------- | ------------------ | -------------------- |
| 0   | 16 / 16            | 16 / 16           | 16 / 16            | 16 / 16              |
| 1   | 24 / **16**        | 24 / **16**       | 24 / 24            | 24 / **16**          |
| 2   | 24 / **16**        | 24 / 24           | 32 / 32            | 24 / 24              |
| 3   | 24 / **16**        | 32 / **24**       | 40 / 40            | 32 / **24**          |
| 4   | 24 / **16**        | 32 / 32           | 48 / 48            | 32 / 32              |
| 5   | 24 / 24            | 40 / **32**       | 56 / 56            | 40 / **32**          |
| 8   | 24 / 24            | 48 / 48           | 80 / 80            | 48 / 48              |
| 9   | 32 / **24**        | 56 / **48**       | 88 / 88            | 56 / **48**          |

Three consequences:

1. **No array of 8-byte elements ever shrinks under compact object headers, at any length.**
   Not "shrinks less" — by zero, from n = 0 upward. That is `long[]` and `double[]` always,
   and `Object[]` too once compressed oops are off. This is the fact that reverses the
   record-versus-array comparison (SKILL.md headline).
2. **The saving for other element types is non-monotonic in length.** `int[3]` saves 8,
   `int[4]` saves 0, `int[5]` saves 8. Any statement of the form "compact headers save about
   8 bytes per array" is wrong. The saving is 8 exactly when
   `alignUp(16 + n·s, 8) ≠ alignUp(12 + n·s, 8)` — that is, when `(n·s) mod 8` is 1, 2, 3 or
   4 — and 0 otherwise. Note this is the **complement** of the rule for a plain instance;
   see `compact-object-headers.md` §1.
3. **`byte[1]` through `byte[8]` all cost 24 bytes** by default. Seven of the 24 bytes of a
   one-byte array are padding. A field-level `byte[]` per record is almost always the wrong
   shape for that reason alone.

## 4. Field ordering, measured

A class declaring one field of each of the nine types, in this source order:

```java
class AllTypes { Object ref; boolean z; byte b; char c; short s; int i; float f; long l; double d; }
```

Actual layout `[executed]`, 25.0.3, `ClassLayout.parseInstance(...).toPrintable()`:

| Offset | Classic headers | Compact headers |
| ------ | --------------- | --------------- |
| 0      | mark (8)        | mark (8)        |
| 8      | klass (4)       | `long l`        |
| 12     | **`int i`**     | —               |
| 16     | `long l`        | `double d`      |
| 24     | `double d`      | `int i`         |
| 28     | —               | `float f`       |
| 32     | `float f`       | `char c`        |
| 34     | —               | `short s`       |
| 36     | `char c`        | `boolean z`     |
| 37     | —               | `byte b`        |
| 38     | `short s`       | 2-byte gap      |
| 40     | `boolean z`     | `Object ref`    |
| 41     | `byte b`        | —               |
| 42     | 2-byte gap      | —               |
| 44     | `Object ref`    | 4-byte gap      |
| **Σ**  | **48**          | **48**          |

What this establishes:

- **Source order is discarded.** Fields are grouped by descending size, with **references
  placed last**.
- **The grouping does not start at the first slot under classic headers.** The JVM hoists a
  4-byte field into the 12–15 header hole, ahead of the 8-byte group: `int i` sits at offset
  12, before `long l` at 16. So `false-sharing-and-contended`'s description — "longs and
  doubles first, then ints and floats, … then references" — is confirmed by this measurement
  for **compact** headers and for everything after the header gap under classic ones, and
  **refuted as a statement about the first slot** under classic headers. Both files are
  reading the same JVM; the neighbour's version omits the hoist.
- `AllTypes` is the instructive **zero** saving, and the obvious explanation is wrong: no hole
  migrated. Its 2-byte internal hole exists in both modes (JOL: `2 bytes internal`, both). The
  34 field bytes make `alignUp(8 + 34, 8)` and `alignUp(12 + 34, 8)` both 48, so the four
  freed header bytes end up as **external** padding at offset 44 — the object never changed
  size class.

So you can compute a **size** from source, and you cannot compute an **offset** from source.
If an offset matters — it does for cache-line contention, which is
`false-sharing-and-contended` — it must be read from a JOL listing.

The algorithm producing these offsets is `FieldLayoutBuilder`
(`hotspot/share/classfile/fieldLayoutBuilder.cpp`), introduced by JDK-8237767 "Field layout
computation overhaul", fix version 15 (JBS, confirmed). Everything measured here — descending
size groups, references last, the 4-byte field hoisted into the classic header gap, subclass
fields filling superclass holes (§5) — is that builder's output; layouts from a pre-15 JDK
follow a different algorithm and must not be carried forward (not verified here — no pre-15
build available). The offsets above were reproduced this pass with
`Unsafe.objectFieldOffset` on 25.0.3, JOL-free: `int i @ 12` under classic headers,
`long l @ 8` under compact ones.

## 5. Superclass gap filling

`[executed]`, 25.0.3, both modes:

```java
class SuperLong { long only; }
class SubInt extends SuperLong { int f; }
```

| Class       | Classic | Compact |
| ----------- | ------- | ------- |
| `SuperLong` | 24      | **16**  |
| `SubInt`    | 24      | **24**  |

Under classic headers `SubInt` is free: `f` lands in the superclass's 12–15 hole, so the
subclass costs exactly what its parent costs. Under compact headers that hole does not
exist, so the same field costs a full 8 bytes.

**Compact object headers can shrink a superclass by 8 bytes while leaving its subclass
exactly the same size.** A footprint estimate built from "every object loses 8 bytes" gets
this pair 50% wrong in one direction and 100% wrong in the other.

This pair is also the reason the saving rule in `compact-object-headers.md` §1 takes the
**plain** field sum and no padding term. `SuperLong` has a 4-byte hole and still saves 8; its
field sum of 8 predicts that, and 8 + 4 would predict 0. Holes are an output of the layout,
never an input to the arithmetic.

(`-XX:+CompactFields`, obsolete in 15 and expired in 16, and `-XX:-UseEmptySlotsInSupers`,
removed in 23, are both absent from `PrintFlagsFinal` on 25.0.3 `[executed]`. Their lifecycle
is `jvm-performance-review`'s; the behaviour above is what remains after them.)

## 6. `ObjectAlignmentInBytes` as a per-object cost

Raising object alignment extends the compressed-oops heap range. `jvm-performance-review`
owns that decision. What belongs here is the per-object price, so the trade is computable
`[executed]`, 25.0.3:

| Object                  | align 8 | align 16 | align 16 + COH |
| ----------------------- | ------- | -------- | -------------- |
| `new Object()`          | 16      | 16       | 16             |
| `record Point(int,int)` | 24      | **32**   | **16**         |
| `record Rec4(long×4)`   | 48      | 48       | 48             |
| `long[4]`               | 48      | 48       | 48             |

`Point` costs **+8 bytes (+33%)** at alignment 16 — 20 bytes of content in a 32-byte slot,
12 bytes of external padding. For a heap dominated by small objects that can cost more than
the 4 bytes per reference the wider range saves. Compute both sides before recommending the
flag to anyone; a population of `Rec4` pays nothing, a population of `Point` pays a third.

`-XX:ObjectAlignmentInBytes=16` together with `-XX:+UseCompactObjectHeaders` is accepted
silently on 25.0.3 and both take effect `[executed]` — note `Point` at 16 bytes in the last
column, which is smaller than either flag achieves alone.

What alignment 16 does to the small arrays and boxes that dominate a real heap, `[executed]`
25.0.3, agent and JOL agreeing: `Long` 24 → **32**, `byte[1..8]` 24 → **32**, `int[1]`
24 → **32**, `long[1]` 24 → **32**, `String` object 24 → **32**, `ArrayList` 24 → **32**;
`Integer`, `Object`, `HashMap$Node` and `Rec4` unchanged. Every object whose default size is
`≡ 8 (mod 16)` pays 8 bytes; roughly half a typical heap does. The accepted range is
`[8 … 256]` and a power of two — 4 and 512 are refused at start-up `[executed]`; the
compressed-oops boundary it buys is `4 GB × alignment`, measured at 16 as `-Xmx60g` on and
`-Xmx64g` off (`production-footprint-checks.md` §2). Under compact headers the narrow klass
shift drops from 10 to 9 with alignment 16 `[executed]`, which changes nothing on this page.

## 7. The worked method, end to end

For `record Txn(long id, long accountId, int amount, int currencyCode)`, JDK 25 default
headers, wanted at N = 40,000,000:

```text
fields   = 8 + 8 + 4 + 4                = 24        <- plain sum; never add padding
instance = alignUp(12 + 24, 8)          = 40 bytes
array    = alignUp(16 + 40M × 4, 8)     = 160,000,016 bytes   (Txn[] of references)
total    = 40M × 40 + 160,000,016       = 1,760,000,016 bytes ≈ 1.64 GiB
```

You never need to know where the holes are to get the size right — `alignUp(header + Σ field
sizes, 8)` was exact for **650 generated classes** in both header modes `[executed]`, with no
hole term. Holes matter for **offsets**, which is §4.

Confirm before believing it: `ClassLayout.parseInstance(new Txn(1,1,1,1)).instanceSize()`
must return 40, and `GraphLayout.parseInstance(array).totalSize()` must return the total.
The prediction is what transfers to the next class; the measurement is what stops the
prediction being wrong. Do both.

Under compact headers the same record is `alignUp(8 + 24, 8)` = **32 bytes**, and the total
falls to ≈ 1.34 GiB — a real 18% saving, because this record's fields happen to leave no hole
for the freed bytes to fall into. `references/compact-object-headers.md` is where you check
whether yours does.
