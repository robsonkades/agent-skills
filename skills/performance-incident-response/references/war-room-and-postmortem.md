# War room and postmortem

## Live log

For every entry write UTC timestamp, actor, evidence/action, reason, expected signal, actual result
and next decision. Keep observations separate from hypotheses. Track failed commands and missing
prerequisites such as Native Memory Tracking; do not enable expensive startup-only diagnostics
reactively and pretend the pre-incident state was captured.
Keep original entries and append corrections; record source clock/skew uncertainty when combining
hosts. Missing impact-start evidence gives an interval or unknown detection delay, not zero.
Separate action start/end from the first observed mitigation and sustained recovery. Define the
meaning of MTTR rather than comparing incidents with different endpoints.

## Mitigation card

```text
user impact and urgency:
hypothesis supported, confidence and alternatives:
change, scope and owner:
predicted SLI/resource movement:
guardrails and abort condition:
rollback command/path:
evidence knowingly destroyed:
validation window and recovery criterion:
```

Fill the fields needed for the current decision from available evidence; do not wait for a
complete card before urgent authorized work. Check rollback feasibility against data/schema
changes, queued messages, external side effects and current dependency capacity. Reverting a
binary does not undo writes; moving traffic can overload the destination. Name a safer alternative
when the obvious rollback is incompatible. Use commands supported by the actual build/deployment
through `incident-evidence-capture`, rather than copying flags from a previous incident.

Validate with a representative affected workload and observation window appropriate to cache warmup,
autoscaling, retries and backlog. Count rejected, timed-out and degraded requests in the defined
SLI population; lower latency after shedding most traffic does not establish recovered service.
Cancellation is not proof that in-flight work stopped or resources were released. Separate restored
interactive service from residual replay/backlog recovery, and retain an owner for each.

## Command handoff and temporary controls

Distinguish a prepared handoff from an accepted transfer. Identify the incoming commander,
confirm their acceptance using the incident's existing process, and record the effective time
and new owner where responders track command. Reuse an acceptance already recorded. If nobody
has accepted, retain explicit ownership or use the established escalation path; do not infer
acceptance from silence. Already authorized urgent mitigations continue under their named owners.

Include changes still in flight, their abort/rollback responsibility and next observation time.
Track temporary routing, shedding, retry or configuration overrides with an owner, reason,
removal criteria and review time. Incident closure does not automatically make it safe to undo
them: check affected load, dependency capacity and backlog before restoration. If a temporary
change remains after recovery, preserve its follow-up ownership rather than losing it at shift change.

## Postmortem

Include relevant impact, sourced timeline, detection and response clocks, technical and organizational
contributors, why defenses did not detect or contain them, what worked, and measurable actions.
Describe the causal relationships and uncertainty; use a graph when it clarifies interacting
contributors. Distinguish proximate trigger, enabling conditions and systemic controls.
Calculate incident rates using elapsed exposure time and a declared population; never derive “per
month” from event count alone.

Review whether the response preserved decisive evidence, whether the mitigation actually moved the
affected objective, and whether required backlog/replay recovery completed or has an explicit
remaining state and owner. Test completed actions with a fault injection,
alert-rule test, runbook exercise or other observable acceptance criterion.
Keep unconfirmed causal links labeled and action acceptance tied to the mechanism it changes.
An alert test validates detection, not prevention; an exercise on a simulator is not a production
failure test. Choose a controlled environment and scope consistent with existing authority.

Practice sources: [SRE Workbook: Incident Response](https://sre.google/workbook/incident-response/)
on mitigation before complete root-cause analysis and scalable response roles;
[Managing Incidents](https://sre.google/sre-book/managing-incidents/)
on coordination, working records and handoff. Apply these as response guidance, not proof that
a particular process reduced recovery time in the current organization.
