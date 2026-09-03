# Deciding

## The quadrant

Fowler's two axes — deliberate or inadvertent, prudent or reckless — matter because each
quadrant needs a different response, and treating them alike is why debt conversations go
nowhere.

|                 | **Prudent**                                                         | **Reckless**          |
| --------------- | ------------------------------------------------------------------- | --------------------- |
| **Deliberate**  | "We ship without the async job to make the pilot; here's the plan." | "No time for design." |
| **Inadvertent** | "Now that it's built, we can see the boundary was wrong."           | "What's a layer?"     |

- **Deliberate/prudent** is debt intentionally incurred and easiest to manage: record, trigger,
  repay. The other quadrants can still describe technical debt; the labels explain how it arose and
  what prevention is needed, not whether its future cost exists.
- **Inadvertent/prudent** is learning, and it is unavoidable — you could not have known before
  building it. Do not apologise for it; refactor when the better boundary is clear
  (java-refactoring).
- **Deliberate/reckless** is not a trade, because nothing was bought. It needs a conversation
  about how work is being planned, not a backlog ticket.
- **Inadvertent/reckless** is a skills or review gap. The fix is upstream — pairing, review,
  gates — not a cleanup sprint that will regenerate it.

The practical value: when someone says "we have a lot of technical debt", ask which quadrant.
The answer determines whether you need a plan, a refactoring, a conversation, or a gate.

## Never tradeable

Each of these is on the list because the cost of the shortcut is not paid by the team that took
it, or because it cannot be detected once taken.

| Never traded                                                     | Because                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Correctness of money or of a legal record                        | The error compounds silently and reconciliation may be impossible      |
| Authorisation on a newly reachable path                          | You cannot detect what was accessed afterwards without an audit log    |
| Silent data loss                                                 | Nobody reports what they never saw was missing                         |
| An irreversible migration with no tested recovery or forward-fix | Failure can exceed the recovery objectives when reversal is impossible |
| Secrets in logs, traces or error responses                       | Retention means it is already distributed by the time you notice       |
| Removing the only effective evidence for a high-risk change      | It leaves the accepted behavior or control unverified                  |

Performance, documentation and edge cases may be tradeable when they are not tied to an SLO,
safety/legal obligation, accessibility commitment or resource-exhaustion failure. Classify the
consequence, not the engineering label; treating everything as non-negotiable dilutes real controls.

## Containment checklist

Before taking a shortcut, make it cheap to undo:

- [ ] It lives behind one interface or in one module, not spread across callers.
- [ ] It has one entry point, so the future change has one place to happen.
- [ ] It is visible in the code — a named method (`chargeWithoutIdempotency`), not an omission
      a reader must notice.
- [ ] It fails loudly outside its intended range, rather than silently doing the wrong thing —
      throw on the unsupported case rather than guessing.
- [ ] Nothing new will be built on it before it is repaid, or if it will be, that is part of the
      decision.
- [ ] There is a test asserting the _current, limited_ behaviour, so repaying it is verifiable.

The last one is counter-intuitive and it is the one that makes repayment possible: a test
documenting "only supports one currency" tells the next person exactly what changes when the
limit is lifted.

## Three worked decisions

### A deadline

> The export must ship Thursday. The asynchronous job for large exports is four days of work.

**Traded:** support for customers above ~50,000 orders.

**Never-tradeable check:** passes. Nothing is lost or mis-authorised; the export simply
does not run for large accounts.

**Contained:** a hard cap at 12 months of data, with an explicit error naming the limit and
telling the user to contact support. The limit is one constant, checked in one place, covered
by a test.

**Recorded:** trigger is "a customer complains, or we onboard a tenant above the cap". Cost of
carrying is a support ticket now and then. Owner named.

**Why this is prudent:** the shortcut is visible to the user, fails loudly, is one constant
wide, and buys a real date. This is what deliberate/prudent looks like.

The reckless version of the same decision: ship it uncapped, let large exports time out with a
504, and plan to "look at performance later". Same four days saved; the failure is silent from
the code's point of view, arrives as a mystery, and there is no line to delete when it is fixed.

### An incident

> Checkout is failing. The cause is a connection pool default. The fix is one property, but the
> proper fix is a configuration test and a pool-saturation metric.

**Order:** mitigate now — set the property, deploy, confirm the metric recovers. That is not
debt, that is incident response.

**Debt taken:** the configuration is now correct by coincidence — nothing prevents the next
library upgrade from changing it back.

**Recorded the same day**, while the detail is fresh: the config test and the metric, with a
trigger of "before the next dependency upgrade of this client". This is the "remaining" section
of the post-incident summary (engineering-communication), and it is the part that stops the
incident recurring.

### A spike becoming production

> The spike works. Shipping it is two days; rebuilding it properly is six.

The most dangerous of the three, because the code exists and looks finished.

Spike code was written while you did not yet understand the problem — that was its purpose. It
has no tests, no error handling, hardcoded values, and it encodes the first guess about the
design. Shipping it directly is the classic inadvertent-reckless entry.

If it must ship, the minimum before it does:

- the never-tradeable list, checked line by line — spikes routinely skip authorisation and
  validation entirely;
- tests for the behaviour it actually needs to have, which is also how you find out what it
  does;
- hardcoded values named and moved to configuration, or documented as deliberate;
- error paths that fail loudly rather than returning empty results.

Estimate this minimum from the actual risk; do not inherit the example's day count. If essential
authorization, correctness and failure evidence cannot be supplied or explicitly accepted by the
authorized owner, the honest statement is “this is not ready to ship.”

## The question that settles most of these

> If this shortcut is still in place in a year, what will it have cost, and will anyone know
> why it is there?

A shortcut whose cost is bounded and whose reason is recorded is a legitimate trade. One whose
cost grows and whose reason will be lost is not a trade at any deadline — it is a transfer of
the cost to people who did not agree to it.
