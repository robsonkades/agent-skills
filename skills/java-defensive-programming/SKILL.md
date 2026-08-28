---
name: java-defensive-programming
description: >
  Where to defend in Java and where defence becomes noise: trust boundaries as the
  organising idea, preconditions with Objects.requireNonNull and explicit range and state
  checks, fail-fast over limping on, input normalisation at the edge, and assert for
  internal invariants only. Use when adding or reviewing validation, when the same invariant
  is re-checked on every layer, when code silently "corrects" bad input or wraps everything
  in catch-alls, or when hardening a public API. Does not cover contract semantics and
  Javadoc documentation (java-design-by-contract), nullability contracts and annotations
  (java-null-safety), defensive copy mechanics (java-immutability), or the design of the
  exceptions thrown (java-exception-design).
---

# Java Defensive Programming

## Purpose

Concentrate defence at trust boundaries and remove it everywhere else. The two failure
modes this skill prevents are opposites: the unguarded boundary that lets bad data deep
into the system before anything fails, and the codebase where every private method
re-checks every argument — noise that buries the checks that matter and asserts that
nobody knows where validation actually happened.

## Workflow

1. **Identify the trust boundaries** — where data arrives from code you do not control:
   deserialised requests, message payloads, file and database reads, configuration,
   and every public entry point of a published library. When unsure whether a seam is a
   boundary, read [references/trust-boundaries.md](references/trust-boundaries.md).
2. **At each boundary, normalise first, then validate**: strip, canonicalise case and
   form once, then check — each check naming the violated expectation and the offending
   value. Reject; never repair.
3. **Make the validated state a type.** Parse raw input into a record whose compact
   constructor enforces the checks. Inside the boundary, `CustomerId` circulating means
   the null- and format-checks are _unnecessary_, not merely skipped.
4. **Delete the now-redundant interior checks.** Hardening a boundary without removing
   the duplicate checks inside it delivers the noise without the safety.
5. **Guard interior invariants with `assert`** where a broken one would fail far from
   its cause — and only there.

## Rules

- Every precondition names its expectation: `Objects.requireNonNull(customerId,
"customerId")`; range and state checks report expected and actual — "quantity must be
  > 0, was -3", not "invalid quantity".
- Fail fast. A detected-but-tolerated bad state fails later, further from the cause,
  after possibly writing corrupt data. Distance from cause to failure is the cost being
  managed.
- Never silently correct: clamping a negative amount to zero, substituting a default
  currency, or swallowing an unparseable date hides the caller's bug and turns it into
  wrong data. Correction is only acceptable as _documented normalisation_ of
  representation (whitespace, case, Unicode form) — never of meaning.
- `assert` is for internal invariants only. It is disabled by default (enabled with
  `-ea`), so an assert on untrusted input or a public-API precondition is a check that
  does not run in production. Public preconditions throw; asserts state what the code
  itself guarantees.
- Do not null-check what cannot be null by construction. A record that
  `requireNonNull`s its components makes every downstream reader of those components
  null-free; a check there implies a falsehood about where nulls can occur.
- No catch-all "just in case" wrappers around interior calls. Exception handling
  strategy — what to catch where — belongs to java-exception-design.
- A published library's public methods are a boundary even when all current callers are
  "your own" code: validate them like external input.

## References

- [Trust boundaries](references/trust-boundaries.md) — how to find the boundaries in a
  real codebase, heuristics for ambiguous seams, and the checks that look redundant but
  are load-bearing. Read before deleting any existing check.
- [Worked example: hardening one boundary](references/hardening-example.md) — before →
  after on a refund endpoint, including the interior checks the change deletes. Read
  when applying the workflow to real code.
