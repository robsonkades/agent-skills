# Enforcing a Boundary

A boundary that only exists in a diagram degrades at a predictable rate: one violation
under deadline, then the violation cited as precedent, then no boundary. Enforcement is not
bureaucracy; it is the cheapest part of the design.

## Layout that makes violations visible

Prefer packaging by component, then by layer inside it:

```text
com.acme.orders            ← module surface: what other modules may call
com.acme.orders.domain     ← rules; no framework imports
com.acme.orders.app        ← use cases, transaction boundary
com.acme.orders.web        ← controllers, request/response types
com.acme.orders.persistence← mappers, JPA entities, SQL
```

against packaging by layer at the top level (`com.acme.web`, `com.acme.service`,
`com.acme.repository`), which makes every feature a diagonal cut through the tree and makes
module extraction a rename of every file.

With Java modules or a build-level module per component, the visibility rules become
compiler-enforced: only the surface package is exported, so `orders.persistence` is
unreachable from `billing` without an explicit export you would have to write on purpose.

## Enforcement mechanisms, cheapest first

| Mechanism                           | Catches                                       | Cost                                           |
| ----------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| Package-private visibility          | Access to a module's internals from a sibling | Free; requires component-first packaging       |
| ArchUnit test in the build          | Any dependency rule you can state             | One test class; runs in CI                     |
| Java modules (`module-info`)        | Cross-module access to non-exported packages  | Real, if the stack cooperates                  |
| Separate build module per component | Cyclic dependencies, accidental imports       | Build complexity; strongest signal             |
| Code review                         | What the reviewer happens to notice           | Fails under deadline, which is when it matters |

## ArchUnit rules worth having on day one

```java
@AnalyzeClasses(packages = "com.acme")
class ArchitectureTest {

    @ArchTest
    static final ArchRule domain_is_framework_free =
        noClasses().that().resideInAPackage("..domain..")
            .should().dependOnClassesThat()
            .resideInAnyPackage(
                "org.springframework..",
                "jakarta.persistence..",
                "com.fasterxml.jackson..",
                "jakarta.servlet.."
            );

    @ArchTest
    static final ArchRule layers_point_downwards =
        layeredArchitecture().consideringOnlyDependenciesInLayers()
            .layer("web").definedBy("..web..")
            .layer("app").definedBy("..app..")
            .layer("domain").definedBy("..domain..")
            .layer("persistence").definedBy("..persistence..")
            .whereLayer("web").mayNotBeAccessedByAnyLayer()
            .whereLayer("app").mayOnlyBeAccessedByLayers("web")
            .whereLayer("persistence").mayOnlyBeAccessedByLayers("app");

    @ArchTest
    static final ArchRule entities_do_not_leave_persistence =
        noClasses().that().resideInAPackage("..web..")
            .should().dependOnClassesThat().areAnnotatedWith(Entity.class);

    @ArchTest
    static final ArchRule no_cycles =
        slices().matching("com.acme.(*)..").should().beFreeOfCycles();
}
```

Two notes. The domain rule is the one that pays for itself immediately, and the one teams
weaken first — when it is weakened, require the exemption to name the class and the reason,
not to widen the package pattern. The entity rule is a proxy for a deeper decision
(`remote-facade-and-dto`); it is worth enforcing even when the team has decided to expose
entities on some paths, with the exemptions listed explicitly rather than by omission.

## What may cross, and in which direction

| Crossing                    | Acceptable                                                        | Leak                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| web → app                   | Command/query objects, primitives, domain value objects           | HTTP types (`ResponseEntity`, `HttpServletRequest`) passed inward                                                            |
| app → domain                | Domain types, values                                              | DTOs the web layer defined                                                                                                   |
| domain → persistence        | Nothing, if inverted; else a repository interface the domain owns | A `JpaRepository` subtype named in domain code                                                                               |
| persistence → domain        | Domain types (that is the mapper's job)                           | Domain types annotated to satisfy the ORM, with the annotations then constraining the model                                  |
| app → web                   | Nothing                                                           | A service returning a `ResponseEntity` or throwing a web exception                                                           |
| any → framework transaction | `@Transactional` at the application service                       | `@Transactional` on a controller, or on a repository method that is one of several in a use case (`enterprise-transactions`) |

## The seven recurring leaks

1. **JPA entity as the HTTP payload.** The schema becomes the public contract; a column
   rename becomes a client break, and lazy associations serialise or explode depending on
   whether a transaction happens to be open.
2. **Framework annotations in the domain.** Usually starts with `@Entity` and ends with the
   model shaped by what maps cleanly rather than by the business.
3. **Repository called from the controller** for "just this one read". Frequently the right
   engineering call for a read path — and a leak when it becomes a write path, because the
   transaction boundary and the invariants are then in the web layer.
4. **Transaction demarcation in the wrong layer.** `@Transactional` on the repository gives
   one transaction per query; the use case then spans several, and a partial failure leaves
   half the work committed.
5. **Domain code catching infrastructure exceptions.** `SQLException`,
   `DataAccessException` or `RestClientException` handled in a business rule means the
   business rule now depends on the mechanism. Translate at the adapter boundary
   (`enterprise-base-patterns`).
6. **Static access to context.** `SecurityContextHolder`, `LocaleContextHolder`, a static
   clock or a thread-local tenant read from inside the domain. It compiles, it is invisible
   in the signature, and it makes the rule untestable without the framework.
7. **The upward call.** Domain code calling a notifier, a scheduler or an HTTP client
   directly. Invert it: the domain declares the interface it needs, and the adapter
   implements it.

## Reviewing an existing structure

Ask, in this order:

1. `grep` the domain packages for framework imports. The count is the health metric.
2. Look for cycles between top-level packages. A cycle means there is one module, not two.
3. Find the type that appears in both a controller signature and a repository signature —
   that type is the system's real coupling, whatever the diagram says.
4. Take the last ten feature commits and count files touched per feature. If every feature
   touches every layer, the layers are not absorbing change and the boundary may be in the
   wrong place — consider components or slices (`layering-styles.md`).
5. Ask which layer would survive replacing the web framework. If none would, layering is
   currently costing without paying.
