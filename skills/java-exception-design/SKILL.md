---
name: java-exception-design
description: >
  Exceptions as API design in Java: checked versus unchecked as a deliberate decision,
  hierarchy sizing, translation at layer boundaries with cause preservation, retryable
  versus non-retryable as an explicit property, failure atomicity when a method throws
  partway through, and when a sealed result type beats an exception. Use when designing the
  exception surface of a service or library, when a catch block swallows a failure or
  rewraps one without its cause, when a codebase has dozens of exception types nobody
  catches separately, or when retry logic parses exception messages. Does not cover input
  validation at trust boundaries (java-defensive-programming) or precondition and
  postcondition semantics (java-design-by-contract).
---

# Java Exception Design

## Purpose

Treat the exceptions a component throws as part of its API, designed with the same care
as its method signatures. The failure modes this skill prevents: hierarchies nobody can
catch usefully, causes lost at layer boundaries, retry policy inferred from message
text, and failures silently converted into false success.

## Workflow

1. **List the failure modes** of the component and classify each one: an expected
   alternative outcome, a recoverable operational failure, or a programming error.
2. **Choose a representation per class.** Expected outcomes are data — a sealed result
   type handled by exhaustive `switch`. Operational failures are exceptions. Programming
   errors are unchecked exceptions thrown fail-fast (`IllegalArgumentException`,
   `IllegalStateException`) and never caught locally.
3. **Size the hierarchy from the handlers.** Introduce a type only where some real catch
   block needs to distinguish it; attach everything else as fields on fewer types.
4. **Define the translation at each layer boundary**: which lower-level exceptions cross
   unchanged, which are wrapped — always constructed with the original as cause.
5. **Verify the surface**: every `catch` handles, translates or rethrows; nothing feeds
   `e.getMessage()` into a new exception; retry policy reads a property, not text.

## Rules

- Checked only when the immediate caller can recover **and** can actually do something —
  both conditions, honestly assessed; most callers can only propagate. Checked also
  composes badly with lambdas and streams (`Function` and friends declare no `throws`),
  so a checked exception on a frequently mapped-over API forces a wrapper at every call
  site. That is the trade, not a law: a checked exception on a narrow, directly-called
  API whose caller genuinely branches on it is still legitimate.
- Unchecked is the modern default for programming errors and most domain failures, but
  it moves discovery from the compiler to documentation: every public method's unchecked
  failure modes belong in its Javadoc `@throws`.
- Wrap with the cause, always: `throw new PaymentFailedException(msg, e)`. Building a
  new exception from `e.getMessage()` discards the stack trace and the causal chain —
  the most expensive information loss there is in production debugging.
- Messages carry the failing values: id, state, limit and actual. "amount exceeds limit"
  costs a log-diving session; "amount 1050.00 exceeds limit 1000.00 for account 8291"
  does not. Never include credentials, tokens or full card numbers.
- Retryable is an explicit property of the type — a distinct exception type or an
  `isRetryable()` accessor set at construction — never inferred from message text.
- A failure that is an expected outcome of the operation (a validation report, a
  declined payment, absence in a lookup) is data: model it as a sealed result type so
  `switch` exhaustiveness forces the caller to handle every case. An unreachable state
  is an exception. Sealing an exception hierarchy itself buys little: `catch` clauses
  are never exhaustiveness-checked.
- No catch block may swallow: `catch (Exception e) { log.warn(...); }` followed by a
  normal return converts a failure into a false success. Handle, translate, or let fly.
- In manual cleanup, attach a secondary failure with `addSuppressed` instead of losing
  it; prefer try-with-resources, which does this automatically.
- A method that throws leaves its receiver as it found it: validate before mutating, order the
  unfailable mutation last, or build the new state and install it with one assignment. Where
  that is deliberately not true — a batch that keeps partial progress — say so in the Javadoc.
  In-memory atomicity is not transactional atomicity and neither is atomicity across a network.

## References

- [Design decisions](references/design-decisions.md) — checked/unchecked and
  result-versus-exception decision tables, hierarchy sizing heuristics, detection
  patterns, and the catch blocks that look wrong but are correct. Read when choosing a
  representation or reviewing an existing surface.
- [Worked example: a payment gateway's exception surface](references/payment-surface.md)
  — read when designing or overhauling failure handling for a service that crosses a
  process boundary.
- [Failure atomicity](references/failure-atomicity.md) — read when a method mutates state and
  can throw partway through, when a caller retries after catching, or when in-memory state and
  a transaction or a remote call can disagree after a failure.
