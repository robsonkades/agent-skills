# Enforcing a Boundary

A boundary that only exists in a diagram degrades at a predictable rate: one violation
under deadline, then the violation cited as precedent, then no boundary. Enforcement is not
bureaucracy; it is the cheapest part of the design.

## Layout that makes violations visible

When component ownership/change locality is the driver, consider packaging by component,
then by layer inside it. This Java example chooses a framework-free domain policy:

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

With explicit named Java modules on the module path, exporting only the surface package
restricts ordinary cross-module source access to internals. A build module/JAR on the
classpath does not by itself hide public internal classes. Account for `opens`, reflection
and launch-time export overrides separately. Package-private access protects one exact
Java package, not its subpackages or the whole component tree.

JPMS requires Java 9+. Resolve the project's target and existing ArchUnit/JUnit versions;
there is no universal application JDK or test-library baseline for this architectural skill.
Do not upgrade the application merely to copy an enforcement example. On the classpath,
use an appropriate existing build/architecture check for the rule the compiler cannot enforce.

## Enforcement mechanisms, cheapest first

| Mechanism                           | Catches                                                       | Cost                                                |
| ----------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Package-private visibility          | Access from outside the exact Java package                    | May require colocating collaborating classes        |
| ArchUnit test in the build          | Rules represented by imported bytecode dependencies           | Import scope, test wiring and dynamic-access limits |
| Java modules (`module-info`)        | Cross-module access to non-exported packages                  | Real, if the stack cooperates                       |
| Separate build module per component | Disallowed artifact dependencies when the build enforces them | Public internals remain accessible on classpath     |
| Code review                         | What the reviewer happens to notice                           | Fails under deadline, which is when it matters      |

## ArchUnit rules worth having on day one

Partial JUnit/ArchUnit example: resolve the project's JDK, ArchUnit/JUnit engine and
Jakarta versus legacy `javax.persistence` API before use; imports/dependencies are omitted.
This is one policy: web → app/domain, app → persistence/domain, persistence → domain, with
framework-free domain. It is not the classical domain → data-source diagram. Port calls
can execute outward while their source dependencies point inward. Direct web → domain
dependencies permit domain value types; these rules do not distinguish their use from a
controller bypassing a use-case boundary. Add narrower rules if that distinction is required.

The first rule checks only its named framework packages. For example, Hibernate's
`org.hibernate.annotations.Formula` is outside that list; a green result does not establish
complete framework independence. Include the target stack's provider and legacy packages,
or define permitted domain dependencies for a stricter policy. Check representative forbidden
imports from the actual stack, not only a Spring type already listed below.

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

For the chosen framework-free policy, require an exemption to name the class and the reason,
not to widen the package pattern. Do not impose that policy on an accepted classical design.
The entity rule is a proxy for a deeper decision
(`remote-facade-and-dto`); it is worth enforcing even when the team has decided to expose
entities on some paths, with the exemptions listed explicitly rather than by omission.

`consideringOnlyDependenciesInLayers()` excludes dependencies outside the named layers;
it does not prove a complete module API boundary. Test a forbidden dependency and a valid
adapter-to-port dependency, verify nonempty imports and CI execution, and add explicit
component-surface rules when needed. Reflection/configuration wiring needs separate checks.

## What may cross, and in which direction

