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

Inspect the target compiler release/toolchain, framework/mapper versions and configuration,
construction paths and published failure contracts before editing validation. No single
authoring baseline is declared; references use Java SE 25, records require Java 16+ and
`String.strip` Java 11+. Use ordinary validated classes or the existing compatible policy on
older targets; do not upgrade Java/frameworks or enable preview. Missing mapper/caller evidence
means check removal remains conditional, not proven safe.

1. **Identify the trust boundaries** — where data arrives from code you do not control:
   deserialised requests, message payloads, file and database reads, configuration,
   and every public entry point of a published library. When unsure whether a seam is a
   boundary, read [references/trust-boundaries.md](references/trust-boundaries.md).
2. **Bound before expensive work.** Limit bytes, nesting, collection counts and decompressed
   expansion; decode strictly; then apply only contract-defined canonicalization and validate
   semantics. Preserve raw input separately only when audit/legal needs justify its risk.
3. **Carry validated state across trusted calls.** Retain an adequate validated class or
   local check; introduce a value type when it makes invariant ownership clearer than passing
   raw values. A record with a validating compact constructor is one option, not a required
   API migration. A non-null `CustomerId` can carry its component's
   format invariant across trusted calls. The variable holding that record can still be
   null; mutable components and unverified construction paths need separate evidence.
4. **Delete only proven-redundant checks.** Keep constructor invariants, authorization,
   concurrency/transaction rechecks and checks protecting a different state transition.
5. **Use assertions diagnostically, never as required enforcement.** If disabling a check could
   permit corruption, disclosure or an invalid side effect, use an explicit runtime check.

## Rules

- Preconditions identify the field/expectation while preserving the published failure contract.
  Use stable codes where callers consume them; do not replace an established exception API merely
  to add codes. Include values only when bounded and non-sensitive; otherwise omit/redact them
  and use a safe correlation id. Hashing a secret does not by itself make it safe to expose.
- Fail fast before irreversible effects for one invalid operation. Batch/stream boundaries may
  isolate bad items and return an aggregate report, but must not acknowledge invalid work as
  successful or continue with corrupted shared state.
- Do not silently change meaning. Defaults and clamping may be permanent, explicit domain/API
  behavior. Distinguish them from undocumented repairs and temporary migration coercions; the
  latter need an owned compatibility policy and evidence for any planned retirement. Changing
  accepted input or failure behavior requires a deliberate consumer-compatible transition.
  Representation normalization is likewise contract-specific: case, whitespace and Unicode changes
  can alter identifiers, signatures or user-visible text.
- `assert` is disabled by default (enabled with `-ea`) and must have no required side effects. Use it
  for diagnostic internal claims whose removal does not change correctness. Public/trust-boundary
  preconditions and corruption-prevention invariants require ordinary control flow/exceptions.
- Remove repeated component checks only after establishing a non-null validated object,
  invariant-preserving accessors and safe ownership. Constructor validation does not make
  the record reference non-null or mutable component contents permanently valid.
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

Deliver each added/removed check with its owning boundary or state transition, failure
contract, and tests executed. Exercise hostile input, direct construction and bypass paths;
verify invalid input causes no protected effect. Distinguish proposed framework/error-mapping
checks from executed results, and keep regression coverage for every supported entry point.

- [Trust boundaries](references/trust-boundaries.md) — how to find the boundaries in a
  real codebase, heuristics for ambiguous seams, and the checks that look redundant but
  are load-bearing. Read before deleting any existing check.
- [Worked example: hardening one boundary](references/hardening-example.md) — before →
  after on a refund endpoint, including the interior checks the change deletes. Read
  when applying the workflow to real code.
