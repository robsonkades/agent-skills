# Deciding on Abstract Factory, and what replaces it

## The family-invariant test

Write the sentence: _"A `<product A>` from family X must never be used with a `<product B>` from
family Y, because \_\_\_."_ If the blank cannot be filled with a concrete failure, there is no
family and the pattern has nothing to protect.

Concrete blanks that pass the test:

- "…because the PDF paginator emits page-break markers the HTML renderer writes out as literal
  text."
- "…because the unit of work controls session A while the repository writes through session B,
  so committing the unit of work does not govern those writes."
- "…because the v2 serialiser writes a field the v1 parser rejects as unknown."

Blanks that fail the test — and mean the products should be injected independently:

- "…because it would be inconsistent." (Restates the claim.)
- "…because we always use them together." (Habit, not invariant.)
- "…because the config says so." (Name the requirement and actual wiring checks; configuration
  alone does not prove compatibility.)

## Alternatives, by what they resolve

| Alternative                              | Resolves                                                       | Fails to resolve                                                           |
| ---------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Independent injection of each product    | Wiring, testing, lifecycle                                     | Nothing prevents a mixed set if two families are wired simultaneously      |
| One `@Configuration` per profile         | Deployment-time selection with coherent wiring                 | Automatic proof against multiple active profiles or incompatible beans     |
| `Map<Key, Family>` where family = record | Selection of one bundle, including bundles supplied by plugins | Compatibility, sharing or lifecycle enforcement merely from the map/record |
| Sealed `Format` + exhaustive `switch`    | Compile-time coverage of the selector type's cases             | Runtime registration, provider loading or product compatibility            |
| `ServiceLoader<FamilyProvider>`          | Third-party providers through a typed runtime service          | Family compatibility, application key uniqueness or failure policy         |
| Configuration properties                 | Families that differ only in values                            | Families that differ in behaviour                                          |

Pattern-switch exhaustiveness (Java 21 without preview) checks the selector type's cases, not
whether every requested family is registered and usable. A sealed root can deliberately permit a
`non-sealed` extension branch; a switch can cover that branch without knowing each plugin
implementation. Keep registry validation and an explicit unsupported-key path for those families.

For a deployment-selected Spring family, existing configuration may already do the assembly.
Plain constructor wiring at a composition root can do the same; no container is required.
Keep a separate provider when its ownership or extension contract supplies value beyond wiring.

`ServiceLoader` discovers providers lazily and may throw `ServiceConfigurationError` while loading
or instantiating them. Decide whether required provider failures stop startup or disable an optional
capability; do not silently select a different family. Define duplicate-key policy when building the
registry rather than letting discovery order choose it. The loader itself is not thread-safe.

## Abstract Factory versus its neighbours

| Question                                                       | Answer                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| One product, inherited algorithm uses a subclass creation hook | Factory Method                                                |
| One product, many parameters, staged or optional               | Builder                                                       |
| Many products, one family, family varies                       | Abstract Factory                                              |
| New object built from an existing instance's state             | Prototype                                                     |
| One instance, global access                                    | Singleton (and reconsider)                                    |
| Products unrelated, caller asks for whatever it needs          | Service Locator — an anti-pattern here, not a GoF alternative |

Abstract Factory can be built from GoF Factory Methods when a base algorithm delegates creation
to subclass hooks; a `newX()` method alone is not that pattern. A family can also return Builders.
Those are possible compositions, not requirements.

## The three ways this pattern goes wrong

**Factory-for-everything.** The interface accretes a `createX()` for each new type someone needs,
until it is a service locator. Inspect compatibility and ownership across callers: an encoder and
decoder on different paths may still need the same negotiated protocol. Split only products with
no relevant family contract; shared usage alone neither proves nor disproves one.

**A family of one.** One implementation, an interface, and a comment saying another will come.
Detection: inspect implementors and actual consumers. Keep a justified public SPI/module boundary;
otherwise consider removing speculative indirection. Preserve public compatibility and lifecycle
before deleting an interface.

**Family selected by ambiguous flags.** When `newFactory(boolean legacy)` grows into
`newFactory(boolean legacy, boolean v2, boolean tenantB)`, use a named key that fits the extension
contract: an enum for application-owned finite choices, a sealed hierarchy for modeled variants,
or a value key checked against the authorized registry for runtime-contributed families. Do not
close an extensible plugin set merely to replace booleans; preserve public API compatibility when
migrating existing callers.

## Removing an Abstract Factory safely

1. Identify the compatibility and lifecycle contracts, including external consumers and plugins.
2. Demonstrate that simpler construction or a bundle preserves them; retain a justified provider.
3. Move necessary selection to the existing composition root without leaking concrete dependencies
   into callers that should remain independent.
4. Remove an obsolete public interface only under its compatibility/deprecation policy and after
   consumer checks. Keeping it during a required migration can be correct.

Preserve the family invariant even when a bundle replaces factory methods. Naming can explain that
contract; renaming a public type is not required to make an adequate design sound.

See [Java 17 ServiceLoader](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/ServiceLoader.html)
for provider discovery and failures, and [interface evolution](https://docs.oracle.com/javase/specs/jls/se17/html/jls-13.html#jls-13.5.7)
for why a default method can preserve old binaries yet introduce invocation or source conflicts.
For the selection boundary, see [Java 17 sealed classes](https://docs.oracle.com/en/java/javase/17/language/sealed-classes-and-interfaces.html)
for permitted extension branches and [Java 21 exhaustive switches](https://docs.oracle.com/javase/specs/jls/se21/html/jls-14.html#jls-14.11.1.1)
for the compiler's coverage rules.
