# Application Controller

## The problem it solves

A multi-step process whose next step depends on state, not on which link the user clicked:

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

A single object owns the flow: given the current state and what just happened, it decides
the next step. It knows nothing about HTTP.

```java
public enum ApplicationStep { IDENTITY, CREDIT_CHECK, COMPANY_DETAILS, SUMMARY, SUBMITTED }

/** Owns the flow. No framework, no HTTP, no persistence. */
public final class ApplicationFlow {

    public ApplicationStep next(ApplicationState state) {
        if (!state.hasIdentity())                         return IDENTITY;
        if (state.needsCreditCheck() && !state.hasCredit()) return CREDIT_CHECK;
        if (state.isBusiness() && !state.hasCompany())      return COMPANY_DETAILS;
        if (!state.isConfirmed())                           return SUMMARY;
        return SUBMITTED;
    }

    public boolean canEnter(ApplicationStep step, ApplicationState state) {
        return ordinalOf(step) <= ordinalOf(next(state));   // no skipping ahead by URL
    }
}
```

The handler becomes uniform, and there is exactly one of it:

```java
@PostMapping("/application/{id}/{step}")
String submit(@PathVariable UUID id, @PathVariable ApplicationStep step,
              @Valid StepForm form) {
    ApplicationState state = applications.stateOf(id);
    if (!flow.canEnter(step, state)) {
        return "redirect:/application/" + id + "/" + flow.next(state);
    }
    applications.apply(id, step, form.toCommand());
    return "redirect:/application/" + id + "/" + flow.next(applications.stateOf(id));
}
```

## Why this is worth the class

- **The flow is testable without HTTP.** A table-driven unit test covers every path in
  milliseconds, including the ones nobody clicks through manually.
- **The flow is stated once.** A new step or a changed condition is one edit.
- **Direct URL access is handled** by construction. `canEnter` closes the hole that
  hand-written redirects always leave — a user bookmarking step 4 and returning later.
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

| Placement                      | When                                                    | Reference                   |
| ------------------------------ | ------------------------------------------------------- | --------------------------- |
| Derived from the domain object | Best: the state is already there ("has a credit check") | `domain-logic-organization` |
| A row per in-progress process  | Long-running, resumable, valuable, auditable            | `session-state-strategies`  |
| Server session                 | Short flows only; lost on deploy                        | `session-state-strategies`  |
| Hidden fields in the form      | Trivial flows; visible and tamperable                   | —                           |

Prefer the first. A flow whose state is derived from the application's own data cannot
desynchronise from it, needs no cleanup, and survives everything. The most common failure of
the second and third is a flow state that says "credit checked" while the domain says
otherwise.

## When a flow object is overkill

- **A single form.** One handler, one redirect, no decision. Do not build a flow.
- **Linear steps with no conditions.** A next-step array or the framework's own wizard
  support is enough.
- **A REST API.** There is no navigation; the client drives. What the server owns is the
  legal state transitions of the resource, which belongs in the domain as a state machine,
  not in a controller layer (`domain-logic-organization`).

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
