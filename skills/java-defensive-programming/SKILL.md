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

Concentrate each defence at the boundary or state transition that owns its invariant, then remove
only checks proven redundant. The two failure
modes this skill prevents are opposites: the unguarded boundary that lets bad data deep
into the system before anything fails, and the codebase where every private method
re-checks every argument — noise that buries the checks that matter and asserts that
nobody knows where validation actually happened.

## Workflow

1. **Identify the trust boundaries** — where data arrives from code you do not control:
   deserialised requests, message payloads, file and database reads, configuration,
   and every public entry point of a published library. When unsure whether a seam is a
   boundary, read [references/trust-boundaries.md](references/trust-boundaries.md).
2. **Bound before expensive work.** Limit bytes, nesting, collection counts and decompressed
   expansion; decode strictly; then apply only contract-defined canonicalization and validate
   semantics. Preserve raw input separately only when audit/legal needs justify its risk.
3. **Make the validated state a type.** Parse raw input into a record whose compact
   constructor enforces the checks. Inside the boundary, `CustomerId` circulating means
   the null- and format-checks are _unnecessary_, not merely skipped.
4. **Delete only proven-redundant checks.** Keep constructor invariants, authorization,
   concurrency/transaction rechecks and checks protecting a different state transition.
5. **Use assertions diagnostically, never as required enforcement.** If disabling a check could
   permit corruption, disclosure or an invalid side effect, use an explicit runtime check.

## Rules

- Preconditions identify the field/expectation with a stable error code. Include actual values only
  when they are bounded and non-sensitive; otherwise redact/hash and retain a correlation id.
- Fail fast before irreversible effects for one invalid operation. Batch/stream boundaries may
  isolate bad items and return an aggregate report, but must not acknowledge invalid work as
  successful or continue with corrupted shared state.
- Do not silently change meaning. Defaults, clamping and migration coercions are acceptable only as
  an explicit, versioned compatibility policy with telemetry and a removal/ownership decision.
  Representation normalization is likewise contract-specific: case, whitespace and Unicode changes
  can alter identifiers, signatures or user-visible text.
- `assert` is disabled by default (enabled with `-ea`) and must have no required side effects. Use it
  for diagnostic internal claims whose removal does not change correctness. Public/trust-boundary
  preconditions and corruption-prevention invariants require ordinary control flow/exceptions.
- Do not null-check what cannot be null by construction. A record that
  `requireNonNull`s its components makes every downstream reader of those components
  null-free; a check there implies a falsehood about where nulls can occur.
- No catch-all "just in case" wrappers around interior calls. Exception handling
  strategy — what to catch where — belongs to java-exception-design.
- A published library's public methods are compatibility/trust boundaries even when current callers
  are internal. Enforce the documented contract; do not mechanically check every parameter when a
  natural operation already provides the same stable failure and the performance/API policy says
  so.
- Defend availability as well as value correctness: cap input/body/collection sizes, nesting,
  decompression ratios, regex/parser work, numeric ranges and per-request concurrency before
  allocating proportional state. Apply deadlines/cancellation at blocking boundaries. A syntactically
  valid payload can still be a resource-exhaustion attack.
- Validation is not authorization and escaping is sink-specific. Revalidate tenant/resource access
  at the operation, and parameterize/escape where data enters SQL, HTML, shells, paths or logs;
  java-application-security-basics and java-strings-and-text own those controls.

## References

- [Trust boundaries](references/trust-boundaries.md) — how to find the boundaries in a
  real codebase, heuristics for ambiguous seams, and the checks that look redundant but
  are load-bearing. Read before deleting any existing check.
- [Worked example: hardening one boundary](references/hardening-example.md) — before →
  after on a refund endpoint, including the interior checks the change deletes. Read
  when applying the workflow to real code.
