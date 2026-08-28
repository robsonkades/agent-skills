---
name: mvc-and-request-handling
description: >
  How a web request is routed and handled: MVC's actual division of responsibilities, Page
  Controller versus Front Controller, and Application Controller for flows whose next step
  is a decision. Use when controllers contain business rules or persistence calls, when the
  same cross-cutting concern is copied into every handler, when a wizard's navigation logic
  is spread across handlers as if-chains, when a filter, interceptor and handler contend for
  one concern, when a controller is tested by starting the whole application, or when
  classical web patterns are mapped onto a REST API. Does not cover how the response is
  rendered (view-and-representation-patterns), the remote operation and its payload
  (remote-facade-and-dto), the use-case layer (service-layer-design), or where conversation
  state lives across requests (session-state-strategies).
---

# MVC and Request Handling

## Purpose

Keep the web layer to its actual job — turning a request into a call and a result into a
response — and put shared request concerns in one place instead of in every handler. Modern
frameworks implement these patterns for you, so the value here is not in building them but
in **recognising which pattern a piece of code is playing**, and noticing when a
responsibility has landed in the wrong one.

## The vocabulary, disambiguated

"Model" means three different things in a typical discussion, and conflating them causes
real design errors:

```text
Domain model        the business objects and rules (domain-logic-organization)
Presentation model  what the view needs: already formatted, already decided
Framework model     the map of attributes handed to a template (Spring's Model)
```

The classical MVC separation:

```text
Controller   interprets the request, invokes the application, selects the response.
             Owns NO business rules and NO persistence.
View         renders. Owns no decisions beyond presentation.
Model        the state being presented. In a web request this is a
             presentation model built for this response, not the aggregate.
```

Web MVC is not the original Smalltalk MVC: there is no observer relationship and no
long-lived view. The name persists; the mechanism is request → controller → model → render.

## Page Controller and Front Controller

```text
Page Controller      one handler per page or action. Simple, local, and every
                     shared concern must be repeated or inherited.

Front Controller     one entry point receives every request, applies shared
                     concerns, and dispatches to a handler. Shared concerns
                     exist once; the handler stays small.
```

Every modern Java web framework is a Front Controller (Spring's `DispatcherServlet`, JAX-RS'
servlet, a reactive router), and your `@Controller`/`@RestController` methods are Page
Controllers behind it. The practical questions are therefore not "which pattern" but **which
concerns belong in the front controller's chain and which in the handler**, and whether the
chain's stages are being used correctly.

## Workflow

1. **Check the handler's contents.** A controller should bind input, call one application
   service, and map the result. Rules, persistence calls and transaction demarcation in a
   controller are misplaced (`layering-and-boundaries`).
2. **Find the duplicated concern.** Anything copied into more than about three handlers —
   authorisation, error mapping, correlation ids, tenant resolution, response envelopes —
   belongs in the shared chain.
3. **Place it at the right stage.** Filter, interceptor, argument resolver, exception
   handler, advice: they see different things and run at different times. Choosing wrongly
   produces a concern that works until it does not.
4. **Extract flow decisions.** If a handler decides which step comes next based on
   application state, that is an Application Controller and it belongs outside the web
   layer.
5. **Keep the response shape a deliberate decision**, not the accidental serialisation of
   whatever the service returned (`remote-facade-and-dto`).
6. **Test at the right level.** Handler tests should not need a database; the mapping,
   validation and status codes are what the web layer is responsible for.

## Decision rules

```text
A concern applies to every request (correlation id, security context,
request logging, tenant resolution)
        → the front controller's chain: a filter, before routing.

A concern applies to a group of handlers and needs to know which handler
was selected (authorisation on an annotation, feature flags per route)
        → an interceptor or method-level security, after routing.

A concern turns an exception into a response
        → one exception handler for the application, producing one error
          shape (exception mapping in a single advice). Never a
          try/catch repeated per handler.

A concern turns request data into a domain-shaped parameter
(the current user, a parsed range, a tenant)
        → an argument resolver. This removes the boilerplate without
          hiding a business rule.

The next step of a multi-step flow depends on state, not on a link
        → Application Controller: a class that owns the flow, outside
          the web layer, testable without HTTP.

A screen is one page, one action, no shared concerns beyond the global
ones
        → a plain handler. Do not build a flow abstraction for it.

The API is REST over resources
        → routing is by resource and method, not by page. Page
          Controller and Front Controller both still describe what the
          framework does; the patterns to reach for are Remote Facade
          and DTO, not Two Step View.
```

## Rules

- **A controller with a business rule is a layering defect**, and the cheapest one to fix
  early. Grep for `if` statements that mention domain state in handler methods.
- **A controller with a repository call is not automatically wrong.** For a pure read it can
  be the honest design; for anything that writes, it puts the transaction boundary and the
  invariants in the web layer (`service-layer-design`).
- Cross-cutting concerns implemented per handler diverge. The third copy is the signal, and
  the fix is one chain stage, not a base controller class — inheritance for cross-cutting
  concerns fails as soon as a handler needs two of them.
- **Choose the chain stage by what it must see.** A filter runs before routing and cannot
  know which handler will be chosen; an interceptor runs after and can. Authorisation that
  depends on the handler's annotation cannot be a plain filter.
- The framework's model map is a presentation concern. Putting entities in it couples the
  template to the schema and triggers lazy loading during rendering
  (`orm-behavioral-patterns`).
- Validation splits in two and both halves are needed: **syntactic** (required, format,
  range) belongs at the boundary, on the request type; **semantic** (this customer may not
  order this product) belongs in the domain, where it can be enforced regardless of the
  caller.
- One error shape for the whole application, produced in one place. Per-handler error
  formats are the most common API defect, and RFC 9457 problem details give a standard
  target (`rpc-and-api-contracts`).
- **Application Controller is the least-known pattern here and the most useful** where it
  applies: multi-step flows, approval chains, state machines. Its value is that the flow
  becomes a testable object rather than a set of redirects spread over handlers.
- Do not map classical page-flow patterns onto a REST API by analogy. A REST endpoint is a
  Remote Facade over a resource; there is no page, no navigation and no view state
  (`remote-facade-and-dto`).
- Handler tests are boundary tests: binding, validation, status codes, error shape. If a
  handler test needs a database, either the handler is doing too much or the test is at the
  wrong level (`architecture-testing`).

## References

- [Page Controller versus Front Controller](references/page-vs-front-controller.md) — both
  patterns in a modern stack, exactly which shared concern belongs at which stage of the
  chain (filter, interceptor, argument resolver, advice) with the ordering that matters, the
  base-controller anti-pattern, and how the same reasoning applies to a message consumer or
  a scheduled job. Read when placing a cross-cutting concern or reviewing a controller.
- [Application Controller](references/application-controller.md) — flow logic extracted from
  handlers: a state machine over an application process, where the flow state lives, how it
  is tested without HTTP, and when a flow abstraction is overkill. Read when a wizard,
  approval chain or multi-step process is being built or has become unmanageable.
