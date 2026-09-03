# Where session state lives

Three placements. They are not three implementations of one idea — they differ in what
happens when a replica dies, what a rolling deploy costs, what every request pays, and how
fast a revocation takes effect.

## The comparison

| Property                           | Sticky routing (in-process session)                                                               | External session store                                                                | Signed token (JWT or equivalent)                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Replica dies                       | Every session on it is lost — user-visible, and it is a _correctness_ failure, not a slow request | Sessions survive; the request is re-routed and continues                              | Nothing is lost; the token is in the client                                                        |
| Rolling deploy                     | Sessions on replaced pods are lost unless drained for full lifetime/replicated externally         | Survives if schema/store/key deployment is compatible                                 | Survives if signing keys/claims/client handling remain compatible                                  |
| Per-request cost                   | Affinity lookup plus local heap/serialization cost                                                | Store operations when session is read/written; caching/lazy access changes count      | Header bytes, parsing and signature/claim validation at every hop                                  |
| New dependency on the request path | Affinity/routing state and instance lifetime                                                      | Store availability/consistency for operations that require session (`failure-models`) | Issuer keys/trust cache; optional introspection/revocation state                                   |
| Revocation latency                 | Routing/session deletion propagation                                                              | Store deletion plus caches/in-flight requests                                         | Expiry, introspection, denylist/session version or key/audience rotation semantics                 |
| Size limit                         | Heap                                                                                              | Store limits, generous                                                                | Every request carries it; headers are bounded by the server and by proxies, so keep claims minimal |
| Horizontal scaling behaviour       | Uneven: long-lived users pin load to specific replicas                                            | Even                                                                                  | Even                                                                                               |
| Where it fails silently            | Affinity works in test (one replica) and in staging (low churn)                                   | Serialisation drift between two deployed versions during a rolling update             | A claim that has gone stale — a role revoked, a tenant changed                                     |

Two consequences worth stating plainly:

- Sticky routing is not a session design. It is a routing decision that _postpones_ one, and
  it pays for that with a user-visible failure on every replica death and every deploy.
- A token is a decision about **revocation**, not about performance. The latency saving is
  real but small; the semantics change is not. Choose it when bearer-validity-until-expiry is
  acceptable for that credential, and pick an expiry short enough that it is.

## External store — the Spring Session shape

Spring Session replaces the `HttpSession` implementation behind the servlet API, so
application code that calls `setAttribute`/`getAttribute` does not change. Only the
configuration and the serialisation contract do.

```java
// Conceptual: the placement change, not the whole configuration.
@Configuration
@EnableRedisHttpSession          // sessions move to Redis; HttpSession API unchanged
class SessionConfig {
    @Bean
    RedisSerializer<Object> springSessionDefaultRedisSerializer() {
        return new GenericJackson2JsonRedisSerializer();   // JSON, not JDK serialisation
    }
}
```

- **What goes in the session must be serialisable by the configured serialiser, and stable
  across two deployed versions.** During a rolling update, v1 and v2 read each other's
  sessions. A renamed field or a changed type is a deserialisation failure on a request that
  had nothing to do with the deploy. Treat session attributes as a wire format —
  `rpc-and-api-contracts` applies to them.
- The default JDK serialiser makes that worse: the payload is opaque outside the JVM and
  brittle across class evolution. JSON is the safer default, at the cost of losing types the
  serialiser cannot round-trip.
- The store is now on protected request paths. Give it a deadline/bulkhead and fail closed for
  authentication/authorization state. A separately defined public/read-only degradation may
  omit optional personalization; never treat unavailable auth state as authenticated.
- Keep the session small. It is read and written per request; a session holding a cart of
  every product detail turns into a per-request serialisation cost that shows up as a
  latency floor.

## Token — the shape and the two problems

```java
// Conceptual: a token carries claims, not a session. Keep it minimal and short-lived.
record AccessClaims(String subject, Set<String> scopes, String tenantId, Instant expiresAt) {}
```

- **Revocation.** A self-contained signed token remains cryptographically acceptable until
  expiry/key/audience policy unless verification also checks introspection, denylist, session/
  subject version or another state. Short access tokens plus rotated/revocable refresh tokens
  bound the window; emergency key revocation has large blast radius. Measure maximum revocation
  latency and account for verifier caches/in-flight requests.
- **Size and staleness.** Every claim is paid for on every request, in every hop, forever.
  Claims that change (permissions, tenant configuration, feature flags) are stale by
  construction; put identity in the token and look up what changes.
- Signature verification is in-process only if the key is in process. With rotating keys
  fetched from an issuer's key set, cache the keys — otherwise the "no network hop" property
  is not true.
- A signed JWT is readable by its holder and intermediaries unless separately encrypted (JWE)
  and transport/logging controls hold. Never place secrets or unnecessary PII in claims.

## Decision block

```text
Use an external session store when:
- the state is genuinely per-user and per-session (cart, wizard progress, an authorisation
  decision expensive to recompute) and its loss is user-visible
- you can accept one round trip on every request and the store as a required dependency
- a rolling deploy must not log anyone out

Use a signed token when:
- the state is identity and coarse authorisation, small enough to carry in a header
- validity-until-expiry is acceptable for that credential, with an expiry short enough that
  the revocation window is within policy
- the fleet has clients (mobile, third-party, service-to-service) for which a server-side
  session is awkward anyway

Avoid sticky routing when:
- replicas are replaced routinely — any Kubernetes deployment, autoscaling, or spot capacity
- the session holds anything whose loss is a correctness failure rather than a slow request
Sticky routing is acceptable only when:
- affinity is a performance optimisation over state that is derivable (a warm per-user cache)
  and the request is still correct on any other replica

Prefer holding no session at all when:
- every request already carries its own inputs and the "session" is really a cache of a
  database read — then it is derivable state, and the design is caching-strategies
```

## Testing the placement

- **Kill test.** Two replicas, affinity off, log in against one, `kill -9` it, continue the
  journey. External store and token: the journey continues. Sticky: it does not — and that is
  the finding, not a flaky test.
- **Mixed-version test.** Start v1 and v2 together against one store, create a session on v1
  and read it on v2, and the reverse. This is the failure that only appears during a deploy,
  so it must be provoked deliberately.
- **Revocation test.** Revoke access, then assert the maximum time until the next request is
  refused. That number is a stated property of the design; measure it rather than assuming it
  is zero.
- **Key rotation/rollback test.** Run old and new signing keys/verifiers concurrently, rotate,
  roll back and revoke; assert issuer/audience/algorithm pinning and no cross-tenant replay.
- **Store partition test.** Make the external session store unavailable and prove protected
  actions fail closed while explicitly public degradation remains bounded.

## Primary references

- [Spring Session reference](https://docs.spring.io/spring-session/reference/)
- [RFC 7519: JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519)
- [RFC 8725: JWT Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
