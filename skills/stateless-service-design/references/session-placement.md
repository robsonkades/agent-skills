# Where session state lives

Three placements. They are not three implementations of one idea — they differ in what
happens when a replica dies, what a rolling deploy costs, what every request pays, and how
fast a revocation takes effect.

## The comparison

| Property                           | Sticky routing (in-process session)                                                       | External session store                                                                                | Signed token (JWT or equivalent)                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Replica dies                       | Unreplicated sessions are lost; impact follows the declared recovery/session-loss policy  | Committed session state can survive subject to store durability/availability; in-flight work may fail | Client token survives; in-flight work and any server-side journey state may not                    |
| Rolling deploy                     | Sessions on replaced pods are lost unless drained for full lifetime/replicated externally | Survives if schema/store/key deployment is compatible                                                 | Survives if signing keys/claims/client handling remain compatible                                  |
| Per-request cost                   | Affinity lookup plus local heap/serialization cost                                        | Store operations when session is read/written; caching/lazy access changes count                      | Header bytes, parsing and signature/claim validation at every hop                                  |
| New dependency on the request path | Affinity/routing state and instance lifetime                                              | Store availability/consistency for operations that require session (`failure-models`)                 | Issuer keys/trust cache; optional introspection/revocation state                                   |
| Revocation latency                 | Routing/session deletion propagation                                                      | Store deletion plus caches/in-flight requests                                                         | Expiry, introspection, denylist/session version or key/audience rotation semantics                 |
| Size limit                         | Heap                                                                                      | Store limits, generous                                                                                | Every request carries it; headers are bounded by the server and by proxies, so keep claims minimal |
| Horizontal scaling behaviour       | Uneven: long-lived users pin load to specific replicas                                    | Removes session affinity; load can still skew                                                         | Removes session affinity; load can still skew                                                      |
| Where it fails silently            | Affinity works in test (one replica) and in staging (low churn)                           | Serialisation drift between two deployed versions during a rolling update                             | A claim that has gone stale — a role revoked, a tenant changed                                     |

Two consequences worth stating plainly:

- Sticky routing can be an explicit stateful session choice if affinity loss and reauthentication
  or journey recovery are acceptable. It does not make replicas interchangeable.
- A token changes revocation and disclosure semantics. Its cost relative to a store depends on
  payload, cryptography, caching and required lookups; measure rather than assuming a saving.

## External store — the Spring Session shape

Spring Session replaces the `HttpSession` implementation behind the servlet API, so
application code that calls `setAttribute`/`getAttribute` does not change. Persistence timing, concurrent updates and attribute serialization still need review.

For a servlet application, verify the installed Spring Session/Data Redis line, repository,
Redis connection factory and Boot auto-configuration. A custom serializer bean is named
`springSessionDefaultRedisSerializer`. Select the implementation for that dependency line:
Jackson 2 and Jackson 3 examples are not interchangeable. Do not add manual enablement that
silently replaces Boot's configured repository choice.

- **What goes in the session must be serialisable by the configured serialiser, and stable
  across two deployed versions.** During a rolling update, v1 and v2 read each other's
  sessions. A renamed field or changed type can fail deserialization or silently change meaning,
  depending on schema/defaults and serializer configuration. Treat session attributes as a wire format —
  `rpc-and-api-contracts` applies to them.
- Neither JDK serialization nor generic JSON is automatically safe. Restrict allowed types and
  polymorphic deserialization, protect store writers and test the actual attributes, including
  security context types. JSON does not itself establish compatibility or a trust boundary.
- The store is now on protected request paths. Give it a deadline/bulkhead and fail closed for
  authentication/authorization state. A separately defined public/read-only degradation may
  omit optional personalization; never treat unavailable auth state as authenticated.
- Keep the session small. Measure repository access and save/flush behavior; not every request
  necessarily reads and writes it. Large attributes can amplify storage, serialization and
  concurrent-update costs.

## Token — the shape and the two problems

```java
// Conceptual: a token carries claims, not a session. Keep it minimal and short-lived.
// Java 16+ shape, not a token verifier. A record does not defensively copy the Set.
record AccessClaims(String subject, Set<String> scopes, String tenantId, Instant expiresAt) {}
```

- **Revocation.** A self-contained signed token remains cryptographically acceptable until
  expiry/key/audience policy unless verification also checks introspection, denylist, session/
  subject version or another state. Short access tokens plus rotated/revocable refresh tokens
  bound the window; emergency key revocation has large blast radius. Measure maximum revocation
  latency and account for verifier caches/in-flight requests.
- **Size and staleness.** Claims add bytes wherever the token is transmitted. Mutable claims
  can become stale before expiry; choose a bounded freshness policy or an authoritative lookup
  when current permissions/tenant state are required.
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
- measured repository I/O and availability meet the session contract
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
Sticky routing can be acceptable when:
- affinity is an optimization over reconstructible state, or explicit session loss/recovery is
  acceptable; the latter is a stateful contract, not stateless interchangeability

Prefer holding no session at all when:
- every request already carries its own inputs and the "session" is really a cache of a
  database read — then it is derivable state, and the design is caching-strategies
```

## Testing the placement

- **Kill test.** Two replicas, affinity off, log in against one, terminate it in an authorized test, continue the
  journey. Check the last durable checkpoint, in-flight outcome and retry/recovery contract.
  Store/token placement alone does not guarantee that an interrupted request succeeds.
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

- [Spring Session Redis configuration](https://docs.spring.io/spring-session/reference/configuration/redis.html) — serializer/repository configuration; select documentation for the deployed dependency line.
- [RFC 7519: JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519)
- [RFC 8725: JWT Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
