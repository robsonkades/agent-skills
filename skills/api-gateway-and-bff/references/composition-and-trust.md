# Composition and trust contracts

Read when an endpoint combines services, returns degraded content, forwards identity or
caches a personalized view. Examples below are illustrative contracts and pseudocode,
not executable Java, deployed measurements or a ready-made API specification.

## A client-specific read, with an explicit limit

Assume a mobile order screen needs the caller's order summary and optional delivery ETA.
The browser administration screen already uses adequate service APIs. Measurements from
the target project must establish whether the mobile composition earns its cost; these
illustrative requirements do not prove it does.

Orders owns order access and status. Delivery owns the ETA. The BFF chooses the screen
shape and whether it may omit the ETA; it cannot declare an order shipped because the
delivery service timed out. The entry gateway authenticates the request and applies its
agreed admission policy. Both downstream operations still enforce their access contracts.

Illustrative contract, with deliberately chosen numbers to replace from real requirements:

| Concern                 | Contract                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Overall server deadline | 450 ms from edge admission through response production; client/network budget is separate                            |
| Critical path           | Authenticate, fetch and authorize order, then enrich with optional ETA, then serialize                               |
| Composition budget      | At most two downstream calls, one attempt each; ETA bounded by both 120 ms and remaining time minus response reserve |
| Work bounds             | Finite per-peer in-flight/pending limits, one order per request, bounded downstream and output bodies                |
| Mandatory failure       | No order view when the order lookup/authorization fails; map a stable, policy-approved error                         |
| Optional failure        | Order view with explicit unavailable ETA; no fabricated date; backend failure details remain internal                |
| Recovery                | Next eligible read may obtain ETA; no background retry continuing without an owner or budget                         |

The ordering intentionally avoids asking Delivery for data before Orders establishes
access to the requested order. Parallelism would need an equally valid authorization
contract; do not trade unauthorized reads for latency. Reuse per-peer clients and their
bounded pools instead of constructing a connection pool or executor per request.

Pseudocode for the completion rule, not a framework recipe:

```text
admit request under existing route/work limits
authenticate; validate route and input size
fetch order using trusted caller context and remaining budget
require authorized order result
if enough budget remains:
    request authorized ETA within optional limit
    map declared transient ETA absence to unavailable
    propagate identity/policy failures through the agreed security error policy
else:
    mark ETA unavailable without launching work
return authorized order view with contracted completeness, within output bound
```

For an optional transient outage, one possible response is:

```json
{
  "order": { "id": "o-123", "status": "ACCEPTED" },
  "deliveryEta": { "state": "unavailable", "value": null },
  "completeness": "partial"
}
```

