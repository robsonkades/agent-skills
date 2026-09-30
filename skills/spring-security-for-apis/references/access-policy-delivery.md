# Discover and deliver an access boundary

Read for a new protected surface, a change of caller/credential policy, or an uncertain
gateway trust contract. A narrow repair with an established policy can reuse its evidence
and update only the affected contract. This is not a full-system threat-model exercise.

## Investigate the decision, not just the security beans

Start with the operation and its consumers: browser, partner, service account or operator;
the data or business effect they may reach; and the owner of that policy. Read existing
ADRs, API/security documentation, client configuration, routes, security beans, tests and
deployment ingress/management configuration. Separate an approved policy from an incidental
implementation and from a deployment assumption that the repository cannot prove.

Trace the relevant trust path from caller to protected operation. Can a client bypass the
gateway? Who strips and replaces identity headers? Where are credentials validated and
where are tenant/record permissions enforced? Authentication at an ingress does not alone
enforce instance authorization. A header-based pre-authentication filter assumes the
external system already authenticated the caller; it does not verify that identity itself.
Reuse this architecture only with a verified trusted ingress path and resistance to header
spoofing. Do not turn an arbitrary `X-User` or `X-Tenant` value into a principal because the
service is described as internal.
[Pre-authentication trust contract](https://github.com/spring-projects/spring-security/blob/7.1.0/web/src/main/java/org/springframework/security/web/authentication/preauth/RequestHeaderAuthenticationFilter.java).

Ask only where evidence leaves a material choice open, with a recommendation and its reason:

- **Unknown browser delivery:** "Does the gateway authenticate a browser cookie before
  forwarding the bearer header, and where is CSRF checked? Keep the existing protection
  until that path is established; the service header alone cannot settle browser risk."
- **Unknown external identity trust:** "Which network or ingress policy prevents direct
  service access and replaces caller-supplied identity headers? Reusing the gateway is
  appropriate if that boundary is enforced; otherwise header pre-authentication cannot
  establish the caller." Inspect available deployment artifacts before asking their owner.
- **Unknown revocation need:** "How quickly must a disabled principal lose access, and
  what does the issuer already guarantee? Retain local JWT verification if its accepted
  lifetime meets that bound; a tighter bound changes the online-validation/cache decision."

Group only the questions relevant to this change. Continue route inventories, isolated
tests and documentation work while policy-dependent wiring remains unresolved. Use explicit
reversible assumptions for low-impact details such as test fixture names; never assume an
issuer, tenant membership, access grant or acceptable revocation window. Do not re-ask an
answered question merely because another skill is loaded.

## Choose the smallest sufficient control

Record material decisions with their evidence and conditions, rather than producing a
mandatory classification table for every change:

- **Apply** the missing operation/instance check or credential validator required by the
  agreed policy. Define both a permitted control and a hostile case before changing it.
- **Reuse** an adequate managed decoder, corporate ingress policy, authority vocabulary,
  caller-context abstraction and existing denial representation. Confirm their effective
  wiring; a declared policy is not evidence that a request traverses it.
- **Clarify** unknown credential delivery, privilege ownership or revocation bounds. Leave
  only dependent behavior conditional; do not silently expose the operation.
- **Defer** an unrelated identity-provider migration or wider hardening, naming its owner
  and the condition for resuming it. An access-control defect in the requested operation
  is not optional backlog work merely because discovery exposed it.
- **Do not apply** authentication to an intentionally anonymous, public read merely to add
  security machinery. Preserve its public field allowlist and protect neighboring writes.
  Likewise, a scope-mapping fix does not justify introducing a second chain or policy DSL.

For an exposed or costly operation, discover resource-abuse controls as a separate concern:
existing gateway quotas, payload/query bounds and finite downstream capacity. Authentication
does not bound request volume; a rate limit does not establish authorization. Coordinate a
needed missing control with its owner rather than silently inventing quotas or duplicating
an enforced gateway limit in every replica. If outside the agreed change, state the risk
and trigger for follow-up rather than claiming the API is protected from overload.

## Implement and hand over the changed contract

Use the existing security integration point, with trusted caller identity converted to the
application's vocabulary at that boundary. Prefer typed subject/tenant identifiers and an
explicit absent/unauthenticated contract over stringly maps or a caller-provided privilege
flag. Keep credentials out of domain commands and error messages. Reuse an adequate policy
method with a domain name; add a separate policy abstraction only when multiple consumers
or independently testable rules justify it. A fluent DSL or generic authorization builder
does not improve a single route rule by itself.

Deliver the changed configuration/code, focused tests and the documentation needed by its
actual consumers and operators:

- **Consumer contract:** accepted credential delivery, required scopes/roles, ownership
  restrictions and public routes; affected status/challenge/error behavior, with invented
  credentials in examples. Update the existing API specification where applicable; its
  security declaration describes the check but does not enforce it.
- **Operator contract:** configuration names and trusted sources, secret provisioning,
  key/credential rotation ownership, safe failure diagnosis and provider-outage behavior
  when these change. Reuse the existing runbook and telemetry. Do not log bearer tokens or
  turn subjects/tenants into unbounded metric labels to debug a denial.
- **Compatibility:** identify clients affected by a changed issuer, audience, permission,
  cookie policy or 401/403 response. Coordinate a bounded migration where required; any
  overlap of accepted credentials needs an explicit trust contract and removal condition.
  A rollback must not restore a known access-control bypass.

Conclude with the changed policy, where it is enforced, the permitted/hostile checks actually
run and remaining deployment evidence. An application test cannot prove the gateway blocks
direct access; request a deployment-level bypass/header-spoofing check when that claim is
required. Name unavailable checks and how to obtain them rather than reporting the surface
as secure without that evidence.
