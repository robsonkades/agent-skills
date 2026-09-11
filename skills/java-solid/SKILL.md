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
evidence of concrete harm or a credible committed constraint; otherwise there is no finding.

## Workflow

0. **Establish compatibility and contract scope.** Inspect compiler release/toolchains,
   framework requirements, public consumers and accepted null/error/mutation behavior.
   The worked refactoring targets Java 21 without preview; records need Java 16+, sealed
   types Java 17+, and pattern switches/record patterns Java 21+ without preview. Keep older
   targets using ordinary classes/polymorphism rather than upgrading or enabling preview.
1. **Read the change, requirements, ownership and history.** For mature code, `git log --follow`
   exposes independent pressures. For new code, use accepted requirements, extension contracts,
   team/release boundaries and known failure modes; invented future variation is not evidence.
   Reuse supplied context; ask only for missing consumer or ownership facts that could change
   the conclusion. Continue independent checks and keep unresolved candidates conditional.
2. **Generate candidates with the per-principle heuristics** in the references.
   Heuristics produce suspicions, never findings.
3. **Find the harm for each candidate.** Name the future change that becomes
   riskier, the caller that can break, or the test that cannot be written. A
   candidate with no nameable harm is dropped, not softened into a nitpick.
4. **Check the candidate against the false positives** in the references before
   writing anything.
5. **Write the finding** in the format below, and **cost the recommendation**: a
   split costs navigation and wiring, an extension point costs indirection and API
   surface. Compare the smallest sufficient change with retaining the current design. If
   restructuring costs outweigh its benefit, report a supported deferral/no-change result;
   do not relabel a required contract violation as harmless merely because repair is costly.

## Finding format

Observation → impact → evidence → recommendation → validation → what to avoid.
Use actual repository evidence; the counts in this illustrative finding are not facts to reuse:

> **Observation:** `TariffService` computes customs duty and renders the CSV
> customs declaration. **Impact:** the next duty-rule change risks breaking the
> declaration format, which the customs broker parses. **Evidence:** 14 commits in
> six months — 9 touch only rate logic, 5 touch only CSV layout; two different
> authors own them. **Recommendation:** move declaration rendering behind its own
> type; the duty calculator keeps no knowledge of the file format. **Validation:** compare
> duty outcomes and exact CSV output for existing caller fixtures. **Avoid:**
> splitting the calculator itself — its methods change together, so it is one
> responsibility regardless of its size.

## Rules

- A responsibility is a _reason to change_ owned by an actor/authority. Independent history is
  strongest evidence in existing code; accepted requirements and ownership boundaries are valid
  evidence before the first commit. Counts are only search signals.
- Do not recommend an extension point for imagined variation. OCP responds to observed variants
  or an explicit published/plugin requirement with committed consumers and compatibility needs.
- A sealed hierarchy with exhaustive switches trades open variant extension for source
  coverage: adding a newly uncovered variant can reveal missing cases when consumers are
  recompiled. A `default` or covering type pattern, including an arm for a non-sealed branch,
  may already cover it. Independently deployed old binaries can instead encounter
  `MatchException`. Judge the actual coverage and fallback policy, not just the absence of `default`.
- LSP: an override may weaken preconditions and strengthen postconditions, never the reverse.
  Investigate checks or failures added for inputs the supertype accepts, weakened effects,
  thread-safety/nullness guarantees, and equality policies that become asymmetric across
  subclasses. New subtype methods must also preserve inherited invariants and history
  constraints. A more specific exception for the same documented failure is not a violation.
- ISP: judge an interface by its clients, not its method count. The evidence is a
  client harmed by capabilities/changes it does not need, or an implementor unable to honor
  required operations. Unused methods or `UnsupportedOperationException` are signals, not
  proof: inspect optional-operation and failure contracts first.
- DIP in one paragraph: policy should not depend on mechanism; both depend on
  abstractions — but only where a genuine seam exists, because an interface with
  one implementation and no seam is indirection. The full treatment — ports and
  adapters, plain-Java injection, JPMS, the interface-per-class critique — is the
  java-dependency-inversion skill. Consult it before any finding that asks for a
  new interface.

For an implemented recommendation, distinguish mechanical restructuring from API, validation
or policy changes; report checks actually run. Missing history does not establish independent
responsibilities, and a new interface does not by itself demonstrate lower coupling.
Stop when supported findings and their validation or remaining evidence gaps are clear.
An adequate design with no findings is a complete review outcome.

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
