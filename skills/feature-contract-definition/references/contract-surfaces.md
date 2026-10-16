# Contract surfaces

Read only the sections matching boundary crossings in the impact map.

## From evidence to clauses

Use this when changing an existing boundary or translating behavior into a contract. Start with
one affected journey: find its producer operation or writer, the response/event/record it exposes,
and a consumer call site, handler, reader or runbook that acts on it. Follow the consumed field or
state to the resulting action, including its failure branch. For independently deployed consumers,
check the supported revision, not just the newest checkout. In a new boundary, use the accepted
consumer scenario and mark implementation evidence as not yet available.

For each changed promise, retain a compact chain in the existing contract or linked review:
source and revision -> relied-on observation -> proposed clause -> verification criterion.
Separate what an accepted specification guarantees, what code or a test demonstrates, and what
a consumer assumes. A stale fixture or one successful request cannot decide between conflicting
sources. A consumer dependency outside the documented promise is still impact evidence; it does
not automatically become an approved guarantee. Record the conflict and its owner under the
existing support policy, continuing clauses that do not depend on that decision.

Inspect materially different consumer behavior, such as an old client with a different fallback,
instead of copying a clause from the first caller found. Record inspected paths/revisions and
material gaps in the existing parties or evidence record. A failed repository lookup, inaccessible
consumer or absent local call site does not prove there are no consumers. For unknown public
consumers, rely on the declared support policy and state the limits of sampled evidence.

When terms such as "accepted", "complete" or "available" imply different actions, locate their
definitions and actual uses before asking. Define the disputed term by the observation it promises,
the conditions for entering/leaving that state, and what the consumer may do then. Keep unresolved
alternatives explicit; persist the resolved meaning in the authoritative specification or existing
glossary and update affected clauses and criteria. This does not authorize renaming wire fields or
states. Existing consumers may depend on them; apply the compatibility policy first.

