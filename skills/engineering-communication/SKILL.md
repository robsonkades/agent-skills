---
name: engineering-communication
description: >
  Communicating engineering facts to people who will act on them: stating what is true, what
  follows from it, what is still uncertain, and the options and recommendation when needed.
  Covers raising a risk early, saying no to a request in a way that leaves a
  yes on the table, resolving technical disagreement by making the checkable claim checkable,
  escalating without going around someone, and status updates during an incident. Use when
  bad news has to travel, when a risk is visible but unspoken, when you are being asked to
  commit to something you believe is not achievable, when a technical argument has gone two
  rounds without new information, when a message hedges every claim it makes,
  or when non-engineers need to make a decision that depends on a technical fact. Does not
  cover the numbers in an estimate (estimation-under-uncertainty), clarifying a requirement
  (requirements-and-acceptance), review comments specifically (code-review), or deciding to
  take on debt (technical-debt-decisions).
---

# Engineering Communication

## Purpose

Most engineering communication fails in one of two directions. It buries a decision the reader
must make inside a technical narrative they cannot parse — so nothing happens. Or it is so
hedged that the reader extracts no claim at all — so they assume everything is fine, which was
never what you meant.

The output that works is short, ordered by what the reader must do, and explicit about what you
do not know. That last part is what makes the rest of it trustworthy.

## Workflow

1. **Decide what the reader must do** with this message: approve something, choose between
   options, be aware, or act now. If nothing, consider not sending it.
2. **Read the sources behind that action.** For a status or recommendation, inspect the
   relevant issue, check result, incident record or owner response when available. Read only
   what the message depends on; an inaccessible link is not checked evidence. Keep reported
   claims attributed. A wording-only rewrite does not require a fresh technical investigation,
   but flag material contradictions instead of polishing them into apparent certainty.
3. **Lead with the decision, action or supported conclusion**, not the investigation story.
   "The production-volume rehearsal took six hours" preserves what was actually measured;
   a forecast for production needs its assumptions.
4. **Say what follows** in their terms — money, users, dates, risk — not in yours. "Six hours"
   needs context: establish whether the backfill blocks exports before claiming unavailability.
5. **Separate what you know from what you believe.** Mark the boundary explicitly: measured,
   inferred, assumed. A reader who cannot tell which is which will either over-trust or
   discard the whole message. When reports conflict, compare their source, population, time
   window and measurement before combining them. If the conflict remains, name it and the
   check or owner needed; neither seniority nor a newer timestamp resolves mismatched scopes.
6. **For a decision, give viable options and recommend one with a reason.** An awareness-only
   update does not need invented alternatives. Preserve required controls and distinguish
   the proposed option from an approved commitment.
7. **Send it early.** Every one of these is worth more the sooner it arrives, and a risk raised
   after it materialises is not a warning, it is an explanation.
8. **Check the draft against the inputs.** Preserve dates, scope, uncertainty and ownership;
   do not invent measurements, confidence percentages, approval, recipients or delivery promises.
   Retain a measurement's source, population and time window when they affect its meaning;
   a dated observation does not establish the current state or an entire incident's impact.
   If an earlier shared claim was materially wrong, identify what is corrected and whether the
   reader's next action changes. A later observation for a different window is an update, not
   necessarily a correction; preserve that distinction.
   For a missing decision-critical fact, use a visible placeholder or ask a focused question
   after checking available context. Name the decision its answer changes; ask for evidence or
   a constraint, not agreement with your preferred answer. Continue the parts already supported.
   When a reply changes a premise, revise the existing draft's conclusion, consequences and
   next action together, explaining what changed. Do not merely acknowledge the correction or
   append a conflicting paragraph. If the reply changes only length, audience or tone, keep
   the supported claim and the limits that affect the reader's action.

Deliver the message at the requested length and register, plus only material unresolved
facts needed to finalize it. Drafting a message does not authorize sending it to others;
use an external communication tool only within explicit authorization for that action.

## Rules

- Lead with the conclusion. Chronological narrative — "first I looked at, then I found" — makes
  the reader assemble the point themselves, and busy readers stop before the end.
- Never hedge a fact you have verified. "The query does a full scan of 4 million rows, measured
  on the replica" is a fact; writing "it seems like it might be slow" throws away the work you
  did and the reader's ability to act on it.
- Do not present an unverified claim as verified. Say which it is: "reported by the owner", "inferred from the
  logs", "I am assuming". Confidence claimed and then withdrawn costs more credibility than
  uncertainty stated up front.
- When the answer is unknown, state what would resolve it and the next useful action.
  Give a duration only when supported; otherwise keep it unknown. An agreed next-update
  time is not a promise that the question or incident will be resolved then.
- Say no to the request, not to the person, and pair it with what you can do. "Not by Friday at
  this scope; the read path alone is achievable by Friday" is a usable answer;
  "that's not possible" ends a conversation that needed to continue.
- Raise a risk early, in writing, with owner, trigger, impact, decision deadline, and next escalation
  point. Do not repeat an unchanged warning as noise, but re-surface it when evidence, severity,
  exposure, ownership, or the decision window changes—or when the agreed escalation condition fires.
- Do not soften a message until the claim disappears. If the reader can come away thinking
  everything is fine when it is not, the message failed however comfortable it was to send.
- Blame is not diagnosis. Describe the mechanism and contributing conditions. Preserve accountable
  ownership where audit, security, safety, or deliberate policy violations require it, without
  turning a causal analysis into a judgement about character.
- Match detail to the reader's task and known context, not just their job title. Keep a
  mechanism in the message when it changes the decision; link supporting detail otherwise.
  Shortening "migration checks were skipped" to "tests passed" changes the claim, not its style.

## References

- **Message patterns, with worked examples** — `references/message-patterns.md`. Raising a
  risk, reporting a slip, saying no, an incident status update, correcting a material claim,
  and a post-incident summary, plus incident handoffs and shortening a technical update.
  Read before compressing a consequential message, drafting incident communication or a
  message that carries bad news, corrects an earlier claim or asks for a decision; the
  examples explain what changed and why.
- **Disagreement and escalation** — `references/disagreement-and-escalation.md`. Separating
  checkable claims from preferences, asking questions that can change a recommendation,
  ending a two-round argument, disagreeing with someone more senior, escalation, and
  disagree-and-commit. Read when a technical argument is stuck, a reply changes a disputed
  premise or a decision needs someone else.
