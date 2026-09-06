# Risk register

## Deriving candidates mechanically

Start with four artefacts; each produces traceable candidates of a known shape:

| Artefact                                                                          | Candidate shape                                                        |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Impact map — every boundary crossing                                              | A consumer, a caller or a stored row that does not tolerate the change |
| Discovery ledger — standing assumptions                                           | The assumption is false, and what depends on it                        |
| Decision log — decisions taken without an answer                                  | The choice was wrong, and what it cost by then                         |
| Resource list — anything touching data, an integration, concurrency or a schedule | The specific failure of that mechanism                                 |

Then challenge the concrete failure paths for omissions. Categories are prompts, not rows to
fill or proof of completeness. Without these artefacts, identify the inspected scope and
evidence directly rather than inventing identifiers or requiring a full feature workflow.

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

**Acceptance** names the authorized owner, basis and scope of residual exposure, including
exposure remaining after controls. Reuse recorded authorization or delegation. A planned
mitigation is not a verified control; missing ownership remains a visible pending item.

## Detection gaps remain risks

A useful exercise on any HIGH risk: assume it has happened, in production, right now. Who knows?
Walk it concretely — is there a metric, a log line, an alert, a reconciliation, a customer? The
answer may be "no known signal". Retain that gap and assess whether reconciliation, instrumentation
or an operational check can expose it within the recovery window. Do not invent customer-report
latency or assume a metric can detect an externally visible effect. Separate pre-release tests
from runtime detection and label planned detection as unverified.

## Risks that are actually design findings

Separate vague concerns from concrete events, while preserving links to upstream work:

- **"The chosen approach may not scale."** Record the unknown workload upstream; if there is a
  concrete queue-exhaustion or timeout path, retain that risk with uncertain likelihood and
  identify the workload evidence needed to assess it.
- **"The requirement may change."** Route the open requirement and reversibility choice to the
  decision log. Retain a specific exposure such as data loss if that change requires destructive
  migration; an unanswered question and a risk can coexist.
- **"We might not finish in time."** Route scheduling to its owner. Include a technical consequence
  only when supported, such as an old client remaining after a required protocol cutover.

## Worked shapes

```text
RISK-01 Existing NULL dispatch states reach a reader that dereferences them
      Impact        HIGH   legacy-order reads fail on the inspected reader path
      Probability   UNKNOWN until NULL population and affected read exposure
                    during the rollout are established
      Detection     pre-release fixture with NULL rows exercises that reader;
                    runtime error alert coverage and detection delay unverified
      Mitigation    PLANNED RES-03 backfills existing NULLs and establishes the
                    intended default; test old/new readers during staged rollout
      Fallback      retain a compatible reader while backfill is repaired;
                    verify rollback does not discard newly written state
      Status        OPEN pending migration and reader evidence
      Accepted by   pending residual-risk review by the authorized owner

RISK-04 Billing consumer rejects the event once the new field is added
      Impact        HIGH   affected events fail processing until recovered
      Probability   UNKNOWN: ignoring unknown fields is one verified property
                    (BillingConsumerConfig.java:22), not end-to-end compatibility
      Detection     existing DLQ alert; verify routing, notification and delay
      Mitigation    PLANNED test actual wire format, validators, intermediaries
                    and old/new consumers, including required/default semantics
      Fallback      stop incompatible publication; retain, quarantine or replay
                    already-published events after a compatible consumer repair
      Status        OPEN pending compatibility and recovery evidence
      Accepted by   pending authorized owner; LOW probability alone would not
                    authorize an agent to accept external financial exposure
```

These are illustrative records, not executed tests. A verified fact supports only the path it
establishes. In PostgreSQL 18, `ALTER COLUMN SET DEFAULT` does not change existing rows; adding
a new column with a default has different semantics. Check the actual DDL and target version.
Likewise, ignoring unknown fields does not prove application compatibility, and reverting a
producer does not remove events already delivered.

## Reviewing the register at completion

Revisit each row against the delivered revision and actual evidence:

- **Avoided or eliminated** — the failure path is removed; cite the change and evidence.
- **Mitigated** — controls are implemented and verified; cite the resource and validation, and
  assess remaining exposure. Planned controls or a DONE label alone are insufficient.
- **Accepted** — the recorded authority, scope and assumptions still apply. Preserve the owner,
  expiry or reopening trigger in the project's operational tracker (GAP-* when applicable).
- **Open** — controls, evidence or acceptance are pending. Identify the affected exposure and
  next action; independently ready and authorized work can continue.

Also record whether a risk **materialised**, the response and whether detection worked. An incident
does not itself close the risk: reassess recurrence and residual exposure under the statuses above.

## Technical sources for the examples

- [PostgreSQL 18 ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html): defaults,
  existing rows and DDL locks. No table rewrite does not imply no exclusive lock.
- [Protocol Buffers proto3 evolution](https://protobuf.dev/programming-guides/proto3/#updating):
  wire-format compatibility and application compatibility differ; check the actual format.
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests): an example of
  downstream idempotency-key support for the charging risk in the main skill; verify the actual
  provider's guarantees and retention before relying on that mechanism.
