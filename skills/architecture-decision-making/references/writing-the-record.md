# Writing the record

Read when sizing or drafting an ADR, turning analysis into a record, or reviewing its
reasoning. Use the repository's existing fields; the forms here are adaptable conventions.

## Compatibility evidence when recording Java choices

This record-making method has no Java runtime baseline, and its Markdown proposal below
is illustrative documentation, not executable Java. When an ADR depends on an API, JVM
feature or framework version, inspect the target project's Maven/Gradle release settings,
toolchains, resolved dependencies, CI and runtime images. Record conflicting or missing
version evidence instead of inferring compatibility from the machine drafting the ADR.
Distinguish a proposed upgrade from the currently supported environment, including preview
or incubator requirements where relevant. Documenting a choice does not authorize changing
the project's JDK, dependencies or runtime flags. Link version-specific primary evidence
and the required compatibility check before asserting that the choice works on the target.

## How much record does the choice earn?

N/S/F/O are this skill's shorthand, not a published standard or empirically validated
classification. Assess reversal **after adoption**: what data, consumers, deployments,
operating procedures and contracts will depend on the choice? State the horizon relevant
to this system; six months can be a useful question, not a universal cutoff.

| Depth                                           | Evidence about impact                                                                       | What to preserve                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| N — existing commit/issue rationale             | Local choice, easily reversed, no material consumer/data/organizational obligation          | The choice and reason in the existing artifact; use S if local policy requires an ADR                    |
| S — short ADR                                   | Durable rationale is useful, but scope and consequences are contained                       | Identity/status, context, decision and consequences; a brief alternative or trigger when material        |
| F — fuller ADR                                  | Credible options, disputed assumptions, migration or coordination costs matter              | S plus genuine alternatives and rationale, evidence links, uncertainty, verification and review triggers |
| O — hard to reverse within the relevant horizon | External commitments or migration/rollback costs make reversal impractical for this context | F plus commitment boundary, narrower/staged options considered, reversal limits and cost of delay        |

Escalate depth for significant uncertainty or impact even if editing the code is easy.
Do not turn these into required document lengths or time estimates. A public API with
versioned consumers may be reversible; changing a “local” identifier persisted in external
data may be expensive. If the deployment/consumer scope is unclear, use
`architecture-coupling-and-quanta` to investigate it before assigning reversal cost.

Record what can actually be undone: code rollback, data restoration, compatibility with
old clients, and escape from vendor/operational commitments differ. Reintroducing old code
does not restore discarded data. If deferral is chosen, preserve its cost, interim behavior,
owner and ending condition; do not assume waiting is free or always wise.

## Evidence and rationale fields

| Item              | Record                                                                            | If missing                                                                                     |
| ----------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Problem and scope | Operation/boundary affected, current behavior and reason a decision is needed     | Draft the bounded question; do not invent a problem to justify a preferred pattern             |
| Drivers           | Requirements and constraints with source, owner and effective date where relevant | Mark source/authority unknown; distinguish a desired goal from a mandatory constraint          |
| Measurement       | Artifact, date, build/configuration, workload and metric definition               | Label a forecast or hypothesis; never convert a target into a measured result                  |
| Decision          | Chosen/proposed action and scope, including exceptions                            | Keep the outcome proposed or unresolved; preserve any available recommendation separately      |
| Alternatives      | Plausible options actually considered, including status quo when relevant         | Say they were not recorded; distinguish newly suggested alternatives from historical ones      |
| Consequences      | Benefits, costs, risks and remaining work, with evidence or uncertainty           | Investigate likely effects; do not manufacture a drawback just to fill a “Bad” bullet          |
| Verification      | Check or review, expected result and responsible role                             | State the missing check; a passing Markdown linter does not verify the design                  |
| Revisit condition | Assumption, observable trigger, observer and next decision step                   | Use an explicit review date if event monitoring is unavailable; do not claim monitoring exists |

A decision with only benefits warrants scrutiny, not an automatic conclusion that it was
never reviewed. A single feasible option can be documented honestly without inventing a
competitor. An organizational constraint belongs in context as such, not disguised as
technical impossibility.

