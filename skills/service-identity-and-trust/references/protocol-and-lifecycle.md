# Protocol and lifecycle contracts

Read this when selecting certificate/token trust, delegating identity, or designing
rotation, revocation and outage behavior. These are architectural requirements and teaching
cases, not executable configuration. Sources were checked on 2026-09-30; verify product
support and version-specific wiring in the target environment.

## Workload identity and trust domains

Choose identity granularity against permission and compromise boundaries. Sharing one
credential across unrelated workloads prevents selective withdrawal and meaningful actor
attribution. Giving every replica a different logical identity can also make policy churn
unmanageable; distinguish the stable authorized workload from instance-level audit evidence.
Document who can issue or acquire that workload identity, including deployment permissions
and access to credential-agent sockets or metadata endpoints.

SPIFFE defines workload identifiers, verifiable identity documents and a Workload API;
SPIRE is one implementation. A trust domain is an administrative identity boundary. It is
not automatically a tenant, Kubernetes namespace or authorization group. With X.509-SVIDs,
validate the appropriate trust bundle and peer SPIFFE ID using the applicable profile;
trusting a root does not grant every issued workload the same application privileges.
For federation, approve each foreign trust domain and its identity-to-permission mapping.
JWT-SVIDs have an audience contract and replay considerations distinct from X.509-SVID
authentication. Confirm which form each consumer supports. See the
[SPIFFE concepts](https://spiffe.io/docs/latest/spiffe-about/spiffe-concepts/) and
[specifications](https://spiffe.io/docs/latest/spiffe-specs/).

Existing private PKI, cloud workload credentials or well-operated service credentials can
satisfy a narrower contract. Compare identity bootstrap, least privilege, custody,
rotation effort and revocation behavior before adopting another platform. Avoid bespoke
certificate validation or JWT cryptography; use supported verifier libraries and review
their effective trust configuration.

## Token purpose, issuer and audience

Write the accepted token profile before choosing validators. The issuer is an authority
you configured, the audience identifies the intended recipient, and scope/claims express
only the permission vocabulary agreed with that authority. Tokens from two approved
issuers still need separate mappings; equal `sub` strings need not identify the same actor.

Within one issuer, `sub` may identify a user or a client application depending on the
issuance context. Do not turn every valid `sub` into a user lookup. Establish the issuer's
trusted way to distinguish principal kinds, such as non-overlapping identifier namespaces
or a validated issuer-controlled discriminator, and retain that distinction in policy and
caches. A caller-supplied grant-type header cannot supply it; `client_id` presence alone
also cannot, since RFC 9068 requires that claim for both kinds of access token. If the
distinction is unavailable, user-authorized effects remain unsupported rather than falling
back to a same-named user. See
[RFC 9068, section 2.2](https://www.rfc-editor.org/rfc/rfc9068.html#section-2.2) and
[OAuth Security BCP, section 4.15](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.15).

For example, a registered client's `sub=alice` must not acquire the rights of user `alice`.
Verify this with issuer-signed synthetic tokens under the actual accepted profiles, including
a warm authorization cache. A separately authorized system task may still run under that
client's own bounded rights; absence of a user is not itself a reason to forbid service work.

For **RFC 9068 JWT access tokens**, section 4 requires the access-token `typ` (`at+jwt` or
`application/at+jwt`), exact issuer, recipient audience, signature and expiration checks.
Preserve any additional applicable time/algorithm/claim constraints. This type requirement
belongs to this profile; do not apply it blindly to a different documented access-token
format. Explicit profile separation
prevents treating an OIDC ID token as an access token. See
[RFC 9068, section 4](https://www.rfc-editor.org/rfc/rfc9068.html#section-4).

In Spring, inspect the effective decoder and converter, including custom beans that change
Boot auto-configuration. Adding one validator must retain the others. Establish explicit
audience validation; issuer configuration alone does not state the intended API audience.
The [official resource-server reference](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html)
documents issuer, audience and custom-validation mechanisms. Its moving reference URL is
not evidence that a particular Boot release exposes a property: select the project's
resolved version before writing configuration. No Spring snippet is validated by this package.

Opaque-token introspection provides remotely obtained token state, with an availability
dependency and potentially stale cached results. Bound cache lifetime by the security
requirement and token expiry; an `active` response does not grant every operation.
[RFC 7662, section 4](https://www.rfc-editor.org/rfc/rfc7662.html#section-4) describes the
revocation/cache trade-off and prohibits caching beyond a returned expiration time.

## Delegation, impersonation and sender binding

Delegation retains a distinct actor acting for a subject. Impersonation presents the
subject's identity within the granted rights context. Choose deliberately when audit or
separation-of-duty rules depend on knowing the actor. Token exchange is a protocol, not
automatic entitlement to delegate: the issuer must permit the requesting client, subject,
target audience and requested rights. Do not let a caller manufacture a trusted actor claim.

Under RFC 8693, top-level claims and the current `act` actor govern access control; nested
prior actors are history, not additional privileges. Exchanging a token does not inherently
revoke the input or couple later revocation of input and output. Verify provider behavior
when the design depends on that relationship. See
[RFC 8693, sections 1.1, 2.1 and 4.1](https://www.rfc-editor.org/rfc/rfc8693.html).

mTLS client authentication at the token endpoint and certificate-bound access tokens are
different features. TLS between two workloads does not automatically bind an ordinary
bearer token to the presenting workload. For RFC 8705 certificate-bound tokens, verify the
token's certificate confirmation against the certificate actually proven by the presenter.
Proxy termination requires a protected, authenticated way to transfer that evidence; the
RFC does not define one universal forwarding-header solution. See
[RFC 8705, sections 3 and 6.5](https://www.rfc-editor.org/rfc/rfc8705.html#section-3).

This binding can prevent a different holder from using a stolen token; it cannot make an
authorized but compromised workload harmless. Keep its granted effects narrow and preserve
resource authorization. Test client certificate rollover together with bound-token renewal
so that a token tied to the old certificate is not accidentally paired with the new key.

## Rotation, outages and withdrawal

Distinguish issuer signing-key rotation, workload credential renewal, root/bundle rotation,
policy publication and emergency withdrawal. They change different acceptance conditions.
Assign an owner and time bound to each path, including late replicas and long-lived clients.

For ordinary rotation, distribute new verification material before using it to issue
credentials. Retain old trust only for the justified overlap derived from issued credential
lifetimes, verifier propagation, clock tolerance and connection behavior. Confirm adoption,
stop old issuance, then retire old material. Compromise changes this sequence: stopping
acceptance can be more urgent than avoiding disruption. Never retain compromised trust
just to finish a normal overlap window.

Specify operation behavior for these distinct states:

| State                                                                                    | Contract to establish and verify                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issuance/renewal unavailable; verifier has trusted material and credential remains valid | Existing verification may continue under agreed policy. Identify which callers cannot acquire or renew, their remaining validity budget, and when readiness/traffic changes.                        |
| Cold start or unknown signing key; trusted material cannot be obtained                   | Reject/unavailable for the protected operation; never learn an arbitrary key URL from a token. Bound trusted-endpoint refresh attempts to avoid an attacker causing unbounded fetches.              |
| Credential expires during an identity-system outage                                      | Reject subsequent use according to the credential profile. Do not extend expiry or increase clock leeway as an outage workaround.                                                                   |
| Policy/introspection dependency fails                                                    | Enforce a deliberately bounded, applicable cached decision if authorized by the contract; otherwise deny/unavailable. A cache miss or stale permit cannot turn into unconditional access.           |
| Identity, user grant or signing key is compromised                                       | Measure withdrawal at every enforcing replica, relevant cache and established connection. Stop new issuance where needed and distinguish blocking that identity from invalidating an entire issuer. |

Cache policy decisions only with all decision-relevant inputs: workload/subject namespace
and principal kind, current actor, tenant, resource/action and policy/state version as
applicable. Define invalidation and maximum age. Do not reuse a permit for a different resource or tenant;
resource changes can require a fresh decision even while the credential remains valid.
For local JWT validation, deleting a client or rotating its client secret does not by itself
make an already issued access token fail its signature/expiry checks. Explain the additional
withdrawal mechanism if a shorter bound is required.

Long-lived TLS connections or resumed sessions may avoid the new handshake that a trust
change relies on. Inspect the real client's/server's reauthentication, session-resumption,
connection lifetime and drain behavior; do not claim revocation based only on a rejected
fresh connection. Apply the same reasoning to queued commands already accepted under a
previous policy: their effect-time authority depends on the stated command contract.

Use an isolated fault sequence for a lifecycle change:

1. Establish a permitted request and a denied operation/tenant control with synthetic
   credentials; record protected effects and sanitized decision evidence.
2. Add the new issuer key or root, rotate one caller, and exercise old/new combinations
   across representative verifier replicas. Include a cold verifier and an existing
   connection; record the deployed library/proxy/provider versions.
3. Interrupt key/credential/policy delivery separately. Test warm state, missing state,
   refresh rejection, expiry and recovery; bound retries and observe renewal headroom.
4. Withdraw the old credential or grant and measure time until the last relevant path
   rejects it. Confirm rejection prevents the effect, then verify valid new traffic still
   succeeds. An unmeasured path remains a coverage gap.

Record decision/denial reason categories, policy version, safe principal identifiers,
renewal failures, credential-expiry headroom and last successful trust update. Keep raw
tokens, secrets and private keys out of logs/traces. Avoid per-user/tenant metric labels;
retain necessary actor detail in access-controlled audit records under the project's
privacy policy. A test of these cases demonstrates behavior in the exercised configuration;
limit conclusions to the tested paths and conditions.
