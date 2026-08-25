# Design decisions

## Checked versus unchecked

Ask both questions of the _immediate_ caller, not of some hypothetical top-level handler:

| Question                                          | Yes to both → checked                           | Otherwise → unchecked                          |
| ------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| Can the immediate caller recover?                 | e.g. fall back to a replica, use a cached value | Propagating is not recovering                  |
| Can it do something _other_ than log and rethrow? | The alternative action exists in that method    | "Add throws to the signature" is not an action |

Costs to weigh honestly, in both directions:

- **Checked** infects every signature between throw site and handler, and does not pass
  through `Function`/`Consumer`/`Stream` without a wrapper at every lambda. On an API used
  inside pipelines, that wrapper tax is paid forever.
- **Unchecked** removes the compiler's map of failure modes. Callers discover failures in
  production unless every public method documents its `@throws`. If a review finds an
  undocumented unchecked exception that callers clearly need to branch on, that is the bug.
- The ecosystem has settled on unchecked (Spring translated `SQLException` away decades
  ago) — going against that in framework-adjacent code creates friction with everything
  around it. In a small library with two or three call sites and a genuine recovery path,
  checked still carries its weight.

## Result type versus exception

| Situation                                                                                     | Representation                                       |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Outcome is one of several _expected_ endings (approved/declined, valid/invalid-with-findings) | Sealed result type, exhaustive `switch`              |
| Caller will _always_ branch on the outcome                                                    | Sealed result type                                   |
| Failure is operational and rare; most callers only propagate                                  | Unchecked exception                                  |
| Failure means a bug — broken invariant, illegal argument                                      | Unchecked exception, fail-fast, never caught locally |
| Absence in a single-value lookup                                                              | `Optional` return, not an exception and not null     |

The test: if the "failure" appears in the business requirements ("declined payments are
shown to the customer with the decline reason"), it is an outcome — data. If it appears
only in the runbook ("when the gateway is down, retry"), it is an exception. A result type
costs an extra type and forces handling at every call site — that force is the point, and
also the reason not to use it for failures 95% of callers would only rethrow: it turns one
throw into N boilerplate re-branches.

## Hierarchy sizing

Work backwards from catch blocks that will actually exist:

- One exception type per _distinct handling strategy_, not per failure cause. Thirty
  classes nobody catches separately is taxonomy, not design; the cause belongs in fields
  (a code enum, the offending id) on fewer types.
- One abstract base per module (`BillingException`) is worth having so a boundary can
  catch "anything from billing" — deeper trees need a catch block that justifies each
  level.
- Signals a type is missing: a catch block that branches on `getMessage().contains(...)`
  or on `instanceof` chains over the cause. Signals a type is superfluous: it is thrown
  in one place and caught nowhere, and no field distinguishes it from its sibling.

## Retryability

Encode it at the throw site, where the knowledge lives (a connect timeout is retryable, a
4xx contract violation is not). Either two types (`TransientGatewayException` /
`PermanentGatewayException`) or one type with a `retryable()` accessor fixed at
construction. Choose two types when retry is decided in a catch clause; choose the
property when a generic retry component makes the decision. Never a message substring, and
never "cause is `IOException`" — interrupted I/O and connection-refused both surface as
`IOException` with different retry semantics.

## Detection heuristics

Grep-able signals that this skill applies:

- `new \w+Exception\(.*getMessage\(\)` — cause chain being destroyed.
- `catch (Exception` outside a top-level boundary — over-broad capture mid-stack.
- `catch` body containing only a log call — swallow converting failure to false success.
- `getMessage().contains(` or message regexes in retry/handler code.
- `throws SQLException`, `IOException` or an HTTP client's exception on a domain-layer
  interface — a lower layer's failure vocabulary leaking upward.
- An `exceptions` package with more classes than there are distinct catch sites.

## False positives — code that pattern-matches a violation but is correct

- **A broad catch at a top-level boundary handler** — a request handler, message-consumer
  loop, scheduler tick, or thread's run method. Catching `Exception` (even `Throwable`,
  with rethrow of `Error`) there is correct: it is the place with a uniform answer (500
  response, nack, mark job failed) and it prevents one poison message from killing the
  loop. The obligations that make it correct: log with the full exception object, convert
  to the boundary's failure protocol, and never continue as if the work succeeded.
- **Catch-and-ignore with a comment** for genuinely optional work (best-effort cache
  eviction, metrics emission) — correct when the ignoring is explicit, narrow in type,
  and the operation's failure truly changes nothing for the caller.
- **`InterruptedException` caught to restore the flag** — `Thread.currentThread()
.interrupt()` then wrap or return is the required idiom, not a swallow.
- **Wrapping without a message** (`new DomainException(e)`) is acceptable when the type
  itself says everything the extra sentence would; it is the missing _cause_ that is
  never acceptable.
- **`NumberFormatException` caught around `Integer.parseInt`** on user input — the JDK
  gives no non-throwing parse; catching narrowly and converting to a validation outcome
  is the only option.

## When not to apply

- Do not redesign a working exception surface mid-task because it offends taste; the
  churn touches every caller and the migration itself is where bugs enter. Redesign when
  a concrete symptom exists (lost causes, message parsing, swallow-induced corruption).
- Do not introduce a result type into a codebase that handles the same outcome
  exceptionally everywhere else; local consistency beats global doctrine — record the
  better pattern for the next module instead.
- Public APIs: exception types and `throws` clauses are binary-compatibility surface.
  Narrowing, widening or re-parenting them breaks compiled callers; evolve by adding,
  and deprecate rather than delete.
