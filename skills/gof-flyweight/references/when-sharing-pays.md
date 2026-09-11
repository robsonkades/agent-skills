# When sharing pays

## The arithmetic

Work it out before writing code. The following is only an illustrative HotSpot layout with
conventional headers, compressed class/object references and 8-byte alignment; confirm it with
JOL or a heap dump for the actual build/options (`object-layout-and-footprint`):

```text
Object header                     12 bytes  (mark + compressed class word)
Reference field                    4 bytes
Alignment                          to 8 bytes

record Currency(String code)      12 + 4 = 16 bytes, plus the String
String "EUR"                      String object 24 B + byte[] 16+3→24 B ≈ 48 B
HashMap node/table/key            implementation- and load-factor-dependent
```

The String estimate assumes compact Latin-1 storage as in OpenJDK 17, not a portable layout:
[OpenJDK 17 GA String source](https://github.com/openjdk/jdk/blob/jdk-17-ga/src/java.base/share/classes/java/lang/String.java).

Two consequences that decide most cases:

- **Map entries must be amortised.** Small objects need enough avoided retained duplicates to
  cover table/key costs; there is no fixed object size or repetition threshold.
- **Count distinct backing objects too.** Under that layout, 40 million distinct `String` wrappers
  each owning a separate three-byte Latin-1 array cost 40 M × 48 B ≈ 1.9 GB. If there are 300
  distinct values, canonicalising leaves
  40 M references (already paid for, inside the record) plus 300 × 48 B — a saving of essentially
  the whole 1.9 GB before pool overhead. Distinct wrappers alone do not establish that cost:
  OpenJDK 17's `new String(existingString)` shares its backing array. Deduplication or an earlier
  sharing boundary may already share arrays; count each reachable allocation once. Canonicalising
  an already constructed input can reduce retention without reducing its allocation rate.

There is no portable ratio threshold. Compute `(avoided duplicate bytes) - (canonical table,
keys and retained-lifetime cost)` and include lookup CPU and contention. Large values can pay at
low ratios; tiny values can lose even at much higher ratios.

## The JDK's own flyweights, and their limits

| Mechanism                               | Shared set                 | Limit to know                                                           |
| --------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| `Integer.valueOf`                       | At least −128..127         | More caching is permitted; never assume 128 misses                      |
| `Boolean.valueOf`                       | `TRUE`, `FALSE`            | Constructors are deprecated for removal since Java 9; use the factory   |
| String literals                         | JVM string table           | Equal literals are interned; identity is still the wrong value contract |
| `String.intern()`                       | JVM-managed string table   | Retention, lookup and sizing behavior vary by JDK/collector             |
| Enum constants                          | One per constant           | The closed-set case, and the best one                                   |
| `List.of()` / `Collections.emptyList()` | Empty values may be reused | No identity assumption; List.of instances are value-based               |

`String.intern()` deserves specific caution: modern HotSpot keeps interned strings in the Java
heap, while the table and its tuning/rehash behavior are JVM-version details. Interning millions
of request-derived distinct values can increase retention and lookup/GC work. An application map
is not automatically better, but it can express scope, bounds and eviction explicitly.

## Alternatives to compare

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

This shares duplicates encountered by that parser. Drop the map when the load finishes, but cap
admission or validate a closed domain: high cardinality can exhaust memory within a single load.

**Use a compact representation.** A dictionary index can replace each reference. An unsigned byte
encoding supports at most 256 values; 300 values require a wider index such as short. Include
reserved codes and validation. This changes representation, not just object sharing.

```text
40 M records × 4 B reference   = 160 MB
40 M entries × 2 B short index =  80 MB   (+ a 300-entry table)
```

**Columnar layout.** Where the population is processed in bulk rather than individually, parallel
primitive arrays remove per-record headers. Under the illustrative 12-byte header, 40 M objects
have 480 MB of header bytes before padding; total size depends on fields and layout. Arrays still
have headers and alignment. Narrowing one field may not change aligned object size at all.

**An enum.** When the distinct set is closed and known at compile time, an enum gives sharing,
identity comparison that is actually safe, exhaustive `switch`, and no cache.

For a reusable library descriptor, separate its documented immutable value from per-use state:
Java's [Pattern contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/regex/Pattern.html)
permits concurrent sharing of a `Pattern`, while mutable `Matcher` state must stay confined to one
use at a time. Do not mistake
an internally maintained library cache for mutable application state, or a final reference for
proof that caller-visible mutable data is safe to share.

## Measuring, before and after

```text
Before
  heap dump under representative load
  group by class and by value; find the duplicate-heavy types
  record: live set size, count and retained size of the candidate class,
          distinct-value count

Change, if justified
  apply the selected sharing or representation change

After
  same measurement, same workload
  also: allocation rate, GC pause distribution, and CPU spent in the
        pool's lookup (a profile, not an assumption)
```

Report all of it. A change that halves the live set but adds 4% CPU in `computeIfAbsent` on a
contended map may still be right — but that is a decision, and it cannot be made from the memory
number alone (`heap-dump-analysis`, `gc-log-analysis`, `jfr-and-async-profiler`).

## Failure modes

**The unbounded intern map.** Persistent retention of arbitrary customer references, URLs or
message ids can grow without limit. Confirm the retaining path, distinctness and intended lifetime;
old-generation growth alone does not prove a leak. Bound admission/bytes, validate a closed domain,
or scope it to the operation with a peak budget. A bounded cache can still leave evicted values
live through callers, and fresh instances may coexist with them.

**Contention on the pool.** `ConcurrentHashMap.computeIfAbsent` atomically installs a mapping and
may coordinate callers contending for the same key/bin; the exact mechanism is JDK-specific. An
expensive mapping function stalls peers, while recursive updates can throw or violate assumptions.
Keep it short, side-effect-free and non-recursive, then profile the expected key distribution.

**Mutation or wrong semantic scope.** A flyweight carrying tenant-scoped data can expose one
request's state to another. Preserve immutable intrinsic values for this design and include
tenant/configuration-dependent meaning in the key or keep it extrinsic; immutability
alone does not make cross-tenant reuse valid.

**Accidental identity dependence.** Code that starts comparing with `==` because "they are
shared" can fail after eviction or across pools. Use separately created equal strings for a
deterministic test; Integer 128 may also be cached.

**Pooling short-lived objects.** The inverse pattern, and still common. Object pooling can extend
otherwise short lifetimes, add lookup or shared-pool synchronization, and introduce lifecycle bugs
such as use-after-return or dirty state. Consider reuse for expensive resources with explicit
ownership and capacity. Plain-object
reuse needs measured benefit and a lifecycle correctness argument; flyweight does not imply it.

Sources: [Integer.valueOf contract](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Integer.html#valueOf(int)>)
and [List factory contracts](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/List.html).
