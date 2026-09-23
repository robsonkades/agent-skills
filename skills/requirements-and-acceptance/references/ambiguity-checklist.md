# The ambiguity checklist

Run these categories against the request. Each one asks about something a ticket routinely
omits and code cannot omit — the compiler will make you choose, so choose deliberately.

## Quantity

- What is the number behind the adjective? "Fast", "large", "many", "soon", "recent".
- At what volume — today, and at the growth you are being asked to survive?
- What is the maximum? Every list has one in production, whether or not it has one in the
  requirement (an unbounded query is the requirement's silence made executable).

## Boundary

- Empty, zero, one, exactly the limit, one past the limit.
- Negative, null, missing, blank versus absent — is `""` the same as no value?
- Duplicates: allowed, rejected, or silently deduplicated?
- Inclusive or exclusive at the edge? "Orders over 500" — is 500.00 included? This single
  question changes an assertion in every related test.

## Time

- Which clock: the user's, the server's, UTC?
- What happens across a day boundary, a month end, a daylight-saving transition?
- Is "7 days" calendar days or 168 hours? They can differ across offset changes in
  the chosen timezone; not every zone observes daylight saving.
- How long is this valid for — a TTL, an expiry, a retention period?

## Concurrency

- Can two people do this at once? What should happen — last-write-wins, reject, merge?
- Is the operation safe to retry (idempotency)? The caller will retry whether or not you
  answered.
- Is ordering guaranteed, and by whom?

## Failure

- The dependency is down: fail, degrade, queue, or serve stale?
- Halfway through: what state is left, and who cleans it up?
- The user sees what? An error code, a message, a retry — and is the failure their fault or
  ours, because that changes the status code and the message.

## Authority and identity

- Who is allowed to do this? Not "authenticated" — which subject, over which resource.
- Who decides when the rule is disputed? Whose interpretation wins is itself a requirement.
- Does it need to be recorded for audit, and for how long?

## Lifecycle

- What happens to existing data? Backfill, migrate, leave, or delete.
- Do old and new behaviour coexist during rollout? Both versions run at once in a rolling
  deploy.
- Is this reversible, and has anyone described how?

## Scope

- What is explicitly _not_ included?
- Which of the neighbouring things people will assume this covers does it not cover?

## Worked example

> **Ticket:** "Users should be able to export their orders to CSV. Should be fast."

Nine questions where the answers change the work:

1. **Which orders** — all of them, or a date range? This defines selection and helps estimate
   work; the range alone does not decide the architecture. _(scope, quantity)_
2. **How many can a user have?** Compare synchronous streaming and an asynchronous
   download job using row size, generation time, memory, timeouts and user workflow; row count
   alone does not select one. _(quantity)_
3. **"Fast" means what** — the response starts within 2 s, or the file is complete within 2 s?
   Distinguish time to first byte from completion; either streaming or pre-generation needs
   evidence that it satisfies the selected target. _(quantity)_
4. **Which columns**, and what happens when an order has no delivery date — empty cell, the
   literal `null`, or omitted? _(boundary)_
5. **Which timezone** are the dates rendered in, and which format? Consumer locale/import
   settings may interpret `03/04` as 3 April or 4 March. _(time)_
6. **Decimal and delimiter conventions** — `1,234.56` needs quoting in comma-delimited CSV;
   correctly quoted commas do not break the format. Is the audience one locale or several,
   and how are quotes/newlines handled? _(boundary)_
7. **Which consumers, and which fields are untrusted?** A spreadsheet may interpret a
   customer-supplied value such as `=1+1` as a formula even when correctly CSV-quoted.
   Identify supported applications/import flows and the required treatment of such values.
   Prefixing or changing text for a spreadsheet can break lossless machine imports; do not
   silently choose one contract for both. _(boundary, authority)_
8. **May a user export another user's orders?** Presumably not — but is there an admin who
   can, and is the export audited? _(authority)_
9. **What happens if the export fails halfway** — partial file, error, retry? _(failure)_

Inspect existing exports and supported consumers before choosing these defaults:

- Encoding and BOM policy: a BOM helps some spreadsheet workflows but is not universal.
- Stable header names: screen labels may be localized or change independently.
- Ordering: reuse an existing order only if appropriate, with a deterministic tie-breaker.

These choices change bytes or code. They may still be reasonable reversible assumptions
when evidence and delegated scope support them; document the basis, and ask if consumer
compatibility materially depends on an unresolved answer. The nine questions are an
inspection guide, not nine questions automatically sent to the user.

[CSV format reference: RFC 4180](https://www.rfc-editor.org/rfc/rfc4180.html#section-2)
documents quoting and headers; consumer encoding and spreadsheet behavior require their own
compatibility checks.
[OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection) explains why CSV
quoting and spreadsheet formula handling are separate concerns. No single sanitization rule
fits every consumer; confirm any transformation against the agreed data-fidelity contract
and supported opening, import and save/reopen workflows.

## When to ask and when to proceed

| Situation                                                        | Action                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Two readings produce different data models, APIs or costs        | Inspect prior decisions; ask if material uncertainty remains, blocking only dependent work. |
| Two readings produce the same code                               | Proceed if contract consequences are also equivalent; record material assumptions.          |
| The answer is discoverable in the codebase or from existing data | Find it. Do not spend someone's attention.                                                  |
| Answering requires authority you do not have (legal, product)    | Ask, and name the decision as theirs.                                                       |
| The requirement contradicts another requirement                  | Check scope and authorized decisions; surface unresolved conflict with options.             |

Group the few unresolved questions that actually block a decision. Do not send the entire
checklist when repository evidence or earlier instructions already answer it.

Do not stop all work while waiting. Continue inspection, tests or implementation whose
contracts remain valid across the unresolved answers. If the answer could change ownership,
the public API or data representation, defer that dependent implementation; a placeholder
abstraction does not make it independent. Record which decision unlocks the remaining work
(clean-delivery-workflow).
