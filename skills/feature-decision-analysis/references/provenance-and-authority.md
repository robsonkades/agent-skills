# Provenance and authority

## Establishing provenance

Ask one question: **what would I show someone who disputed this?**

| Class              | What you show                                                     | What it is not                              |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------- |
| USER_MANDATED      | The user's words, quoted, with when they said them                | Your summary of what they meant             |
| CORPORATE_MANDATED | The user confirming it, or a repository document that declares it | A pattern that appears consistently in code |
| PROJECT_EXISTING   | `path:line`, and how many places                                  | Evidence that it should continue            |
| AGENT_PROPOSED     | The option set and the separating reason                          | A default that "everyone uses"              |

If nothing can be shown, the provenance is AGENT_PROPOSED. That is an honest class, not a
demotion — most decisions in a feature are legitimately the agent's proposal.

## The three levels of "the project does this"

These are routinely collapsed, and collapsing them is how an accident becomes a policy:

```text
Observed instance     One place does it. Evidence of nothing. Do not generalise.

Project pattern       Several places, no counter-example. Follow it for consistency,
                      and say that consistency is the reason. Still not a requirement.

Project standard      Written down somewhere in the repository — a contributing guide,
                      an architecture document, an enforced rule, a lint configuration.
                      Now it is a constraint, and departing from it needs a reason.

Corporate standard    Someone with the authority to set it says so. Only a person
                      establishes this. Code never does.
```

When it matters and you cannot tell which level you are looking at, ask:

> Every repository under `src/main/java/.../api` returns a `ProblemDetail` on failure — 11
> controllers, no counter-example. Is that an organisational standard I must follow, or a
> convention in this project that this feature may follow for consistency?

The answer changes nothing about what you write; it changes what happens when the feature has a
reason to deviate.

## The authority test

Four questions. Any **yes** makes it user-confirmed:

1. **Does it change what the system does**, as opposed to how it does it?
2. **Is it visible outside the change** — to a caller, a consumer, an operator, or in stored
   data?
3. **Is it expensive or impossible to reverse** once it is running with real data?
4. **Does it touch money, security, personal data, or a legal obligation?**

All four no: agent-owned. Take it. Record it in a line. Do not ask.

## Calibrating against both failure modes

| Failure             | Looks like                                                          | Cost                                                                  |
| ------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Deciding too much   | A broker chosen, a retention period invented, an endpoint versioned | Rework, or a wrong behaviour that ships and is not noticed            |
| Deciding too little | Five questions about naming, a confirmation request per file        | The user stops reading, and the real question gets the same treatment |

The second is the failure a rule-following agent falls into, and it is not safer. An agent that
asks about everything has not transferred risk to the user; it has trained the user to approve
without reading, which is worse than deciding alone.

## Recording a decision you had to take without an answer

Sometimes a blocking question cannot be answered in time. Then:

```text
D-07  Job history retained for 90 days
      Provenance:  AGENT_PROPOSED
      Authority:   user-confirmed — NOT CONFIRMED. Proceeding under assumption A-05.
      Assumption:  90 days matches the retention of the audit table (schema, V17).
      Falsified by: a stated retention policy, or a compliance obligation.
      Contained in: one migration and one scheduled deletion; changing the number is
                    a configuration change, changing the mechanism is not.
      Escalate:    before the feature is released, not before it is merged.
```

Three things make this acceptable: the assumption is labelled, the choice is the reversible one,
and the escalation has a deadline. Without all three it is a silent decision wearing a label.

## Superseding

A decision changes when the world does — a constraint is lifted, an assumption is falsified,
implementation shows the choice does not work. Then:

- The original entry stays exactly as written, with its status changed to superseded and a
  pointer forward.
- The new entry says **what changed**, not just what was chosen. "Implementation showed the
  batch endpoint cannot express partial failure" is the useful sentence.
- The plan is updated in the same step, because a superseded decision usually invalidates a
  resource.

Never edit a decision in place to make the record consistent with the code. The inconsistency
was the information.
