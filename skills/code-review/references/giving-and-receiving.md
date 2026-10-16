# Writing and receiving findings

## The anatomy of an actionable comment

Use the requested output schema first. For a defect, make these elements available without
requiring the author to reverse-engineer the claim:

1. **What and where** — the changed path/line and reachable triggering input or interleaving.
2. **Why it matters** — the consequence, concretely. Not "this is bad practice".
3. **Evidence and adjustment** — the inspected call path, contract or executed reproduction,
   with a direction that fixes the behavior. Do not demand a particular patch when alternatives work.
4. **Severity** — impact/urgency and blocking status, using repository vocabulary. Keep confidence
   separate: an uncertain premise is not made true by assigning high severity.

Illustrative finding; the endpoint and handler are assumptions to verify in a real review:

> **Blocking.** `OrderController.java:42`: for an unknown ID, `orders.findById(id).get()`
> throws `NoSuchElementException`. The endpoint's existing exception handling maps this to 500,
> violating its documented 404 contract. Use `orElseThrow(() -> new OrderNotFound(id))`, which
> the inspected handler maps to 404, and cover an unknown ID through the endpoint.

The [Optional.get contract](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/Optional.html#get()>)
specifies the exception for absence, not an application HTTP status or diagnostic message.

Compare with "don't use `get()`", which is a rule the author now has to look up, argue with, or
guess the scope of.

## Severity vocabulary

Use the repository's vocabulary and requested schema. When neither specifies labels, the
following is a fallback; choosing ordinary labels does not require another user question:

| Label          | Meaning                                                                                                         | Blocks merge  |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ------------- |
| **Blocking**   | Supported defect or contract violation, concrete security/data risk, missing test for identified risky behavior | Yes           |
| **Question**   | A material fact remains unresolved after inspection; state which decision the answer changes                    | Not by itself |
| **Suggestion** | I would do it differently; your call                                                                            | No            |
| **Nit**        | Trivial and optional; ideally automated away                                                                    | No            |

Repeated mechanical **Nits** can reveal an automation gap; inspect whether a suitable rule
exists and runs before proposing a pipeline change. Contextual naming or explanatory comments
may need human judgment, and a count of nits alone does not establish a missing check. Keep
preferences non-blocking unless an explicit repository requirement applies.

## Resolve the premise, then update the finding

For a candidate defect, identify the required behavior, changed path, reachable trigger and
consequence. Inspect the smallest decisive evidence: a caller or guard for reachability, a
handler for failure translation, the deployed schema for an invariant, or a version-matched
API contract. A passing unrelated test does not refute a static proof; a familiar code pattern
does not establish a defect without its relevant conditions.

Before reporting it, try the strongest plausible refutation: an upstream precondition, a
downstream constraint/handler, a different resource owner, or an execution path that cannot
reach the claimed effect. Open the decisive artifact at the reviewed revision; do not accept
a comment, class name or search hit as proof that a control executes there. If the evidence
refutes the candidate, discard it; if it only protects one caller, narrow the finding to the
remaining reachable path. Keep a short reason in working notes when the rejected candidate
would otherwise recur across passes; do not fill the final review with disproved suspicions.
This check does not require a separate agent or runtime reproduction when source and contracts
already settle the claim.

Ask the author only for a material fact unavailable in the supplied context or repository.
Make the fork explicit: "Is this task joined before the resource closes? If yes, this lifetime
concern is resolved; otherwise the worker can use the closed resource." If that fact is needed
for a verdict, mark the affected coverage incomplete and identify the evidence needed. Do not
turn an unanswered question into a confirmed defect or stop unrelated review work.

When new evidence arrives, check that it applies to the reviewed revision and execution path:

- If it disproves the premise, withdraw the finding and correct any verdict that depended on it.
- If it limits the affected paths or impact, narrow the finding and reassess severity.
- If it confirms the concern, state the supported defect and upgrade a prior question explicitly.
- If it does not address the trigger, explain the remaining mismatch and retain the supported
  objection. An author's confidence or a delivery deadline is not counterevidence.

For example, finding a unique constraint can invalidate a claim of duplicate committed rows;
it does not resolve an independently evidenced duplicate external side effect. Keep those
claims separate. A fix on a newer revision resolves a defect there; it does not prove the
earlier finding was false. This follows Google's
[guidance on considering author pushback](https://google.github.io/eng-practices/review/reviewer/pushback.html)
while keeping the decision tied to the inspected artifact.

## Deadlock between reviewer and author

Disagreement about approach is normal and is usually resolved by making the disagreement
concrete rather than by repetition.

1. **Separate the claim from the preference.** "This will deadlock under concurrent renewal" is
   checkable. "This is over-engineered" is not, until it names a specific abstraction and what
   it costs.
2. **Check the checkable one.** Read the relevant contract or inspect the path first; run a
   targeted check when needed. Update the finding using the evidence rules above instead of
   repeating the assertion or requiring a new test when existing evidence settles it.
3. **If it is genuinely a preference**, the author decides. They carry the change; a reviewer's
   taste is not a veto, and treating it as one is what makes people stop opening small pull
   requests.
4. **If an unresolved trade-off has long consequences**, identify the affected requirement,
   consumers and viable alternatives. Inspect accepted decisions before reopening them; a
   dependency or boundary change alone does not require a new ADR. Use
   architecture-decision-making when the choice exceeds the review's authority or needs a durable
   architectural decision under repository conventions. Defer the affected implementation's
   polishing, continue independent checks, and record the remaining coverage.
5. **Timebox.** If replies repeat without new evidence, suggest a focused discussion with the
   relevant owner. Record the technical decision and reason; do not contact others or publish
   comments unless the user requested that action.

## Receiving review

- Assume the comment is about the code. Even when it is phrased badly, the useful move is to
  extract the technical claim and test it.
- Answer every comment, including the ones you decline — "leaving as is; the empty case cannot
  reach here because the caller filters, see line 12" resolves it. Silence reads as either
  agreement or dismissal, and the reviewer cannot tell which.
- A misreading may reveal unclear code or missing context. Check which before proposing a rename;
  a corrected misunderstanding is not itself a defect that must block the change.
- Do not rewrite the world in response to a suggestion. Take the fix; put the larger idea in a
  ticket and link it.
- Push back when you have a reason. "I considered a fake here, but the contract test in
  `PaymentGatewayContractTest` already covers it and the fake would drift" is a legitimate
  answer, and a review culture where authors never say it is a review culture producing worse
  designs.

## When pairing replaces review

Pairing supplies continuous review with shared context. It can replace a separate pass only
where repository policy permits and independent approval is not required; shared assumptions
can still hide defects. Record pairing coverage and leave explicit independent gates intact.

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

- Check findings against the actual code and target versions. Trace the trigger through callers,
  guards and handlers, and establish what the diff introduced or worsened. Static reasoning can
  support a finding without a runnable environment; name assumptions and do not claim reproduction
  unless it ran. An unresolved possibility belongs in questions/limitations, not invented findings.
- Say what you did not review — the parts you did not run, the tests you did not execute, the
  behaviour you could not verify without the environment.
- Rank supported findings by severity and combine duplicates of one root cause. Do not impose an
  arbitrary finding quota or omit an independent consequential defect to keep the list short.
- With no supported findings, say so and identify the reviewed revision/scope and residual test
  gaps. Do not manufacture nits or convert incomplete coverage into an unconditional approval.
