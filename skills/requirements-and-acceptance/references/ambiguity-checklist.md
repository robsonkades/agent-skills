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
- Is "7 days" calendar days or 168 hours? They differ twice a year.
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

Eight questions where the answers change the work:

1. **Which orders** — all of them, or a date range? The answer decides whether this is a query
   or a batch job. _(scope, quantity)_
2. **How many can a user have?** 200 rows is a synchronous response; 2 million is an
   asynchronous job with a download link, which is a different feature entirely. _(quantity)_
3. **"Fast" means what** — the response starts within 2 s, or the file is complete within 2 s?
   For a large export these are opposite designs (stream versus generate-then-serve). _(quantity)_
4. **Which columns**, and what happens when an order has no delivery date — empty cell, the
   literal `null`, or omitted? _(boundary)_
5. **Which timezone** are the dates rendered in, and which format? A CSV opened in a European
   spreadsheet parses `03/04` as 3 April; an American one as 4 March. _(time)_
6. **Decimal and delimiter conventions** — `1,234.56` with commas separating fields breaks the
   file. Is the audience one locale or several? _(boundary)_
7. **May a user export another user's orders?** Presumably not — but is there an admin who
   can, and is the export audited? _(authority)_
8. **What happens if the export fails halfway** — partial file, error, retry? _(failure)_

Assumptions to record rather than ask, because both readings produce the same code:

- UTF-8 with a BOM, so spreadsheets open it correctly.
- The header row uses the same labels as the orders screen.
- Ordering is newest first, matching the existing list.

That is the shape of the output: questions where the answer changes the build, assumptions
where it does not, and nothing left implicit.

## When to ask and when to proceed

| Situation                                                        | Action                                        |
| ---------------------------------------------------------------- | --------------------------------------------- |
| Two readings produce different data models, APIs or costs        | Ask. Block if you cannot proceed on either.   |
| Two readings produce the same code                               | Assume, record, continue.                     |
| The answer is discoverable in the codebase or from existing data | Find it. Do not spend someone's attention.    |
| Answering requires authority you do not have (legal, product)    | Ask, and name the decision as theirs.         |
| The requirement contradicts another requirement                  | Surface both, propose options, do not choose. |

Batch questions. Five questions in one message get answered together; five messages over a day
each cost a context switch and get worse answers.

Do not stop all work while waiting. Build everything that does not depend on the answer, and
isolate what does behind the smallest decision point you can — that way one answer changes one
place (clean-delivery-workflow).
