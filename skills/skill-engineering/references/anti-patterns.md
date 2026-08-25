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

**Duplicated knowledge.** The same rule in the body and in a reference. They will
diverge, and the reader will not know which is current. One home per fact.

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

**Runtime coupling.** Instructions naming a specific agent, model or vendor inside the
skill body. The same skill should work anywhere the format is read; vendor metadata has
its own place.

**Vestigial structure.** Directories created because a template showed them. An empty
`examples/` is a promise the skill does not keep.

## Self-review

Answer these before finalising. Any "no" that matters is a reason to revise, not to ship.

**Value** — Does the agent do measurably better with this than without it? If you cannot
name the difference, the skill is not ready.

**Expertise** — Does it encode judgement that would otherwise be lost? Or does it restate
what a capable agent already knows?

**Selection** — Read only the description. Can you tell which requests should reach this
skill, and which should not?

**Restraint** — Is there anything in the body that is only sometimes relevant?

**Checkability** — Take three rules at random. Could you tell, from a piece of finished
work, whether each was followed?

**Routing** — Is every supporting file reachable by a stated condition?

**Robustness** — What does the skill do when context is missing or the input is
ambiguous? If the answer is "proceeds anyway", add the rule that makes it ask.

**Composability** — Would this conflict with a neighbouring skill if both were selected?

**Maintainability** — When the domain shifts, is the change localised, or does it touch
every file?

## The subtraction pass

Before finalising, go through the skill once looking only for what to remove.

For each paragraph: _would the agent behave differently without this?_ If not, cut it.
This pass typically removes a third of a first draft, and the result is more likely to be
followed — instructions compete with each other for attention, and every sentence that
changes nothing dilutes the ones that do.
