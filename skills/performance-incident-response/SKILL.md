---
name: performance-incident-response
description: >
  Coordinating a production performance incident from impact declaration through evidence-preserving
  triage, one-change mitigation, recovery validation and a blameless causal postmortem. Use when a
  latency, throughput, saturation or resource regression requires a war room; when responders are
  changing JVM flags before preserving evidence; or when MTTD, mitigation time and recovery time are
  being conflated. Evidence acquisition belongs to incident-evidence-capture; technical diagnosis
  to performance-methodology; this skill owns response sequencing and decision records.
---

# Performance Incident Response

## Purpose

Restore the user objective while preserving enough evidence to learn. Triage, mitigation and root-
cause analysis are distinct phases; a successful rollback proves a useful association, not the full
causal chain.

## Incident contract

Record incident commander, technical lead, scribe, communications owner, affected user journey and
SLO/burn, start/detection/acknowledgement/mitigation/recovery timestamps with sources, recent changes,
evidence budget, safe actions, rollback authority and the next decision time.

## Workflow

1. Declare impact and scope from user-facing evidence. Separate missing telemetry from zero impact.
2. Freeze a timestamped change and evidence ledger. Capture volatile, cheap evidence before restart,
   heap dump or broad profiling according to `incident-evidence-capture`.
3. Build a small hypothesis table from USE/resource, request-path and recent-change evidence. Assign
   one discriminating check per hypothesis.
4. Choose one bounded mitigation with predicted signal, blast radius, abort condition and rollback.
5. Validate recovery against the user SLI, goodput, backlog/drain and resource guardrails; green CPU
   or one cleared alert is insufficient.
6. Hand off follow-up investigation with preserved artifacts. Run a blameless postmortem after the
   system is stable.

## Rules

- Do not optimize during an incident. Mitigate reversibly and label unvalidated changes as such.
- Preserve exact command output, timestamps, JDK/process/container identity and failures. An empty
  profiler result is evidence about the tool path, not proof that the mechanism is absent.
- Make one material change at a time unless continuing impact makes a bundled rollback the safest
  action; record when causal isolation was sacrificed.
- Use separate clocks: detection, acknowledgement, first material mitigation and sustained recovery.
  Define each metric before comparing incidents.
- A postmortem maps contributing conditions and failed defenses, not one linear “five whys” chain.
- Every action item has an owner, deadline, observable acceptance criterion and the control layer it
  changes. “Be more careful” is not an action.

## References

- [War room and postmortem](references/war-room-and-postmortem.md) — read during response setup,
  mitigation handoff or postmortem preparation.
