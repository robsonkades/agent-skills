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
- A change to any class in it obliges every consumer to evaluate an upgrade.
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

- its transitive dependencies, which enter your classpath and can conflict;
- its release cadence, which becomes a lower bound on how often you must retest;
- its defects, including in the 90% of it you never call;
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

The dependency graph between components must be a directed acyclic graph.

This is not a stylistic preference. A cycle has no valid build or release order: to release A
you need the new B, and to release B you need the new A. Maven will refuse a cycle between
modules outright. Teams therefore "solve" it by keeping the cyclic parts in one module and
releasing them together — which is the correct answer, arrived at accidentally.

Three mechanical ways, in the order to consider them.

**0. Merge the two components.** Correct whenever they were never separately releasable — the
cycle is evidence that they are one component, and the build was already releasing them
together. Do this before reaching for either of the others.

**1. Move the offending classes into a third component.** If `orders` depends on `billing` for
`InvoiceNumber`, and `billing` depends on `orders` for `OrderId`, extract both identifiers
into a third component that neither depends on.

```text
Before:   orders ⇄ billing            (no release order exists)

After:    orders ──► identifiers ◄── billing
```

The new component must be genuinely more stable than both — identifiers, value objects and
domain vocabulary qualify; a `shared` module that accumulates whatever unblocks the build
does not.

**2. Invert the edge.** If `billing` needs to notify `orders`, `billing` declares the
interface it needs and `orders` implements it. The source dependency now points from `orders`
to `billing`, against the direction of the call (`java-dependency-inversion`).

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

Merging is the right tool when the two were never separately releasable. Inversion is the
right tool when the runtime call really must go that way. Moving classes is the right tool
when the coupling is only about shared vocabulary. Choosing inversion for a
vocabulary problem produces an interface with one implementation and no benefit
(`enterprise-architecture-smells`).

### Stable dependencies

Depend in the direction of stability. "Stable" here means **hard to change**, and it is a
property of position in the graph, not of quality: a component that many others depend on is
hard to change because changing it obliges all of them.

The metric usually quoted is instability, `I = Ce / (Ca + Ce)` — outgoing over total
dependencies, from 0 (depended on by many, depends on nothing; maximally rigid) to 1 (depends
on many, depended on by nothing; freely changeable). `java-cohesion-coupling` covers computing
it over packages.

Used as a design tool, it says one thing worth acting on: **an edge from a low-I component to
a high-I component is a defect**, because a rigid component has taken a dependency on
something designed to churn. Used as a target — "no module may exceed I = 0.6" — it is
numerology, and a review should reject it.

### Stable abstractions

A component's abstractness should rise with its stability. If a component is hard to change
because everything depends on it, the only way to keep it extensible is for it to be extended
rather than edited: interfaces, sealed hierarchies and abstract policy, with implementations
living in less stable components.

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
concrete). Both ends are good positions. The two corners **off** the diagonal are the failures.

- **Zone of pain** — bottom-left: concrete and heavily depended upon. Every change breaks
  consumers and there is no extension point. This is what a `commons` jar becomes. The fix is
  to shrink it or to extract the stable abstract part.
- **Zone of uselessness** — top-right: abstract and depended on by nobody. Interfaces written
  for an extension that never arrived. The fix is deletion.

Treat the diagonal as a diagnostic for outliers, never as a score to optimise. A leaf
application module is legitimately concrete and unstable; a port module is legitimately
abstract and stable. Both sit on the line, and neither got there by measuring.

## Mapping to a Java build

| Concept            | Maven                            | JPMS                                                                                             |
| ------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| Component boundary | a module with its own artifactId | `module-info.java`                                                                               |
| What is public     | everything on the classpath      | only `exports`ed packages                                                                        |
| Release unit       | the published artifact + version | recordable via `--module-version`, but never used — no version resolution, no conflict detection |
| Cycle prevention   | enforced: reactor rejects cycles | enforced: `requires` cycles rejected                                                             |
| Consumer pins to   | a version                        | nothing — version is the build's job                                                             |

The row that matters: **JPMS enforces encapsulation, Maven enforces release.** A `module-info`
gives a boundary teeth at compile time, which is genuinely valuable and cheap. It does not
make the module a component in the sense this skill is about, because there is no version and
no independent consumer. Use JPMS to stop unwanted access; use publication and versioning to
create a component.

Enforce the acyclic rule mechanically. The reactor already rejects module cycles; add an
ArchUnit rule for package cycles inside a module so they are caught before an extraction turns
them into module cycles:

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
  `references/shared-code-in-a-fleet.md`.
