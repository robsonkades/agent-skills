---
name: java-solid
description: >
  The five SOLID principles as decision tools for evidence-based Java review, with depth on
  single responsibility, open-closed, Liskov substitution and interface segregation. Use
  when reviewing a design or pull request against SOLID, when a principle is being cited to
  justify a change, when deciding whether a class has too many responsibilities, or when an
  override breaks substitutability. Dependency inversion depth lives in
  java-dependency-inversion, contract formalism for LSP in java-design-by-contract, and
  cohesion/coupling vocabulary in java-cohesion-coupling.
---

# Java SOLID Review

## Purpose

Turn the five principles from slogans into review findings a staff engineer would
sign. The failure mode this skill exists to prevent is the slogan review: "violates
SRP" pinned to a class because it is long, "needs an interface for OCP" pinned to
code with no variation in sight. A principle names a finding only when there is
evidence of concrete harm; otherwise there is no finding.

## Workflow

1. **Read the change and its history.** Principles predict future change, and the
   change log is the best available evidence of it — `git log --follow` on the
   files in question, looking for unrelated pressures landing on one type.
2. **Generate candidates with the per-principle heuristics** in the references.
   Heuristics produce suspicions, never findings.
3. **Find the harm for each candidate.** Name the future change that becomes
   riskier, the caller that can break, or the test that cannot be written. A
   candidate with no nameable harm is dropped, not softened into a nitpick.
4. **Check the candidate against the false positives** in the references before
   writing anything.
5. **Write the finding** in the format below, and **cost the recommendation**: a
   split costs navigation and wiring, an extension point costs indirection and API
   surface. If the cost plausibly exceeds the harm, downgrade the finding to an
   observation and say so.

## Finding format

Observation → impact → evidence → recommendation → what to avoid. One finding:

> **Observation:** `TariffService` computes customs duty and renders the CSV
> customs declaration. **Impact:** the next duty-rule change risks breaking the
> declaration format, which the customs broker parses. **Evidence:** 14 commits in
> six months — 9 touch only rate logic, 5 touch only CSV layout; two different
> authors own them. **Recommendation:** move declaration rendering behind its own
> type; the duty calculator keeps no knowledge of the file format. **Avoid:**
> splitting the calculator itself — its methods change together, so it is one
> responsibility regardless of its size.

## Rules

- A responsibility is a _reason to change_, evidenced by change actually arriving
  independently. Method count, line count and import count are prompts to look at
  the history, never evidence by themselves.
- Never recommend an extension point for variation that does not exist yet. OCP is
  a response to observed variation — the same conditional edited by successive
  features — not a default posture.
- A sealed hierarchy with exhaustive switches deliberately trades OCP for
  compile-checked exhaustiveness: adding a variant is _meant_ to break every
  switch. That trade is a feature; a `default` branch there would silently absorb
  future variants. Not a finding.
- LSP: an override may weaken preconditions and strengthen postconditions, never
  the reverse. Hunt three concrete shapes: a precondition check added in an
  override, a new exception thrown from an override, and asymmetric `equals`
  across a subclass.
- ISP: judge an interface by its clients, not its method count. The evidence is a
  client depending on methods it never calls, or an implementor forced to throw
  `UnsupportedOperationException`.
- DIP in one paragraph: policy should not depend on mechanism; both depend on
  abstractions — but only where a genuine seam exists, because an interface with
  one implementation and no seam is indirection. The full treatment — ports and
  adapters, plain-Java injection, JPMS, the interface-per-class critique — is the
  java-dependency-inversion skill. Consult it before any finding that asks for a
  new interface.

## References

- [SRP and OCP](references/srp-and-ocp.md) — detection heuristics, false positives
  and when not to apply. Read when the candidate concerns responsibilities or
  extension points.
- [LSP and ISP](references/lsp-and-isp.md) — the substitution rules with compilable
  violation examples, and interface segregation including default methods as both
  pressure valve and trap. Read when the candidate concerns a hierarchy or an
  interface's shape.
- [Worked refactoring](references/worked-refactoring.md) — a payments class taken
  from evidence to split, with trade-offs and verification. Read before writing a
  recommendation that restructures a class.
