# Evidence and disagreements

Use this reference when a conclusion depends on a definition, study or case study.
The purpose is to limit what each source can support, not to settle a coupling argument
by citation count. Sources below were consulted on 2026-09-05.

## Verified source, limited conclusion

- **Quantum terminology:** Ford, Richards, Sadalage and Dehghani, _Software Architecture:
  The Hard Parts_ (2021), chapter 2, printed pp. 28–29, available in the
  [publisher-book preview](https://api.pageplace.de/preview/DT0400.9781492086864_A49444518/preview-9781492086864_A49444518.pdf).
  It supplies the definition and separates operational from workflow communication dependencies.
  The preview stops before the detailed static/dynamic sections; it does not verify this
  skill's grouping procedure or every disputed shared-infrastructure example. Other books/
  editions were not checked here; do not claim their wording is unchanged or incompatible.
- **Independent delivery:** [DORA's capability guidance](https://dora.dev/capabilities/loosely-coupled-teams/)
  asks whether teams can change, test and deploy with limited outside coordination. This supports
  the investigation question, not a universal coupling cutoff or quantum-count quality measure.
- **Evolutionary coupling and defects:** [Kirbas et al., 2017](https://onlinelibrary.wiley.com/doi/full/10.1002/smr.1842)
  examined two industrial systems and found an association whose strength depended on context,
  including size and process measures. It does not establish that co-change causes defects,
  validate a release-coupling threshold, or prove that a two-person module's history is noise.
  Do not transfer a defect-prediction result to deployment independence without evidence.
- **Shared database mechanism:** Chris Richardson's
  [Shared Database pattern](https://microservices.io/patterns/data/shared-database.html)
  describes development and runtime coupling alongside transactional benefits. A design trade-off
  is not an empirical rule that every common server endpoint forces one release unit.
- **First-party failure account:** Adam Gluck's 2020
  [Uber architecture account](https://www.uber.com/ch/en/blog/microservice-architecture/)
  describes dependencies and coordination problems in a large service estate and an approach
  using domains. Use it as a reported mechanism, not a controlled comparison or a scale threshold
  for another organization. Neither Uber's service count nor its outcome determines your map.

Tool formulas and telemetry fields have their own direct sources in
[Measuring the unit](measuring-the-unit.md). They verify what a measurement observes,
not whether a particular estate has a harmful boundary.

## Resolve disagreements with counterexamples

**“One shared database means one quantum.”** First distinguish one physical instance,
shared schema objects, shared invariants and shared migration ownership. Under an explicitly
broad static-dependency convention a shared database may be included in one coupling envelope.
Compatible independent deployments can still exist. Report the convention and actual release
evidence instead of pretending these statements are logical opposites.

**“One mandatory synchronous call means one release.”** Demonstrated old/new API compatibility
can refute lockstep release even when a workflow still requires both services. Conversely,
removing the wait does not establish event-schema compatibility or independent data evolution.
Keep release and runtime views visible.

**“The metrics prove we must split.”** They may locate a costly coordination mechanism.
They do not compare the cost of retaining it with distribution, migration and operational costs.
Pass supported findings to the appropriate decision skill rather than inventing a universal
ratio or treating equal counts as proof of a good architecture.

**“No analyzer exists, so this cannot be governed.”** A catalog search cannot prove absence
of all tools. Even without full automatic semantic classification, tests can enforce forbidden
imports, compatible contracts, event-order handling or agreement on algorithm test vectors.
State the property checked and the blind spots; passing those tests is not complete connascence
analysis.

## What remains interpretation or unverified

The map procedure and worked counterexamples are engineering reasoning, not experimentally
validated quantum detection. The original Page-Jones paper was not directly consulted and the
attempt to retrieve Weirich's slide PDF failed; the vocabulary reference does not claim an
authoritative historical ordering. No systematic literature review or behavioral comparison
was performed. Consequently, do not claim “no empirical literature,” “nobody has studied this,”
or measured superiority of one coupling family from the sources assembled here.

When a source cannot be opened, record the limitation and narrow the claim. A redirected URL
does not establish why a publisher removed a page. Do not promote a secondary retelling to a
first-party result, attribute unread rebuttals, or infer a company's architecture from one team's
case study. Prefer the source needed to answer the actual edge question over more anecdotes.
