# Writing and receiving findings

## The anatomy of an actionable comment

Four parts. Missing any one of them produces a comment the author cannot act on without a
round trip, and round trips are what make reviews slow.

1. **What** — the observation, specific to a line or a block.
2. **Why it matters** — the consequence, concretely. Not "this is bad practice".
3. **What you would do** — a suggestion, so the author can accept it in one step.
4. **Severity** — blocking, or not.

> **Blocking.** `orders.findById(id).get()` on line 42 throws `NoSuchElementException` with no
> message when the id is unknown, and this path is reachable from the public endpoint — a
> client typo becomes a 500 with no diagnostic. Suggest `orElseThrow(() -> new
OrderNotFound(id))`, which the existing handler already maps to a 404.

Compare with "don't use `get()`", which is a rule the author now has to look up, argue with, or
guess the scope of.

## Severity vocabulary

Agree on three or four labels and use them on every comment. The exact words matter less than
their consistency:

| Label          | Meaning                                                           | Blocks merge  |
| -------------- | ----------------------------------------------------------------- | ------------- |
| **Blocking**   | Defect, security or data risk, breaking contract, missing test    | Yes           |
| **Question**   | I do not understand this; the answer may or may not change things | Not by itself |
| **Suggestion** | I would do it differently; your call                              | No            |
| **Nit**        | Trivial and optional; ideally automated away                      | No            |

Two disciplines make the labels work. First: if more than a couple of comments on a review are
**Nit**, the pipeline is missing a check — say that rather than repeating the nits next time.
Second: a **Question** that turns out to reveal a defect is upgraded explicitly, so the author
knows the status changed.

## Deadlock between reviewer and author

Disagreement about approach is normal and is usually resolved by making the disagreement
concrete rather than by repetition.

1. **Separate the claim from the preference.** "This will deadlock under concurrent renewal" is
   checkable. "This is over-engineered" is not, until it names a specific abstraction and what
   it costs.
2. **Check the checkable one.** Write the test, run the query, read the docs. Whoever is wrong
   learns something; the alternative is two people spending an afternoon on assertion.
3. **If it is genuinely a preference**, the author decides. They carry the change; a reviewer's
   taste is not a veto, and treating it as one is what makes people stop opening small pull
   requests.
4. **If it is a decision with long consequences** — a dependency, a data model, a boundary —
   stop the review and escalate to a decision with the people who will live with it
   (architecture-decision-making). A pull request comment thread is the wrong instrument for an
   architectural choice, and the wrong record of it.
5. **Timebox.** More than two rounds on one thread means it belongs in a call. Write the
   outcome back into the thread afterwards so the decision has a record.

## Receiving review

- Assume the comment is about the code. Even when it is phrased badly, the useful move is to
  extract the technical claim and test it.
- Answer every comment, including the ones you decline — "leaving as is; the empty case cannot
  reach here because the caller filters, see line 12" resolves it. Silence reads as either
  agreement or dismissal, and the reviewer cannot tell which.
- A comment that misreads the code is a finding: if a competent reader misread it, the next one
  will too. Consider whether the fix is a clearer name rather than a reply.
- Do not rewrite the world in response to a suggestion. Take the fix; put the larger idea in a
  ticket and link it.
- Push back when you have a reason. "I considered a fake here, but the contract test in
  `PaymentGatewayContractTest` already covers it and the fake would drift" is a legitimate
  answer, and a review culture where authors never say it is a review culture producing worse
  designs.

## When pairing replaces review

Pairing or mobbing on a change means the review already happened, continuously and with more
context than a diff can carry. Treating it as _also_ needing a full second review is
duplicated cost.

It is the better instrument when:

- the change is genuinely difficult and a diff will not convey the reasoning;
- the author is new to the area and the review would otherwise be a long list of context;
- the work is exploratory and the design will change several times before it settles.

It is the worse instrument for wide, mechanical changes, and for anything where an independent
second opinion is the point — a security-sensitive path benefits from a reviewer who did not
share the author's assumptions while writing it.

Whichever is used, record it: "reviewed by pairing with X" tells the next person the change was
seen, and by whom.

## For an agent producing a review

- Do not report a finding you have not checked against the actual code. A plausible-sounding
  defect that does not exist costs the author more time than a missed one
  (coding-agent-discipline).
- Say what you did not review — the parts you did not run, the tests you did not execute, the
  behaviour you could not verify without the environment.
- Rank by severity and stop. A list of forty comments, mostly nits, will not be read; five
  ordered by consequence will be.
