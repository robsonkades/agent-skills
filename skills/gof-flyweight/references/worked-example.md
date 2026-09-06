# Worked example: bounded canonicalisation during ingest

Hypothetical Java 17 reconciliation job: 40 million records each contain currency,
counterparty, product, narrative and date fields. Counts below are workload assumptions,
not a measured incident or benchmark. Snippets are partial; Txn and split are application types.

## Establish the opportunity

```text
field             occurrences     assumed distinct values
currency            40 M                    7
counterpartyId      40 M                  412
productCode         40 M                1 830
narrative           40 M           38 000 000
```

Occurrences are references, not necessarily distinct objects. Inspect a representative heap dump
for existing sharing, backing arrays, lengths and lifetimes before estimating savings. Do not sum
overlapping retained sizes as disjoint shallow sizes. Allocation profiles show construction rates,
not how many duplicates remain live together.

If every field occurrence owns a distinct String, these fields imply 160 M String objects. A lower
observed count refutes that assumption. The first three fields are sharing candidates; narrative
offers little duplication. Evaluate supported GC string deduplication separately: it shares backing
arrays, not String objects. Its saving overlaps whole-string canonicalisation; do not add both
estimates blindly.

## Bound admission at the boundary

```java
final class TxnParser {
    // One parser per parsing thread and load; release parser after parsing.
    private static final int MAX_VALUES = 4096;
    private final Map<String, String> currencies = new HashMap<>();
    private final Map<String, String> counterparties = new HashMap<>();
    private final Map<String, String> products = new HashMap<>();

    Txn parse(String line) {
        var f = split(line); // validate field count, lengths and domain values
        return new Txn(canon(currencies, f[3]), canon(counterparties, f[4]),
            canon(products, f[5]), f[6], LocalDate.parse(f[7]));
    }

    private static String canon(Map<String, String> pool, String raw) {
        java.util.Objects.requireNonNull(raw);
        String existing = pool.get(raw);
        if (existing != null) return existing;
        if (pool.size() >= MAX_VALUES) return raw; // preserve value; bypass new admission
        pool.put(raw, raw);
        return raw;
    }
}
```

The cap is illustrative. Bound input lengths too: entry counts do not bound bytes for arbitrarily
long keys. Observed low cardinality is not a validated closed domain. Reject invalid business data
at parsing, but do not reject otherwise valid records because the optimization reaches its cap.
Record cap hits to expose cardinality changes.

All map operations are confined to the parser thread; this compound check/put is unsafe if shared.
Four parsers can retain four canonical copies per value. Merging their maps afterwards does not
rewrite references in existing records. Usually accept that duplication; if global sharing matters,
measure a shared factory or an explicit record-rewriting pass and its associated costs.

Dropping the parser releases map nodes while records retain the strings they use. For descriptors,
include tenant and other semantic dimensions in the key; equal text does not imply equal authority.

## Repeated date parsing

A bounded, thread-confined map from validated date text to LocalDate can avoid repeated parsing.
Preserve strictness, locale and normalization contracts. With 400 distinct texts among 40 M
occurrences, a fully admitted single-parser map requires about 400 parses, not zero. Compare saved
construction CPU with lookup costs before claiming a benefit.

## Preserve equality across pool boundaries

```java
String a = new String("EUR");
String b = new String("EUR");
assert a != b;
assert a.equals(b);
```

Matching must use value equality before and after canonicalisation. Test two parsers and the
admission-cap path; correctness must not depend on shared identity. Literal-only fixtures conceal
this bug. An implementation test may assert reuse within a pool to verify the optimization without
making identity an application contract.

## Acceptance evidence and alternatives

Run the same representative load before and after; report live bytes, distinct object counts,
allocation rate, CPU, wall time, GC phases and peak map entries/bytes. Include workload,
JDK/collector/flags and repeat variability. Reconsider if lookup/retention costs outweigh savings.
No performance result has been measured for this example.

If whole-record distinctness is 0.94, only 6% can be eliminated: compare those bytes with table and
composite-key overhead before pooling Txn objects. CPU in computeIfAbsent alone does not establish
bin-lock contention; seek separate contention evidence.

Dictionary indexes are another option: seven currencies fit an unsigned byte encoding, but 1,830
products require a wider type. Narrowing fields may not change aligned object size. Columnar arrays
remove per-record headers at the cost of a representation change; measure layout and migration cost.
Off-heap storage belongs to `off-heap-memory` when evidence justifies its lifecycle complexity.
