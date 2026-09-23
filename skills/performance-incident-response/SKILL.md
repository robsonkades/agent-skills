---
name: performance-incident-response
description: >
  Coordinating a production performance incident from impact declaration through evidence-preserving
  triage, coordinated mitigation, recovery validation and a blameless causal postmortem. Use when a
  latency, throughput, saturation or resource regression requires a war room; when responders are
  changing JVM flags before preserving evidence; or when MTTD, mitigation time and recovery time are
  being conflated. Evidence acquisition belongs to incident-evidence-capture; technical diagnosis
  to performance-methodology; this skill owns response sequencing and decision records.
---

# Performance Incident Response

## Purpose

Restore the user objective while preserving enough evidence to learn. Triage, mitigation and root-
cause analysis have different decisions and may overlap. Recovery observed after rollback is
evidence to investigate; timing alone does not establish the rollback's effect or causal mechanism.

Use the parts relevant to active coordination, handoff, postmortem review or a narrow clock question.
Preserve an adequate existing process. A metric interpretation or supported no-change review need
not create a war room, new captures, a hypothesis table or a full postmortem.

## Incident contract

Record incident commander, technical lead, scribe, communications owner, affected user journey and
applicable SLI/SLO/burn or explicit performance requirement, start/detection/acknowledgement/mitigation/recovery
timestamps with sources, recent changes,
evidence budget, safe actions, rollback authority and the next decision time.
Reuse the active incident process and existing authorization. One person may cover several
roles initially; missing role assignments or template fields must not delay an authorized
urgent mitigation. Keep impact/start-time uncertainty explicit rather than inventing timestamps.

## Workflow

1. Declare impact and scope from user-facing evidence. Separate missing telemetry from zero impact.
2. Preserve an append-only timestamped change/evidence ledger. Capture volatile, cheap evidence
   before destructive actions when feasible within the evidence budget. If ongoing impact
   requires immediate mitigation, record what could not be captured and proceed; expensive
   diagnostics must not become prerequisites (`incident-evidence-capture`).
3. Build a small hypothesis table from USE/resource, request-path and recent-change evidence. Assign
   one discriminating check per hypothesis. This can run alongside mitigation and need not
   establish root cause before applying a supported recovery action.
4. Choose a bounded mitigation with predicted signal, blast radius, abort condition and rollback;
   coordinate interacting actions as described below.
5. Validate recovery against the affected objective and its relevant SLI, goodput, backlog/drain
   and resource guardrails; green CPU or one cleared alert is insufficient. Keep residual recovery
   work and its owner explicit when the interactive service has recovered separately.
6. Hand off follow-up investigation with preserved artifacts. Run a blameless postmortem after the
   system is stable.

## Rules

- Prioritize restoring the user objective over exploratory tuning. Prefer reversible mitigation;
  a targeted configuration/code correction may be necessary. State evidence, risk and validation
  instead of treating either a familiar rollback or an optimization label as proof of safety.
- Preserve exact command output, timestamps, JDK/process/container identity and failures. An empty
  profiler result is evidence about the tool path, not proof that the mechanism is absent.
- Coordinate interacting changes to the same affected scope, normally one material change at a
  time. Independent authorized work can proceed under named owners. When urgent impact requires
  bundled actions, record their timing and the resulting limits on causal attribution.
- Use separate clocks: detection, acknowledgement, first material mitigation and sustained recovery.
  Define each metric before comparing incidents.
- A postmortem maps contributing conditions and failed defenses, not one linear “five whys” chain.
- Every action item has an owner, observable acceptance criterion and the control layer it changes.
  Agree a credible deadline; if completion depends on unresolved scheduling or an external fix,
  record that dependency and an owned next review instead of inventing a commitment.
  “Be more careful” is not an action.

For a response handoff, provide current impact, actions and actual outcomes, remaining uncertainty, artifact locations,
active owners and next decision/check. A mitigation attempted, a workload temporarily quiet and
a confirmed sustained recovery are different states.
Record accepted command transfer through the existing incident process; publishing notes alone
does not transfer ownership. Carry temporary controls and their removal criteria into the next shift.

## References

- [War room and postmortem](references/war-room-and-postmortem.md) — read during response setup,
  mitigation handoff or postmortem preparation.
