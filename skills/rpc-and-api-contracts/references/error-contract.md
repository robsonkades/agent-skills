# The error contract in Java

## The wire shape, with contract and diagnostics separated

RFC 9457 (`application/problem+json`) defines `type`, `title`, `status`, `detail` and
`instance`, and permits extension members. The machine-readable part goes in extension
members, never encoded inside `detail`.

```json
{
  "type": "https://errors.example.com/payment/insufficient-funds",
  "title": "Insufficient funds",
  "status": 422,
  "detail": "Balance 12.30 is below the requested 40.00",
  "instance": "/payments/9f2c",
  "code": "PAYMENT_INSUFFICIENT_FUNDS",
  "retryable": false,
  "correlationId": "01J8Z5R4Q2A7"
}
```

| Member                                              | Contract?  | Consequence                                                             |
| --------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `type`, `status`, `code`, `retryable`, `retryAfter` | yes        | changing one is a breaking change and needs a version                   |
| `title`, `detail`                                   | no         | may be reworded, localised or redacted at any time — document this      |
| `instance`, `correlationId`                         | diagnostic | for correlating with logs and traces; clients must never branch on them |

Documenting `detail` as non-contract is what stops clients parsing it. Left unsaid, they will.

## The record

```java
public record ProblemDetails(
        URI type, String title, int status, String detail, URI instance,
        String code,             // closed set, SCREAMING_SNAKE, namespaced, never reused
        boolean retryable,
        Duration retryAfter,     // Duration.ZERO when the server has no advice
        String correlationId) {}
```

Spring exposes `ProblemDetail` and the `ErrorResponse` contract for producing this shape from
a handler; the in-process exception hierarchy that feeds it is java-exception-design's
subject. What matters here is that the mapping from an internal failure to a `code` lives in
exactly one class, so the closed set is enumerable and testable.

## Rules for the code set

- Codes are namespaced by domain, added freely, and **never reused or repurposed**. Removing
  one is only safe once no client can still be holding it in a branch.
- Many codes map onto one HTTP status. Do not collapse them: the status tells an intermediary
  what happened, the code tells the client what to do.
- Adding a code is additive **only if** the contract already says how to treat an unknown one.
  State the default explicitly — "an unrecognised code is non-retryable" is a good default,
  because the alternative is clients inventing their own.
- A code's retryable classification is part of its identity. Changing it silently rewrites
  every client's retry policy, which is why it appears in the breaking-change list.

## The one place a status becomes a decision

```java
// Conceptual: the adapter boundary. Above this line no caller sees a status code or a body.
static Failure toFailure(int status, ProblemDetails body) {
    if (body != null) {
        return new Failure(body.code(), body.retryable(), body.retryAfter());
    }
    // Fallback only, for a peer that does not implement the contract.
    return new Failure("HTTP_" + status, retryableByStatus(status), Duration.ZERO);
}

static boolean retryableByStatus(int status) {
    return status == 408 || status == 429 || status == 502 || status == 503 || status == 504;
}
```

The shape this exists to eliminate:

```java
if (e.getMessage().contains("duplicate key")) { ... }   // couples the client to the
                                                        // provider's database and its wording
```

Note what the fallback costs: without the `retryable` member, a client must guess from the
status, and a 500 that was in fact a permanent validation defect gets retried three times.
That guess is the reason the flag belongs in the contract.

Classifying the outcome for retry purposes — transient, permanent, ambiguous — and acting on
it is retries-and-backoff's; this reference only defines what the wire must carry so that the
classification does not have to be invented at the client.

## gRPC status mapping

The status enum is closed, so it carries the classification for free — provided the server
uses it rather than defaulting everything to `INTERNAL`.

| Status                | Means                                                  | Client action                                          |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| `INVALID_ARGUMENT`    | The request is wrong and will stay wrong               | Permanent. Fix the input                               |
| `FAILED_PRECONDITION` | System state forbids it right now                      | Do not retry until the state changes                   |
| `ABORTED`             | Concurrency conflict, typically a transaction          | Retry the enclosing operation, not the call            |
| `ALREADY_EXISTS`      | The create was applied, possibly by a previous attempt | Usually the idempotent success case — treat it as such |
| `UNAVAILABLE`         | The peer is transiently unreachable                    | The one status retryable by default, with backoff      |
| `RESOURCE_EXHAUSTED`  | Quota or capacity limit                                | Back off; honour any advice the server attached        |
| `DEADLINE_EXCEEDED`   | The wait failed; the work may or may not be done       | **Ambiguous** — retry only under idempotency           |
| `INTERNAL`, `UNKNOWN` | Unclassified defect                                    | Do not retry blind; alert                              |

## Testing the error contract

- **Exhaustiveness.** A test that walks the declared code set and asserts each maps to exactly
  one status and one retryable classification. A code with no mapping is a runtime surprise.
- **Contract tests for failures.** Record at least one interaction per code class, not only
  the happy path. The error surface is the part clients branch on and the part suites usually
  omit.
- **Unknown-code handling.** Feed the client a code it does not know and assert it applies the
  documented default rather than throwing. This is the test that makes adding a code additive.
