# The shape decision

Read at step 4, once the header mode is pinned and the per-element size is computed.

The question this answers: _"we are about to store N of these — should it be a record, a
final class, a primitive array, four parallel primitive arrays, or a map?"_ — asked before
any code exists, with no duplicates to share, no heap dump to read and no symptom to
diagnose. If the framing is instead _many duplicates of a small distinct set_, that is
`gof-flyweight`'s question and interning beats every shape below.

**Environment.** Temurin **25.0.3+9**, Windows x64, `-Xmx6g`, JOL `jol-core:0.17`,
`GraphLayout.totalSize()`, N = 1,000,000, both header modes on the same build `[executed]`.
Payload in every row is the same four fields: `long a, long b, int c, int d` — 24 bytes of
actual data. Boxed keys and values are all ≥ 0 with values offset by N, deliberately spanning
well past the `Integer` cache.

## 1. The measured table

| Shape                                   | Classic total | B/elem     | Compact total | B/elem    |
| --------------------------------------- | ------------- | ---------- | ------------- | --------- |
| four parallel arrays `long[]×2 int[]×2` | 24,000,064    | **24.00**  | 24,000,064    | **24.00** |
| `Rec[]` (`record`, array of refs)       | 44,000,016    | 44.00      | 36,000,016    | 36.00     |
| `Cls[]` (`final class`, array of refs)  | 44,000,016    | 44.00      | 36,000,016    | 36.00     |
| `ArrayList<Rec>` (presized)             | 44,000,040    | 44.00      | 36,000,040    | 36.00     |
| `HashMap<Long,Rec>`                     | 104,388,672   | **104.39** | 80,388,664    | **80.39** |

And the two-`int` case, where the shape choice is starkest:

| Shape                      | Classic total | B/elem    | Compact total | B/elem    |
| -------------------------- | ------------- | --------- | ------------- | --------- |
| two `int[]`                | 8,000,032     | **8.00**  | 8,000,032     | **8.00**  |
| `HashMap<Integer,Integer>` | 72,388,672    | **72.39** | 64,388,664    | **64.39** |

### At 32 GB and above, past the compressed-oops threshold

Both tables above are measured at `-Xmx6g`. A reference costs 8 bytes rather than 4 past the
threshold, which widens every object-per-element row and leaves the columnar floor untouched.
Re-measured at `-Xmx40g`, same build `[executed]`:

| Shape                       | Classic B/elem | Compact B/elem |
| --------------------------- | -------------- | -------------- |
| four parallel arrays        | **24.00**      | **24.00**      |
| `Rec[]` / `Cls[]`           | 48.00          | 40.00          |
| `ArrayList<Rec>` (presized) | 48.00          | 40.00          |
| `HashMap<Long,Rec>`         | 120.78         | 104.78         |
| two `int[]`                 | **8.00**       | **8.00**       |
| `HashMap<Integer,Integer>`  | 88.78          | 88.78          |

**The columnar answer gets stronger, not weaker.** Parallel arrays cost 24.00 at either oop
size because they hold no references at all — neither the elements nor the backing arrays —
while the record array goes from 83% overhead to 100%. Columnar's advantage over `Rec[]` grows
from **1.83× to 2.00×**. So a shape decision taken on a small heap _understates_ the case for
columnar layout on a large one, and a population large enough to ask the question is often
what pushes the heap past the threshold in the first place.

`HashMap<Integer,Integer>` is the starkest row: **88,777,296 → 88,777,288**, an 8-byte saving
on 88 MB. Above the threshold compact object headers do essentially nothing for a boxed map at
any size — the same conclusion §3 of `compact-object-headers.md` reaches at N = 1000, holding
three orders of magnitude up.

## 2. What the table says

**Parallel primitive arrays are the floor, and they are exactly the payload.** 24.00 bytes
per element against 24 bytes of data: the four array headers are amortised across a million
elements and vanish into the third decimal place. Nothing beats this, and nothing needs to —
the question is what the other shapes buy for their overhead.

**A record costs exactly what a final class costs.** 44.00 versus 44.00, byte for byte, in
both modes. `record` is not a footprint optimisation and is not a footprint pessimisation;
it is the same object with the same header, the same field ordering and the same alignment.
Choose it for its semantics. Anyone proposing to _unroll_ a record into a class to save
memory is proposing a no-op — measure it and show them the two identical numbers.

**The object-per-element shapes cost 83% overhead under classic headers, 50% under compact.**
44 bytes to carry 24 is the price of identity: a 12-byte header, a 4-byte alignment gap, and
a 4-byte reference in the backing array. Compact headers remove the header hole and take it
to 36 — a genuine 18% cut, and one of the cases where the flag really does pay, because this
payload's `p mod 8 = 0` (see `compact-object-headers.md` §1).

**`ArrayList<Rec>` is `Rec[]` plus 24 bytes.** Presized, it is the array. Not presized, its
backing array grows by 1.5× and can be up to 50% larger than needed — measure
`GraphLayout.totalSize()` on the real thing, not on a presized model, if capacity is not
controlled.

**A `HashMap` costs four times its payload, and boxing is most of it.**
`HashMap<Integer,Integer>` is **9.0×** two `int[]` under classic headers and **8.0×** under
compact. That is not a tuning problem; it is a shape problem. The components at N = 1000
(`compact-object-headers.md` §3) show where every byte goes: the `Node[]` table, one 32-byte
`Node` per entry, and two 16-byte boxes per entry that compact headers do not touch at all.

