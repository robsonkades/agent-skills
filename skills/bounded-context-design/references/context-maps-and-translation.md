# Context maps and translation contracts

Read when a relationship between contexts, shared model fragment or external model
needs an explicit contract. The examples below are illustrative business assumptions,
not claims about a particular application's requirements.

## Draw the existing relationship before choosing its future

Give every context a responsibility and a vocabulary meaningful to its users. Record
where the model actually lives, including manual spreadsheets or a supplier system
if they influence the decision. Label proposed boundaries separately from existing
ones. A clean target diagram must not hide a shared writer or disputed rule today.

For an asymmetric relationship, upstream means its model/development choices constrain
the downstream. Record the runtime interaction separately; information can move both
ways. For mutual dependence, document coordination explicitly rather than forcing an
upstream arrow onto the relationship.

The pattern vocabulary comes from
[Evans's DDD Reference, Context Mapping, pp. 28–37](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf).
Use it to make a decision, not to label every edge with every possible pattern:

- **Customer/supplier:** upstream planning takes downstream needs into account.
- **Partnership:** delivery requires mutual planning and integration coordination.
- **Conformist:** downstream accepts the upstream model and its constraints.
- **Anticorruption layer:** downstream translates into its own model.
- **Shared kernel:** a deliberately limited model fragment has coordinated changes.
- **Open-host service and published language:** a supported interface and shared exchange
  vocabulary serve consumers; either can coexist with a downstream translation.
- **Separate ways:** no integration is justified for the current needs.

Apply these patterns to the specific promise. A consumer can negotiate one capability
and conform to another. Translation costs include semantic decisions and maintenance;
customer/supplier requires an actual planning agreement. A diagram cannot create that
agreement. An anticorruption layer can be a small in-process adapter; it does not require
a service, message broker or framework.

## Work a conflicting-language case

Assume Sales calls a negotiating organization a **customer**. It can revise a quote's
recipient and price until acceptance. Billing calls the party responsible for an issued
invoice a **customer**. Its agreed rule freezes the recipient and accepted charge on
issuance; later corrections are represented separately. These are illustrative policies,
not universal accounting or legal rules.

These different decisions and lifecycles warrant investigation, not an automatic split.
A single mutable `Customer` object with the current address and current price would let
a Sales edit silently change the meaning of an issued invoice. An immutable recipient
and charge snapshot could fix that defect within one context if everyone agrees on the
same model. To justify separate Sales and Billing contexts, establish the additional
evidence: for example, independently governed rules identify a negotiator and a liable
party differently, and a single shared definition would misrepresent their decisions.
Under that assumption, publish an accepted-order fact and keep invoice creation owned
by Billing. Both contexts can remain modules in one deployable.

An illustrative map, where arrows denote the exchange rather than organizational rank:

```text
Sales -- AcceptedOrder contract --> Billing translation --> Billing model
      publisher: Sales             maintainer: Billing     issue/correct invoice
      agreed consumer need: facts at acceptance, with stable identity and time
```

Do not assume that a Sales customer ID identifies exactly one billing account. Check
whether the relationship is one-to-one, many-to-one or time-dependent, and who resolves
ambiguity. If several buyer records bill to one legal party, an ID cast cannot implement
the mapping. If Sales does not know the billing party, publish that uncertainty or resolve
it through the agreed authority; do not invent a recipient in the translator.

Contrast: two screens call the same party **buyer** and **customer**, but share identity,
lifecycle, allowed transitions and policy ownership. Naming aliases and adapting the UI
may solve the disagreement. A second context adds translation without a semantic benefit
unless independent evidence justifies it. Different column sets can simply be projections.

## Specify what translation preserves

Write a short contract for each consequential edge. Reuse existing schemas and tests;
the following fields are prompts for missing decisions, not a mandatory new document.

| Contract concern             | Sales-to-Billing example                                                                                   | Failure to expose                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Business fact and completion | Order accepted under the recorded Sales policy; invoice not yet issued                                     | Treating acceptance as proof of invoice issuance                      |
| Identity and scope           | Publisher, tenant and source order ID identify the fact; billing party mapping has its own owner           | Joining records by an unscoped number or assuming one-to-one identity |
| Time and revision            | Accepted values carry their effective time/revision; later corrections have explicit meaning               | Recomputing an old amount from today's catalog                        |
| Units and meaning            | Amount has currency and agreed scale/rounding semantics; tax inclusion is explicit                         | Copying a decimal whose meaning differs across models                 |
| Missing or unsupported input | Missing recipient mapping or unknown acceptance state prevents issuance and exposes a resolvable condition | Defaulting an unknown status to accepted or inventing zero tax        |
| Change ownership             | Publisher owns the fact; consumer owns the translation and its invoice decision                            | Moving both policies into an unowned integration utility              |

Keep mappings total over their declared accepted domain, with explicit unsupported
outcomes. A lossy translation needs a stated purpose and retained source evidence where
corrections require it; do not demand round-trip equality when information is deliberately
discarded. Test the decisions preserved by the mapping, not only field equality.

An input can be syntactically valid and semantically unusable. A new enum value, a changed
currency interpretation or a different meaning of `cancelled` may break a consumer while
the JSON schema remains compatible. Preserve a resolvable failure without exposing raw
sensitive payloads in logs. Establish authorization at the operation accepting the effect;
a translated identity is not permission to act for that identity.

If the exchange is asynchronous, define what duplicate, stale, reordered or corrected
facts mean to the consumer. This semantic requirement belongs in the map's contract;
delivery, deduplication, replay and transactional publication mechanisms need the relevant
implementation design. A type named `Event` does not establish durable delivery.

## Decide whether anything should be shared

Before introducing a shared kernel, enumerate the exact types/rules that belong in it,
their common meaning, participating owners and joint acceptance cases. Keep a reason for
sharing each part. A generic `common-domain` dependency tends to obscure which consumer
may reject a policy change; inspect that dependency rather than banning all reuse.

For example, two contexts may agree on an identifier's lexical format while disagreeing
on lifecycle and authority. A technical parser can be shared without sharing a mutable
entity or status policy. Even an apparently universal money type may hide different
precision, rounding and effective-time rules. Share the stable representation only when
its contract serves both; keep policy where its business meaning lives.

Require a change path: who reviews a new invariant, which consumers run compatibility
tests and how older artifacts continue to function where versions coexist. If this
coordination is unavailable, compare independent representations with translation.
Duplicating two small types can be cheaper than coupling policy lifecycles; indiscriminate
duplication can also make a genuinely shared invariant diverge. Test a concrete change
to decide, rather than using DRY or autonomy as an absolute.

## Challenge the proposed cut

Walk one normal operation and one correction through the map. At each step ask who may
make the decision, which version of the input is used, what invalidates it and where a
failure becomes visible. A relationship with no owner for unresolved identity or rejected
translation is incomplete even when its transport has been specified.

Then change one policy. In the example, Sales changes quote negotiation while Billing's
issued-invoice rule remains unchanged. A sound boundary can keep the accepted-order
meaning stable or identify a deliberate contract migration. If every private Sales change
requires Billing's model to change, investigate shared entities, meanings or duplicated
authority before claiming the contexts are independent.

These walkthroughs challenge a design; they are not executed application tests or proof
of business agreement. When disagreement remains, preserve both interpretations and the
specific domain question rather than choosing a convenient rule silently.
