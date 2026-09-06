# Using taxonomies and ISO quality models

Read when a stakeholder supplies a quality-model checklist, cites ISO/IEC 25010, or uses a
term differently from the project's glossary.

## Decide what the model is being used for

A taxonomy groups concerns; a driver list prioritizes architectural attention; a requirement
states an obligation. Use the model to look for omissions, then define project-specific scenarios.
Membership in a model does not make every category equally important, and absence of a label
does not make the underlying requirement inexpressible or irrelevant.

Operational, structural and cross-cutting groupings can be useful prompts. A flat worksheet is
another presentation. The existence of a flat worksheet does not establish that its author
abandoned other groupings or that a later book edition has changed definitions.
Do not reconstruct authoritative quotations from secondary notes.

## Pin the edition and preserve the actual requirement

Primary pages checked for this revision:

- [ISO/IEC 25010:2011](https://www.iso.org/standard/35733.html) describes an eight-characteristic
  product quality model and a separate five-characteristic quality-in-use model. It is withdrawn,
  with successor documents listed on the ISO page.
- [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) describes a nine-characteristic
  product quality model for ICT and software products. ISO explicitly includes requirements,
  design, testing and evaluation among its uses; it is not confined to finished products.

A contract may still name an older edition. Do not silently substitute the newer vocabulary,
claim the old requirement is void, or make an unsupported compliance interpretation.

For a migration or mapping request, capture:

```text
Source requirement and named edition:
Source definition/clause (if supplied or verified):
Project meaning and observable scenario:
Proposed destination term/edition:
Coverage retained, changed or not verified:
Owner of mapping acceptance:
```

Similar names do not prove equivalent coverage, especially for umbrella terms such as reliability,
security/integrity or portability. Preserve the original requirement text alongside a proposed
mapping. A target taxonomy can express a scenario even when it lacks the exact source label:
for example, resource-adjustment timing can still be specified explicitly.

## Limits of the source check

The public ISO abstracts were consulted; the full normative texts and subcharacteristic mappings
were not verified for this revision. Consequently this skill does not reproduce a supposedly
complete 2023 hierarchy, cite unverified clauses, or assert that a missing term has no equivalent.
When exact placement or compliance matters, obtain the named edition's applicable text and the
responsible reviewer's interpretation. Continue with a provisional glossary/scenario mapping and
state the unresolved portion.

The [Richards worksheet](https://www.developertoarchitect.com/downloads/architecture-characteristics-worksheet.pdf)
was checked directly and carries a March 2024 revision date. Use it as a named elicitation aid.
It is not an ISO conformance crosswalk, an exhaustive quality model or empirical proof that a
fixed number of drivers is optimal.

Historical comparisons between book editions, empirical percentages from unrelated project
samples and claims about the best taxonomy are unnecessary to select this system's drivers.
Use evidence from the current domain and explicit definitions; keep any methodological preference
separate from a verified standard requirement.