## 3. The break-even, which is where the intuition goes wrong

"Drop the object, use a primitive array" is right at N = 1,000,000 and **wrong at N = 1**.
The array amortises one header across `n` elements; below a certain `n` it is pure loss,
because the array pays a 4-byte length field the object does not.

For a four-`long` payload `[executed]`, 25.0.3 and 26.0.2 agreeing:

| Shape                 | Classic | Compact |
| --------------------- | ------- | ------- |
| `record Rec4(long×4)` | 48      | **40**  |
| `long[4]`             | 48      | **48**  |

A tie under classic headers, and the **record wins by 8 bytes (17%)** under compact ones —
the JDK 27 default `[source-only: JEP 534, Closed / Delivered, Release 27]`. The reason is in
`array-and-object-arithmetic.md` §2: an 8-byte element type has an array base offset of 16 in
_both_ modes, so `long[]` and `double[]` shrink by nothing, ever.

This generalises, and the generalisation is the useful part. Record of `n` fields versus the
equivalent `n`-element primitive array, `[executed]` on 25.0.3, both modes:

| n   | `int[n]` / record of n ints | `long[n]` / record of n longs |
| --- | --------------------------- | ----------------------------- |
|     | classic → compact           | classic → compact             |
| 1   | 24/**16** → 16/16           | 24/24 → 24/**16**             |
| 2   | 24/24 → 24/**16**           | 32/32 → 32/**24**             |
| 3   | 32/**24** → 24/24           | 40/40 → 40/**32**             |
| 4   | 32/32 → 32/**24**           | 48/48 → 48/**40**             |
| 5   | 40/**32** → 32/32           | —                             |

**In all 18 comparisons the record is never larger than the array, and under compact headers
it is strictly smaller in six of nine.** So _"replace this small record with a primitive
array to drop a header"_ is never a footprint win at fixed, small field count — it is a tie
at best and an 8-byte loss at worst, and it trades away every field name for that.

The break-even is therefore not about object size at all. It is about **how many headers the
array replaces**:

- **One object → one array of its fields:** never worth it. Tie or loss, in both modes.
- **N objects → one array per field (columnar / parallel arrays):** worth it, and this is the
  whole win — 44 → 24 bytes per element at N = 1,000,000, because you replaced a million
  headers with four.

The general form: an object-per-element shape costs `alignUp(header + payload, 8) + 4` bytes
per element (the reference in the backing array); the columnar shape costs `payload` plus a
per-array constant. The saving is `header + hole + ref` per element, and it does **not grow
with the payload**: under classic headers and compressed oops it stays between **16 and 23
bytes per element** for every payload from 0 to 400 bytes, set entirely by `payload mod 8`
(minimum at 4, maximum at 5, and 20 for the `p = 24` shape measured above). That is why it
scales with N and not with field count.

## 4. The costs that are not bytes

This skill answers footprint. It does not answer whether the footprint answer should win, and
a recommendation that ignores the following is not a recommendation:

- **Parallel arrays destroy the type.** Four `long[]` with a shared index is not a `Txn`; it
  is a convention that every call site must uphold. There is no compiler check that index `i`
  in `amounts` and index `i` in `accountIds` describe the same transaction, and nothing stops
  one array being resized without the others. Domain-modelling skills own this trade; the
  bytes here are one input to it.
- **The columnar shape is a rewrite, not a refactor.** Every read site changes. The 20 bytes
  per element it saves are worth 800 MB at 40 M elements and nothing at 40 K.
- **`ClassLayout` is shallow.** Every deep number on this page came from
  `GraphLayout.totalSize()`. A shape holding `String` fields will have a deep footprint
  several times its shallow one — `new String("EUR")` is 24 shallow and 48 deep `[executed]`.
  Measure the shape you will actually store.
- **Nothing here is a performance measurement.** Be precise about the causal claim too, since
  footprint per object, allocated byte rate, live-set bytes and RSS are four different
  quantities. Halving object size at a constant object count reduces live-set bytes and
  allocated bytes but not allocation _count_. Fewer live bytes reduce marking and evacuation
  work for a collector whose cost tracks the live set; young-collection frequency falls only
  if the allocated byte rate falls with it, and either effect can be zero. Neither is measured
  here, and no JMH benchmark was run. If the argument for the change is speed rather than
  headroom, it needs a benchmark — `java-performance`'s territory, not this one.

## 5. The answer shape

Report, in this order:

1. **N**, stated. Without it there is no answer, only a per-object size.
2. **Payload bytes** — the fields, summed, before any header.
3. **The table**: each candidate shape, total at N and bytes per element, in **both** header
   modes, with the build and tool named.
4. **The overhead ratio** per shape (bytes per element ÷ payload bytes). 1.00 is the floor.
5. **The break-even N** at which the cheapest shape stops being worth its cost in type safety
   and rewrite effort — usually where the saving crosses a container memory limit or a
   compressed-oops boundary, both of which are `jvm-memory-regions`' and
   `jvm-performance-review`'s questions respectively.
6. **The measurement that would falsify it**: `GraphLayout.totalSize()` over the real
   population, on the target build, under the target header mode.