For quality goals, carry an observable scenario from `architecture-characteristics`:
stimulus, operating conditions, response and measure. Preserve scope and metric: a 40 ms
p95 aggregate-load measurement does not establish an 800 ms end-to-end p99 checkout goal.
For nonnumeric obligations, a verifiable condition can suffice, such as which role can
read a field. Missing numbers do not make a requirement irrelevant.

## Worked proposal

**Illustrative only.** The following is a fictional proposal, not evidence of a real review,
measurement or approved database change. Its named roles and supplied facts are example
inputs. In a real record, replace them only with supported context and resolvable evidence
links. Unknowns are deliberately retained.

```markdown
# ADR-014: Centralize order pricing calculations

Status: proposed
Decision owner: Order team lead (acceptance pending)
Scope: Order pricing on the checkout write path
Evidence: Illustrative supplied code inventory; complete writer inventory unavailable

## Context

The supplied inventory identifies pricing calculations in OrderService and a stored
procedure. Finance uses the existing schema for reporting. Its owner requires schema
compatibility. The agreed target is checkout p99 <= 800 ms at 12,000 orders/hour under
the specified month-end payload mix. This is a requirement, not a benchmark result.

Unknown: which other applications write prices or rely on the stored procedure's
validation. The Order team must establish that inventory before approving removal.

## Proposed decision

Use the Order domain model as the pricing calculation owner for checkout. Keep existing
database integrity constraints and other writers' behavior until a reviewed migration
defines how their invariants remain enforced. This proposal does not authorize dropping
a trigger, constraint or procedure.

## Alternatives considered

- Keep calculations in the stored procedure: minimizes data access changes, but the
  supplied delivery history identifies coordination with the DBA release schedule.
- Keep calculations in OrderService: avoids introducing an aggregate boundary; the
  proposal favors the domain model to colocate interacting pricing behavior. The
  comparative maintenance benefit remains a hypothesis requiring design review.

## Consequences

Checkout gains one explicit calculation owner if the migration is completed.
Loading domain state may add queries and latency; no representative benchmark is available.
Database/report compatibility and competing writers remain migration obligations.
Developers will need to understand and maintain the chosen model boundary.

## Confirmation and review

Before acceptance, inventory all price writers and obtain the required reviews.
Before rollout, exercise pricing equivalence and invariant tests for those paths and
measure end-to-end checkout p99 at the specified load and payload mix.
Passing tests verifies defined behavior; the load result tests the performance target.
The Order team lead owns review if another writer must bypass the proposed calculation
owner or representative checkout performance misses the target.
```

The useful result is a reviewable proposal with a clear unresolved dependency. “Accepted”
would misrepresent its state. If this replaced an existing ADR, link that record as a
**proposed** replacement first; do not retire the current decision until the new outcome
is authorized under the repository's lifecycle.

## Retrospective records

When rationale is missing, inspect contemporaneous issues, PRs, meeting notes, release
history and surviving participants' accounts. Separate:

- Observed current implementation, with code/build scope.
- Historical decision and rationale supported by dated evidence.
- Recollections or plausible explanations that remain unconfirmed.
- A new recommendation about what should happen now.

Use the creation date of the reconstructed record and separately state the known or
unknown historical decision date. Do not backdate authorship, invent advocates' arguments,
or imply that working code proves approval. Where local policy supports it, record an
evidenced historical acceptance without demanding a fictional new decision meeting.

## Triggers that lead to review

A useful trigger is an early warning with lead time, not necessarily the point at which
an assumption has already failed. For example, a supported 20,000-orders/hour capacity
assumption might motivate review at sustained 15,000/hour **if** the owner explains the
headroom and time needed to respond. Without that basis, the numbers are placeholders.

Attach the signal source, observation window and owner. Then name the action: revisit
capacity evidence, compare options, and decide whether a replacement ADR is warranted.
Do not declare the old rationale false or switch technologies automatically when an alert
fires. Changed requirements, newly discovered risks or platform capabilities can also
justify review even if the original ADR omitted that trigger.
