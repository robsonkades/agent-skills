# Risk register

## Deriving candidates mechanically

Use these artefacts when available; each produces traceable candidates of a known shape:

| Artefact                                                                          | Candidate shape                                                        |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Impact map — every boundary crossing                                              | A consumer, a caller or a stored row that does not tolerate the change |
| Discovery ledger — standing assumptions                                           | The assumption is false, and what depends on it                        |
| Decision log — decisions taken without an answer                                  | The choice was wrong, and what it cost by then                         |
| Resource list — anything touching data, an integration, concurrency or a schedule | The specific failure of that mechanism                                 |

Then challenge the concrete failure paths for omissions. Categories are prompts, not rows to
fill or proof of completeness. Without these artefacts, identify the inspected scope and
evidence directly rather than inventing identifiers or requiring a full feature workflow.

### Follow and challenge the path

For each material candidate, inspect enough of the actual path to support the control or exposure
decision. Link the relevant code, configuration, contract or operational evidence:

1. Start at the changed operation and find its callers/producers and affected readers/consumers.
   Include unchanged code when it can exercise the changed behavior. Check scheduled, bulk or
   replay paths when they use that operation; do not assume the interactive route is the only one.
2. Connect trigger and preconditions to the failing operation, resulting state or external effect,
   and harm. Distinguish rollout, mixed-version and steady-state conditions where they differ.
   Unconfirmed reachability remains a conditional path with a specific missing check.
3. Try to disprove the path through an existing control. Inspect its enforcement point and
   applicable configuration: a guard at one caller does not establish protection for another.
   Conversely, a verified shared invariant may rule out this bounded path. Record that evidence
   instead of retaining a generic risk just because the technology can fail.

For example, a request-level batch limit does not bound a scheduled import that calls the writer
directly. If both routes enforce a shared limit before the same effect, reassess that specific
over-limit path; do not insist on another identical guard. A declared limit or test of only the
interactive route leaves the scheduled route unresolved. This is an illustrative reasoning pair,
not a claim about any particular framework or an executed test.

Keep a short scope note beside the register: paths checked, material paths not assessed and why,
and what would resolve them. Expand investigation when a discovered dependency changes the
failure or control decision; do not turn a feature review into a repository-wide audit. An absent
search match, inaccessible consumer or unavailable runtime evidence limits the conclusion.

## Evidence and decision-changing uncertainty

For a consequential rating or control claim, link the supporting artefact and its applicable
revision, environment and exposure. A code path can establish how failure is possible; its
production frequency needs evidence about how often that path is exercised. A test establishes
the conditions it exercised, not every deployment. Distinguish the observed fact, inferred
consequence and untested premise without requiring separate columns for each.

Check that versions, configuration, data shape and workload still match before reusing evidence.
For Java-specific risks, inspect the project's compiler/runtime and dependency configuration;
do not infer its baseline from these examples or propose an upgrade as an assumed mitigation.
Conflicting evidence is a reason to identify the differing conditions, not to average labels.

Prioritize an unknown by the decision it can change. For example, if rollback has been verified
against state written by the new version, it can support recovery for that tested path. If only
the old version's state was tested, recovery remains unverified; inspect the format contract or
exercise rollback with new state before crediting it. Ask about an unresolved retention or
recovery requirement only when repository evidence cannot supply it and the answer changes the
choice. If the same bounded action is appropriate under either answer, continue that action and
record the limit instead of blocking on irrelevant precision.

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
tracked as work: a resource in the feature workflow, or a task in a standalone review. Specify
the failure condition to check and the observable result that would establish the control:
for example, the over-limit scheduled batch produces no writes, or the response stops exposure
within the required window. Reuse sufficient existing evidence; "add tests" or "monitor it"
alone is not a verification condition. State what remains exposed even if that check passes.

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

## Check the control chain before reducing residual risk

When a response is claimed to limit harm, trace failure → signal → notification → decision →
effective action. Include acknowledgement, execution and propagation delays, not just the
alert's evaluation interval. Compare evidence for that chain with the time until unacceptable
harm or an irreversible effect; averages alone do not establish a response bound. Record
unknown timings as unknown rather than assuming an immediate operator response.

Check whether the failure also disables the signal, control interface or fallback dependency,
and whether the responder has the necessary access and capacity. A dashboard's existence or a
runbook's happy-path demonstration does not establish those conditions during the failure.
Reuse applicable drill/incident evidence; request a targeted check only for material gaps.

Separate **containment** (stop further exposure) from **recovery** (repair effects already
produced). A rollout stop can limit new writes without repairing corrupt records or recalling
delivered messages. Credit only the consequence actually reduced. If response is too late,
compare prevention, a smaller exposed population or a reversible hold before the effect;
route mechanism design to its specialist. Detection can still aid diagnosis and recovery
without making the original harm reversible.

