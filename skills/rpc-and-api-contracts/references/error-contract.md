# The error contract in Java

## The wire shape, with contract and diagnostics separated

RFC 9457 (`application/problem+json`) defines `type`, `title`, `status`, `detail` and
`instance`, and permits extension members. `type` is the standard primary problem identifier; application-specific machine data can
use extension members, never encoded inside `detail`. The body `status` is advisory; use the
actual HTTP status for HTTP processing and handle inconsistencies conservatively.

```json
{
  "type": "https://errors.example.com/payment/insufficient-funds",
  "title": "Insufficient funds",
  "status": 422,
  "detail": "The payment cannot be completed with the available funds.",
  "instance": "/payments/9f2c",
  "code": "PAYMENT_INSUFFICIENT_FUNDS",
  "outcome": "REJECTED",
  "retryCondition": "AFTER_STATE_CHANGE",
  "correlationId": "01J8Z5R4Q2A7"
}
```

| Member                                                    | Contract?  | Consequence                                                             |
| --------------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `type`, `code`, `outcome`, `retryCondition`, `retryAfter` | yes        | meanings remain stable; new values require an unknown-value rule        |
| `title`, `detail`                                         | no         | may be reworded, localised or redacted at any time — document this      |
| `instance`, `correlationId`                               | diagnostic | for correlating with logs and traces; clients must never branch on them |

Documenting `detail` as non-contract is what stops clients parsing it. Left unsaid, they will.

## The record

Partial Java 16+ internal representation, not a serializer-ready wire guarantee. Define
extension encoding explicitly, including duration units, null/omission and URI handling.
`Outcome` and `RetryCondition` below stand for application types with conservative handling
of unknown/missing wire values; ordinary closed-enum deserialization can fail before the
adapter runs. Decode unknown strings without classifying the effect as rejected.

```java
public record ProblemDetails(
        URI type, String title, int status, String detail, URI instance,
        String code,             // extensible namespaced value; never reuse/repurpose
        Outcome outcome,         // REJECTED | UNKNOWN; APPLIED only with durable evidence
        RetryCondition retryCondition, // NEVER | UNCHANGED | AFTER_DELAY | AFTER_STATE_CHANGE
        Duration retryAfter,     // nullable/optional when there is no credible advice
        URI operationStatus,
        String correlationId) {}
```

Spring Framework 6+ exposes `ProblemDetail` and the `ErrorResponse` contract for producing this shape from
a handler; the in-process exception hierarchy that feeds it is java-exception-design's
subject. What matters here is that the mapping from an internal failure to a `code` lives in
one boundary component, so known mappings are enumerable/testable and unknown values have one
documented conservative path.

## Rules for the code set

- Codes are namespaced by domain, added freely, and **never reused or repurposed**. Removing
  one is only safe once no client can still be holding it in a branch.
- Many codes map onto one HTTP status. Do not collapse them: the status tells an intermediary
  what happened, the code tells the client what to do.
- Adding a code is additive only if clients handle unknown values. Preserve `UNKNOWN` outcome
  rather than silently treating a possibly applied write as rejected. Automatic retry remains
  off unless method/idempotency and retry condition prove it safe.
- A code's outcome and retry-condition meanings are part of its identity. Changing them
  silently rewrites client recovery and is breaking.

## The one place a status becomes a decision

The boundary adapter follows this pseudocode, with HTTP parsing and validation kept outside
the domain failure type:

```text
Read actual HTTP status, media type and bounded body.
If absent, malformed, inconsistent or not an accepted problem contract:
    preserve status; classify mutation outcome as UNKNOWN after dispatch.
Resolve the problem type; do not automatically fetch its URI.
Interpret known extensions using the method's published contract.
For unknown/missing code, outcome or retry condition, use conservative defaults.
Validate delay and operation-status URI before returning a domain failure.
```

Do not trust an arbitrary non-null body as retry authority. Status URIs need the client's
allowed scheme/authority and credentials policy; never forward credentials to an arbitrary
URI supplied by a peer.

The shape this exists to eliminate:

```java
if (e.getMessage().contains("duplicate key")) { ... }   // couples the client to the
                                                        // provider's database and its wording
```

The client still evaluates method semantics, stable idempotency key, deadline and current
state. `AFTER_STATE_CHANGE` means reread/recompute; it does not mean replay identical bytes.
`AFTER_DELAY` supplies a minimum hint, not a reservation. HTTP `Retry-After` is an HTTP-date
or non-negative integer seconds, not a Java Duration JSON value. For relative advice round
positive fractional seconds up (1 ms → 1 s, 1001 ms → 2 s), reject invalid/overflowing input,
and respect the remaining deadline; do not shorten the hint just to fit it. Define clock-skew
handling for dates and precedence if both header and extension advice exist. An unstructured HTTP failure after
dispatch is `UNKNOWN` for a mutation, even if the status often suggests transient infrastructure.

Classifying the outcome for retry purposes — transient, permanent, ambiguous — and acting on
it is retries-and-backoff's; this reference only defines what the wire must carry so that the
classification does not have to be invented at the client.

## gRPC status mapping

The status enum provides vocabulary, not method-specific outcome certainty for free.

| Status                | Means                                              | Client action                                                          |
| --------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `INVALID_ARGUMENT`    | The request is wrong and will stay wrong           | Permanent. Fix the input                                               |
| `FAILED_PRECONDITION` | System state forbids it right now                  | Do not retry until the state changes                                   |
| `ABORTED`             | Concurrency conflict, typically a transaction      | Restart enclosing operation only when safe under its contract          |
| `ALREADY_EXISTS`      | Resource already exists; identity/cause may differ | Treat as prior success only after matching operation/resource identity |
| `UNAVAILABLE`         | Service currently unavailable or path failed       | Retry safe operation within policy; mutation outcome may be unknown    |
| `RESOURCE_EXHAUSTED`  | Quota or capacity limit                            | Back off; honour any advice the server attached                        |
| `DEADLINE_EXCEEDED`   | The wait failed; the work may or may not be done   | **Ambiguous** — retry only under idempotency                           |
| `INTERNAL`, `UNKNOWN` | Unclassified/internal failure                      | Preserve ambiguity; do not retry mutation blindly; alert               |

## Testing the error contract

- **Known mappings plus extensibility.** Walk known codes and assert stable status/outcome/
  retry condition; feed an unknown code/enum and assert conservative forward-compatible behavior.
- **Contract tests for failures.** Record at least one interaction per code class, not only
  the happy path. The error surface is the part clients branch on and the part suites usually
  omit.
- **Unknown-code handling.** Feed the client a code it does not know and assert it applies the
  documented default rather than throwing. This is the test that makes adding a code additive.

## Security and observability

- `detail`, validation values, stack traces and `instance` must not expose credentials,
  internal SQL/paths or another tenant's resource existence. Authorize before returning a
  replayed problem/result.
- Keep correlation IDs opaque and bounded. Do not trust caller-supplied IDs as trace authority
  or put high-cardinality IDs in metric labels.
- Record problem type/code and outcome class in bounded metrics; full instance/operation IDs
  belong in protected traces/logs.

## Primary references

- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
- [gRPC status codes](https://grpc.io/docs/guides/status-codes/)
- [Google RPC error details](https://cloud.google.com/apis/design/errors#error_details)
- [RFC 9110 Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) — date or integer delay-seconds.
