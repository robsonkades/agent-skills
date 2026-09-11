# The shape decision

Read when equivalent representation choices or their population-level footprint are the question.

The question this answers: _"we are about to store N of these — should it be a record, a
final class, a primitive array, four parallel primitive arrays, or a map?"_ — asked before
any code exists, with no duplicates to share, no heap dump to read and no symptom to
diagnose. If the framing is instead _many duplicates of a small distinct set_, that is
`gof-flyweight`'s question: evaluate sharing, lookup overhead and retention there.

**Historical environment.** Temurin **25.0.3+9**, Windows x64, `-Xmx6g`, JOL `jol-core:0.17`,
`GraphLayout.totalSize()`, N = 1,000,000, both header modes on the same build `[executed]`.
Payload in every row is the same four fields: `long a, long b, int c, int d` — 24 bytes of
actual data. Boxed keys and values are all ≥ 0 with values offset by N, deliberately spanning
well past the `Integer` cache.

The tables use compressed class pointers and alignment 8, with compressed oops except for
the explicitly wide-reference comparison. Recompute from effective widths/alignment on the
target; no historical table alone requires replacing an adequate representation.

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

### With 8-byte oops at alignment 8

Both tables above were measured at `-Xmx6g`. In this comparison effective references are
8 bytes rather than 4, widening these object-per-element rows while leaving primitive
array payloads unchanged. Historically re-measured at `-Xmx40g`, same build `[executed]`:

| Shape                       | Classic B/elem | Compact B/elem |
| --------------------------- | -------------- | -------------- |
| four parallel arrays        | **24.00**      | **24.00**      |
| `Rec[]` / `Cls[]`           | 48.00          | 40.00          |
| `ArrayList<Rec>` (presized) | 48.00          | 40.00          |
| `HashMap<Long,Rec>`         | 120.78         | 104.78         |
| two `int[]`                 | **8.00**       | **8.00**       |
| `HashMap<Integer,Integer>`  | 88.78          | 88.78          |

**The byte saving grows for these shapes.** Parallel arrays cost 24.00 at either oop
size because they hold no references at all — neither the elements nor the backing arrays —
while the record array goes from 83% overhead to 100%. Columnar's advantage over `Rec[]` grows
from **1.83× to 2.00×**. This says nothing by itself about whether the required operations,
encapsulation and memory budget justify a columnar representation. Include any required
wrapper or index in the comparison, and read oop width rather than inferring it from heap size.

`HashMap<Integer,Integer>` is the starkest row: **88,777,296 → 88,777,288**, an 8-byte saving
on 88 MB. Above the threshold compact object headers do essentially nothing for this Integer map at
any size — the same conclusion §3 of `compact-object-headers.md` reaches at N = 1000, holding
three orders of magnitude up.

## 2. What the table says

**Parallel primitive arrays are the floor, and they are exactly the payload.** 24.00 bytes
per element against 24 bytes of data: the four array headers are amortised across a million
elements and vanish into the third decimal place. This is the floor among these uncompressed,
full-width representations, not an information-theoretic limit: bounded domains may admit
packing/compression, with their own access/update costs. Compare equivalent required operations;
two arrays do not supply HashMap lookup semantics without an additional algorithm or index.

**The matched record and final class cost the same here.** 44.00 versus 44.00, byte for byte,
in both modes, with the same field set and VM layout conditions. A record/class label alone
does not predict a saving; different inherited/injected fields, padding or target layouts
need their own comparison. Keep an adequate representation and choose record semantics deliberately.

**The object-per-element shapes cost 83% overhead under classic headers, 50% under compact.**
44 bytes to carry 24 is the price of identity: a 12-byte header, a 4-byte alignment gap, and
a 4-byte reference in the backing array. Compact headers remove the header hole and take it
to 36 — a genuine 18% cut, and one of the cases where the flag really does pay, because this
payload's `p mod 8 = 0` (see `compact-object-headers.md` §1).

**`ArrayList<Rec>` is `Rec[]` plus 24 bytes.** Presized, it is the array. Not presized, its
backing array grows by 1.5× and can be up to 50% larger than needed — measure
`GraphLayout.totalSize()` on the real thing, not on a presized model, if capacity is not
controlled.

