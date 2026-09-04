# War room and postmortem

## Live log

For every entry write UTC timestamp, actor, evidence/action, reason, expected signal, actual result
and next decision. Keep observations separate from hypotheses. Track failed commands and missing
prerequisites such as Native Memory Tracking; do not enable expensive startup-only diagnostics
reactively and pretend the pre-incident state was captured.

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

## Postmortem

Include executive impact, sourced timeline, detection and response clocks, a causal graph of
technical and organizational contributors, why defenses did not detect or contain them, what worked,
and measurable actions. Distinguish proximate trigger, enabling conditions and systemic controls.
Calculate incident rates using elapsed exposure time and a declared population; never derive “per
month” from event count alone.

Review whether the response preserved decisive evidence, whether the mitigation actually moved the
user SLI, and whether recovery included backlog drain. Test completed actions with a fault injection,
alert-rule test, runbook exercise or other observable acceptance criterion.
