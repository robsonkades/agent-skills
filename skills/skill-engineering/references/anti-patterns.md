# Anti-patterns and self-review

Read before finalising any skill.

## The failure that produces all the others

**Writing to look thorough rather than to change behaviour.** Nearly every anti-pattern
below is a symptom of it. A skill is judged by the difference between what the agent does
with it and without it — never by its length, its structure, or how authoritative it
sounds.

## Anti-patterns

**The persona opener.** `You are an expert X specialized in Y.` It sets a register and
changes nothing. If removing the first paragraph would not alter a single decision the
agent makes, it is decoration. Replace it with the decision rules the expert would apply.

**Restating model capability.** "Analyse the code carefully." "Consider edge cases."
"Follow best practices." The agent already does these, imperfectly, and the sentence does
not improve the odds. Say _which_ edge cases, or _which_ practice, or say nothing.

**The encyclopedia body.** Everything the author knows, in the entrypoint, loaded on every
activation. Conditional detail belongs in a reference. The test is temporal: relevant
every time, or not.

**Unreachable resources.** Files nothing routes to. The agent never opens them, so they
are pure package weight and slowly drift out of date.

**Duplicated knowledge.** Detailed rules copied between files can diverge. Keep one
authoritative explanation; a short guard or routing summary may need repetition so it is
visible before the action it constrains.

**Unfalsifiable rules.** "Ensure high quality." "Write maintainable code." Nothing can be
checked against the output. Restate as something observable or remove it.

**Checklist inflation.** Twenty gates, of which four matter. The reader satisfies them
mechanically and stops thinking. Keep the gates that would actually catch a bad result.

**Boundary creep.** A description that lists unrelated situations so the skill covers more
ground. It makes selection unreliable for this skill _and_ its neighbours. Narrow it and
name the exclusion.

**Capability-shaped descriptions.** "Expert in Java performance" tells the selector
nothing about _when_. Name the situations: the symptom, the artefact, the moment.

**Workflow without validation.** Steps that produce output with no step that checks it.
Every meaningful workflow ends in something verifiable.

**Ceremony scaling.** Evaluation suites, confidence taxonomies and multi-section report
formats attached to a skill whose output is a renamed file. Match the machinery to the
stakes.

**Unnecessary runtime coupling.** Do not assume one client's behavior applies everywhere.
Client-specific guidance is legitimate when the skill's task requires it; declare the
compatibility boundary and verify claims against that implementation. UI metadata belongs
in the target client's supported location.

**Vestigial structure.** Directories created because a template showed them. An empty
`examples/` is a promise the skill does not keep.

## Self-review

Answer these before finalising. Any "no" that matters is a reason to revise, not to ship.

**Value** — What observable decision or failure should this improve? Distinguish that
expected benefit from any measured comparison. Lack of an executed comparison limits the
claim; it does not erase a supported correctness fix.

**Expertise** — Does it encode judgement that would otherwise be lost? Or does it restate
what a capable agent already knows?

**Selection** — Read only the description. Can you tell which requests should reach this
skill, and which should not?

**Restraint** — Is conditional detail large enough to route away without hiding a guard?

**Checkability** — Take three rules at random. Could you tell, from a piece of finished
work, whether each was followed?

**Routing** — Is every supporting file reachable by a stated condition?

**Robustness** — What does the skill do when context is missing or the input is
ambiguous? Does it inspect context, distinguish harmless assumptions from consequential
unknowns, and continue authorized work that does not depend on the missing information?

**Composability** — Would this conflict with a neighbouring skill if both were selected?

**Maintainability** — When the domain shifts, is the change localised, or does it touch
every file?

## The subtraction pass

Before finalising, go through the skill once looking only for what to remove.

For each paragraph, identify its decision rule, prerequisite, evidence requirement or
teaching value. Remove unsupported repetition without a target reduction percentage.
Retain necessary context and safety/correctness constraints; shorter text alone is not
evidence of better agent behavior.
