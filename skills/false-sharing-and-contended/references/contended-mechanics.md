# `@Contended` mechanics and layout

## Annotation and grouping

Read the exact target JDK annotation/source. Conceptually, contention groups request separation
between grouped fields/classes according to HotSpot's layout policy. Empty/default group semantics
and class-level versus field-level use matter; multiple fields can intentionally share a group.

The pinned JDK 25 annotation contract specifies:

- Each field with an empty/default tag has a distinct anonymous group.
- Fields with the same nonempty tag in one class share a group; they are not isolated
  from one another. Use different groups for different hot owners.
- Class-level annotation groups otherwise unannotated declared fields together; it does
  not separate every field. Its tag is ignored.
- Class annotation does not cover newly declared subclass fields. Superclass groups retain
  their effect, but the same tag in parent and child does not combine those groups.

HotSpot 25's field-layout implementation ignores `@Contended` on static fields, even when the
annotation is in the class file and restrictions are relaxed. On a reference field it separates
the reference slot, not the referenced object's fields or array elements. Choose and verify the
actual instance/element layout rather than expecting annotation effects to propagate through a
reference.

Partial application layout example, compiled with the target JDK's internal annotation export:

```java
final class Counters {
    @jdk.internal.vm.annotation.Contended("producer")
    volatile long produced;
    @jdk.internal.vm.annotation.Contended("consumer")
    volatile long consumed;
}
```

Distinct groups request separation; the volatile fields preserve visibility but `++` still
is not an atomic multi-writer increment. Verify runtime offsets and actual ownership.

Verification protocol:

```text
1. Pin JDK vendor/version/build, architecture, collector and header flags.
2. Confirm compilation used the required module export for the internal annotation.
3. Inspect class-file annotation presence.
4. Capture effective EnableContended, RestrictContended and padding-width support/value.
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

For named modules, export to the actual module rather than `ALL-UNNAMED`. Runtime access depends on
the operation: direct use of the internal type or reflective invocation of its members requires
appropriate module access. Merely enumerating annotations and reading their type names need not
export the annotation package; VM layout recognition also does not require that export. In all cases,
`-XX:-RestrictContended` may be required for application classes on HotSpot. Verify startup/effective
flags because internal options can change or disappear.

For HotSpot builds exposing these flags, `EnableContended=false` disables layout handling
even when restrictions are relaxed. Inspect flags rather than assuming `-XX:-RestrictContended`
alone is sufficient. `javac --release` cannot be combined with exporting an internal package
from a system module for that release. Use the intended JDK toolchain and its supported build
configuration; do not remove the project's release compatibility requirement or upgrade its
JDK just to compile this annotation. If those constraints exclude internal API use, select an
ownership/array/standard-library alternative.

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
slot cross a line. Compare all lines touched by each access, not only its starting line. This
depends on the actual element/access alignment; it is not a claim that ordinary aligned Java
`long[]` slots straddle a 64-byte line. Test several allocations/GC states or use a layout
mechanism offering required alignment. Avoid using arbitrary Java thread IDs directly as dense
indices without bounds/stable owner mapping.

## Memory cost

Compute:

```text
extra shallow bytes per instance * peak live instances = extra live shallow bytes
extra bytes per allocation * allocations per second = extra allocated bytes per second
```

Measure retained graphs, cache/TLB behaviour and GC effects separately; these are not byte
quantities to add to the formula. Padding bytes are not extra reference fields for GC to scan,
though larger objects can affect copying, heap occupancy and locality.

Padding one singleton can be cheap; padding millions of short-lived objects can dominate. Larger
objects may cross size classes/region/card boundaries and reduce locality. Measure retained/live and
allocated footprint, not only shallow size.

## Authoritative references

- [JEP 142](https://openjdk.org/jeps/142)
- [OpenJDK 25 `Contended` source](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/jdk/internal/vm/annotation/Contended.java) — grouping contract; inspect the target build as well.
- [OpenJDK 25 VM flags](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/globals.hpp) — enable/restriction/padding controls.
- [OpenJDK 25 field layout source](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/classfile/fieldLayoutBuilder.cpp) — static fields bypass contention groups; instance reference slots and padding are laid out here.
- [Java 25 reflection access rules](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/reflect/AccessibleObject.html) — member access checks are separate from annotation discovery.
- [JOL project](https://github.com/openjdk/jol)
