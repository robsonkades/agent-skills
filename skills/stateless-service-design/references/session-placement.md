# Where session state lives

Three common placements, which can coexist for different items. They differ in what
happens when a replica dies, what a rolling deploy costs, what every request pays, and how
fast a revocation takes effect.

## The comparison

| Property                           | Sticky routing (in-process session)                                                         | External session store                                                                                | Signed token (JWT or equivalent)                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Replica dies                       | Unreplicated sessions are lost; impact follows the declared recovery/session-loss policy    | Committed session state can survive subject to store durability/availability; in-flight work may fail | Client token survives; in-flight work and any server-side journey state may not    |
| Rolling deploy                     | Local-only sessions need full-lifetime drain, replicated/recoverable state or accepted loss | Survives if schema/store/key deployment is compatible                                                 | Survives if signing keys/claims/client handling remain compatible                  |
| Per-request cost                   | Affinity lookup plus local access; serialization depends on implementation                  | Store operations when session is read/written; caching/lazy access changes count                      | Token bytes where carried; validation at the actual consuming trust boundaries     |
| New dependency on the request path | Affinity/routing state and instance lifetime                                                | Store availability/consistency for operations that require session (`failure-models`)                 | Issuer keys/trust cache; optional introspection/revocation state                   |
| Revocation latency                 | Routing/session deletion propagation                                                        | Store deletion plus caches/in-flight requests                                                         | Expiry, introspection, denylist/session version or key/audience rotation semantics |
| Size limit                         | Heap/population, configured limits and any replication envelope                             | Value/serialization/transport limits plus population, retention and operational budget                | Token-carrying requests face client/server/proxy limits; keep claims minimal       |
| Horizontal scaling behaviour       | Uneven: long-lived users pin load to specific replicas                                      | Removes session affinity; load can still skew                                                         | Removes session affinity; load can still skew                                      |
| Where it fails silently            | Affinity works in test (one replica) and in staging (low churn)                             | Serialisation drift between two deployed versions during a rolling update                             | A claim that has gone stale — a role revoked, a tenant changed                     |

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
- Shared storage does not serialize a conversation's read-modify-write operations. Two requests
  can read the same basket and overwrite each other's changes; a Java monitor on one instance
  cannot coordinate independent objects on another. Inspect attribute mutation tracking,
  save/flush timing and the actual conflict protocol. Use `session-state-strategies`'s
  `references/state-placement.md` for those persistence details and `references/session-failure-modes.md`
  for stale writers, invalidation and atomic conflict checks. Faster or broader saving is not a
  concurrency protocol.

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
- Establish who consumes the token and who may trust propagated identity. Validation need not
  repeat at every network hop, but a backend relying on an upstream verifier needs authenticated,
  integrity-protected propagation and no untrusted bypass or spoofable identity headers. Apply
  the appropriate issuer/audience/algorithm, time, tenant and revocation rules at each trust boundary.
- Local verification needs the required key locally available. Issuer key-set retrieval,
  introspection or remote key operations can add dependencies. Bound key-cache lifetime and
  rotation/revocation behavior rather than assuming either every request or none uses the network.
- Signing alone does not conceal JWT claims from anyone who obtains the plaintext token,
  including its holder and terminating/logging readers. TLS can hide it from other network
  intermediaries; JWE adds recipient-dependent encryption. Never place secrets or unnecessary PII in claims.

## Decision block

```text
Consider an external session store when:
- the state is genuinely per-user and per-session (cart, wizard progress, an authorisation
  decision expensive to recompute) and shared session persistence meets its continuity needs
- measured repository I/O and availability meet the session contract
- rolling deployments require continuity with compatible session data
Compare durable workflow rows, replicated session state and supported client recovery where
they meet the same contract; user-visible state does not uniquely select one store mechanism.

Use a signed token when:
- the state is identity and coarse authorisation, small enough to carry in a header
- validity-until-expiry is acceptable for that credential, with an expiry short enough that
  the revocation window is within policy
- the fleet has clients (mobile, third-party, service-to-service) for which a server-side
  session is awkward anyway

Avoid sticky routing when:
- affinity or instance loss violates the required continuity and no adequate recovery exists
- measured imbalance, lifecycle or capacity costs breach the workload contract
Sticky routing can be acceptable when:
- affinity is an optimization over reconstructible state, or explicit session loss/recovery is
  acceptable; the latter is a stateful contract, not stateless interchangeability
Kubernetes or routine replacement alone does not decide this trade-off.

Prefer holding no session at all when:
- every request carries its inputs, or recomputation preserves the intended meaning and
  meets freshness/recovery/workload requirements; ordinary derived caching is caching-strategies
Retained drafts, conversation decisions and consistency snapshots may be intentional state;
re-reading current database rows is not automatically equivalent.
```

## Testing the placement

Select checks for the placement/change and guarantees actually claimed; reuse adequate existing
evidence. A narrow interpretation or accepted loss policy does not require all these experiments.

- **Kill test.** Two replicas, affinity off, log in against one, terminate it in an authorized test, continue the
  journey. Check the last durable checkpoint, in-flight outcome and retry/recovery contract.
  Store/token placement alone does not guarantee that an interrupted request succeeds.
- **Mixed-version test.** Start v1 and v2 together against one store, create a session on v1
  and read it on v2, and the reverse. This exposes compatibility failures that a single-version
  check cannot establish; include rollback when the supported deployment contract requires it.
- **Overlapping-update test.** Have A and B load the same session before either writes, then
  save conflicting changes in a controlled order and reload independently. Verify the required
  merge/rejection outcome, including a stale save after logout when relevant; successful store
  commands alone do not establish correctness.
- **Revocation test.** Revoke access, then assert the maximum time until the next request is
  refused. That number is a stated property of the design; measure it rather than assuming it
  is zero.
- **Key rotation/rollback test.** Run old and new signing keys/verifiers concurrently, rotate,
  roll back and revoke; assert issuer/audience/algorithm pinning and no cross-tenant replay.
- **Store partition test.** Make the external session store unavailable and prove protected
  actions fail closed while explicitly public degradation remains bounded.

## Primary references

- [Spring Session 3.4 Redis configuration](https://docs.spring.io/spring-session/reference/3.4/configuration/redis.html) — serializer/repository example; select documentation for the actual deployed dependency line.
- [Spring Session 3.4.7 SaveMode](https://github.com/spring-projects/spring-session/blob/3.4.7/spring-session-core/src/main/java/org/springframework/session/SaveMode.java) — write tracking and concurrent overwrite exposure are separate from placement.
- [Servlet 6.0 session semantics](https://jakarta.ee/specifications/servlet/6.0/jakarta-servlet-spec-6.0) — section 7.7.1 permits concurrent requests and leaves attribute-object thread safety to the application.
- [RFC 7519: JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519)
- [RFC 8725: JWT Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
