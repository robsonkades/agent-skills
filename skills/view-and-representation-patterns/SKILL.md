---
name: view-and-representation-patterns
description: >
  Producing the response: Template View, Transform View and Two Step View as three ways to
  turn a model into output, and what each becomes in a JSON API, a server-rendered page or a
  hypermedia fragment. Use when logic is accumulating inside templates, when a template
  triggers database queries during rendering, when the same data must be rendered in several
  formats and the mapping is duplicated per format, when a consistent look or envelope must
  be applied across every screen or endpoint, when entities are being serialised directly to
  clients, when a response shape is decided by whatever the service happened to return, or
  when server-rendered fragments and a JSON API are both being served from the same
  handlers. Does not cover routing and cross-cutting request concerns
  (mvc-and-request-handling), the remote operation's granularity and its payload contract
  (remote-facade-and-dto), compatibility and versioning of that contract
  (rpc-and-api-contracts), or serialisation throughput (serialization-performance).
---

# View and Representation Patterns

## Purpose

Decide how a response is produced and keep decisions out of the producer. The three
classical view patterns still describe every option in a modern stack — a Thymeleaf page, a
Jackson-serialised DTO, and a global response envelope are Template View, Transform View and
Two Step View respectively — and naming them makes the recurring failures easy to see.

The failure this prevents is domain policy migrating into a representation layer. Templates can be
tested and some engines compile them, but feedback is generally weaker than for typed domain code;
presentation conditions remain legitimate.

## The three patterns

```text
Template View     a template with placeholders; the output's structure is
                  visible in the template. Natural for HTML. Tempts logic
                  into itself, which is its only real weakness.

Transform View    code walks the model and produces output element by
                  element. Natural for JSON and for multi-format output;
                  the structure is in code, so it is testable and
                  refactorable, and less immediately visible.

Two Step View     build a logical representation first, then render it to
                  the final format in a second, shared step. Buys global
                  consistency — one place to change the envelope, the
                  look, the link format — at the cost of one indirection.
```

## Workflow

1. **Decide what the response is for.** A page for a human, a payload for a program, or a
   fragment for a client-side framework. The pattern follows from that, not from the stack.
2. **Build the presentation model in the application layer**, already decided and already
   formatted where formatting is a domain matter (money, dates in a business calendar).
   The view should have nothing left to decide.
3. **Choose the pattern** by the decision rules below.
4. **Check the template or serializer for domain decisions.** Presentation branching, iteration and
   formatting are expected; invariant enforcement, pricing/authorization policy and data access are
   defects here.
5. **Apply the shared parts once.** An envelope, a layout, an error shape, a link format —
   these are Two Step View's justification, and duplicating them per response is the
   commonest inconsistency in an API.
6. **Verify nothing lazy or managed reaches the renderer.** Serialising an entity is where
   the schema becomes the contract and where rendering starts issuing queries.

## Decision rules

```text
Server-rendered HTML page
        → Template View, with a layout as the shared second step. Keep
          the template free of decisions.

JSON or XML for a program
        → Transform View: a DTO plus a serialiser, or explicit
          construction. The DTO is the contract (remote-facade-and-dto).

The same data must be served as JSON, CSV and a PDF
        → Transform View over one presentation model, one transform per
          format. Duplicating the model per format is what goes wrong.

A consistent envelope, layout, link format or localisation across
every response
        → Two Step View: build the logical representation, render it in
          one shared place. This is what a controller advice or a layout
          template is.

Hypermedia fragments driven from the server (htmx-style)
        → Template View per fragment, with the same discipline as a
          page. The fragment is a view, not an API.

The client renders everything (SPA, mobile)
        → there is no view layer on the server. What you have is a
          Remote Facade returning DTOs, and view patterns do not apply.

Output must vary by tenant, brand or locale
        → Two Step View. The logical representation is shared; the
          second step is selected per tenant.
```

## Rules

- Templates must not own domain policy. Conditions are testable and may be presentation concerns;
  prefer a presentation model when branching duplicates business meaning or becomes hard to review.
  A loop and null/empty rendering are presentation; a discount calculation is not.
- **A template must not trigger data access.** Rendering that walks a lazy association
  issues queries during view rendering while the persistence context is open under Open Session In
  View; it may be outside the original service transaction. Scope query budgets to the whole request
  so rendering queries are included
  (`orm-behavioral-patterns`).
- Avoid serializing persistence entities across externally evolving or security-sensitive
  boundaries. A tightly internal CRUD endpoint may accept the coupling deliberately, with explicit
  visibility/fetch tests. Direct serialization otherwise couples the representation to
  the schema, exposes fields nobody chose to expose, and fails or over-fetches on lazy
  associations (`remote-facade-and-dto`).
- Formatting that carries business meaning — money with its currency and rounding, a
  business date in the right zone, a masked account number — belongs in the presentation
  model, decided once. Formatting done per template diverges across screens.
- Two Step View is the pattern most often needed and least often named. When a change of
  envelope, layout or link format requires editing many files, the second step is missing.
- Its cost is indirection: the final output is not visible in any one file. Justify it with
  a real consistency requirement — several screens or endpoints, or several output formats
  — not with symmetry.
- **A view is not a place for authorisation.** Hiding a button in a template does not
  protect the endpoint. The check belongs in the use case; the template only reflects it
  (`service-layer-design`).
- Payload size is a response-time decision. An endpoint returning several megabytes of JSON
  is slow for reasons no index will fix; shape the representation to the consumer
  (`architecture-and-performance`).
- Server-rendered fragments and a JSON API are different consumers with different contracts.
  Serving both from one handler by content negotiation is workable and tends to make the
  fragment's needs drive the API's shape — decide deliberately rather than by convenience.
- Test what the layer is responsible for: the presentation model's construction in a unit
  test, and the rendered output's contract in a focused test (a snapshot of the JSON shape,
  or a check that the template's required attributes are present).

## References

- [Template View and Transform View](references/template-and-transform-view.md) — both in a
  modern Java stack, the logic-in-template failure with the discipline that prevents it,
  building a presentation model, multi-format output from one model, escaping and injection
  at the boundary, and rendering that triggers queries. Read when writing or reviewing a
  view.
- [Two Step View and modern representations](references/two-step-view-and-modern-representations.md)
  — the shared second step as layout, envelope, problem-detail error shape and hypermedia
  links; per-tenant and per-locale rendering; where content negotiation belongs; and how the
  patterns map onto SPA backends, htmx fragments and streaming responses. Read when a
  cross-cutting representation concern is being introduced or duplicated.
