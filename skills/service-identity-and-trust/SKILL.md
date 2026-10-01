---
name: service-identity-and-trust
description: >-
  Design trust between services when workloads authenticate, propagate user or tenant
  identity, delegate authority, or change credential issuance, rotation or revocation.
  Map trust boundaries, allowed operations and outage behavior; use when an internal
  network, gateway header or valid token is being treated as sufficient permission.
  Covers architecture and verification contracts, not Spring filter-chain implementation
  or identity-provider construction.
---

# Service Identity and Trust

Decide which remote caller may cause which effect, under whose authority, and how that
decision remains enforceable when credentials, policies or dependencies change. A valid
workload identity establishes a principal; permission still depends on the operation,
resource, tenant and applicable delegation policy.

## Scope and compatibility

Own the trust graph, identity semantics, credential lifecycle and placement of enforcement
between workloads. Preserve an adequate existing mechanism. Neither a mesh nor SPIFFE,
OAuth, a central policy engine or a separate identity platform is required by this skill.
Do not replace a local call with a remote authentication protocol without a trust boundary.

The architecture is independent of Java and Spring versions. Before recommending APIs,
inspect compiler/toolchain settings, resolved Boot/Security/client-library versions,
runtime images and deployed proxy/provider capabilities. This package contains a conceptual
policy example, no executable Java or Spring configuration. Framework examples from other
skills retain their declared baselines; adopting this skill does not authorize upgrades.

For Servlet filters, token validators and method interception, optionally use
`spring-security-for-apis`. For code-level tenant/instance authorization and its consistency
with a write, use `java-application-security-basics`. Pass the identities, credential profile,
allowed operations, reachable paths and required hostile tests. These optional handoffs do
not excuse an incomplete authorized implementation; use existing project conventions and
version-matched primary sources if a specialist is unavailable. Password storage, browser
login and building an authorization server are separate tasks.

## Discover the actual trust graph

Start with the affected call and protected effect; expand only to paths that can reach or
bypass it. Inspect source and deployment configuration before asking for missing facts.

1. **Follow every entry path.** Include gateways, direct service addresses, alternate ports,
   management endpoints, scheduled jobs, message consumers and support tools. Mark TLS
   termination and re-encryption, which peer the application actually authenticates, and
   who can reach a listener without the intended proxy. A diagram is a claim to check
   against listeners, network policy and a representative request path.
2. **Name identities separately.** Record the workload executing the call; the user or
   system subject whose authority is used; the current delegate, if any; and the tenant
   whose resources are addressed. Identify their trusted sources and namespace/issuer.
   A tenant selector in a URL or body is input to authorization, not proof of membership.
   Service names, email addresses and subject strings from different issuers can collide.
   Within one issuer, distinguish client and user subjects using its trusted issuance
   contract before granting user rights; a signed `sub` or matching user record is insufficient.
3. **Trace issuance and consumption.** Inspect trusted issuers or CA bundles, audiences,
   token/certificate profiles, client registration or workload attestation, permissions,
   key custody, credential lifetime and caches. Determine who can grant a workload an
   identity; authentication cannot compensate for an overbroad issuance policy.
4. **Find policy ownership.** Identify who defines delegation rights and who owns the
   resource/tenant decision. Inspect actual enforcement and denial paths, including
   authorization caches. Record revocation targets and acceptable security-state staleness
   separately from availability objectives; neither implies the other.
5. **Separate evidence from assumptions.** Sanitized configuration supports configuration
   claims; it does not prove production reachability or refresh behavior. If topology,
   issuance authority or the permission contract is missing, name the missing evidence and
   keep dependent decisions conditional. Continue mapping known paths; do not invent
   trusted issuers or grant all callers access to unblock progress.

Never collect private keys or live bearer tokens for a design review. Redact credentials
and unnecessary personal claims in captures; use synthetic principals for validation.

## Choose the identity and authority contract

Choose mechanisms against the observed boundary, deployment capability and lifecycle cost.
They can compose: workload authentication and user authorization answer different questions.

| Condition                                                                                                    | Decision and reason to reconsider                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing workload certificates or platform identities distinguish callers and support the required lifecycle | Reuse them with explicit peer-to-operation policy. Reconsider if identity is shared so broadly that compromise cannot be contained or attributed.                                                                              |
| A task runs under a service's own authority, such as inventory reconciliation                                | Grant only its system operations and tenant set. Do not invent a user or forward an unrelated browser token. If an effect must use a user's authority, this contract changes.                                                  |
| A downstream effect must be authorized for a user through an intermediary                                    | Preserve the authenticated subject and authorized actor relationship. Use a provider-supported constrained delegation mechanism when needed; verify the issuer's exchange policy, downstream audience and permitted scope.     |
| An incoming access token already has the intended downstream audience and approved propagation semantics     | Relay may be adequate over the protected path. Reconsider when forwarding exposes it to unrelated recipients, obscures the actor, or grants excessive authority. Never broaden accepted audiences merely to make relay work.   |
| Withdrawal of a grant must take effect faster than a locally validated credential expires                    | Require an online check, bounded cache/invalidation or another enforceable revocation mechanism. Compare its failure dependency and measured propagation against the target; short lifetime alone is not immediate revocation. |
| Cross-platform workload identity is repeatedly reimplemented                                                 | Consider SPIFFE-compatible issuance and verification against the existing platform alternative. Assess bootstrap, attestation, trust-bundle distribution and operational ownership; interoperability does not require a mesh.  |

