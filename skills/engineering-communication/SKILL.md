---
name: engineering-communication
description: >
  Communicating engineering facts to people who will act on them: stating what is true, what
  follows from it, what is still uncertain, the options and a recommendation — in that order.
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
2. **Lead with the fact**, not the story of how you found it. "The backfill will take six hours
   against production volume" before the account of the afternoon.
3. **Say what follows** in their terms — money, users, dates, risk — not in yours. "Six hours"
   means nothing; "the export is unavailable for a working day, or we run it overnight on
   Saturday" is a decision.
4. **Separate what you know from what you believe.** Mark the boundary explicitly: measured,
   inferred, assumed. A reader who cannot tell which is which will either over-trust or
   discard the whole message.
5. **Give options with their trade-offs**, then **recommend one and say why**. Options without a
   recommendation push the engineering judgement onto someone with less information.
6. **Send it early.** Every one of these is worth more the sooner it arrives, and a risk raised
   after it materialises is not a warning, it is an explanation.

## Rules

- Lead with the conclusion. Chronological narrative — "first I looked at, then I found" — makes
  the reader assemble the point themselves, and busy readers stop before the end.
- Never hedge a fact you have verified. "The query does a full scan of 4 million rows, measured
  on the replica" is a fact; writing "it seems like it might be slow" throws away the work you
  did and the reader's ability to act on it.
- Never assert something you have not verified. Say which it is: "measured", "inferred from the
  logs", "I am assuming". Confidence claimed and then withdrawn costs more credibility than
  uncertainty stated up front.
- "I don't know" is a complete and professional answer when followed by how you would find out
  and how long that takes.
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
- Match the register to the audience: a non-engineer needs the consequence and the decision,
  not the mechanism. Keep the mechanism available below, for whoever wants it.

## References

- **Message patterns, with worked examples** — `references/message-patterns.md`. Raising a
  risk, reporting a slip, saying no, an incident status update, and a post-incident summary —
  each in a version that fails and a version that works, with what changed and why. Read before
  sending a message that carries bad news or asks for a decision.
- **Disagreement and escalation** — `references/disagreement-and-escalation.md`. Separating
  checkable claims from preferences, ending a two-round argument, disagreeing with someone more
  senior, when and how to escalate without going around a person, and disagree-and-commit. Read
  when a technical argument is stuck or a decision needs someone else.
