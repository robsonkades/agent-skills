# Collectors and purity

## Why purity is a correctness property, not a style

```java
List<String> skus = new ArrayList<>();
orders.stream()
      .filter(Order::isActive)
      .forEach(o -> skus.add(o.sku()));      // works... sequentially, today
```

Three things are wrong with this beyond taste:

- **It is not safe if the stream ever becomes parallel.** `ArrayList` is not thread-safe;
  adding `.parallel()` produces lost elements or `ArrayIndexOutOfBoundsException`, not an
  error message about concurrency.
- **It invalidates the stream contract.** The implementation may elide stages or stop early
  where the terminal result permits it; a side effect makes observable behaviour depend on
  traversal details the API intentionally does not promise.
- **It hides the result.** The written form of the operation is "collect the SKUs of active
  orders", which the pipeline should state directly:

```java
List<String> skus = orders.stream().filter(Order::isActive).map(Order::sku).toList();
```

The rule that follows: intermediate operations compute values; accumulation happens in the
terminal operation, through a collector that knows how to combine partial results.

## Choosing a collector

| Need                                 | Collector                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| Unmodifiable list, encounter order   | `Stream.toList()` or `Collectors.toUnmodifiableList()`                              |
| List with no mutability guarantee    | `Collectors.toList()`                                                               |
| Mutable list the caller will modify  | `Collectors.toCollection(ArrayList::new)`                                           |
| Set, no duplicates                   | `toSet()` / `toUnmodifiableSet()`; `toCollection(LinkedHashSet::new)` to keep order |
| Map, keys unique **and enforced**    | `toMap(key, value)`; duplicate keys fail                                            |
| Map, duplicate keys are valid        | `toMap(key, value, explicitMergePolicy)`                                            |
| Map preserving encounter order       | `toMap(key, value, merge, LinkedHashMap::new)`                                      |
| Group into lists                     | `groupingBy(classifier)`                                                            |
| Group into something else            | `groupingBy(classifier, downstream)`                                                |
| Partition into true/false            | `partitioningBy(predicate)` — always exactly two keys                               |
| Count, sum, average, min/max         | `counting()`, `summingLong()`, `averagingDouble()`, `minBy()`                       |
| All numeric statistics in one pass   | `summarizingLong(...)` or `mapToLong(...).summaryStatistics()`                      |
| Two different aggregates in one pass | `teeing(collector1, collector2, merger)`                                            |
| Join strings                         | `joining(", ", "[", "]")`                                                           |

## The toMap traps

```java
Map<String, Order> byCustomer = orders.stream()
    .collect(toMap(Order::customerId, identity()));
// IllegalStateException: Duplicate key CUST-1 (attempted merging values Order[...] and Order[...])
```

- **No merge function means duplicate keys violate an invariant.** Keep that overload when
  uniqueness is required: silently choosing first/last can corrupt meaning. Supply `(a, b) -> b`,
  `(a, b) -> a`, or a domain merge only when duplicates are valid and encounter-order semantics
  make the choice deterministic enough for the use case. Pre-validate or throw a domain-specific
  error when the default diagnostic is insufficient.
- **A null value throws NPE**, because `toMap` accumulates through `Map.merge`, which forbids
  null values. This surprises people who expect `HashMap`'s tolerance. If values may be null,
  use `groupingBy` with a list downstream, or a loop, or make the absence explicit with a
  sentinel/`Optional` value type.
- **Null-key behaviour is collector/map dependent.** The default `toMap` implementation currently
  uses a `HashMap`, which can accept a null key, but the collector contract does not promise a map
  type and a supplied map may reject it. `groupingBy` rejects a null classifier result. Normalize
  absence or choose and test an explicit representation instead of relying on incidental support.
- **The map type is unspecified** unless you supply a factory. If iteration order matters
  downstream, ask for `LinkedHashMap`; if the keys are enums, ask for `EnumMap` (see
  java-enums).

## groupingBy with a downstream

```java
Map<Category, Long> countByCategory =
    products.stream().collect(groupingBy(Product::category, counting()));

Map<Category, List<String>> namesByCategory =
    products.stream().collect(groupingBy(Product::category, mapping(Product::name, toList())));

Map<Category, Optional<Product>> priciestByCategory =
    products.stream().collect(groupingBy(Product::category, maxBy(comparing(Product::price))));

// Two aggregates, one pass
record Summary(long count, BigDecimal total) { }
Summary summary = products.stream().collect(teeing(
    counting(),
    mapping(Product::price, reducing(BigDecimal.ZERO, BigDecimal::add)),
    Summary::new));
```

- `groupingBy` does not promise the returned map's type, mutability or serializability; its default
  downstream is `toList()`, which likewise makes no mutability/type guarantee. Supply a map factory
  and downstream collector when either property belongs to the contract.
- Grouping by two or more attributes is clearer with a record key
  (`record Key(Category c, Region r)`) than with nested `groupingBy`, which produces a type
  nobody can read and forces two lookups at every use.
- `groupingByConcurrent` exists for parallel pipelines and gives up encounter order. Using it
  sequentially buys nothing.

## reduce versus collect

```java
// reduce: immutable result, associative operation, no mutation
BigDecimal total = prices.stream().reduce(BigDecimal.ZERO, BigDecimal::add);

// collect: mutable container, supplier/accumulator/combiner
String joined = names.stream().collect(StringBuilder::new, StringBuilder::append, StringBuilder::append)
                              .toString();
```

The distinction that matters: `reduce`'s accumulator must be **pure** — it returns a new value
and mutates nothing. A `reduce` whose accumulator mutates and returns its first argument
appears to work sequentially and silently loses data in parallel, because partial results are
combined out of order. Mutable accumulation is `collect`'s job, and `collect` requires a
combiner precisely so the parallel case is expressible.

Two further points:

- `reduce(identity, accumulator)` requires that `identity` really is one:
  `accumulator.apply(identity, x)` must equal `x`. `""` for concatenation, `0` for addition,
  `BigDecimal.ZERO` for `add` — but `BigDecimal.ZERO` is not an identity for `multiply`.
- Repeated immutable string concatenation in a reduction can copy an increasing prefix and become
  quadratic. Use `joining()` (or an explicit builder when control is needed), then measure for large
  pipelines rather than relying on JIT rescue.

## Exceptions inside a pipeline

A standard stream functional interface cannot declare a checked exception, and an unchecked one
prevents the terminal operation from producing its normal result; earlier side effects may already
have happened. When per-element failure is expected — parsing a batch,
calling a dependency per item — model the outcome instead of throwing:

```java
sealed interface Parsed permits Ok, Failed { }
record Ok(Order order) implements Parsed { }
record Failed(String line, String reason) implements Parsed { }

Map<Boolean, List<Parsed>> byOutcome =
    lines.stream().map(Parser::parse).collect(partitioningBy(p -> p instanceof Ok));
```

This keeps both the successes and the failures, which is what a batch job actually needs — a
single exception that discards 9 999 good records is rarely the requirement. java-exception-design
covers the wider choice between exceptions and result types.

## Review checks

- [ ] No mutation of anything outside the pipeline in `map`/`filter`/`sorted`/`flatMap`.
- [ ] `forEach` only for output, never for accumulation.
- [ ] Every `toMap` states whether duplicates are invalid or defines an explicit merge policy;
      nullable values and keys are accounted for.
- [ ] `groupingBy` has an explicit downstream whenever the value is not a plain list.
- [ ] `reduce` accumulators are pure; mutable accumulation uses `collect`.
- [ ] Collector-produced collections' mutability and iteration order match what callers assume.
- [ ] Per-element failures are modelled, not thrown, when the batch must continue.