HTTP 200 can fit this application contract because the requested view explicitly permits
missing enrichment. HTTP 206 is defined for range responses, not generic missing business
fields ([RFC 9110, section 15.3.7](https://datatracker.ietf.org/doc/html/rfc9110#section-15.3.7)).
Choose the actual success/error contract with consumers. Do not automatically expose the
name of a hidden service or distinguish forbidden from nonexistent objects to a caller.

If ETA becomes necessary for a delivery promise at checkout, this representation no
longer authorizes that promise. The authoritative operation must validate/reserve under
its own consistency and concurrency rules. A stale cache plus a BFF check cannot make a
later mutation atomic. Likewise, a failed response to a submitted command leaves the
effect uncertain; preserve intent/idempotency identity and use its owner's lookup or
recovery contract before replaying it.

## Identity is a hop contract

Draw the actual path, including CDN/load balancer, gateway, BFF, service, management port
and internal callers. For each hop, record transport protection, authenticated peer,
end-user/delegated identity, target resource, permitted actions and tenant derivation.
Then choose the existing mechanism that meets that contract:

- **User token relay:** only to a receiver entitled to consume that access token.
  Verify audience/resource, issuer and scope at the receiver according to the token
  profile. A token for the BFF is not automatically a token for Orders.
- **Workload credentials:** appropriate for service-owned operations; these identify the
  caller service, not an arbitrary user. Preserve the actor/delegation distinction for
  user-sensitive operations rather than replacing the user with an all-powerful account.
- **Token exchange or another delegation mechanism:** consider when the issuer supports
  a required audience/authority change. Document that issuer's actual policy; relay
  itself does not exchange tokens or establish permission to impersonate a user.
- **Authenticated proxy context:** viable only with a defined integrity-protected path,
  accepted proxy identity, header replacement rules and inaccessible/rejected bypasses.
  A private address or header spelling alone is insufficient evidence of provenance.

Resource-bound tokens reduce unintended token use; they still require receiver validation
and authorization ([RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707)). Use the
project's identity contract rather than inventing an issuer, audience or tenant claim.
Trace identifiers are correlation data and never authorization credentials.

Treat routing inputs as untrusted: explicit upstreams and allowed paths should determine
destinations, not a caller's arbitrary URL, Host or forwarded host. Check redirect handling
before attaching downstream credentials, and prevent forwarding them to an unintended
origin. At the first applicable untrusted boundary, discard or normalize untrusted proxy
headers; at later hops, consume only the chain justified by the actual topology.

For browser sessions, decide where OAuth tokens and session state live, who may read them,
cookie scope/lifetime and what happens on restart or failover. Keeping tokens server-side
does not eliminate cookie-based CSRF or session theft. Test unsafe requests with missing
or invalid CSRF protection when the browser automatically sends authentication cookies.
See [Spring Security CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html)
for the Servlet mechanism; select the matching version and stack before wiring it.

## Cache and failure verification

Disable shared caching of personalized views unless the cache policy proves isolation.
If caching is justified, derive identity/tenant keys from trusted context, include every
representation dimension, bound freshness and define authorization/revocation behavior.
A cache keyed only by URL can return one user's order to another. A `Vary` header alone
does not prove the deployed CDN/cache follows the intended identity policy. Optional stale
data must carry its agreed age/meaning and cannot authorize a protected business effect.

Choose HTTP cache directives from the retention contract: unqualified `private` excludes
shared caches but permits private storage; `no-store` prohibits storage; `no-cache`
permits storage but requires successful validation before reuse. `Set-Cookie` alone does
not prevent caching. These are protocol rules, not proof that deployed intermediaries or
application caches enforce the policy; inspect overrides and test the actual path
([RFC 9111, sections 5.2.2 and 7.3](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2)).

Define cacheability and lifetime for degraded representations separately from complete
ones. A contracted partial HTTP 200 can still be cached: a transient ETA outage must not
silently inherit a long success TTL and hide recovery. Choose no storage or a bounded
degraded lifetime from the client's recovery/freshness requirement, and make response
headers and application-cache policy agree. Preserve useful complete data only when its
stale-use contract permits it; do not replace it automatically with an unavailable value.

For the changed path, build hostile fixtures that exercise the deployed entry and service:
forged `X-User-Id`/tenant/proxy values, a valid token with the wrong resource audience,
authorized caller requesting another tenant's object, direct backend access, and a
second caller requesting a previously cached URL. Assert absence of unauthorized data
and effects, as well as the agreed terminal result. Mock authentication proves only
business behavior under the supplied principal; include actual credential/filter/proxy
validation for claims about the trust boundary.

For degradation, delay Delivery beyond the optional budget and separately fail Orders.
Assert client rendering, attempts and local in-flight work after completion. When budgets
are exhausted, verify that no further downstream call starts. If caching is enabled, restore
Delivery and repeat the read through each cache; assert recovery within the agreed window,
then verify a second user's isolation and denial after access revocation within the agreed
revocation window. Treat these as validation instructions until executed against an
implementation, not evidence supplied by this skill.

The [API Gateway/BFF pattern](https://microservices.io/patterns/apigateway.html) motivates
client adaptation and its added operational cost. It does not establish that every client
needs a separate deployment, that reactive code is always faster, or that any partial
response is correct. Those decisions require the target contracts and measurements above.
