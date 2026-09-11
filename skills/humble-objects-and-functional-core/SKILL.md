---
name: humble-objects-and-functional-core
description: >
  Isolating decisions from hard-to-test effects with Humble Objects, or a pure functional
  core and imperative shell when explicit data inputs fit the contract. Use when a rule can
  only be exercised by standing up the framework, when controller, scheduler, listener or UI
  logic makes focused tests difficult, or when retry, fallback or routing policy is entangled
  with the call it governs. Inspect heavy mocking as a possible symptom, not proof that a
  refactor is needed. Preserve adequate direct tests and boundary contracts. Does not cover
  which test level to use (architecture-testing,
  java-testing-strategy), choosing and writing the doubles themselves (java-test-doubles),
  where business rules belong across layers (domain-logic-organization), the mechanics of
  immutable types (java-immutability), or module dependency direction
  (layering-and-boundaries).
---

# Humble Objects and the Functional Core

## Purpose

Make the interesting part of a component testable by moving it out of the part that is hard
to test. A decision — which discount applies, whether to retry, which shard to route to,
what to render — is a function of data. An effect — writing to a socket, a database, a
screen — is not. Mixing them produces code where the only way to check a business rule is to
stand up the world.

The techniques overlap. **Humble Object** extracts logic from a hard-to-test component so
its remaining boundary responsibilities can be tested narrowly; the extracted logic need
not be pure. **Functional core, imperative shell** additionally makes decisions functions
of explicit data while the shell owns effects and their consistency.

The two failures this exists to prevent: logic trapped inside a framework component, so a
rule change is verified by a slow test that spins up HTTP and a database; and the opposite
excess, where every effect is wrapped in ceremony and the reader loses the actual work in a
pipeline of indirection.

## Workflow

Inspect the project's Java release/toolchain and framework/transaction configuration before
refactoring. The sealed outcomes and pattern switches below use Java 21 without preview;
retain existing alternatives on older targets rather than upgrading the project. Preserve
observable behavior, authorization, transaction boundaries and failure ordering. Report the
decision extracted or retained, the effect contract and actual core/boundary checks; test
speed or reliability improvements remain unmeasured unless compared. Reuse existing tests,
consumer contracts and failure evidence to identify the testability or change goal. Ask only
about unresolved inputs, authority or effects that would change the seam; investigate the
independent parts while those answers are pending.

1. **Find the decision.** In the component, identify the branch that would be worth a test if
   it were reachable — the conditional, the calculation, the selection.
2. **Name its inputs.** Everything the decision reads: parameters, fetched data, the clock,
   configuration. If an input arrives through I/O, the decision does not need the I/O, it
   needs the value.
3. **Choose the smallest useful seam.** Keep adequate direct tests or an existing service
   with controlled collaborators. A Humble Object may extract testable effectful logic;
   choose a pure function when explicit data inputs simplify the decision. In that core,
   fetching, writing, clock reads and randomness stay outside; sampled values become inputs.
4. **Leave the shell humble.** What remains fetches, calls the decision, and performs the result.
   Branches expressing infrastructure policy may remain, but test them at the cheapest level that
   observes their effects rather than forcing every branch into a pure core.
5. **Represent the outcome as data where the shell must act on it.** "Retry after 200 ms",
   "reject with this reason" — an outcome the shell interprets, not an effect the core
   performs.
6. **Check the payoff.** Compare access to the decision, test setup and the consumer/change
   cost against the goal. Retain required boundary tests even if their setup is unchanged.
   Stop when the seam and retained contracts are verified; keep the existing design or
   simplify a proposed extraction when it adds no useful testability or maintenance benefit.

## The split

```text
              ┌──────────────────────── SHELL (imperative, humble) ──┐
   request ──►│ fetch what the decision needs                        │
              │        │                                             │
              │        ▼                                             │
              │  ┌── CORE (pure) ─────────────────────────┐          │
              │  │ inputs in, decision out.               │          │
              │  │ No I/O, no clock, no randomness,       │          │
              │  │ no framework, no mutation of anything  │          │
              │  │ the caller can see.                    │          │
              │  └────────────────────────────────────────┘          │
              │        │  outcome (data)                             │
              │        ▼                                             │
              │ perform the effect it describes                      │
              └──────────────────────────────────────────────────────┘

  Tests of the core: explicit input fixtures, outcomes and boundary cases.
  Tests of the shell: effects, wiring, failure order and consistency.
```

What makes the core pure is not the absence of the word `void` — it is that **calling it twice
with the same inputs gives the same answer, and calling it zero times changes nothing**. The
clock and the random source are inputs like any other; passing `Instant` rather than calling
`Instant.now()` is usually the single highest-value move in this whole technique.

