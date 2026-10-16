# Modeling decisions and primary sources

Read for discovery across several tactical building blocks, uncertainty about the
business boundary, or disagreement about how much modeling a capability warrants.
The rules here are an operational synthesis; they do not claim that the authors
endorse these skills or prescribe the reference project's class names.

## Start with a concrete business disagreement

Ask a domain participant to walk through an ordinary case and an exception. Record the
terms they use, what they decide, the evidence available at that time and what would
make the outcome wrong. Compare this with the code's existing behavior. Preserve
different meanings with an explicit context instead of constructing a universal model
from fields that happen to look alike. A diagram or workshop is useful only if it
resolves a real uncertainty; do not invent stakeholder agreement.

Eric Evans's [DDD Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)
provides the vocabulary for language, model boundaries, entities, values, services
and aggregates. Scott Millett's
[Distilling DDD Into First Principles](https://github.com/mathiasverraes/15yearsddd/blob/master/manuscript/scott-millett/essay.md)
emphasizes collaboration, understanding the problem and challenging assumptions. Apply
these ideas by making an unresolved term or business example the next discovery task,
rather than treating the sample application's resulting class diagram as the discovery process.

## Match investment to the problem

Determine what differentiates the business and which rules change together. A simple
supporting capability can remain a transaction script; a generic capability may be
obtained from an existing product. A rich model pays for itself when interacting,
evolving policies benefit from explicit invariants and behavior. Classification is a
working hypothesis: revisit it when differentiation or complexity changes.

This decision is informed by Vlad Khononov's
[Revisiting the Basics of DDD](https://vladikk.com/2018/01/26/revisiting-the-basics-of-ddd/)
and Martin Fowler's [Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html).
Keeping a simple design and using a rich model deliberately are both valid outcomes;
do not burden a CRUD workflow with empty aggregates and services to satisfy a pattern list.

## Distinguish business space, model and deployment

A subdomain identifies a business problem area. A bounded context scopes a particular
model/language. Establish the relationship from concrete meanings and ownership;
neither term promises a one-to-one relation to a deployment unit. Translate mismatched
semantics at a deliberate boundary, including identity scope, units and effective time.

Nick Tune's [discussion of domains, subdomains and bounded contexts](https://medium.com/nick-tune-tech-strategy-blog/domains-subdomain-problem-solution-space-in-ddd-clearly-defined-e0b49c7b586c)
offers working definitions and stresses shared understanding. Fowler's
[Bounded Context](https://martinfowler.com/bliki/BoundedContext.html) explains separate
models and their relationships. The
[DDD Crew Bounded Context Canvas](https://github.com/ddd-crew/bounded-context-canvas)
can help record a proposed boundary's purpose, decisions and interactions when that
artifact is useful. A synchronous call is also an interaction; using a canvas does not
justify introducing a message broker.

## Draw the consistency boundary from the rule

Write the rule, identify every state element and writer, and state when it must hold.
Challenge a large object graph: a screen or ORM relationship may only require a read
projection. Prefer a smaller aggregate where it preserves the rule, and reference
independent roots through identity when that prevents accidental ownership. Conversely,
do not split a true atomic invariant merely to satisfy a size rule.

Vaughn Vernon's [Effective Aggregate Design, Part I](https://kalele.io/wp-content/uploads/2019/01/DDD_COMMUNITY_ESSAY_AGGREGATES_PART_1.pdf)
and [Part II](https://kalele.io/wp-content/uploads/2019/01/DDD_COMMUNITY_ESSAY_AGGREGATES_PART_2.pdf)
focus on consistency and cross-aggregate relationships. Treat one aggregate per
transaction as a useful design heuristic, not permission to weaken required atomicity.
Verify the chosen persistence/concurrency mechanism separately from the object model.

For a disputed choice, hold the scenario constant and change the decisive fact:
interchangeable values versus continuing identity; independent roots versus one atomic
rule; immediate notification versus durable external delivery. The model or mechanism
should change for a reason visible in the requirement. Written examples support a
design discussion; executed checks and stakeholder validation supply different evidence.
