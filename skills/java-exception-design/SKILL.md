---
name: java-exception-design
description: >
  Exceptions as API design in Java: checked versus unchecked as a deliberate decision,
  hierarchy sizing, translation at layer boundaries with cause preservation, typed failure
  facts for retry policy, failure atomicity when a method throws
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

Use Java 21 without preview as the example baseline. Before changing a surface, inspect the
project's release/toolchain, framework exception mapping, supported callers and public contracts.
Do not upgrade Java or add dependencies for an example. Mark absent caller or failure-path
evidence explicitly; do not invent handlers or retry guarantees from a type name.

1. **List the failure modes** of the component and classify each one: an expected
   alternative outcome, a recoverable operational failure, or a programming error.
2. **Choose a representation per handling shape.** Expected outcomes that callers normally
   branch on are often data—a sealed result can make handling explicit. Exceptions suit rare
   failures where stack unwinding is useful. Programming errors are normally unchecked and
   fail-fast; catch only at a boundary/cleanup point with a concrete policy.
3. **Size the hierarchy from the handlers and public contract.** Introduce a type where a
   handling policy or supported semantic distinction needs it; attach other facts as fields.
4. **Define the translation at each layer boundary**: which lower-level exceptions cross
   unchanged, which are wrapped — always constructed with the original as cause.
5. **Verify the surface**: every `catch` handles, translates or rethrows; causes and suppressed
   cleanup failures survive; retry policy uses typed facts plus operation semantics, never text.

## Rules

- Checked exceptions are useful when the supported caller population should be forced to
  acknowledge/recover/translate a condition. They become costly through intermediate layers and
  broad APIs. Standard `Function` and similar interfaces do not declare checked exceptions,
  so those boundaries need handling or adaptation, which may be reusable. A throwing functional
  interface can fit an API you control. A checked exception on a narrow, directly-called
  API whose caller genuinely branches on it is still legitimate.
- Unchecked is conventional for programming errors and many framework/domain APIs, but
  it moves discovery away from checked-call-site enforcement to documentation, tests and
  analysis: every public method's relevant unchecked
  failure modes belong in its Javadoc `@throws`.
- Preserve the cause when translating: `throw new PaymentFailedException(msg, e)`. Building a
  new exception from `e.getMessage()` discards the stack trace and the causal chain —
  useful evidence for production debugging.
- Messages carry bounded context approved for their audience: a safe id, state or limit can
  explain the failed condition. Do not assume account identifiers, amounts or upstream text
  are safe merely because they are not credentials; never include tokens or full card numbers.
- Expose typed failure facts—transport phase, status/code, `Retry-After`, whether the remote
  outcome is known—not a universal `isRetryable` verdict. Retry is decided by combining those
  facts with operation idempotency/deduplication, attempt budget, deadline and load policy. A
  timeout after sending a request is an unknown outcome, not proof that retry is safe.
- A failure that is an expected outcome of the operation (a validation report, a
  declined payment, absence in a lookup) often belongs as data. A sealed result enables an
  exhaustive switch when callers choose that form, but cannot prevent them using a default arm or
  ignoring a returned value. An unreachable state is an exception. Sealing an exception hierarchy
  does not make `catch` clauses exhaustive, though it can still control extension/document variants.
- Do not accidentally swallow: `catch (Exception e) { log.warn(...); }` followed by a
  normal return converts a failure into a false success. Handle, translate, or let fly.
- In manual cleanup, attach a secondary failure with `addSuppressed` instead of losing
  it; prefer try-with-resources, which does this automatically.
- Do not log and rethrow at every layer. Add context while preserving the cause, then let one
  owning boundary record the failure; duplicate stack traces inflate cost/cardinality and obscure
  the causal event. Metrics may be emitted at a stable classification boundary without logging
  sensitive payloads.
- Exception construction normally captures stack state; frequent creation/throwing can be costly.
  On a measured hot path, compare data outcomes with the existing exception contract and profile
  the result. Do not depend on VM fast-throw/omitted-stack optimizations for correctness or diagnosis.
- `CompletionException`/`ExecutionException` are transport wrappers, not domain vocabulary.
  Inspect and translate at the async boundary without discarding the original cause; preserve
  cancellation distinctly. Avoid recursive “unwrap until unknown” utilities that erase which
  stage/future supplied the failure.
- Keep detailed causes and diagnostic fields inside the trust boundary. HTTP/RPC responses expose a
  stable error code and safe message/correlation id, not stack traces, SQL, filesystem paths or
  upstream response bodies. java-serialization-hardening owns hostile serialized exception graphs.
- Where the contract promises unchanged state on failure, validate before mutating, order the
  unfailable mutation last, or build the new state and install it with one assignment. Explicitly
  specify alternatives such as partial progress or an invalidated/closed receiver when they fit
  the operation; throwing alone establishes none of these outcomes.
  In-memory atomicity is not transactional atomicity and neither is atomicity across a network.

- Treat interruption/cancellation as control flow, not ordinary transient failure. Propagate
  `InterruptedException` when the API permits; if converting for an outer owner, restore the
  interrupt flag and ensure retry loops stop. A terminal task owner may consume it after cleanup
  and termination. Do not relabel it as a retryable dependency outage.

## Deliverable

For each changed failure path, show the caller-visible outcome, typed facts, cause/cleanup
preservation and compatibility impact. Report the targeted success/failure/cancellation tests
actually executed and remaining gaps. A review finding needs a concrete location and consequence;
grep alone does not establish a lost cause or unsafe retry.

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
