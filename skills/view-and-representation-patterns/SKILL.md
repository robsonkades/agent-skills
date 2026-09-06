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

Decide how a response is produced and keep domain policy out of the producer. Template
View, Transform View and Two Step View describe useful structures; applying the classical
HTML patterns to JSON is an analogy, not an exhaustive taxonomy. A shared helper or advice
is only a two-stage design when it separates a logical representation from final rendering.

The failure this prevents is domain policy migrating into a representation layer. Templates can be
tested and some engines compile them, but feedback is generally weaker than for typed domain code;
presentation conditions remain legitimate.

## The three patterns

```text
Template View     a template with placeholders; the output's structure is
                  visible in the template. Natural for HTML. Tempts logic
                  into itself; escaping and data-access boundaries also matter.

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
2. **Build the presentation model at the application/presentation boundary.** Resolve
   business meaning (currency, rounding, business date) before rendering; preserve typed
   values for machine consumers and let the renderer choose locale-specific display.
3. **Choose the pattern** by the decision rules below.
4. **Check the template or serializer for domain decisions.** Presentation branching, iteration and
   formatting are expected; invariant enforcement, pricing/authorization policy and data access are
   defects here.
5. **Apply the shared parts once.** An envelope, a layout, an error shape, a link format —
   these are Two Step View's justification, and duplicating them per response is the
   commonest inconsistency in an API.
6. **Verify the renderer's data and resource boundary.** Prefer detached, materialized
   response data; if deliberate internal entity exposure is retained, test field visibility
   and fetch behavior. For large exports, use the bounded streaming path in the reference.

Inspect the project's Java release, Spring/serializer/template versions and existing wire
contract before adapting examples. Records require Java 16+; the Spring `ProblemDetail`
example requires Spring Framework 6+ and Java 17+. Snippets omit project types, imports and
configuration; they are partial examples, not standalone applications. Preserve older
baselines and established contracts rather than upgrading to copy an example. Report the
chosen boundary, concrete defect/change and focused validation; missing configuration is
unknown, not proof of unsafe rendering or absent framework support.

## Decision rules

```text
Server-rendered HTML page
        → Template View, with a layout as the shared second step. Keep
          domain policy outside the template; presentation branching is valid.

JSON or XML for a program
        → Transform View: a DTO plus a serialiser, or explicit
          construction. The DTO is the contract (remote-facade-and-dto).

The same data must be served as JSON, CSV and a PDF
        → Transform View over one presentation model, one transform per
          format when semantics match. Use distinct shapes for different
          consumer, authorization or format requirements; share business policy.

A consistent envelope, layout, link format or localisation across
every response
        → Two Step View: build the logical representation, render it in
          one shared place when a logical intermediate adds value. A helper
          or layout composition alone may be sufficient.

Hypermedia fragments driven from the server (htmx-style)
        → Template View per fragment, with the same discipline as a
          page. Its HTML, selectors and behavior still form a client contract.

The client renders everything (SPA, mobile)
        → no server-rendered UI, but the server still shapes and serializes
          representations. Transform-style guidance remains applicable.

Output must vary by tenant, brand or locale
        → consider Two Step View for visual variation. Tenant-specific
          authorization and business data must be resolved upstream.
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
- Repeated envelope, layout or link changes suggest shared rendering may help; inspect
  existing composition before introducing an intermediate model.
- Its cost is indirection: the final output is not visible in any one file. Justify it with
  a real consistency requirement — several screens or endpoints, or several output formats
  — not with symmetry.
- **A view is not a place for authorisation.** Hiding a button in a template does not
  protect the endpoint. The check belongs in the use case; the template only reflects it
  (`service-layer-design`).
- Payload size affects serialization, transfer and client processing; measure these alongside
  query time before attributing latency. Shape the representation to the consumer
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