Pact's [consumer-driven contract explanation](https://docs.pact.io/#consumer-driven-contracts)
illustrates why concrete consumer interactions complement a provider specification. Such examples
cover their selected interactions, not every consumer or an entire business workflow. Its
[testing limits](https://docs.pact.io/faq#what-is-the-difference-between-contract-testing-and-functional-testing)
also distinguish integration contracts from core business-logic tests. Use the project's existing
verification tools; adopting Pact or another API tool is not required by this skill.

## API or RPC

- operation identity, caller, request/response fields and invariants;
- units, precision, time zone/clock semantics, absent versus null/default, and pagination
  or result completeness when callers depend on them;
- validation, error taxonomy, status/code mapping, retryability and idempotency;
- authentication, authorization, rate/capacity limits and sensitive fields;
- versioning, deprecation, old/new caller compatibility and contract tests.

For operations acknowledged before completion, define how terminal success/failure becomes visible,
status/result retention, behavior after expiry, and cancellation semantics if cancellation is supported.
Use the accepted interaction mechanism; route an unresolved mechanism choice back to solution analysis.
[HTTP 202](https://httpwg.org/specs/rfc9110.html#status.202) indicates acceptance for processing,
not completed processing or a guarantee of eventual success.

## Failure and recovery

For a mutation over an API, message or supplier boundary, pair each failure with the known effect
state: no effect, completed, partial, or unknown. Specify the consumer action and recovery owner;
an error code or "retryable" flag alone leaves the risk of repeating an effect unresolved.

- If the established contract makes replay safe, state the identity scope, unchanged payload,
  retention window and result behavior, including concurrent repeats and key expiry. Bound the
  retry obligation by the agreed deadline/budget; do not promise retries indefinitely.
- If replay safety is absent and the effect is unknown, retain that state and use the established
  status/reconciliation path. A missing lookup result proves no effect only if the lookup contract
  guarantees that interpretation, including visibility and retention. If no recovery path exists,
  record that gap and route the mechanism decision; do not invent supplier deduplication.
- For partial success, state which items/effects committed and whether recovery repeats only
  failed items, resumes an operation, or compensates. Cancellation is a request unless the
  contract promises an observable terminal state; define the race with completion.

For HTTP, [RFC 9110 section 9.2.2](https://httpwg.org/specs/rfc9110.html#idempotent.methods)
ties automatic retry of a non-idempotent method to knowledge of idempotent request semantics or
that the original was never applied. Idempotency concerns the intended effect, not an identical
response. A transient failure or a new request identifier is not such evidence.

## Event or message

- event meaning, owner, producer, consumers and schema version;
- delivery guarantee, ordering scope, duplication, replay and poison behavior;
- partition/routing key, correlation/idempotency identity and evolution rules;
- atomicity scope of publication and business effect, acknowledgement meaning, retention and
  consumer recovery; correlation identity is not automatically an idempotency key;
- consumer compatibility evidence and coordinated versus independent rollout.

## Data or schema

- owner, semantics, constraints, null/default behavior and existing-row treatment;
- readers/writers, transaction/consistency assumptions and retention;
- expand/migrate/contract sequence, coexistence window and rollback boundary;
- old-code/new-schema and new-code/old-data verification.

Include existing rows and archived payloads in the supported-version inventory. Backfill
completion and writer cutover need observable criteria; a deployed schema does not prove
all data migrated. State what makes rollback unsafe after new writes or destructive changes.

## External integration

- ownership on both sides, protocol, credentials, limits and availability expectation;
- timeout, retry, duplicate, partial failure and reconciliation semantics;
- unknown-outcome recovery and whether repeated requests reuse an operation identity;
- sandbox/certification evidence, version lifecycle and support escalation.

Link the supplier's applicable published revision or agreement and define local integration
obligations alongside it. Separate documented guarantees from assumptions and observed behavior:
a passing sandbox test does not establish a production guarantee absent from those sources.
When required semantics are missing, record the gap and dependent work; resolve it through the
established decision/support policy rather than rewriting the provider contract. Reuse existing
agreements and authority without requiring fresh supplier approval for already supported behavior.

## Security

- principal identity and trust boundary;
- authorization decision and enforcement point;
- data classification, minimization, audit and prohibited disclosure;
- negative cases and accountable security/compliance approval.

Use the established approval policy and requirements, not an invented compliance mandate.
For a tenant boundary, include a valid identity attempting another tenant's object and define
the expected denial/non-disclosure. Keep secrets and live personal data out of contract fixtures.

## Operational or SLO

- service level indicator, population/window and target;
- telemetry names, alert ownership, diagnosis and recovery obligation;
- capacity envelope, degradation behavior and dependency budget.

Define denominator, exclusions, measurement location and whether the target is a proposed SLO
or an existing commitment. A recovery obligation needs its scope and evidence; do not infer
RTO/RPO from availability percentage alone.

## Interacting surfaces

Read this when a consumer journey depends on several of the surfaces above. Follow one operation
through its applicable checkpoints: acceptance, committed state, event publication, downstream
effect and read visibility. Define which checkpoint each response or event promises, and what
the consumer can observe or must do while later work is pending or has failed. Include the
accepted scope, conditions and limits of any timing promise; a percentile SLO is not a guarantee
for every operation.

For example, a warehouse count edit can commit before a separately updated summary shows it.
The [CQRS considerations](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs#problems-and-considerations)
explain this possible read-model lag. The accepted requirement changes the contract decision:

- If the summary is allowed to lag and an established pending/retry interaction meets the
  requirement, retain that interaction and specify its visible states, recovery and any agreed
  freshness limit. Do not introduce immediate visibility merely because the write succeeded.
- If the same caller must see its accepted edit on the next summary read, an unrestricted stale
  result violates that rule. Return the unsupported mechanism to solution analysis; do not
  quietly weaken the rule or prescribe a new datastore. A proposed weaker rule needs the
  accountable Product decision.

In either case, a planned criterion can delay summary updates after a successful edit and assert
the permitted next-read result. Keep conformance pending until the relevant implementation is
tested. If "complete" has no established meaning, ask which observation it promises, reusing
available decisions instead of choosing a visibility guarantee by convention.

Likewise, a database commit and successful event notification are distinct outcomes; a failure
between them can leave only one completed, as illustrated by
[AWS's dual-write failure cases](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html#transactional-outbox-motivation).
Define the permitted outcome and recovery across the API/data/event contracts before evaluating
a mechanism. Pass the conflicting promises, accepted requirement revisions and failure scenario
to solution analysis, requesting a feasible option for those obligations. If that skill is
unavailable, record the unresolved choice and dependent acceptance; continue drafting independent
surfaces. Do not turn contract definition into implementation of an outbox or transaction protocol.

## Compatibility evidence

For each relevant direction, identify actual artifacts and the observable assertion:

| Pair or scenario                                   | What to establish                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Old consumer with new producer                     | Existing inputs/results/errors retain supported semantics, including unknown fields/enum values        |
| New consumer with old producer                     | Missing/defaulted fields and old failure shapes remain understood                                      |
| New reader with retained old records               | Archived writer versions decode and preserve intended meaning                                          |
| Rollback reader with records written after rollout | Reverting code can still read new writes, or the rollback limit is explicit                            |
| Repeated request after response loss               | Duplicate handling preserves the declared effect and outcome, including key reuse with changed payload |

These are applicability prompts, not five mandatory tests. Select supported combinations
from rollout and retention evidence. Distinguish syntax/code generation, wire decoding,
business semantics and deployed configuration; passing one does not establish the others.
Route format-specific rules to `schema-evolution-and-compatibility` and remote protocol
details to `rpc-and-api-contracts`, checking their claims against the actual versions.

For a Java-facing library or generated SDK, inspect compiler release/toolchains, resolved
generator/runtime dependencies and supported CI/runtime JDKs. This skill sets no Java minimum
and authorizes no upgrade. Check supported caller source compilation and precompiled-client
linkage separately from serialization and runtime behavior: [JLS chapter 13](https://docs.oracle.com/javase/specs/jls/se21/html/jls-13.html#jls-13.2)
distinguishes binary from source compatibility. Use the target release's specification for a
specific change. Google's [AIP-180](https://google.aip.dev/180) likewise distinguishes source,
wire and semantic compatibility; apply its format-specific examples only to matching formats,
not as a universal policy for every boundary.

## Acceptance check

A contract is acceptable when an independent party can answer: what may I send or rely on, what can
fail, what must I do then, which versions coexist, who owns it, and what evidence proves compatibility.
At definition time, planned tests may specify that proof; label them pending rather than
claiming compatibility was observed. For example, "an extra enum value is additive" is not
sufficient: require the supported old consumer's defined behavior for that value.
