# Design decisions

## Checked versus unchecked

Decide for the supported caller population and layering, not one hypothetical call site:

| Signal                                                         | Favors checked                                    | Favors unchecked/result                          |
| -------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| callers must acknowledge a recoverable environmental condition | checked exception on a narrow, direct API         | —                                                |
| most layers can only propagate/translate                       | signature noise and fragile catch chains dominate | unchecked with documented typed failure          |
| outcome is frequent and callers branch                         | —                                                 | sealed result/data                               |
| functional/async composition is primary                        | checked adapters proliferate                      | result/future exceptional completion by contract |

Costs to weigh honestly, in both directions:

- **Checked** infects every signature between throw site and handler, and does not pass
  through `Function`/`Consumer`/`Stream` without a wrapper at every lambda. On an API used
  inside pipelines, that wrapper tax is paid forever.
- **Unchecked** removes the compiler's map of failure modes. Callers discover failures in
  production unless every public method documents its `@throws`. If a review finds an
  undocumented unchecked exception that callers clearly need to branch on, that is the bug.
- Many modern frameworks expose unchecked failures, while JDK APIs still use checked failures for
  I/O and interruption. Consistency with the surrounding API matters, but does not replace an
  explicit caller/migration analysis.

## Result type versus exception

| Situation                                                                                     | Representation                                       |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Outcome is one of several _expected_ endings (approved/declined, valid/invalid-with-findings) | Sealed result type, exhaustive `switch`              |
| Caller will _always_ branch on the outcome                                                    | Sealed result type                                   |
| Failure is operational and rare; most callers only propagate                                  | Unchecked exception                                  |
| Failure means a bug—broken invariant, illegal argument                                        | Unchecked exception; catch only at a policy boundary |
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
- Add a module base (`BillingException`) only when a boundary genuinely has one safe policy for
  every such failure; otherwise it encourages over-broad catches. Deeper levels need a handler or
  stable semantic distinction that justifies each branch.
- Signals a type/fact is missing: a catch block that branches on `getMessage().contains(...)`
  or on `instanceof` chains over the cause. Signals a type is superfluous: it is thrown
  in one place, is not part of a supported public contract, and no handler/field distinguishes it
  from its sibling.

## Retryability

Encode facts at the throw site, where transport knowledge lives: failure before/after request
commit, HTTP/gateway code, retry delay, remote outcome known/unknown, throttling and interruption.
The caller/policy then combines them with whether this operation is idempotent or deduplicated,
remaining deadline/attempt budget and current load. “Transient” does not mean “safe to retry,” and
“permanent” may change after operator/configuration action. Never parse a message or classify all
`IOException`s alike.

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

- **A broad catch at a top-level boundary handler**—a request handler, message-consumer loop,
  scheduler tick, or thread task—can be correct where a uniform protocol exists. Handle
  interruption/cancellation separately; catch `Throwable` only for cleanup/reporting and rethrow
  fatal `Error`s. Log/record once with the exception, map to the boundary protocol, and never
  acknowledge or continue as if work succeeded.
- **Catch-and-ignore with a comment** for genuinely optional work (best-effort cache
  eviction, metrics emission) — correct when the ignoring is explicit, narrow in type,
  and the operation's failure truly changes nothing for the caller.
- **`InterruptedException` propagated directly**—its flag is cleared when thrown and need not be
  restored merely to rethrow the same checked exception. If the API cannot propagate it, restore
  the flag before returning or wrapping so outer cancellation policy can observe it.
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
- Public APIs: checked `throws` clauses affect source compatibility but are not part of JVM method
  descriptors; unchecked documented failures affect behaviour. Removing/reparenting public
  exception classes can independently break linking, catches and serialization. Classify each
  change with java-api-design rather than treating all exception evolution alike.

## Authoritative references

- [JLS §11: Exceptions](https://docs.oracle.com/javase/specs/jls/se25/html/jls-11.html)
- [Throwable cause and suppressed-exception API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Throwable.html)
- [InterruptedException API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/InterruptedException.html)
