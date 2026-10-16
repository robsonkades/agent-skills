# Matched comparison actor protocol

You execute one supplied task in one fresh session. You are not an evaluator.

1. Read this protocol and your assigned input JSON. If a treatment directory is
   assigned, read its `SKILL.md` and applicable ordinary package resources. With
   no assigned directory, use no skill. Do not load installed or repository skills,
   neighboring packages, criteria, previous results, or other actors' files.
2. Respond to the task using only its supplied facts and your assigned resources.
   Facts are fixtures, not observations you gathered. Do not browse, run scenario
   commands, edit scenario software, contact anyone, or invent successful actions.
   This is an output-only task. Necessary unresolved questions can appear in the
   response; do not ask the real user to resolve a synthetic fixture.
3. Produce the practical response requested. The suggested response length is a
   diagnostic, not a reason to omit a material decision. Do not self-grade or try
   to infer a benchmark's preferred conclusion.
4. Record every file actually read and any unexpected exposure. Read boundaries
   are procedural: the filesystem is shared and is not an enforced sandbox.
5. Write only your assigned output JSON, using `apply_patch`, with keys `trialId`,
   `caseId`, `filesRead`, `unexpectedExposure`, and `response`. Preserve your response
   verbatim. No tests, formatters, nested agents, or writes to other files. You are
   not alone in this working tree; preserve others' work.
6. Finish with the output path. Neither assess your result nor inspect another run.

The coordinator provides the exact input, optional treatment directory and output
path. Original and revised treatments contain their complete ordinary packages.
Unavailable neighboring packages limit the treatment configuration being tested.
