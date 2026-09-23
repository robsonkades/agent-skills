# Collectors and purity

## Why purity is a correctness property, not a style

```java
List<String> skus = new ArrayList<>();
orders.stream()
      .filter(Order::isActive)
      .forEach(o -> skus.add(o.sku()));      // works... sequentially, today
```

This sequential terminal action is legal, but has two design costs:

- **Unsynchronized parallel accumulation is unsafe.** `ArrayList` is not thread-safe;
  adding `.parallel()` can produce lost elements or exceptions, or appear to work. A passing
  run does not establish safe shared accumulation.
- **It hides the result.** The written form of the operation is "collect the SKUs of active
  orders", which the pipeline should state directly:

```java
List<String> skus = orders.stream().filter(Order::isActive).map(Order::sku).toList();
```

The rule that follows: intermediate operations compute values; accumulation happens in the
terminal operation, through a collector that knows how to combine partial results.
Elision is a separate issue for intermediate side effects: `map` or `peek` can be skipped when
the terminal result permits it (for example, a sized source followed by `count`). Terminal
`forEach`/`forEachOrdered` actions are not subject to that elision permission.

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

`Stream.toList()` accepts null elements; `toUnmodifiableList()` rejects them. Both are
unmodifiable, not deeply immutable. Replacing an externally accumulated ArrayList with
`toList()` changes mutability; use `toCollection(ArrayList::new)` when callers need mutation.

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
- **A null mapped value throws NPE in current JDK implementations**; merge overloads use
  `Map.merge`, while the two-argument implementation checks directly. Do not infer null support
  from `HashMap`'s tolerance. If values may be null,
  use `groupingBy` with a list downstream, or a loop, or make the absence explicit with a
  sentinel/`Optional` value type.
- **A null merge result removes the mapping.** The merge overloads follow `Map.merge` here;
  this differs from a null value returned by the value mapper. Returning null does not mean
  "ignore the incoming value" or "exclude this key forever": in a sequential stream, two
  colliding values remove the entry, and a third can insert it again. Return the retained value
  to keep one, or reject invalid duplicates explicitly. If deletion is intentional, define it
  as part of the result contract and check collector associativity under partition/combination.
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
- Compare a record key (`record Key(Category c, Region r)`) with nested `groupingBy` from the
  consumer's access pattern. Flat lookup and hierarchical traversal favor different shapes;
  preserve a useful existing/public grouped contract.
- `groupingByConcurrent` is unordered and supports concurrent accumulation. A sequential use
  can still satisfy a required `ConcurrentMap` result contract; it does not gain parallel
  accumulation speed. Its grouped lists are not thereby guaranteed thread-safe.

## reduce versus collect

```java
// reduce: immutable result, associative operation, no mutation
BigDecimal total = prices.stream().reduce(BigDecimal.ZERO, BigDecimal::add);

// collect: mutable container, supplier/accumulator/combiner
String joined = names.stream().collect(StringBuilder::new, StringBuilder::append, StringBuilder::append)
                              .toString();
```

The distinction that matters: `reduce`'s accumulator must be **side-effect free** — it may select
an existing value without mutating it. A `reduce` whose accumulator mutates and returns its first argument
can appear to work sequentially but violates the reduction contract: the mutable identity may
be shared across parallel partial reductions, corrupting or duplicating data. Mutable accumulation is `collect`'s job, and `collect` requires a
combiner precisely so the parallel case is expressible.

Two further points:

- `reduce(identity, accumulator)` requires that `identity` really is one:
  `accumulator.apply(identity, x)` must equal `x`. `""` for concatenation, `0` for addition,
  `BigDecimal.ZERO` for numerical addition — but addition uses the maximum operand scale, so
  adding zero can change the representation of a negative-scale operand. If scale/`equals`
  belongs to the result contract, define the representation policy too. Zero is not an identity
  for multiplication.
- Repeated immutable string concatenation in a reduction can copy an increasing prefix and become
  quadratic. Use `joining()` (or an explicit builder when control is needed), then measure for large
  pipelines rather than relying on JIT rescue.

## Exceptions inside a pipeline

A standard stream functional interface cannot declare a checked exception, and an unchecked one
prevents the terminal operation from producing its normal result; earlier side effects may already
have happened. When the batch must continue after per-element failure — parsing a batch or
calling a dependency per item — an outcome model can preserve both successes and failures:

```java
sealed interface Parsed permits Ok, Failed { }
record Ok(Order order) implements Parsed { }
record Failed(String line, String reason) implements Parsed { }

Map<Boolean, List<Parsed>> byOutcome =
    lines.stream().map(Parser::parse).collect(partitioningBy(p -> p instanceof Ok));
```

This fits a continue-and-report contract. A fail-fast or reject-whole-batch contract may instead
need an exception and a separate publication boundary; throwing does not roll back prior effects.
A loop can preserve a checked failure API without wrapper machinery. java-exception-design
covers the wider choice between exceptions and result types.

## Review checks

- [ ] Intermediate callbacks do not carry required effects or interfere with the source;
      state affecting results follows the operation's contract.
- [ ] Terminal effects/accumulation follow their ordering, failure and ownership contract;
      confined sequential mutation is distinguished from unsafe shared parallel mutation.
- [ ] Every `toMap` states whether duplicates are invalid or defines an explicit merge policy;
      nullable values and keys, null merge results and repeated collisions are accounted for.
- [ ] `groupingBy` has an explicit downstream whenever the value is not a plain list.
- [ ] `reduce` accumulators are pure; mutable accumulation uses `collect`.
- [ ] Collector-produced collections' mutability and iteration order match what callers assume.
- [ ] Per-element failures are modelled, not thrown, when the batch must continue.

## Primary references

- [Java 21 Stream contracts](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Stream.html)
- [Java 21 Collector laws](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collector.html)
- [Java 21 Collectors](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html)
- [Java 21 Map.merge null-result semantics](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Map.html#merge(K,V,java.util.function.BiFunction)>)
- [Java 21 BigDecimal scale and equality](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/math/BigDecimal.html)
