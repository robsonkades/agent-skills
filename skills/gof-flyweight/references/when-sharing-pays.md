# When sharing pays

## The arithmetic

Work it out before writing code. The following is only an illustrative HotSpot layout with
compressed class/object references and 8-byte alignment; confirm it with JOL or a heap dump:

```text
Object header                     12 bytes  (mark + compressed class word)
Reference field                    4 bytes
Alignment                          to 8 bytes

record Currency(String code)      12 + 4 = 16 bytes, plus the String
String "EUR"                      String object 24 B + byte[] 16+3→24 B ≈ 48 B
HashMap node/table/key            implementation- and load-factor-dependent
```

Two consequences that decide most cases:

- **Sharing an object smaller than a map entry loses.** Interning `Integer`s outside the JDK's
  cache range, or objects of one or two fields, costs more in cache overhead than it saves —
  unless the same instance is referenced thousands of times, so the entry is amortised.
- **The saving is per _reference_, not per value.** 40 million records each holding a distinct
  `String` costs 40 M × 48 B ≈ 1.9 GB. If there are 300 distinct values, canonicalising leaves
  40 M references (already paid for, inside the record) plus 300 × 48 B — a saving of essentially
  the whole 1.9 GB. That ratio, occurrences ÷ distinct values, is the number that decides.

There is no portable ratio threshold. Compute `(avoided duplicate bytes) - (canonical table,
keys and retained-lifetime cost)` and include lookup CPU and contention. Large values can pay at
low ratios; tiny values can lose even at much higher ratios.

## The JDK's own flyweights, and their limits

| Mechanism                               | Shared set                      | Limit to know                                                           |
| --------------------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| `Integer.valueOf`                       | −128..127 (upper bound tunable) | `==` works inside the range and fails outside it                        |
| `Boolean.valueOf`                       | `TRUE`, `FALSE`                 | `new Boolean(...)` defeats it and is deprecated for that reason         |
| String literals                         | JVM string table                | Equal literals are interned; identity is still the wrong value contract |
| `String.intern()`                       | JVM-managed string table        | Retention, lookup and sizing behavior vary by JDK/collector             |
| Enum constants                          | One per constant                | The closed-set case, and the best one                                   |
| `List.of()` / `Collections.emptyList()` | One shared empty instance       | Only for empty                                                          |

`String.intern()` deserves specific caution: modern HotSpot keeps interned strings in the Java
heap, while the table and its tuning/rehash behavior are JVM-version details. Interning millions
of request-derived distinct values can increase retention and lookup/GC work. An application map
is not automatically better, but it can express scope, bounds and eviction explicitly.

## Alternatives that usually win

**GC string deduplication.** On collectors/JDKs that support it, `-XX:+UseStringDeduplication`
can make equal `String`s share backing arrays in the background. It needs no application cache,
but consumes deduplication table memory and concurrent GC CPU, and the `String` objects remain.
Evaluate it as a reversible experiment; do not promise a fixed fraction of recovered memory.

**Canonicalisation at the boundary.** Intern once, where data enters, rather than everywhere it
is used:

```java
// at the parser, not at every use site
private final Map<String, String> canonical = new HashMap<>();   // single-threaded parser

String canon(String raw) { return canonical.computeIfAbsent(raw, Function.identity()); }
```

This gets the whole saving with a map that is confined to one thread and can be dropped when the
load finishes — no long-lived global pool, no contention, no leak.

**Do not store the object at all.** Millions of records holding a `Currency` can hold a `byte`
index into a small table. This is the largest saving available and it is not a flyweight; it is a
representation change.

```text
40 M records × 4 B reference   = 160 MB
40 M records × 1 B index       =  40 MB   (+ a 300-entry table)
```

**Columnar layout.** Where the population is processed in bulk rather than individually, parallel
primitive arrays remove per-object headers entirely: 40 M objects of three fields cost ~1.9 GB in
headers and padding alone; three primitive arrays cost the data.

**An enum.** When the distinct set is closed and known at compile time, an enum gives sharing,
identity comparison that is actually safe, exhaustive `switch`, and no cache.

## Measuring, before and after

```text
Before
  heap dump under representative load
  group by class and by value; find the duplicate-heavy types
  record: live set size, count and retained size of the candidate class,
          distinct-value count

Change
  canonicalise at the boundary

After
  same measurement, same workload
  also: allocation rate, GC pause distribution, and CPU spent in the
        pool's lookup (a profile, not an assumption)
```

Report all of it. A change that halves the live set but adds 4% CPU in `computeIfAbsent` on a
contended map may still be right — but that is a decision, and it cannot be made from the memory
number alone (`heap-dump-analysis`, `gc-log-analysis`, `jfr-and-async-profiler`).

## Failure modes

**The unbounded intern map.** Keyed by values derived from requests — customer references, URLs,
message ids — it grows without limit and is a leak by construction. The symptom is a slow rise in
old-generation occupancy that survives every full GC. Bound it, key it on a closed set, or scope
it to the operation.

**Contention on the pool.** `ConcurrentHashMap.computeIfAbsent` atomically installs a mapping and
may coordinate callers contending for the same key/bin; the exact mechanism is JDK-specific. An
expensive mapping function stalls peers, while recursive updates can throw or violate assumptions.
Keep it short, side-effect-free and non-recursive, then profile the expected key distribution.

**Mutation of a shared instance.** The failure that is a security incident rather than a bug: a
flyweight carrying tenant-scoped data, mutated by one request, read by another. The only reliable
defence is that the shared type is deeply immutable and enforced as such.

**Accidental identity dependence.** Code that starts comparing with `==` because "they are
shared" works until a value falls outside the cached set or an entry is evicted. The `Integer`
127/128 boundary is the canonical demonstration and the reason to test with values on both sides
of any cache limit.

**Pooling short-lived objects.** The inverse pattern, and still common. Object pooling promotes
objects that would have died in the nursery into long-lived state, adds a synchronisation point,
and reintroduces the lifecycle bugs (use-after-return, dirty state) that garbage collection
removed. Pool only what is genuinely expensive to create and expensive to hold — connections,
threads, direct buffers — never plain domain objects (`gc-fundamentals`).
