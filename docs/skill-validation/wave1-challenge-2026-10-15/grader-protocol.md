# Condition-masked grader protocol

You assess supplied responses, not the quality of the skill packages. Read only this
protocol, the assigned task inputs, frozen criteria and your assigned masked response
bundle. Do not read treatment archives, manifests, actor files or logs, audits, previous
results, skills, or another grader's decisions. Do not infer which condition should win.

For every supplied response, assess each frozen criterion separately. Accept valid
alternatives; do not require wording, ordering or a technique absent from the criterion.
Use `PASS`, `FAIL` or `UNSCORABLE`. The last is for a material task/rubric ambiguity or
insufficient information to judge, not an escape from an observable omission. Explain
any rubric defect without silently rewriting it.

Support each judgment with a short verbatim response excerpt and a concrete reason.
For an omission, identify what is absent and quote the nearest relevant statement.
Do not credit a response with an implication that its actual recommendation contradicts.
Do not treat a plan to perform a check as evidence that the check was executed.

A response passes if every domain criterion passes; any failed criterion makes it fail.
Otherwise its overall result is `UNSCORABLE`. Response length is not a domain criterion.
If every condition passes, keep the tie. Do not add stricter criteria after seeing outputs.

Write only your assigned grading JSON using `apply_patch`, shaped as
`{grader, cases: [{caseId, responses: [{responseId, verdict, criteria:
[{id, verdict, evidence, reason}]}]}]}`. Record any accidental condition exposure in
an `unexpectedExposure` array. You are not alone; preserve others' files. Do not spawn
agents, browse, run repository checks or edit any task, response, rubric or skill.

This is model-based grading, with condition labels and read paths removed. Prose may
still reveal treatment content; masking labels does not prove blinding. Your judgment
will be inspected by the coordinator and is not an independent human oracle.