## Decision rules

```text
The logic is inside a controller, listener, scheduled method or UI
component, and the boundary obstructs testing a consequential branch
        → compare direct testing with extracting that decision. Keep
          the existing shape when it already provides a useful seam.

The chosen pure core needs data from a repository or a remote call
        → the shell fetches, the core receives the values. Do not pass
          the repository into the core "so it can fetch what it needs" —
          that reintroduces the collaborator you were removing.

The decision needs the current time, a random value or a generated id
        → pass the sampled value for a pure core. Injecting Clock into
          a service gives controllable time, not production purity.

The core must cause something to happen
        → return a description of it. The shell interprets. This is what
          makes retry, fallback and routing policy unit-testable
          (retries-and-backoff, circuit-breakers).

The component has no interesting branch — it maps, binds or forwards
        → leave it. There is nothing to extract, and wrapping it in a
          port produces indirection (enterprise-architecture-smells).

The work IS the effect: streaming bytes, a bulk UPDATE, a batch insert
        → do not split it. There is no decision to isolate, and the
          set-based operation belongs in the database
          (domain-logic-organization).

Purity would force loading a large result set into memory to keep the
core pure
        → the boundary is in the wrong place. Push the filtering into
          the query and let the core decide over what comes back
          (architecture-and-performance).
```

## Rules

- Humility minimizes logic in the hard-to-test boundary; it does not make boundary tests worthless.
  Binding, authentication, transaction demarcation, serialization and failure translation can all
  deserve focused integration tests even when business decisions live in the core.
- A computed plan is not continuing authority to perform an effect. Preserve the actual
  transaction/version/eligibility check where the contract requires current state, including
  authorization that may change after planning. The shell retains resource acquisition,
  cleanup and task ownership on success, failure and cancellation; ending the caller's wait
  does not by itself stop dispatched work. Extraction must not close borrowed resources or
  move an effect outside its required lifetime.
- Extract the decision, not the I/O. Wrapping a repository in an interface does not make the
  logic testable if the logic still lives in the shell; it only adds a seam
  (`java-dependency-inversion`).
- Heavy interaction mocking can signal that a decision is entangled with collaborators, but mocks
  are also legitimate for protocols, failure injection and orchestration. Inspect whether the test
  asserts stable outcomes or incidental call order before changing the design.
- Pass controllable ambient inputs when exact outcomes or boundary cases matter. Direct time/random
  calls do not automatically make every property test flaky, but they obstruct replay and precise
  failure diagnosis. `Clock` is in the JDK for the time calls; the id and the
  random source are supplied the same way, by the shell.
- **Purity is about observable effect, not about avoiding assignment.** A core that builds a
  local `ArrayList` and returns a stable result can be pure when no mutable aliases or
  mutable elements escape or change concurrently. Local mutation can simplify sequential code
  (`java-immutability`).
- Records and sealed outcomes can make input and result contracts clear when their shape
  fits. Keep adequate existing value types or a simple boolean; preserve public consumers.
  An exhaustive `switch` checks new outcomes when its source is recompiled, subject to any
  deliberate catch-all (`java-composition-over-inheritance`).
- Many distributed policies have a pure decision kernel, but breakers, adaptive limits and routing
  depend on concurrent, time-varying state. Model transitions explicitly and test both deterministic
  policy and thread-safe state/effect integration. Separating them from the call they govern is
  what makes them testable without a network, and what stops policy from being reimplemented
  slightly differently at each call site.
- Do not push effects into the core disguised as parameters. A `Runnable`, a `Consumer` or a
  callback handed to the core so it can "just call this" restores the impurity while hiding
  it from the signature.
- The shell is allowed to be dull and repetitive. Resisting duplication there, by inventing an
  abstraction over the effects, is how a humble shell becomes a framework nobody understands.
- **This is a component-level technique, not an architecture.** It composes with any layering
  and any domain-logic organisation, and it does not require ports, adapters or a hexagon
  (`layering-and-boundaries`).

## References

- [Applying the pattern to real components](references/humble-object-patterns.md) — the
  recurring applications: controller and presenter, scheduled job, message listener, gateway,
  and view; what stays in the framework component and what leaves; the Spring-specific version
  of each; and the diagnosis for a component that resists extraction. Read when restructuring a
  specific class that is hard to test.
- [The functional core in Java](references/functional-core-in-java.md) — expressing the core
  with records, sealed outcomes and exhaustive switches; effects as returned data; where
  mutation is legitimate; passing the clock and other ambient inputs; the allocation and
  readability costs and when they exceed the benefit. Read when writing or reviewing the core
  itself.
