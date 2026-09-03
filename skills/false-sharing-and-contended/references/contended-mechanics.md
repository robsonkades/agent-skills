# `@Contended` mechanics and layout

## Annotation and grouping

Read the exact target JDK annotation/source. Conceptually, contention groups request separation
between grouped fields/classes according to HotSpot's layout policy. Empty/default group semantics
and class-level versus field-level use matter; multiple fields can intentionally share a group.

Verification protocol:

```text
1. Pin JDK vendor/version/build, architecture, collector and header flags.
2. Confirm compilation used the required module export for the internal annotation.
3. Inspect class-file annotation presence.
4. Capture effective RestrictContended and padding-width support/value.
5. Inspect runtime field offsets/layout under the exact launch flags.
6. Calculate total instance/array/fleet memory impact.
7. Validate actual writer placement and performance evidence.
```

An ignored annotation can produce identical bytecode metadata but unchanged VM layout, depending on
restriction handling. Throughput alone cannot prove padding was applied.

## Module access

Application compilation referencing `jdk.internal.vm.annotation.Contended` commonly requires:

```bash
javac --add-exports java.base/jdk.internal.vm.annotation=ALL-UNNAMED ...
```

For named modules, export to the actual module rather than `ALL-UNNAMED`. Runtime `--add-exports` is
needed if application code/reflection resolves/accesses the internal annotation type at runtime; do
not add it solely by folklore when the VM only consumes annotation metadata. In all cases,
`-XX:-RestrictContended` may be required for application classes on HotSpot. Verify startup/effective
flags because internal options can change or disappear.

## Layout evidence

Use complementary evidence:

- class-file tools for annotation metadata;
- JOL or supported field-offset tooling for relative instance layout;
- controlled arrays/off-heap layouts or address tooling for absolute adjacency/alignment where safe;
- object footprint/heap histograms for fleet memory cost;
- collector/JDK/header variants for movement and layout changes.

JOL's model may use instrumentation/Unsafe assumptions and can differ under restricted environments.
Record version and warnings. Object addresses are diagnostic and can change across GC.

## Manual padding

Dummy fields depend on HotSpot field-layout policy, inheritance, field types, headers and alignment;
declaration order is not a Java layout contract. Even if offsets look correct today, maintenance can
remove/reorder fields and a JDK/header change can shift them. If used, enforce offsets/size with an
exact-build test and explain why internal annotation/array/ownership alternatives were rejected.

## Arrays

For primitive array slots, determine array base offset, index scale, line size and base alignment.
Padding between logical counters can be represented by stride, but an unfortunate base can make a
slot cross a line. Test several allocations/GC states or use a layout mechanism offering required
alignment. Avoid using arbitrary Java thread IDs directly as dense indices without bounds/stable
owner mapping.

## Memory cost

Compute:

```text
extra bytes per instance * peak live instances
+ additional cache/TLB/GC scanning effects
+ allocation rate/lifetime consequences
```

Padding one singleton can be cheap; padding millions of short-lived objects can dominate. Larger
objects may cross size classes/region/card boundaries and reduce locality. Measure retained/live and
allocated footprint, not only shallow size.

## Authoritative references

- [JEP 142](https://openjdk.org/jeps/142)
- [OpenJDK `Contended` source](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/jdk/internal/vm/annotation/Contended.java)
- [OpenJDK class layout source](https://github.com/openjdk/jdk/tree/master/src/hotspot/share/classfile)
- [JOL project](https://github.com/openjdk/jol)