**The map rows pay for nodes, spare table capacity and boxes as well as payload.**
`HashMap<Integer,Integer>` is **9.0×** two `int[]` under classic headers and **8.0×** under
compact. That ratio identifies a candidate saving only when the required lookup/update
operations and memory budget justify a different representation. The components at N = 1000
(`compact-object-headers.md` §3) show where every byte goes: the `Node[]` table, one 32-byte
`Node` per entry, and two 16-byte boxes per entry that compact headers do not touch at all.

## 3. The break-even, which is where the intuition goes wrong

For these layouts, replacing many object headers with a few arrays saves bytes, whereas
replacing one object with one equal-payload array does not.
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
_both_ measured modes. This conclusion assumes those base offsets and alignment; at alignment
16 the four-long record and `long[4]` tie at 48 bytes in both modes (§6 of the arithmetic reference).

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
array to drop a header"_ is not a footprint win in these fixed-field, full-width layouts — it is a tie
at best and an 8-byte loss at worst, and it trades away every field name for that.

The break-even is therefore not about object size at all. It is about **how many headers the
array replaces**:

- **One object → one array of the same full-width primitive fields:** no footprint win in
  these tested shapes; other semantics or representations require a fresh comparison.
- **N objects → one array per field (columnar / parallel arrays):** footprint can fall, and this is the
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

- **Unencapsulated parallel arrays expose a coordination convention.** There is no compiler check that index `i`
  in `amounts` and index `i` in `accountIds` describe the same transaction, and nothing stops
  one exposed array being resized without the others. An encapsulating type can coordinate
  lengths, mutation and access behind a stable API; verify its invariants and count its costs.
  Domain semantics and ownership remain requirements of the chosen representation.
- **Migration cost depends on the exposed contract.** An internal representation change may
  preserve every public read site; exposed arrays or object identity can make it much broader. The 20 bytes
  per element it saves are worth 800 MB at 40 M elements and 0.8 MB at 40 K; whether the
  latter matters depends on the actual budget.
- **`ClassLayout` is shallow.** Every deep number on this page came from
  `GraphLayout.totalSize()`. A shape holding `String` fields will have a deep footprint
  several times its shallow one — `new String("EUR")` is 24 shallow and 48 deep `[executed]`.
  Measure the shape you will actually store.
- **Nothing here is a performance measurement.** Be precise about the causal claim too, since
  footprint per object, allocated byte rate, live-set bytes and RSS are four different
  quantities. Halving object size at a constant object count reduces live-set bytes and
  allocated bytes but not allocation _count_ at unchanged lifetimes and operation rates.
  Marking often tracks object/reference counts, so shrinking primitive payload or headers
  need not reduce it; copying and collection frequency depend on collector behavior, budget
  and allocation rate. Either benefit can be zero. Neither is measured
  here, and no JMH benchmark was run. If the argument for the change is speed rather than
  headroom, it needs a benchmark — `java-performance`'s territory, not this one.

## 5. The answer shape

For a shape decision, return the relevant comparison below. For a narrow size explanation or
adequate existing design, give the conditional arithmetic or no-change verdict and specific
limits; do not manufacture a migration, a population, or a full comparison matrix.

1. **N**, when a total is requested. If unknown, report bytes per element or a formula in N.
2. **Payload bytes** — the fields, summed, before any header.
3. **The relevant candidates**: total at N and bytes per element, with build/method and
   effective layout assumptions. Compare both header modes when that affects this decision. Unsupported modes are explicitly
   source-derived models, not a reason to upgrade the target.
4. **The overhead ratio** per shape (bytes per element ÷ payload bytes), when payload is
   nonzero. 1.00 is the full-width uncompressed payload baseline for these comparisons.
5. **The decision threshold**, if a change is being considered: required headroom, equivalent
   operations and actual implementation/migration cost. A useful threshold can involve a
   container limit or an encoding boundary, which are `jvm-memory-regions`' and
   `jvm-performance-review`'s questions respectively.
6. **Evidence that supports or could refute the estimate**: for example a bounded
   `GraphLayout.totalSize()` check under the target conditions when its uncertainty matters.
