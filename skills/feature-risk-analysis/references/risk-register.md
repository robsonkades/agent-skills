# Risk register

## Deriving candidates mechanically

Do not brainstorm. Walk four artefacts, and each produces candidates of a known shape:

| Artefact                                                                          | Candidate shape                                                        |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Impact map — every boundary crossing                                              | A consumer, a caller or a stored row that does not tolerate the change |
| Discovery ledger — standing assumptions                                           | The assumption is false, and what depends on it                        |
| Decision log — decisions taken without an answer                                  | The choice was wrong, and what it cost by then                         |
| Resource list — anything touching data, an integration, concurrency or a schedule | The specific failure of that mechanism                                 |

A register derived this way is short, specific and traceable. One derived from a list of risk
categories is long, generic and unused.

## The four fields, precisely

**Detection** answers three things: what signal, seen by whom, and how long after. Write all
three.

```text
Detection   error rate on POST /dispatch rises above the existing 1% alert
            threshold; on-call sees it within 5 minutes
Detection   nothing emits this; it is found when a customer reports a missing
            confirmation, typically days later          <- this is a finding
```

**Mitigation** happens before the failure and reduces its probability or its cost. It is
usually code, and if it is code it is a resource.

**Fallback** happens after and is what someone actually does. "Roll back" is only a fallback if
rolling back is possible after the schema change — say whether it is.

**Acceptance** names a person and a basis. It is required for every risk without a mitigation.

## Detection is the field that separates a register from a worry

A useful exercise on any HIGH risk: assume it has happened, in production, right now. Who knows?
Walk it concretely — is there a metric, a log line, an alert, a reconciliation, a customer? The
answer is often "nobody, for a day", and that answer is more valuable than the risk row itself,
because it is fixable with one metric.

## Risks that are actually design findings

Three shapes get written as risks when they belong upstream:

- **"The chosen approach may not scale."** If nothing about the feature establishes the volume
  it must handle, that is an unknown, not a risk. Close it.
- **"The requirement may change."** Not a risk of the feature. Reversibility of the decision is
  the thing to record, and it belongs in the decision log.
- **"We might not finish in time."** A schedule concern with its own discipline; it does not
  belong in a technical register.

## Worked shapes

```text
K-01  Existing rows have no dispatch state and the reader assumes one
      Impact        HIGH   NullPointerException on every legacy order read
      Probability   HIGH   40k existing rows, all of them affected
      Detection     integration test against a copy of the current schema fails
                    before release; in production it would be immediate and total
      Mitigation    R-03 sets a non-null default in the migration
      Fallback      -
      Accepted by   -   (mitigated; verified by the migration test)

K-04  Billing consumer rejects the event once the new field is added
      Impact        HIGH   dispatch events are dead-lettered, silently
      Probability   LOW    its deserialiser ignores unknown fields (verified,
                           BillingConsumerConfig.java:22)
      Detection     dead-letter queue depth is already alerted
      Mitigation    none needed; addition is backward compatible
      Fallback      revert the producer change; consumers are unaffected
      Accepted by   agent — LOW, verified, detected in minutes
```

Note what makes the second one acceptable: the probability rests on a verified fact with a path,
not on an expectation.

## Reviewing the register at completion

Every row is revisited, and each gets one of three outcomes:

- **Mitigated** — the mitigating resource is DONE and validated. Say which.
- **Still accepted** — nothing changed. It moves to whatever the project uses to track known
  operational risk; it does not disappear because the feature shipped.
- **Materialised** — it happened during implementation. Say what was done, and whether the
  detection worked. A detection that did not fire is the most useful thing the register produces.