| Crossing             | Acceptable                                                                    | Leak                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| web → app            | Command/query objects, primitives, domain value objects                       | HTTP types (`ResponseEntity`, `HttpServletRequest`) passed inward                                                       |
| app → domain         | Domain types, values                                                          | DTOs the web layer defined                                                                                              |
| domain → persistence | No concrete persistence dependency under inversion; domain names its own port | A `JpaRepository` subtype named in domain code                                                                          |
| persistence → domain | Domain types (that is the mapper's job)                                       | Domain types annotated to satisfy the ORM, with the annotations then constraining the model                             |
| app → web            | Nothing                                                                       | A service returning a `ResponseEntity` or throwing a web exception                                                      |
| transaction scope    | Use-case scope covering the required atomic work                              | Independent commits where the use case requires atomicity; inspect interception/propagation (`enterprise-transactions`) |

## Data crossings that import rules cannot see

A repository in `orders` can issue SQL against a table owned by `pricing` without a bytecode
dependency on a pricing class. The rules above can all pass while a foreign update bypasses
pricing invariants or a column change breaks orders. Inspect SQL, ORM associations, query
projections and migration ownership alongside the class graph.

Distinguish an approved read projection/view with an owner and compatibility contract from
incidental access to another module's base tables. A permitted reporting query may intentionally
cross data ownership; preserve its authorization, tenant filtering and transaction assumptions.
For writes, identify who enforces the invariant on every supported path. Do not introduce
per-module databases just to repair an import rule's blind spot.

Choose evidence matching the policy: focused SQL/mapping checks and integration tests with
an attempted forbidden access or bypass, plus an allowed query/update control. Database
permissions can enforce role-level limits when identities are separated; one shared credential
cannot distinguish the Java modules using it. Without a suitable check or fixture, report the
unverified data boundary rather than claiming isolation from an ArchUnit or JPMS pass.

## The seven recurring leaks

1. **JPA entity as the HTTP payload.** Persistence-model changes can alter the public
   representation; a database column rename alone need not change mapped JSON. Lazy associations serialise or fail depending on
   whether a transaction happens to be open.
2. **Framework annotations in the domain.** Usually starts with `@Entity` and ends with the
   model shaped by what maps cleanly rather than by the business.
3. **Repository called from the controller** for "just this one read". A read shortcut can
   be deliberate, but must preserve required authorization, tenant isolation and filtering.
   For writes, verify that invariants and the required atomic work still have an owner that
   every entrypoint uses. Reject a bypass of these protections on either path; a read/write
   label alone does not establish whether the boundary is safe to skip.
4. **Transaction demarcation in the wrong layer.** Repository-local transactions can leave
   partial commits when no encompassing atomic scope exists. Spring `REQUIRED` normally
   joins an existing outer transaction; the annotation alone does not imply one commit per
   query. Check actual interception, propagation and transaction-manager/resource scope.
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

1. Use `rg` to find framework imports in domain packages; inspect consequences and accepted
   exceptions rather than treating the count as a health score.
2. Look for cycles between top-level packages. They demonstrate source coupling, not that
   the packages must be merged. Inspect the cycle and protected contracts before choosing
   inversion, moving a shared contract, or consolidation.
3. Find the type that appears in both a controller signature and a repository signature —
   that type is the system's real coupling, whatever the diagram says.
4. Sample representative feature commits and inspect why files changed. A public-contract
   or invariant change can legitimately span layers; distinguish that from repeated
   passthrough-only edits. Missing history or co-change alone does not justify removal;
   compare a focused component/slice change against the protected contracts (`layering-styles.md`).
5. Ask which layer would survive replacing the web framework. Broad coupling weakens an
   independence claim, but other boundary benefits may still justify the design.

## Primary references

- [ArchUnit user guide](https://www.archunit.org/userguide/html/000_Index.html) — imports and dependency-rule scope.
- [Hibernate 6.6 Formula annotation](https://docs.hibernate.org/orm/6.6/javadocs/org/hibernate/annotations/Formula.html) — an example of a provider package outside the illustrative denylist.
- [Spring transaction propagation](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html) — REQUIRED versus independent transaction scopes; match the deployed release.
- [Java 25 JLS, modules](https://docs.oracle.com/javase/specs/jls/se25/html/jls-7.html#jls-7.7) — exports and opens.
- [PostgreSQL 18 privileges](https://www.postgresql.org/docs/18/ddl-priv.html) — an example of database permissions granted to roles, not to Java packages; use the deployed database's equivalent.