[Google SRE's alerting analysis](https://sre.google/workbook/alerting-on-slos/) demonstrates
the timing limit for error budgets: a notification can arrive after the budget is exhausted.
Apply the same timing question to this feature's actual consequence, not a borrowed SLO.

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
RISK-01 NULL dispatch states reach a reader that dereferences them
      Impact        HIGH   illustrative project rule: failure of these legacy-order reads
                    stops critical fulfillment; verify that premise in the actual project
      Probability   UNKNOWN until NULL population, continuing NULL writes and
                    affected read exposure during the rollout are established
      Detection     pre-release fixture with NULL rows exercises that reader;
                    runtime error alert coverage and detection delay unverified
      Mitigation    PLANNED RES-03 backfills existing NULLs and sets the intended
                    default for omitted values. Keep a compatible reader until
                    old/new writer behavior and enforcement prevent new NULLs;
                    test writes during backfill before relying on non-null state
      Fallback      retain a compatible reader while backfill is repaired;
                    verify rollback does not discard newly written state
      Status        OPEN pending migration, writer and reader evidence
      Accepted by   pending residual-risk review by the authorized owner

RISK-04 Billing consumer rejects the event once the new field is added
      Impact        UNKNOWN affected events fail processing; backlog, recovery delay and
                    affected business obligations not yet bounded
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
Defaults do not reject explicit `NULL` writes, and a completed backfill does not prevent their
recurrence. If non-null state is required, assess writer changes and compatible enforcement such
as `NOT NULL`; adding that constraint can reject an old writer's requests, so retain that rollout
risk too. Keep the reader compatible until prevention and backfill are verified together.
Likewise, ignoring unknown fields does not prove application compatibility, and reverting a
producer does not remove events already delivered.

## Reviewing the register at completion

Revisit each row against the delivered revision and actual evidence. Name triggers in terms of
its premises: a larger exposed population, changed data format, longer replay window, expired
provider guarantee or changed response coverage. When one changes, reopen the affected rating,
control or acceptance and its dependent work; preserve unaffected evidence and the prior judgment.

Use these statuses:

- **Avoided or eliminated** — the failure path is removed; cite the change and evidence.
- **Mitigated** — controls are implemented and verified; cite the resource and validation, and
  assess remaining exposure. Planned controls or a DONE label alone are insufficient.
- **Accepted** — the recorded authority, scope and assumptions still apply. Preserve the owner,
  expiry or reopening trigger in the project's operational tracker (GAP-* when applicable).
- **Open** — controls, evidence or acceptance are pending. Identify the affected exposure and
  next action; independently ready and authorized work can continue.

Record the outcome against the expected failure path and control: what **materialised**, what was
intercepted, whether the signal reached its responder, and whether containment/recovery happened
within the required window. Link the observed consequence and explain which rating, control or
assumption it confirms or changes. An incident does not itself close the risk: reassess recurrence.

For "not observed", record the observation window, relevant exposure and signal coverage; distinguish
no failure from no opportunity to exercise the path or no ability to detect it. A quiet canary
does not establish rare-path safety or full-rollout capacity. If the feature has not run yet, leave
runtime outcomes pending and identify the existing operational owner/check that will revisit them,
or the ownership gap. Do not make an arbitrary waiting period a new completion gate.

This adapts [NIST SP 800-30 Rev. 1](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-30r1.pdf),
sections 2.3, 3.1, 3.2 (Tasks 2-2 through 2-5) and 3.4, on scope, relevant events, conditions,
defined scales, occurrence versus conditional harm, impact, uncertainty and changed risk factors;
it does not import that security framework's
authorization process. For rollout evidence,
[Google SRE's canary guidance](https://sre.google/workbook/canarying-releases/) explains why population,
traffic, duration and metric sensitivity affect what a successful observation supports.

## Technical sources for the examples

- [PostgreSQL 18 ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html): defaults,
  existing rows and DDL locks. No table rewrite does not imply no exclusive lock.
- [PostgreSQL 18 defaults](https://www.postgresql.org/docs/18/ddl-default.html) and
  [not-null constraints](https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-NOT-NULL):
  filling omitted values and rejecting explicit nulls are different controls.
- [Protocol Buffers proto3 evolution](https://protobuf.dev/programming-guides/proto3/#updating):
  wire-format compatibility and application compatibility differ; check the actual format.
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests): an example of
  downstream idempotency-key support for the charging risk in the main skill; verify the actual
  provider's guarantees and retention before relying on that mechanism.
