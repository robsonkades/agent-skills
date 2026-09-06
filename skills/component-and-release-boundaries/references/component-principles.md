# The Component Principles Applied

The six classical component principles split into two groups: three about **what goes inside
a component** (cohesion) and three about **how components may depend on each other**
(coupling). They come from Robert C. Martin's granularity and stability papers of the
mid-1990s, written when a component meant a linkable binary; the reasoning survives because
the underlying constraint — a released artefact is consumed at a version — has not changed.
The mapping to a modern Java build is direct: a component is a Maven module that is
published, or a JPMS module that is released.

## Cohesion: what belongs in one component

### Reuse/release equivalence

The granule of reuse is the granule of release. If a consumer is to reuse part of a
component, the whole component must be tracked, versioned and released as a unit, because
that is the granularity at which the consumer can depend on it.

The practical consequences are unglamorous and are the ones teams skip:

- Everything in the component shares one version number and one release note.
- A release needs compatibility notes so consumers can decide whether and when to upgrade.
- The component needs an owner who can answer "is this change breaking?".

A module that nobody is willing to write a release note for is not a component. It is a
package that has been given a `pom.xml`.

### Common closure

Classes that change for the same reason, at the same time, belong in the same component. This
is the single-responsibility principle raised to component scale: a component should have one
reason to change.

The payoff is that a business change touches one artefact, so one thing is released,
revalidated and deployed. The failure is the opposite: a change to VAT rules touching
`billing-core`, `billing-model`, `tax-common` and `reporting-shared`, each of which must be
released in dependency order.

This is the principle to favour while a system is young. Maintainability dominates
reusability when there are no external reusers.

### Common reuse

Classes that are not reused together should not be in the same component. Stated as its
contrapositive it becomes the useful rule: **depending on a component means depending on
everything in it.**

Everything means:

- its resolved transitive dependencies, subject to scopes, optionality and exclusions;
- its support/security policy, which can constrain upgrade timing;
- defects relevant to reachable code, initialization or the shipped artifact's risk profile;
- its removals, because a major bump you do not need still blocks the one you do.

This is the principle that argues components smaller, and the one that indicts `commons`
modules.

### The tension is structural

```text
                    REUSE/RELEASE
                   (larger, versioned)
                        ╱      ╲
                       ╱        ╲
     too many          ╱          ╲       too many
     components       ╱            ╲      unneeded classes
     to release      ╱              ╲     pulled in
                    ╱                ╲
        COMMON CLOSURE ─────────── COMMON REUSE
        (grouped by change)      (split by usage)
                        too hard to reuse
```

Each edge is a real cost paid for satisfying the two principles at its ends. There is no
position that avoids all three; the decision is which cost this system can afford now, and
the answer legitimately changes over a system's life.

**Read the diagram as a trajectory, not a target.** Young system with no external consumers:
sit near common closure. Mature component library with many independent consumers: move
toward common reuse. Moving is a refactor, not a failure.

## Coupling: how components may depend on each other

### Acyclic dependencies

The current source/build dependency graph between components must be a directed acyclic graph for
Maven or JPMS to build it. Release-time dependencies across separately published versions are a
different graph and may temporarily point both ways, though that makes coordinated breaking change
expensive.

Maven refuses a reactor cycle outright. With previously published versions, A can sometimes release
against old B and vice versa, so “no release order exists” is too strong; the failure appears when a
change requires both new contracts at once. That is evidence to invert an edge, introduce a stable
protocol, or acknowledge one release unit.

Three mechanical ways, in the order to consider them.

**0. Consider merging the release units.** Appropriate when separate release capability has
no demonstrated value and ownership/encapsulation does not require the split. A cycle or
shared history prompts that assessment; it does not settle it.

**1. Move the offending classes into a third component.** If `orders` depends on `billing` for
`InvoiceNumber`, and `billing` depends on `orders` for `OrderId`, extract both identifiers
into a third component that both depend on and that depends on neither of them.

```text
Before:   orders ⇄ billing            (current reactor/source cycle)

After:    orders ──► identifiers ◄── billing
```

The new component must be genuinely more stable than both — identifiers, value objects and
domain vocabulary qualify; a `shared` module that accumulates whatever unblocks the build
does not.

**2. Invert the edge.** If `billing` needs to notify `orders`, `billing` declares the
interface it needs and `orders` implements it. The source dependency now points from `orders`
to `billing`, against the direction of the call (`java-dependency-inversion`).

Partial Java snippets: `InvoiceIssued`, package declarations, imports and assembly wiring are
omitted. Put the event contract on the same policy side as `InvoiceListener`; the composition
root supplies the implementation without making billing depend on orders.

```java
// in component: billing — billing owns the interface it needs
public interface InvoiceListener {
    void invoiceIssued(InvoiceIssued event);
}
```

```java
// in component: orders — orders depends on billing, not the reverse
final class OrderInvoiceListener implements InvoiceListener {
    @Override
    public void invoiceIssued(InvoiceIssued event) { /* ... */ }
}
```

Merging fits a deliberate shared release unit. Inversion fits a policy-to-implementation
boundary that must preserve the runtime call direction. Moving classes fits genuinely
shared vocabulary, with its ownership and evolution policy established. An interface does
not remove disagreement about vocabulary simply by existing
(`enterprise-architecture-smells`).

### Stable dependencies

