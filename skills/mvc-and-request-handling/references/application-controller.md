# Application Controller

## The problem it solves

A multi-step process whose next step depends on state, not on which link the user clicked:

Use this extraction when shared or complex journey decisions need one owner. A trivial
state-based redirect can remain in a handler; the mere presence of a branch is not a defect.

```java
// Flow logic smeared across handlers. Every handler knows the whole flow.
@PostMapping("/application/{id}/identity")
String submitIdentity(@PathVariable UUID id, @Valid IdentityForm form) {
    service.saveIdentity(id, form);
    var app = service.load(id);
    if (app.requiresCreditCheck()) return "redirect:/application/" + id + "/credit";
    if (app.isBusinessCustomer())   return "redirect:/application/" + id + "/company";
    return "redirect:/application/" + id + "/summary";
}

@PostMapping("/application/{id}/credit")
String submitCredit(...) {
    // the same decision tree again, with one branch different, written by someone else
}
```

Symptoms that this has happened: the same conditions repeated in several handlers; a change
to the flow requiring edits in five places; nobody able to state the flow without reading
every handler; and no way to test the flow without driving HTTP.

## The pattern

A single object computes the next presentation step from authoritative state. It knows
nothing about HTTP. This partial Java example omits `ApplicationState` and static enum
imports. `isConfirmed()` denotes an irreversible submitted state for this example.

```java
public enum ApplicationStep { IDENTITY, CREDIT_CHECK, COMPANY_DETAILS, SUMMARY, SUBMITTED }

/** Owns the flow. No framework, no HTTP, no persistence. */
public final class ApplicationFlow {

    public ApplicationStep next(ApplicationState state) {
        if (state.isConfirmed())                          return SUBMITTED;
        if (!state.hasIdentity())                         return IDENTITY;
        if (state.needsCreditCheck() && !state.hasCredit()) return CREDIT_CHECK;
        if (state.isBusiness() && !state.hasCompany())      return COMPANY_DETAILS;
        return SUMMARY;
    }
}
```

Keep typed handlers when steps have different input and validation contracts. For example,
the identity handler delegates one transition to an application service. This partial
Spring 6+/Java 17 web adapter snippet omits its containing controller, constructor-injected
`applications`/`flow`, imports and request types. Map each step to an actual route explicitly:

```java
@PostMapping("/application/{id}/identity")
String submitIdentity(@PathVariable UUID id, @Valid IdentityForm form,
                      @CurrentUser Actor actor) {
    ApplicationState updated = applications.submitIdentity(id, actor, form.toCommand());
    String path = UriComponentsBuilder.fromPath("/application/{id}/{step}")
        .buildAndExpand(id, stepPath(flow.next(updated))).toUriString();
    return "redirect:" + path;
}

private String stepPath(ApplicationStep step) {
    return switch (step) {
        case IDENTITY -> "identity";
        case CREDIT_CHECK -> "credit";
        case COMPANY_DETAILS -> "company";
        case SUMMARY -> "summary";
        case SUBMITTED -> "submitted";
    };
}
```

The route names above are this example's web contract, not enum names or domain state.
Keep the mapping in the web adapter, verify every destination exists, and test the configured
context path/redirect and trusted-proxy policy. An enum's `toString()` need not match its URL.

`submitIdentity` must authorize the actor for this application, validate the permitted
transition against current state, and apply it atomically (for example, transaction plus
version check). Reject or reconcile stale submissions and define duplicate-submit behavior.
A controller-side read/check followed by a separate write races concurrent requests.
Navigation output never authorizes a mutation. Explicitly define whether prior steps are
editable, how edits invalidate dependent credit checks, and which steps apply: enum ordinal
comparison cannot encode these rules. Protect browser mutations with the project's CSRF
policy; a hidden field or URL is not trusted flow state.

## Why this is worth the class

- **The flow is testable without HTTP.** A table-driven unit test covers every path in
  milliseconds, including the ones nobody clicks through manually.
- **The navigation decision is stated once.** A new step may still need a form, route and
  transition validation.
- **Direct URL access is checked separately.** Navigation guards improve the journey;
  application authorization and transition checks protect writes from every caller.
- **The flow can be driven by something other than the web.** An API, an import, a
  back-office tool, or a test.

```java
@ParameterizedTest
@MethodSource("flowCases")
void next_step(ApplicationState state, ApplicationStep expected) {
    assertThat(new ApplicationFlow().next(state)).isEqualTo(expected);
}
```

## Where the flow state lives

The Application Controller decides; something else remembers.

| Placement                      | When                                                            | Reference                   |
| ------------------------------ | --------------------------------------------------------------- | --------------------------- |
| Derived from the domain object | When authoritative state already contains the required progress | `domain-logic-organization` |
| A row per in-progress process  | Long-running, resumable, valuable, auditable                    | `session-state-strategies`  |
| Server session                 | Retention and deploy survival depend on the session store       | `session-state-strategies`  |
| Hidden fields in the form      | Trivial flows; visible and tamperable                           | —                           |

Prefer deriving progress when it represents the journey accurately, avoiding a second
independently updated truth. Consistent reads, stale clients, retention and process-version
changes still matter. Persist separate progress when the journey contains information the
domain does not own; keep its updates consistent with the relevant domain transitions.

## When a flow object is overkill

- **A single form.** One handler, one redirect, no decision. Do not build a flow.
- **Linear steps with no conditions.** A next-step array or the framework's own wizard
  support is enough.
- **An API with no server-owned journey.** Do not invent page navigation. APIs can expose
  workflow or hypermedia transitions; business legality must still hold independently of
  those links (`domain-logic-organization`).

## Application Controller versus a domain state machine

They are different objects with different jobs, and conflating them is the usual mistake:

```text
Domain state machine   which transitions are LEGAL for this business object.
                       Enforced regardless of caller. Lives in the domain.
                       "An order cannot ship before it is paid."

Application Controller which step comes NEXT for this user's journey.
                       A presentation-flow concern. Lives above the domain.
                       "After the identity form, show credit check if required."
```

If a rule must hold for an API caller, an import and a back-office user alike, it is the
first and belongs in the aggregate. If it only shapes what a user is shown next, it is the
second. Putting a legality rule in the flow object leaves every non-web caller unprotected —
which is the failure mode worth checking for whenever both exist.