Use audience and privilege restriction to limit where a credential is useful, following
[OAuth Security BCP, sections 2.2–2.3](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.2).
A bearer token can be replayed by its holder. Where theft/replay is material, evaluate a
supported sender-constrained mechanism and its end-to-end binding, not just an extra TLS hop.

When choosing token relay/exchange, certificate identities, federation or validation caches,
read [protocol and lifecycle contracts](references/protocol-and-lifecycle.md). It explains
which protocol guarantees can support the architecture and which remain deployment policy.

## Put enforcement at the protected boundary

- **Authenticate the evidence before trusting its claims.** Select issuers, key sources,
  token profiles and CA bundles from trusted configuration. For JWTs, verify the agreed
  signature/algorithm, issuer, intended audience and time/profile rules; for opaque tokens,
  use the trusted introspection contract and applicable claim checks. For certificates,
  validate the chain and expected peer identity. An incoming `iss`, `jku`, certificate header or
  discovery result does not grant itself authority. An ID token is not an API access token.
- **Make proxy trust explicit.** A gateway assertion is acceptable only over a protected
  route from an authenticated, authorized assertion producer, with client-supplied identity
  headers stripped/replaced and bypass paths excluded or independently protected. If TLS
  ends at a proxy, establish how validated caller identity reaches the application. A
  forwarded certificate string is not proof of possession. Test direct access with forged
  identity headers; an internal network label is insufficient evidence.
- **Authorize both the actor relationship and the effect.** A trusted payments service
  does not thereby gain every user's refund rights. Validate who may represent whom and
  for which operation; enforce the resource's tenant/owner and business invariant at a
  boundary all relevant entry paths cross. Central policy may decide shared rules, but
  the effect owner must enforce the decision against the actual resource and current
  state. If state changes between check and write, preserve the policy with the required
  transaction, version predicate or conditional mutation.
- **Keep transport types at integration boundaries.** In Java/Spring, map validated caller
  data into the small trusted context the application operation needs. Do not pass raw
  `Jwt`, servlet requests or credentials throughout a domain model. An immutable context
  is useful but does not prove provenance; only trusted adapters may construct its
  security assertions. Recheck paths that bypass Spring proxies and lost or copied
  security context across executors. A thread-local context does not cross a network.
- **Handle asynchronous authority deliberately.** Broker authentication identifies the
  connection's workload, not automatically the original user behind a payload. Decide
  whether a message carries an already-authorized business fact or requests a future
  effect that needs current authorization. Record provenance and tenant binding using the
  agreed producer/consumer contract; do not store a user's bearer token for indefinite
  replay. Delayed commands require an explicit authority and expiry/revalidation policy.

Conceptual policy pseudocode, not a token verifier or executable Java:

```text
permit refund only if
  verified caller is an allowed refund delegate
  AND verified subject may request this refund
  AND requested tenant equals the resource tenant and is allowed for this subject
  AND actor is allowed to represent this subject for this operation
  AND refund invariant still holds at the protected mutation
```

A batch reconciliation operation can instead use bounded system authority without a user.
Changing that requirement must change the identity contract; do not force delegation into
every background task or silently replace user authority with a powerful service account.

## Deliver and validate the contract

For a design, return a concise trust map and one contract per materially different call:
caller/subject/tenant sources, trusted verifier configuration, permitted effect, enforcing
component, lifecycle owner and failure behavior. Include the viable existing alternative,
why the chosen change is needed, and what would reverse the decision. For a review, report
the concrete path, evidence, consequence, correction and discriminating negative test.

When implementation is requested, integrate the agreed policy into the owning boundaries,
client credential acquisition, configuration, tests and operational instructions. Preserve
public contracts and project layering; do not introduce a shared all-service security
library without a demonstrated compatibility/ownership need. Stage changes with a defined
compatibility window for old/new credentials and policy versions. A rollback must not
restore a compromised credential, removed authorization check or open listener.

Validate using synthetic identities through the real boundary in an isolated environment:

| Case                                                                                 | Observable acceptance criterion                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correct workload, subject, tenant and delegated permission                           | The intended operation succeeds and audit evidence identifies the acting workload and authority used.                                                               |
| Valid signature but wrong issuer/audience, expired credential or wrong peer identity | Verification rejects before the protected effect; a decoded payload or mocked principal does not count as a verifier test.                                          |
| Valid workload attempts forbidden operation or crosses tenant/owner boundary         | Authorization denies and protected reads/writes reveal or change no forbidden data.                                                                                 |
| Valid service token has the same issuer and subject string as a privileged user      | The service cannot inherit user rights or a cached user permit; a permitted user request remains a positive control.                                                |
| Unapproved delegate or invented subject/tenant headers; direct gateway bypass        | The assertions cannot confer authority, including through an alternate reachable listener.                                                                          |
| Old/new credential overlap, unknown key and compromised identity withdrawal          | Valid overlap follows policy; unknown trust never becomes allow-all; withdrawal meets the stated bound across caches and connections.                               |
| Issuer, key endpoint, identity agent or policy service unavailable                   | Existing valid state and empty/stale state follow distinct declared rules; expired credentials are not extended and failed checks do not execute protected effects. |

For rotation, revocation and outage changes, use the targeted fault sequence in
[protocol and lifecycle contracts](references/protocol-and-lifecycle.md#rotation-outages-and-withdrawal).
Mocked Spring principals test authorization logic; real signed-token/certificate paths test
authentication. Neither alone proves deployed proxy/network enforcement. Record versions,
inputs, observed decisions and side effects, plus unavailable topology or fault-injection
evidence. Report walkthroughs as walkthroughs; do not call a design, configuration review
or passing happy path proof of isolation, immediate revocation or production resilience.