Depend in the direction of stability. "Stable" here means **hard to change**, and it is a
property of position in the graph, not of quality: a component that many others depend on is
hard to change because changing it obliges all of them.

The metric usually quoted is instability, `I = Ce / (Ca + Ce)` — outgoing over total
dependencies, from 0 (depended on by many, depends on nothing; maximally rigid) to 1 (depends
on many, depended on by nothing; freely changeable). `java-cohesion-coupling` covers computing
it over packages.

When `Ca + Ce = 0`, the ratio is undefined; record an isolated component instead of dividing
by zero or assigning stability arbitrarily. State whether edges count classes, packages or
artifacts before comparing values.

Used as a design prompt, an edge from a low-I component to a high-I component deserves examination:
a widely consumed component may import another component's churn. It is not automatically a defect;
runtime adapters, platform contracts and compatible evolution can make the edge appropriate. As a
target — “no module may exceed I = 0.6” — it is numerology.

### Stable abstractions

A classical heuristic says a component's abstractness should rise with its stability. If a component is hard to change
because many consumers depend on its contract, extension points can allow new behavior
without changing that contract. An ordinary interface can be implemented in another module.
A sealed type deliberately restricts direct subtypes: in a named JPMS module they must be
in that same module (or the same package in the unnamed module). Do not propose a sealed
root as an unrestricted cross-module plugin interface.

The two failure positions have names worth knowing because both are common:

```text
   abstract
      ▲
      │ ●  a port / policy component:                        ZONE OF
      │    stable AND abstract — depended on              USELESSNESS
      │    by many, extended not edited                  (abstract, and
      │      ╲                                            nothing depends
      │        ╲                                          on it)
      │          ╲
      │            ╲   the "main sequence" — a balanced
      │              ╲ component sits near this diagonal
      │                ╲
      │  ZONE OF         ╲
      │  PAIN              ╲
      │  (concrete, and      ╲
      │  everything            ●  a leaf adapter or an application:
      │  depends on it)           unstable AND concrete — free to
      │                           change, nothing depends on it
   concrete └────────────────────────────────────────────► unstable
```

The diagonal runs from the top-left (stable and abstract) to the bottom-right (unstable and
concrete). The corners away from it are investigation prompts, not proof of failure.

- **Zone of pain** — bottom-left: concrete and heavily depended upon. Investigate incompatible
  churn and missing extension points; a stable immutable value type may be appropriate here.
- **Zone of uselessness** — top-right: abstract and with no observed dependents. Check external
  plugins, reflection and planned public obligations before deleting an apparently unused API.

Treat the diagonal as a hypothesis-generating diagnostic, never as a score to optimise. It ignores
semantic stability, generated APIs, compatibility policy, ownership and change frequency. A leaf
application module is legitimately concrete and unstable; a port module is legitimately
abstract and stable. Both sit on the line, and neither got there by measuring.

## Mapping to a Java build

| Concept            | Maven                                                             | JPMS                                                                                                        |
| ------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Component boundary | a module with its own artifactId                                  | `module-info.java`                                                                                          |
| What is public     | Java access rules still apply; Maven itself adds no encapsulation | readability plus exports and Java access rules; opens controls reflective access                            |
| Release unit       | the published artifact + version                                  | version metadata can be recorded; selecting compatible artifact versions remains a build/deployment concern |
| Cycle prevention   | enforced: reactor rejects cycles                                  | enforced: `requires` cycles rejected                                                                        |
| Consumer pins to   | a version                                                         | nothing — version is the build's job                                                                        |

JPMS enforces module access rules; Maven resolves and publishes artifacts but does not
enforce independent release policy. A JPMS module can be independently published and
versioned, or remain internal. Its descriptor alone establishes neither consumer ownership
nor compatibility support. Check reflection and service loading when introducing it.

Enforce the acyclic rule mechanically. The reactor already rejects module cycles; add an
ArchUnit rule for package cycles inside a module so they are caught before an extraction turns
them into module cycles:

Partial test snippet, requiring the project's compatible ArchUnit/JUnit dependencies and
imports. The wildcard groups direct subpackages; confirm all intended packages were
imported and that the slices cover the relevant edges. Do not add dependencies merely to
use this illustration when an existing architecture check covers the same risk.

```java
@Test
void noPackageCycles() {
    JavaClasses classes = new ClassFileImporter().importPackages("com.example.billing");
    slices().matching("com.example.billing.(*)..")
            .should().beFreeOfCycles()
            .check(classes);
}
```

## What these principles do not decide

- **Whether a component should be a separate process.** Nothing here implies distribution;
  every one of these boundaries can live in one deployable (`distribution-boundaries`).
- **What the component's API should look like** once you have decided it is one
  (`java-api-design`).
- **Whether the code should be shared at all**, as opposed to duplicated — see
  [shared code in a fleet](shared-code-in-a-fleet.md).

## Primary references

- [Maven dependency mechanism](https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html):
  scopes, mediation, optional dependencies and exclusions.
- [JLS 21 modules](https://docs.oracle.com/javase/specs/jls/se21/html/jls-7.html#jls-7.7):
  requires/exports/opens and module rules.
- [JLS 21 permitted subclasses](https://docs.oracle.com/javase/specs/jls/se21/html/jls-8.html#jls-8.1.6):
  sealed hierarchy location constraints.
- [Semantic Versioning 2.0.0](https://semver.org/): public API and compatibility conditions.
